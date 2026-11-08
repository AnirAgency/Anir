/**
 * Schedule 2 of the founder agreement — the money Members put into the
 * Company — as rules shared by the Worker (worker/contributions.ts) and the
 * admin (src/scripts/admin-contributions.ts), so the two cannot disagree.
 *
 * Imported by those two only — never by a public page, layout or component
 * (scripts/test-isolation.ts holds it).
 *
 * MONEY IS WHOLE TUGRIK, NEVER A FLOAT. Amounts are integers end to end: a
 * bigint in the table, a safe integer in JSON, digits on the page. The one
 * multiplication — × 1.5 — is done in BigInt. Money in a float is a rounding
 * argument between four shareholders waiting to happen.
 */

export const KINDS = ['loan', 'gift'] as const;
export type Kind = (typeof KINDS)[number];

/** The fields whose every change is kept in contribution_events (migration 0012). */
export const TRACKED = ['member_id', 'date_made', 'amount_mnt', 'kind', 'repaid_mnt'] as const;
export type Tracked = (typeof TRACKED)[number];

/** What the table holds (supabase/migrations/0012). */
export const CONTRIBUTION_LIMITS = { what_for: 500, note: 2000 } as const;
/** Guidance in the form, never a limit. */
export const CONTRIBUTION_GUIDE = { what_for: 120, note: 300 } as const;

/* ------------------------------------------------------------------- days */

/** Clause 5.1: a contribution not recorded within this many days of being made is a gift. */
export const RECORD_WITHIN_DAYS = 30;

/** Ulaanbaatar is UTC+8 all year; the agreement's days are its days. */
const UB_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 86_400_000;
const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** The Ulaanbaatar calendar date of an instant, YYYY-MM-DD. */
export const ubDateOf = (iso: string | number) => day((typeof iso === 'number' ? iso : Date.parse(iso)) + UB_MS);
/** Today in Ulaanbaatar. */
export const ubToday = (now = Date.now()) => ubDateOf(now);

export const isDate = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().startsWith(value);

/** Whole calendar days from one date to another, both YYYY-MM-DD. Exact: both are UTC midnights. */
export const daysBetween = (from: string, to: string) => (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS;

/**
 * How many days after the money moved it was recorded: the Ulaanbaatar date
 * it was recorded on, less the date it was made. Recorded the same day is 0.
 */
export const daysToRecord = (dateMade: string, recordedAt: string) => daysBetween(dateMade, ubDateOf(recordedAt));

/**
 * Clause 5.1: recorded more than 30 days after it was made. Thirty days is
 * still within — made on 1 October, recorded on 31 October, is a loan; on
 * 1 November, a gift. A late contribution is a gift and is never repaid; the
 * mark is permanent (worker/contributions.ts refuses an edit that clears it).
 */
export const isLate = (dateMade: string, recordedAt: string) => daysToRecord(dateMade, recordedAt) > RECORD_WITHIN_DAYS;

/* ------------------------------------------------------------------ money */

/**
 * Whole tugrik from what a person typed or JSON carried — or null. Spaces
 * between groups of digits are allowed ("1 500 000"); nothing else is: not a
 * decimal point, not a comma (is "1,5" one and a half, or fifteen?), not a
 * sign. A JSON number must already be a safe integer.
 */
export function parseMnt(value: unknown, { allowZero = false } = {}): number | null {
  let n: number;
  if (typeof value === 'number') n = value;
  else if (typeof value === 'string') {
    const digits = value.replace(/[\s  ]/g, '');
    if (!/^\d+$/.test(digits)) return null;
    n = Number(digits);
  } else return null;
  if (!Number.isSafeInteger(n) || n < 0 || (n === 0 && !allowZero)) return null;
  return n;
}

/** Digits in groups of three with no-break spaces, as the page shows them: 1 500 000. No ₮ — the words add it. */
export const formatMnt = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

/**
 * What the Company owes on an outstanding principal, under clause 5.2:
 * 150%, in whole tugrik.
 *
 * ROUNDING: half up, to the whole tugrik — the half goes to the Member. Of
 * an integer, × 1.5 is either whole or exactly half, so half up is the
 * same as up: 1 → 2, 3 → 5, 1 000 001 → 1 500 002. Computed in BigInt, so
 * no float is ever involved. Nothing else in this system rounds money; if
 * something comes to, it rounds this way.
 */
export function owedMnt(outstanding: number): number {
  const owed = (BigInt(outstanding) * 3n + 1n) / 2n;
  if (owed > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('owed is past what JSON carries exactly');
  return Number(owed);
}

/** A sum of whole tugrik, in BigInt, back to a safe integer. */
export function sumMnt(values: number[]): number {
  const total = values.reduce((sum, n) => sum + BigInt(n), 0n);
  if (total > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('a total is past what JSON carries exactly');
  return Number(total);
}

/* ---------------------------------------------------------------- summary */

export interface Row {
  member_id: string;
  date_made: string;
  recorded_at: string;
  amount_mnt: number;
  kind: Kind;
  repaid_mnt: number;
}

/** Whether a row is a loan the Company repays: a loan by kind, recorded in time. */
export const repayable = (row: Row) => row.kind === 'loan' && !isLate(row.date_made, row.recorded_at);

export interface Standing {
  member_id: string;
  /** The principal of repayable loans: gifts, and late entries, are not owed. */
  principal: number;
  repaid: number;
  outstanding: number;
  /** outstanding × 1.5, half up — not yet due (clause 5.2): nothing here knows the bank balance. */
  owed: number;
}

/**
 * Per Member: principal, repaid, outstanding, owed. One for every Member
 * given, in that order, with nothing yet shown as zeros — and one after them
 * for anyone else with a row (someone no longer an editor), so no money
 * disappears from the strip because its Member did.
 */
export function standings(rows: Row[], members: string[]): Standing[] {
  const ids = [...members, ...[...new Set(rows.map((r) => r.member_id))].filter((id) => !members.includes(id))];
  return ids.map((member_id) => {
    const loans = rows.filter((r) => r.member_id === member_id && repayable(r));
    const principal = sumMnt(loans.map((r) => r.amount_mnt));
    const repaid = sumMnt(loans.map((r) => r.repaid_mnt));
    const outstanding = principal - repaid;
    return { member_id, principal, repaid, outstanding, owed: owedMnt(outstanding) };
  });
}
