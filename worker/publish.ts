/**
 * The admin's "Нийтлэх".
 *
 * POST /api/publish starts a production build, which pulls the content the
 * team saved (scripts/content-pull.mjs) and deploys it. GET
 * /api/publish?build=<uuid> says how that build is going — queued, building,
 * done or failed, and why it failed — read from the report the build makes
 * on itself (./builds.ts), so the editor learns it in the admin, not in the
 * Cloudflare dashboard. No Cloudflare API token is involved.
 *
 * Only an editor may do either (./auth.ts).
 *
 * The hook URL is the credential — whoever holds it can start builds — so it
 * lives only here, as a Worker secret: `npx wrangler secret put
 * DEPLOY_HOOK_URL`. Without it, as on preview versions, publishing answers
 * 503. Without BUILD_REPORT_SECRET a build still starts; the admin just
 * cannot follow it, and says so.
 *
 * Workers Builds deduplicates triggers made before a build starts, so a
 * double click starts one build, not two.
 */
import { answer, callerOf, refusal } from './auth.ts';
import { readBuild } from './builds.ts';

export interface Env {
  DEPLOY_HOOK_URL?: string;
  BUILD_REPORT_SECRET?: string;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
}

/** Whether builds report themselves here, so the admin can follow one. */
const followable = (env: Env) => !!(env.BUILD_REPORT_SECRET && env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);

export async function onPublish(request: Request, env: Env, fetcher: typeof fetch = fetch): Promise<Response> {
  if (!env.DEPLOY_HOOK_URL) return answer(503, { ok: false, error: 'not-configured' });

  let caller;
  try {
    caller = await callerOf(request, fetcher);
  } catch {
    return answer(502, { ok: false, error: 'supabase' });
  }
  const refused = refusal(caller);
  if (refused) return refused;

  let hook: Response;
  try {
    hook = await fetcher(env.DEPLOY_HOOK_URL, { method: 'POST' });
  } catch {
    return answer(502, { ok: false, error: 'hook' });
  }
  if (!hook.ok) return answer(502, { ok: false, error: 'hook', detail: `deploy hook answered ${hook.status}` });

  const body = (await hook.json().catch(() => ({}))) as { result?: { build_uuid?: string } };
  return answer(202, { ok: true, build: body.result?.build_uuid ?? null, following: followable(env) });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function onPublishStatus(request: Request, env: Env, fetcher: typeof fetch = fetch): Promise<Response> {
  const build = new URL(request.url).searchParams.get('build') ?? '';
  if (!UUID.test(build)) return answer(400, { ok: false, error: 'bad-build' });

  let caller;
  try {
    caller = await callerOf(request, fetcher);
  } catch {
    return answer(502, { ok: false, error: 'supabase' });
  }
  const refused = refusal(caller);
  if (refused) return refused;
  if (!followable(env)) return answer(503, { ok: false, error: 'no-status' });

  let last;
  try {
    last = await readBuild(env as Required<Env>, fetcher);
  } catch {
    return answer(502, { ok: false, error: 'supabase' });
  }
  // Not reported yet — it has not started — or the row is another build's.
  if (!last || last.build !== build) return answer(200, { ok: true, state: 'queued' });
  if (last.state === 'failed') return answer(200, { ok: true, state: 'failed', reason: last.reason ?? 'other', detail: last.detail ?? '' });
  return answer(200, { ok: true, state: last.state });
}
