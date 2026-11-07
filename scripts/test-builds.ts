/**
 * Exercises the build's report on itself — worker/builds.ts, the route, and
 * scripts/build-report.mjs, the reporter — without Wrangler, Supabase or
 * Workers Builds.
 *
 * What this proves: only the report secret is accepted, compared whole;
 * only the production branch is kept; the report can write one row and
 * nothing else, with the service key; a failed build's cause is read from
 * its lines; a late "started" never undoes how that build ended; and the
 * reporter stays quiet anywhere but a production build on Workers Builds.
 *
 *   node scripts/test-builds.ts
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

import { onBuildReport } from '../worker/builds.ts';

const SUPABASE = 'https://stub.supabase.co';
const SECRET = 'report-secret-0123456789abcdef';
const BUILD = '0f8fad5b-d9cb-469f-a165-70867728950e';

let row: Record<string, unknown> | null = null;
let writes: { url: string; method: string; body: Record<string, unknown> }[] = [];

const stub = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const method = init?.method ?? 'GET';
  const auth = String((init?.headers as Record<string, string>)?.Authorization ?? '');
  assert.equal(auth, 'Bearer service-key', 'the row is reached with the service key only');
  if (!url.startsWith(`${SUPABASE}/rest/v1/build_status`)) throw new Error(`the report reached ${method} ${url}`);
  if (method === 'GET') return Response.json(row ? [row] : []);
  if (method === 'POST') {
    const body = JSON.parse(String(init?.body));
    writes.push({ url, method, body });
    row = body;
    return new Response('', { status: 201 });
  }
  throw new Error(`${method} on build_status`);
}) as typeof fetch;

const env = { SUPABASE_URL: SUPABASE, SUPABASE_SERVICE_ROLE_KEY: 'service-key', BUILD_REPORT_SECRET: SECRET };
const report = (body: Record<string, unknown>, secret = SECRET) =>
  new Request('https://aniragency.mn/api/builds', {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ build: BUILD, branch: 'main', sha: 'abc1234', ...body }),
  });

const results: Array<[string, string]> = [];
let failures = 0;
async function check(label: string, run: () => Promise<string> | string) {
  row = null;
  writes = [];
  try {
    results.push([label, await run()]);
  } catch (error) {
    failures += 1;
    results.push([label, `FAILED — ${(error as Error).message}`]);
  }
}

// ---------------------------------------------------------------- the route

await check('a build that starts, then passes', async () => {
  assert.equal((await onBuildReport(report({ event: 'started' }), env, stub)).status, 200);
  assert.equal(row?.state, 'building');
  assert.equal((await onBuildReport(report({ event: 'finished', code: 0 }), env, stub)).status, 200);
  assert.equal(row?.state, 'done');
  assert.ok(writes.every((w) => w.body.id === true), 'only the one row');
  return 'building, then done — the one row';
});

await check('a build that fails says why', async () => {
  await onBuildReport(report({ event: 'finished', code: 1, lines: ['  total 400 kB', '  FAIL  tiles are 198.3 kB over 300 kB together.', 'npm error code 1'] }), env, stub);
  assert.equal(row?.state, 'failed');
  assert.equal(row?.reason, 'budget');
  assert.match(String(row?.detail), /tiles are 198.3 kB over/);
  return 'failed, reason budget, the failing lines kept';
});

await check('causes, each by its own line', async () => {
  const cause = async (line: string) => {
    await onBuildReport(report({ event: 'finished', code: 1, lines: [line] }), env, stub);
    return row?.reason;
  };
  assert.equal(await cause('Error: content: hero.lede is number in the database, string in site.ts.'), 'content');
  assert.equal(await cause('  FAIL  the page shows the stand-in testimonial in a production build.'), 'claim');
  assert.equal(await cause('  FAIL  showreel.mp4 is 100.0 kB over the 1200.0 kB video cap.'), 'video');
  assert.equal(await cause('Error: admin copy: 1 missing'), 'labels');
  assert.equal(await cause('Error: something nobody planned for'), 'other');
  return 'content, claim, video, labels, other';
});

await check('a late «started» never undoes how the build ended', async () => {
  await onBuildReport(report({ event: 'finished', code: 0 }), env, stub);
  await onBuildReport(report({ event: 'started' }), env, stub);
  assert.equal(row?.state, 'done');
  return 'done stays done';
});

await check('the wrong secret, or none', async () => {
  assert.equal((await onBuildReport(report({ event: 'started' }, 'guess'), env, stub)).status, 401);
  assert.equal((await onBuildReport(report({ event: 'started' }, SECRET.slice(0, -1)), env, stub)).status, 401);
  assert.equal(writes.length, 0);
  return '401, nothing written';
});

await check('a preview build is not the admin\'s business', async () => {
  const response = await onBuildReport(report({ event: 'finished', code: 1, branch: 'feat/something' }), env, stub);
  assert.equal(response.status, 202);
  assert.equal(writes.length, 0);
  return '202 ignored, nothing written';
});

await check('nothing but a well-formed report', async () => {
  const bad = [{ event: 'started', build: '../x' }, { event: 'deleted' }, { event: 'finished', code: 999 }, { event: 'finished', code: 'x' }];
  for (const body of bad) assert.equal((await onBuildReport(report(body), env, stub)).status, 400, JSON.stringify(body));
  assert.equal(writes.length, 0);
  return '400 for a bad build id, event or exit code';
});

await check('not set up: says so only to the secret\'s holder', async () => {
  const said = async (response: Response) => [response.status, await response.text()] as const;
  const unset = await said(await onBuildReport(report({ event: 'started' }), { ...env, BUILD_REPORT_SECRET: '' }, stub));
  const wrong = await said(await onBuildReport(report({ event: 'started' }, 'guess'), env, stub));
  assert.deepEqual(unset, wrong, 'no secret set looks exactly like a wrong one');
  assert.equal(unset[0], 401);
  const noDatabase = await onBuildReport(report({ event: 'started' }), { ...env, SUPABASE_URL: '' }, stub);
  assert.equal(noDatabase.status, 503, 'the holder learns the rest is not set up');
  assert.equal(writes.length, 0);
  return 'no secret set: the same 401 as a wrong one; 503 only past the secret';
});

// ------------------------------------------------------------- the reporter

await check('the reporter stays quiet off production, and never fails', () => {
  const run = (environment: Record<string, string>) =>
    spawnSync(process.execPath, ['scripts/build-report.mjs', '1', 'missing.log'], {
      env: { PATH: process.env.PATH ?? '', ...environment },
      encoding: 'utf8',
    });
  const local = run({});
  const preview = run({ WORKERS_CI: '1', WORKERS_CI_BRANCH: 'feat/x', BUILD_REPORT_SECRET: 's', WORKERS_CI_BUILD_UUID: BUILD });
  const unset = run({ WORKERS_CI: '1', WORKERS_CI_BRANCH: 'main', WORKERS_CI_BUILD_UUID: BUILD });
  const unreachable = run({ WORKERS_CI: '1', WORKERS_CI_BRANCH: 'main', BUILD_REPORT_SECRET: 's', WORKERS_CI_BUILD_UUID: BUILD, BUILD_REPORT_URL: 'http://127.0.0.1:9/api/builds' });
  assert.match(local.stdout, /not on Workers Builds/);
  assert.match(preview.stdout, /feat\/x is not main/);
  assert.match(unset.stdout, /BUILD_REPORT_SECRET is not set/);
  assert.match(unreachable.stdout, /not sent/);
  assert.ok([local, preview, unset, unreachable].every((r) => r.status === 0), 'the reporter must exit 0');
  return 'local, preview, unset: skipped; unreachable: not sent — every one exits 0';
});

// -------------------------------------------------------------------- report

const width = Math.max(...results.map(([label]) => label.length));
console.log('');
for (const [label, detail] of results) console.log(`  ${detail.startsWith('FAILED') ? 'x' : '+'} ${label.padEnd(width)}  ${detail}`);
console.log(`\n  ${results.length - failures}/${results.length} passed\n`);
process.exit(failures ? 1 : 0);
