/**
 * Exercises the real enquiry Function without Wrangler or a live Supabase.
 *
 * It imports functions/api/enquiry.ts unchanged and calls onRequestPost with
 * constructed Requests, stubbing global fetch to stand in for Supabase and
 * a Map to stand in for the KV binding. What this proves: validation, the
 * honeypot, rate limiting, content negotiation, and the exact row the Function
 * would send to Supabase. What it does not prove: that Supabase accepts that
 * row — for that the migration has to be applied and the keys set.
 *
 *   node scripts/test-enquiry.ts
 */
import assert from 'node:assert/strict';

import { onRequestPost } from '../functions/api/enquiry.ts';

type Row = Record<string, unknown>;

let captured: Row[] = [];
let supabaseStatus = 201;

const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: any, init: any) => {
  const url = String(input);
  if (url.includes('/rest/v1/enquiries')) {
    captured.push(JSON.parse(String(init.body)));
    return new Response('', { status: supabaseStatus });
  }
  return realFetch(input, init);
}) as typeof fetch;

/** Minimal stand-in for a KV namespace. */
function kv() {
  const store = new Map<string, string>();
  return {
    get: async (key: string) => store.get(key) ?? null,
    put: async (key: string, value: string) => void store.set(key, value),
  };
}

const env = () => ({
  SUPABASE_URL: 'https://stub.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'stub-service-key',
  RATE_LIMIT: kv(),
});

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

await check('a Supabase failure reports an error and never claims success', async () => {
  supabaseStatus = 500;
  const response = await onRequestPost({ request: post(valid, { json: true }), env: env() });
  const body = (await response.json()) as { ok: boolean };
  supabaseStatus = 201;
  assert.equal(response.status, 502);
  assert.equal(body.ok, false);
  return '502, ok:false';
});

await check('missing Supabase config is caught before the network call', async () => {
  const response = await onRequestPost({
    request: post(valid, { json: true }),
    env: { SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '' },
  });
  assert.equal(response.status, 500);
  return '500, no request attempted';
});

// -------------------------------------------------------------------- report

const width = Math.max(...results.map(([label]) => label.length));
console.log('');
for (const [label, detail] of results) {
  const bad = detail.startsWith('FAILED');
  console.log(`  ${bad ? 'x' : '+'} ${label.padEnd(width)}  ${detail}`);
}
console.log(`\n  ${results.length - failures}/${results.length} passed\n`);
process.exit(failures ? 1 : 0);
