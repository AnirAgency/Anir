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
 * constraints — its length checks read from supabase/migrations itself — and
 * to what Postgres text can hold, so a row it takes is one the real table
 * would. Every length is tried at, just past and far past its limit, the
 * User-Agent header among them. What it does not
 * prove: that the migrations are applied and the keys set.
 *
 *   node scripts/test-enquiry.ts
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

import { ENQUIRY_MAX } from '../src/lib/enquiry-limits.ts';
import { raiseAlert, type AlertKind } from '../worker/alerts.ts';
import { drain, onHealth, onRequestPost } from '../worker/enquiry.ts';

/**
 * The table's length checks, read from the migrations as they leave them —
 * every `char_length(<column>) <= n` or `between … and n`, the last one for
 * each column winning, as the last migration to set it does. The stand-in
 * table below holds rows to these, not to numbers copied by hand, so a
 * migration that tightens a limit fails this suite until the Worker cuts to it.
 */
const migrations = new URL('../supabase/migrations/', import.meta.url);
const TABLE_MAX: Record<string, number> = {};
for (const file of readdirSync(migrations).filter((name: string) => name.endsWith('.sql')).sort()) {
  const sql = readFileSync(new URL(file, migrations), 'utf8').replace(/--.*$/gm, '');
  for (const [, column, n] of sql.matchAll(/char_length\((\w+)\)\s*(?:<=|between\s+\d+\s+and)\s*(\d+)/g)) TABLE_MAX[column] = Number(n);
}
const ENQUIRY_COLUMNS = ['name', 'contact', 'message', 'user_agent'] as const;

type Row = Record<string, unknown>;

let captured: Row[] = [];
let preferHeaders: string[] = [];
let supabaseStatus = 201;
let notified: Array<{ channel: string; text: string; from?: string }> = [];
let notifyStatus = 200;
/** Resend on its own: a status of its own, or no answer at all (the network failing). */
let resendStatus: number | null = null;
let resendThrows = false;

/**
 * What the real table would refuse: an unknown column, a NOT NULL left out,
 * a length over a check, or text Postgres cannot hold — a NUL, or half a
 * surrogate pair, which is not valid UTF-8. Null when it would take the row.
 */
const COLUMNS = new Set(['id', 'created_at', 'service', 'budget', 'timing', 'name', 'contact', 'message', 'user_agent', 'unrecognised', 'answers', 'diagnostics']);
const chars = (text: string) => [...text].length;
const unstorable = (text: string) => /\u0000/.test(text) || /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/.test(text);
function refusedBy(row: Row): string | null {
  for (const key of Object.keys(row)) if (!COLUMNS.has(key)) return `unknown column ${key}`;
  for (const key of ['service', 'budget', 'timing', 'name', 'contact']) if (typeof row[key] !== 'string') return `${key} not null`;
  for (const column of ENQUIRY_COLUMNS) {
    const value = row[column];
    if (value === null && (column === 'message' || column === 'user_agent')) continue;
    if (typeof value !== 'string' || chars(value) > TABLE_MAX[column]) return `${column} over ${TABLE_MAX[column]}`;
  }
  if ('unrecognised' in row && !(Array.isArray(row.unrecognised) && row.unrecognised.every((f) => typeof f === 'string'))) return 'unrecognised';
  if ('answers' in row && (typeof row.answers !== 'object' || row.answers === null || Array.isArray(row.answers))) return 'answers';
  if ('diagnostics' in row && !(Array.isArray(row.diagnostics) && row.diagnostics.every((note) => typeof note === 'string'))) return 'diagnostics';
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
    if (resendThrows) throw new TypeError('fetch failed: api.resend.com unreachable');
    const body = JSON.parse(String(init.body));
    notified.push({ channel: 'email', text: `${body.subject}\n${body.text}`, from: body.from });
    return new Response('{}', { status: resendStatus ?? notifyStatus });
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

await check('the form, the Worker and the table agree on every length', async () => {
  for (const column of ENQUIRY_COLUMNS) {
    assert.ok(TABLE_MAX[column], `no length check found for ${column} in supabase/migrations`);
    assert.equal(ENQUIRY_MAX[column], TABLE_MAX[column], `${column}: the Worker cuts to ${ENQUIRY_MAX[column]}, the table holds ${TABLE_MAX[column]}`);
  }
  const form = readFileSync(new URL('../src/components/Contact.astro', import.meta.url), 'utf8');
  for (const field of ['name', 'contact', 'message']) assert.match(form, new RegExp(`maxlength=\\{ENQUIRY_MAX\\.${field}\\}`), `the form's ${field} maxlength`);
  return ENQUIRY_COLUMNS.map((column) => `${column} ${TABLE_MAX[column]}`).join(', ') + ' — read from the migrations';
});

/*
  The files above are only half of it: the live project's own history
  (supabase_migrations.schema_migrations) must hold a row for each, or
  anyone rebuilding from history gets a schema without it — the mismatch a
  migration pasted into the SQL editor leaves, since pasting records
  nothing. Asked through public.applied_migrations() (0009), service_role
  only, with the key from .dev.vars; without one, said loudly and skipped.
*/
const devVars = (() => {
  try {
    return Object.fromEntries(
      (readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8') as string)
        .split(/\r?\n/)
        .map((line) => line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/))
        .filter((match): match is RegExpMatchArray => !!match)
        .map(([, key, value]) => [key, value.replace(/^(['"])(.*)\1$/, '$2')])
    ) as Record<string, string>;
  } catch {
    return {} as Record<string, string>;
  }
})();
const wranglerUrl = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8').match(/"SUPABASE_URL":\s*"(https:[^"]+)"/)?.[1];

await check('every migration file is recorded in the live project\'s history', async () => {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || devVars.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.SUPABASE_URL || devVars.SUPABASE_URL || wranglerUrl;
  if (!key || !url) return 'SKIPPED — no SUPABASE_SERVICE_ROLE_KEY in .dev.vars or the environment: history NOT checked';
  const response = await realFetch(`${url}/rest/v1/rpc/applied_migrations`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (response.status === 404) {
    throw new Error('public.applied_migrations() is missing — paste supabase/migrations/0009_applied_migrations.sql into the SQL editor, run it, then `npm run migration:record -- 0009`');
  }
  assert.ok(response.ok, `applied_migrations answered ${response.status}`);
  const applied = new Set(((await response.json()) as { name: string }[]).map((row) => row.name));
  const files = (readdirSync(migrations) as string[]).filter((name) => /^\d{4}_.+\.sql$/.test(name)).sort();
  const nameOf = (file: string) => file.replace(/^\d{4}_/, '').replace(/\.sql$/, '');
  const unrecorded = files.filter((file) => !applied.has(nameOf(file)));
  const strangers = [...applied].filter((name) => !files.some((file) => nameOf(file) === name));
  assert.deepEqual(
    unrecorded,
    [],
    `no history row for ${unrecorded.join(', ')} — if it has been applied, record it: ${unrecorded.map((file) => `npm run migration:record -- ${file.slice(0, 4)}`).join('; ')} (add --at <ISO time> if it ran earlier)`
  );
  assert.deepEqual(strangers, [], `the history records ${strangers.join(', ')}, which has no file in supabase/migrations/`);
  return `${files.length} files, ${applied.size} rows — every file recorded, every row a file`;
});

/*
  Past a column's length the table refuses the whole row — an enquiry lost,
  the NUL failure from the other side. So each value is cut to its limit
  (counted as Postgres counts: characters, an emoji one), the enquiry
  stored, and the cut named: cut:<field>:<characters it came with>.
*/
await check('at, just past and far past every limit: stored, cut to fit, said', async () => {
  const flags = (row: Row) => ((row.unrecognised ?? []) as string[]).filter((flag) => flag.startsWith('cut:'));
  const send = async (body: Record<string, unknown>, agent?: string) => {
    captured = [];
    const response = await onRequestPost({ request: post(body, { json: true, agent }), env: env() });
    assert.equal(response.status, 200);
    assert.equal(captured.length, 1, `not stored: ${JSON.stringify(body).slice(0, 80)}…`);
    return captured[0];
  };
  let tried = 0;
  for (const field of ['name', 'contact', 'message'] as const) {
    const max = ENQUIRY_MAX[field];
    const at = await send({ ...valid, [field]: 'ө'.repeat(max) });
    assert.equal(chars(at[field] as string), max, `${field} at its limit is kept whole`);
    assert.deepEqual(flags(at), [], `${field} at its limit is not flagged as cut`);
    for (const length of [max + 1, max * 50]) {
      const over = await send({ ...valid, [field]: `${'ү'.repeat(length - 1)}Z` });
      assert.equal(over[field], 'ү'.repeat(max), `${field} of ${length} keeps its first ${max} characters`);
      assert.deepEqual(flags(over), [`cut:${field}:${length}`]);
    }
    // Characters, not UTF-16 units: an emoji counts one, and one at the limit is never split.
    const emoji = await send({ ...valid, [field]: '😀'.repeat(max) });
    assert.equal(emoji[field], '😀'.repeat(max), `${field} of ${max} emoji fits and is kept whole`);
    assert.deepEqual(flags(emoji), []);
    const emojiOver = await send({ ...valid, [field]: '😀'.repeat(max + 1) });
    assert.equal(emojiOver[field], '😀'.repeat(max));
    assert.deepEqual(flags(emojiOver), [`cut:${field}:${max + 1}`]);
    tried += 5;
  }
  // The header no body-shaped attack reaches: cut to fit all the same, but only noted — never a flag.
  const max = ENQUIRY_MAX.user_agent;
  const browser = await send(valid, 'M'.repeat(max));
  assert.equal(browser.user_agent, 'M'.repeat(max));
  assert.equal(browser.unrecognised, undefined, 'a User-Agent at its limit is an ordinary enquiry');
  assert.equal(browser.diagnostics, undefined);
  const crawler = await send(valid, `Mozilla/5.0 (compatible; ${'x'.repeat(3974)})`);
  assert.equal(chars(crawler.user_agent as string), max, `a 4000-character User-Agent is cut to ${max}`);
  assert.equal(crawler.unrecognised, undefined, 'a cut User-Agent is not a flag');
  assert.deepEqual(crawler.diagnostics, ['cut:user_agent:4000'], 'only a note on the row');
  // And a chip value — no column check, but cut all the same, and said.
  const chip = await send({ ...valid, budget: 'b'.repeat(ENQUIRY_MAX.choice * 10) });
  assert.equal(chip.budget, 'b'.repeat(ENQUIRY_MAX.choice));
  assert.deepEqual(chip.unrecognised, ['budget', `cut:budget:${ENQUIRY_MAX.choice * 10}`]);
  return `${tried + 3} enquiries: at the limit kept whole; form fields past it cut, flagged cut:<field>:<n>; User-Agent 4000 → ${max}, noted only`;
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
  const { why, ...counts } = result;
  assert.deepEqual(counts, { buffered: 1, written: 0, kept: 1 });
  assert.equal(why, 'Supabase answered 500', 'why it was kept, for the stuck alert');
  assert.equal(environment.ENQUIRY_BUFFER.store.size, 1);
  return `0 written, 1 kept — "${why}"`;
});

await check('the drain says why in Supabase\'s words, and never throws', async () => {
  // A row the table refuses (a column it does not have — a schema behind the Worker).
  const environment = env();
  await environment.ENQUIRY_BUFFER.put('enquiry:2026-11-07T01:00:00.000Z-abcd1234', JSON.stringify({ ...valid, id: crypto.randomUUID(), not_a_column: 1 }));
  const refused = await drain(environment);
  assert.equal(refused.kept, 1);
  assert.equal(refused.why, 'Supabase answered 400: unknown column not_a_column');
  // A buffer that cannot even be listed: said, not thrown — the watch after it must still run.
  const broken = { ...env(), ENQUIRY_BUFFER: { ...kv(), list: async () => { throw new Error('KV is down'); } } };
  const keep = console.error;
  console.error = () => {};
  const unlisted = await drain(broken);
  console.error = keep;
  assert.deepEqual(unlisted, { buffered: 0, written: 0, kept: 0, why: 'the buffer could not be listed: KV is down' });
  return `"${refused.why}"; KV down: "${unlisted.why}"`;
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

/*
  A User-Agent is no evidence about the visitor: the Facebook and Instagram
  in-app browsers — where much of this site's traffic opens — append their
  own block to the browser's, longest on iOS (FBAN/FBAV/FBDV/…). Its length
  must never decide whether a person hears about an enquiry.
*/
await check('a long in-app browser\'s User-Agent: stored whole, unflagged, told at once', async () => {
  const base =
    'Mozilla/5.0 (Linux; Android 14; SM-S928B Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) ' +
    'Version/4.0 Chrome/129.0.6668.100 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/484.0.0.62.109;IABMV/1;' +
    'FBDM/{density=3.0,width=1080,height=2340};FBLC/mn_MN;FBRV/0;FBCR/Unitel;FBMF/samsung;FBBD/samsung;' +
    'FBPN/com.facebook.katana;FBDV/SM-S928B;FBSV/14;FBOP/1;FBCA/arm64-v8a:;';
  const facebook = `${base}FBPX/`.padEnd(419, '7') + ']';
  assert.equal(facebook.length, 420);
  captured = [];
  notified = [];
  const response = await onRequestPost({ request: post(valid, { json: true, ip: '198.51.100.43', agent: facebook }), env: notifying() });
  assert.equal(response.status, 200);
  assert.equal(captured.length, 1);
  assert.equal(captured[0].user_agent, facebook, 'stored whole');
  assert.equal(captured[0].unrecognised, undefined, 'not flagged: «Шинэ», not «Шалгах»');
  assert.equal(captured[0].diagnostics, undefined, 'not even a note: it fits');
  assert.equal(notified.length, 2, 'told at once, on both channels');
  // Past even 1000: cut and noted on the row — and still told at once.
  captured = [];
  notified = [];
  await onRequestPost({ request: post(valid, { json: true, ip: '198.51.100.44', agent: `${facebook}${'9'.repeat(3580)}` }), env: notifying() });
  assert.equal(captured.length, 1);
  assert.equal(captured[0].unrecognised, undefined);
  assert.deepEqual(captured[0].diagnostics, ['cut:user_agent:4000']);
  assert.equal(notified.length, 2, 'a note never holds back the message');
  return `420 characters: stored whole, unflagged, 2 notifications; 4000: cut to ${ENQUIRY_MAX.user_agent}, noted, still 2`;
});

/*
  The one User-Agent in this suite that neither of us wrote: the Facebook
  app's in-app browser on Android, captured on 8 November 2026 by
  `wrangler tail anir --ip self` as a phone opened /api/ua-check. 165
  characters — Chrome's reduced string ("Android 10; K", no device model)
  plus Facebook's [FB_IAB/FB4A;…] — so the estimate of "around 400 on
  Android" was wrong by more than half. Kept exactly as it came.
*/
const CAPTURED_FACEBOOK_ANDROID =
  'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/157.0.0.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/586.0.0.52.53;IABMV/1;]';

await check('the captured Facebook-for-Android User-Agent: stored whole, «Шинэ», told at once', async () => {
  assert.equal(CAPTURED_FACEBOOK_ANDROID.length, 165, 'the fixture is the string as captured');
  captured = [];
  notified = [];
  const response = await onRequestPost({ request: post(valid, { json: true, ip: '198.51.100.45', agent: CAPTURED_FACEBOOK_ANDROID }), env: notifying() });
  assert.equal(response.status, 200);
  assert.equal(captured.length, 1);
  assert.equal(captured[0].user_agent, CAPTURED_FACEBOOK_ANDROID, 'stored whole');
  assert.equal(captured[0].unrecognised, undefined, 'not flagged');
  assert.equal(captured[0].diagnostics, undefined, 'not even a note');
  assert.equal(notified.length, 2, 'told at once, on both channels');
  return '165 characters, as captured: stored whole, unflagged, no note, 2 notifications';
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

await check('an alert of a kind the Worker does not list is recorded all the same', async () => {
  alerts = [];
  const keep = console.error;
  console.error = () => {};
  await raiseAlert(env(), 'a-kind-from-next-year' as AlertKind, 'something new went wrong');
  console.error = keep;
  assert.deepEqual(alerts.map((x) => x.kind), ['a-kind-from-next-year']);
  return 'written to worker_alerts, not dropped — the table checks no kind since 0007';
});

await check('an alert\'s detail is cut to its 500, never inside a character', async () => {
  alerts = [];
  const keep = console.error;
  console.error = () => {};
  // A cut by UTF-16 units at 500 would land inside the first emoji — half a pair, which Postgres refuses.
  await raiseAlert(env(), 'drain-stuck', `${'a'.repeat(499)}😀😀`);
  console.error = keep;
  const detail = String(alerts[0]?.detail);
  assert.equal(chars(detail), 500);
  assert.ok(!unstorable(detail), 'no half pair');
  assert.ok(detail.endsWith('😀'));
  return '500 characters, the emoji whole — the row the table takes';
});

await check('a limiter that works raises nothing', async () => {
  alerts = [];
  await onRequestPost({ request: post(valid, { json: true, ip: '198.51.100.92' }), env: env() });
  assert.equal(alerts.length, 0);
  return 'no alert';
});

// ------------------------------------------------- the health preflight

await check('GET /api/health discloses liveness to the secret\'s holder, and nothing else', async () => {
  captured = [];
  const ask = (secret?: string) =>
    new Request('https://aniragency.mn/api/health', { headers: secret === undefined ? {} : { 'X-Health-Check': secret } });
  const holding = { ...env(), HEALTH_CHECK_SECRET: 'health-secret' };
  const said = async (response: Response) => [response.status, await response.text()] as const;
  const yes = await said(await onHealth(ask('health-secret'), holding));
  const refusals = [
    await said(await onHealth(ask('guess'), holding)), //        a wrong secret
    await said(await onHealth(ask(), holding)), //               none sent
    await said(await onHealth(ask('health-secret'), env())), //  none set here
    await said(await onHealth(ask(''), env())), //               none sent, none set
  ];
  assert.deepEqual(yes, [200, '{"ok":true}'], 'the yes is liveness and nothing more');
  for (const refusal of refusals) assert.deepEqual(refusal, refusals[0], 'every refusal says the same');
  assert.equal(refusals[0][0], 401);
  assert.equal(refusals[0][1], '{"ok":false}', 'not why — not whether a secret is set');
  assert.equal(captured.length, 0);
  return 'yes 200 {ok:true}; wrong, none, or not set: one same 401 — nothing stored, ever';
});

await check('a failed notification never fails the request', async () => {
  notifyStatus = 500;
  const response = await onRequestPost({ request: post(valid, { json: true, ip: '198.51.100.42' }), env: notifying() });
  notifyStatus = 200;
  assert.equal(response.status, 200);
  return '200 with both channels answering 500';
});

// An email provider being down is not a reason to lose an enquiry — or to
// miss it: the row is stored, the visitor answered, and Telegram still told.
await check('Resend failing — a wrong key, down, unreachable — costs neither the enquiry nor Telegram', async () => {
  const ways: Array<[string, () => void]> = [
    ['wrong key (401)', () => (resendStatus = 401)],
    ['restricted key, wrong sender (403)', () => (resendStatus = 403)],
    ['Resend down (503)', () => (resendStatus = 503)],
    ['unreachable (fetch throws)', () => (resendThrows = true)],
  ];
  const seen: string[] = [];
  let ip = 60;
  for (const [how, breakIt] of ways) {
    captured = [];
    notified = [];
    const logs: string[] = [];
    console.log = (line: unknown) => void logs.push(String(line));
    breakIt();
    const name = `Resend: ${how}`;
    const response = await onRequestPost({ request: post({ ...valid, name }, { json: true, ip: `198.51.100.${ip++}` }), env: { ...notifying(), NOTIFY_FROM: 'Anir site <site@send.aniragency.mn>' } });
    resendStatus = null;
    resendThrows = false;
    console.log = () => {};
    assert.equal(response.status, 200, `${how}: the visitor is answered`);
    assert.deepEqual(captured.map((r) => r.name), [name], `${how}: stored`);
    assert.equal(captured[0].unrecognised?.length ?? 0, 0, `${how}: in «Шинэ», not «Шалгах»`);
    const telegram = notified.filter((n) => n.channel === 'telegram');
    assert.equal(telegram.length, 1, `${how}: Telegram still told`);
    assert.ok(telegram[0].text.includes(name) && telegram[0].text.includes('Stored in Supabase.'));
    assert.ok(logs.some((l) => /via email: FAILED/.test(l)), `${how}: the failure is logged, not swallowed`);
    assert.ok(logs.some((l) => /via telegram: sent/.test(l)), `${how}: Telegram logged as sent`);
    seen.push(how);
  }
  // And working, it sends from the verified domain — never Resend's test sender.
  notified = [];
  await onRequestPost({ request: post(valid, { json: true, ip: '198.51.100.70' }), env: { ...notifying(), NOTIFY_FROM: 'Anir site <site@send.aniragency.mn>' } });
  assert.equal(notified.find((n) => n.channel === 'email')?.from, 'Anir site <site@send.aniragency.mn>');
  return `${seen.join('; ')}: stored, 200, in «Шинэ», Telegram sent, "email: FAILED" logged; working, from site@send.aniragency.mn`;
});

Object.assign(console, quiet);

// -------------------------------------------------------------------- report

const width = Math.max(...results.map(([label]) => label.length));
console.log('');
for (const [label, detail] of results) {
  const mark = detail.startsWith('FAILED') ? 'x' : detail.startsWith('SKIPPED') ? '!' : '+';
  console.log(`  ${mark} ${label.padEnd(width)}  ${detail}`);
}
// A skip is not a pass: counted apart, and said where it cannot be missed.
const skipped = results.filter(([, detail]) => detail.startsWith('SKIPPED'));
console.log(`\n  ${results.length - failures - skipped.length}/${results.length} passed${skipped.length ? `, ${skipped.length} SKIPPED — NOT CHECKED` : ''}\n`);
if (skipped.length) {
  const rule = '  ' + '!'.repeat(76);
  console.log([rule, ...skipped.map(([label]) => `  !  SKIPPED: ${label}`), '  !  A manual pre-merge step: put SUPABASE_SERVICE_ROLE_KEY in .dev.vars and run', '  !  npm run test:enquiry again. No build runs it, and none ever will: the build', '  !  must never hold the service role key.', rule, ''].join('\n'));
}
process.exit(failures ? 1 : 0);
