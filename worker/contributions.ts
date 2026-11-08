/**
 * Schedule 2 of the founder agreement — the money Members put into the
 * Company — by the owner's direction (CLAUDE.md > The admin).
 *
 *   GET  /api/contributions?member=        the list, newest first, and the strip
 *   POST /api/contributions                a new entry
 *   POST /api/contributions/<id>           edit it (with the updated_at it read)
 *   POST /api/contributions/<id>/repay     a repayment: its own row, principal and interest apart
 *
 * Every route answers editors only, and who is asking comes first: a
 * stranger gets 401 before learning anything is here (./auth.ts). The tables
 * (migrations 0012, 0013) are read and written with the service_role key,
 * which never leaves the Worker. All four editors see everything — clause
 * 10.2 gives each independent read access to the financial records.
 *
 * The rules (src/lib/contribution-codes.ts holds them, shared with the admin):
 *
 * - MEMBERS, NOT EDITORS. A contribution belongs to a row of `members` —
 *   the Company's Members, seeded four — never to a login: clause 4.9 lets
 *   someone on salary sign in without being a Member, and a Member may have
 *   no login at all.
 * - MONEY IS WHOLE TUGRIK. An amount that is not a safe integer is refused —
 *   never rounded, never parsed as a float.
 * - CLAUSE 5.1 HAS A CLOCK ONLY ONCE THE AGREEMENT IS IN FORCE
 *   (agreement.in_force_from, null until signed), and then only for money
 *   made on or after that day. recorded_at is the Worker's clock, never the
 *   request's. Late is a mark, shown and never hidden — an edit that would
 *   clear it is refused — but never a ruling: nothing here changes a
 *   contribution's kind. Whether late money is a gift is the Members' to say.
 * - THE 7-DAY NOTICE. Every new entry sends one message to the tasks group —
 *   nothing on an edit, no digests — and notified_at is set only when
 *   Telegram says it arrived, so a notice that did not go out shows on its
 *   row. Without the secret it is skipped, and nothing else changes.
 * - REPAYMENTS ARE ROWS. Each one is appended to contribution_repayments
 *   with its principal and its interest apart — clause 5.2(e) makes the
 *   uplift the Member's taxable income, withheld by the Company, so one
 *   total could not support the withholding. Never changed, never removed;
 *   the rate is the accountant's. Entered against the loan it repays — never
 *   allocated by code. The strip is display-only: nothing here knows the
 *   bank balance, so none of it is "due".
 * - HISTORY. A change to member, date, amount or kind is a row in
 *   contribution_events, written by a trigger in the same transaction; every
 *   write sets edited_by, which the trigger records as who.
 *
 * Coupled one way: worker/index.ts loads this file only when a
 * /api/contributions* request arrives, behind its own try/catch, and no
 * public page imports it (scripts/test-isolation.ts).
 */
import { contributions as words } from '../src/content/admin-contributions.ts';
import { CONTRIBUTION_LIMITS, KINDS, daysToRecord, fiveOneApplies, formatMnt, isDate, isLate, parseMnt, repaidOn, standings, ubDateOf, type Kind, type Tracked } from '../src/lib/contribution-codes.ts';
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
  note: string | null;
  created_by: string;
  edited_by: string | null;
  notified_at: string | null;
}

/** A Member of the Company (members, migration 0013): a name, and maybe a login. */
export interface Member {
  id: string;
  name: string;
  editor_id: string | null;
  ord: number;
}

/** One repayment, kept as it was entered (contribution_repayments, migration 0013). */
export interface Repayment {
  id: string;
  created_at: string;
  created_by: string;
  contribution_id: string;
  paid_on: string;
  principal_mnt: number;
  interest_mnt: number;
  note: string | null;
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
const has = (input: Record<string, unknown>, key: string) => Object.prototype.hasOwnProperty.call(input, key);

/* --------------------------------------------------------------- the table */

function store(env: Env, fetcher: typeof fetch) {
  const rest = `${env.SUPABASE_URL}/rest/v1`;
  const headers = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` };
  const read = async <T>(response: Response, what: string): Promise<T> => {
    if (!response.ok) throw new Error(`${what} answered ${response.status}`);
    return (await response.json()) as T;
  };
  const get = async <T>(path: string, what: string) => read<T>(await fetcher(`${rest}/${path}`, { headers }), what);
  const write = (method: string, url: string, body: unknown) =>
    fetcher(url, { method, headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify(body) });
  return {
    /** The editors, by name — who entered and changed things. Not who may lend: that is `members`. */
    people: (): Promise<Person[]> => team(env, fetcher),
    members: () => get<Member[]>('members?select=id,name,editor_id,ord&order=ord,name', 'members'),
    /** The agreement's date in force, or null: unsigned, or (before 0013) no such row. */
    async inForceFrom(): Promise<string | null> {
      const rows = await get<{ in_force_from: string | null }[]>('agreement?select=in_force_from', 'agreement');
      return rows[0]?.in_force_from ?? null;
    },
    /** Every entry, newest money first. A record of four people's money is small; the strip needs all of it. */
    all: () => get<Contribution[]>('contributions?select=*&order=date_made.desc,recorded_at.desc&limit=5000', 'contributions'),
    events: () => get<ContributionEvent[]>('contribution_events?select=*&order=at&limit=10000', 'contribution_events'),
    repayments: (query = '') => get<Repayment[]>(`contribution_repayments?select=*${query}&order=paid_on,created_at&limit=10000`, 'contribution_repayments'),
    async one(id: string): Promise<Contribution | null> {
      return (await get<Contribution[]>(`contributions?select=*&id=eq.${id}`, 'contributions'))[0] ?? null;
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
    async repay(row: Partial<Repayment>): Promise<Repayment> {
      return (await read<Repayment[]>(await write('POST', `${rest}/contribution_repayments`, row), 'contribution_repayments'))[0];
    },
  };
}
type Store = ReturnType<typeof store>;

/** A row as the admin gets it: its clause 5.1 count, and what was repaid on it, worked out here once. */
const shown = (row: Contribution, repayments: Repayment[], inForceFrom: string | null) => {
  const repaid = repaidOn(row.id, repayments);
  return {
    ...row,
    days: daysToRecord(row.date_made, row.recorded_at),
    applies: fiveOneApplies(row.date_made, inForceFrom),
    late: isLate(row.date_made, row.recorded_at, inForceFrom),
    repaid_principal: repaid.principal,
    repaid_interest: repaid.interest,
  };
};

/* -------------------------------------------------------------- the fields */

type Fields = Pick<Contribution, 'member_id' | 'date_made' | 'amount_mnt' | 'what_for' | 'receipt_held' | 'kind' | 'note'>;

/**
 * The fields from a request, laid over what is there, or the code of what is
 * wrong with them. recorded_at is the instant the entry was (or is being)
 * made — the Worker's, never the request's.
 */
function fieldsFrom(input: Record<string, unknown>, current: Fields | null, recordedAt: string, members: Member[]): Fields | { error: string } {
  const given = (key: string) => !current || has(input, key);
  const member_id = given('member_id') ? text(input.member_id) : current!.member_id;
  // Clause 5.2: a contribution is a loan from a Member. Someone else's money is not entered here (5.4, 9.2).
  if (!members.some((m) => m.id === member_id)) return { error: 'member' };
  const date_made = given('date_made') ? text(input.date_made) : current!.date_made;
  if (!isDate(date_made)) return { error: 'date' };
  if (date_made > ubDateOf(recordedAt)) return { error: 'date-future' };
  const amount = given('amount_mnt') ? parseMnt(input.amount_mnt) : current!.amount_mnt;
  if (amount === null) return { error: 'amount' };
  const what_for = given('what_for') ? text(input.what_for) : current!.what_for;
  if (!what_for || what_for.length > CONTRIBUTION_LIMITS.what_for) return { error: 'what-for' };
  const receipt = given('receipt_held') ? (input.receipt_held ?? false) : current!.receipt_held;
  if (typeof receipt !== 'boolean') return { error: 'receipt' };
  const kind = given('kind') ? text(input.kind) || 'loan' : current!.kind;
  if (!(KINDS as readonly string[]).includes(kind)) return { error: 'kind' };
  const note = given('note') ? text(input.note) || null : current!.note;
  if (note && note.length > CONTRIBUTION_LIMITS.note) return { error: 'note' };
  return { member_id, date_made, amount_mnt: amount, what_for, receipt_held: receipt, kind: kind as Kind, note };
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
  const [rows, events, repayments, members, people, inForceFrom] = await Promise.all([db.all(), db.events(), db.repayments(), db.members(), db.people(), db.inForceFrom()]);
  const member = params.get('member');
  const items = (member && UUID.test(member) ? rows.filter((r) => r.member_id === member) : rows).map((r) => shown(r, repayments, inForceFrom));
  return answer(200, {
    ok: true,
    me,
    today: ubDateOf(Date.now()),
    agreement: { in_force_from: inForceFrom },
    members: members.map(({ id, name, editor_id }) => ({ id, name, editor_id })),
    people,
    items,
    summary: standings(rows, repayments, members.map((m) => m.id), inForceFrom).map((s) => ({ ...s, name: nameOf(members, s.member_id) })),
    repayments: repayments.map((r) => ({ ...r, who: nameOf(people, r.created_by) })),
    events: events.map((e) => ({ ...e, who: nameOf(people, e.by) })),
  });
}

async function create(db: Store, env: Env, me: string, input: Record<string, unknown>, fetcher: typeof fetch): Promise<Response> {
  const [members, inForceFrom] = await Promise.all([db.members(), db.inForceFrom()]);
  const recordedAt = new Date().toISOString();
  const fields = fieldsFrom(input, null, recordedAt, members);
  if ('error' in fields) return answer(400, { ok: false, error: fields.error });
  // Late or not, stored as entered: the mark is shown, the kind is the Members' to decide.
  const item = await db.insert({ ...fields, recorded_at: recordedAt, created_by: me });

  // The notice clause 5.1 owes every Member — one per entry, awaited, so the
  // row comes back saying whether it went. A failure never fails the entry.
  const message = fill(words.notify, { member: nameOf(members, item.member_id), amount: formatMnt(item.amount_mnt), what_for: item.what_for });
  if (await tellTeam(env, message, fetcher, 'contribution notification')) {
    const at = new Date().toISOString();
    try {
      await db.notified(item.id, at);
      item.notified_at = at;
    } catch (error) {
      console.error(`contribution notification: sent, but not marked — ${(error as Error)?.message ?? error}`);
    }
  }
  return answer(201, { ok: true, item: shown(item, [], inForceFrom) });
}

async function edit(db: Store, me: string, id: string, input: Record<string, unknown>): Promise<Response> {
  const version = text(input.updated_at);
  if (!version) return answer(400, { ok: false, error: 'no-version' });
  const [current, members, inForceFrom] = await Promise.all([db.one(id), db.members(), db.inForceFrom()]);
  if (!current) return answer(404, { ok: false, error: 'not-found' });
  const fields = fieldsFrom(input, current, current.recorded_at, members);
  if ('error' in fields) return answer(400, { ok: false, error: fields.error });

  // Never hidden: no edit takes clause 5.1's mark away.
  if (isLate(current.date_made, current.recorded_at, inForceFrom) && !isLate(fields.date_made, current.recorded_at, inForceFrom)) {
    return answer(409, { ok: false, error: 'late-is-permanent' });
  }
  if (fields.kind !== current.kind || fields.amount_mnt !== current.amount_mnt) {
    const repayments = await db.repayments(`&contribution_id=eq.${id}`);
    if (fields.kind !== 'loan' && repayments.length) return answer(409, { ok: false, error: 'gift-has-repayments' });
    if (fields.amount_mnt < repaidOn(id, repayments).principal) return answer(400, { ok: false, error: 'amount-below-repaid' });
  }
  const item = await db.update(id, version, { ...fields, edited_by: me });
  if (!item) return answer(409, { ok: false, error: 'conflict' });
  return answer(200, { ok: true, item: shown(item, await db.repayments(`&contribution_id=eq.${id}`), inForceFrom) });
}

/**
 * A repayment, appended: principal and interest apart (5.2(e)), partial if
 * so (5.2(d)), against the loan the editor names (5.2(c) — never allocated
 * here). Never changed or removed afterwards.
 */
async function repay(db: Store, me: string, id: string, input: Record<string, unknown>): Promise<Response> {
  const principal = parseMnt(input.principal_mnt ?? 0, { allowZero: true });
  if (principal === null) return answer(400, { ok: false, error: 'principal' });
  const interest = parseMnt(input.interest_mnt ?? 0, { allowZero: true });
  if (interest === null) return answer(400, { ok: false, error: 'interest' });
  if (principal === 0 && interest === 0) return answer(400, { ok: false, error: 'repayment-empty' });
  const note = text(input.note) || null;
  if (note && note.length > CONTRIBUTION_LIMITS.repayment_note) return answer(400, { ok: false, error: 'repayment-note' });
  const paid_on = text(input.paid_on);

  const [current, earlier, inForceFrom] = await Promise.all([db.one(id), db.repayments(`&contribution_id=eq.${id}`), db.inForceFrom()]);
  if (!current) return answer(404, { ok: false, error: 'not-found' });
  if (current.kind !== 'loan') return answer(409, { ok: false, error: 'gift-not-repaid' });
  if (!isDate(paid_on) || paid_on < current.date_made || paid_on > ubDateOf(Date.now())) return answer(400, { ok: false, error: 'repaid-date' });
  if (repaidOn(id, earlier).principal + principal > current.amount_mnt) return answer(400, { ok: false, error: 'repaid-over' });

  const repayment = await db.repay({ contribution_id: id, paid_on, principal_mnt: principal, interest_mnt: interest, note, created_by: me });
  return answer(201, { ok: true, repayment, item: shown(current, [...earlier, repayment], inForceFrom) });
}
