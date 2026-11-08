/**
 * The admin's enquiries inbox («Хүсэлтүүд»), and how much of Storage is used.
 *
 *   GET  /api/enquiries?status=new   the enquiries with that status, newest
 *                                    first, and how many there are of each
 *   POST /api/enquiries/<id>         { status } — read, replied, closed, or
 *                                    back to new
 *   GET  /api/storage                bytes used of the project's Storage
 *
 * Server side only. The browser never touches the enquiries table: an editor
 * calls these, ./auth.ts checks they are one, and only then does the Worker
 * use the service_role key, which never leaves it. The table keeps RLS on
 * with no policies (supabase/migrations/0001_enquiries.sql).
 *
 * There is no delete. An enquiry is a client trying to give the studio
 * money; closing one sets its status, and nothing here can destroy one.
 */
import { admin as t } from '../src/content/admin.ts';
import { answer, callerOf, refusal, type Caller } from './auth.ts';

export interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

export const STATUSES = ['new', 'read', 'replied', 'closed'] as const;
type Status = (typeof STATUSES)[number];

/**
 * What the inbox lists by: a status — or 'flagged', the new enquiries
 * stored with something to check (worker/enquiry.ts > unrecognised). 'new'
 * is the unflagged ones only. Nothing a visitor sends is refused any more,
 * so bots' submissions are stored too, and they are almost always flagged:
 * kept out of 'new', its count — the admin's badge — still means people.
 * Once read, replied or closed, an enquiry is under that status, flagged or not.
 */
export const FILTERS = ['new', 'flagged', 'read', 'replied', 'closed'] as const;
type Filter = (typeof FILTERS)[number];
const EMPTY = '%7B%7D'; // {} — no field to check
const whereOf = (filter: Filter) =>
  filter === 'new' ? `status=eq.new&unrecognised=eq.${EMPTY}` : filter === 'flagged' ? `status=eq.new&unrecognised=neq.${EMPTY}` : `status=eq.${filter}`;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const service = (env: Env) => ({
  apikey: env.SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
});

/**
 * An editor, or the response that refuses everyone else. Who is asking comes
 * first, so a stranger learns nothing — not even whether this Worker has a
 * database to read.
 */
async function editorOnly(request: Request, env: Env, fetcher: typeof fetch): Promise<Caller | Response> {
  let caller: Caller;
  try {
    caller = await callerOf(request, fetcher);
  } catch {
    return answer(502, { ok: false, error: 'supabase' });
  }
  const refused = refusal(caller);
  if (refused) return refused;
  // Preview versions have no database (wrangler.jsonc > previews).
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return answer(503, { ok: false, error: 'not-configured' });
  return caller;
}

/** Who changed what, by name — display_name, else the email (migration 0011) — for the inbox to show. */
async function editorNames(env: Env, fetcher: typeof fetch): Promise<Record<string, string>> {
  const response = await fetcher(`${env.SUPABASE_URL}/rest/v1/editors?select=user_id,email,display_name`, { headers: service(env) });
  if (!response.ok) return {};
  const rows = (await response.json()) as { user_id: string; email: string; display_name?: string | null }[];
  return Object.fromEntries(rows.map((row) => [row.user_id, row.display_name?.trim() || row.email]));
}

export async function onEnquiries(request: Request, env: Env, fetcher: typeof fetch = fetch): Promise<Response> {
  const caller = await editorOnly(request, env, fetcher);
  if (caller instanceof Response) return caller;

  const wanted = (new URL(request.url).searchParams.get('status') ?? 'new') as Filter;
  if (!(FILTERS as readonly string[]).includes(wanted)) return answer(400, { ok: false, error: 'bad-status' });

  try {
    // Every column: the flags and the extra answers (0005) come along. The
    // flag filter needs 0005's `unrecognised` — run it before this deploys.
    const [list, all, emails] = await Promise.all([
      fetcher(`${env.SUPABASE_URL}/rest/v1/enquiries?select=*&${whereOf(wanted)}&order=created_at.desc&limit=200`, {
        headers: service(env),
      }),
      // Two short columns per enquiry, counted here: one small read, not five.
      fetcher(`${env.SUPABASE_URL}/rest/v1/enquiries?select=status,unrecognised&limit=10000`, { headers: service(env) }),
      editorNames(env, fetcher),
    ]);
    if (!list.ok || !all.ok) return answer(502, { ok: false, error: 'supabase', detail: `enquiries answered ${list.ok ? all.status : list.status}` });

    const counts = Object.fromEntries(FILTERS.map((filter) => [filter, 0])) as Record<Filter, number>;
    for (const row of (await all.json()) as { status: Status; unrecognised?: string[] | null }[]) {
      const filter: Filter = row.status === 'new' && row.unrecognised?.length ? 'flagged' : row.status;
      if (filter in counts) counts[filter]++;
    }
    const items = ((await list.json()) as Record<string, unknown>[]).map((row) => ({
      ...row,
      // Never a bare id: someone no longer an editor is said so.
      status_changed_by: row.status_changed_by ? (emails[String(row.status_changed_by)] ?? t.removedPerson) : null,
    }));
    return answer(200, { ok: true, status: wanted, counts, items });
  } catch {
    return answer(502, { ok: false, error: 'supabase' });
  }
}

export async function onEnquiryStatus(request: Request, env: Env, id: string, fetcher: typeof fetch = fetch): Promise<Response> {
  const caller = await editorOnly(request, env, fetcher);
  if (caller instanceof Response) return caller;
  if (caller.kind !== 'editor') return answer(403, { ok: false, error: 'not-editor' });
  if (!UUID.test(id)) return answer(400, { ok: false, error: 'bad-id' });

  const body = (await request.json().catch(() => ({}))) as { status?: string };
  if (!body.status || !(STATUSES as readonly string[]).includes(body.status)) return answer(400, { ok: false, error: 'bad-status' });

  try {
    const response = await fetcher(`${env.SUPABASE_URL}/rest/v1/enquiries?id=eq.${id}`, {
      method: 'PATCH',
      headers: { ...service(env), 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({ status: body.status, status_changed_at: new Date().toISOString(), status_changed_by: caller.id }),
    });
    if (!response.ok) return answer(502, { ok: false, error: 'supabase', detail: `enquiries answered ${response.status}` });
    const rows = (await response.json()) as unknown[];
    if (!rows.length) return answer(404, { ok: false, error: 'not-found' });
    return answer(200, { ok: true });
  } catch {
    return answer(502, { ok: false, error: 'supabase' });
  }
}

/** The Free plan's Storage, 1 GB in all: what the admin shows beside every upload. */
export const STORAGE_LIMIT = 1024 ** 3;

export async function onStorage(request: Request, env: Env, fetcher: typeof fetch = fetch): Promise<Response> {
  const caller = await editorOnly(request, env, fetcher);
  if (caller instanceof Response) return caller;
  try {
    const response = await fetcher(`${env.SUPABASE_URL}/rest/v1/rpc/storage_used_bytes`, {
      method: 'POST',
      headers: { ...service(env), 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (!response.ok) return answer(502, { ok: false, error: 'supabase', detail: `storage answered ${response.status}` });
    const used = Number(await response.json());
    return answer(200, { ok: true, used, limit: STORAGE_LIMIT });
  } catch {
    return answer(502, { ok: false, error: 'supabase' });
  }
}
