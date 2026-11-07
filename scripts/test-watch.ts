/**
 * Exercises what the Worker's schedule watches (worker/watch.ts) without
 * Wrangler, Supabase or Telegram: a stand-in table that counts as PostgREST
 * does, a KV that remembers, and a Telegram that records what it was sent.
 *
 * What this proves: flagged enquiries reach Telegram as at most one message
 * an hour, exactly «Шалгах: N шинэ», counting only those since the last;
 * a flood is told once a day when stored enquiries pass 50 — buffered ones
 * counted too — and the day is Ulaanbaatar's; one watch failing never stops
 * the other.
 *
 *   node scripts/test-watch.ts
 */
import assert from 'node:assert/strict';

import { digest, flood, ubDay, watch, FLOOD_AT } from '../worker/watch.ts';

interface Row {
  created_at: string;
  status: string;
  unrecognised: string[];
}
let rows: Row[] = [];
let telegram: string[] = [];
let supabaseDown = false;

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
    telegram.push(JSON.parse(String(init?.body)).text);
    return Response.json({ ok: true });
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
  supabaseDown = false;
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
