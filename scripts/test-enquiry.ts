/**
 * Exercises the real enquiry Function without Wrangler or a live Supabase.
 *
 * It imports worker/enquiry.ts unchanged and calls onRequestPost with
 * constructed Requests, stubbing global fetch to stand in for Supabase and the
 * notification channels, and Maps to stand in for the KV bindings. What this
 * proves: validation, the honeypot, rate limiting, content negotiation, the
 * exact row the handler would send to Supabase, the KV buffer and its drain,
 * and the notification. What it does not prove: that Supabase accepts that
 * row — for that the migration has to be applied and the keys set.
 *
 *   node scripts/test-enquiry.ts
 */
import assert from 'node:assert/strict';

import { drain, onRequestPost } from '../worker/enquiry.ts';

type Row = Record<string, unknown>;

let captured: Row[] = [];
let preferHeaders: string[] = [];
let supabaseStatus = 201;
let notified: Array<{ channel: string; text: string }> = [];
let notifyStatus = 200;

const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: any, init: any) => {
  const url = String(input);
  if (url.includes('/rest/v1/enquiries')) {
    if (supabaseStatus < 300) captured.push(JSON.parse(String(init.body)));
    preferHeaders.push(init.headers?.Prefer ?? '');
    return new Response('', { status: supabaseStatus });
  }
  if (url.startsWith('https://api.telegram.org/')) {
    notified.push({ channel: 'telegram', text: JSON.parse(String(init.body)).text });
    return new Response('{}', { status: notifyStatus });
  }
  if (url.startsWith('https://api.resend.com/')) {
    const body = JSON.parse(String(init.body));
    notified.push({ channel: 'email', text: `${body.subject}\n${body.text}` });
    return new Response('{}', { status: notifyStatus });
  }
  return realFetch(input, init);
}) as typeof fetch;

/** Minimal stand-in for a KV namespace. */
function kv() {
  const store = new Map<string, string>();
  return {
    store,
    get: async (key: string) => store.get(key) ?? null,
    put: async (key: string, value: string) => void store.set(key, value),
    delete: async (key: string) => void store.delete(key),
    list: async ({ prefix }: { prefix: string }) => ({
      keys: [...store.keys()].filter((key) => key.startsWith(prefix)).sort().map((name) => ({ name })),
      list_complete: true,
    }),
  };
}

const env = () => ({
  SUPABASE_URL: 'https://stub.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'stub-service-key',
  RATE_LIMIT: kv(),
  ENQUIRY_BUFFER: kv(),
});

// The handler's log lines belong in the Worker's logs, not this report.
const quiet = { warn: console.warn, log: console.log, error: console.error };
const isHandlerLog = (args: unknown[]) => String(args[0]).startsWith('enquiry ');
console.warn = (...args: unknown[]) => void (isHandlerLog(args) || quiet.warn(...args));
console.error = (...args: unknown[]) => void (isHandlerLog(args) || quiet.error(...args));
console.log = (...args: unknown[]) => void (isHandlerLog(args) || quiet.log(...args));

const valid = {
  service: 'web',
  budget: '1-3m',
  timing: 'this-month',
  name: 'Бат-Эрдэнэ',
  contact: 'hello@example.com',
  message: 'Шинэ сайт хэрэгтэй байна.',
};

function post(body: Record<string, string>, opts: { json?: boolean; ip?: string } = {}) {
  const headers: Record<string, string> = {
    'CF-Connecting-IP': opts.ip ?? '203.0.113.7',
    'User-Agent': 'test-harness/1.0',
  };
  let payload: string | FormData;
  if (opts.json) {
    headers['Content-Type'] = 'application/json';
    headers['Accept'] = 'application/json';
    payload = JSON.stringify(body);
  } else {
    const data = new FormData();
    for (const [k, v] of Object.entries(body)) data.append(k, v);
    payload = data;
  }
  return new Request('https://aniragency.mn/api/enquiry', { method: 'POST', headers, body: payload });
}

const results: Array<[string, string]> = [];
let failures = 0;

async function check(label: string, run: () => Promise<string>) {
  try {
    results.push([label, await run()]);
  } catch (error) {
    failures += 1;
    results.push([label, `FAILED — ${(error as Error).message}`]);
  }
}

// ---------------------------------------------------------------- the cases

await check('valid submission, fetch path (JSON)', async () => {
  captured = [];
  const environment = env();
  const response = await onRequestPost({ request: post(valid, { json: true }), env: environment });
  const body = (await response.json()) as { ok: boolean; message: string };

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(response.headers.get('Content-Type'), 'application/json; charset=utf-8');
  assert.equal(captured.length, 1, 'expected exactly one Supabase insert');

  const row = captured[0];
  assert.deepEqual(Object.keys(row).sort(), [
    'budget', 'contact', 'message', 'name', 'service', 'timing', 'user_agent',
  ]);
  assert.equal(row.name, 'Бат-Эрдэнэ');
  assert.equal(row.user_agent, 'test-harness/1.0');
  return `200, ok:true, 1 row inserted — ${JSON.stringify(row.name)} / ${row.service} / ${row.budget}`;
});

await check('valid submission, no-JS path (HTML)', async () => {
  captured = [];
  const response = await onRequestPost({ request: post(valid), env: env() });
  const text = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get('Content-Type') ?? '', /text\/html/);
  assert.match(text, /<!doctype html>/i);
  assert.match(text, /lang="mn"/);
  assert.equal(captured.length, 1);
  return `200, HTML page returned, 1 row inserted`;
});

await check('missing name is rejected', async () => {
  captured = [];
  const response = await onRequestPost({
    request: post({ ...valid, name: '   ' }, { json: true }),
    env: env(),
  });
  const body = (await response.json()) as { ok: boolean; message: string };
  assert.equal(response.status, 422);
  assert.equal(body.ok, false);
  assert.equal(captured.length, 0, 'nothing may be written on a rejected payload');
  return `422, nothing written — "${body.message.slice(0, 46)}…"`;
});

await check('unparseable contact is rejected', async () => {
  captured = [];
  const response = await onRequestPost({
    request: post({ ...valid, contact: 'not-a-contact' }, { json: true }),
    env: env(),
  });
  assert.equal(response.status, 422);
  assert.equal(captured.length, 0);
  return '422, nothing written';
});

await check('a Mongolian phone number is accepted as contact', async () => {
  captured = [];
  const response = await onRequestPost({
    request: post({ ...valid, contact: '9911 2233' }, { json: true }),
    env: env(),
  });
  assert.equal(response.status, 200);
  assert.equal(captured.length, 1);
  return '200, accepted "9911 2233"';
});

await check('a forged chip value is rejected', async () => {
  captured = [];
  const response = await onRequestPost({
    request: post({ ...valid, budget: 'free-please' }, { json: true }),
    env: env(),
  });
  assert.equal(response.status, 422);
  assert.equal(captured.length, 0);
  return '422, nothing written';
});

await check('honeypot: answers success but stores nothing', async () => {
  captured = [];
  const response = await onRequestPost({
    request: post({ ...valid, website: 'http://spam.example' }, { json: true }),
    env: env(),
  });
  const body = (await response.json()) as { ok: boolean };
  assert.equal(response.status, 200);
  assert.equal(body.ok, true, 'a bot should not learn it was caught');
  assert.equal(captured.length, 0, 'the row must not be written');
  return '200 ok:true to the bot, 0 rows written';
});

await check('rate limit trips on the 6th request from one IP', async () => {
  captured = [];
  const environment = env();
  const codes: number[] = [];
  for (let i = 0; i < 6; i += 1) {
    const response = await onRequestPost({
      request: post(valid, { json: true, ip: '198.51.100.4' }),
      env: environment,
    });
    codes.push(response.status);
  }
  assert.deepEqual(codes, [200, 200, 200, 200, 200, 429]);
  assert.equal(captured.length, 5, 'the blocked request must not be written');
  return `codes ${codes.join(', ')} — 5 stored, 6th refused`;
});

await check('a different IP is unaffected by that limit', async () => {
  const environment = env();
  for (let i = 0; i < 5; i += 1) {
    await onRequestPost({ request: post(valid, { json: true, ip: '198.51.100.4' }), env: environment });
  }
  const response = await onRequestPost({
    request: post(valid, { json: true, ip: '198.51.100.9' }),
    env: environment,
  });
  assert.equal(response.status, 200);
  return '200 for the second IP';
});

await check('rate limiting fails open when KV is not bound', async () => {
  const environment = {
    SUPABASE_URL: 'https://stub.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'stub-service-key',
  };
  const codes: number[] = [];
  for (let i = 0; i < 7; i += 1) {
    const response = await onRequestPost({ request: post(valid, { json: true }), env: environment });
    codes.push(response.status);
  }
  assert.ok(codes.every((code) => code === 200));
  return 'all 7 accepted — a missing binding must not break the form';
});

await check('a Supabase failure buffers the enquiry; the visitor is told it arrived', async () => {
  supabaseStatus = 500;
  const environment = env();
  const response = await onRequestPost({ request: post(valid, { json: true }), env: environment });
  const body = (await response.json()) as { ok: boolean };
  supabaseStatus = 201;
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  const keys = [...environment.ENQUIRY_BUFFER.store.keys()];
  assert.equal(keys.length, 1);
  assert.match(keys[0], /^enquiry:\d{4}-\d\d-\d\dT[\d:.]+Z-[0-9a-f]{8}$/);
  const entry = JSON.parse(environment.ENQUIRY_BUFFER.store.get(keys[0])!);
  assert.equal(entry.name, valid.name);
  assert.ok(entry.id && entry.created_at, 'a buffered entry carries its own id and arrival time');
  return `200 ok:true, 1 entry in KV — ${keys[0].slice(0, 32)}…`;
});

await check('missing Supabase config buffers rather than erroring', async () => {
  const environment = { ...env(), SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '' };
  const response = await onRequestPost({ request: post(valid, { json: true }), env: environment });
  assert.equal(response.status, 200);
  assert.equal(environment.ENQUIRY_BUFFER.store.size, 1);
  return '200, buffered';
});

await check('if Supabase and the buffer both fail, the visitor is told the truth', async () => {
  supabaseStatus = 500;
  const environment = { ...env(), ENQUIRY_BUFFER: undefined };
  const response = await onRequestPost({ request: post(valid, { json: true }), env: environment });
  const body = (await response.json()) as { ok: boolean };
  supabaseStatus = 201;
  assert.equal(response.status, 502);
  assert.equal(body.ok, false);
  return '502, ok:false — nothing was kept, so nothing is claimed';
});

await check('a rejected payload is never buffered', async () => {
  supabaseStatus = 500;
  const environment = env();
  await onRequestPost({ request: post({ ...valid, budget: 'free-please' }, { json: true }), env: environment });
  supabaseStatus = 201;
  assert.equal(environment.ENQUIRY_BUFFER.store.size, 0);
  return '422, KV empty';
});

await check('the drain writes buffered enquiries and deletes them', async () => {
  supabaseStatus = 500;
  const environment = env();
  for (const ip of ['198.51.100.21', '198.51.100.22']) {
    await onRequestPost({ request: post(valid, { json: true, ip }), env: environment });
  }
  supabaseStatus = 201;
  captured = [];
  preferHeaders = [];
  const result = await drain(environment);
  assert.deepEqual(result, { buffered: 2, written: 2, kept: 0 });
  assert.equal(environment.ENQUIRY_BUFFER.store.size, 0);
  assert.equal(captured.length, 2);
  assert.ok(captured.every((row) => row.id && row.created_at), 'drained rows keep their id and arrival time');
  assert.ok(preferHeaders.every((prefer) => prefer.includes('resolution=ignore-duplicates')));
  return '2 written with their own id and created_at, KV empty';
});

await check('the drain keeps what it cannot write, for the next run', async () => {
  supabaseStatus = 500;
  const environment = env();
  await onRequestPost({ request: post(valid, { json: true }), env: environment });
  const result = await drain(environment);
  supabaseStatus = 201;
  assert.deepEqual(result, { buffered: 1, written: 0, kept: 1 });
  assert.equal(environment.ENQUIRY_BUFFER.store.size, 1);
  return '0 written, 1 kept';
});

await check('a live enquiry never uses the drain\'s duplicate-skipping', async () => {
  preferHeaders = [];
  await onRequestPost({ request: post(valid, { json: true, ip: '198.51.100.30' }), env: env() });
  assert.deepEqual(preferHeaders, ['return=minimal']);
  return 'Prefer: return=minimal';
});

const notifying = () => ({
  ...env(),
  TELEGRAM_BOT_TOKEN: 'stub',
  TELEGRAM_CHAT_ID: '-100',
  RESEND_API_KEY: 'stub',
  NOTIFY_EMAIL: 'team@example.com',
});

await check('every enquiry notifies the team, saying which path it took', async () => {
  notified = [];
  await onRequestPost({ request: post(valid, { json: true, ip: '198.51.100.40' }), env: notifying() });
  supabaseStatus = 500;
  await onRequestPost({ request: post(valid, { json: true, ip: '198.51.100.41' }), env: notifying() });
  supabaseStatus = 201;
  assert.equal(notified.length, 4, 'two enquiries, two channels each');
  assert.ok(notified.slice(0, 2).every((n) => n.text.includes('Stored in Supabase.')));
  assert.ok(notified.slice(2).every((n) => n.text.includes('BUFFERED')));
  assert.ok(notified.every((n) => n.text.includes(valid.name)));
  return 'email + telegram; "Stored in Supabase." then "BUFFERED"';
});

await check('a failed notification never fails the request', async () => {
  notifyStatus = 500;
  const response = await onRequestPost({ request: post(valid, { json: true, ip: '198.51.100.42' }), env: notifying() });
  notifyStatus = 200;
  assert.equal(response.status, 200);
  return '200 with both channels answering 500';
});

Object.assign(console, quiet);

// -------------------------------------------------------------------- report

const width = Math.max(...results.map(([label]) => label.length));
console.log('');
for (const [label, detail] of results) {
  const bad = detail.startsWith('FAILED');
  console.log(`  ${bad ? 'x' : '+'} ${label.padEnd(width)}  ${detail}`);
}
console.log(`\n  ${results.length - failures}/${results.length} passed\n`);
process.exit(failures ? 1 : 0);
