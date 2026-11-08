/**
 * What search engines and link previews read, checked on the built pages —
 * `npm run seo`, run by `npm run budget` after the contrast check, and as
 * blocking as it. Placeholders will be replaced by real photographs, often
 * through the admin, which is exactly when an alt text gets forgotten; the
 * build stops instead, naming the image.
 *
 * Fails on (FAIL  seo: … / FAIL  alt: …, which the build report names for
 * the admin — worker/builds.ts):
 *   - a page without <html lang="mn">, with hreflang, or with a keywords meta;
 *   - a page without exactly one <h1> (the admin, an app, is not a page here);
 *   - an indexable page without its own <title> and description, or sharing
 *     either with another page;
 *   - an indexable page without a self-referencing, absolute canonical, or
 *     without og:title, og:description, og:image (absolute, and in dist/),
 *     og:url equal to the canonical, og:locale mn_MN, og:type, and the
 *     Twitter card;
 *   - a JSON-LD block that does not parse, or a home page without its
 *     Organization, ProfessionalService (a LocalBusiness) and WebSite records;
 *   - an <img> with no alt; an empty alt on an image not declared decorative
 *     (aria-hidden="true"); an alt that is not Mongolian, or reads like a
 *     file name;
 *   - a 404 page that is indexable or names a canonical;
 *   - a sitemap.xml that lists anything but the indexable pages, or a
 *     robots.txt that does not point at it.
 *
 * Says, never fails, when a title passes ~60 characters or a description
 * ~155: Google cuts them there, but a length is guidance for the editor, not
 * a limit (CLAUDE.md > The admin). Counted in characters, not bytes — a
 * Cyrillic letter is one character and two bytes.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, posix, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITE_URL } from '../src/lib/site-url.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const TITLE_GUIDE = 60;
const DESCRIPTION_GUIDE = 155;

const failures = [];
const warnings = [];
const fail = (kind, text) => failures.push(`${kind}: ${text}`);

const decode = (s) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const attr = (tag, name) => {
  const m = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag);
  return m ? decode(m[2] ?? m[3] ?? m[4] ?? '') : null;
};
const meta = (html, key, value) => {
  for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi)) if (attr(tag, key) === value) return attr(tag, 'content');
  return null;
};
const chars = (s) => [...s].length;
const CYRILLIC = /[Ѐ-ӿ]/;

/** Every built page: each index.html, and the 404 page. */
const pages = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else if (name === 'index.html' || (name === '404.html' && dir === dist)) pages.push(full);
  }
};
walk(dist);

const urlOf = (file) => {
  const path = relative(dist, file).split(sep).join(posix.sep);
  if (path === '404.html') return '/404.html';
  return `/${posix.dirname(path) === '.' ? '' : `${posix.dirname(path)}/`}`;
};

const indexable = [];
const seen = { title: new Map(), description: new Map() };

for (const file of pages.sort()) {
  const html = readFileSync(file, 'utf8');
  const path = urlOf(file);
  const isAdmin = path.startsWith('/admin/');
  const robots = meta(html, 'name', 'robots') ?? '';
  const noindex = /noindex/i.test(robots);

  if (/<html\b[^>]*\blang=["']?mn["'\s>]/i.test(html) === false) fail('seo', `${path} has no <html lang="mn">`);
  if (/hreflang/i.test(html)) fail('seo', `${path} carries hreflang — there is no other language version`);
  if (meta(html, 'name', 'keywords') !== null) fail('seo', `${path} carries a keywords meta`);

  // Images: alt on every one, Mongolian, and empty only where declared decorative.
  for (const [tag] of html.matchAll(/<img\b[^>]*>/gi)) {
    const src = attr(tag, 'src') ?? '(no src)';
    const alt = attr(tag, 'alt');
    if (alt === null) fail('alt', `${path} ${src} has no alt`);
    else if (alt === '') {
      if (attr(tag, 'aria-hidden') !== 'true') fail('alt', `${path} ${src} has an empty alt but is not declared decorative (aria-hidden="true")`);
    } else if (!CYRILLIC.test(alt)) fail('alt', `${path} ${src} has an alt that is not Mongolian: "${alt}"`);
    else if (/\.(avif|webp|png|jpe?g|gif|svg)\b/i.test(alt) || /^[\w-]+$/.test(alt)) fail('alt', `${path} ${src} has an alt that reads like a file name: "${alt}"`);
  }

  // JSON-LD: a malformed block is worse than none.
  const records = [];
  for (const [, body] of html.matchAll(/<script\b[^>]*type=["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      records.push(JSON.parse(body));
    } catch (error) {
      fail('seo', `${path} has a JSON-LD block that does not parse: ${error.message}`);
    }
  }

  if (isAdmin) continue;

  const h1s = [...html.matchAll(/<h1\b/gi)].length;
  if (h1s !== 1) fail('seo', `${path} has ${h1s} <h1>, not one`);

  const title = decode(/<title>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? '').trim();
  const description = (meta(html, 'name', 'description') ?? '').trim();
  const canonical = /<link\b[^>]*rel=["']?canonical["']?[^>]*>/i.exec(html)?.[0];

  if (path === '/404.html') {
    if (!noindex) fail('seo', '/404.html is not marked noindex');
    if (canonical) fail('seo', '/404.html names a canonical URL; it has no address of its own');
    if (!title) fail('seo', '/404.html has no <title>');
    continue;
  }
  if (noindex) continue;

  indexable.push(path);
  if (!title) fail('seo', `${path} has no <title>`);
  if (!description) fail('seo', `${path} has no meta description`);
  for (const [kind, value] of [['title', title], ['description', description]]) {
    if (!value) continue;
    if (seen[kind].has(value)) fail('seo', `${path} shares its ${kind} with ${seen[kind].get(value)}: "${value}"`);
    else seen[kind].set(value, path);
  }
  if (title && chars(title) > TITLE_GUIDE) warnings.push(`${path} title is ${chars(title)} characters; Google shows about ${TITLE_GUIDE}`);
  if (description && chars(description) > DESCRIPTION_GUIDE) warnings.push(`${path} description is ${chars(description)} characters; Google shows about ${DESCRIPTION_GUIDE}`);

  const expected = new URL(path, SITE_URL).href;
  const href = canonical ? attr(canonical, 'href') : null;
  if (href !== expected) fail('seo', `${path} canonical is ${href ?? 'missing'}, not ${expected}`);

  const og = (key) => meta(html, 'property', key);
  for (const key of ['og:title', 'og:description', 'og:image', 'og:url', 'og:locale', 'og:type']) if (!og(key)) fail('seo', `${path} has no ${key}`);
  if (og('og:url') && og('og:url') !== expected) fail('seo', `${path} og:url is ${og('og:url')}, not its canonical ${expected}`);
  if (og('og:locale') && og('og:locale') !== 'mn_MN') fail('seo', `${path} og:locale is ${og('og:locale')}, not mn_MN`);
  const image = og('og:image');
  if (image) {
    if (!/^https:\/\//.test(image)) fail('seo', `${path} og:image is not an absolute https URL: ${image}`);
    else if (!existsSync(join(dist, new URL(image).pathname))) fail('seo', `${path} og:image ${new URL(image).pathname} is not in dist/`);
  }
  for (const key of ['twitter:card', 'twitter:title', 'twitter:description', 'twitter:image']) if (!meta(html, 'name', key)) fail('seo', `${path} has no ${key}`);

  if (path === '/') {
    const typed = (type) => records.find((record) => record['@type'] === type);
    const organization = typed('Organization');
    const business = typed('ProfessionalService');
    const website = typed('WebSite');
    if (!organization) fail('seo', '/ has no Organization JSON-LD');
    else for (const key of ['name', 'url', 'logo']) if (!organization[key]) fail('seo', `/ Organization JSON-LD has no ${key}`);
    if (organization?.logo && !existsSync(join(dist, new URL(organization.logo).pathname))) fail('seo', `/ Organization logo ${organization.logo} is not in dist/`);
    if (!business) fail('seo', '/ has no ProfessionalService (LocalBusiness) JSON-LD');
    else for (const key of ['name', 'url', 'address']) if (!business[key]) fail('seo', `/ ProfessionalService JSON-LD has no ${key}`);
    if (!website) fail('seo', '/ has no WebSite JSON-LD');
    else if (website.inLanguage !== 'mn') fail('seo', '/ WebSite JSON-LD has no inLanguage "mn"');
  } else if (records.length) fail('seo', `${path} repeats the studio's JSON-LD; it belongs on the home page only`);
}

// sitemap.xml: exactly the indexable pages; robots.txt points at it.
const sitemapFile = join(dist, 'sitemap.xml');
if (!existsSync(sitemapFile)) fail('seo', 'dist/sitemap.xml is missing');
else {
  const listed = [...readFileSync(sitemapFile, 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]).sort();
  const wanted = indexable.map((path) => new URL(path, SITE_URL).href).sort();
  for (const url of wanted) if (!listed.includes(url)) fail('seo', `sitemap.xml leaves out ${url}`);
  for (const url of listed) if (!wanted.includes(url)) fail('seo', `sitemap.xml lists ${url}, which is not an indexable page`);
}
const robotsFile = join(dist, 'robots.txt');
if (!existsSync(robotsFile)) fail('seo', 'dist/robots.txt is missing');
else if (!readFileSync(robotsFile, 'utf8').includes(`Sitemap: ${new URL('/sitemap.xml', SITE_URL).href}`)) fail('seo', 'robots.txt does not point at the sitemap');

console.log('\n  SEO - what search engines and link previews read, on every built page\n');
console.log(`  ${pages.length} page(s) read; ${indexable.length} indexable: ${indexable.join(', ')}`);
for (const warning of warnings) console.log(`  NOTE  ${warning}`);
if (failures.length) {
  console.log('');
  for (const failure of failures) console.error(`  FAIL  ${failure}`);
  console.error('');
  process.exit(1);
}
console.log('\n  PASS\n');
