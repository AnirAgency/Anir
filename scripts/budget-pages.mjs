/**
 * The weight budget for every page but the home page, which `npm run budget`
 * measures in full first. Each page is held to the same ceilings — they are
 * per page, because a visitor pays for one page at a time — and any page
 * over them fails the run, exactly as the home page does.
 *
 * Usage: node scripts/budget-pages.mjs (after a build)
 */
import { spawnSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { dirname, join, posix, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');

function pages(dir) {
  const found = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) found.push(...pages(full));
    else if ((entry === 'index.html' && dir !== dist) || (entry === '404.html' && dir === dist)) found.push(relative(dist, full).split(sep).join(posix.sep));
  }
  return found;
}

const failed = [];
console.log('\n  OTHER PAGES - each against the same ceilings as the home page\n');
for (const page of pages(dist).sort()) {
  const run = spawnSync(process.execPath, [join(root, 'scripts', 'budget.mjs'), page], { encoding: 'utf8' });
  const total = /total\s+([\d.]+ kB)/.exec(run.stdout)?.[1] ?? '?';
  const js = /js\s+([\d.]+ kB) of/.exec(run.stdout)?.[1] ?? '?';
  const ok = run.status === 0;
  console.log(`  ${page.padEnd(32)} total ${total.padStart(9)}   js ${js.padStart(8)}   ${ok ? 'PASS' : 'FAIL'}`);
  if (!ok) {
    failed.push(page);
    process.stderr.write(run.stderr);
  }
}

if (failed.length) {
  console.error(`\n  FAIL  ${failed.length} page(s) over budget: ${failed.join(', ')}\n`);
  process.exit(1);
}
console.log('\n  PASS\n');
