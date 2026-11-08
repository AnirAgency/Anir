/**
 * «Хавсралт 2» in a real browser: the built admin (dist/admin/), driven
 * through the Chrome DevTools Protocol (./browser/cdp.mjs), with a small
 * server in this process playing the Worker's routes and Supabase answered
 * through CDP — nothing real is touched.
 *
 * What this proves, as an editor sees it:
 *   - it sits under «Ажил», and opens on the strip: one row per Member,
 *     principal, repaid, outstanding, × 1.5 — and «not yet due» under it;
 *   - no figure on the page is a float: every amount is whole tugrik in
 *     groups, with ₮;
 *   - the form counts clause 5.1's days as the date is typed — 29 days says
 *     so quietly, 31 warns and makes the kind a gift — before anything is
 *     sent; a late row says so on itself, in a sign and words;
 *   - an amount with a decimal mark is refused before it is sent, and what
 *     is sent is an integer;
 *   - «Хуулах» opens a new form with the same entry, dated today;
 *   - the member picker offers editors only, and its help says why;
 *   - a repayment on a newer loan names the older one clause 5.2(c) repays
 *     first.
 *
 *   npm run build && node scripts/test-contributions-browser.mjs
 *
 * Needs Chrome or Edge. Without one it says so in a box and checks nothing —
 * a skip is not a pass.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHROME, open, sleep } from './browser/cdp.mjs';
import { daysToRecord, isLate, standings, ubToday } from '../src/lib/contribution-codes.ts';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));
if (!CHROME) {
  const rule = '  ' + '!'.repeat(64);
  console.log(`\n${rule}\n  !  SKIPPED: no Chrome or Edge found — the Schedule 2 browser suite\n  !  checked NOTHING. Install one, or run it where one is.\n${rule}\n`);
  process.exit(0);
}
if (!existsSync(join(dist, 'admin', 'index.html'))) {
  console.error('\n  dist/admin/index.html is missing — run `npm run build` first.\n');
  process.exit(1);
}

const ME = '0a0a0a0a-0000-4000-8000-00000000000a';
const BOLD = '0b0b0b0b-0000-4000-8000-00000000000b';
const people = [
  { id: ME, name: 'Анна' },
  { id: BOLD, name: 'bold@anir.mn' },
];
const today = ubToday();
const daysAgo = (n) => new Date(Date.parse(`${today}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);
const recorded = new Date().toISOString();
const entry = (id, extra) => {
  const e = { id, updated_at: '2026-11-08T01:00:00.000000+00:00', created_by: ME, recorded_at: recorded, receipt_held: true, kind: 'loan', repaid_mnt: 0, note: null, notified_at: recorded, ...extra };
  return { ...e, days: daysToRecord(e.date_made, e.recorded_at), late: isLate(e.date_made, e.recorded_at) };
};
// Newest money first, as the Worker sends it.
const items = [
  entry('e1', { member_id: BOLD, date_made: daysAgo(1), amount_mnt: 89_000, what_for: 'Домэйн' }),
  entry('e2', { member_id: ME, date_made: daysAgo(3), amount_mnt: 1_500_000, what_for: 'Figma, жилийн эрх' }),
  entry('e3', { member_id: ME, date_made: daysAgo(20), amount_mnt: 1_000_001, what_for: 'Сервер', repaid_mnt: 1 }),
  entry('e4', { member_id: BOLD, date_made: daysAgo(70), amount_mnt: 450_000, what_for: 'Хэвлэл', kind: 'gift', notified_at: null }),
];
const summary = standings(items, people.map((p) => p.id)).map((s) => ({ ...s, name: people.find((p) => p.id === s.member_id).name }));
const events = [{ contribution_id: 'e2', at: recorded, who: 'Анна', field: 'amount_mnt', from_value: '1400000', to_value: '1500000' }];
const asked = [];
const posted = [];

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
    if (url.pathname === '/api/tasks/counts') return json(res, 200, { ok: true, mine: 0, approve: 0 });
    if (url.pathname === '/api/contributions' && req.method === 'GET') {
      const member = url.searchParams.get('member');
      return json(res, 200, { ok: true, me: ME, today, people, items: member ? items.filter((e) => e.member_id === member) : items, summary, events });
    }
    if (url.pathname.startsWith('/api/contributions') && req.method === 'POST') {
      posted.push({ path: url.pathname, body: JSON.parse(body || '{}') });
      return json(res, 201, { ok: true, item: items[0] });
    }
    let file = join(dist, decodeURIComponent(url.pathname));
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!existsSync(file)) return (res.writeHead(404), res.end());
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
  });
});
await new Promise((ready) => server.listen(0, '127.0.0.1', ready));
const BASE = `http://127.0.0.1:${server.address().port}`;

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
  const seen = await page.evaluate(`[...document.querySelectorAll('.bar__status, .strip__line')].map((el) => el.textContent).join(' ').trim()`);
  throw new Error(`timed out waiting for ${what} — status: ${seen}`);
};
const click = (selector) => page.evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) throw new Error('no ${selector}'); el.click(); return true; })()`);
const navButton = (label) => `[...document.querySelectorAll('.nav__item')].find((b) => b.querySelector('.nav__name')?.textContent === ${JSON.stringify(label)})`;
const statusText = `[...document.querySelectorAll('.bar__status, .strip__line')].map((el) => el.textContent).join(' ').trim()`;
const setValue = (id, value) => page.evaluate(`(() => { const el = document.getElementById(${JSON.stringify(id)}); el.value = ${JSON.stringify(value)}; el.dispatchEvent(new Event('input', { bubbles: true })); })()`);
const MONEY = /^\d{1,3}(\u00a0\d{3})*₮$/;

await page.call('Runtime.enable');
try {
  await until(`document.getElementById('admin')?.dataset.state === 'ready'`, 'the admin to load', 12000);

  await check('«Хавсралт 2» sits under «Ажил» and opens on the strip — one row per Member, not yet due', async () => {
    const group = await page.evaluate(`(() => { const b = ${navButton('Хавсралт 2')}; const title = b?.closest('ul')?.previousElementSibling?.textContent; return b && title; })()`);
    if (group !== 'Ажил') throw new Error(`under «${group}»`);
    await page.evaluate(`${navButton('Хавсралт 2')}.click()`);
    const strip = await until(`(() => { const rows = [...document.querySelectorAll('[data-summary] tbody tr')]; return rows.length && rows.map((r) => [...r.children].map((c) => c.textContent)); })()`, 'the strip');
    const want = summary.map((s) => [s.name, ...[s.principal, s.repaid, s.outstanding, s.owed].map((n) => `${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0')}₮`)]);
    if (JSON.stringify(strip) !== JSON.stringify(want)) throw new Error(`strip: ${JSON.stringify(strip)}`);
    const heads = await page.evaluate(`[...document.querySelectorAll('[data-summary] thead th')].map((th) => th.textContent)`);
    const notDue = await page.evaluate(`document.querySelector('[data-not-due]')?.textContent ?? ''`);
    if (!/төлөх хугацаа болоогүй/.test(notDue) || !/20 000 000₮/.test(notDue)) throw new Error(`not-due line: ${notDue}`);
    return `${strip.length} Members; ${heads.join(' | ')}; Анна: ${strip[0].slice(1).join(' / ')}; «…төлөх хугацаа болоогүй…» under it`;
  });

  await check('no figure on the page is a float: whole tugrik, in groups, with ₮', async () => {
    await until(`document.querySelectorAll('[data-list="contributions"] [data-entry]').length === 4`, 'the four entries');
    const figures = await page.evaluate(`[...document.querySelectorAll('[data-money]')].map((el) => el.textContent)`);
    const bad = figures.filter((f) => !MONEY.test(f));
    if (bad.length) throw new Error(`not whole tugrik: ${JSON.stringify(bad)}`);
    const text = await page.evaluate(`document.querySelector('main, #admin').innerText`);
    const fraction = text.match(/\d[.,]\d{1,2}\s*₮/);
    if (fraction) throw new Error(`a fraction on the page: ${fraction[0]}`);
    return `${figures.length} figures, every one /^\\d{1,3}( \\d{3})*₮$/; no decimal mark next to a ₮ anywhere`;
  });

  await check('newest money first, and a late row says so on itself — a sign and words', async () => {
    const order = await page.evaluate(`[...document.querySelectorAll('[data-list="contributions"] [data-entry]')].map((r) => r.dataset.entry)`);
    if (order.join() !== 'e1,e2,e3,e4') throw new Error(`order: ${order}`);
    const marker = await page.evaluate(`document.querySelector('[data-entry="e4"] summary [data-marker="late"]')?.textContent`);
    if (!/⚠/.test(marker ?? '') || !/Хоцорч бүртгэгдсэн/.test(marker)) throw new Error(`marker: ${marker}`);
    if (await page.evaluate(`document.querySelectorAll('[data-entry]:not([data-entry="e4"]) [data-marker="late"]').length`)) throw new Error('an entry in time is marked late');
    await page.evaluate(`document.querySelector('[data-entry="e4"]').open = true`);
    const why = await page.evaluate(`document.querySelector('[data-entry="e4"] [data-late-row]')?.textContent ?? ''`);
    if (!/70 хоногийн дараа/.test(why) || !/бэлэг/.test(why)) throw new Error(`late row: ${why}`);
    const unsent = await page.evaluate(`!!document.querySelector('[data-entry="e4"] [data-not-notified]')`);
    if (!unsent) throw new Error('a notice that did not go is not said');
    return `e1, e2, e3, e4 by date made; e4: «${marker}», «…70 хоногийн дараа… бэлэг…», and «Telegram-аар мэдэгдээгүй»`;
  });

  await check('the form counts clause 5.1\'s days as the date is typed — before anything is sent', async () => {
    await click('[data-new-entry]');
    await until(`document.querySelector('[data-form="new"]')`, 'the new form');
    const posts = posted.length;
    await setValue('contribution-new-date_made', daysAgo(29));
    const in29 = await page.evaluate(`(() => { const e = document.querySelector('[data-form="new"] [data-elapsed]'); return [e.textContent, e.dataset.late, document.getElementById('contribution-new-kind').disabled]; })()`);
    if (!/29 хоног/.test(in29[0]) || in29[1] !== 'false' || in29[2]) throw new Error(`29 days: ${JSON.stringify(in29)}`);
    await setValue('contribution-new-date_made', daysAgo(31));
    const in31 = await page.evaluate(`(() => { const e = document.querySelector('[data-form="new"] [data-elapsed]'); const k = document.getElementById('contribution-new-kind'); return [e.textContent, e.dataset.late, k.value, k.disabled]; })()`);
    if (!/31 хоног/.test(in31[0]) || !/бэлэг/.test(in31[0]) || in31[1] !== 'true' || in31[2] !== 'gift' || !in31[3]) throw new Error(`31 days: ${JSON.stringify(in31)}`);
    if (posted.length !== posts) throw new Error('something was sent');
    return `29: «${in29[0]}»; 31: «${in31[0].slice(0, 60)}…», kind → Бэлэг, locked; nothing sent`;
  });

  await check('an amount with a decimal mark is refused before it is sent; what is sent is an integer', async () => {
    await setValue('contribution-new-date_made', daysAgo(2));
    await setValue('contribution-new-what_for', 'Adobe, сарын эрх');
    for (const typed of ['1,5', '1500000.00', '1.5']) {
      await setValue('contribution-new-amount_mnt', typed);
      const posts = posted.length;
      await page.evaluate(`document.querySelector('[data-form="new"] .btn--primary').click()`);
      await until(`(() => { const s = ${statusText}; return /бүхэл төгрөгөөр/.test(s) && s; })()`, `the refusal of ${typed}`);
      if (posted.length !== posts) throw new Error(`${typed} was sent anyway`);
      await page.evaluate(`document.querySelectorAll('.bar__status, .strip__line').forEach((el) => (el.textContent = ''))`);
    }
    await setValue('contribution-new-amount_mnt', '1 500 000');
    await page.evaluate(`document.querySelector('[data-form="new"] .btn--primary').click()`);
    for (let i = 0; i < 50 && !posted.some((p) => p.path === '/api/contributions'); i++) await sleep(100);
    const body = posted.find((p) => p.path === '/api/contributions')?.body;
    if (!body || body.amount_mnt !== 1_500_000 || !Number.isInteger(body.amount_mnt)) throw new Error(`sent: ${JSON.stringify(body)}`);
    if ('recorded_at' in body) throw new Error('the browser sent recorded_at');
    return `"1,5", "1500000.00", "1.5": refused, nothing sent; "1 500 000" sent as ${body.amount_mnt} (a number, whole); no recorded_at from the browser`;
  });

  await check('the member picker offers editors only, and its help says why', async () => {
    await click('[data-new-entry]');
    await until(`document.getElementById('contribution-new-member_id')`, 'the picker');
    const options = await page.evaluate(`[...document.getElementById('contribution-new-member_id').options].map((o) => o.textContent)`);
    if (JSON.stringify(options) !== JSON.stringify(people.map((p) => p.name))) throw new Error(`options: ${JSON.stringify(options)}`);
    const help = await page.evaluate(`document.getElementById('contribution-new-member_id-help').textContent`);
    if (!/5\.4/.test(help) || !/9\.2/.test(help)) throw new Error(`help: ${help}`);
    const whatFor = await page.evaluate(`document.getElementById('contribution-new-what_for-help').textContent`);
    if (!/картаас бодитоор татагдсан төгрөг/.test(whatFor)) throw new Error(`what_for help: ${whatFor}`);
    await page.evaluate(`[...document.querySelectorAll('[data-form="new"] .btn--ghost')].find((b) => b.textContent === 'Болих').click()`);
    return `${options.join(', ')}; help: «…5.4-өөр 9.2-ын шийдвэр…»; what for: «…картаас бодитоор татагдсан төгрөг…»`;
  });

  await check('«Хуулах» opens a new form with the same entry, dated today', async () => {
    await until(`!document.querySelector('[data-form="new"]')`, 'the form to close');
    await page.evaluate(`document.querySelector('[data-entry="e2"]').open = true`);
    await click('[data-copy="e2"]');
    const form = await until(`(() => { const f = document.querySelector('[data-form="new"]'); if (!f) return null; const v = (k) => document.getElementById('contribution-new-' + k).value; return [v('member_id'), v('date_made'), v('amount_mnt'), v('what_for'), document.getElementById('contribution-new-receipt_held').checked]; })()`, 'the copied form');
    if (form[0] !== ME || form[1] !== today || form[2] !== '1\u00a0500\u00a0000' || form[3] !== 'Figma, жилийн эрх' || form[4] !== false) throw new Error(`copied: ${JSON.stringify(form)}`);
    const dot = await page.evaluate(`!!${navButton('Хавсралт 2')}.querySelector('.nav__dot')`);
    if (!dot) throw new Error('the copy, unsaved, shows no dot in the tree');
    await page.evaluate(`[...document.querySelectorAll('[data-form="new"] .btn--ghost')].find((b) => b.textContent === 'Болих').click()`);
    return `Анна, ${today}, 1 500 000, «Figma, жилийн эрх», receipt unticked; the unsaved dot shown`;
  });

  await check('a repayment on a newer loan names the older one clause 5.2(c) repays first', async () => {
    await until(`!document.querySelector('[data-form="new"]') && document.querySelector('[data-entry="e2"]')`, 'the list, after the copy was dropped');
    await page.evaluate(`document.querySelector('[data-entry="e2"]').open = true`);
    await click('[data-repay-open="e2"]');
    const older = await until(`document.querySelector('[data-repay="e2"] [data-older]')?.textContent`, 'the 5.2(c) note');
    if (!/5\.2\(c\)/.test(older) || !older.includes('1\u00a0000\u00a0001₮') || !older.includes('1\u00a0000\u00a0000₮')) throw new Error(`note: ${older}`);
    const posts = posted.length;
    await click('[data-repay-confirm="e2"]');
    await until(`(() => { const s = ${statusText}; return /Буцаан төлсөн дүнг/.test(s) && s; })()`, 'the refusal of an empty repayment');
    if (posted.length !== posts) throw new Error('an empty repayment was sent');
    await page.evaluate(`(() => { document.querySelector('[data-entry="e3"]').open = true; document.querySelector('[data-repay-open="e3"]').click(); })()`);
    const none = await until(`(() => { const box = document.querySelector('[data-repay="e3"]'); return box && !box.querySelector('[data-older]') && 'none'; })()`, 'the oldest loan, with no note');
    const giftButton = await page.evaluate(`!!document.querySelector('[data-repay-open="e4"]')`);
    if (giftButton) throw new Error('a late gift offers repayment');
    return `on e2: «${older.slice(0, 70)}…»; empty: refused; on e3, the oldest: ${none}; e4, a gift: no «Буцаан төлөх»`;
  });

  await check('the member filter asks the Worker for one Member', async () => {
    await page.evaluate(`(() => { const s = document.getElementById('contributions-filter-member'); s.value = ${JSON.stringify(BOLD)}; s.dispatchEvent(new Event('change')); })()`);
    await until(`document.querySelectorAll('[data-list="contributions"] [data-entry]').length === 2`, 'two rows');
    if (!asked.includes(`GET /api/contributions?member=${BOLD}`)) throw new Error('the Worker was not asked for that Member');
    const strip = await page.evaluate(`document.querySelectorAll('[data-summary] tbody tr').length`);
    if (strip !== people.length) throw new Error(`the strip narrowed to ${strip}`);
    return `?member=bold → 2 rows; the strip still ${strip} Members`;
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
