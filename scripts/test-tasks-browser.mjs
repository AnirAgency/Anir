/**
 * The task list in a real browser: the built admin (dist/admin/), driven
 * through the Chrome DevTools Protocol (./browser/cdp.mjs), with a small
 * server in this process playing the Worker's routes and Supabase answered
 * through CDP — nothing real is touched.
 *
 * What this proves, as an editor sees it:
 *   - «Даалгавар» carries two numbers, not one: mine to do, and waiting on
 *     my approval (marked ✓ — told apart by its sign, not colour alone);
 *   - it opens on «Минийх»: what is assigned to me and what waits on me,
 *     never the whole list; «Бүгд» is a click away;
 *   - an overdue task says so on its row, in words and a sign;
 *   - the Тайлан opens on this week and steps a week back and forth,
 *     asking the Worker for the week it shows;
 *   - «Дууссан гэдэг нь» that repeats the title, and a send-back with no
 *     reason, are refused before they are sent.
 *
 *   npm run build && node scripts/test-tasks-browser.mjs
 *
 * Needs Chrome or Edge. Without one it says so in a box and checks nothing —
 * a skip is not a pass.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHROME, open, sleep } from './browser/cdp.mjs';
import { ubToday, weekOf } from '../src/lib/task-codes.ts';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));
if (!CHROME) {
  const rule = '  ' + '!'.repeat(64);
  console.log(`\n${rule}\n  !  SKIPPED: no Chrome or Edge found — the task list's browser suite\n  !  checked NOTHING. Install one, or run it where one is.\n${rule}\n`);
  process.exit(0);
}
if (!existsSync(join(dist, 'admin', 'index.html'))) {
  console.error('\n  dist/admin/index.html is missing — run `npm run build` first.\n');
  process.exit(1);
}

const ME = '0a0a0a0a-0000-4000-8000-00000000000a';
const BOLD = '0b0b0b0b-0000-4000-8000-00000000000b';
const people = [
  { id: ME, email: 'anna@anir.mn' },
  { id: BOLD, email: 'bold@anir.mn' },
];
const today = ubToday();
const task = (id, extra) => ({
  id,
  updated_at: '2026-11-08T01:00:00.000000+00:00',
  title: `Даалгавар ${id}`,
  done_means: `Даалгавар ${id} хийгдээд шалгагдсан`,
  project: 'site',
  owner_id: ME,
  approver_id: ME,
  due_date: null,
  state: 'new',
  submitted_at: null,
  submitted_by: null,
  decided_at: null,
  decided_by: null,
  reject_reason: null,
  ...extra,
});
const tasks = [
  task('t1', { title: 'Миний шинэ ажил', due_date: '2026-01-05' }), // mine, overdue
  task('t2', { title: 'Миний хийж буй ажил', state: 'doing' }), // mine
  task('t3', { title: 'Болдын илгээсэн ажил', owner_id: BOLD, state: 'submitted', submitted_by: BOLD, submitted_at: '2026-11-08T02:00:00Z' }), // waits on me
  task('t4', { title: 'Болдын өөр ажил', owner_id: BOLD, approver_id: BOLD }), // not mine
  task('t5', { title: 'Батлагдсан ажил', state: 'approved' }), // mine, done
];
const asked = [];

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.avif': 'image/avif', '.webp': 'image/webp' };
const json = (res, status, body) => (res.writeHead(status, { 'Content-Type': 'application/json' }), res.end(JSON.stringify(body)));

const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  let body = '';
  req.on('data', (chunk) => (body += chunk));
  req.on('end', () => {
    if (url.pathname.startsWith('/api/')) asked.push(`${req.method} ${url.pathname}${url.search}`);
    if (url.pathname === '/api/enquiries') return json(res, 200, { ok: true, status: 'new', counts: { new: 0, flagged: 0, read: 0, replied: 0, closed: 0 }, items: [] });
    if (url.pathname === '/api/alerts') return json(res, 200, { ok: true, alerts: [] });
    if (url.pathname === '/api/storage') return json(res, 200, { ok: true, used: 1, limit: 1024 ** 3 });
    if (url.pathname === '/api/tasks/counts') {
      return json(res, 200, { ok: true, mine: tasks.filter((x) => x.owner_id === ME && ['new', 'doing'].includes(x.state)).length, approve: tasks.filter((x) => x.approver_id === ME && x.state === 'submitted').length });
    }
    if (url.pathname === '/api/tasks/report') {
      const week = weekOf(url.searchParams.get('week') ?? today);
      return json(res, 200, { ok: true, me: ME, person: ME, week: { start: week.start, end: week.end }, today, people, submitted: [], approved: [tasks[4]], sentBack: [], overdue: [tasks[0]] });
    }
    if (url.pathname === '/api/tasks' && req.method === 'GET') {
      const mine = (url.searchParams.get('view') ?? 'mine') === 'mine';
      const items = tasks.filter((x) => !mine || (x.owner_id === ME && x.state !== 'approved') || (x.approver_id === ME && x.state === 'submitted'));
      return json(res, 200, { ok: true, me: ME, today, items, people });
    }
    if (url.pathname.startsWith('/api/tasks')) return json(res, 200, { ok: true, item: tasks[0] });
    let file = join(dist, decodeURIComponent(url.pathname));
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!existsSync(file)) return (res.writeHead(404), res.end());
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
  });
});
await new Promise((ready) => server.listen(0, '127.0.0.1', ready));
const BASE = `http://127.0.0.1:${server.address().port}`;

// Supabase, through CDP: a signed-in editor, empty content tables.
const cors = [
  { name: 'Access-Control-Allow-Origin', value: BASE },
  { name: 'Access-Control-Allow-Headers', value: 'authorization, apikey, content-type, prefer' },
  { name: 'Access-Control-Allow-Methods', value: 'GET, POST, PATCH, DELETE, OPTIONS' },
  { name: 'Content-Type', value: 'application/json' },
];
const supabase = (request) => {
  const path = new URL(request.url).pathname;
  if (request.method === 'OPTIONS') return [204, ''];
  if (path === '/rest/v1/site_content' || path === '/rest/v1/products') return [200, []];
  if (path === '/rest/v1/editors') return [200, [{ user_id: ME }]];
  return [404, { message: `no stub for ${request.method} ${path}` }];
};
const session = JSON.stringify({ access_token: 'tok', refresh_token: 'ref', expires_at: Math.floor(Date.now() / 1000) + 3600, email: 'anna@anir.mn', id: ME });

const page = await open(`${BASE}/admin/`, {
  width: 1400,
  height: 1000,
  beforeNavigate: async (call) => {
    await call('Fetch.enable', { patterns: [{ urlPattern: '*supabase.co*' }] });
    await call('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('anir-admin-session', ${JSON.stringify(session)}); localStorage.setItem('anir-admin-preview', 'off'); } catch {}` });
  },
});
// Every request CDP holds is answered once — those that arrived while the page
// was loading, before this listener existed, as well as every one after.
const answered = new Set();
const answer = async (m) => {
  if (m.method !== 'Fetch.requestPaused' || answered.has(m.params.requestId)) return;
  answered.add(m.params.requestId);
  const [status, body] = supabase(m.params.request);
  await page.call('Fetch.fulfillRequest', { requestId: m.params.requestId, responseCode: status, responseHeaders: cors, body: Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)).toString('base64') }).catch(() => {});
};
page.listeners.push(answer);
for (const m of [...page.events]) await answer(m);

const results = [];
const check = async (label, run) => {
  try {
    results.push(['+', label, await run()]);
  } catch (error) {
    results.push(['x', label, `FAILED — ${error.message}`]);
  }
};
const until = async (expression, what, ms = 8000) => {
  for (let waited = 0; waited < ms; waited += 100) {
    const value = await page.evaluate(expression);
    if (value) return value;
    await sleep(100);
  }
  const seen = await page.evaluate(`JSON.stringify({ said: [...document.querySelectorAll('.bar__status, .strip__line')].map((el) => el.textContent).join(' ').trim(), forms: [...document.querySelectorAll('[data-form] input, [data-form] textarea')].map((el) => el.id + '=' + el.value) })`);
  throw new Error(`timed out waiting for ${what} — ${seen}`);
};
const click = (selector) => page.evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) throw new Error('no ${selector}'); el.click(); return true; })()`);
const navButton = (label) => `[...document.querySelectorAll('.nav__item')].find((b) => b.querySelector('.nav__name')?.textContent === ${JSON.stringify(label)})`;

await page.call('Runtime.enable');
try {
  try {
    await until(`document.getElementById('admin')?.dataset.state === 'ready'`, 'the admin to load', 12000);
  } catch (error) {
    // Say what the page shows and what it threw, so a failure here can be read.
    const shown = await page.evaluate(`(document.getElementById('admin')?.dataset.state ?? '?') + ' — ' + (document.getElementById('admin')?.innerText ?? document.body.innerText).slice(0, 300)`);
    const thrown = page.events.filter((e) => e.method === 'Runtime.exceptionThrown').map((e) => e.params.exceptionDetails.exception?.description ?? e.params.exceptionDetails.text);
    const supa = page.events.filter((e) => e.method === 'Fetch.requestPaused').map((e) => `${e.params.request.method} ${new URL(e.params.request.url).pathname}`);
    throw new Error(`${error.message}\n    page: ${shown}\n    thrown: ${thrown.join(' | ') || 'nothing'}\n    Supabase asked: ${supa.join(', ') || 'nothing'}\n    Worker asked: ${asked.join(', ') || 'nothing'}`);
  }

  await check('«Даалгавар» carries two numbers: mine to do, and waiting on my approval', async () => {
    const badges = await until(`(() => { const b = ${navButton('Даалгавар')}; const s = b && [...b.querySelectorAll('.nav__badge')]; return s && s.length === 2 && s.map((x) => [x.dataset.badge, x.textContent, x.getAttribute('aria-label')]); })()`, 'the two badges');
    if (badges[0][0] !== 'mine' || badges[0][1] !== '2') throw new Error(`mine badge: ${JSON.stringify(badges[0])}`);
    if (badges[1][0] !== 'approve' || badges[1][1] !== '✓1') throw new Error(`approve badge: ${JSON.stringify(badges[1])}`);
    if (!/2$/.test(badges[0][2]) || !/1$/.test(badges[1][2])) throw new Error('each number says what it counts, aloud');
    return `«${badges[0][1]}» (${badges[0][2]}) and «${badges[1][1]}» (${badges[1][2]})`;
  });

  await check('it opens on «Минийх»: assigned to me and waiting on me, not everything', async () => {
    await page.evaluate(`${navButton('Даалгавар')}.click()`);
    const titles = await until(`(() => { const rows = [...document.querySelectorAll('[data-list="tasks"] .task .row__title')]; return rows.length && rows.map((r) => r.textContent); })()`, 'the task rows');
    const pressed = await page.evaluate(`document.querySelector('[data-view="mine"]')?.getAttribute('aria-pressed')`);
    if (pressed !== 'true') throw new Error('«Минийх» is not the pressed view');
    const want = ['Миний шинэ ажил', 'Миний хийж буй ажил', 'Болдын илгээсэн ажил'];
    if (JSON.stringify([...titles].sort()) !== JSON.stringify([...want].sort())) throw new Error(`rows: ${titles.join(', ')}`);
    if (!asked.some((line) => line.startsWith('GET /api/tasks?view=mine'))) throw new Error('the Worker was not asked for «mine»');
    await click('[data-view="all"]');
    const all = await until(`(() => { const rows = document.querySelectorAll('[data-list="tasks"] .task'); return rows.length === 5 && rows.length; })()`, 'all five rows');
    await click('[data-view="mine"]');
    await until(`document.querySelectorAll('[data-list="tasks"] .task').length === 3`, 'back to mine');
    return `3 rows (mine to do, and Bold's waiting on me); «Бүгд»: ${all}`;
  });

  await check('an overdue task says so on its row — a sign and words, not colour alone', async () => {
    const marker = await until(`(() => { const row = document.querySelector('.task[data-overdue="true"]'); const m = row?.querySelector('summary [data-marker="overdue"]'); return m && [row.querySelector('.row__title').textContent, m.textContent]; })()`, 'the overdue marker');
    if (marker[0] !== 'Миний шинэ ажил') throw new Error(`marked: ${marker[0]}`);
    if (!/⚠/.test(marker[1]) || !/Хугацаа хэтэрсэн/.test(marker[1])) throw new Error(`marker text: ${marker[1]}`);
    const others = await page.evaluate(`document.querySelectorAll('.task:not([data-overdue]) [data-marker="overdue"]').length`);
    if (others) throw new Error('a task not overdue is marked');
    return `«${marker[0]}»: «${marker[1]}»; no other row marked`;
  });

  await check('«Дууссан гэдэг нь» that repeats the title is refused before it is sent', async () => {
    await click('[data-new-task]');
    await until(`document.querySelector('[data-form="new"]')`, 'the new task form');
    const posts = asked.filter((line) => line.startsWith('POST')).length;
    await page.evaluate(`(() => {
      const set = (id, value) => { const el = document.getElementById(id); el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); };
      set('task-new-title', 'Ezmath-ын бодлогууд');
      set('task-new-done_means', 'Ezmath-ын бодлогууд.');
      [...document.querySelectorAll('[data-form="new"] .btn--primary')][0].click();
    })()`);
    const said = await until(`[...document.querySelectorAll('.bar__status, .strip__line')].map((el) => el.textContent).join(' ').trim()`, 'the refusal on the status line');
    if (!/гарчгийг давтаж болохгүй/.test(said)) throw new Error(`status: ${said}`);
    if (asked.filter((line) => line.startsWith('POST')).length !== posts) throw new Error('it was sent anyway');
    const dot = await page.evaluate(`!!${navButton('Даалгавар')}.querySelector('.nav__dot')`);
    if (!dot) throw new Error('the unsaved draft shows no dot in the tree');
    await page.evaluate(`[...document.querySelectorAll('[data-form="new"] .btn--ghost')].find((b) => b.textContent === 'Болих').click()`);
    await until(`!${navButton('Даалгавар')}.querySelector('.nav__dot')`, 'the draft dot to clear once the form is dropped');
    return 'status: «…гарчгийг давтаж болохгүй…»; nothing posted; the draft dot shown, then cleared';
  });

  await check('a send-back with no reason is refused before it is sent', async () => {
    await until(`document.querySelector('.task[data-task="t3"]')`, 'the submitted task');
    await page.evaluate(`document.querySelector('.task[data-task="t3"]').open = true`);
    await click('.task[data-task="t3"] [data-move="sendBack"]');
    const posts = asked.filter((line) => line.startsWith('POST')).length;
    await click('.task[data-task="t3"] [data-move="sendBack-confirm"]');
    const said = await until(`[...document.querySelectorAll('.bar__status, .strip__line')].map((el) => el.textContent).join(' ').trim()`, 'the refusal');
    if (!/шалтгаанаа бичнэ үү/.test(said)) throw new Error(`status: ${said}`);
    if (asked.filter((line) => line.startsWith('POST')).length !== posts) throw new Error('it was sent anyway');
    const approve = await page.evaluate(`!!document.querySelector('.task[data-task="t3"] [data-move="approve"]')`);
    const notMine = await page.evaluate(`document.querySelector('.task[data-task="t4"]')`);
    if (!approve) throw new Error('the approver sees no «Батлах»');
    return 'status: «Буцаах шалтгаанаа бичнэ үү.»; nothing posted; «Батлах» offered to the approver';
  });

  await check('the Тайлан opens on this week and steps a week at a time', async () => {
    await page.evaluate(`${navButton('Тайлан')}.click()`);
    const thisWeek = weekOf(today).start;
    const first = await until(`document.querySelector('[data-week]')?.dataset.week`, 'the week');
    if (first !== thisWeek) throw new Error(`opened on ${first}, not ${thisWeek}`);
    await until(`document.querySelector('[data-part="overdue"] li')`, 'the report parts');
    await click('[data-week-step="-7"]');
    const back = await until(`(() => { const w = document.querySelector('[data-week]')?.dataset.week; return w !== ${JSON.stringify(thisWeek)} && w; })()`, 'the week before');
    const before = new Date(Date.parse(`${thisWeek}T00:00:00Z`) - 7 * 86_400_000).toISOString().slice(0, 10);
    if (back !== before) throw new Error(`stepped to ${back}, not ${before}`);
    await until(`document.querySelector('[data-part="approved"]')`, 'the report for that week');
    if (!asked.some((line) => line.includes(`/api/tasks/report?week=${before}`))) throw new Error('the Worker was not asked for that week');
    await click('[data-week-step="0"]');
    await until(`document.querySelector('[data-week]')?.dataset.week === ${JSON.stringify(thisWeek)}`, 'back to this week');
    const parts = await until(`[...document.querySelectorAll('[data-part]')].map((p) => p.dataset.part).join(', ')`, 'the parts of this week');
    return `opened on ${thisWeek}; «← Өмнөх» → ${before}, asked for it; «Энэ долоо хоног» back; parts: ${parts}`;
  });
} finally {
  await page.close();
  server.close();
}

const width = Math.max(...results.map(([, label]) => label.length));
console.log('');
for (const [mark, label, detail] of results) console.log(`  ${mark} ${label.padEnd(width)}  ${detail}`);
const failed = results.filter(([mark]) => mark === 'x').length;
console.log(`\n  ${results.length - failed}/${results.length} passed\n`);
process.exit(failed ? 1 : 0);
