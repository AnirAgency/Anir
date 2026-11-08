/**
 * Schedule 2's routes (worker/contributions.ts) and rules
 * (src/lib/contribution-codes.ts), without Wrangler, Supabase or Telegram: a
 * stand-in for Supabase Auth and the editors table, a contributions table
 * that orders, refuses a stale updated_at, holds migration 0012's checks and
 * runs its trigger — events, and recorded_at that never changes — the way
 * Postgres would, and a Telegram that records each message.
 *
 * What this proves: clause 5.1's boundary — 29 and 30 days are loans, 31 is
 * a gift, stored, never refused, and marked for good; money is whole tugrik
 * in the table, the API and every figure — a float is refused, never
 * rounded; × 1.5 rounds half up, in BigInt; one Telegram message per entry
 * and none on an edit, skipped without a throw when unset, and notified_at
 * set only on delivery; an edit to the date or the amount writes an event;
 * strangers get 401; the migration grants anon and authenticated nothing
 * (read from the file, and — when the project is reachable — asked of the
 * live REST API with the publishable key).
 *
 *   node scripts/test-contributions.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { onContributions, type Contribution } from '../worker/contributions.ts';
import { daysToRecord, formatMnt, isLate, owedMnt, parseMnt, standings, ubToday } from '../src/lib/contribution-codes.ts';
import config from '../src/lib/supabase.json' with { type: 'json' };

const A = '0a0a0a0a-0000-4000-8000-00000000000a'; // anna — a Member with a display name
const B = '0b0b0b0b-0000-4000-8000-00000000000b'; // bold — a Member without one
const C = '0c0c0c0c-0000-4000-8000-00000000000c'; // saraa
const X = '0d0d0d0d-0000-4000-8000-00000000000d'; // a visitor: not an editor
const tokens: Record<string, { id: string; email: string; editor: boolean; name?: string }> = {
  'tok-anna': { id: A, email: 'anna@anir.mn', editor: true, name: 'Анна' },
  'tok-bold': { id: B, email: 'bold@anir.mn', editor: true },
  'tok-saraa': { id: C, email: 'saraa@anir.mn', editor: true, name: 'Сараа' },
  'tok-visitor': { id: X, email: 'v@example.com', editor: false },
};

let rows: Contribution[] = [];
let events: { id: number; contribution_id: string; at: string; by: string; field: string; from_value: string; to_value: string }[] = [];
const removed = new Set<string>();
let telegram: { chat: string; text: string }[] = [];
let telegramDown = false;
let tick = 0;
const stamp = () => new Date(Date.UTC(2026, 10, 9, 2, 0, 0) + ++tick * 1000).toISOString();

/** What Postgres would refuse: migration 0012's checks. */
function violates(r: Contribution): string | null {
  for (const key of ['amount_mnt', 'repaid_mnt'] as const) {
    if (typeof r[key] !== 'number' || !Number.isInteger(r[key])) return `${key} is not whole tugrik: ${JSON.stringify(r[key])}`;
  }
  if (!(r.amount_mnt > 0)) return 'amount_mnt > 0';
  if (r.repaid_mnt < 0) return 'repaid_mnt >= 0';
  if (r.repaid_mnt > r.amount_mnt) return 'contributions_repaid_within_principal';
  if (r.kind !== 'loan' && r.repaid_mnt !== 0) return 'contributions_gift_is_never_repaid';
  if (!['loan', 'gift'].includes(r.kind)) return 'kind';
  if (!r.what_for?.trim() || r.what_for.trim().length > 500) return 'what_for';
  return null;
}

const where = (params: URLSearchParams) => (r: Contribution) =>
  [...params].every(([key, expression]) => {
    if (['select', 'order', 'limit'].includes(key)) return true;
    const [op, ...rest] = expression.split('.');
    if (op !== 'eq') throw new Error(`stub: no operator ${expression}`);
    return String((r as unknown as Record<string, unknown>)[key]) === rest.join('.');
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
    const editors = Object.values(tokens).filter((who) => who.editor && !removed.has(who.id));
    if (url.searchParams.get('select') === 'user_id') {
      const id = (url.searchParams.get('user_id') ?? '').replace('eq.', '');
      return Response.json(Object.values(tokens).filter((e) => e.editor && e.id === id).map((e) => ({ user_id: e.id })));
    }
    assert.equal(headers.Authorization, 'Bearer service-key');
    return Response.json(editors.map((e) => ({ user_id: e.id, email: e.email, display_name: e.name ?? null })));
  }
  if (url.pathname === '/rest/v1/contribution_events') {
    assert.equal(headers.Authorization, 'Bearer service-key');
    return Response.json(events);
  }
  if (url.pathname === '/rest/v1/contributions') {
    assert.equal(headers.Authorization, 'Bearer service-key', 'the table is reached with the service key only');
    if (method === 'GET') {
      const found = rows.filter(where(url.searchParams));
      if (url.searchParams.get('order') === 'date_made.desc,recorded_at.desc') found.sort((a, b) => (a.date_made !== b.date_made ? (a.date_made < b.date_made ? 1 : -1) : a.recorded_at < b.recorded_at ? 1 : -1));
      return Response.json(found);
    }
    if (method === 'POST') {
      const sent = JSON.parse(String(init?.body));
      const made = { id: crypto.randomUUID(), created_at: stamp(), updated_at: stamp(), receipt_held: false, kind: 'loan', repaid_mnt: 0, note: null, edited_by: null, notified_at: null, recorded_at: stamp(), ...sent } as Contribution;
      const wrong = violates(made);
      if (wrong) return Response.json({ code: '23514', message: `violates check constraint ${wrong}` }, { status: 400 });
      rows.push(made);
      return Response.json([made], { status: 201 });
    }
    if (method === 'PATCH') {
      const patch = JSON.parse(String(init?.body));
      const target = rows.filter(where(url.searchParams));
      for (const r of target) {
        const next = { ...r, ...patch } as Contribution;
        // The trigger (0012): recorded_at and created_by never change; tracked fields leave an event.
        if (next.recorded_at !== r.recorded_at) return Response.json({ code: 'P0001', message: 'contributions.recorded_at never changes' }, { status: 400 });
        if (next.created_by !== r.created_by) return Response.json({ code: 'P0001', message: 'contributions.created_by never changes' }, { status: 400 });
        const wrong = violates(next);
        if (wrong) return Response.json({ code: '23514', message: `violates check constraint ${wrong}` }, { status: 400 });
        for (const field of ['member_id', 'date_made', 'amount_mnt', 'kind', 'repaid_mnt'] as const) {
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
type Body = Record<string, unknown> & { item?: Contribution & { days: number; late: boolean } };
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
const entry = (extra: Record<string, unknown> = {}) => ({ member_id: B, date_made: daysAgo(2), amount_mnt: 1_500_000, what_for: 'Figma, жилийн эрх', receipt_held: true, ...extra });
const make = async (extra: Record<string, unknown> = {}, token = 'tok-anna') => {
  const r = await call(token, 'POST', '/api/contributions', entry(extra));
  assert.equal(r.status, 201, `created: ${r.text}`);
  return r.body.item!;
};
const list = async (query = '') => (await call('tok-bold', 'GET', `/api/contributions${query}`)).body;
const reset = () => ((rows = []), (events = []), (telegram = []), removed.clear(), (telegramDown = false));

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
    ['POST', `/api/contributions/${id}/repay`, { amount_mnt: 1 }],
  ];
  for (const [method, path, body] of routes) {
    for (const token of [null, 'forged']) {
      const r = await call(token, method, path, body);
      assert.equal(r.status, 401, `${method} ${path} with ${token ?? 'no token'}`);
      assert.deepEqual(r.body, { ok: false, error: 'signed-out' });
    }
    assert.equal((await call('tok-visitor', method, path, body)).status, 403, 'signed in, not an editor');
  }
  assert.equal(rows.length, 1, 'nothing written');
  assert.equal(rows[0].amount_mnt, 1_500_000, 'nothing changed');
  assert.equal(telegram.length, 0, 'nothing sent');
  return `${routes.length} routes × no token, forged: 401 signed-out; a non-editor: 403; nothing written or sent`;
});

await check('the migration grants anon and authenticated nothing, and holds money as bigint', async () => {
  const sql = readFileSync(new URL('../supabase/migrations/0012_contributions.sql', import.meta.url), 'utf8').replace(/--.*$/gm, '');
  for (const table of ['contributions', 'contribution_events']) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`), `${table}: RLS on`);
    assert.match(sql, new RegExp(`revoke all on public\\.${table} from anon, authenticated`), `${table}: grants revoked`);
  }
  assert.doesNotMatch(sql, /create policy/i, 'no policies');
  assert.doesNotMatch(sql, /\bgrant\b/i, 'no grants');
  assert.match(sql, /revoke all on function public\.record_contribution_event\(\) from public, anon, authenticated/);
  assert.match(sql, /amount_mnt\s+bigint/);
  assert.match(sql, /repaid_mnt\s+bigint/);
  assert.doesNotMatch(sql, /\b(numeric|decimal|real|double precision|float\d?|money)\b/i, 'no type that holds a fraction');
  return 'RLS on both tables, revoked from anon and authenticated, no policy, no grant; amounts bigint, no fractional type';
});

// The live project, asked with the publishable key a browser holds: it must refuse.
{
  const label = 'the live project refuses the publishable key on both tables';
  const answers: string[] = [];
  let skip = '';
  for (const table of ['contributions', 'contribution_events']) {
    try {
      const r = await fetch(`${config.url}/rest/v1/${table}?select=id&limit=1`, { headers: { apikey: config.publishableKey, Authorization: `Bearer ${config.publishableKey}` }, signal: AbortSignal.timeout(8000) });
      const body = (await r.json().catch(() => ({}))) as { code?: string };
      if (r.status === 404 || body.code === 'PGRST205') skip = 'migration 0012 is not applied to the live project yet';
      answers.push(`${table}: ${r.status}${body.code ? ` ${body.code}` : ''}`);
      if (!skip && r.ok) answers.push('READABLE');
    } catch (error) {
      skip = `the live project did not answer (${(error as Error).message})`;
    }
  }
  if (skip) skipped(label, skip);
  else results.push(answers.includes('READABLE') ? ['x', label, `FAILED — ${answers.join(', ')}`] : ['+', label, answers.join(', ')]);
}

await check('clause 5.1 at the boundary: 29 and 30 days are loans, 31 is a gift — stored, never refused', async () => {
  // Counted on Ulaanbaatar's calendar: a minute either side of its midnight.
  assert.equal(daysToRecord('2026-10-01', '2026-10-31T15:59:00Z'), 30);
  assert.equal(isLate('2026-10-01', '2026-10-31T15:59:00Z'), false, '30 days, at 23:59 in Ulaanbaatar: within');
  assert.equal(daysToRecord('2026-10-01', '2026-10-31T16:01:00Z'), 31);
  assert.equal(isLate('2026-10-01', '2026-10-31T16:01:00Z'), true, '00:01 the next day in Ulaanbaatar: late');
  const made = { 29: await make({ date_made: daysAgo(29) }), 30: await make({ date_made: daysAgo(30) }), 31: await make({ date_made: daysAgo(31), kind: 'loan' }) };
  assert.deepEqual([made[29].days, made[30].days, made[31].days], [29, 30, 31]);
  assert.deepEqual([made[29].late, made[30].late, made[31].late], [false, false, true], 'only the last is marked late');
  assert.deepEqual([made[29].kind, made[30].kind, made[31].kind], ['loan', 'loan', 'gift'], 'asked for a loan, stored as a gift');
  assert.equal(rows.length, 3, 'the late one is stored, not refused');
  const shown = (await list()).items as { id: string; late: boolean }[];
  assert.equal(shown.find((r) => r.id === made[31].id)?.late, true, 'and listed, marked');
  const strip = ((await list()).summary as { member_id: string; principal: number }[]).find((s) => s.member_id === B)!;
  assert.equal(strip.principal, 3_000_000, 'the late gift is not owed');
  assert.equal((await call('tok-anna', 'POST', '/api/contributions', entry({ date_made: daysAgo(-1) }))).body.error, 'date-future');
  // The way round clause 5.1 would be to say when it was recorded. A request cannot.
  const backdated = await make({ date_made: daysAgo(40), recorded_at: `${daysAgo(39)}T02:00:00.000Z` });
  assert.deepEqual([backdated.late, backdated.kind, backdated.days], [true, 'gift', 40], 'recorded_at is the Worker\'s clock, never the request\'s');
  return '23:59 vs 00:01 Ulaanbaatar time: 30 / 31 days; routes: 29 loan, 30 loan, 31 gift (201, listed, not owed); tomorrow refused; a backdated recorded_at ignored';
});

await check('the late mark is permanent: no edit clears it or makes its gift a loan', async () => {
  const late = await make({ date_made: daysAgo(45) });
  const moved = await call('tok-anna', 'POST', `/api/contributions/${late.id}`, { date_made: daysAgo(3), updated_at: late.updated_at });
  assert.deepEqual([moved.status, moved.body.error], [409, 'late-is-permanent']);
  const loan = await call('tok-anna', 'POST', `/api/contributions/${late.id}`, { kind: 'loan', updated_at: late.updated_at });
  assert.deepEqual([loan.status, loan.body.error], [409, 'late-is-gift']);
  const repaid = await call('tok-anna', 'POST', `/api/contributions/${late.id}/repay`, { amount_mnt: 1, updated_at: late.updated_at });
  assert.deepEqual([repaid.status, repaid.body.error], [409, 'gift-not-repaid']);
  const sneaky = await call('tok-anna', 'POST', `/api/contributions/${late.id}`, { what_for: 'Засвар', recorded_at: new Date().toISOString(), updated_at: late.updated_at });
  assert.equal(sneaky.status, 200, 'an ordinary edit is fine');
  assert.equal(rows[0].recorded_at, late.recorded_at, 'and recorded_at is never taken from a request');
  const sooner = await make({ date_made: daysAgo(5) });
  const later = await call('tok-anna', 'POST', `/api/contributions/${sooner.id}`, { date_made: daysAgo(60), updated_at: sooner.updated_at });
  assert.deepEqual([later.status, later.body.item?.late, later.body.item?.kind], [200, true, 'gift'], 'an edit that makes it late makes it a gift');
  return 'date back inside 30 days: 409; made a loan: 409; repaid: 409; recorded_at in a request: ignored; pushed past 30: gift';
});

await check('money is whole tugrik: a float is refused, never rounded — in the table, the API, every figure', async () => {
  const floats: unknown[] = [1.5, '1.5', '1,5', '1 500 000.00', '1500000,00', -5, 0, '0', 1e21, 'abc', '', true, null, '١٢٣', '1e6', ' '];
  for (const amount of floats) {
    const r = await call('tok-anna', 'POST', '/api/contributions', entry({ amount_mnt: amount }));
    assert.deepEqual([r.status, r.body.error], [400, 'amount'], `amount ${JSON.stringify(amount)}`);
  }
  assert.equal(rows.length, 0, 'none stored');
  const typed = await make({ amount_mnt: '1 500 000' });
  assert.equal(typed.amount_mnt, 1_500_000, 'digits in groups: read as whole tugrik');
  assert.equal(typeof rows[0].amount_mnt, 'number');
  await make({ amount_mnt: 3 });
  const one = await make({ amount_mnt: 1_000_001, member_id: C });
  await call('tok-anna', 'POST', `/api/contributions/${one.id}/repay`, { amount_mnt: 1, updated_at: one.updated_at });
  for (const amount of [0.5, '0.5', '1,0']) {
    assert.equal((await call('tok-anna', 'POST', `/api/contributions/${one.id}/repay`, { amount_mnt: amount, updated_at: rows[2].updated_at })).body.error, 'repaid', `repay ${JSON.stringify(amount)}`);
  }
  // Every number anywhere in the answers is an integer — no fraction ever leaves the Worker.
  const answer = (await call('tok-anna', 'GET', '/api/contributions')).text;
  // A JSON number right after a key — not the seconds inside a timestamp string.
  const fractions = answer.match(/":\s*-?\d+\.\d+/g);
  assert.equal(fractions, null, `a fraction in the API: ${fractions}`);
  const walk = (v: unknown): void => (typeof v === 'number' ? assert.ok(Number.isSafeInteger(v), `not whole: ${v}`) : v && typeof v === 'object' ? Object.values(v).forEach(walk) : undefined);
  walk(JSON.parse(answer));
  assert.equal(parseMnt('9007199254740992'), null, 'past what JSON carries exactly: refused');
  assert.equal(formatMnt(1_500_000), '1 500 000');
  return `${floats.length} non-integers refused (1.5, "1,5", "1 500 000.00", 1e21 …); "1 500 000" read as 1500000; every number in the API an integer`;
});

await check('× 1.5 is integer tugrik, rounded half up — to the Member — in BigInt', async () => {
  assert.deepEqual([0, 1, 2, 3, 1_000_000, 1_000_001].map(owedMnt), [0, 2, 3, 5, 1_500_000, 1_500_002]);
  assert.equal(owedMnt(6_004_799_503_160_660), 9_007_199_254_740_990, 'exact far past where a float would drift');
  assert.throws(() => owedMnt(6_004_799_503_160_661), /past what JSON carries/);
  await make({ amount_mnt: 1, member_id: A });
  await make({ amount_mnt: 3, member_id: B });
  const c = await make({ amount_mnt: 1_000_002, member_id: C });
  await call('tok-anna', 'POST', `/api/contributions/${c.id}/repay`, { amount_mnt: 1, updated_at: c.updated_at });
  await make({ amount_mnt: 999, member_id: C, kind: 'gift' });
  const strip = (await list()).summary as { member_id: string; principal: number; repaid: number; outstanding: number; owed: number }[];
  const of = (id: string) => strip.find((s) => s.member_id === id)!;
  assert.deepEqual([of(A).outstanding, of(A).owed], [1, 2]);
  assert.deepEqual([of(B).outstanding, of(B).owed], [3, 5]);
  assert.deepEqual([of(C).principal, of(C).repaid, of(C).outstanding, of(C).owed], [1_000_002, 1, 1_000_001, 1_500_002], 'a gift is not principal; partial repayment counts');
  assert.deepEqual(standings([], [A, B]).map((s) => s.owed), [0, 0], 'a Member with nothing: zeros, still a row');
  return '1 → 2, 3 → 5, 1 000 001 → 1 500 002; exact to 9 007 199 254 740 990; the strip agrees, gifts left out';
});

await check('one Telegram message per entry, to the tasks group, and none on an edit', async () => {
  const one = await make({ member_id: A, amount_mnt: 1_500_000, what_for: 'Figma, жилийн эрх' });
  await make({ member_id: B, amount_mnt: 89_000, what_for: 'Домэйн' });
  await make({ member_id: C, amount_mnt: 450_000, what_for: 'Хэвлэл', date_made: daysAgo(40) });
  assert.equal(telegram.length, 3, 'one each');
  assert.ok(telegram.every((m) => m.chat === '-200-tasks'), 'never the enquiries chat');
  assert.equal(telegram[0].text, 'Хавсралт 2: Анна 1 500 000₮ — Figma, жилийн эрх');
  assert.equal(telegram[1].text, 'Хавсралт 2: bold@anir.mn 89 000₮ — Домэйн', 'no display name: the email');
  assert.ok(rows.every((r) => r.notified_at), 'each marked delivered');
  await call('tok-anna', 'POST', `/api/contributions/${one.id}`, { amount_mnt: 1_600_000, updated_at: rows[0].updated_at });
  await call('tok-anna', 'POST', `/api/contributions/${one.id}/repay`, { amount_mnt: 100_000, updated_at: rows[0].updated_at });
  assert.equal(telegram.length, 3, 'an edit and a repayment send nothing');
  telegramDown = true;
  const unsent = await call('tok-anna', 'POST', '/api/contributions', entry());
  assert.equal(unsent.status, 201, 'Telegram failing never fails the entry');
  assert.equal(unsent.body.item?.notified_at, null, 'and the row says it did not go');
  return '3 entries → 3 messages to -200-tasks, «Хавсралт 2: Анна 1 500 000₮ — …»; edit, repay: none; Telegram 500: stored, notified_at null';
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
  await edit({ member_id: A }, 'tok-anna');
  const r = await call('tok-anna', 'POST', `/api/contributions/${e.id}/repay`, { amount_mnt: 20_000, updated_at: e.updated_at });
  assert.equal(r.status, 200);
  assert.deepEqual(
    events.map((x) => [x.field, x.from_value, x.to_value, x.by]),
    [
      ['amount_mnt', '100000', '120000', C],
      ['date_made', daysAgo(2), daysAgo(4), C],
      ['member_id', B, A, A],
      ['repaid_mnt', '0', '20000', A],
    ]
  );
  const shown = (await list()).events as { field: string; who: string }[];
  assert.deepEqual(shown.map((x) => x.who), ['Сараа', 'Сараа', 'Анна', 'Анна'], 'by name');
  return 'amount, date, member, repayment: one event each, who and from → to; what_for, note, receipt: none';
});

await check('a stale write is a conflict, never an overwrite', async () => {
  const e = await make();
  const first = await call('tok-anna', 'POST', `/api/contributions/${e.id}`, { amount_mnt: 2_000_000, updated_at: e.updated_at });
  assert.equal(first.status, 200);
  for (const [path, body] of [[`/api/contributions/${e.id}`, { amount_mnt: 9 }], [`/api/contributions/${e.id}/repay`, { amount_mnt: 9 }]] as const) {
    assert.deepEqual((await call('tok-bold', 'POST', path, { ...body, updated_at: e.updated_at })).body.error, 'conflict');
    assert.equal((await call('tok-bold', 'POST', path, body)).body.error, 'no-version');
  }
  assert.equal(rows[0].amount_mnt, 2_000_000);
  return 'edit and repay with the version read before another save: 409 conflict; no version: 400';
});

await check('Members only: the picker\'s people are editors, and nobody else\'s money is a loan', async () => {
  assert.equal((await call('tok-anna', 'POST', '/api/contributions', entry({ member_id: X }))).body.error, 'member', 'not an editor');
  assert.equal((await call('tok-anna', 'POST', '/api/contributions', entry({ member_id: 'xuji' }))).body.error, 'member');
  const e = await make({ member_id: C });
  removed.add(C);
  const people = (await list()).people as { id: string }[];
  assert.ok(!people.some((p) => p.id === C), 'someone no longer an editor is not offered');
  const strip = (await list()).summary as { member_id: string; name: string; principal: number }[];
  assert.deepEqual(strip.find((s) => s.member_id === C), { member_id: C, name: 'Хасагдсан хэрэглэгч', principal: 1_500_000, repaid: 0, outstanding: 1_500_000, owed: 2_250_000 }, 'their money stays on the strip');
  const fixed = await call('tok-anna', 'POST', `/api/contributions/${e.id}`, { what_for: 'Засвар', updated_at: e.updated_at });
  assert.equal(fixed.status, 200, 'their entry can still be corrected');
  assert.equal((await call('tok-anna', 'POST', '/api/contributions', entry({ member_id: C }))).body.error, 'member', 'but no new one is entered for them');
  return 'a non-editor, a name: 400 member; a departed Member: off the picker, on the strip as «Хасагдсан хэрэглэгч», old entry editable';
});

await check('repayment against a row: partial, never past the principal, never on a gift', async () => {
  let e = await make({ amount_mnt: 1_000_000 });
  for (const amount of [300_000, 200_000]) {
    const r = await call('tok-anna', 'POST', `/api/contributions/${e.id}/repay`, { amount_mnt: amount, updated_at: e.updated_at });
    assert.equal(r.status, 200);
    e = r.body.item!;
  }
  assert.equal(e.repaid_mnt, 500_000, 'two partial repayments (5.2(d))');
  assert.equal((await call('tok-anna', 'POST', `/api/contributions/${e.id}/repay`, { amount_mnt: 500_001, updated_at: e.updated_at })).body.error, 'repaid-over');
  assert.equal((await call('tok-anna', 'POST', `/api/contributions/${e.id}`, { repaid_mnt: 1_000_001, updated_at: e.updated_at })).body.error, 'repaid-over');
  const gift = await make({ kind: 'gift' });
  assert.equal((await call('tok-anna', 'POST', `/api/contributions/${gift.id}/repay`, { amount_mnt: 1, updated_at: gift.updated_at })).body.error, 'gift-not-repaid');
  assert.equal((await call('tok-anna', 'POST', `/api/contributions/${e.id}`, { kind: 'gift', updated_at: e.updated_at })).body.error, 'gift-not-repaid', 'a repaid loan cannot become a gift');
  return '300 000 + 200 000 = 500 000 repaid; past the principal: 400; on a gift: 409; a repaid loan made a gift: 400';
});

await check('the list is newest money first; the member filter narrows the list, never the strip', async () => {
  await make({ date_made: daysAgo(10), what_for: 'Хуучин', member_id: A });
  await make({ date_made: daysAgo(1), what_for: 'Шинэ', member_id: B });
  await make({ date_made: daysAgo(5), what_for: 'Дунд', member_id: A });
  const all = await list();
  assert.deepEqual((all.items as { what_for: string }[]).map((x) => x.what_for), ['Шинэ', 'Дунд', 'Хуучин']);
  assert.deepEqual((all.summary as { member_id: string }[]).map((s) => s.member_id), [A, B, C], 'every Member, nothing yet or not');
  const anna = await list(`?member=${A}`);
  assert.deepEqual((anna.items as { what_for: string }[]).map((x) => x.what_for), ['Дунд', 'Хуучин']);
  assert.equal((anna.summary as unknown[]).length, 3, 'the strip still shows all of them');
  return 'by date made, newest first; ?member= narrows the rows to theirs; the strip keeps all three Members';
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
