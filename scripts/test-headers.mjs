/**
 * Header check against a running site — wrangler dev locally, or the deployed
 * Worker. Workers Static Assets applies _headers to files but not to responses
 * the Worker makes, so the one place this can break silently is /api/enquiry,
 * the endpoint that takes user input. This asserts it carries exactly the
 * security headers the home page does, and that the cache rules landed.
 *
 * The POST is deliberately invalid: it is answered by the Worker (422) before
 * the rate limiter or Supabase, so running this stores nothing and costs no
 * one their submission allowance.
 *
 *   node scripts/test-headers.mjs https://anir.<account>.workers.dev
 */
import assert from 'node:assert/strict';

const base = (process.argv[2] ?? 'http://localhost:8787').replace(/\/$/, '');

const SECURITY = [
  'content-security-policy',
  'x-content-type-options',
  'referrer-policy',
  'permissions-policy',
  'x-frame-options',
  'strict-transport-security',
];

const results = [];
let failures = 0;
async function check(label, run) {
  try {
    results.push([label, (await run()) ?? 'ok']);
  } catch (error) {
    failures += 1;
    results.push([label, `FAILED — ${error.message}`]);
  }
}

const pick = (response) => Object.fromEntries(SECURITY.map((name) => [name, response.headers.get(name)]));

const home = await fetch(`${base}/`);
const api = await fetch(`${base}/api/enquiry`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
  body: '{}',
});
const missing = await fetch(`${base}/api/enquiry`);

await check('home page carries every security header', () => {
  for (const [name, value] of Object.entries(pick(home))) assert.ok(value, `${name} missing on /`);
  return `${SECURITY.length} headers`;
});

await check('POST /api/enquiry is answered by the Worker', () => {
  assert.equal(api.status, 422);
  return `${api.status}, ${api.headers.get('content-type')}`;
});

await check('POST /api/enquiry carries the same security headers as /', () => {
  assert.deepEqual(pick(api), pick(home));
  return 'identical';
});

await check('GET /api/enquiry falls through to the assets with them too', () => {
  assert.equal(missing.status, 404);
  assert.deepEqual(pick(missing), pick(home));
  return '404, identical';
});

await check('the enquiry reply is never cached', () => {
  assert.equal(api.headers.get('cache-control'), 'no-store');
});

await check('HTML revalidates on every visit', () => {
  assert.match(home.headers.get('cache-control') ?? '', /max-age=0/);
  return home.headers.get('cache-control');
});

const html = await home.text();
const asset = html.match(/\/_astro\/[^"']+\.(?:css|js)/)?.[0];
const font = html.match(/\/fonts\/[^"']+\.woff2/)?.[0];
for (const [label, path] of [['hashed assets', asset], ['fonts', font]]) {
  await check(`${label} are cached for a year, immutable`, async () => {
    assert.ok(path, `no ${label} referenced from /`);
    const response = await fetch(`${base}${path}`);
    assert.equal(response.headers.get('cache-control'), 'public, max-age=31536000, immutable');
    return path;
  });
}

const width = Math.max(...results.map(([label]) => label.length));
console.log(`\n  ${base}\n`);
for (const [label, outcome] of results) console.log(`  ${outcome.startsWith('FAILED') ? 'x' : '+'} ${label.padEnd(width)}  ${outcome}`);
console.log(`\n  ${results.length - failures}/${results.length} passed\n`);
process.exit(failures ? 1 : 0);
