/**
 * Exercises what the Worker's schedule watches (worker/watch.ts) without
 * Wrangler, Supabase or Telegram: a stand-in table that counts as PostgREST
 * does, a KV that remembers, and a Telegram that records what it was sent.
 *
 * What this proves: flagged enquiries reach Telegram as at most one message
 * an hour, exactly «Шалгах: N шинэ», counting only those since the last;
 * a flood is told once a day when stored enquiries pass 50 — buffered ones
 * counted too — and the day is Ulaanbaatar's; one watch failing never stops
 * the other; an enquiry stuck in the buffer over an hour raises a
 * drain-stuck alert with Supabase's own reason and one Telegram line, clears
 * when the buffer empties, and is told even with no database to write to.
 *
 *   node scripts/test-watch.ts
 */
import assert from 'node:assert/strict';

import { admin as t } from '../src/content/admin.ts';
import { digest, flood, stuck, ubDay, watch, FLOOD_AT } from '../worker/watch.ts';

interface Row {
  created_at: string;
  status: string;
  unrecognised: string[];
}
let rows: Row[] = [];
let telegram: string[] = [];
let supabaseDown = false;
/** What reached worker_alerts: a POST raises or refreshes a row, a DELETE clears it. */
let alertCalls: Array<{ method: string; kind: string; detail?: string }> = [];
/** What Telegram answers: 200 takes the message, anything else does not. */
let telegramStatus = 200;

const kv = () => {
  const store = new Map<string, string>();
  return {
    store,
    get: async (key: string) => store.get(key) ?? null,
    put: async (key: string, value: string) => void store.set(key, value),
    delete: async (key: string) => void store.delete(key),
    list: async ({ prefix }: { prefix: string }) => ({
      keys: [...store.keys()].filter((k) => k.startsWith(prefix)).sort().map((name) => ({ name })),
      list_complete: true,
    }),
  };
};

const stub = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(String(input));
  if (url.hostname === 'api.telegram.org') {
    if (telegramStatus !== 200) return Response.json({ ok: false }, { status: telegramStatus });
    telegram.push(JSON.parse(String(init?.body)).text);
    return Response.json({ ok: true });
  }
  if (url.pathname === '/rest/v1/worker_alerts') {
    if (supabaseDown) return new Response('down', { status: 503 });
    const method = init?.method ?? 'GET';
    if (method === 'DELETE') alertCalls.push({ method, kind: (url.searchParams.get('kind') ?? '').replace(/^eq./, '') });
    else alertCalls.push({ method, ...(JSON.parse(String(init?.body)) as { kind: string; detail: string }) });
    return new Response('', { status: 201 });
  }
  if (url.pathname === '/rest/v1/enquiries') {
    if (supabaseDown) return new Response('down', { status: 503 });
    assert.equal((init?.headers as Record<string, string>).Prefer, 'count=exact', 'counted, not fetched');
    const p = url.searchParams;
    const gt = p.get('created_at')?.startsWith('gt.') ? Date.parse(p.get('created_at')!.slice(3)) : null;
    const gte = p.get('created_at')?.startsWith('gte.') ? Date.parse(p.get('created_at')!.slice(4)) : null;
    const flaggedOnly = p.get('unrecognised') === 'neq.{}';
    const n = rows.filter(
      (r) =>
        (gt === null || Date.parse(r.created_at) > gt) &&
        (gte === null || Date.parse(r.created_at) >= gte) &&
        (!flaggedOnly || (r.status === 'new' && r.unrecognised.length > 0))
    ).length;
    return new Response('[]', { headers: { 'Content-Range': n ? `0-0/${n}` : '*/0' } });
  }
  throw new Error(`unexpected fetch: ${url}`);
}) as typeof fetch;
globalThis.fetch = stub;

const env = () => ({
  SUPABASE_URL: 'https://stub.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-key',
  TELEGRAM_BOT_TOKEN: 'bot',
  TELEGRAM_CHAT_ID: '-100',
  ENQUIRY_BUFFER: kv(),
});
const at = (iso: string) => new Date(iso);
const enquiry = (iso: string, flagged: boolean, status = 'new'): Row => ({ created_at: iso, status, unrecognised: flagged ? ['contact'] : [] });

const results: Array<[string, string]> = [];
let failures = 0;
async function check(label: string, run: () => Promise<string> | string) {
  rows = [];
  telegram = [];
  alertCalls = [];
  supabaseDown = false;
  telegramStatus = 200;
  try {
    results.push([label, await run()]);
  } catch (error) {
    failures += 1;
    results.push([label, `FAILED — ${(error as Error).message}`]);
  }
}

// The schedule's logs belong in the Worker's logs.
const quiet = { log: console.log, error: console.error, warn: console.warn };
console.log = console.error = console.warn = () => {};

// ------------------------------------------------------------------ digest

await check('flagged enquiries: one message, «Шалгах: N шинэ», nothing else', async () => {
  const e = env();
  rows = [enquiry('2026-11-07T02:10:00Z', true), enquiry('2026-11-07T02:20:00Z', true), enquiry('2026-11-07T02:30:00Z', true), enquiry('2026-11-07T02:31:00Z', false)];
  await digest(e, at('2026-11-07T02:45:00Z'), stub);
  assert.deepEqual(telegram, ['Шалгах: 3 шинэ']);
  return telegram[0];
});

await check('at most one an hour, then only those since the last', async () => {
  const e = env();
  rows = [enquiry('2026-11-07T02:10:00Z', true)];
  await digest(e, at('2026-11-07T02:15:00Z'), stub); // 1
  rows.push(enquiry('2026-11-07T02:20:00Z', true), enquiry('2026-11-07T02:40:00Z', true));
  await digest(e, at('2026-11-07T02:30:00Z'), stub); // within the hour: nothing
  await digest(e, at('2026-11-07T03:00:00Z'), stub); // still within it: nothing
  await digest(e, at('2026-11-07T03:16:00Z'), stub); // due: the 2 since 02:15
  assert.deepEqual(telegram, ['Шалгах: 1 шинэ', 'Шалгах: 2 шинэ']);
  return telegram.join(' · then · ');
});

await check('nothing flagged: no message, and the next one may go at once', async () => {
  const e = env();
  rows = [enquiry('2026-11-07T02:10:00Z', false)];
  await digest(e, at('2026-11-07T02:15:00Z'), stub);
  rows.push(enquiry('2026-11-07T02:20:00Z', true));
  await digest(e, at('2026-11-07T02:30:00Z'), stub);
  assert.deepEqual(telegram, ['Шалгах: 1 шинэ']);
  return 'silent, then the first flagged one told on the next run';
});

await check('a flagged enquiry already read is not counted as new', async () => {
  const e = env();
  rows = [enquiry('2026-11-07T02:10:00Z', true, 'read'), enquiry('2026-11-07T02:12:00Z', true)];
  await digest(e, at('2026-11-07T02:15:00Z'), stub);
  assert.deepEqual(telegram, ['Шалгах: 1 шинэ']);
  return 'only the new one';
});

// ------------------------------------------------------------------- flood

await check('the day\'s count is Ulaanbaatar\'s', () => {
  const { day, start } = ubDay(at('2026-11-06T16:30:00Z'));
  assert.equal(day, '2026-11-07');
  assert.equal(start.toISOString(), '2026-11-06T16:00:00.000Z');
  return '16:30 UTC is 00:30 the next day in UB; the day began 16:00 UTC';
});

await check(`${FLOOD_AT} stored today is not a flood; ${FLOOD_AT + 1} is — told once`, async () => {
  const e = env();
  rows = Array.from({ length: FLOOD_AT }, (_, i) => enquiry(new Date(Date.parse('2026-11-07T00:00:00Z') + i * 60_000).toISOString(), i % 2 === 0));
  await flood(e, at('2026-11-07T02:00:00Z'), stub);
  assert.equal(telegram.length, 0);
  rows.push(enquiry('2026-11-07T01:59:00Z', false));
  await flood(e, at('2026-11-07T02:15:00Z'), stub);
  rows.push(...rows.slice(0, 20));
  await flood(e, at('2026-11-07T02:30:00Z'), stub);
  assert.equal(telegram.length, 1, 'not again that day');
  assert.match(telegram[0], /^Өнөөдөр 51 хүсэлт/);
  return telegram[0].slice(0, 60);
});

await check('a new day may tell again; yesterday\'s enquiries do not count', async () => {
  const e = env();
  rows = Array.from({ length: 60 }, () => enquiry('2026-11-07T01:00:00Z', true));
  await flood(e, at('2026-11-07T02:00:00Z'), stub);
  await flood(e, at('2026-11-07T17:00:00Z'), stub); // 01:00 the 8th in UB: none yet today
  rows.push(...Array.from({ length: 55 }, () => enquiry('2026-11-07T17:30:00Z', true)));
  await flood(e, at('2026-11-07T18:00:00Z'), stub);
  assert.equal(telegram.length, 2);
  return 'once on the 7th, once on the 8th';
});

await check('buffered enquiries count too — a flood while Supabase sleeps', async () => {
  const e = env();
  rows = Array.from({ length: 40 }, () => enquiry('2026-11-07T01:00:00Z', false));
  for (let i = 0; i < 15; i++) await e.ENQUIRY_BUFFER.put(`enquiry:2026-11-07T01:${String(10 + i).padStart(2, '0')}:00.000Z-abcd${i}ef`, '{}');
  await e.ENQUIRY_BUFFER.put('enquiry:2026-11-06T01:00:00.000Z-old00000', '{}'); // yesterday's: not today's
  await flood(e, at('2026-11-07T02:00:00Z'), stub);
  assert.match(telegram[0] ?? '', /^Өнөөдөр 55 хүсэлт/);
  return '40 stored + 15 buffered today = 55: told';
});

// ------------------------------------------------------------ stuck enquiry

const twoHoursBefore = (iso: string) => new Date(Date.parse(iso) - 2 * 60 * 60 * 1000).toISOString();
const NOW = '2026-11-07T06:00:00.000Z';
const refusal = "Supabase answered 400 PGRST204: Could not find the 'diagnostics' column of 'enquiries' in the schema cache";

await check("an enquiry stuck over an hour: an alert with Supabase's reason, one Telegram line", async () => {
  const e = env();
  await e.ENQUIRY_BUFFER.put(`enquiry:${twoHoursBefore(NOW)}-abcd1234`, '{}');
  await e.ENQUIRY_BUFFER.put(`enquiry:${NOW}-fresh000`, '{}'); // just arrived: not stuck yet
  const said = await stuck(e, at(NOW), { buffered: 2, written: 0, kept: 2, why: refusal }, stub);
  assert.match(said, /^told/);
  assert.deepEqual(alertCalls.map((c) => [c.method, c.kind]), [['POST', 'drain-stuck']]);
  assert.match(alertCalls[0].detail ?? '', /^1 enquiries waiting in the buffer over an hour, the oldest since .*PGRST204/);
  assert.deepEqual(telegram, [t.notify.stuck.replace('{n}', '1')]);
  // Fifteen minutes on, still stuck: the row's last_at refreshed for the admin, Telegram quiet.
  const again = await stuck(e, at('2026-11-07T06:15:00.000Z'), { buffered: 2, written: 0, kept: 2, why: refusal }, stub);
  assert.match(again, /^alert refreshed/);
  assert.equal(alertCalls.length, 2);
  assert.equal(telegram.length, 1, 'one line, not one every 15 minutes');
  return 'worker_alerts drain-stuck with the refusal; «' + telegram[0].slice(0, 32) + '…» once; refreshed, not re-sent';
});

await check('the buffer empties: the alert is cleared, and the next one is told afresh', async () => {
  const e = env();
  const key = `enquiry:${twoHoursBefore(NOW)}-abcd1234`;
  await e.ENQUIRY_BUFFER.put(key, '{}');
  await stuck(e, at(NOW), { buffered: 1, written: 0, kept: 1, why: refusal }, stub);
  await e.ENQUIRY_BUFFER.delete(key); // the drain wrote it
  const over = await stuck(e, at('2026-11-07T06:15:00.000Z'), { buffered: 1, written: 1, kept: 0 }, stub);
  assert.match(over, /^cleared/);
  assert.deepEqual(alertCalls.at(-1), { method: 'DELETE', kind: 'drain-stuck' });
  await e.ENQUIRY_BUFFER.put(`enquiry:${twoHoursBefore('2026-11-08T06:00:00.000Z')}-beef0000`, '{}');
  await stuck(e, at('2026-11-08T06:00:00.000Z'), { buffered: 1, written: 0, kept: 1, why: refusal }, stub);
  assert.equal(telegram.length, 2, 'a new episode is told');
  return 'DELETE drain-stuck when nothing waits; a later one told again';
});

await check('under an hour in the buffer is not stuck', async () => {
  const e = env();
  await e.ENQUIRY_BUFFER.put(`enquiry:${new Date(Date.parse(NOW) - 59 * 60 * 1000).toISOString()}-abcd1234`, '{}');
  const said = await stuck(e, at(NOW), { buffered: 1, written: 0, kept: 1, why: refusal }, stub);
  assert.equal(alertCalls.length + telegram.length, 0);
  return said;
});

await check('a paused project: the alert cannot be written, Telegram still says it', async () => {
  const e = env();
  supabaseDown = true;
  await e.ENQUIRY_BUFFER.put(`enquiry:${twoHoursBefore(NOW)}-abcd1234`, '{}');
  const said = await watch(e, at(NOW), stub, { buffered: 1, written: 0, kept: 1, why: 'Supabase answered 540' });
  assert.match(said.stuck, /^told/);
  assert.equal(telegram.length, 1);
  const keysGone = await watch({ ...env(), SUPABASE_URL: '', ENQUIRY_BUFFER: e.ENQUIRY_BUFFER }, at(NOW), stub);
  assert.match(keysGone.digest, /^skipped/);
  assert.match(keysGone.stuck, /^alert refreshed/, 'the stuck watch runs without a database');
  return 'worker_alerts down, Telegram told; no database at all: digest skipped, stuck still watched';
});

// ------------------------------------------------- no channel, as production

/*
  Production ran for weeks with TELEGRAM_BOT_TOKEN unset. tell() then sends
  nothing and says so; it never throws. What must not happen is a watch
  remembering "already sent" for a message nobody got — the flood marked
  sent for the day, the stuck episode marked told — so each is marked only
  once a channel took it, and a refused send (Telegram answering 500) is the
  same as none.
*/
await check('no Telegram token: nothing throws, nothing is marked sent, and it is told once there is', async () => {
  const e = env();
  const { TELEGRAM_BOT_TOKEN: _token, ...noToken } = e;
  rows = [
    enquiry('2026-11-07T05:45:00Z', true),
    ...Array.from({ length: FLOOD_AT + 1 }, () => enquiry('2026-11-07T01:00:00Z', false)),
  ];
  await e.ENQUIRY_BUFFER.put(`enquiry:${twoHoursBefore(NOW)}-abcd1234`, '{}');
  const silent = await watch(noToken, at(NOW), stub, { buffered: 1, written: 0, kept: 1, why: refusal });
  assert.match(silent.digest, /^not sent/);
  assert.match(silent.flood, /^not sent/);
  assert.match(silent.stuck, /^alert raised, not told/);
  assert.deepEqual([...e.ENQUIRY_BUFFER.store.keys()].filter((key) => key.startsWith('notify:')), [], 'no "already sent" for what was not');
  assert.equal(telegram.length, 0);
  // Telegram down, not unset: the same — not marked.
  telegramStatus = 500;
  const refused = await watch(e, at('2026-11-07T06:15:00Z'), stub, { buffered: 1, written: 0, kept: 1, why: refusal });
  assert.match(refused.digest, /^not sent/);
  assert.deepEqual([...e.ENQUIRY_BUFFER.store.keys()].filter((key) => key.startsWith('notify:')), []);
  // The channel back: all three told, on the next run.
  telegramStatus = 200;
  const told = await watch(e, at('2026-11-07T06:30:00Z'), stub, { buffered: 1, written: 0, kept: 1, why: refusal });
  assert.deepEqual([told.digest, told.flood, told.stuck].map((said) => said.split(' ')[0]), ['sent', 'sent', 'told']);
  assert.equal(telegram.length, 3);
  // An episode no channel heard still raised the row — and the row still clears.
  const quiet = env();
  await quiet.ENQUIRY_BUFFER.put(`enquiry:${twoHoursBefore(NOW)}-feed0000`, '{}');
  const { TELEGRAM_BOT_TOKEN: _t, ...quietNoToken } = quiet;
  await stuck(quietNoToken, at(NOW), { buffered: 1, written: 0, kept: 1, why: refusal }, stub);
  await quiet.ENQUIRY_BUFFER.delete(`enquiry:${twoHoursBefore(NOW)}-feed0000`);
  assert.match(await stuck(quietNoToken, at('2026-11-07T06:15:00Z'), { buffered: 0, written: 0, kept: 0 }, stub), /^cleared/);
  assert.deepEqual(alertCalls.at(-1), { method: 'DELETE', kind: 'drain-stuck' });
  return 'unset or refused: "not sent", no mark; then digest, flood and stuck all told; an unheard episode\'s alert still cleared';
});

// ------------------------------------------------------------------ watch

await check('one watch failing never stops the other, and nothing throws', async () => {
  const e = env();
  supabaseDown = true;
  const said = await watch(e, at('2026-11-07T02:00:00Z'), stub);
  assert.match(said.digest, /^failed/);
  assert.match(said.flood, /^failed/);
  const bare = await watch({ ...e, SUPABASE_URL: '' }, at('2026-11-07T02:00:00Z'), stub);
  assert.match(bare.digest, /^skipped/);
  return 'Supabase down: both say failed, neither throws; no database: skipped';
});

Object.assign(console, quiet);
const width = Math.max(...results.map(([label]) => label.length));
console.log('');
for (const [label, detail] of results) console.log(`  ${detail.startsWith('FAILED') ? 'x' : '+'} ${label.padEnd(width)}  ${detail}`);
console.log(`\n  ${results.length - failures}/${results.length} passed\n`);
process.exit(failures ? 1 : 0);
