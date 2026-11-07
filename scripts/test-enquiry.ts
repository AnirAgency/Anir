/**
 * Exercises the real enquiry Function without Wrangler or a live Supabase.
 *
 * It imports worker/enquiry.ts unchanged and calls onRequestPost with
 * constructed Requests, stubbing global fetch to stand in for Supabase and the
 * notification channels, and Maps to stand in for the KV bindings. What this
 * proves: the checks and their flags, the honeypot, rate limiting, content
 * negotiation, the exact row the handler would send to Supabase, the KV
 * buffer and its drain, and the notification — and the invariant, over a few
 * hundred hostile submissions: no visitor input causes an enquiry not to be
 * stored. The stand-in for Supabase holds every row to the table's own
 * constraints (supabase/migrations/0001 and 0005) and to what Postgres text
 * can hold, so a row it takes is one the real table would. What it does not
 * prove: that the migrations are applied and the keys set.
 *
 *   node scripts/test-enquiry.ts
 */
import assert from 'node:assert/strict';

import { drain, onHealth, onRequestPost } from '../worker/enquiry.ts';

type Row = Record<string, unknown>;

let captured: Row[] = [];
let preferHeaders: string[] = [];
let supabaseStatus = 201;
let notified: Array<{ channel: string; text: string }> = [];
let notifyStatus = 200;

/**
 * What the real table would refuse: an unknown column, a NOT NULL left out,
 * a length over a check, or text Postgres cannot hold — a NUL, or half a
 * surrogate pair, which is not valid UTF-8. Null when it would take the row.
 */
const COLUMNS = new Set(['id', 'created_at', 'service', 'budget', 'timing', 'name', 'contact', 'message', 'user_agent', 'unrecognised', 'answers']);
const chars = (text: string) => [...text].length;
const unstorable = (text: string) => /\u0000/.test(text) || /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/.test(text);
function refusedBy(row: Row): string | null {
  for (const key of Object.keys(row)) if (!COLUMNS.has(key)) return `unknown column ${key}`;
  for (const key of ['service', 'budget', 'timing', 'name', 'contact']) if (typeof row[key] !== 'string') return `${key} not null`;
  if (chars(row.name as string) > 100) return 'name over 100';
  if (chars(row.contact as string) > 120) return 'contact over 120';
  if (row.message !== null && (typeof row.message !== 'string' || chars(row.message) > 2000)) return 'message';
  if (row.user_agent !== null && (typeof row.user_agent !== 'string' || chars(row.user_agent) > 400)) return 'user_agent';
  if ('unrecognised' in row && !(Array.isArray(row.unrecognised) && row.unrecognised.every((f) => typeof f === 'string'))) return 'unrecognised';
  if ('answers' in row && (typeof row.answers !== 'object' || row.answers === null || Array.isArray(row.answers))) return 'answers';
  const texts: string[] = [];
  const collect = (v: unknown): void => {
    if (typeof v === 'string') texts.push(v);
    else if (v && typeof v === 'object') Object.values(v).forEach(collect);
  };
  collect(row);
  if (texts.some(unstorable)) return 'text Postgres cannot hold';
  return null;
}

let alerts: Row[] = [];

const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: any, init: any) => {
  const url = String(input);
  if (url.includes('/rest/v1/worker_alerts')) {
    alerts.push(JSON.parse(String(init.body)));
    return new Response('', { status: 201 });
  }
  if (url.includes('/rest/v1/enquiries')) {
    preferHeaders.push(init.headers?.Prefer ?? '');
    if (supabaseStatus >= 300) return new Response('', { status: supabaseStatus });
    const row = JSON.parse(String(init.body)) as Row;
    const refusal = refusedBy(row);
    if (refusal) return Response.json({ message: refusal }, { status: 400 });
    captured.push(row);
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

function post(body: Record<string, unknown>, opts: { json?: boolean; ip?: string; agent?: string } = {}) {
  const headers: Record<string, string> = {
    'CF-Connecting-IP': opts.ip ?? '203.0.113.7',
    'User-Agent': opts.agent ?? 'test-harness/1.0',
  };
  let payload: string | FormData;
  if (opts.json) {
    headers['Content-Type'] = 'application/json';
    headers['Accept'] = 'application/json';
    payload = JSON.stringify(body);
  } else {
    const data = new FormData();
    for (const [k, v] of Object.entries(body)) if (v !== undefined) data.append(k, String(v));
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

await check('a missing name is stored, flagged', async () => {
  captured = [];
  const response = await onRequestPost({
    request: post({ ...valid, name: '   ' }, { json: true }),
    env: env(),
  });
  assert.equal(response.status, 200);
  assert.equal(captured.length, 1, 'the enquiry must be stored');
  assert.deepEqual(captured[0].unrecognised, ['name']);
  return '200, stored, unrecognised: [name]';
});

await check('a contact that is neither email nor phone is stored, flagged, as sent', async () => {
  captured = [];
  const response = await onRequestPost({
    request: post({ ...valid, contact: 'telegram: @bold_99' }, { json: true }),
    env: env(),
  });
  assert.equal(response.status, 200);
  assert.equal(captured.length, 1);
  assert.equal(captured[0].contact, 'telegram: @bold_99');
  assert.deepEqual(captured[0].unrecognised, ['contact']);
  return '200, stored as sent, unrecognised: [contact]';
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

await check('a chip value the form does not have is stored, raw, flagged', async () => {
  captured = [];
  const response = await onRequestPost({
    request: post({ ...valid, budget: 'free-please' }, { json: true }),
    env: env(),
  });
  assert.equal(response.status, 200);
  assert.equal(captured.length, 1);
  assert.equal(captured[0].budget, 'free-please', 'the raw value is kept');
  assert.deepEqual(captured[0].unrecognised, ['budget']);
  return '200, stored with budget "free-please", unrecognised: [budget]';
});

await check('an ordinary enquiry carries no flags at all', async () => {
  captured = [];
  await onRequestPost({ request: post(valid, { json: true, ip: '198.51.100.60' }), env: env() });
  assert.ok(!('unrecognised' in captured[0]) && !('answers' in captured[0]));
  return 'no unrecognised, no answers: the row it always was';
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

const rawPost = (body: string, type: string | null, headers: Record<string, string> = {}) =>
  new Request('https://aniragency.mn/api/enquiry', {
    method: 'POST',
    headers: { Accept: 'application/json', 'CF-Connecting-IP': '198.51.100.70', ...(type ? { 'Content-Type': type } : {}), ...headers },
    body,
  });

await check('a body that cannot be read is stored, its raw text kept, flagged', async () => {
  captured = [];
  const shapes: [string, string | null][] = [['{"name": "Бат", ', 'application/json'], ['[1, 2, 3]', 'application/json'], ['хувьд уулзъя', 'text/plain'], ['name=Бат&contact', null]];
  for (const [body, type] of shapes) {
    const response = await onRequestPost({ request: rawPost(body, type), env: { SUPABASE_URL: 'https://stub.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'stub-service-key' } });
    assert.equal(response.status, 200, `${body} answered ${response.status}`);
  }
  assert.equal(captured.length, 4);
  assert.ok(captured.every((row) => (row.unrecognised as string[])[0] === 'body'));
  assert.equal(captured[0].message, '{"name": "Бат",');
  return '4 shapes no form sends — broken JSON, a list, plain text, no type: all 200, all stored, raw text in the message';
});

// ---------------------------------------------------------- the health check

await check('the health check is known by its secret: answered, nothing stored', async () => {
  captured = [];
  const environment = { ...env(), HEALTH_CHECK_SECRET: 'health-secret' };
  const response = await onRequestPost({ request: rawPost('{"not": "json', 'application/json', { 'X-Health-Check': 'health-secret' }), env: environment });
  assert.equal(response.status, 200);
  assert.equal(captured.length, 0);
  assert.equal(environment.ENQUIRY_BUFFER.store.size, 0);
  return '200, nothing stored, nothing buffered';
});

await check('the same request without the secret — or with a wrong one — is stored', async () => {
  captured = [];
  const environment = { ...env(), HEALTH_CHECK_SECRET: 'health-secret' };
  for (const headers of [{}, { 'X-Health-Check': 'guess' }, { 'X-Health-Check': 'health-secre' }] as Record<string, string>[]) {
    await onRequestPost({ request: rawPost('{"not": "json', 'application/json', headers), env: environment });
  }
  // And with no secret configured at all, the header means nothing.
  await onRequestPost({ request: rawPost('{"not": "json', 'application/json', { 'X-Health-Check': '' }), env: env() });
  assert.equal(captured.length, 4);
  return 'no header, a wrong one, a near one, none configured: 4 stored, flagged body';
});

// ---------------------------------------------------- the rate limiter holds

await check('the rate limiter stands in front of garbage too', async () => {
  captured = [];
  const environment = env();
  const codes: number[] = [];
  for (let i = 0; i < 6; i += 1) {
    const response = await onRequestPost({ request: post({ budget: 'spam', name: '' }, { json: true, ip: '198.51.100.80' }), env: environment });
    codes.push(response.status);
  }
  const broken = await onRequestPost({ request: rawPost('%%%', 'application/json', { 'CF-Connecting-IP': '198.51.100.80' }), env: environment });
  assert.deepEqual(codes, [200, 200, 200, 200, 200, 429]);
  assert.equal(broken.status, 429);
  assert.equal(captured.length, 5, 'the limit is the only bound on what reaches the table');
  return `flagged junk: ${codes.join(', ')}; an unreadable body after that: 429 — 5 stored`;
});

// ---------------------------------------------------------- the invariant

/*
  No visitor input causes an enquiry not to be stored. A few hundred
  submissions, seeded so a failure can be replayed: every field picked from
  values a person could type or a script could send — empty, whitespace,
  forged chips, emoji cut at a boundary, NUL, half a surrogate pair, text
  ten times too long, numbers and lists in JSON, fields left out — through
  both the JSON and the plain form path. Each must answer 200 and be stored
  exactly once: in Supabase while it is up, and in the buffer while it is
  down. Only the honeypot and the rate limit may keep one out, and neither
  is reached here.
*/
let seed = 0x416e6972;
const random = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = <T>(list: T[]): T => list[Math.floor(random() * list.length)];
const emoji = '😀'.repeat(60);
const hostile = (json: boolean): unknown[] => [
  '', '   ', '\n\t', 'web', '1-3m', 'this-month', 'free-please', 'x'.repeat(5000), `${'а'.repeat(99)}😀`, emoji,
  'a\u0000b', '\u0000', 'half \ud800 pair', '\udc00 tail', 'Бат-Эрдэнэ', 'Өөр ү', '<script>alert(1)</script>',
  "'); drop table enquiries; --", '‮RTL', 'line\nbreak', '9911 2233', '+976 9911-2233', 'hello@example.com', '@bold',
  ...(json ? [0, 42, -1.5, true, false, null, [], ['web'], {}, { $gt: '' }] : []),
  undefined,
];
const fields = ['service', 'budget', 'timing', 'name', 'contact', 'message'];

await check('no visitor input causes an enquiry not to be stored', async () => {
  const environment = { SUPABASE_URL: 'https://stub.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'stub-service-key', ENQUIRY_BUFFER: kv() };
  let sent = 0;
  for (const up of [true, false]) {
    supabaseStatus = up ? 201 : 500;
    for (let i = 0; i < 200; i += 1) {
      const json = random() < 0.5;
      const body: Record<string, unknown> = {};
      for (const field of fields) {
        const value = pick(hostile(json));
        if (value !== undefined) body[field] = value;
      }
      captured = [];
      const before = environment.ENQUIRY_BUFFER.store.size;
      // Any User-Agent a request can carry (a header cannot hold a NUL) — and
      // one in eight sends a body no form would: cut off, or not JSON at all.
      const broken = random() < 0.125;
      const request = broken
        ? rawPost(pick(['{"name":', 'null', '"text"', `{${'"a":'.repeat(50)}`, 'a\u0000b', '']), pick(['application/json', 'text/plain', null]))
        : post(body, { json, agent: pick(['', 'Mozilla/5.0', 'z'.repeat(900)]) });
      const response = await onRequestPost({ request, env: environment });
      const stored = up ? captured.length : environment.ENQUIRY_BUFFER.store.size - before;
      assert.equal(response.status, 200, `#${sent} answered ${response.status}: ${JSON.stringify(body).slice(0, 160)}`);
      assert.equal(stored, 1, `#${sent} was not stored (${up ? 'live' : 'buffered'}): ${JSON.stringify(body).slice(0, 160)}`);
      sent += 1;
    }
  }
  supabaseStatus = 201;
  // And what was buffered, the drain can write: the table takes every one.
  captured = [];
  const drained = await drain(environment);
  assert.equal(drained.kept, 0, `${drained.kept} buffered enquiries the table would refuse`);
  return `${sent} hostile submissions, JSON and form, Supabase up and down: all 200, all stored; ${drained.written} drained`;
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

await check('a flagged enquiry is stored, and does not ring the team\'s phone', async () => {
  notified = [];
  captured = [];
  await onRequestPost({ request: post({ ...valid, budget: 'spam' }, { json: true, ip: '198.51.100.43' }), env: notifying() });
  await onRequestPost({ request: rawPost('{"broken', 'application/json', { 'CF-Connecting-IP': '198.51.100.44' }), env: notifying() });
  assert.equal(captured.length, 2, 'both stored');
  assert.equal(notified.length, 0, 'neither told at once — the hourly digest counts them');
  await onRequestPost({ request: post(valid, { json: true, ip: '198.51.100.45' }), env: notifying() });
  assert.equal(notified.length, 2, 'one with nothing to check is told at once, on both channels');
  return 'flagged: stored, silent; unflagged: told at once';
});

// ------------------------------------------- the limiter fails open, aloud

await check('a limiter that cannot reach KV lets the enquiry in — and says so', async () => {
  captured = [];
  alerts = [];
  const errors: string[] = [];
  const keep = console.error;
  console.error = (...args: unknown[]) => void errors.push(String(args[0]));
  const broken = { ...env(), RATE_LIMIT: { ...kv(), get: async () => Promise.reject(new Error('KV is down')) } };
  const unbound = { ...env(), RATE_LIMIT: undefined };
  const a = await onRequestPost({ request: post(valid, { json: true, ip: '198.51.100.90' }), env: broken });
  const b = await onRequestPost({ request: post(valid, { json: true, ip: '198.51.100.91' }), env: unbound });
  console.error = keep;
  assert.deepEqual([a.status, b.status], [200, 200], 'never fails closed');
  assert.equal(captured.length, 2, 'both stored');
  assert.deepEqual(alerts.map((x) => x.kind), ['limiter-open', 'limiter-open']);
  assert.match(String(alerts[0].detail), /KV unreachable: KV is down/);
  assert.match(String(alerts[1].detail), /RATE_LIMIT is not bound/);
  assert.ok(errors.filter((line) => line.includes('ALERT limiter-open')).length === 2, 'logged');
  return 'KV down, KV unbound: 200, stored, logged, recorded for the admin';
});

await check('a limiter that works raises nothing', async () => {
  alerts = [];
  await onRequestPost({ request: post(valid, { json: true, ip: '198.51.100.92' }), env: env() });
  assert.equal(alerts.length, 0);
  return 'no alert';
});

// ------------------------------------------------- the health preflight

await check('GET /api/health says whether this Worker holds the secret, and stores nothing', async () => {
  captured = [];
  const ask = (secret?: string) =>
    new Request('https://aniragency.mn/api/health', { headers: secret === undefined ? {} : { 'X-Health-Check': secret } });
  const holding = { ...env(), HEALTH_CHECK_SECRET: 'health-secret' };
  const codes = [
    (await onHealth(ask('health-secret'), holding)).status,
    (await onHealth(ask('guess'), holding)).status,
    (await onHealth(ask(), holding)).status,
    (await onHealth(ask('health-secret'), env())).status,
  ];
  assert.deepEqual(codes, [200, 401, 401, 503]);
  assert.equal(captured.length, 0);
  return 'yes 200; wrong or none 401; not set 503 — nothing stored, ever';
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
