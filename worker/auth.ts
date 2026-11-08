/**
 * Who is calling: the one check in front of every admin route — publishing
 * (./publish.ts) and the enquiries inbox (./inbox.ts).
 *
 * The caller sends their Supabase session token. Supabase says whose it is
 * (so this needs no JWT secret of its own), and the editors table, read with
 * that same token under its own row level security, says whether they may
 * edit. Only then does a route use anything it holds.
 */
import config from '../src/lib/supabase.json' with { type: 'json' };

export type Caller = { kind: 'editor'; id: string; email: string } | { kind: 'signed-out' } | { kind: 'not-editor' };

/** The bearer token on a request, or null. */
export const bearer = (request: Request) => /^Bearer\s+(\S+)$/.exec(request.headers.get('Authorization') ?? '')?.[1] ?? null;

/** Throws when Supabase cannot answer — the caller reports that, not a refusal. */
export async function callerOf(request: Request, fetcher: typeof fetch): Promise<Caller> {
  const token = bearer(request);
  if (!token) return { kind: 'signed-out' };
  const headers = { apikey: config.publishableKey, Authorization: `Bearer ${token}` };

  const user = await fetcher(`${config.url}/auth/v1/user`, { headers });
  if (user.status === 401 || user.status === 403) return { kind: 'signed-out' };
  if (!user.ok) throw new Error(`auth answered ${user.status}`);
  const { id, email } = (await user.json()) as { id?: string; email?: string };
  if (!id) return { kind: 'signed-out' };

  const rows = await fetcher(`${config.url}/rest/v1/editors?select=user_id&user_id=eq.${encodeURIComponent(id)}`, {
    headers,
  });
  if (!rows.ok) throw new Error(`editors answered ${rows.status}`);
  const found = (await rows.json()) as unknown[];
  return Array.isArray(found) && found.length > 0 ? { kind: 'editor', id, email: email ?? '' } : { kind: 'not-editor' };
}

/** Equal, compared in constant time: a secret's length and contents leak nothing. */
export async function same(a: string, b: string): Promise<boolean> {
  const digest = async (text: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  const [x, y] = await Promise.all([digest(a), digest(b)]);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

export const answer = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });

/** The refusal for a caller who is not an editor, or null for an editor. */
export function refusal(caller: Caller): Response | null {
  if (caller.kind === 'signed-out') return answer(401, { ok: false, error: 'signed-out' });
  if (caller.kind === 'not-editor') return answer(403, { ok: false, error: 'not-editor' });
  return null;
}
