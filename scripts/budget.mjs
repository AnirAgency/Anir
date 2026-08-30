/**
 * Weight budget. Sums dist/index.html plus every asset the page actually
 * pulls — including fonts, which are only reachable through the CSS — and
 * exits non-zero if the page breaks the CLAUDE.md ceilings.
 *
 * Budgets are decimal bytes, because the constraint they encode is bandwidth
 * (17 Mbps mobile) and link speed is measured decimally.
 *
 * Usage: npm run budget
 */
import { brotliCompressSync, constants } from 'node:zlib';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, posix, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const entry = join(dist, 'index.html');

const TOTAL_MAX = 1_000_000; // 1 MB first load
const JS_MAX = 200_000; //     200 kB JS

const TYPES = {
  '.html': 'html',
  '.css': 'css',
  '.js': 'js',
  '.mjs': 'js',
  '.woff2': 'font',
  '.woff': 'font',
  '.ttf': 'font',
  '.otf': 'font',
  '.svg': 'image',
  '.png': 'image',
  '.jpg': 'image',
  '.jpeg': 'image',
  '.webp': 'image',
  '.avif': 'image',
  '.gif': 'image',
  '.ico': 'image',
  '.webm': 'video',
  '.mp4': 'video',
  '.json': 'other',
  '.txt': 'other',
  '.xml': 'other',
  '.webmanifest': 'other',
};

const typeOf = (file) => {
  const dot = file.lastIndexOf('.');
  return TYPES[file.slice(dot).toLowerCase()] ?? 'other';
};

if (!existsSync(entry)) {
  console.error('No dist/index.html. Run `npm run build` first.');
  process.exit(1);
}

/** Strips quotes, query strings and hashes off a reference. */
const clean = (ref) => ref.trim().replace(/^['"]|['"]$/g, '').split('#')[0].split('?')[0];

const isExternal = (ref) => !ref || /^(https?:|data:|blob:|mailto:|tel:|javascript:|#|\/\/)/i.test(ref);

/** Resolves a reference found inside `fromFile` to a path on disk, or null. */
function resolveRef(ref, fromFile) {
  const value = clean(ref);
  if (isExternal(value)) return null;
  const target = value.startsWith('/') ? join(dist, value.slice(1)) : resolve(dirname(fromFile), value);
  if (!target.startsWith(dist)) return null;
  return existsSync(target) && statSync(target).isFile() ? target : null;
}

/** First URL of each srcset candidate. */
const fromSrcset = (value) => value.split(',').map((part) => part.trim().split(/\s+/)[0]).filter(Boolean);

function refsInHtml(html) {
  const found = [];
  for (const tag of html.matchAll(/<(\w+)\b([^>]*)>/g)) {
    const [, name, attrs] = tag;
    if (name.toLowerCase() === 'a') continue; // navigation, not a page asset
    for (const match of attrs.matchAll(/\b(src|href|poster|content)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi)) {
      const [, key, raw] = match;
      // <meta content> is only an asset for og:image / twitter:image.
      if (key.toLowerCase() === 'content' && !/(og:image|twitter:image)/i.test(attrs)) continue;
      found.push(clean(raw));
    }
    for (const match of attrs.matchAll(/\bsrcset\s*=\s*("[^"]*"|'[^']*')/gi)) {
      found.push(...fromSrcset(clean(match[1])));
    }
  }
  return found;
}

function refsInCss(css) {
  const found = [];
  for (const match of css.matchAll(/url\(\s*([^)]+?)\s*\)/gi)) found.push(clean(match[1]));
  for (const match of css.matchAll(/@import\s+(?:url\()?\s*("[^"]+"|'[^']+')/gi)) found.push(clean(match[1]));
  return found;
}

/** Inline <script> and <style> bodies. Already inside the HTML byte count, but
 *  the JS ceiling has to see them or inlining would hide a breach. */
function inlineBytes(html) {
  let js = 0;
  let css = 0;
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const [, attrs, body] = match;
    if (/\bsrc\s*=/i.test(attrs)) continue;
    if (/\btype\s*=\s*["']?(application\/(ld\+)?json|importmap)/i.test(attrs)) continue;
    js += Buffer.byteLength(body, 'utf8');
  }
  for (const match of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
    css += Buffer.byteLength(match[1], 'utf8');
  }
  return { js, css };
}

// ------------------------------------------------------------------ traverse

const seen = new Map(); // absolute path -> bytes
const queue = [entry];

while (queue.length) {
  const file = queue.shift();
  if (seen.has(file)) continue;
  seen.set(file, statSync(file).size);

  const type = typeOf(file);
  if (type !== 'html' && type !== 'css') continue;

  const source = readFileSync(file, 'utf8');
  // For HTML, refsInCss also sweeps inline <style> blocks and style="" attributes.
  const refs = type === 'html' ? [...refsInHtml(source), ...refsInCss(source)] : refsInCss(source);

  for (const ref of refs) {
    const target = resolveRef(ref, file);
    if (target && !seen.has(target)) queue.push(target);
  }
}

const inline = inlineBytes(readFileSync(entry, 'utf8'));

// -------------------------------------------------------------------- report

const files = [...seen.entries()]
  .map(([file, bytes]) => ({
    path: relative(dist, file).split(sep).join(posix.sep),
    bytes,
    type: typeOf(file),
    brotli: brotliCompressSync(readFileSync(file), {
      params: { [constants.BROTLI_PARAM_QUALITY]: 5 },
    }).length,
  }))
  .sort((a, b) => b.bytes - a.bytes);

const total = files.reduce((sum, f) => sum + f.bytes, 0);
const totalBrotli = files.reduce((sum, f) => sum + f.brotli, 0);
const jsTotal = files.filter((f) => f.type === 'js').reduce((sum, f) => sum + f.bytes, 0) + inline.js;

const kb = (bytes) => `${(bytes / 1000).toFixed(1).padStart(8)} kB`;
const pct = (bytes, max) => `${((bytes / max) * 100).toFixed(1)}%`;

const byType = new Map();
for (const file of files) {
  const bucket = byType.get(file.type) ?? { bytes: 0, brotli: 0, count: 0 };
  bucket.bytes += file.bytes;
  bucket.brotli += file.brotli;
  bucket.count += 1;
  byType.set(file.type, bucket);
}

const width = Math.max(...files.map((f) => f.path.length), 22);
console.log('\n  FIRST LOAD - dist/index.html and everything it references\n');
console.log(`  ${'file'.padEnd(width)}  ${'raw'.padStart(11)}  ${'brotli'.padStart(11)}  type`);
console.log(`  ${'-'.repeat(width)}  ${'-'.repeat(11)}  ${'-'.repeat(11)}  ----`);
for (const file of files) {
  console.log(`  ${file.path.padEnd(width)}  ${kb(file.bytes)}  ${kb(file.brotli)}  ${file.type}`);
}

console.log('\n  BY TYPE\n');
for (const type of ['html', 'css', 'js', 'font', 'image', 'video', 'other']) {
  const bucket = byType.get(type);
  if (!bucket) continue;
  const share = ((bucket.bytes / total) * 100).toFixed(1).padStart(5);
  console.log(
    `  ${type.padEnd(6)} ${String(bucket.count).padStart(3)} file(s)  ${kb(bucket.bytes)}  ${kb(bucket.brotli)}  ${share}%`
  );
}

if (inline.js || inline.css) {
  console.log('\n  inline (already counted inside index.html):');
  if (inline.js) console.log(`    <script>  ${kb(inline.js)}`);
  if (inline.css) console.log(`    <style>   ${kb(inline.css)}`);
}

const overTotal = total > TOTAL_MAX;
const overJs = jsTotal > JS_MAX;

console.log('\n  BUDGET\n');
console.log(`  total   ${kb(total)} of ${kb(TOTAL_MAX)}   ${pct(total, TOTAL_MAX).padStart(6)}  ${overTotal ? 'OVER' : 'ok'}`);
console.log(`  js      ${kb(jsTotal)} of ${kb(JS_MAX)}   ${pct(jsTotal, JS_MAX).padStart(6)}  ${overJs ? 'OVER' : 'ok'}`);
console.log(`  (brotli ${kb(totalBrotli)} over the wire - informational; the budget is enforced on raw bytes)\n`);

if (overTotal || overJs) {
  if (overTotal) console.error(`  FAIL  total is ${kb(total - TOTAL_MAX).trim()} over the 1 MB first-load budget.`);
  if (overJs) console.error(`  FAIL  JS is ${kb(jsTotal - JS_MAX).trim()} over the 200 kB budget.`);
  console.error('');
  process.exit(1);
}

console.log('  PASS\n');
