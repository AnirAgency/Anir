/**
 * Exercises the real publish endpoint without Wrangler, Supabase or Workers
 * Builds.
 *
 * It imports worker/publish.ts unchanged and calls it with a stand-in fetch
 * for Supabase Auth, the editors table, the build status row and the deploy
 * hook. What this proves: no hook means no publishing, a missing or dead
 * token is refused, a signed-in user who is not an editor is refused, only
 * an editor reaches the hook, a failing Supabase or hook is reported, not
 * swallowed — and a build is followed from the report it makes on itself:
 * queued until it reports, then building, done or failed with its cause. No
 * Cloudflare API token anywhere. What it does not prove: that the real hook
 * URL starts a build — for that, press the button once the secret is set
 * (README > Admin).
 *
 *   node scripts/test-publish.ts
 */
import assert from 'node:assert/strict';

import { onPublish, onPublishStatus } from '../worker/publish.ts';

const HOOK = 'https://api.cloudflare.com/client/v4/workers/builds/deploy_hooks/stub';
const SUPABASE = 'https://stub.supabase.co';
const TOKENS: Record<string, { id: string; editor: boolean }> = {
  'editor-token': { id: 'u-editor', editor: true },
  'visitor-token': { id: 'u-visitor', editor: false },
};
const BUILD = '0f8fad5b-d9cb-469f-a165-70867728950e';

let hooked = 0;
let hookStatus = 200;
let supabaseDown = false;
let row: Record<string, unknown> | null = null;
let apiCalls = 0;

const stub = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const token = /^Bearer (\S+)$/.exec(String((init?.headers as Record<string, string>)?.Authorization ?? ''))?.[1] ?? '';
  if (url.startsWith('https://api.cloudflare.com/client/v4/accounts/')) apiCalls += 1;
  if (supabaseDown && url.includes('supabase.co')) return new Response('down', { status: 503 });
  if (url.endsWith('/auth/v1/user')) {
    const who = TOKENS[token];
    return who ? Response.json({ id: who.id }) : new Response('{}', { status: 401 });
  }
  if (url.includes('/rest/v1/editors')) {
    const who = Object.values(TOKENS).find((t) => url.includes(encodeURIComponent(t.id)));
    return Response.json(who?.editor && TOKENS[token]?.id === who.id ? [{ user_id: who.id }] : []);
  }
  if (url.startsWith(`${SUPABASE}/rest/v1/build_status`)) {
    assert.equal(token, 'service-key', 'the status row is read with the service key only');
    return Response.json(row ? [row] : []);
  }
  if (url === HOOK && init?.method === 'POST') {
    hooked += 1;
    return Response.json({ success: true, result: { build_uuid: BUILD } }, { status: hookStatus });
  }
  throw new Error(`unexpected fetch: ${url}`);
}) as typeof fetch;

const post = (token?: string) =>
  new Request('https://aniragency.mn/api/publish', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
const ask = (token: string | undefined, id = BUILD) =>
  new Request(`https://aniragency.mn/api/publish?build=${id}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });

const results: Array<[string, string]> = [];
let failures = 0;

async function check(label: string, run: () => Promise<string>) {
  hooked = 0;
  hookStatus = 200;
  supabaseDown = false;
  row = null;
  try {
    results.push([label, await run()]);
  } catch (error) {
    failures += 1;
    results.push([label, `FAILED — ${(error as Error).message}`]);
  }
}

const env = { DEPLOY_HOOK_URL: HOOK };
const following = { DEPLOY_HOOK_URL: HOOK, BUILD_REPORT_SECRET: 'report-secret', SUPABASE_URL: SUPABASE, SUPABASE_SERVICE_ROLE_KEY: 'service-key' };

// ---------------------------------------------------------------- the cases

await check('an editor publishes', async () => {
  const response = await onPublish(post('editor-token'), env, stub);
  assert.equal(response.status, 202);
  assert.deepEqual(await response.json(), { ok: true, build: BUILD, following: false });
  assert.equal(hooked, 1);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  return '202, the hook posted once, the build id returned';
});

await check('no hook secret (a preview version)', async () => {
  const response = await onPublish(post('editor-token'), {}, stub);
  assert.equal(response.status, 503);
  assert.equal(hooked, 0);
  return '503 not-configured to an editor, the hook never called';
});

await check('no hook secret, asked by anyone else', async () => {
  const signedOut = await onPublish(post(), {}, stub);
  const forged = await onPublish(post('made-up'), {}, stub);
  assert.deepEqual([signedOut.status, forged.status], [401, 401], 'whether publishing is set up is an editor\'s business');
  assert.equal(hooked, 0);
  return '401, as with the hook set — nothing about the setup';
});

await check('no token', async () => {
  const response = await onPublish(post(), env, stub);
  assert.equal(response.status, 401);
  assert.equal(hooked, 0);
  return '401 signed-out';
});

await check('a dead or forged token', async () => {
  const response = await onPublish(post('made-up'), env, stub);
  assert.equal(response.status, 401);
  assert.equal(hooked, 0);
  return '401 signed-out, the hook never called';
});

await check('a signed-in user who is not an editor', async () => {
  const response = await onPublish(post('visitor-token'), env, stub);
  assert.equal(response.status, 403);
  assert.equal(hooked, 0);
  return '403 not-editor, the hook never called';
});

await check('Supabase down', async () => {
  supabaseDown = true;
  const response = await onPublish(post('editor-token'), env, stub);
  assert.equal(response.status, 502);
  assert.equal(hooked, 0);
  return '502 supabase, the hook never called';
});

await check('the hook refuses', async () => {
  hookStatus = 500;
  const response = await onPublish(post('editor-token'), env, stub);
  assert.equal(response.status, 502);
  assert.equal((await response.json()).error, 'hook');
  return '502 hook, reported to the admin';
});

await check('publishing where builds report themselves', async () => {
  const response = await onPublish(post('editor-token'), following, stub);
  assert.deepEqual(await response.json(), { ok: true, build: BUILD, following: true });
  return '202, and the admin told it can follow the build';
});

// ------------------------------------------------- following the build

const state = async (token = 'editor-token', environment: Record<string, string> = following, id = BUILD) => {
  const response = await onPublishStatus(ask(token, id), environment, stub);
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
};
const reported = (fields: Record<string, unknown>) => ({ build: BUILD, branch: 'main', sha: 'abc1234', code: null, reason: null, detail: null, reported_at: '2026-11-06T10:00:00Z', ...fields });

await check('queued until the build reports', async () => {
  assert.deepEqual((await state()).body, { ok: true, state: 'queued' });
  row = reported({ build: '1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed', state: 'done' });
  assert.deepEqual((await state()).body, { ok: true, state: 'queued' }, 'another build\'s row is not this one\'s');
  return 'no row, or another build\'s: queued';
});

await check('building, then done', async () => {
  row = reported({ state: 'building' });
  assert.deepEqual((await state()).body, { ok: true, state: 'building' });
  row = reported({ state: 'done', code: 0 });
  assert.deepEqual((await state()).body, { ok: true, state: 'done' });
  return 'the build\'s own report: building, then done';
});

await check('failed, with its cause and its lines', async () => {
  row = reported({ state: 'failed', code: 1, reason: 'budget', detail: '  FAIL  tiles are 198.3 kB over 300 kB together.' });
  const { body } = await state();
  assert.equal(body.state, 'failed');
  assert.equal(body.reason, 'budget');
  assert.match(String(body.detail), /tiles are 198.3 kB over/);
  return 'failed, reason budget, the failing line kept for «Дэлгэрэнгүй»';
});

await check('not following where builds do not report', async () => {
  const { status, body } = await state('editor-token', { DEPLOY_HOOK_URL: HOOK, SUPABASE_URL: SUPABASE, SUPABASE_SERVICE_ROLE_KEY: 'service-key' });
  assert.equal(status, 503);
  assert.equal(body.error, 'no-status');
  return '503 no-status without BUILD_REPORT_SECRET: the admin says the build started, and stops asking';
});

await check('following, refused to anyone not an editor', async () => {
  assert.equal((await state('visitor-token')).status, 403);
  assert.equal((await onPublishStatus(ask(undefined), following, stub)).status, 401);
  return '403 for a non-editor, 401 with no token';
});

await check('following a build id that is not one', async () => {
  assert.equal((await state('editor-token', following, '../../secrets')).status, 400);
  return '400 bad-build';
});

await check('no Cloudflare API is called, ever', async () => {
  assert.equal(apiCalls, 0);
  return 'the account API untouched by every case above';
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
