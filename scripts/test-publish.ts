/**
 * Exercises the real publish endpoint without Wrangler, Supabase or Workers
 * Builds.
 *
 * It imports worker/publish.ts unchanged and calls onPublish with a stand-in
 * fetch for Supabase Auth, the editors table and the deploy hook. What this
 * proves: no hook means no publishing, a missing or dead token is refused,
 * a signed-in user who is not an editor is refused, only an editor reaches
 * the hook, and a failing Supabase or hook is reported, not swallowed. What
 * it does not prove: that the real hook URL starts a build — for that, press
 * the button once the secret is set (README > Admin).
 *
 *   node scripts/test-publish.ts
 */
import assert from 'node:assert/strict';

import { onPublish } from '../worker/publish.ts';

const HOOK = 'https://api.cloudflare.com/client/v4/workers/builds/deploy_hooks/stub';
const TOKENS: Record<string, { id: string; editor: boolean }> = {
  'editor-token': { id: 'u-editor', editor: true },
  'visitor-token': { id: 'u-visitor', editor: false },
};

let hooked = 0;
let hookStatus = 200;
let supabaseDown = false;

const stub = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const token = /^Bearer (\S+)$/.exec(String((init?.headers as Record<string, string>)?.Authorization ?? ''))?.[1] ?? '';
  if (supabaseDown && url.includes('supabase.co')) return new Response('down', { status: 503 });
  if (url.endsWith('/auth/v1/user')) {
    const who = TOKENS[token];
    return who ? Response.json({ id: who.id }) : new Response('{}', { status: 401 });
  }
  if (url.includes('/rest/v1/editors')) {
    const who = Object.values(TOKENS).find((t) => url.includes(encodeURIComponent(t.id)));
    return Response.json(who?.editor && TOKENS[token]?.id === who.id ? [{ user_id: who.id }] : []);
  }
  if (url === HOOK && init?.method === 'POST') {
    hooked += 1;
    return Response.json({ success: true, result: { build_uuid: 'b-123' } }, { status: hookStatus });
  }
  throw new Error(`unexpected fetch: ${url}`);
}) as typeof fetch;

const post = (token?: string) =>
  new Request('https://aniragency.mn/api/publish', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

const results: Array<[string, string]> = [];
let failures = 0;

async function check(label: string, run: () => Promise<string>) {
  hooked = 0;
  hookStatus = 200;
  supabaseDown = false;
  try {
    results.push([label, await run()]);
  } catch (error) {
    failures += 1;
    results.push([label, `FAILED — ${(error as Error).message}`]);
  }
}

const env = { DEPLOY_HOOK_URL: HOOK };

// ---------------------------------------------------------------- the cases

await check('an editor publishes', async () => {
  const response = await onPublish(post('editor-token'), env, stub);
  assert.equal(response.status, 202);
  assert.deepEqual(await response.json(), { ok: true, build: 'b-123' });
  assert.equal(hooked, 1);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  return '202, the hook posted once, the build id returned';
});

await check('no hook secret (a preview version)', async () => {
  const response = await onPublish(post('editor-token'), {}, stub);
  assert.equal(response.status, 503);
  assert.equal(hooked, 0);
  return '503 not-configured, the hook never called';
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
  assert.deepEqual(await response.json(), { ok: false, error: 'hook' });
  return '502 hook, reported to the admin';
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
