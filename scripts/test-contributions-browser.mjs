/**
 * «Хавсралт 2» in a real browser: the built admin (dist/admin/), driven
 * through the Chrome DevTools Protocol (./browser/cdp.mjs), with a small
 * server in this process playing the Worker's routes and Supabase answered
 * through CDP — nothing real is touched.
 *
 * What this proves, as an editor sees it:
 *   - it sits under «Ажил», loads only when opened, and opens on the strip:
 *     one row per Member — principal, repaid, outstanding, × 1.5, the uplift
 *     paid, what is late — and «not yet due» under it;
 *   - no figure on the page is a float;
 *   - clause 5.1 is said as the date is typed — no clock while the agreement
 *     is unsigned, none for money made before it, 29 days in time, 31 a
 *     warning — and the kind is never touched; a late row says so on itself;
 *   - an amount with a decimal mark is refused before it is sent;
 *   - the picker offers the Members, not the editors;
 *   - «Хуулах» opens a new form with the same entry, dated today;
 *   - a repayment takes its principal and its interest apart, as integers,
 *     and names the older loan clause 5.2(c) repays first;
 *   - a tool that cannot load says so in its place, and the rest of the
 *     admin carries on.
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
import { daysToRecord, fiveOneApplies, isLate, repaidOn, standings, ubToday } from '../src/lib/contribution-codes.ts';

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
const people = [{ id: ME, name: 'Анна' }];
// The Members: Batuka is the signed-in editor; Batenkh, Baysaa and Deegii have no login here.
const BATUKA = '1a1a1a1a-0000-4000-8000-000000000001';
const BATENKH = '1a1a1a1a-0000-4000-8000-000000000002';
const members = [
  { id: BATUKA, name: 'Batuka', editor_id: ME },
  { id: BATENKH, name: 'Batenkh', editor_id: null },
  { id: '1a1a1a1a-0000-4000-8000-000000000003', name: 'Baysaa', editor_id: null },
  { id: '1a1a1a1a-0000-4000-8000-000000000004', name: 'Deegii', editor_id: null },
];
const today = ubToday();
const daysAgo = (n) => new Date(Date.parse(`${today}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);
let inForce = daysAgo(100);
const recorded = new Date().toISOString();
const base = [
  { id: 'e1', member_id: BATENKH, date_made: daysAgo(1), amount_mnt: 89_000, what_for: 'Домэйн' },
  { id: 'e2', member_id: BATUKA, date_made: daysAgo(3), amount_mnt: 1_500_000, what_for: 'Figma, жилийн эрх' },
  { id: 'e3', member_id: BATUKA, date_made: daysAgo(20), amount_mnt: 1_000_001, what_for: 'Сервер' },
  { id: 'e4', member_id: BATENKH, date_made: daysAgo(70), amount_mnt: 450_000, what_for: 'Хэвлэл', notified_at: null },
].map((e) => ({ updated_at: '2026-11-08T01:00:00.000000+00:00', created_by: ME, recorded_at: recorded, receipt_held: true, kind: 'loan', note: null, notified_at: recorded, ...e }));
const repayments = [{ id: 'r1', contribution_id: 'e3', paid_on: daysAgo(2), principal_mnt: 1, interest_mnt: 0, note: null, who: 'Анна', created_by: ME }];
// As the Worker sends them, worked out by the same rules.
const view = () => {
  const items = base.map((e) => {
    const paid = repaidOn(e.id, repayments);
    return { ...e, days: daysToRecord(e.date_made, e.recorded_at), applies: fiveOneApplies(e.date_made, inForce), late: isLate(e.date_made, e.recorded_at, inForce), repaid_principal: paid.principal, repaid_interest: paid.interest };
  });
  const summary = standings(base, repayments, members.map((m) => m.id), inForce).map((s) => ({ ...s, name: members.find((m) => m.id === s.member_id).name }));
  return { items, summary };
};
const events = [
  { contribution_id: 'e2', at: recorded, who: 'Анна', field: 'amount_mnt', from_value: '1400000', to_value: '1500000' },
  { contribution_id: 'e2', at: recorded, who: 'Анна', field: 'kind', from_value: 'gift', to_value: 'loan', notified_at: recorded },
  { contribution_id: 'e1', at: recorded, who: 'Анна', field: 'kind', from_value: 'gift', to_value: 'loan', notified_at: null },
];
/** What the Worker says a date would mean (worker/contributions.ts > consequences), over the same entries. */
const consequences = (date) => {
  const before = base.filter((e) => e.date_made < date);
  const from = base.filter((e) => e.date_made >= date);
  const total = (rows) => rows.reduce((sum, e) => sum + e.amount_mnt, 0);
  return { date, year: Number(date.slice(0, 4)), future: date > today, before: { count: before.length, total: total(before) }, from: { count: from.length, total: total(from), late: from.filter((e) => isLate(e.date_made, e.recorded_at, date)).length } };
};
const asked = [];
const posted = [];
let brokenChunk = null; // a pattern: a chunk the server will not serve

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.avif': 'image/avif', '.webp': 'image/webp' };
const json = (res, status, body) => (res.writeHead(status, { 'Content-Type': 'application/json' }), res.end(JSON.stringify(body)));

const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  let body = '';
  req.on('data', (chunk) => (body += chunk));
  req.on('end', () => {
    if (url.pathname.startsWith('/api/')) asked.push(`${req.method} ${url.pathname}${url.search}`);
    if (url.pathname.startsWith('/_astro/')) asked.push(`GET ${url.pathname}`);
    if (url.pathname === '/api/enquiries') return json(res, 200, { ok: true, status: 'new', counts: { new: 0, flagged: 0, read: 0, replied: 0, closed: 0 }, items: [] });
    if (url.pathname === '/api/alerts') return json(res, 200, { ok: true, alerts: [] });
    if (url.pathname === '/api/storage') return json(res, 200, { ok: true, used: 1, limit: 1024 ** 3 });
    if (url.pathname === '/api/tasks/counts') return json(res, 200, { ok: true, mine: 0, approve: 0 });
    if (url.pathname === '/api/contributions' && req.method === 'GET') {
      const member = url.searchParams.get('member');
      const { items, summary } = view();
      return json(res, 200, { ok: true, me: ME, today, agreement: { in_force_from: inForce }, members, people, items: member ? items.filter((e) => e.member_id === member) : items, summary, repayments, events });
    }
    if (url.pathname === '/api/contributions/agreement' && req.method === 'GET') return json(res, 200, { ok: true, preview: consequences(url.searchParams.get('date')) });
    if (url.pathname === '/api/contributions/agreement' && req.method === 'POST') {
      const sent = JSON.parse(body || '{}');
      posted.push({ path: url.pathname, body: sent });
      inForce = sent.in_force_from;
      return json(res, 200, { ok: true, in_force_from: inForce });
    }
    if (url.pathname.startsWith('/api/contributions') && req.method === 'POST') {
      posted.push({ path: url.pathname, body: JSON.parse(body || '{}') });
      return json(res, 201, { ok: true, item: view().items[0] });
    }
    if (brokenChunk && brokenChunk.test(url.pathname)) return (res.writeHead(500), res.end());
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
const statusText = `[...document.querySelectorAll('.bar__status, .strip__line')].map((el) => el.textContent).join(' ').trim()`;
const until = async (expression, what, ms = 8000) => {
  for (let waited = 0; waited < ms; waited += 100) {
    const value = await page.evaluate(expression);
    if (value) return value;
    await sleep(100);
  }
  throw new Error(`timed out waiting for ${what} — status: ${await page.evaluate(statusText)}`);
};
const click = (selector) => page.evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) throw new Error('no ${selector}'); el.click(); return true; })()`);
const navButton = (label) => `[...document.querySelectorAll('.nav__item')].find((b) => b.querySelector('.nav__name')?.textContent === ${JSON.stringify(label)})`;
const setValue = (id, value) => page.evaluate(`(() => { const el = document.getElementById(${JSON.stringify(id)}); el.value = ${JSON.stringify(value)}; el.dispatchEvent(new Event('input', { bubbles: true })); })()`);
const clearStatus = () => page.evaluate(`document.querySelectorAll('.bar__status, .strip__line').forEach((el) => (el.textContent = ''))`);
const reopen = async () => {
  await page.evaluate(`${navButton('Хүсэлтүүд')}.click()`);
  await page.evaluate(`${navButton('Хавсралт 2')}.click()`);
  await until(`document.querySelectorAll('[data-list="contributions"] [data-entry]').length >= 2`, 'the entries');
};
const elapsedOf = (key) => `(() => { const e = document.querySelector('[data-form="${key}"] [data-elapsed]'); const k = document.getElementById('contribution-${key}-kind'); return e && [e.textContent, e.dataset.late, k.value, k.disabled]; })()`;
const MONEY = /^\d{1,3}(\u00a0\d{3})*₮$/;
const fmt = (n) => `${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0')}₮`;

await page.call('Runtime.enable');
try {
  await until(`document.getElementById('admin')?.dataset.state === 'ready'`, 'the admin to load', 12000);

  await check('«Хавсралт 2» sits under «Ажил», loads only when opened, and opens on the strip', async () => {
    const group = await page.evaluate(`(() => { const b = ${navButton('Хавсралт 2')}; return b?.closest('ul')?.previousElementSibling?.textContent; })()`);
    if (group !== 'Ажил') throw new Error(`under «${group}»`);
    if (asked.some((line) => /admin-contributions\./.test(line))) throw new Error('its code was fetched before it was opened');
    await page.evaluate(`${navButton('Хавсралт 2')}.click()`);
    const strip = await until(`(() => { const rows = [...document.querySelectorAll('[data-summary] tbody tr')]; return rows.length && rows.map((r) => [...r.children].map((c) => c.textContent)); })()`, 'the strip');
    if (!asked.some((line) => /admin-contributions\./.test(line))) throw new Error('its code was never fetched');
    const want = view().summary.map((s) => [s.name, ...[s.principal, s.repaid, s.outstanding, s.owed, s.interest, s.late].map(fmt)]);
    if (JSON.stringify(strip) !== JSON.stringify(want)) throw new Error(`strip: ${JSON.stringify(strip)}`);
    const heads = await page.evaluate(`[...document.querySelectorAll('[data-summary] thead th')].map((th) => th.textContent)`);
    const notDue = await page.evaluate(`document.querySelector('[data-not-due]')?.textContent ?? ''`);
    if (!/төлөх хугацаа болоогүй/.test(notDue) || !/20 000 000₮/.test(notDue)) throw new Error(`not-due line: ${notDue}`);
    const agreement = await page.evaluate(`document.querySelector('[data-agreement]')?.textContent ?? ''`);
    if (!agreement.includes(inForce)) throw new Error(`agreement line: ${agreement}`);
    return `fetched on opening, not before; ${strip.length} Members × ${heads.length} columns (${heads.slice(1).join(' | ')}); Batenkh's late: ${strip[1][6]}; not due; in force ${inForce}`;
  });

  await check('no figure on the page is a float: whole tugrik, in groups, with ₮', async () => {
    await until(`document.querySelectorAll('[data-list="contributions"] [data-entry]').length === 4`, 'the four entries');
    const figures = await page.evaluate(`[...document.querySelectorAll('[data-money]')].map((el) => el.textContent)`);
    const bad = figures.filter((f) => !MONEY.test(f));
    if (bad.length) throw new Error(`not whole tugrik: ${JSON.stringify(bad)}`);
    const fraction = (await page.evaluate(`document.getElementById('admin').innerText`)).match(/\d[.,]\d{1,2}\s*₮/);
    if (fraction) throw new Error(`a fraction on the page: ${fraction[0]}`);
    return `${figures.length} figures, every one /^\\d{1,3}( \\d{3})*₮$/; no decimal mark next to a ₮ anywhere`;
  });

  await check('a late row says so on itself — and is still a loan: the kind is never changed for anyone', async () => {
    const order = await page.evaluate(`[...document.querySelectorAll('[data-list="contributions"] [data-entry]')].map((r) => r.dataset.entry)`);
    if (order.join() !== 'e1,e2,e3,e4') throw new Error(`order: ${order}`);
    const marker = await page.evaluate(`document.querySelector('[data-entry="e4"] summary [data-marker="late"]')?.textContent`);
    if (!/⚠/.test(marker ?? '') || !/Хоцорч бүртгэгдсэн/.test(marker)) throw new Error(`marker: ${marker}`);
    if (await page.evaluate(`document.querySelectorAll('[data-entry]:not([data-entry="e4"]) [data-marker="late"]').length`)) throw new Error('an entry in time is marked late');
    const sub = await page.evaluate(`document.querySelector('[data-entry="e4"] .row__sub').textContent`);
    if (!sub.includes('Зээл')) throw new Error(`the late entry's kind: ${sub}`);
    await page.evaluate(`document.querySelector('[data-entry="e4"]').open = true`);
    const why = await page.evaluate(`document.querySelector('[data-entry="e4"] [data-late-row]')?.textContent ?? ''`);
    if (!/70 хоногийн дараа/.test(why) || !/гишүүд шийднэ/.test(why)) throw new Error(`late row: ${why}`);
    if (!(await page.evaluate(`!!document.querySelector('[data-entry="e4"] [data-not-notified]')`))) throw new Error('a notice that did not go is not said');
    return `e4: «${marker}», «${sub}», «…70 хоногийн дараа… гишүүд шийднэ…», «Telegram-аар мэдэгдээгүй»`;
  });

  await check("clause 5.1 is said as the date is typed — a warning, and the kind left alone", async () => {
    await click('[data-new-entry]');
    await until(`document.querySelector('[data-form="new"]')`, 'the new form');
    const posts = posted.length;
    await setValue('contribution-new-date_made', daysAgo(29));
    const in29 = await page.evaluate(elapsedOf('new'));
    await setValue('contribution-new-date_made', daysAgo(31));
    const in31 = await page.evaluate(elapsedOf('new'));
    await setValue('contribution-new-date_made', daysAgo(150));
    const before = await page.evaluate(elapsedOf('new'));
    if (!/29 хоног/.test(in29[0]) || in29[1] !== 'false') throw new Error(`29 days: ${JSON.stringify(in29)}`);
    if (!/31 хоног/.test(in31[0]) || in31[1] !== 'true' || !/гишүүд шийднэ/.test(in31[0])) throw new Error(`31 days: ${JSON.stringify(in31)}`);
    if (in31[2] !== 'loan' || in31[3]) throw new Error(`the kind was touched: ${in31[2]}${in31[3] ? ', locked' : ''}`);
    if (!before[0].includes(inForce) || before[1] !== 'false') throw new Error(`before the agreement: ${JSON.stringify(before)}`);
    if (posted.length !== posts) throw new Error('something was sent');
    await page.evaluate(`[...document.querySelectorAll('[data-form="new"] .btn--ghost')].find((b) => b.textContent === 'Болих').click()`);
    return `29: in time; 31: «…хэтэрсэн (5.1)… гишүүд шийднэ…», kind still Зээл, not locked; made before ${inForce}: «…хамаарахгүй»; nothing sent`;
  });

  await check('no agreement in force: no clock, said at the top and in the form', async () => {
    inForce = null;
    await reopen();
    const top = await page.evaluate(`document.querySelector('[data-agreement]')?.textContent ?? ''`);
    if (!/хүчин төгөлдөр болоогүй/.test(top)) throw new Error(`top: ${top}`);
    if (await page.evaluate(`document.querySelectorAll('[data-marker="late"]').length`)) throw new Error('something is marked late with no agreement in force');
    await click('[data-new-entry]');
    await until(`document.querySelector('[data-form="new"]')`, 'the new form');
    await setValue('contribution-new-date_made', daysAgo(90));
    const said = await page.evaluate(elapsedOf('new'));
    if (!/тоологдохгүй/.test(said[0]) || said[1] !== 'false') throw new Error(`form: ${JSON.stringify(said)}`);
    await page.evaluate(`[...document.querySelectorAll('[data-form="new"] .btn--ghost')].find((b) => b.textContent === 'Болих').click()`);
    return `top: «${top.slice(0, 60)}…»; no row marked; 90 days in the form: «${said[0]}»`;
  });

  await check('the agreement date is set only after its consequences are shown — and only for the date shown', async () => {
    await until(`document.querySelector('[data-agreement-open]')`, 'the button to set the date');
    await click('[data-agreement-open]');
    await until(`document.querySelector('[data-agreement-form]')`, 'the form');
    if (!(await page.evaluate(`document.querySelector('[data-agreement-confirm]').disabled`))) throw new Error('confirm offered before any preview');
    // A typo in the year first: everything falls before it, and it is in the future — said before anything is set.
    const typo = `${Number(daysAgo(100).slice(0, 4)) + 10}${daysAgo(100).slice(4)}`;
    await setValue('contribution-agreement-date', typo);
    await click('[data-agreement-preview-button]');
    const wrong = await until(`(() => { const p = document.querySelector('[data-agreement-preview]'); return p?.textContent && [p.querySelector('[data-agreement-year]')?.textContent, p.querySelector('[data-agreement-before]')?.dataset.agreementBefore, p.querySelector('[data-agreement-after]')?.dataset.agreementAfter, p.textContent.includes('ирээдүйд')]; })()`, 'the preview');
    if (!wrong[0].includes(typo.slice(0, 4)) || wrong[1] !== '4' || wrong[2] !== '0' || !wrong[3]) throw new Error(`typo preview: ${JSON.stringify(wrong)}`);
    // The right date: the preview, and the confirmation, go the moment the date changes.
    await setValue('contribution-agreement-date', daysAgo(100));
    const cleared = await page.evaluate(`[document.querySelector('[data-agreement-preview]').textContent, document.querySelector('[data-agreement-confirm]').disabled]`);
    if (cleared[0] !== '' || !cleared[1]) throw new Error(`a changed date kept the old preview: ${JSON.stringify(cleared)}`);
    if (posted.some((p) => p.path === '/api/contributions/agreement')) throw new Error('something was set before confirming');
    await click('[data-agreement-preview-button]');
    const right = await until(`(() => { const p = document.querySelector('[data-agreement-preview]'); const a = p?.querySelector('[data-agreement-after]'); return a && [p.querySelector('[data-agreement-before]').dataset.agreementBefore, a.dataset.agreementAfter, a.dataset.agreementLate]; })()`, 'the second preview');
    const expected = consequences(daysAgo(100));
    if (JSON.stringify(right) !== JSON.stringify([String(expected.before.count), String(expected.from.count), String(expected.from.late)])) throw new Error(`preview: ${JSON.stringify(right)}`);
    await click('[data-agreement-confirm]');
    await until(`document.querySelector('[data-agreement]')?.dataset.agreement === ${JSON.stringify(daysAgo(100))}`, 'the date, set');
    const sent = posted.find((p) => p.path === '/api/contributions/agreement')?.body;
    if (sent?.in_force_from !== daysAgo(100) || sent.seen?.before !== expected.before.count || sent.seen?.from !== expected.from.count || sent.seen?.late !== expected.from.late) throw new Error(`sent: ${JSON.stringify(sent)}`);
    if (await page.evaluate(`!!document.querySelector('[data-agreement-open]')`)) throw new Error('still offered after it was set');
    await until(`document.querySelectorAll('[data-list="contributions"] [data-entry]').length === 4`, 'the entries');
    return `year typo ${typo.slice(0, 4)}: 4 before, 0 with a clock, «ирээдүйд»; a new date clears the preview; ${daysAgo(100)}: before ${right[0]}, from ${right[1]}, late at once ${right[2]} — sent with those counts; then no longer offered`;
  });

  await check('an amount with a decimal mark is refused before it is sent; what is sent is an integer', async () => {
    await click('[data-new-entry]');
    await until(`document.querySelector('[data-form="new"]')`, 'the new form');
    await setValue('contribution-new-date_made', daysAgo(2));
    await setValue('contribution-new-what_for', 'Adobe, сарын эрх');
    for (const typed of ['1,5', '1500000.00', '1.5']) {
      await setValue('contribution-new-amount_mnt', typed);
      const posts = posted.length;
      await page.evaluate(`document.querySelector('[data-form="new"] .btn--primary').click()`);
      await until(`(() => { const s = ${statusText}; return /бүхэл төгрөгөөр/.test(s) && s; })()`, `the refusal of ${typed}`);
      if (posted.length !== posts) throw new Error(`${typed} was sent anyway`);
      await clearStatus();
    }
    await setValue('contribution-new-amount_mnt', '1 500 000');
    await page.evaluate(`document.querySelector('[data-form="new"] .btn--primary').click()`);
    for (let i = 0; i < 50 && !posted.some((p) => p.path === '/api/contributions'); i++) await sleep(100);
    const body = posted.find((p) => p.path === '/api/contributions')?.body;
    if (!body || body.amount_mnt !== 1_500_000 || !Number.isInteger(body.amount_mnt)) throw new Error(`sent: ${JSON.stringify(body)}`);
    if ('recorded_at' in body) throw new Error('the browser sent recorded_at');
    if (body.member_id !== BATUKA) throw new Error(`the form did not open on the editor's own Member: ${body.member_id}`);
    return `"1,5", "1500000.00", "1.5": refused, nothing sent; "1 500 000" sent as ${body.amount_mnt}; opened on Batuka, the editor's own Member`;
  });

  await check('the picker offers the Members — not the editors — and its help says why', async () => {
    await until(`!document.querySelector('[data-form="new"]') && document.querySelector('[data-new-entry]')`, 'the list again');
    await click('[data-new-entry]');
    await until(`document.getElementById('contribution-new-member_id')`, 'the picker');
    const options = await page.evaluate(`[...document.getElementById('contribution-new-member_id').options].map((o) => o.textContent)`);
    if (JSON.stringify(options) !== JSON.stringify(members.map((m) => m.name))) throw new Error(`options: ${JSON.stringify(options)}`);
    const help = await page.evaluate(`document.getElementById('contribution-new-member_id-help').textContent`);
    for (const clause of ['4.9', '5.4', '9.2']) if (!help.includes(clause)) throw new Error(`help without ${clause}: ${help}`);
    const whatFor = await page.evaluate(`document.getElementById('contribution-new-what_for-help').textContent`);
    if (!/картаас бодитоор татагдсан төгрөг/.test(whatFor)) throw new Error(`what_for help: ${whatFor}`);
    await page.evaluate(`[...document.querySelectorAll('[data-form="new"] .btn--ghost')].find((b) => b.textContent === 'Болих').click()`);
    return `${options.join(', ')}; help names 4.9, 5.4, 9.2; what for: «…картаас бодитоор татагдсан төгрөг…»`;
  });

  await check('«Хуулах» opens a new form with the same entry, dated today', async () => {
    await until(`!document.querySelector('[data-form="new"]') && document.querySelector('[data-entry="e2"]')`, 'the list again');
    await page.evaluate(`document.querySelector('[data-entry="e2"]').open = true`);
    await click('[data-copy="e2"]');
    const form = await until(`(() => { const f = document.querySelector('[data-form="new"]'); if (!f) return null; const v = (k) => document.getElementById('contribution-new-' + k).value; return [v('member_id'), v('date_made'), v('amount_mnt'), v('what_for'), document.getElementById('contribution-new-receipt_held').checked]; })()`, 'the copied form');
    if (form[0] !== BATUKA || form[1] !== today || form[2] !== '1\u00a0500\u00a0000' || form[3] !== 'Figma, жилийн эрх' || form[4] !== false) throw new Error(`copied: ${JSON.stringify(form)}`);
    if (!(await page.evaluate(`!!${navButton('Хавсралт 2')}.querySelector('.nav__dot')`))) throw new Error('the copy, unsaved, shows no dot in the tree');
    await page.evaluate(`[...document.querySelectorAll('[data-form="new"] .btn--ghost')].find((b) => b.textContent === 'Болих').click()`);
    return `Batuka, ${today}, 1 500 000, «Figma, жилийн эрх», receipt unticked; the unsaved dot shown`;
  });

  await check('a repayment takes principal and interest apart, as integers, and names the older loan', async () => {
    await until(`!document.querySelector('[data-form="new"]') && document.querySelector('[data-entry="e2"]')`, 'the list again');
    await page.evaluate(`document.querySelector('[data-entry="e2"]').open = true`);
    await click('[data-repay-open="e2"]');
    const older = await until(`document.querySelector('[data-repay="e2"] [data-older]')?.textContent`, 'the 5.2(c) note');
    if (!/5\.2\(c\)/.test(older) || !older.includes('1\u00a0000\u00a0001₮') || !older.includes('1\u00a0000\u00a0000₮')) throw new Error(`note: ${older}`);
    const labels = await page.evaluate(`[...document.querySelectorAll('[data-repay="e2"] .f__label')].map((l) => l.textContent)`);
    if (labels.length !== 4) throw new Error(`fields: ${labels}`);
    const interestHelp = await page.evaluate(`document.getElementById('contribution-e2-repay-interest_mnt-help').textContent`);
    if (!/5\.2\(e\)/.test(interestHelp) || !/нягтлан/.test(interestHelp)) throw new Error(`interest help: ${interestHelp}`);
    let posts = posted.length;
    await click('[data-repay-confirm="e2"]');
    await until(`(() => { const s = ${statusText}; return /аль нэгийг бичнэ/.test(s) && s; })()`, 'the refusal of an empty repayment');
    if (posted.length !== posts) throw new Error('an empty repayment was sent');
    await clearStatus();
    await setValue('contribution-e2-repay-principal_mnt', '1,5');
    await click('[data-repay-confirm="e2"]');
    await until(`(() => { const s = ${statusText}; return /Үндсэн дүнг бүхэл/.test(s) && s; })()`, 'the refusal of a decimal principal');
    if (posted.length !== posts) throw new Error('a decimal principal was sent');
    await setValue('contribution-e2-repay-principal_mnt', '1 000 000');
    await setValue('contribution-e2-repay-interest_mnt', '500 000');
    await click('[data-repay-confirm="e2"]');
    for (let i = 0; i < 50 && posted.length === posts; i++) await sleep(100);
    const sent = posted.at(-1);
    if (sent?.path !== '/api/contributions/e2/repay' || sent.body.principal_mnt !== 1_000_000 || sent.body.interest_mnt !== 500_000 || sent.body.paid_on !== today) throw new Error(`sent: ${JSON.stringify(sent)}`);
    await until(`document.querySelector('[data-entry="e3"]')`, 'the list again');
    await page.evaluate(`document.querySelector('[data-entry="e3"]').open = true`);
    const line = await page.evaluate(`document.querySelector('[data-repayments="e3"] li')?.textContent ?? ''`);
    if (!/үндсэн дүн 1₮ · нэмэгдэл 0₮/.test(line)) throw new Error(`e3's repayment: ${line}`);
    posts = posted.length;
    return `on e2: the 5.2(c) note; four fields; empty and "1,5": refused; sent {principal 1000000, interest 500000, paid_on today}; e3 lists «${line}»`;
  });

  await check('a wrong repayment is reversed with a reason — never edited — and a change of kind says whether the Member was told', async () => {
    await until(`document.querySelector('[data-entry="e3"]')`, 'the list again');
    await page.evaluate(`document.querySelector('[data-entry="e3"]').open = true`);
    await click('[data-reverse-open="r1"]');
    await until(`document.querySelector('[data-reverse="r1"] textarea')`, 'the reason box');
    const posts = posted.length;
    await click('[data-reverse-confirm="r1"]');
    await until(`(() => { const s = ${statusText}; return /шалтгаанаа бичнэ/.test(s) && s; })()`, 'the refusal of no reason');
    if (posted.length !== posts) throw new Error('a reversal with no reason was sent');
    await setValue('contribution-e3-reverse-r1', 'Дүнг буруу бичсэн');
    await click('[data-reverse-confirm="r1"]');
    for (let i = 0; i < 50 && posted.length === posts; i++) await sleep(100);
    const sent = posted.at(-1);
    if (sent?.path !== '/api/contributions/e3/repayments/r1/reverse' || sent.body.reason !== 'Дүнг буруу бичсэн') throw new Error(`sent: ${JSON.stringify(sent)}`);
    if (await page.evaluate(`!!document.querySelector('[data-repayments] [data-edit], [data-repayment] input')`)) throw new Error('a repayment can be edited');
    await until(`document.querySelector('[data-entry="e2"]')`, 'the list again');
    await page.evaluate(`document.querySelector('[data-entry="e2"]').open = true; document.querySelector('[data-entry="e1"]').open = true`);
    const told = await page.evaluate(`[document.querySelector('[data-entry="e2"] [data-told]')?.textContent, document.querySelector('[data-entry="e1"] [data-told]')?.textContent]`);
    if (!/гишүүнд мэдэгдсэн/.test(told[0] ?? '') || !/⚠ гишүүнд мэдэгдээгүй/.test(told[1] ?? '')) throw new Error(`told: ${JSON.stringify(told)}`);
    return `no reason: refused, nothing sent; sent {reason} to …/e3/repayments/r1/reverse; no way to edit one; kind changes: «${told[0].trim()}», «${told[1].trim()}»`;
  });

  await check('the member filter asks the Worker for one Member', async () => {
    await page.evaluate(`(() => { const s = document.getElementById('contributions-filter-member'); s.value = ${JSON.stringify(BATENKH)}; s.dispatchEvent(new Event('change')); })()`);
    await until(`document.querySelectorAll('[data-list="contributions"] [data-entry]').length === 2`, 'two rows');
    if (!asked.includes(`GET /api/contributions?member=${BATENKH}`)) throw new Error('the Worker was not asked for that Member');
    const strip = await page.evaluate(`document.querySelectorAll('[data-summary] tbody tr').length`);
    if (strip !== members.length) throw new Error(`the strip narrowed to ${strip}`);
    return `?member=Batenkh → 2 rows; the strip still ${strip} Members`;
  });

  await check('a tool that cannot load says so in its place — and the rest of the admin carries on', async () => {
    brokenChunk = /\/_astro\/admin-tasks\./;
    await page.evaluate(`${navButton('Даалгавар')}.click()`);
    const said = await until(`document.querySelector('[data-tool-failed="tasks"]')?.textContent`, 'the task list to say it did not load');
    if (!/ачаалж чадсангүй/.test(said)) throw new Error(`said: ${said}`);
    await page.evaluate(`${navButton('Хавсралт 2')}.click()`);
    await until(`document.querySelectorAll('[data-summary] tbody tr').length === ${members.length}`, '«Хавсралт 2» after the failure');
    await page.evaluate(`${navButton('Хүсэлтүүд')}.click()`);
    await until(`!document.querySelector('[data-tool-failed]') && document.querySelector('.main__title')?.textContent === 'Хүсэлтүүд'`, 'the inbox after the failure');
    const badge = await page.evaluate(`!!${navButton('Даалгавар')}`);
    brokenChunk = null;
    return `«Даалгавар»: «${said.slice(0, 50)}…»; «Хавсралт 2» and «Хүсэлтүүд» open as ever; the tree intact (${badge ? 'Даалгавар still listed' : 'gone'})`;
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
