/**
 * Weight budget. Sums dist/index.html plus every asset the page actually
 * pulls — including fonts, which are only reachable through the CSS — and
 * exits non-zero if the page breaks the CLAUDE.md ceilings.
 *
 * Two budgets, checked separately (CLAUDE.md > Budget): the first load, which
 * everyone pays, and the lazy budget — at most one asset requested after first
 * paint on capable desktops. Breaking either one fails the run.
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
const LAZY_MAX = 500_000; //   500 kB after first paint, desktop only
const LAZY_MAX_COUNT = 1; //   CLAUDE.md allows one lazy asset

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

/** Bodies of inline <script>s that run as code — not external, not JSON data. */
function scriptBodies(html) {
  const bodies = [];
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const [, attrs, body] = match;
    if (/\bsrc\s*=/i.test(attrs)) continue;
    if (/\btype\s*=\s*["']?(application\/(ld\+)?json|importmap)/i.test(attrs)) continue;
    bodies.push(body);
  }
  return bodies;
}

/** Inline <script> and <style> bodies. Already inside the HTML byte count, but
 *  the JS ceiling has to see them or inlining would hide a breach. */
function inlineBytes(html) {
  let js = 0;
  let css = 0;
  for (const body of scriptBodies(html)) js += Buffer.byteLength(body, 'utf8');
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

// ---------------------------------------------------------------------- lazy

/*
  The lazy budget. A page declares its post-paint asset on the element that
  uses it, as data-lazy="/media/…" — deliberately not data-lazy-src, which the
  first-load scan above would match as a src and count twice.

  Shipped JS is also swept for media paths written as string literals. That is
  the backstop: a script that requests a file directly is caught here even
  though nothing declared it, so no asset can slip past both budgets.
*/
const LAZY_EXT = /\.(avif|webp|png|jpe?g|gif|svg|webm|mp4|json)$/i;
const pageHtml = readFileSync(entry, 'utf8');

const declaredLazy = [...pageHtml.matchAll(/\bdata-lazy\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi)].map((m) => clean(m[1]));

const scriptSources = [
  ...[...seen.keys()].filter((file) => typeOf(file) === 'js').map((file) => readFileSync(file, 'utf8')),
  ...scriptBodies(pageHtml),
];
const literalLazy = new Set();
for (const source of scriptSources) {
  for (const match of source.matchAll(/["'`](\/[^"'`\s]+)["'`]/g)) {
    const ref = clean(match[1]);
    if (LAZY_EXT.test(ref)) literalLazy.add(ref);
  }
}

const lazy = new Map(); // absolute path -> declared?
const lazyProblems = [];

for (const ref of declaredLazy) {
  const target = resolveRef(ref, entry);
  if (!target) lazyProblems.push(`data-lazy="${ref}" does not resolve to a file in dist/.`);
  else if (seen.has(target)) lazyProblems.push(`${ref} is declared lazy but is also loaded on first paint.`);
  else lazy.set(target, true);
}

for (const ref of literalLazy) {
  const target = resolveRef(ref, entry);
  if (!target || seen.has(target) || lazy.has(target)) continue;
  lazy.set(target, false);
  lazyProblems.push(`${ref} is requested from JS without a data-lazy declaration.`);
}

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

// ------------------------------------------------------------- by section

/**
 * Splits index.html at its top-level <section> boundaries and attributes each
 * slice's own bytes plus the assets it references to that section, so it is
 * obvious which part of the page is expensive. Counts nesting, because the
 * pricing groups are <section>s inside a <section>.
 */
function sliceSections(html) {
  const slices = [];
  const open = /<section\b[^>]*>/gi;
  let match;

  while ((match = open.exec(html))) {
    const id = /\bid="([^"]+)"/.exec(match[0])?.[1];
    if (!id) continue; // a nested, unnamed section — its bytes belong to its parent

    let depth = 1;
    const scan = /<section\b[^>]*>|<\/section>/gi;
    scan.lastIndex = open.lastIndex;
    let end = html.length;
    let inner;
    while ((inner = scan.exec(html))) {
      depth += inner[0].startsWith('</') ? -1 : 1;
      if (depth === 0) {
        end = scan.lastIndex;
        break;
      }
    }

    slices.push({ id, html: html.slice(match.index, end) });
    open.lastIndex = end; // don't re-enter this section's children
  }
  return slices;
}

const entryHtml = readFileSync(entry, 'utf8');
const sections = sliceSections(entryHtml);
const sizeOf = (file) => seen.get(file) ?? 0;

const sectionRows = [];
const claimed = new Set();

for (const section of sections) {
  let assetBytes = 0;
  const refs = new Set([...refsInHtml(section.html), ...refsInCss(section.html)]);
  for (const ref of refs) {
    const target = resolveRef(ref, entry);
    if (!target || claimed.has(target)) continue;
    claimed.add(target);
    assetBytes += sizeOf(target);
  }
  const markup = Buffer.byteLength(section.html, 'utf8');
  sectionRows.push({ id: section.id, markup, assets: assetBytes, total: markup + assetBytes });
}

const sectionMarkup = sectionRows.reduce((sum, row) => sum + row.markup, 0);
const sharedBytes = total - sectionRows.reduce((sum, row) => sum + row.total, 0);

sectionRows.sort((a, b) => b.total - a.total);

console.log('\n  BY SECTION\n');
const idWidth = Math.max(...sectionRows.map((row) => row.id.length), 8);
console.log(`  ${'section'.padEnd(idWidth)}  ${'markup'.padStart(11)}  ${'media'.padStart(11)}  ${'total'.padStart(11)}`);
console.log(`  ${'-'.repeat(idWidth)}  ${'-'.repeat(11)}  ${'-'.repeat(11)}  ${'-'.repeat(11)}`);
for (const row of sectionRows) {
  console.log(`  ${row.id.padEnd(idWidth)}  ${kb(row.markup)}  ${kb(row.assets)}  ${kb(row.total)}`);
}
console.log(
  `  ${'shared'.padEnd(idWidth)}  ${''.padStart(11)}  ${''.padStart(11)}  ${kb(sharedBytes)}` +
    `   fonts, css, js, chrome`
);
console.log(`\n  heaviest: ${sectionRows[0]?.id ?? '—'} at ${kb(sectionRows[0]?.total ?? 0).trim()}`);
console.log(`  page markup inside sections: ${kb(sectionMarkup).trim()}`);

const lazyFiles = [...lazy.entries()].map(([file, declared]) => ({
  path: relative(dist, file).split(sep).join(posix.sep),
  bytes: statSync(file).size,
  brotli: brotliCompressSync(readFileSync(file), { params: { [constants.BROTLI_PARAM_QUALITY]: 5 } }).length,
  declared,
}));
const lazyTotal = lazyFiles.reduce((sum, f) => sum + f.bytes, 0);

console.log('\n  LAZY - requested after first paint, capable desktops only; not part of the first load\n');
if (lazyFiles.length === 0) console.log('  none');
for (const file of lazyFiles) {
  console.log(`  ${file.path.padEnd(width)}  ${kb(file.bytes)}  ${kb(file.brotli)}  ${file.declared ? 'data-lazy' : 'UNDECLARED'}`);
}

const overTotal = total > TOTAL_MAX;
const overJs = jsTotal > JS_MAX;
const overLazy = lazyTotal > LAZY_MAX;
const tooManyLazy = lazyFiles.length > LAZY_MAX_COUNT;

console.log('\n  BUDGET\n');
console.log(`  total   ${kb(total)} of ${kb(TOTAL_MAX)}   ${pct(total, TOTAL_MAX).padStart(6)}  ${overTotal ? 'OVER' : 'ok'}`);
console.log(`  js      ${kb(jsTotal)} of ${kb(JS_MAX)}   ${pct(jsTotal, JS_MAX).padStart(6)}  ${overJs ? 'OVER' : 'ok'}`);
console.log(
  `  lazy    ${kb(lazyTotal)} of ${kb(LAZY_MAX)}   ${pct(lazyTotal, LAZY_MAX).padStart(6)}  ${overLazy ? 'OVER' : 'ok'}` +
    `   ${lazyFiles.length} of ${LAZY_MAX_COUNT} asset${tooManyLazy ? '  OVER' : ''}`
);
console.log(`  (brotli ${kb(totalBrotli)} over the wire - informational; the budget is enforced on raw bytes)\n`);

if (overTotal || overJs || overLazy || tooManyLazy || lazyProblems.length > 0) {
  if (overTotal) console.error(`  FAIL  total is ${kb(total - TOTAL_MAX).trim()} over the 1 MB first-load budget.`);
  if (overJs) console.error(`  FAIL  JS is ${kb(jsTotal - JS_MAX).trim()} over the 200 kB budget.`);
  if (overLazy) console.error(`  FAIL  lazy is ${kb(lazyTotal - LAZY_MAX).trim()} over the 500 kB lazy budget.`);
  if (tooManyLazy) console.error(`  FAIL  ${lazyFiles.length} lazy assets; CLAUDE.md allows ${LAZY_MAX_COUNT}.`);
  for (const problem of lazyProblems) console.error(`  FAIL  ${problem}`);
  console.error('');
  process.exit(1);
}

console.log('  PASS\n');
