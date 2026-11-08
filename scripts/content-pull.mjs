/**
 * Pulls what the team edits in the admin out of Supabase, before every build
 * and dev server:
 *
 *  - the content, into src/content/live.json, which site.ts lays over its
 *    seed (src/content/live.ts) — every component, the Worker and the tests
 *    read the result;
 *  - the images they uploaded, into public/media/live/, each cut to its
 *    slot's width and height and encoded as AVIF, WebP and JPEG, so the site
 *    ships them itself at the size it shows them (CLAUDE.md > Budget) and the
 *    budget measures them like any other.
 *
 * It reads with the publishable key, which RLS lets read and nothing else.
 *
 * Nothing to pull — the tables not made yet, or nothing saved — writes `{}`
 * and the site is site.ts as written. A network or database failure stops a
 * Workers Build, so a site is never published without the content it was
 * published for; locally it writes `{}` and says so. CONTENT_OFFLINE=1 skips
 * the pull outright, and so does --offline. --ensure only writes `{}` where
 * there is no live.json yet — npm install and the tests run it so, to leave
 * one for the editor and for node without touching a pulled one.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import config from '../src/lib/supabase.json' with { type: 'json' };

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'src', 'content', 'live.json');
const mediaDir = join(root, 'public', 'media', 'live');
const onCI = process.env.WORKERS_CI === '1';

/** live.json, and with nothing pulled, no images left from an earlier pull to ship unused. */
const write = (live) => {
  writeFileSync(out, `${JSON.stringify(live, null, 2)}\n`);
  if (!live.sections && existsSync(mediaDir)) rmSync(mediaDir, { recursive: true });
};

/** A table the migration has not made yet answers PGRST205: nothing to pull. */
class NotSetUp extends Error {}

async function get(path) {
  const response = await fetch(`${config.url}${path}`, { headers: { apikey: config.publishableKey } });
  const body = await response.text();
  if (response.status === 404 && body.includes('PGRST205')) throw new NotSetUp(path);
  if (!response.ok) throw new Error(`${path} answered ${response.status}: ${body.slice(0, 200)}`);
  return JSON.parse(body);
}

/** Uploads are named by the admin — a UUID and an image extension, nothing else. */
const UPLOAD = /^[a-z0-9-]{8,64}\.(jpe?g|png|webp|avif)$/i;

/** Every object in the content carrying an `upload`, with where it is. */
function uploads(node, path, found = []) {
  if (Array.isArray(node)) node.forEach((item, i) => uploads(item, `${path}[${i}]`, found));
  else if (node && typeof node === 'object') {
    if (typeof node.upload === 'string' && node.upload) found.push({ node, path });
    for (const [key, value] of Object.entries(node)) if (key !== 'upload') uploads(value, `${path}.${key}`, found);
  }
  return found;
}

/**
 * One upload, cut to its slot and encoded three ways, named for what it is
 * and the size it is cut to — so a local re-run skips what it already has.
 * The object then points at it: a Media slot by `name`, which Plate and
 * resolveImage read; a plain image (a showreel tile, a backdrop) by `src`.
 */
async function encode({ node, path }) {
  const { upload, width, height } = node;
  if (!UPLOAD.test(upload)) throw new Error(`${path}: upload "${upload}" is not an admin upload name.`);
  if (!Number.isInteger(width) || !Number.isInteger(height)) throw new Error(`${path}: an upload needs its width and height.`);

  const hash = createHash('sha1').update(`${upload}|${width}|${height}`).digest('hex').slice(0, 16);
  const base = join(mediaDir, hash);
  const formats = ['avif', 'webp', 'jpg'];

  if (!formats.every((format) => existsSync(`${base}.${format}`))) {
    const response = await fetch(`${config.url}/storage/v1/object/public/media/${encodeURIComponent(upload)}`);
    if (!response.ok) throw new Error(`${path}: media/${upload} answered ${response.status}.`);
    const image = sharp(Buffer.from(await response.arrayBuffer())).rotate().resize(width, height, { fit: 'cover' });
    await Promise.all([
      image.clone().avif({ quality: 52, effort: 4 }).toFile(`${base}.avif`),
      image.clone().webp({ quality: 76 }).toFile(`${base}.webp`),
      image.clone().jpeg({ quality: 78, mozjpeg: true }).toFile(`${base}.jpg`),
    ]);
  }

  if ('name' in node) node.name = `live/${hash}`;
  else node.src = `/media/live/${hash}.avif`;
  return hash;
}

async function pull() {
  const [sections, products] = await Promise.all([
    get('/rest/v1/site_content?select=key,data'),
    get('/rest/v1/products?select=id,position,data&order=position.asc'),
  ]);
  const live = {
    sections: Object.fromEntries(sections.map((row) => [row.key, row.data])),
    products,
  };

  mkdirSync(mediaDir, { recursive: true });
  const jobs = [...uploads(live.sections, 'sections'), ...uploads(live.products, 'products')];
  const used = new Set();
  // A few at a time: each is a download and three encodes.
  for (let i = 0; i < jobs.length; i += 4) {
    for (const hash of await Promise.all(jobs.slice(i, i + 4).map(encode))) used.add(hash);
  }
  for (const file of readdirSync(mediaDir)) {
    if (!used.has(file.split('.')[0])) rmSync(join(mediaDir, file));
  }

  write(live);
  console.log(
    `  content: ${sections.length} section(s), ${products.length} product(s), ${used.size} image(s) from Supabase`
  );
}

if (process.argv.includes('--ensure')) {
  if (!existsSync(out)) write({});
} else if (process.argv.includes('--offline') || process.env.CONTENT_OFFLINE === '1' || !config.url || !config.publishableKey) {
  write({});
  console.log('  content: not pulled — the site is src/content/site.ts as written');
} else {
  try {
    await pull();
  } catch (error) {
    if (error instanceof NotSetUp) {
      write({});
      console.log('  content: the admin tables are not set up yet — the site is src/content/site.ts as written');
    } else if (onCI) {
      console.error(`  content: could not pull from Supabase — ${error.message}`);
      process.exit(1);
    } else {
      write({});
      console.log(`  content: could not pull (${error.message}) — building from src/content/site.ts as written`);
    }
  }
}
