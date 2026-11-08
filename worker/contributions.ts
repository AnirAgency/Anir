/**
 * Schedule 2 of the founder agreement — the money Members put into the
 * Company — by the owner's direction (CLAUDE.md > The admin).
 *
 *   GET  /api/contributions?member=        the list, newest first, and the strip
 *   POST /api/contributions                a new entry
 *   POST /api/contributions/<id>           edit it (with the updated_at it read)
 *   POST /api/contributions/<id>/repay     principal repaid on this row
 *
 * Every route answers editors only, and who is asking comes first: a
 * stranger gets 401 before learning anything is here (./auth.ts). The tables
 * (migration 0012) are read and written with the service_role key, which
 * never leaves the Worker. All four editors see everything — clause 10.2
 * gives each independent read access to the financial records.
 *
 * The rules (src/lib/contribution-codes.ts holds them, shared with the admin):
 *
 * - MONEY IS WHOLE TUGRIK. An amount that is not a safe integer is refused —
 *   never rounded, never parsed as a float.
 * - CLAUSE 5.1, NEVER SILENTLY PASSED. recorded_at is set here, from the
 *   Worker's clock, never from the request. An entry made more than 30 days
 *   before it is recorded is stored all the same — never refused, never
 *   hidden — as a gift, marked late, for good: an edit that would clear the
 *   mark, or make a late gift a loan, is refused.
 * - THE 7-DAY NOTICE. Every new entry sends one message to the tasks group —
 *   nothing on an edit, no digests — and notified_at is set only when
 *   Telegram says it arrived, so a notice that did not go out shows on its
 *   row. Without the secret it is skipped, and nothing else changes.
 * - REPAYMENT IS DISPLAY-ONLY. The strip shows principal, repaid,
 *   outstanding and outstanding × 1.5 per Member; nothing here knows the bank
 *   balance, so none of it is "due". A repayment is entered against the row
 *   it repays — never allocated by code.
 * - HISTORY. A change to member, date, amount, kind or repayment is a row in
 *   contribution_events, written by a trigger in the same transaction; every
 *   write sets edited_by, which the trigger records as who.
 *
 * Coupled one way: worker/index.ts loads this file only when a
 * /api/contributions* request arrives, behind its own try/catch, and no
 * public page imports it (scripts/test-isolation.ts).
 */
import { admin as t } from '../src/content/admin.ts';
import { CONTRIBUTION_LIMITS, KINDS, formatMnt, isDate, isLate, daysToRecord, parseMnt, standings, ubDateOf, type Kind, type Tracked } from '../src/lib/contribution-codes.ts';
import { answer, callerOf, refusal } from './auth.ts';
import { fill, nameOf, people as team, tellTeam, type Person, type TeamEnv } from './team.ts';

export type Env = TeamEnv;

export interface Contribution {
  id: string;
  created_at: string;
  updated_at: string;
  member_id: string;
  date_made: string;
  recorded_at: string;
  amount_mnt: number;
  what_for: string;
  receipt_held: boolean;
  kind: Kind;
  repaid_mnt: number;
  note: string | null;
  created_by: string;
  edited_by: string | null;
  notified_at: string | null;
}

/** One change, kept (contribution_events, migration 0012). */
export interface ContributionEvent {
  id: number;
  contribution_id: string;
  at: string;
  by: string;
  field: Tracked;
  from_value: string;
  to_value: string;
}

interface Context {
  /** Unused: the notice is awaited, so the row comes back saying whether it went. Here for the loader's shape. */
  waitUntil?: (promise: Promise<unknown>) => void;
  fetcher?: typeof fetch;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

/* --------------------------------------------------------------- the table */

function store(env: Env, fetcher: typeof fetch) {
  const rest = `${env.SUPABASE_URL}/rest/v1`;
  const headers = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` };
  const read = async <T>(response: Response, what: string): Promise<T> => {
    if (!response.ok) throw new Error(`${what} answered ${response.status}`);
    return (await response.json()) as T;
  };
  const write = (method: string, url: string, body: unknown) =>
    fetcher(url, { method, headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify(body) });
  return {
    people: (): Promise<Person[]> => team(env, fetcher),
    /** Every entry, newest money first. A record of four people's money is small; the strip needs all of it. */
    all: async () => read<Contribution[]>(await fetcher(`${rest}/contributions?select=*&order=date_made.desc,recorded_at.desc&limit=5000`, { headers }), 'contributions'),
    events: async () => read<ContributionEvent[]>(await fetcher(`${rest}/contribution_events?select=*&order=at&limit=10000`, { headers }), 'contribution_events'),
    async one(id: string): Promise<Contribution | null> {
      return (await read<Contribution[]>(await fetcher(`${rest}/contributions?select=*&id=eq.${id}`, { headers }), 'contributions'))[0] ?? null;
    },
    async insert(row: Partial<Contribution>): Promise<Contribution> {
      return (await read<Contribution[]>(await write('POST', `${rest}/contributions`, row), 'contributions'))[0];
    },
    /** Writes only if the row still has the updated_at the editor read; null if someone wrote in between. */
    async update(id: string, version: string, patch: Partial<Contribution>): Promise<Contribution | null> {
      const url = `${rest}/contributions?id=eq.${id}&updated_at=eq.${encodeURIComponent(version)}`;
      return (await read<Contribution[]>(await write('PATCH', url, { ...patch, updated_at: new Date().toISOString() }), 'contributions'))[0] ?? null;
    },
    /** The notice arrived. Leaves updated_at alone: an editor's open form is not made stale by it. */
    async notified(id: string, at: string): Promise<void> {
      await read<unknown>(await write('PATCH', `${rest}/contributions?id=eq.${id}`, { notified_at: at }), 'contributions');
    },
  };
}
type Store = ReturnType<typeof store>;

/** A row as the admin gets it: with its clause 5.1 count worked out here, once. */
const shown = (row: Contribution) => ({ ...row, days: daysToRecord(row.date_made, row.recorded_at), late: isLate(row.date_made, row.recorded_at) });

/* -------------------------------------------------------------- the fields */

type Fields = Pick<Contribution, 'member_id' | 'date_made' | 'amount_mnt' | 'what_for' | 'receipt_held' | 'kind' | 'note' | 'repaid_mnt'>;

/**
 * The fields from a request, laid over what is there, or the code of what is
 * wrong with them. recorded_at is the instant the entry was (or is being)
 * made — the Worker's, never the request's.
 */
function fieldsFrom(input: Record<string, unknown>, current: Fields | null, recordedAt: string, members: Person[]): Fields | { error: string } {
  const has = (key: string) => !current || Object.prototype.hasOwnProperty.call(input, key);
  const member_id = has('member_id') ? text(input.member_id) : current!.member_id;
  // Clause 5.2: a contribution is a loan from a Member. Someone else's money is not entered here (5.4, 9.2).
  if (!members.some((p) => p.id === member_id)) return { error: 'member' };
  const date_made = has('date_made') ? text(input.date_made) : current!.date_made;
  if (!isDate(date_made)) return { error: 'date' };
  if (date_made > ubDateOf(recordedAt)) return { error: 'date-future' };
  const amount = has('amount_mnt') ? parseMnt(input.amount_mnt) : current!.amount_mnt;
  if (amount === null) return { error: 'amount' };
  const what_for = has('what_for') ? text(input.what_for) : current!.what_for;
  if (!what_for || what_for.length > CONTRIBUTION_LIMITS.what_for) return { error: 'what-for' };
  const receipt = has('receipt_held') ? (input.receipt_held ?? false) : current!.receipt_held;
  if (typeof receipt !== 'boolean') return { error: 'receipt' };
  const kind = has('kind') ? text(input.kind) || 'loan' : current!.kind;
  if (!(KINDS as readonly string[]).includes(kind)) return { error: 'kind' };
  const note = has('note') ? text(input.note) || null : current!.note;
  if (note && note.length > CONTRIBUTION_LIMITS.note) return { error: 'note' };
  const repaid = current && Object.prototype.hasOwnProperty.call(input, 'repaid_mnt') ? parseMnt(input.repaid_mnt, { allowZero: true }) : (current?.repaid_mnt ?? 0);
  if (repaid === null) return { error: 'repaid' };
  if (repaid > amount) return { error: 'repaid-over' };
  return { member_id, date_made, amount_mnt: amount, what_for, receipt_held: receipt, kind: kind as Kind, note, repaid_mnt: repaid };
}

/* ------------------------------------------------------------------ routes */

export async function onContributions(request: Request, env: Env, ctx: Context = {}): Promise<Response> {
  const fetcher = ctx.fetcher ?? fetch;
  let caller;
  try {
    caller = await callerOf(request, fetcher);
  } catch {
    return answer(502, { ok: false, error: 'supabase' });
  }
  const refused = refusal(caller);
  if (refused) return refused;
  if (caller.kind !== 'editor') return answer(401, { ok: false, error: 'signed-out' });
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return answer(503, { ok: false, error: 'not-configured' });
  const me = caller.id;

  const url = new URL(request.url);
  const parts = url.pathname.replace(/^\/api\/contributions\/?/, '').split('/').filter(Boolean);
  const db = store(env, fetcher);
  try {
    if (request.method === 'GET' && parts.length === 0) return await list(db, me, url.searchParams);
    if (request.method === 'POST' && parts.length === 0) return await create(db, env, me, await body(request), fetcher);
    if (request.method === 'POST' && parts.length === 1 && UUID.test(parts[0])) return await edit(db, me, parts[0], await body(request));
    if (request.method === 'POST' && parts.length === 2 && UUID.test(parts[0]) && parts[1] === 'repay') return await repay(db, me, parts[0], await body(request));
    return answer(404, { ok: false, error: 'not-found' });
  } catch (error) {
    return answer(502, { ok: false, error: 'supabase', detail: String((error as Error)?.message ?? error).slice(0, 300) });
  }
}

const body = async (request: Request) => ((await request.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;

/** The list — newest money first, one Member or all — and the strip, always over everyone. */
async function list(db: Store, me: string, params: URLSearchParams): Promise<Response> {
  const [rows, events, members] = await Promise.all([db.all(), db.events(), db.people()]);
  const member = params.get('member');
  const items = (member && UUID.test(member) ? rows.filter((r) => r.member_id === member) : rows).map(shown);
  return answer(200, {
    ok: true,
    me,
    today: ubDateOf(Date.now()),
    people: members,
    items,
    summary: standings(rows, members.map((p) => p.id)).map((s) => ({ ...s, name: nameOf(members, s.member_id) })),
    events: events.map((e) => ({ ...e, who: nameOf(members, e.by) })),
  });
}

async function create(db: Store, env: Env, me: string, input: Record<string, unknown>, fetcher: typeof fetch): Promise<Response> {
  const members = await db.people();
  const recordedAt = new Date().toISOString();
  const fields = fieldsFrom(input, null, recordedAt, members);
  if ('error' in fields) return answer(400, { ok: false, error: fields.error });
  // Clause 5.1: late is stored, never refused — as a gift, and the admin marks it.
  const late = isLate(fields.date_made, recordedAt);
  const item = await db.insert({ ...fields, kind: late ? 'gift' : fields.kind, repaid_mnt: 0, recorded_at: recordedAt, created_by: me });

  // The notice clause 5.1 owes every Member — one per entry, awaited, so the
  // row comes back saying whether it went. A failure never fails the entry.
  const message = fill(t.contributions.notify, { member: nameOf(members, item.member_id), amount: formatMnt(item.amount_mnt), what_for: item.what_for });
  if (await tellTeam(env, message, fetcher, 'contribution notification')) {
    const at = new Date().toISOString();
    try {
      await db.notified(item.id, at);
      item.notified_at = at;
    } catch (error) {
      console.error(`contribution notification: sent, but not marked — ${(error as Error)?.message ?? error}`);
    }
  }
  return answer(201, { ok: true, item: shown(item) });
}

async function edit(db: Store, me: string, id: string, input: Record<string, unknown>): Promise<Response> {
  const version = text(input.updated_at);
  if (!version) return answer(400, { ok: false, error: 'no-version' });
  const [current, members] = await Promise.all([db.one(id), db.people()]);
  if (!current) return answer(404, { ok: false, error: 'not-found' });
  // The Member it was entered for stays choosable even after leaving `editors`.
  const choosable = members.some((p) => p.id === current.member_id) ? members : [...members, { id: current.member_id, name: '' }];
  const fields = fieldsFrom(input, current, current.recorded_at, choosable);
  if ('error' in fields) return answer(400, { ok: false, error: fields.error });

  const wasLate = isLate(current.date_made, current.recorded_at);
  const late = isLate(fields.date_made, current.recorded_at);
  // Permanent: no edit takes away clause 5.1's mark, or turns its gift back into a loan.
  if (wasLate && !late) return answer(409, { ok: false, error: 'late-is-permanent' });
  if (late && fields.kind === 'loan' && Object.prototype.hasOwnProperty.call(input, 'kind') && wasLate) return answer(409, { ok: false, error: 'late-is-gift' });
  const kind: Kind = late ? 'gift' : fields.kind;
  if (kind === 'gift' && fields.repaid_mnt > 0) return answer(400, { ok: false, error: 'gift-not-repaid' });

  const item = await db.update(id, version, { ...fields, kind, edited_by: me });
  if (!item) return answer(409, { ok: false, error: 'conflict' });
  return answer(200, { ok: true, item: shown(item) });
}

/** Principal repaid on this one row: partial is fine (5.2(d)); which row is the editor's to say (5.2(c)). */
async function repay(db: Store, me: string, id: string, input: Record<string, unknown>): Promise<Response> {
  const version = text(input.updated_at);
  if (!version) return answer(400, { ok: false, error: 'no-version' });
  const amount = parseMnt(input.amount_mnt);
  if (amount === null) return answer(400, { ok: false, error: 'repaid' });
  const current = await db.one(id);
  if (!current) return answer(404, { ok: false, error: 'not-found' });
  if (current.kind !== 'loan' || isLate(current.date_made, current.recorded_at)) return answer(409, { ok: false, error: 'gift-not-repaid' });
  const repaid = current.repaid_mnt + amount;
  if (repaid > current.amount_mnt) return answer(400, { ok: false, error: 'repaid-over' });
  const item = await db.update(id, version, { repaid_mnt: repaid, edited_by: me });
  if (!item) return answer(409, { ok: false, error: 'conflict' });
  return answer(200, { ok: true, item: shown(item) });
}
