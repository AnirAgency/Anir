/**
 * The task list is coupled one way (CLAUDE.md > The admin > The task list):
 * whatever fails in its code answers /api/tasks* with an error, and nothing
 * else the site does changes. This proves it, twice over.
 *
 * By running the real Worker (worker/index.ts > makeWorker) with the task
 * code replaced by code that fails — once failing to load, once loading and
 * throwing on every call — and checking that pages still come from the
 * static assets, the enquiry form still stores, the health check, the inbox
 * routes and the schedule still answer as before, and /api/tasks alone says
 * it failed, with the same security headers as any other route.
 *
 * And by reading the source: worker/index.ts never imports the task code at
 * start-up (only `import type` and the on-demand loader), and no public page,
 * layout, component, style or shared library imports the task code or its
 * codes — only the Worker's task routes and the admin's task script do.
 *
 *   node scripts/test-isolation.ts      (after `npm run build`, which writes
 *                                       worker/security-headers.generated.json)
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

if (!existsSync(new URL('../worker/security-headers.generated.json', import.meta.url))) {
  console.error('\n  worker/security-headers.generated.json is missing — run `npm run build` first.\n');
  process.exit(1);
}
const { makeWorker } = await import('../worker/index.ts');

const PAGE = '<!doctype html><html lang="mn"><title>Anir</title><h1>Анир</h1></html>';
let stored: unknown[] = [];
let assetsAsked: string[] = [];

const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(String(input));
  if (url.pathname === '/rest/v1/enquiries' && (init?.method ?? 'GET') === 'POST') {
    stored.push(JSON.parse(String(init?.body)));
    return new Response('', { status: 201 });
  }
  if (url.pathname === '/auth/v1/user') return new Response('{}', { status: 401 });
  if (url.hostname === 'api.telegram.org') return Response.json({ ok: true });
  return realFetch(input, init);
}) as typeof fetch;

const kv = () => {
  const store = new Map<string, string>();
  return {
    get: async (key: string) => store.get(key) ?? null,
    put: async (key: string, value: string) => void store.set(key, value),
    delete: async (key: string) => void store.delete(key),
    list: async ({ prefix }: { prefix: string }) => ({ keys: [...store.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })), list_complete: true }),
  };
};
const env = () => ({
  SUPABASE_URL: 'https://stub.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-key',
  RATE_LIMIT: kv(),
  ENQUIRY_BUFFER: kv(),
  ASSETS: {
    fetch: async (request: Request) => {
      assetsAsked.push(new URL(request.url).pathname);
      const path = new URL(request.url).pathname;
      return path === '/' || path === '/products/' ? new Response(PAGE, { headers: { 'Content-Type': 'text/html' } }) : new Response('<h1>404</h1>', { status: 404, headers: { 'Content-Type': 'text/html' } });
    },
  },
});
const waited: Promise<unknown>[] = [];
const ctx = { waitUntil: (promise: Promise<unknown>) => void waited.push(promise) };

const results: Array<[string, string]> = [];
let failures = 0;
async function check(label: string, run: () => Promise<string>) {
  stored = [];
  assetsAsked = [];
  try {
    results.push([label, await run()]);
  } catch (error) {
    failures += 1;
    results.push([label, `FAILED — ${(error as Error).message}`]);
  }
}
const quiet = { log: console.log, error: console.error, warn: console.warn };
console.log = console.error = console.warn = () => {};

const form = () =>
  new Request('https://anir.example.workers.dev/api/enquiry', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'CF-Connecting-IP': '203.0.113.9' },
    body: JSON.stringify({ service: 'web', budget: '1-3m', timing: 'this-month', name: 'Бат', contact: 'bat@example.com', message: 'Сайт' }),
  });

// Each of the team's tools, broken two ways: the other tool, and the site, must not notice.
const TOOLS = {
  tasks: { name: 'task list', path: '/api/tasks', nested: '/api/tasks/report', handler: 'onTasks', other: '/api/contributions' },
  contributions: { name: 'Schedule 2', path: '/api/contributions', nested: '/api/contributions/0a0a0a0a-0000-4000-8000-00000000000a/repay', handler: 'onContributions', other: '/api/tasks' },
} as const;
const broken = (handler: string) => ({
  'fails to load': () => Promise.reject(new Error('the module failed to load')),
  'throws on every call': async () => ({
    [handler]: async () => {
      throw new Error('the route threw');
    },
  }),
});

for (const [tool, about] of Object.entries(TOOLS))
for (const [how, loader] of Object.entries(broken(about.handler))) {
  await check(`the ${about.name} code ${how}: the site is untouched`, async () => {
    const worker = makeWorker({ [tool]: loader } as never);
    const page = await worker.fetch(new Request('https://anir.example.workers.dev/'), env() as never, ctx);
    assert.equal(page.status, 200);
    assert.equal(await page.text(), PAGE, 'the home page, from the static assets');
    assert.equal((await worker.fetch(new Request('https://anir.example.workers.dev/products/'), env() as never, ctx)).status, 200);
    assert.equal((await worker.fetch(new Request('https://anir.example.workers.dev/no-such-page'), env() as never, ctx)).status, 404, 'the 404 page, as before');

    const enquiry = await worker.fetch(form(), env() as never, ctx);
    assert.equal(enquiry.status, 200);
    assert.equal(stored.length, 1, 'the enquiry is stored');

    assert.equal((await worker.fetch(new Request('https://anir.example.workers.dev/api/health'), env() as never, ctx)).status, 401, 'the health check answers as ever');
    assert.equal((await worker.fetch(new Request('https://anir.example.workers.dev/api/enquiries'), env() as never, ctx)).status, 401, 'the inbox answers as ever');
    assert.equal((await worker.fetch(new Request('https://anir.example.workers.dev/api/alerts'), env() as never, ctx)).status, 401);
    await worker.scheduled({}, env() as never, ctx);
    await Promise.all(waited.splice(0));

    const failed = await worker.fetch(new Request(`https://anir.example.workers.dev${about.path}`, { headers: { Authorization: 'Bearer x' } }), env() as never, ctx);
    assert.equal(failed.status, 500);
    assert.deepEqual(await failed.json(), { ok: false, error: tool }, 'only this route says it failed — and not why');
    assert.ok(failed.headers.get('Content-Security-Policy'), 'with the security headers every route carries');
    assert.equal(failed.headers.get('X-Robots-Tag'), 'noindex');
    const nested = await worker.fetch(new Request(`https://anir.example.workers.dev${about.nested}`, { method: 'POST' }), env() as never, ctx);
    assert.equal(nested.status, 500);
    // The other tool is its own wall: it answers a stranger as it always does.
    const other = await worker.fetch(new Request(`https://anir.example.workers.dev${about.other}`), env() as never, ctx);
    assert.equal(other.status, 401, `${about.other} is not taken down with it`);
    return `pages 200 from the assets, 404 as before, enquiry stored, health/inbox/alerts answer, schedule runs, ${about.other} 401 as ever; ${about.path}* alone: 500`;
  });
}

for (const [tool, about] of Object.entries(TOOLS)) {
  await check(`the real ${about.name} code loads only when asked for, and answers a stranger 401`, async () => {
    const worker = makeWorker();
    const response = await worker.fetch(new Request(`https://anir.example.workers.dev${about.path}`), env() as never, ctx);
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { ok: false, error: 'signed-out' });
    return `${about.path} with no session: 401 signed-out (${tool})`;
  });
}

/* ------------------------------------------------------- what imports what */

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const files = (dir: string): string[] =>
  (readdirSync(join(root, dir)) as string[]).flatMap((name: string) => {
    const full = join(root, dir, name);
    return statSync(full).isDirectory() ? files(relative(root, full)) : [relative(root, full).split(sep).join('/')];
  });
const imports = (file: string) => [...readFileSync(join(root, file), 'utf8').matchAll(/(?:^|\n)\s*import\s+(type\s+)?[^'"]*?from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => ({ type: !!m[1], dynamic: !!m[3], target: (m[2] ?? m[3]) as string }));
// The team's tools: the task list, Schedule 2, and the little they share (worker/team.ts).
const TOOL_CODE = /(^|\/)(tasks|task-codes|admin-tasks|contributions|contribution-codes|admin-contributions|team)(\.ts)?$/;
const OWN_CODES = ['src/lib/task-codes.ts', 'src/lib/contribution-codes.ts'];

await check("worker/index.ts never imports the team's tools at start-up", async () => {
  const found = imports('worker/index.ts').filter((i) => TOOL_CODE.test(i.target));
  const eager = found.filter((i) => !i.type && !i.dynamic);
  assert.deepEqual(eager, [], 'a static import would load it with everything else');
  for (const tool of ['tasks', 'contributions']) assert.ok(found.some((i) => i.dynamic && i.target === `./${tool}.ts`), `${tool}: loaded on demand`);
  return `${found.length} reference(s): ${found.map((i) => `${i.target} ${i.dynamic ? 'import() on demand' : 'import type'}`).join(', ')}`;
});

await check("no public page, layout, component, style or shared library imports the team's tools", async () => {
  const outside = ['src/pages', 'src/components', 'src/layouts', 'src/styles', 'src/content', 'src/lib']
    .flatMap(files)
    .filter((file) => /\.(astro|ts|mjs|js)$/.test(file) && !OWN_CODES.includes(file))
    .filter((file) => imports(file).some((i) => TOOL_CODE.test(i.target)));
  assert.deepEqual(outside, []);
  const importers = ['src/scripts', 'worker', 'src/pages/admin']
    .flatMap(files)
    .filter((file) => /\.(astro|ts|mjs)$/.test(file) && imports(file).some((i) => TOOL_CODE.test(i.target)) && !TOOL_CODE.test(file.replace(/\.(ts|mjs)$/, '')));
  return `none; the tools' code is imported only by ${importers.join(', ')}`;
});

Object.assign(console, quiet);
const width = Math.max(...results.map(([label]) => label.length));
console.log('');
for (const [label, detail] of results) console.log(`  ${detail.startsWith('FAILED') ? 'x' : '+'} ${label.padEnd(width)}  ${detail}`);
console.log(`\n  ${results.length - failures}/${results.length} passed\n`);
process.exit(failures ? 1 : 0);
