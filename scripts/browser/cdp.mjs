// A minimal Chrome DevTools Protocol driver for the admin's browser tests: Node's own WebSocket, no dependency.
// Finds Chrome or Edge where Windows installs them; `chrome` answers null when there is neither.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';

export const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((p) => existsSync(p)) ?? null;

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function open(url, opts = {}) {
  const { width = 1440, height = 900, mobile = width < 861, dpr = 1, reduced = false, cores, network, cpu, saveData, extraArgs = [] } = opts;
  const port = 9300 + Math.floor(Math.random() * 600);
  const dir = (process.env.TEMP || '/tmp') + '/anir-cdp-' + port;
  const chrome = spawn(CHROME, [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--hide-scrollbars',
    ...extraArgs,
    '--autoplay-policy=no-user-gesture-required',
    `--user-data-dir=${dir}`,
    'about:blank',
  ]);
  let ws;
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (r.ok) { ws = (await r.json()).webSocketDebuggerUrl; break; }
    } catch {}
    await sleep(150);
  }
  const socket = new WebSocket(ws);
  await new Promise((ok, no) => { socket.addEventListener('open', ok, { once: true }); socket.addEventListener('error', no, { once: true }); });
  let id = 0;
  const pending = new Map();
  const events = [];
  const listeners = [];
  socket.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id !== undefined) {
      const p = pending.get(m.id); pending.delete(m.id);
      if (p) m.error ? p.no(new Error(m.error.message)) : p.ok(m.result);
    } else { events.push(m); for (const l of listeners) l(m); }
  });
  const send = (method, params = {}, sessionId) => new Promise((ok, no) => {
    const n = ++id; pending.set(n, { ok, no });
    socket.send(JSON.stringify({ id: n, method, params, sessionId }));
  });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const call = (m, p) => send(m, p, sessionId);
  await call('Page.enable');
  await call('Network.enable');
  await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: dpr, mobile });
  if (mobile) await call('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  if (reduced) await call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  if (cores) await call('Emulation.setHardwareConcurrencyOverride', { hardwareConcurrency: cores });
  if (cpu) await call('Emulation.setCPUThrottlingRate', { rate: cpu });
  if (network) await call('Network.emulateNetworkConditions', { offline: false, ...network });
  if (saveData) await call('Network.setExtraHTTPHeaders', { headers: { 'Save-Data': 'on' } });
  if (opts.beforeNavigate) await opts.beforeNavigate(call);
  const t0 = Date.now();
  await call('Page.navigate', { url });
  if (opts.noWait !== true) {
    for (let i = 0; i < 1200; i++) { if (events.some((e) => e.method === 'Page.loadEventFired')) break; await sleep(50); }
    await call('Runtime.evaluate', { expression: 'document.fonts.ready.then(()=>1)', awaitPromise: true });
  }
  const evaluate = async (expression) => {
    const r = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  const shot = async (path, clip) => {
    const r = await call('Page.captureScreenshot', { format: 'png', ...(clip ? { clip: { ...clip, scale: 1 } } : {}) });
    writeFileSync(path, Buffer.from(r.data, 'base64'));
  };
  const close = async () => {
    try { await send('Browser.close'); } catch {}
    chrome.kill();
    await sleep(300);
    try { rmSync(dir, { recursive: true, force: true }); } catch {}
  };
  return { call, evaluate, shot, close, events, listeners, t0 };
}
