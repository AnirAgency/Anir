/**
 * Fails a production build whose output names a placeholder.
 *
 * "Production never ships placeholders" is a rule the build enforces, not an
 * assumption: this reads every text file in dist/ — pages, scripts, styles,
 * data — for a path to a file under media/placeholder/, and fails if one is
 * there, or if the folder itself is. scripts/budget.mjs checks each page's
 * HTML for the same; this covers everything else a browser could fetch one
 * from. A path is a file's: a bare "/media/placeholder/" in the admin's code,
 * which only tests what a value starts with, names nothing to fetch.
 *
 * In a placeholder build — dev, a Workers Builds preview, PLACEHOLDER_MEDIA=1
 * (src/lib/placeholders.mjs) — placeholders are the point, so it says so and
 * passes.
 *
 *   node scripts/no-placeholders.mjs      after a build
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { placeholderMode, placeholderReason } from '../src/lib/placeholders.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const TEXT = new Set(['.html', '.js', '.mjs', '.css', '.json', '.xml', '.txt', '.webmanifest', '.svg', '.map']);
/** A path to a placeholder file: the folder, a name, and an extension a browser would fetch. */
const PLACEHOLDER = /media\/placeholder\/[\w.-]+\.(?:avif|webp|jpe?g|png|gif|svg|mp4|webm|mov)\b/gi;

console.log('\n  NO PLACEHOLDERS - every text file in dist/\n');
if (placeholderMode()) {
  console.log(`  skipped — a placeholder build (${placeholderReason()}): placeholders are its point\n`);
  process.exit(0);
}

const files = [];
const walk = (at) => {
  for (const entry of readdirSync(at, { withFileTypes: true })) {
    const full = join(at, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (TEXT.has(extname(entry.name).toLowerCase())) files.push(full);
  }
};
if (!existsSync(dist)) {
  console.error('  FAIL  no dist/ — run the build first.\n');
  process.exit(1);
}
walk(dist);

const problems = [];
if (existsSync(join(dist, 'media', 'placeholder'))) problems.push('dist/media/placeholder/ exists in a production build.');
for (const file of files) {
  const found = [...new Set(readFileSync(file, 'utf8').match(PLACEHOLDER) ?? [])];
  if (found.length) problems.push(`${relative(root, file).split(sep).join('/')} names ${found.slice(0, 3).join(', ')}${found.length > 3 ? ` and ${found.length - 3} more` : ''}.`);
}

console.log(`  ${files.length} text files read`);
for (const problem of problems) console.error(`  FAIL  ${problem}`);
console.log(problems.length ? '' : '\n  PASS\n');
process.exit(problems.length ? 1 : 0);
