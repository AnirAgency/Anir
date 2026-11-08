/**
 * The task list's routes (worker/tasks.ts) without Wrangler, Supabase or
 * Telegram: a stand-in for Supabase Auth and the editors table, a tasks table
 * that filters, counts and refuses a stale updated_at the way PostgREST does,
 * and a Telegram that records which chat each message went to.
 *
 * What this proves: strangers get 401 on every route and learn nothing; a
 * task needs a "done means" that is not the title again; «mine» is the
 * default; anyone may submit, only the named approver approves or sends back,
 * and sending back needs a reason; refused transitions are refused; a stale
 * write is a conflict, never an overwrite; the Тайлан reads one person's
 * week; exactly three messages go to the tasks group — never the enquiries
 * one — and with TELEGRAM_TASKS_CHAT_ID unset they are skipped, nothing
 * thrown, everything else the same.
 *
 *   node scripts/test-tasks.ts
 */
import assert from 'node:assert/strict';

import { onTasks, type Task } from '../worker/tasks.ts';
import { ubToday, weekOf } from '../src/lib/task-codes.ts';

const A = '0a0a0a0a-0000-4000-8000-00000000000a'; // anna — creates, approves
const B = '0b0b0b0b-0000-4000-8000-00000000000b'; // bold — does the work
const C = '0c0c0c0c-0000-4000-8000-00000000000c'; // saraa — finishes a colleague's task
const tokens: Record<string, { id: string; email: string; editor: boolean }> = {
  'tok-anna': { id: A, email: 'anna@anir.mn', editor: true },
  'tok-bold': { id: B, email: 'bold@anir.mn', editor: true },
  'tok-saraa': { id: C, email: 'saraa@anir.mn', editor: true },
  'tok-visitor': { id: '0d0d0d0d-0000-4000-8000-00000000000d', email: 'v@example.com', editor: false },
};

let rows: Task[] = [];
let telegram: { chat: string; text: string }[] = [];
let tick = 0;
const stamp = () => new Date(Date.UTC(2026, 10, 9, 2, 0, 0) + ++tick * 1000).toISOString();

/* A PostgREST filter, for the queries worker/tasks.ts makes. */
const value = (task: Task, column: string) => (task as unknown as Record<string, unknown>)[column];
const compare = (a: unknown, b: string) => (/T/.test(b) || /T/.test(String(a)) ? Date.parse(String(a)) - Date.parse(b) : String(a) < b ? -1 : String(a) > b ? 1 : 0);
function test(task: Task, column: string, expression: string): boolean {
  const [op, ...rest] = expression.split('.');
  const arg = rest.join('.');
  const v = value(task, column);
  if (op === 'eq') return String(v) === arg;
  if (op === 'neq') return String(v) !== arg;
  if (op === 'lt') return v !== null && compare(v, arg) < 0;
  if (op === 'gte') return v !== null && compare(v, arg) >= 0;
  if (op === 'in') return arg.replace(/[()]/g, '').split(',').includes(String(v));
  if (op === 'not' && arg === 'is.null') return v !== null && v !== undefined;
  throw new Error(`stub: no operator ${expression}`);
}
function where(params: URLSearchParams) {
  const checks: ((task: Task) => boolean)[] = [];
  for (const [key, expression] of params) {
    if (['select', 'order', 'limit'].includes(key)) continue;
    if (key === 'or') {
      const groups = expression.replace(/^\(|\)$/g, '').split(/,(?=and\()/).map((g) => g.replace(/^and\(|\)$/g, '').split(','));
      checks.push((task) => groups.some((conds) => conds.every((c) => test(task, c.split('.')[0], c.split('.').slice(1).join('.')))));
    } else checks.push((task) => test(task, key, expression));
  }
  return (task: Task) => checks.every((check) => check(task));
}

const stub = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(String(input));
  const headers = (init?.headers ?? {}) as Record<string, string>;
  if (url.hostname === 'api.telegram.org') {
    const body = JSON.parse(String(init?.body));
    telegram.push({ chat: String(body.chat_id), text: body.text });
    return Response.json({ ok: true });
  }
  if (url.pathname === '/auth/v1/user') {
    const who = tokens[(headers.Authorization ?? '').replace('Bearer ', '')];
    return who ? Response.json({ id: who.id, email: who.email }) : new Response('{}', { status: 401 });
  }
  if (url.pathname === '/rest/v1/editors') {
    const editors = Object.values(tokens).filter((who) => who.editor);
    if (url.searchParams.get('select') === 'user_id') {
      const id = (url.searchParams.get('user_id') ?? '').replace('eq.', '');
      return Response.json(editors.filter((e) => e.id === id).map((e) => ({ user_id: e.id })));
    }
    assert.equal(headers.Authorization, 'Bearer service-key', 'the editors list is read with the service key');
    return Response.json(editors.map((e) => ({ user_id: e.id, email: e.email })));
  }
  if (url.pathname === '/rest/v1/tasks') {
    assert.equal(headers.Authorization, 'Bearer service-key', 'the table is reached with the service key only');
    const method = init?.method ?? 'GET';
    if (method === 'GET') {
      const found = rows.filter(where(url.searchParams));
      if (headers.Prefer === 'count=exact') return new Response('[]', { headers: { 'Content-Range': found.length ? `0-0/${found.length}` : '*/0' } });
      return Response.json(found);
    }
    if (method === 'POST') {
      const made = { id: crypto.randomUUID(), created_at: stamp(), updated_at: stamp(), due_date: null, state: 'new', submitted_at: null, submitted_by: null, decided_at: null, decided_by: null, reject_reason: null, ...JSON.parse(String(init?.body)) } as Task;
      rows.push(made);
      return Response.json([made], { status: 201 });
    }
    if (method === 'PATCH') {
      const target = rows.filter(where(url.searchParams));
      for (const task of target) Object.assign(task, JSON.parse(String(init?.body)), { updated_at: stamp() });
      return Response.json(target);
    }
  }
  throw new Error(`unexpected fetch: ${init?.method ?? 'GET'} ${url}`);
}) as typeof fetch;

const env = (extra: Record<string, string> = {}) => ({
  SUPABASE_URL: 'https://tyrzajpotvtirfjmacfm.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-key',
  TELEGRAM_BOT_TOKEN: 'bot',
  TELEGRAM_CHAT_ID: '-100-enquiries',
  TELEGRAM_TASKS_CHAT_ID: '-200-tasks',
  ...extra,
});
const call = async (token: string | null, method: string, path: string, body?: unknown, environment = env()) => {
  const response = await onTasks(
    new Request(`https://aniragency.mn${path}`, {
      method,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    environment as never,
    { fetcher: stub }
  );
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
};
const newTask = (extra: Record<string, unknown> = {}) => ({
  title: 'Ezmath-ын 7-р ангийн бодлогууд',
  done_means: '40 бодлого шийдлийн хамт Ezmath-д орсон, хоёр нь шалгасан',
  project: 'ezmath',
  owner_id: B,
  due_date: '2026-11-20',
  ...extra,
});

const results: Array<[string, string]> = [];
let failures = 0;
async function check(label: string, run: () => Promise<string>) {
  rows = [];
  telegram = [];
  try {
    results.push([label, await run()]);
  } catch (error) {
    failures += 1;
    results.push([label, `FAILED — ${(error as Error).message}`]);
  }
}
const quiet = { log: console.log, error: console.error };
console.log = console.error = () => {};

// --------------------------------------------------------------- strangers

await check('strangers get 401 on every route, and learn nothing', async () => {
  const id = crypto.randomUUID();
  const routes: [string, string, unknown?][] = [['GET', '/api/tasks'], ['GET', '/api/tasks/counts'], ['GET', '/api/tasks/report'], ['POST', '/api/tasks', newTask()], ['POST', `/api/tasks/${id}`, {}], ['POST', `/api/tasks/${id}/move`, { move: 'start' }]];
  for (const [method, path, body] of routes) {
    for (const token of [null, 'forged']) {
      const answer = await call(token, method, path, body);
      assert.equal(answer.status, 401, `${method} ${path} as ${token ?? 'nobody'}`);
      assert.deepEqual(answer.body, { ok: false, error: 'signed-out' }, 'the same refusal everywhere');
    }
    assert.equal((await call('tok-visitor', method, path, body)).status, 403, 'signed in, not an editor');
  }
  assert.equal(rows.length, 0);
  return '6 routes × no token, forged: 401 signed-out; a non-editor: 403; nothing written';
});

// ------------------------------------------------------------------ create

await check('a task says what done means — required, never the title again', async () => {
  const refusals = [
    [{ done_means: '' }, 'done-means'],
    [{ done_means: 'Ezmath-ын 7-р ангийн бодлогууд.' }, 'done-means-repeats-title'],
    [{ title: '  ' }, 'title'],
    [{ project: 'marketing' }, 'project'],
    [{ owner_id: '0d0d0d0d-0000-4000-8000-00000000000d' }, 'owner'],
    [{ due_date: '20 November' }, 'due'],
  ] as const;
  for (const [extra, code] of refusals) assert.deepEqual((await call('tok-anna', 'POST', '/api/tasks', newTask(extra))).body, { ok: false, error: code });
  assert.equal(rows.length, 0);
  const made = await call('tok-anna', 'POST', '/api/tasks', newTask());
  assert.equal(made.status, 201);
  const item = made.body.item as Task;
  assert.equal(item.state, 'new');
  assert.equal(item.approver_id, A, 'the approver defaults to whoever created it');
  assert.equal(item.created_by, A);
  return `6 refusals by code; created: state new, approver ${'anna'} by default`;
});

// --------------------------------------------------------- list and badge

await check('«mine» by default: assigned to me and not done, or waiting on my approval', async () => {
  const mk = (extra: Record<string, unknown>, token = 'tok-anna') => call(token, 'POST', '/api/tasks', newTask(extra));
  const forBold = (await mk({ title: 'Болдын ажил' })).body.item as Task;
  await mk({ title: 'Анна өөрийнхөө ажил', owner_id: A });
  await mk({ title: 'Сараагийн ажил', owner_id: C, approver_id: C, project: 'site', due_date: '2026-11-01' });
  // Bold submits his: it now waits on Anna, its approver.
  await call('tok-bold', 'POST', `/api/tasks/${forBold.id}/move`, { move: 'submit', updated_at: forBold.updated_at });
  const anna = await call('tok-anna', 'GET', '/api/tasks');
  const titles = (anna.body.items as Task[]).map((x) => x.title).sort();
  assert.deepEqual(titles, ['Анна өөрийнхөө ажил', 'Болдын ажил'], "Anna's own, and Bold's waiting on her approval — not Saraa's");
  assert.equal((await call('tok-anna', 'GET', '/api/tasks?view=all')).body.items && ((await call('tok-anna', 'GET', '/api/tasks?view=all')).body.items as Task[]).length, 3);
  assert.equal(((await call('tok-anna', 'GET', `/api/tasks?view=all&owner=${C}`)).body.items as Task[]).length, 1);
  assert.equal(((await call('tok-anna', 'GET', '/api/tasks?view=all&project=site')).body.items as Task[]).length, 1);
  assert.equal(((await call('tok-anna', 'GET', '/api/tasks?view=all&state=submitted')).body.items as Task[]).length, 1);
  const overdue = (await call('tok-anna', 'GET', '/api/tasks?view=all&overdue=1')).body.items as Task[];
  assert.deepEqual(overdue.map((x) => x.title), ['Сараагийн ажил'], 'due 1 November, not approved');
  assert.deepEqual((await call('tok-anna', 'GET', '/api/tasks/counts')).body, { ok: true, mine: 1, approve: 1 });
  assert.deepEqual((await call('tok-bold', 'GET', '/api/tasks/counts')).body, { ok: true, mine: 0, approve: 0 }, 'submitted is no longer his to do');
  return 'mine: own + awaiting approval; all, owner, project, state, overdue filters; badge {mine 1, approve 1}';
});

// ----------------------------------------------------------- transitions

await check('anyone may submit; only the approver approves or sends back, with a reason', async () => {
  let task = (await call('tok-anna', 'POST', '/api/tasks', newTask())).body.item as Task;
  telegram = [];
  // Saraa finishes Bold's task: allowed, and she is who submitted.
  let r = await call('tok-saraa', 'POST', `/api/tasks/${task.id}/move`, { move: 'submit', updated_at: task.updated_at });
  assert.equal(r.status, 200);
  task = r.body.item as Task;
  assert.equal(task.state, 'submitted');
  assert.equal(task.submitted_by, C);
  // Not the approver: refused.
  assert.deepEqual((await call('tok-bold', 'POST', `/api/tasks/${task.id}/move`, { move: 'approve', updated_at: task.updated_at })).body, { ok: false, error: 'not-approver' });
  assert.deepEqual((await call('tok-saraa', 'POST', `/api/tasks/${task.id}/move`, { move: 'sendBack', reason: 'no', updated_at: task.updated_at })).body, { ok: false, error: 'not-approver' });
  // The approver, without a reason: refused.
  assert.deepEqual((await call('tok-anna', 'POST', `/api/tasks/${task.id}/move`, { move: 'sendBack', reason: '   ', updated_at: task.updated_at })).body, { ok: false, error: 'reason-required' });
  r = await call('tok-anna', 'POST', `/api/tasks/${task.id}/move`, { move: 'sendBack', reason: 'Шийдлүүд дутуу', updated_at: task.updated_at });
  task = r.body.item as Task;
  assert.equal(task.state, 'doing');
  assert.equal(task.reject_reason, 'Шийдлүүд дутуу');
  r = await call('tok-bold', 'POST', `/api/tasks/${task.id}/move`, { move: 'submit', updated_at: task.updated_at });
  task = r.body.item as Task;
  r = await call('tok-anna', 'POST', `/api/tasks/${task.id}/move`, { move: 'approve', updated_at: task.updated_at });
  task = r.body.item as Task;
  assert.equal(task.state, 'approved');
  assert.equal(task.decided_by, A);
  assert.equal(task.reject_reason, null);
  return 'Saraa submits Bold\'s: ok; Bold and Saraa approving: 403; no reason: 400; sent back, resubmitted, approved';
});

await check('transitions that make no sense are refused', async () => {
  const task = (await call('tok-anna', 'POST', '/api/tasks', newTask({ owner_id: A }))).body.item as Task;
  const tries: [string, string][] = [['approve', 'new'], ['sendBack', 'new']];
  for (const [move] of tries) assert.equal((await call('tok-anna', 'POST', `/api/tasks/${task.id}/move`, { move, reason: 'x', updated_at: task.updated_at })).body.error, 'bad-transition', `${move} from new`);
  assert.equal((await call('tok-anna', 'POST', `/api/tasks/${task.id}/move`, { move: 'teleport', updated_at: task.updated_at })).body.error, 'bad-move');
  let current = ((await call('tok-anna', 'POST', `/api/tasks/${task.id}/move`, { move: 'submit', updated_at: task.updated_at })).body.item) as Task;
  assert.equal((await call('tok-anna', 'POST', `/api/tasks/${task.id}/move`, { move: 'submit', updated_at: current.updated_at })).body.error, 'bad-transition', 'submitted twice');
  assert.equal((await call('tok-anna', 'POST', `/api/tasks/${task.id}/move`, { move: 'start', updated_at: current.updated_at })).body.error, 'bad-transition', 'started when submitted');
  current = (await call('tok-anna', 'POST', `/api/tasks/${task.id}/move`, { move: 'approve', updated_at: current.updated_at })).body.item as Task;
  for (const move of ['start', 'submit', 'approve', 'sendBack']) {
    const r = await call('tok-anna', 'POST', `/api/tasks/${task.id}/move`, { move, reason: 'x', updated_at: current.updated_at });
    assert.equal(r.status, 409, `${move} after approval`);
  }
  assert.equal((await call('tok-anna', 'POST', `/api/tasks/${task.id}`, { title: 'Өөр', updated_at: current.updated_at })).body.error, 'approved', 'an approved task is not edited');
  return 'approve/send back from new, an unknown move, submit twice, start when submitted, anything after approval: refused';
});

await check('a stale write is a conflict, never an overwrite', async () => {
  const task = (await call('tok-anna', 'POST', '/api/tasks', newTask())).body.item as Task;
  const fresh = (await call('tok-bold', 'POST', `/api/tasks/${task.id}`, { due_date: '2026-11-25', updated_at: task.updated_at })).body.item as Task;
  assert.equal(fresh.due_date, '2026-11-25');
  // Anna still holds the version she read: both kinds of write are refused.
  assert.deepEqual((await call('tok-anna', 'POST', `/api/tasks/${task.id}`, { title: 'Анна засав', updated_at: task.updated_at })).body, { ok: false, error: 'conflict' });
  assert.deepEqual((await call('tok-anna', 'POST', `/api/tasks/${task.id}/move`, { move: 'start', updated_at: task.updated_at })).body, { ok: false, error: 'conflict' });
  assert.equal(rows[0].title, newTask().title, 'nothing overwritten');
  assert.equal(rows[0].due_date, '2026-11-25');
  assert.deepEqual((await call('tok-anna', 'POST', `/api/tasks/${task.id}`, { title: 'x' })).body, { ok: false, error: 'no-version' });
  return 'edit and move with the version read before another save: 409 conflict; no version: 400';
});

// ------------------------------------------------------------------ report

await check('the Тайлан reads one person\'s week', async () => {
  const week = weekOf(ubToday());
  let a = (await call('tok-anna', 'POST', '/api/tasks', newTask({ title: 'Нэгдүгээр ажил' }))).body.item as Task;
  let b = (await call('tok-anna', 'POST', '/api/tasks', newTask({ title: 'Хоёрдугаар ажил' }))).body.item as Task;
  await call('tok-anna', 'POST', '/api/tasks', newTask({ title: 'Хоцорсон ажил', due_date: '2026-01-05' }));
  a = (await call('tok-bold', 'POST', `/api/tasks/${a.id}/move`, { move: 'submit', updated_at: a.updated_at })).body.item as Task;
  b = (await call('tok-bold', 'POST', `/api/tasks/${b.id}/move`, { move: 'submit', updated_at: b.updated_at })).body.item as Task;
  await call('tok-anna', 'POST', `/api/tasks/${a.id}/move`, { move: 'approve', updated_at: a.updated_at });
  await call('tok-anna', 'POST', `/api/tasks/${b.id}/move`, { move: 'sendBack', reason: 'Зураг дутуу', updated_at: b.updated_at });
  // Stamps are set in this week; the stub's clock starts on 9 November.
  for (const task of rows) for (const key of ['submitted_at', 'decided_at'] as const) if (task[key]) task[key] = `${week.start}T03:00:00.000Z`;
  const r = (await call('tok-anna', 'GET', `/api/tasks/report?person=${B}`)).body;
  const titles = (key: string) => (r[key] as Task[]).map((x) => x.title);
  assert.deepEqual(r.week, { start: week.start, end: week.end });
  assert.deepEqual(titles('submitted').sort(), ['Нэгдүгээр ажил', 'Хоёрдугаар ажил']);
  assert.deepEqual(titles('approved'), ['Нэгдүгээр ажил']);
  assert.deepEqual(titles('sentBack'), ['Хоёрдугаар ажил']);
  assert.equal((r.sentBack as Task[])[0].reject_reason, 'Зураг дутуу');
  assert.deepEqual(titles('overdue'), ['Хоцорсон ажил']);
  const lastWeek = (await call('tok-anna', 'GET', `/api/tasks/report?person=${B}&week=2026-01-01`)).body;
  assert.deepEqual([(lastWeek.submitted as Task[]).length, (lastWeek.approved as Task[]).length], [0, 0], 'another week: none of it');
  return `week ${week.start}: submitted 2, approved 1, sent back 1 with its reason, overdue 1; another week empty`;
});

// ---------------------------------------------------------------- Telegram

await check('exactly three messages, to the tasks group only', async () => {
  let task = (await call('tok-anna', 'POST', '/api/tasks', newTask())).body.item as Task; // 1 assigned → Bold
  await call('tok-anna', 'POST', '/api/tasks', newTask({ owner_id: A })); // self-assigned: nothing
  task = (await call('tok-bold', 'POST', `/api/tasks/${task.id}/move`, { move: 'start', updated_at: task.updated_at })).body.item as Task; // start: nothing
  task = (await call('tok-bold', 'POST', `/api/tasks/${task.id}/move`, { move: 'submit', updated_at: task.updated_at })).body.item as Task; // 2 submitted → Anna
  task = (await call('tok-anna', 'POST', `/api/tasks/${task.id}/move`, { move: 'sendBack', reason: 'Шийдлүүд дутуу', updated_at: task.updated_at })).body.item as Task; // 3 sent back → Bold
  task = (await call('tok-bold', 'POST', `/api/tasks/${task.id}/move`, { move: 'submit', updated_at: task.updated_at })).body.item as Task; // 4 submitted again → Anna
  await call('tok-anna', 'POST', `/api/tasks/${task.id}/move`, { move: 'approve', updated_at: task.updated_at }); // approve: nothing
  assert.ok(telegram.every((m) => m.chat === '-200-tasks'), 'never the enquiries chat');
  assert.equal(telegram.length, 4);
  assert.match(telegram[0].text, /^bold@anir\.mn: танд шинэ даалгавар — «Ezmath-ын 7-р ангийн бодлогууд»/);
  assert.match(telegram[1].text, /^anna@anir\.mn: «.+» хийгдсэн гэж bold@anir\.mn илгээлээ/);
  assert.match(telegram[2].text, /^bold@anir\.mn: «.+» буцаагдлаа\. Шалтгаан: Шийдлүүд дутуу$/);
  return 'assigned, submitted, sent back (with the reason), submitted again — 4 to -200-tasks; start, approve, self-assign: silent';
});

await check('TELEGRAM_TASKS_CHAT_ID unset: skipped, nothing thrown, everything else the same', async () => {
  const unset = env({ TELEGRAM_TASKS_CHAT_ID: '' });
  const made = await call('tok-anna', 'POST', '/api/tasks', newTask(), unset);
  assert.equal(made.status, 201);
  let task = made.body.item as Task;
  task = (await call('tok-bold', 'POST', `/api/tasks/${task.id}/move`, { move: 'submit', updated_at: task.updated_at }, unset)).body.item as Task;
  const back = await call('tok-anna', 'POST', `/api/tasks/${task.id}/move`, { move: 'sendBack', reason: 'Дутуу', updated_at: task.updated_at }, unset);
  assert.equal(back.status, 200);
  assert.equal(telegram.length, 0, 'not one message — and never to the enquiries chat instead');
  return 'create 201, submit and send back 200, no message to any chat, nothing thrown';
});

Object.assign(console, quiet);
const width = Math.max(...results.map(([label]) => label.length));
console.log('');
for (const [label, detail] of results) console.log(`  ${detail.startsWith('FAILED') ? 'x' : '+'} ${label.padEnd(width)}  ${detail}`);
console.log(`\n  ${results.length - failures}/${results.length} passed\n`);
process.exit(failures ? 1 : 0);
