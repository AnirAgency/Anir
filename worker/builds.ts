/**
 * POST /api/builds — the production build reporting on itself.
 *
 * Workers Builds runs `npm run ci` (package.json), which wraps the real
 * build: it reports when it starts, runs `npm run budget`, then reports how
 * it ended — its exit code, branch, commit and the lines that say why
 * (scripts/build-report.mjs). This route takes those reports and keeps the
 * latest in Supabase, one row (supabase/migrations/0005); the admin reads it
 * through GET /api/publish?build=… (./publish.ts) to say queued, building,
 * done or failed.
 *
 * The report carries its own secret, BUILD_REPORT_SECRET — set both as a
 * Worker secret and as a build secret. It is good for nothing but this: the
 * route checks it, then writes that one row with the service_role key,
 * which never leaves the Worker. At worst, a leaked report secret can make
 * the admin say a build failed when it did not. That is why this replaced a
 * Cloudflare API token, whose only permission level would have let its
 * holder change the build command and deploy anything.
 */
import { answer, bearer, same } from './auth.ts';
import { fit } from './text.ts';
import { PRODUCTION_BRANCH } from '../src/lib/placeholders.mjs';

export interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  BUILD_REPORT_SECRET?: string;
}

export interface BuildStatus {
  build: string;
  state: 'building' | 'done' | 'failed';
  branch: string;
  sha: string | null;
  code: number | null;
  reason: string | null;
  detail: string | null;
  reported_at: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/*
  Why a build failed, from the lines it printed. Each cause is one the build
  stops for on purpose, with the line that says so; the admin turns the code
  into a sentence and the next step (src/content/admin.ts > publish.reasons).
  The order matters: the first that matches names the cause.
*/
const CAUSES: [string, RegExp][] = [
  ['content', /content: .+ in the database/],
  ['image', /content-pull|could not (download|encode)|Input buffer|unsupported image/i],
  ['claim', /stand-in testimonial|demo before-and-after|\/media\/placeholder\/|PLACEHOLDER_MEDIA=1 on the production/],
  ['contrast', /Fix the token or the tile/],
  ['labels', /admin copy:/],
  ['video', /over the [\d.]+ [kM]B (video|poster|placeholder) cap/],
  ['budget', /FAIL .*(over|lazy assets|saveData)/],
];

/** The lines worth keeping: what the build said when it stopped. */
export const telling = (lines: string[]) => lines.filter((line) => /FAIL|Error|error:|content:|over /.test(line));
export const causeOf = (lines: string[]) => CAUSES.find(([, pattern]) => telling(lines).some((line) => pattern.test(line)))?.[0] ?? 'other';

const service = (env: Env) => ({
  apikey: env.SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
});

/** The last build's row, or null before any build has reported. */
export async function readBuild(env: Env, fetcher: typeof fetch): Promise<BuildStatus | null> {
  const response = await fetcher(`${env.SUPABASE_URL}/rest/v1/build_status?select=*&id=eq.true`, { headers: service(env) });
  if (!response.ok) throw new Error(`build_status answered ${response.status}`);
  const rows = (await response.json()) as BuildStatus[];
  return rows[0] ?? null;
}

export async function onBuildReport(request: Request, env: Env, fetcher: typeof fetch = fetch): Promise<Response> {
  // Who is asking, before anything about this Worker's setup: no secret set,
  // none sent and a wrong one get the one same refusal, compared either way.
  const token = bearer(request) ?? '';
  const holds = await same(token, env.BUILD_REPORT_SECRET ?? '');
  if (!env.BUILD_REPORT_SECRET || !token || !holds) return answer(401, { ok: false, error: 'refused' });
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return answer(503, { ok: false, error: 'not-configured' });

  const body = (await request.json().catch(() => null)) as {
    build?: unknown;
    branch?: unknown;
    sha?: unknown;
    event?: unknown;
    code?: unknown;
    lines?: unknown;
  } | null;
  if (!body || typeof body.build !== 'string' || !UUID.test(body.build)) return answer(400, { ok: false, error: 'bad-build' });
  if (body.event !== 'started' && body.event !== 'finished') return answer(400, { ok: false, error: 'bad-event' });
  // Only production builds publish; a preview's report is not the admin's business.
  if (body.branch !== PRODUCTION_BRANCH) return answer(202, { ok: true, ignored: 'not the production branch' });
  const sha = typeof body.sha === 'string' && /^[0-9a-f]{7,40}$/i.test(body.sha) ? body.sha : null;
  const code = body.event === 'finished' ? Number(body.code) : null;
  if (code !== null && !(Number.isInteger(code) && code >= 0 && code <= 255)) return answer(400, { ok: false, error: 'bad-code' });
  const lines = Array.isArray(body.lines) ? body.lines.filter((line): line is string => typeof line === 'string').slice(-200) : [];

  try {
    // A late "started" never undoes how that same build ended.
    if (body.event === 'started') {
      const last = await readBuild(env, fetcher);
      if (last && last.build === body.build && last.state !== 'building') return answer(200, { ok: true, kept: last.state });
    }
    const failed = code !== null && code !== 0;
    const row = {
      id: true,
      build: body.build,
      state: code === null ? 'building' : failed ? 'failed' : 'done',
      branch: PRODUCTION_BRANCH,
      sha,
      code,
      reason: failed ? causeOf(lines) : null,
      // Cut as build_status.detail counts — characters, never inside one: a
      // split emoji in a log line would make Postgres refuse the report.
      detail: failed ? fit(telling(lines).slice(-12).join('\n'), 4000).text || null : null,
      reported_at: new Date().toISOString(),
    };
    const response = await fetcher(`${env.SUPABASE_URL}/rest/v1/build_status`, {
      method: 'POST',
      headers: { ...service(env), 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(row),
    });
    if (!response.ok) return answer(502, { ok: false, error: 'supabase', detail: `build_status answered ${response.status}` });
    return answer(200, { ok: true, state: row.state });
  } catch {
    return answer(502, { ok: false, error: 'supabase' });
  }
}
