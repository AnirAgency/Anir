/**
 * Screenshots and page measurements, driven over the Chrome DevTools Protocol.
 *
 * Uses whatever Chromium is already installed (Chrome or Edge) and Node's
 * built-in WebSocket, so it adds no dependencies to the project. Viewport size
 * is set with Emulation.setDeviceMetricsOverride rather than --window-size, so
 * 390 means 390 CSS pixels exactly.
 *
 *   node scripts/shot.mjs <url> <out.png> [width] [height] [--full]
 *   node scripts/shot.mjs <url> --measure [width]
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const CHROME_PATHS = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
];

const browser = CHROME_PATHS.find((path) => existsSync(path));
if (!browser) {
  console.error('No Chrome or Edge found. Add its path to CHROME_PATHS.');
  process.exit(1);
}

const [url, target, ...rest] = process.argv.slice(2);
const measureOnly = target === '--measure';
const full = rest.includes('--full');
const nums = rest.filter((arg) => !arg.startsWith('--')).map(Number);
const width = (measureOnly ? nums[0] : nums[0]) || 1440;
const height = (measureOnly ? 900 : nums[1]) || 900;

const port = 9222 + Math.floor(Math.random() * 500);
const chrome = spawn(browser, [
  '--headless=new',
  `--remote-debugging-port=${port}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-gpu',
  '--hide-scrollbars',
  '--user-data-dir=' + (process.env.TEMP || '/tmp') + '/anir-cdp-' + port,
  'about:blank',
]);

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

/** Waits for the DevTools endpoint to come up. */
async function endpoint() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) return (await res.json()).webSocketDebuggerUrl;
    } catch {
      /* not up yet */
    }
    await sleep(200);
  }
  throw new Error('Chrome never opened its debugging port');
}

const socket = new WebSocket(await endpoint());
await new Promise((done, fail) => {
  socket.addEventListener('open', done, { once: true });
  socket.addEventListener('error', fail, { once: true });
});

let nextId = 0;
const pending = new Map();
const events = [];

socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (message.id !== undefined) {
    const settle = pending.get(message.id);
    pending.delete(message.id);
    if (settle) message.error ? settle.fail(new Error(message.error.message)) : settle.done(message.result);
  } else {
    events.push(message);
  }
});

const send = (method, params = {}, sessionId) =>
  new Promise((done, fail) => {
    const id = (nextId += 1);
    pending.set(id, { done, fail });
    socket.send(JSON.stringify({ id, method, params, sessionId }));
  });

// Attach to a fresh tab.
const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
const call = (method, params) => send(method, params, sessionId);

await call('Page.enable');

// --console surfaces browser log entries — CSP violations arrive here as
// security errors, and they are invisible otherwise.
const logEntries = [];
if (rest.includes('--console')) {
  await call('Log.enable');
  await call('Runtime.enable');
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.method === 'Log.entryAdded') {
      const e = message.params.entry;
      logEntries.push(`[${e.level}/${e.source}] ${e.text}`);
    }
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
      logEntries.push(`[error/console] ${message.params.args.map((a) => a.value ?? a.description).join(' ')}`);
    }
    if (message.method === 'Runtime.exceptionThrown') {
      logEntries.push(`[error/exception] ${message.params.exceptionDetails.text}`);
    }
  });
}
await call('Emulation.setDeviceMetricsOverride', {
  width,
  height,
  deviceScaleFactor: 1,
  mobile: width < 860,
});

// --no-js proves the page is content-first: everything must still render with
// scripts off, since motion is enhancement (CLAUDE.md > Definition of done).
if (rest.includes('--no-js')) {
  await call('Emulation.setScriptExecutionDisabled', { value: true });
}

if (rest.includes('--reduced-motion')) {
  await call('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  });
}

await call('Page.navigate', { url });

// Wait for the load event, then give fonts and layout a beat to settle.
for (let attempt = 0; attempt < 100; attempt += 1) {
  if (events.some((event) => event.method === 'Page.loadEventFired')) break;
  await sleep(100);
}
await call('Runtime.evaluate', {
  expression: 'document.fonts ? document.fonts.ready.then(() => true) : true',
  awaitPromise: true,
});
await sleep(350);

// --scroll=N jumps N pixels down before capturing, for anything that only
// exists mid-page: the header blending over a light section, the rail fill.
const scrollArg = rest.find((arg) => arg.startsWith('--scroll='));
if (scrollArg) {
  await call('Runtime.evaluate', {
    expression: `window.scrollTo({ top: ${Number(scrollArg.split('=')[1])}, behavior: 'instant' });`,
  });
  // Long enough for a scroll reveal to finish: 0.9s transition plus the
  // stagger. Capturing sooner catches elements part-faded and every screenshot
  // comes out subtly washed out.
  await sleep(1500);
}

// --eval runs before any capture, so it can also set the page up for the shot
// (forcing a hover state, opening something) rather than only reporting.
const evalArg = rest.find((arg) => arg.startsWith('--eval='));
if (evalArg) {
  const { result } = await call('Runtime.evaluate', {
    returnByValue: true,
    expression: evalArg.slice('--eval='.length),
    awaitPromise: true,
  });
  if (result.value !== undefined) console.log(JSON.stringify(result.value, null, 2));
  await sleep(250);
}

// --press=Tab,ArrowRight sends real key events through the browser, so native
// behaviour (radio-group arrow keys, focus order) is exercised for real rather
// than simulated with synthetic events, which would not trigger it.
const KEYS = {
  Tab: { code: 'Tab', key: 'Tab', vk: 9, text: '\t' },
  Enter: { code: 'Enter', key: 'Enter', vk: 13, text: '\r' },
  Space: { code: 'Space', key: ' ', vk: 32, text: ' ' },
  ArrowLeft: { code: 'ArrowLeft', key: 'ArrowLeft', vk: 37 },
  ArrowUp: { code: 'ArrowUp', key: 'ArrowUp', vk: 38 },
  ArrowRight: { code: 'ArrowRight', key: 'ArrowRight', vk: 39 },
  ArrowDown: { code: 'ArrowDown', key: 'ArrowDown', vk: 40 },
};

const pressArg = rest.find((arg) => arg.startsWith('--press='));
if (pressArg) {
  for (const name of pressArg.slice('--press='.length).split(',')) {
    const spec = KEYS[name.trim()];
    if (!spec) throw new Error(`Unknown key: ${name}`);
    const base = { key: spec.key, code: spec.code, windowsVirtualKeyCode: spec.vk, nativeVirtualKeyCode: spec.vk };
    await call('Input.dispatchKeyEvent', { type: spec.text ? 'keyDown' : 'rawKeyDown', ...base, text: spec.text });
    await call('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
    await sleep(60);
  }
  await sleep(200);
}

const afterArg = rest.find((arg) => arg.startsWith('--after='));
if (afterArg) {
  const { result } = await call('Runtime.evaluate', {
    returnByValue: true,
    expression: afterArg.slice('--after='.length),
  });
  console.log(JSON.stringify(result.value, null, 2));
}

if (rest.includes('--console')) {
  console.log(JSON.stringify({ consoleEntries: logEntries.length, entries: logEntries }, null, 2));
}

if (measureOnly) {
  const { result } = await call('Runtime.evaluate', {
    returnByValue: true,
    expression: `(() => {
      const doc = document.documentElement;
      const limit = doc.clientWidth;
      // Content deliberately clipped by an overflow:hidden ancestor (a marquee
      // track, say) is not a layout bug — only report what can actually push
      // the page sideways.
      const clipped = (el) => {
        for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
          const o = getComputedStyle(p);
          if (o.overflowX === 'hidden' || o.overflowX === 'clip') return true;
        }
        return false;
      };
      const guilty = [];
      for (const el of document.querySelectorAll('body *')) {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) continue;
        if (getComputedStyle(el).position === 'fixed') continue;
        if (clipped(el)) continue;
        if (rect.right > limit + 0.5 || rect.left < -0.5) {
          guilty.push({
            tag: el.tagName.toLowerCase(),
            cls: (el.getAttribute('class') || '').slice(0, 60),
            left: Math.round(rect.left),
            right: Math.round(rect.right),
            width: Math.round(rect.width),
          });
        }
      }
      return {
        viewport: limit,
        scrollWidth: doc.scrollWidth,
        scrollHeight: doc.scrollHeight,
        overflow: doc.scrollWidth - limit,
        guilty: guilty.slice(0, 25),
      };
    })()`,
  });
  console.log(JSON.stringify(result.value, null, 2));
} else {
  // No clip: clip coordinates are document-relative, which fights --scroll.
  // Without it, captureScreenshot takes exactly the current viewport.
  const shot = await call('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: full,
  });
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, Buffer.from(shot.data, 'base64'));
  console.log(`${target}  ${width}x${full ? 'full' : height}`);
}

socket.close();
chrome.kill();
process.exit(0);
