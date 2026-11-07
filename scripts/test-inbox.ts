/**
 * Exercises the real enquiries inbox and storage routes without Wrangler or
 * Supabase.
 *
 * It imports worker/inbox.ts and worker/index.ts unchanged and calls them
 * with a stand-in fetch for Supabase Auth, the editors table, the enquiries
 * table and the storage function. What this proves: only an editor gets
 * anything; the enquiries are read and changed with the service key and
 * never with the caller's own token; a status change records who and when;
 * nothing but the four statuses is accepted; and no route, through the
 * Worker's own router, can delete an enquiry. What it does not prove: the
 * real table's columns — migration 0004 adds them (README > Admin).
 *
 *   node scripts/test-inbox.ts
 */
import assert from 'node:assert/strict';

import { onEnquiries, onEnquiryStatus, onStorage } from '../worker/inbox.ts';
import { onAlerts } from '../worker/alerts.ts';
import worker from '../worker/index.ts';

const SUPABASE = 'https://tyrzajpotvtirfjmacfm.supabase.co';
const SERVICE = 'service-key';
const TOKENS: Record<string, { id: string; editor: boolean; email: string }> = {
  'editor-token': { id: 'u-editor', editor: true, email: 'editor@example.com' },
  'visitor-token': { id: 'u-visitor', editor: false, email: 'visitor@example.com' },
};
const ID = '6f1c1f0e-8a8e-4c55-9d3b-0a4c2b3c4d5e';

const rows = () => [
  { id: ID, created_at: '2026-11-06T09:00:00Z', service: 'web', budget: '1-3m', timing: 'this-month', name: 'Болд', contact: 'bold@example.com', message: 'Сайт хийлгэмээр байна', status: 'new', status_changed_at: null, status_changed_by: null, unrecognised: [] },
  { id: '7f1c1f0e-8a8e-4c55-9d3b-0a4c2b3c4d5e', created_at: '2026-11-05T09:00:00Z', service: 'app', budget: 'over-5m', timing: 'exploring', name: 'Сараа', contact: '99112233', message: null, status: 'read', status_changed_at: '2026-11-05T10:00:00Z', status_changed_by: 'u-editor', unrecognised: [] },
  // A bot's: stored, flagged, never in «шинэ».
  { id: '8f1c1f0e-8a8e-4c55-9d3b-0a4c2b3c4d5e', created_at: '2026-11-06T08:00:00Z', service: 'spam', budget: '', timing: '', name: '', contact: 'buy-now', message: 'http://spam.example', status: 'new', status_changed_at: null, status_changed_by: null, unrecognised: ['service', 'budget', 'timing', 'name', 'contact'] },
];

let calls: { url: string; method: string; auth: string; body?: string }[] = [];
let missingRow = false;

const stub = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const method = init?.method ?? 'GET';
  const headers = (init?.headers ?? {}) as Record<string, string>;
  const auth = /^Bearer (\S+)$/.exec(headers.Authorization ?? '')?.[1] ?? '';
  calls.push({ url, method, auth, body: typeof init?.body === 'string' ? init.body : undefined });

  if (url.endsWith('/auth/v1/user')) {
    const who = TOKENS[auth];
    return who ? Response.json({ id: who.id, email: who.email }) : new Response('{}', { status: 401 });
  }
  if (url.includes('/rest/v1/editors?select=user_id&')) {
    const who = TOKENS[auth];
    return Response.json(who?.editor && url.includes(encodeURIComponent(who.id)) ? [{ user_id: who.id }] : []);
  }
  if (url.includes('/rest/v1/editors?select=user_id,email')) {
    assert.equal(auth, SERVICE);
    return Response.json([{ user_id: 'u-editor', email: 'editor@example.com' }]);
  }
  if (url.includes('/rest/v1/enquiries')) {
    // The table is reached with the service key only: never the caller's token.
    assert.equal(auth, SERVICE, 'enquiries reached without the service key');
    if (method === 'PATCH') return Response.json(missingRow ? [] : [{ ...rows()[0], ...JSON.parse(String(init?.body)) }]);
    if (method !== 'GET') throw new Error(`${method} on enquiries`);
    if (url.includes('select=status,unrecognised&')) return Response.json(rows().map(({ status, unrecognised }) => ({ status, unrecognised })));
    assert.ok(url.includes('select=*'), 'every column, so the flags come along');
    const wanted = /status=eq\.(\w+)/.exec(url)?.[1];
    // PostgREST's array filters, as the Worker sends them: {} is "nothing to check".
    const flagged = url.includes('unrecognised=neq.%7B%7D') ? true : url.includes('unrecognised=eq.%7B%7D') ? false : null;
    return Response.json(rows().filter((row) => row.status === wanted && (flagged === null || (row.unrecognised.length > 0) === flagged)));
  }
  if (url.includes('/rest/v1/worker_alerts')) {
    assert.equal(auth, SERVICE);
    return Response.json([{ kind: 'limiter-open', last_at: '2026-11-07T02:00:00Z', detail: 'KV unreachable' }]);
  }
  if (url.endsWith('/rest/v1/rpc/storage_used_bytes')) {
    assert.equal(auth, SERVICE);
    return Response.json(123456789);
  }
  throw new Error(`unexpected fetch: ${method} ${url}`);
}) as typeof fetch;

const env = { SUPABASE_URL: SUPABASE, SUPABASE_SERVICE_ROLE_KEY: SERVICE };
const get = (path: string, token?: string) => new Request(`https://aniragency.mn${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
const post = (path: string, token: string | undefined, body: unknown) =>
  new Request(`https://aniragency.mn${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });

const results: Array<[string, string]> = [];
let failures = 0;
async function check(label: string, run: () => Promise<string>) {
  calls = [];
  missingRow = false;
  try {
    results.push([label, await run()]);
  } catch (error) {
    failures += 1;
    results.push([label, `FAILED — ${(error as Error).message}`]);
  }
}

// ---------------------------------------------------------------- the cases

await check('an editor reads the new enquiries', async () => {
  const response = await onEnquiries(get('/api/enquiries?status=new', 'editor-token'), env, stub);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  const body = (await response.json()) as { items: { id: string }[]; counts: Record<string, number> };
  assert.deepEqual(body.items.map((item) => item.id), [ID]);
  assert.deepEqual(body.counts, { new: 1, flagged: 1, read: 1, replied: 0, closed: 0 });
  return '200, the new one, and a count for every filter — the bot\'s counted apart';
});

await check('flagged new enquiries have their own filter, out of «шинэ»', async () => {
  const response = await onEnquiries(get('/api/enquiries?status=flagged', 'editor-token'), env, stub);
  const body = (await response.json()) as { items: { name: string }[] };
  assert.deepEqual(body.items.map((item) => item.name), ['']);
  return 'the bot\'s alone, under «Шалгах»';
});

await check('who changed a status is named by email', async () => {
  const response = await onEnquiries(get('/api/enquiries?status=read', 'editor-token'), env, stub);
  const body = (await response.json()) as { items: { status_changed_by: string }[] };
  assert.equal(body.items[0].status_changed_by, 'editor@example.com');
  return 'the editor\'s email, not their id';
});

await check('no token, and someone who is not an editor', async () => {
  assert.equal((await onEnquiries(get('/api/enquiries', undefined), env, stub)).status, 401);
  assert.equal((await onEnquiries(get('/api/enquiries', 'visitor-token'), env, stub)).status, 403);
  assert.ok(!calls.some((call) => call.url.includes('/enquiries')), 'the table was reached');
  return '401 and 403, the table never reached';
});

await check('a preview, with no database', async () => {
  const response = await onEnquiries(get('/api/enquiries', 'editor-token'), { SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '' }, stub);
  assert.equal(response.status, 503);
  assert.equal(((await response.json()) as { error: string }).error, 'not-configured');
  return '503 not-configured';
});

await check('a status that does not exist', async () => {
  assert.equal((await onEnquiries(get('/api/enquiries?status=deleted', 'editor-token'), env, stub)).status, 400);
  assert.equal((await onEnquiryStatus(post(`/api/enquiries/${ID}`, 'editor-token', { status: 'deleted' }), env, ID, stub)).status, 400);
  return '400 bad-status, to read or to set';
});

await check('marking one read records who and when', async () => {
  const response = await onEnquiryStatus(post(`/api/enquiries/${ID}`, 'editor-token', { status: 'read' }), env, ID, stub);
  assert.equal(response.status, 200);
  const patch = calls.find((call) => call.method === 'PATCH');
  if (!patch) throw new Error('no PATCH');
  assert.ok(patch.url.endsWith(`/rest/v1/enquiries?id=eq.${ID}`));
  const sent = JSON.parse(String(patch.body));
  assert.equal(sent.status, 'read');
  assert.equal(sent.status_changed_by, 'u-editor');
  assert.ok(!Number.isNaN(Date.parse(sent.status_changed_at)));
  return '200, status, editor and time written';
});

await check('marking one that is not there, or not an id', async () => {
  missingRow = true;
  assert.equal((await onEnquiryStatus(post(`/api/enquiries/${ID}`, 'editor-token', { status: 'closed' }), env, ID, stub)).status, 404);
  assert.equal((await onEnquiryStatus(post('/api/enquiries/1', 'editor-token', { status: 'closed' }), env, '1;drop', stub)).status, 400);
  return '404 not-found; 400 bad-id before the table is reached';
});

await check('a non-editor cannot mark one', async () => {
  const response = await onEnquiryStatus(post(`/api/enquiries/${ID}`, 'visitor-token', { status: 'closed' }), env, ID, stub);
  assert.equal(response.status, 403);
  assert.ok(!calls.some((call) => call.method === 'PATCH'));
  return '403, nothing written';
});

await check('no route deletes an enquiry', async () => {
  const assets = { fetch: async () => new Response('not found', { status: 404 }) };
  const original = globalThis.fetch;
  globalThis.fetch = stub;
  try {
    for (const method of ['DELETE', 'PUT', 'PATCH']) {
      const response = await worker.fetch(
        new Request(`https://aniragency.mn/api/enquiries/${ID}`, { method, headers: { Authorization: 'Bearer editor-token' } }),
        { ...env, ASSETS: assets } as never,
        { waitUntil() {} }
      );
      assert.equal(response.status, 404, `${method} was answered`);
    }
  } finally {
    globalThis.fetch = original;
  }
  assert.ok(!calls.some((call) => call.url.includes('/enquiries') && call.method !== 'GET'));
  return 'DELETE, PUT, PATCH fall through to a 404; the table never touched';
});

await check('the Worker\'s alerts: for editors, with the service key', async () => {
  const response = await onAlerts(get('/api/alerts', 'editor-token'), env, stub);
  const body = (await response.json()) as { alerts: { kind: string }[] };
  assert.deepEqual(body.alerts.map((a) => a.kind), ['limiter-open']);
  assert.equal((await onAlerts(get('/api/alerts', 'visitor-token'), env, stub)).status, 403);
  assert.equal((await onAlerts(get('/api/alerts', undefined), env, stub)).status, 401);
  return 'the limiter row for an editor; 403 and 401 for anyone else';
});

await check('storage used', async () => {
  const response = await onStorage(get('/api/storage', 'editor-token'), env, stub);
  assert.deepEqual(await response.json(), { ok: true, used: 123456789, limit: 1024 ** 3 });
  assert.equal((await onStorage(get('/api/storage', 'visitor-token'), env, stub)).status, 403);
  return 'bytes of 1 GB for an editor; 403 for anyone else';
});

// -------------------------------------------------------------------- report

const width = Math.max(...results.map(([label]) => label.length));
console.log('');
for (const [label, detail] of results) console.log(`  ${detail.startsWith('FAILED') ? 'x' : '+'} ${label.padEnd(width)}  ${detail}`);
console.log(`\n  ${results.length - failures}/${results.length} passed\n`);
process.exit(failures ? 1 : 0);
