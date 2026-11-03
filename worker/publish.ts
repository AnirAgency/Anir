/**
 * POST /api/publish — the admin's "Нийтлэх": starts a production build, which
 * pulls the content the team saved (scripts/content-pull.mjs) and deploys it.
 *
 * Only an editor may. The caller sends their Supabase session token; Supabase
 * says whose it is (so this needs no JWT secret of its own), and the editors
 * table, read with that same token, says whether they may edit. Then it posts
 * to the Workers Builds deploy hook for main.
 *
 * The hook URL is the credential — whoever holds it can start builds — so it
 * lives only here, as a Worker secret: `npx wrangler secret put DEPLOY_HOOK_URL`.
 * Without it, as on preview versions, publishing answers 503.
 *
 * Workers Builds deduplicates triggers made before a build starts, so a
 * double click starts one build, not two.
 */
import config from '../src/lib/supabase.json' with { type: 'json' };

export interface Env {
  DEPLOY_HOOK_URL?: string;
}

type Result = { ok: true; build: string | null } | { ok: false; error: string };

const answer = (status: number, body: Result) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });

/** Whether a Supabase session token is a live one, and an editor's. */
async function editorBehind(token: string, fetcher: typeof fetch): Promise<'editor' | 'signed-out' | 'not-editor'> {
  const headers = { apikey: config.publishableKey, Authorization: `Bearer ${token}` };

  const user = await fetcher(`${config.url}/auth/v1/user`, { headers });
  if (user.status === 401 || user.status === 403) return 'signed-out';
  if (!user.ok) throw new Error(`auth answered ${user.status}`);
  const { id } = (await user.json()) as { id?: string };
  if (!id) return 'signed-out';

  const rows = await fetcher(`${config.url}/rest/v1/editors?select=user_id&user_id=eq.${encodeURIComponent(id)}`, {
    headers,
  });
  if (!rows.ok) throw new Error(`editors answered ${rows.status}`);
  const found = (await rows.json()) as unknown[];
  return Array.isArray(found) && found.length > 0 ? 'editor' : 'not-editor';
}

export async function onPublish(request: Request, env: Env, fetcher: typeof fetch = fetch): Promise<Response> {
  if (!env.DEPLOY_HOOK_URL) return answer(503, { ok: false, error: 'not-configured' });

  const token = /^Bearer\s+(\S+)$/.exec(request.headers.get('Authorization') ?? '')?.[1];
  if (!token) return answer(401, { ok: false, error: 'signed-out' });

  let who: Awaited<ReturnType<typeof editorBehind>>;
  try {
    who = await editorBehind(token, fetcher);
  } catch {
    return answer(502, { ok: false, error: 'supabase' });
  }
  if (who === 'signed-out') return answer(401, { ok: false, error: 'signed-out' });
  if (who === 'not-editor') return answer(403, { ok: false, error: 'not-editor' });

  let hook: Response;
  try {
    hook = await fetcher(env.DEPLOY_HOOK_URL, { method: 'POST' });
  } catch {
    return answer(502, { ok: false, error: 'hook' });
  }
  if (!hook.ok) return answer(502, { ok: false, error: 'hook' });

  const body = (await hook.json().catch(() => ({}))) as { result?: { build_uuid?: string } };
  return answer(202, { ok: true, build: body.result?.build_uuid ?? null });
}
