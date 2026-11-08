/**
 * Schedule 2's routes (worker/contributions.ts) and rules
 * (src/lib/contribution-codes.ts), without Wrangler, Supabase or Telegram: a
 * stand-in for Supabase Auth, the editors and members tables and the
 * agreement row, a contributions table that orders, refuses a stale
 * updated_at and holds migrations 0012 and 0013's checks and triggers, an
 * append-only repayments table, and a Telegram that records each message.
 *
 * What this proves: no clause 5.1 clock until the agreement is in force, and
 * then only for money made on or after it — 29 and 30 days in time, 31 late —
 * with late a mark, never hidden and never a change of kind; the Member
 * picker is Members, not editors; money is whole tugrik everywhere — a
 * float is refused, never rounded; × 1.5 rounds half up, in BigInt; each
 * repayment is its own row, principal and interest apart, append-only; one
 * Telegram message per entry, none on an edit, skipped without a throw when
 * unset; an edit to the date or the amount writes an event; strangers get
 * 401; the migrations grant anon and authenticated nothing (read from the
 * files, and — when the project is reachable — asked of the live REST API
 * with the publishable key).
 *
 *   node scripts/test-contributions.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { onContributions, type Contribution, type Repayment } from '../worker/contributions.ts';
import { daysToRecord, formatMnt, isLate, owedMnt, parseMnt, standings, ubToday } from '../src/lib/contribution-codes.ts';
import config from '../src/lib/supabase.json' with { type: 'json' };

// Editors — who signs in.
const A = '0a0a0a0a-0000-4000-8000-00000000000a'; // anna — an editor, and Member Batuka
const B = '0b0b0b0b-0000-4000-8000-00000000000b'; // bold — an editor on salary, not a Member (4.9)
const C = '0c0c0c0c-0000-4000-8000-00000000000c'; // saraa — an editor, and Member Baysaa
const X = '0d0d0d0d-0000-4000-8000-00000000000d'; // a visitor: not an editor
const tokens: Record<string, { id: string; email: string; editor: boolean; name?: string }> = {
  'tok-anna': { id: A, email: 'anna@anir.mn', editor: true, name: 'Анна' },
  'tok-bold': { id: B, email: 'bold@anir.mn', editor: true },
  'tok-saraa': { id: C, email: 'saraa@anir.mn', editor: true, name: 'Сараа' },
  'tok-visitor': { id: X, email: 'v@example.com', editor: false },
};
// Members — who lends. Batenkh and Deegii have no login.
const BATUKA = '1a1a1a1a-0000-4000-8000-000000000001';
const BATENKH = '1a1a1a1a-0000-4000-8000-000000000002';
const BAYSAA = '1a1a1a1a-0000-4000-8000-000000000003';
const DEEGII = '1a1a1a1a-0000-4000-8000-000000000004';
const members = [
  { id: BATUKA, name: 'Batuka', editor_id: A, ord: 1 },
  { id: BATENKH, name: 'Batenkh', editor_id: null, ord: 2 },
  { id: BAYSAA, name: 'Baysaa', editor_id: C, ord: 3 },
  { id: DEEGII, name: 'Deegii', editor_id: null, ord: 4 },
];

let rows: Contribution[] = [];
let repayments: Repayment[] = [];
let events: { id: number; contribution_id: string; at: string; by: string; field: string; from_value: string; to_value: string }[] = [];
let inForceFrom: string | null = null;
let telegram: { chat: string; text: string }[] = [];
let telegramDown = false;
let tick = 0;
const stamp = () => new Date(Date.UTC(2026, 10, 9, 2, 0, 0) + ++tick * 1000).toISOString();
const pg = (code: string, message: string) => Response.json({ code, message }, { status: 400 });

/** What Postgres would refuse on contributions: migrations 0012 and 0013's checks. */
function violates(r: Contribution): string | null {
  if (typeof r.amount_mnt !== 'number' || !Number.isInteger(r.amount_mnt)) return `amount_mnt is not whole tugrik: ${JSON.stringify(r.amount_mnt)}`;
  if (!(r.amount_mnt > 0)) return 'amount_mnt > 0';
  if (!['loan', 'gift'].includes(r.kind)) return 'kind';
  if (!r.what_for?.trim() || r.what_for.trim().length > 500) return 'what_for';
  if (!members.some((m) => m.id === r.member_id)) return 'contributions_member_fk';
  if ('repaid_mnt' in r) return 'column repaid_mnt does not exist (0013)';
  return null;
}

const where = (params: URLSearchParams) => (r: object) =>
  [...params].every(([key, expression]) => {
    if (['select', 'order', 'limit'].includes(key)) return true;
    const [op, ...rest] = expression.split('.');
    if (op !== 'eq') throw new Error(`stub: no operator ${expression}`);
    return String((r as Record<string, unknown>)[key]) === rest.join('.');
  });

const stub = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(String(input));
  const headers = (init?.headers ?? {}) as Record<string, string>;
  const method = init?.method ?? 'GET';
  if (url.hostname === 'api.telegram.org') {
    if (telegramDown) return new Response('{}', { status: 500 });
    const body = JSON.parse(String(init?.body));
    telegram.push({ chat: String(body.chat_id), text: body.text });
    return Response.json({ ok: true });
  }
  if (url.pathname === '/auth/v1/user') {
    const who = tokens[(headers.Authorization ?? '').replace('Bearer ', '')];
    return who ? Response.json({ id: who.id, email: who.email }) : new Response('{}', { status: 401 });
  }
  if (url.pathname === '/rest/v1/editors') {
    if (url.searchParams.get('select') === 'user_id') {
      const id = (url.searchParams.get('user_id') ?? '').replace('eq.', '');
      return Response.json(Object.values(tokens).filter((e) => e.editor && e.id === id).map((e) => ({ user_id: e.id })));
    }
    assert.equal(headers.Authorization, 'Bearer service-key');
    return Response.json(Object.values(tokens).filter((e) => e.editor).map((e) => ({ user_id: e.id, email: e.email, display_name: e.name ?? null })));
  }
  assert.equal(headers.Authorization, 'Bearer service-key', `${url.pathname} is reached with the service key only`);
  if (url.pathname === '/rest/v1/members') return Response.json(members);
  if (url.pathname === '/rest/v1/agreement') return Response.json([{ in_force_from: inForceFrom }]);
  if (url.pathname === '/rest/v1/contribution_events') return Response.json(events);
  if (url.pathname === '/rest/v1/contribution_repayments') {
    if (method === 'GET') return Response.json(repayments.filter(where(url.searchParams)));
    if (method !== 'POST') return pg('P0001', 'contribution_repayments are appended, never changed or removed');
    const sent = JSON.parse(String(init?.body)) as Omit<Repayment, 'id' | 'created_at'>;
    // The trigger (0013): a loan only, never before it was lent, never past its principal.
    const lent = rows.find((r) => r.id === sent.contribution_id);
    if (!lent) return pg('23503', 'violates foreign key');
    for (const key of ['principal_mnt', 'interest_mnt'] as const) if (!Number.isInteger(sent[key]) || sent[key] < 0) return pg('23514', `${key} is not whole tugrik`);
    if (sent.principal_mnt === 0 && sent.interest_mnt === 0) return pg('23514', 'contribution_repayments_pays_something');
    if (lent.kind !== 'loan') return pg('P0001', 'a gift is never repaid');
    if (sent.paid_on < lent.date_made) return pg('P0001', 'a repayment cannot be paid before the money was lent');
    const repaid = repayments.filter((r) => r.contribution_id === lent.id).reduce((s, r) => s + r.principal_mnt, 0);
    if (repaid + sent.principal_mnt > lent.amount_mnt) return pg('P0001', 'repaid principal would pass the amount lent');
    const made: Repayment = { id: crypto.randomUUID(), created_at: stamp(), ...sent, note: sent.note ?? null };
    repayments.push(made);
    return Response.json([made], { status: 201 });
  }
  if (url.pathname === '/rest/v1/contributions') {
    if (method === 'GET') {
      const found = rows.filter(where(url.searchParams));
      if (url.searchParams.get('order') === 'date_made.desc,recorded_at.desc') found.sort((a, b) => (a.date_made !== b.date_made ? (a.date_made < b.date_made ? 1 : -1) : a.recorded_at < b.recorded_at ? 1 : -1));
      return Response.json(found);
    }
    if (method === 'POST') {
      const sent = JSON.parse(String(init?.body));
      const made = { id: crypto.randomUUID(), created_at: stamp(), updated_at: stamp(), receipt_held: false, kind: 'loan', note: null, edited_by: null, notified_at: null, recorded_at: stamp(), ...sent } as Contribution;
      const wrong = violates(made);
      if (wrong) return pg('23514', `violates check constraint ${wrong}`);
      rows.push(made);
      return Response.json([made], { status: 201 });
    }
    if (method === 'PATCH') {
      const patch = JSON.parse(String(init?.body));
      const target = rows.filter(where(url.searchParams));
      for (const r of target) {
        const next = { ...r, ...patch } as Contribution;
        // The trigger (0012, 0013): recorded_at and created_by never change; a repaid loan stays a
        // loan and never falls below what was repaid; tracked fields leave an event.
        if (next.recorded_at !== r.recorded_at) return pg('P0001', 'contributions.recorded_at never changes');
        if (next.created_by !== r.created_by) return pg('P0001', 'contributions.created_by never changes');
        const repaid = repayments.filter((p) => p.contribution_id === r.id);
        if (next.kind !== 'loan' && repaid.length) return pg('P0001', 'a contribution with repayments stays a loan');
        if (next.amount_mnt < repaid.reduce((s, p) => s + p.principal_mnt, 0)) return pg('P0001', 'the amount cannot fall below the principal already repaid');
        const wrong = violates(next);
        if (wrong) return pg('23514', `violates check constraint ${wrong}`);
        for (const field of ['member_id', 'date_made', 'amount_mnt', 'kind'] as const) {
          if (String(next[field]) !== String(r[field])) events.push({ id: events.length + 1, contribution_id: r.id, at: new Date().toISOString(), by: next.edited_by ?? next.created_by, field, from_value: String(r[field]), to_value: String(next[field]) });
        }
        Object.assign(r, next);
      }
      return Response.json(target);
    }
  }
  throw new Error(`unexpected fetch: ${method} ${url}`);
}) as typeof fetch;

const env = (extra: Record<string, string | undefined> = {}) => ({
  SUPABASE_URL: 'https://tyrzajpotvtirfjmacfm.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-key',
  TELEGRAM_BOT_TOKEN: 'bot',
  TELEGRAM_CHAT_ID: '-100-enquiries',
  TELEGRAM_TASKS_CHAT_ID: '-200-tasks',
  ...extra,
});
type Shown = Contribution & { days: number; applies: boolean; late: boolean; repaid_principal: number; repaid_interest: number };
type Body = Record<string, unknown> & { item?: Shown; repayment?: Repayment };
const call = async (token: string | null, method: string, path: string, body?: unknown, environment: Record<string, unknown> = env()) => {
  const response = await onContributions(
    new Request(`https://aniragency.mn${path}`, {
      method,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    environment as never,
    { fetcher: stub }
  );
  const text = await response.text();
  return { status: response.status, body: JSON.parse(text) as Body, text };
};
/** A date this many days before today in Ulaanbaatar. */
const daysAgo = (n: number) => new Date(Date.parse(`${ubToday()}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);
const entry = (extra: Record<string, unknown> = {}) => ({ member_id: BATENKH, date_made: daysAgo(2), amount_mnt: 1_500_000, what_for: 'Figma, жилийн эрх', receipt_held: true, ...extra });
const make = async (extra: Record<string, unknown> = {}, token = 'tok-anna') => {
  const r = await call(token, 'POST', '/api/contributions', entry(extra));
  assert.equal(r.status, 201, `created: ${r.text}`);
  return r.body.item!;
};
const repay = (id: string, principal: unknown, interest: unknown = 0, extra: Record<string, unknown> = {}) =>
  call('tok-anna', 'POST', `/api/contributions/${id}/repay`, { paid_on: ubToday(), principal_mnt: principal, interest_mnt: interest, ...extra });
const list = async (query = '') => (await call('tok-bold', 'GET', `/api/contributions${query}`)).body;
const reset = () => ((rows = []), (repayments = []), (events = []), (telegram = []), (telegramDown = false), (inForceFrom = null));

const results: Array<[string, string, string]> = [];
const quiet = { log: console.log, error: console.error };
async function check(label: string, run: () => Promise<string>) {
  reset();
  console.log = console.error = () => {};
  try {
    results.push(['+', label, await run()]);
  } catch (error) {
    results.push(['x', label, `FAILED — ${(error as Error).message.split('\n')[0]}`]);
  } finally {
    Object.assign(console, quiet);
  }
}
const skipped = (label: string, why: string) => results.push(['!', label, `SKIPPED — NOT CHECKED: ${why}`]);

/* ------------------------------------------------------------------ checks */

await check('strangers get 401 on every route, and learn nothing', async () => {
  const id = (await make()).id;
  telegram = [];
  const routes: [string, string, unknown?][] = [
    ['GET', '/api/contributions'],
    ['POST', '/api/contributions', entry()],
    ['POST', `/api/contributions/${id}`, { amount_mnt: 1 }],
    ['POST', `/api/contributions/${id}/repay`, { principal_mnt: 1, paid_on: ubToday() }],
  ];
  for (const [method, path, body] of routes) {
    for (const token of [null, 'forged']) {
      const r = await call(token, method, path, body);
      assert.equal(r.status, 401, `${method} ${path} with ${token ?? 'no token'}`);
      assert.deepEqual(r.body, { ok: false, error: 'signed-out' });
    }
    assert.equal((await call('tok-visitor', method, path, body)).status, 403, 'signed in, not an editor');
  }
  assert.deepEqual([rows.length, rows[0].amount_mnt, repayments.length, telegram.length], [1, 1_500_000, 0, 0], 'nothing written or sent');
  return `${routes.length} routes × no token, forged: 401 signed-out; a non-editor: 403; nothing written or sent`;
});

await check('the migrations grant anon and authenticated nothing, and hold money as bigint', async () => {
  const sql = ['0012_contributions.sql', '0013_members_agreement_repayments.sql'].map((f) => readFileSync(new URL(`../supabase/migrations/${f}`, import.meta.url), 'utf8').replace(/--.*$/gm, '')).join('\n');
  for (const table of ['contributions', 'contribution_events', 'members', 'agreement', 'contribution_repayments']) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`), `${table}: RLS on`);
    assert.match(sql, new RegExp(`revoke all on public\\.${table} from anon, authenticated`), `${table}: grants revoked`);
  }
  assert.doesNotMatch(sql, /create policy/i, 'no policies');
  assert.doesNotMatch(sql, /\bgrant\b/i, 'no grants');
  for (const fn of ['record_contribution_event', 'agreement_set_once', 'check_contribution_repayment']) assert.match(sql, new RegExp(`revoke all on function public\\.${fn}\\(\\) from public, anon, authenticated`));
  assert.match(sql, /before update or delete on public\.agreement/, 'the agreement date is set once, and the row stays');
  assert.match(sql, /before insert or update or delete on public\.contribution_repayments/, 'repayments are appended only');
  assert.match(sql, /drop column if exists repaid_mnt/, 'the single total is gone');
  for (const column of ['amount_mnt', 'principal_mnt', 'interest_mnt']) assert.match(sql, new RegExp(`${column}\\s+bigint`));
  // Types, not words: the error messages inside quotes may say "money".
  const code = sql.replace(/'(?:[^']|'')*'/g, "''");
  assert.doesNotMatch(code, /\b(numeric|decimal|real|double precision|float\d?|money)\b/i, 'no type that holds a fraction');
  assert.match(sql, /values \('Batuka', 1\), \('Batenkh', 2\), \('Baysaa', 3\), \('Deegii', 4\)/, 'the four Members, seeded');
  return '5 tables: RLS on, revoked from anon and authenticated, no policy, no grant; agreement set once; repayments append-only; bigint only; four Members seeded';
});

// The live project, asked with the publishable key a browser holds: it must refuse every table.
{
  const label = 'the live project refuses the publishable key on every Schedule 2 table';
  const answers: string[] = [];
  const missing: string[] = [];
  let readable = false;
  let unreachable = '';
  for (const table of ['contributions', 'contribution_events', 'members', 'agreement', 'contribution_repayments']) {
    try {
      const r = await fetch(`${config.url}/rest/v1/${table}?limit=1`, { headers: { apikey: config.publishableKey, Authorization: `Bearer ${config.publishableKey}` }, signal: AbortSignal.timeout(8000) });
      const body = (await r.json().catch(() => ({}))) as { code?: string };
      if (r.status === 404 || body.code === 'PGRST205') missing.push(table);
      else if (r.ok) readable = true;
      answers.push(`${table} ${r.status}${body.code ? ` ${body.code}` : ''}`);
    } catch (error) {
      unreachable = `the live project did not answer (${(error as Error).message})`;
    }
  }
  if (readable) results.push(['x', label, `FAILED — READABLE: ${answers.join(', ')}`]);
  else if (unreachable) skipped(label, unreachable);
  else if (missing.length) skipped(label, `not in the live project yet: ${missing.join(', ')} (the rest refuse: ${answers.filter((a) => !missing.some((m) => a.startsWith(`${m} `))).join(', ')})`);
  else results.push(['+', label, answers.join(', ')]);
}

await check('no clause 5.1 clock before the agreement is in force: weeks-old money stays a loan', async () => {
  const old = await make({ date_made: daysAgo(31) });
  const older = await make({ date_made: daysAgo(90), member_id: DEEGII });
  assert.deepEqual([old.late, older.late, old.applies, older.applies], [false, false, false, false], 'nothing is late while in_force_from is null');
  assert.deepEqual([old.kind, older.kind], ['loan', 'loan']);
  assert.equal((await list()).agreement && ((await list()).agreement as { in_force_from: string | null }).in_force_from, null);
  assert.equal(isLate('2026-01-01', '2026-11-09T00:00:00Z', null), false);
  return '31 and 90 days old, agreement unsigned: loans, not late, 5.1 not applying';
});

await check('in force: 29 and 30 days in time, 31 late — marked, stored, and still a loan', async () => {
  inForceFrom = daysAgo(100);
  // Counted on Ulaanbaatar's calendar: a minute either side of its midnight.
  assert.equal(daysToRecord('2026-10-01', '2026-10-31T15:59:00Z'), 30);
  assert.equal(isLate('2026-10-01', '2026-10-31T15:59:00Z', '2026-09-01'), false, '30 days, at 23:59 in Ulaanbaatar: in time');
  assert.equal(isLate('2026-10-01', '2026-10-31T16:01:00Z', '2026-09-01'), true, '00:01 the next day in Ulaanbaatar: late');
  const made = { 29: await make({ date_made: daysAgo(29) }), 30: await make({ date_made: daysAgo(30) }), 31: await make({ date_made: daysAgo(31) }) };
  assert.deepEqual([made[29].late, made[30].late, made[31].late], [false, false, true], 'only the last is marked late');
  assert.deepEqual([made[29].kind, made[30].kind, made[31].kind], ['loan', 'loan', 'loan'], 'never reclassified: the kind is the Members\' to decide');
  assert.equal(rows.length, 3, 'the late one is stored, not refused');
  const before = await make({ date_made: daysAgo(120) });
  assert.deepEqual([before.applies, before.late], [false, false], 'money made before the agreement: 5.1 does not apply');
  const backdated = await make({ date_made: daysAgo(40), recorded_at: `${daysAgo(39)}T02:00:00.000Z` });
  assert.deepEqual([backdated.late, backdated.days], [true, 40], "recorded_at is the Worker's clock, never the request's");
  assert.equal((await call('tok-anna', 'POST', '/api/contributions', entry({ date_made: daysAgo(-1) }))).body.error, 'date-future');
  return '23:59 vs 00:01 Ulaanbaatar: 30 / 31 days; 29, 30 in time, 31 late — all loans; made before in force: no clock; backdated recorded_at ignored';
});

await check('the late mark is never hidden — but the kind is the Members\' to change, and recorded', async () => {
  inForceFrom = daysAgo(100);
  const late = await make({ date_made: daysAgo(45) });
  const moved = await call('tok-anna', 'POST', `/api/contributions/${late.id}`, { date_made: daysAgo(3), updated_at: late.updated_at });
  assert.deepEqual([moved.status, moved.body.error], [409, 'late-is-permanent']);
  const ruled = await call('tok-saraa', 'POST', `/api/contributions/${late.id}`, { kind: 'gift', updated_at: late.updated_at });
  assert.deepEqual([ruled.status, ruled.body.item?.kind, ruled.body.item?.late], [200, 'gift', true], 'a person may say it is a gift — and it stays marked');
  assert.deepEqual(events.map((e) => [e.field, e.from_value, e.to_value, e.by]), [['kind', 'loan', 'gift', C]], 'and who said so is kept');
  const sneaky = await call('tok-anna', 'POST', `/api/contributions/${late.id}`, { what_for: 'Засвар', recorded_at: new Date().toISOString(), updated_at: ruled.body.item!.updated_at });
  assert.equal(sneaky.status, 200);
  assert.equal(rows[0].recorded_at, late.recorded_at, 'recorded_at is never taken from a request');
  return 'date moved inside 30 days: 409; made a gift by a person: 200, still marked, an event by who did it; recorded_at in a request: ignored';
});

await check('Members, not editors: the picker is the members table', async () => {
  const shown = (await list()).members as { id: string; name: string }[];
  assert.deepEqual(shown.map((m) => m.name), ['Batuka', 'Batenkh', 'Baysaa', 'Deegii']);
  for (const who of [A, B, X, 'xuji']) assert.equal((await call('tok-anna', 'POST', '/api/contributions', entry({ member_id: who }))).body.error, 'member', `${who}: an editor's id or a name is not a Member`);
  const noLogin = await make({ member_id: DEEGII }, 'tok-bold');
  assert.equal(noLogin.member_id, DEEGII, 'a Member with no login can lend; an editor who is not a Member can enter it');
  assert.equal(telegram.at(-1)?.text, 'Хавсралт 2: Deegii 1 500 000₮ — Figma, жилийн эрх', 'named by the Member, not the editor');
  return 'picker: Batuka, Batenkh, Baysaa, Deegii; editor ids (even a Member\'s login) and names refused; Deegii, no login, lends';
});

await check('money is whole tugrik: a float is refused, never rounded — in the tables, the API, every figure', async () => {
  const floats: unknown[] = [1.5, '1.5', '1,5', '1 500 000.00', '1500000,00', -5, 0, '0', 1e21, 'abc', '', true, null, '١٢٣', '1e6', ' '];
  for (const amount of floats) assert.deepEqual(Object.values((await call('tok-anna', 'POST', '/api/contributions', entry({ amount_mnt: amount }))).body).slice(0, 2), [false, 'amount'], `amount ${JSON.stringify(amount)}`);
  assert.equal(rows.length, 0, 'none stored');
  const typed = await make({ amount_mnt: '1 500 000' });
  assert.equal(typed.amount_mnt, 1_500_000, 'digits in groups: read as whole tugrik');
  for (const [p, i, code] of [[0.5, 0, 'principal'], ['1,0', 0, 'principal'], [1, 0.5, 'interest'], [1, '2.5', 'interest'], [0, 0, 'repayment-empty']] as const) {
    assert.equal((await repay(typed.id, p, i)).body.error, code, `repay ${p} + ${i}`);
  }
  assert.equal((await repay(typed.id, '500 000', '250 000')).status, 201);
  const answer = (await call('tok-anna', 'GET', '/api/contributions')).text;
  // A JSON number right after a key — not the seconds inside a timestamp string.
  const fractions = answer.match(/":\s*-?\d+\.\d+/g);
  assert.equal(fractions, null, `a fraction in the API: ${fractions}`);
  const walk = (v: unknown): void => (typeof v === 'number' ? assert.ok(Number.isSafeInteger(v), `not whole: ${v}`) : v && typeof v === 'object' ? Object.values(v).forEach(walk) : undefined);
  walk(JSON.parse(answer));
  assert.equal(parseMnt('9007199254740992'), null, 'past what JSON carries exactly: refused');
  assert.equal(formatMnt(1_500_000), '1 500 000');
  return `${floats.length} non-integer amounts refused; principal and interest the same; "1 500 000" read as 1500000; every number in the API an integer`;
});

await check('× 1.5 is integer tugrik, rounded half up — to the Member — in BigInt', async () => {
  assert.deepEqual([0, 1, 2, 3, 1_000_000, 1_000_001].map(owedMnt), [0, 2, 3, 5, 1_500_000, 1_500_002]);
  assert.equal(owedMnt(6_004_799_503_160_660), 9_007_199_254_740_990, 'exact far past where a float would drift');
  assert.throws(() => owedMnt(6_004_799_503_160_661), /past what JSON carries/);
  await make({ amount_mnt: 1, member_id: BATUKA });
  await make({ amount_mnt: 3, member_id: BATENKH });
  const c = await make({ amount_mnt: 1_000_002, member_id: BAYSAA });
  assert.equal((await repay(c.id, 1, 0)).status, 201);
  await make({ amount_mnt: 999, member_id: BAYSAA, kind: 'gift' });
  const strip = (await list()).summary as { member_id: string; principal: number; repaid: number; outstanding: number; owed: number }[];
  const of = (id: string) => strip.find((s) => s.member_id === id)!;
  assert.deepEqual([of(BATUKA).outstanding, of(BATUKA).owed], [1, 2]);
  assert.deepEqual([of(BATENKH).outstanding, of(BATENKH).owed], [3, 5]);
  assert.deepEqual([of(BAYSAA).principal, of(BAYSAA).repaid, of(BAYSAA).outstanding, of(BAYSAA).owed], [1_000_002, 1, 1_000_001, 1_500_002], 'a gift is not principal; partial repayment counts');
  assert.deepEqual([of(DEEGII).principal, of(DEEGII).owed], [0, 0], 'a Member with nothing: zeros, still a row');
  assert.deepEqual(standings([], [], [BATUKA], null).map((s) => s.owed), [0]);
  return '1 → 2, 3 → 5, 1 000 001 → 1 500 002; exact to 9 007 199 254 740 990; the strip agrees, gifts left out, every Member a row';
});

await check('each repayment is its own row — principal and interest apart — and never changed', async () => {
  const e = await make({ amount_mnt: 1_000_000, member_id: BAYSAA, date_made: daysAgo(10) });
  const first = await repay(e.id, 300_000, 150_000, { note: 'гүйлгээ 1' });
  const second = await repay(e.id, 200_000, 0, { paid_on: daysAgo(1) });
  assert.deepEqual([first.status, second.status], [201, 201]);
  assert.deepEqual(repayments.map((r) => [r.principal_mnt, r.interest_mnt, r.created_by]), [[300_000, 150_000, A], [200_000, 0, A]], 'two rows, the split kept, who entered them');
  const shown = ((await list()).items as Shown[])[0];
  assert.deepEqual([shown.repaid_principal, shown.repaid_interest], [500_000, 150_000]);
  const strip = ((await list()).summary as { member_id: string; repaid: number; interest: number; outstanding: number }[]).find((s) => s.member_id === BAYSAA)!;
  assert.deepEqual([strip.repaid, strip.interest, strip.outstanding], [500_000, 150_000, 500_000], 'the strip: principal repaid, uplift paid, apart');
  assert.equal((await repay(shown.id, 500_001)).body.error, 'repaid-over');
  assert.equal((await repay(shown.id, 1, 0, { paid_on: daysAgo(11) })).body.error, 'repaid-date', 'before it was lent');
  assert.equal((await repay(shown.id, 1, 0, { paid_on: daysAgo(-1) })).body.error, 'repaid-date', 'tomorrow');
  const gift = await make({ kind: 'gift' });
  assert.equal((await repay(gift.id, 1)).body.error, 'gift-not-repaid');
  assert.equal((await call('tok-anna', 'POST', `/api/contributions/${shown.id}`, { kind: 'gift', updated_at: shown.updated_at })).body.error, 'gift-has-repayments');
  assert.equal((await call('tok-anna', 'POST', `/api/contributions/${shown.id}`, { amount_mnt: 400_000, updated_at: shown.updated_at })).body.error, 'amount-below-repaid');
  // No route changes or removes one: the only way in is the append.
  const id = repayments[0].id;
  for (const [method, path] of [['POST', `/api/contributions/${shown.id}/repay/${id}`], ['DELETE', `/api/contributions/${shown.id}/repay`], ['PATCH', `/api/contributions/${shown.id}/repay`]]) {
    assert.equal((await call('tok-anna', method, path, { principal_mnt: 0 })).status, 404, `${method} ${path}`);
  }
  assert.equal(repayments.length, 2, 'nothing changed');
  assert.ok(!events.some((ev) => (ev.field as string) === 'repaid_mnt'), 'repayments are their own record, not events');
  return '300 000 + 150 000, then 200 000 + 0: two rows; strip repaid 500 000, uplift 150 000; past principal, before lending, tomorrow, on a gift: refused; no route to change one';
});

await check('the strip carries late principal beside it, never quietly left out', async () => {
  inForceFrom = daysAgo(100);
  await make({ member_id: BATUKA, amount_mnt: 100_000, date_made: daysAgo(5) });
  await make({ member_id: BATUKA, amount_mnt: 40_000, date_made: daysAgo(50) });
  const batuka = ((await list()).summary as { member_id: string; principal: number; late: number }[]).find((s) => s.member_id === BATUKA)!;
  assert.deepEqual([batuka.principal, batuka.late], [140_000, 40_000], 'principal includes the late loan; late shows how much');
  return 'principal 140 000, of which recorded late 40 000 — the Members decide, the strip shows both';
});

await check('one Telegram message per entry, to the tasks group, and none on an edit or a repayment', async () => {
  const one = await make({ member_id: BATUKA, amount_mnt: 1_500_000, what_for: 'Figma, жилийн эрх' });
  await make({ member_id: BAYSAA, amount_mnt: 89_000, what_for: 'Домэйн' });
  await make({ member_id: DEEGII, amount_mnt: 450_000, what_for: 'Хэвлэл', date_made: daysAgo(40) });
  assert.equal(telegram.length, 3, 'one each');
  assert.ok(telegram.every((m) => m.chat === '-200-tasks'), 'never the enquiries chat');
  assert.equal(telegram[0].text, 'Хавсралт 2: Batuka 1 500 000₮ — Figma, жилийн эрх');
  assert.ok(rows.every((r) => r.notified_at), 'each marked delivered');
  await call('tok-anna', 'POST', `/api/contributions/${one.id}`, { amount_mnt: 1_600_000, updated_at: rows[0].updated_at });
  await repay(one.id, 100_000, 50_000);
  assert.equal(telegram.length, 3, 'an edit and a repayment send nothing');
  telegramDown = true;
  const unsent = await call('tok-anna', 'POST', '/api/contributions', entry());
  assert.equal(unsent.status, 201, 'Telegram failing never fails the entry');
  assert.equal(unsent.body.item?.notified_at, null, 'and the row says it did not go');
  return '3 entries → 3 messages to -200-tasks, «Хавсралт 2: Batuka 1 500 000₮ — …»; edit, repay: none; Telegram 500: stored, notified_at null';
});

await check('TELEGRAM_TASKS_CHAT_ID unset: skipped, nothing thrown, the entry stored and marked not sent', async () => {
  const r = await call('tok-anna', 'POST', '/api/contributions', entry(), env({ TELEGRAM_TASKS_CHAT_ID: undefined }));
  assert.equal(r.status, 201);
  assert.equal(telegram.length, 0, 'no message to any chat');
  assert.equal(r.body.item?.notified_at, null);
  assert.equal(rows.length, 1);
  return 'create 201, no message to any chat, notified_at null, nothing thrown';
});

await check('an edit to the date or the amount writes an event; other edits do not', async () => {
  let e = await make({ amount_mnt: 100_000 });
  const edit = async (patch: Record<string, unknown>, token = 'tok-saraa') => {
    const r = await call(token, 'POST', `/api/contributions/${e.id}`, { ...patch, updated_at: e.updated_at });
    assert.equal(r.status, 200, r.text);
    e = r.body.item!;
  };
  await edit({ what_for: 'Өөр тайлбар', note: 'тэмдэглэл', receipt_held: false });
  assert.equal(events.length, 0, 'words only: no event');
  await edit({ amount_mnt: 120_000 });
  await edit({ date_made: daysAgo(4) });
  await edit({ member_id: BAYSAA }, 'tok-anna');
  assert.deepEqual(
    events.map((x) => [x.field, x.from_value, x.to_value, x.by]),
    [
      ['amount_mnt', '100000', '120000', C],
      ['date_made', daysAgo(2), daysAgo(4), C],
      ['member_id', BATENKH, BAYSAA, A],
    ]
  );
  const shown = (await list()).events as { field: string; who: string }[];
  assert.deepEqual(shown.map((x) => x.who), ['Сараа', 'Сараа', 'Анна'], 'by name');
  return 'amount, date, member: one event each, who and from → to; what_for, note, receipt: none';
});

await check('a stale write is a conflict, never an overwrite', async () => {
  const e = await make();
  assert.equal((await call('tok-anna', 'POST', `/api/contributions/${e.id}`, { amount_mnt: 2_000_000, updated_at: e.updated_at })).status, 200);
  assert.equal((await call('tok-bold', 'POST', `/api/contributions/${e.id}`, { amount_mnt: 9, updated_at: e.updated_at })).body.error, 'conflict');
  assert.equal((await call('tok-bold', 'POST', `/api/contributions/${e.id}`, { amount_mnt: 9 })).body.error, 'no-version');
  assert.equal(rows[0].amount_mnt, 2_000_000);
  return 'an edit with the version read before another save: 409 conflict; no version: 400';
});

await check('the list is newest money first; the member filter narrows the list, never the strip', async () => {
  await make({ date_made: daysAgo(10), what_for: 'Хуучин', member_id: BATUKA });
  await make({ date_made: daysAgo(1), what_for: 'Шинэ', member_id: BAYSAA });
  await make({ date_made: daysAgo(5), what_for: 'Дунд', member_id: BATUKA });
  const all = await list();
  assert.deepEqual((all.items as { what_for: string }[]).map((x) => x.what_for), ['Шинэ', 'Дунд', 'Хуучин']);
  assert.deepEqual((all.summary as { name: string }[]).map((s) => s.name), ['Batuka', 'Batenkh', 'Baysaa', 'Deegii'], 'the four Members, in their order');
  const batuka = await list(`?member=${BATUKA}`);
  assert.deepEqual((batuka.items as { what_for: string }[]).map((x) => x.what_for), ['Дунд', 'Хуучин']);
  assert.equal((batuka.summary as unknown[]).length, 4, 'the strip still shows all four');
  return 'by date made, newest first; ?member= narrows the rows; the strip keeps Batuka, Batenkh, Baysaa, Deegii';
});

/* ----------------------------------------------------------------- report */

const width = Math.max(...results.map(([, label]) => label.length));
console.log('');
for (const [mark, label, detail] of results) console.log(`  ${mark} ${label.padEnd(width)}  ${detail}`);
const failed = results.filter(([mark]) => mark === 'x').length;
const passed = results.filter(([mark]) => mark === '+').length;
const notChecked = results.filter(([mark]) => mark === '!').length;
console.log(`\n  ${passed}/${results.length} passed${notChecked ? ` — ${notChecked} NOT CHECKED, which is not a pass` : ''}\n`);
process.exit(failed ? 1 : 0);
