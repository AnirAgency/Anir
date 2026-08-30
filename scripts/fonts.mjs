/**
 * Font pipeline — downloads the upstream OFL sources, pins variable axes to the
 * weights CLAUDE.md asks for, subsets each face to latin + cyrillic +
 * cyrillic-ext (+ the tugrik sign), and writes woff2 into public/fonts/.
 *
 * Requires the Python venv in tools/.venv (see README). Re-runnable:
 *   npm run fonts
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = join(root, 'tools', 'fonts-src');
const outDir = join(root, 'public', 'fonts');
const config = JSON.parse(readFileSync(join(root, 'tools', 'fonts.config.json'), 'utf8'));

const UPSTREAM = 'https://raw.githubusercontent.com/google/fonts/main/';
// Ө Ү ө ү — the four characters a cyrillic-only subset would tofu on.
const REQUIRED = ['04E8', '04AE', '04E9', '04AF'];

const python = process.platform === 'win32'
  ? join(root, 'tools', '.venv', 'Scripts', 'python.exe')
  : join(root, 'tools', '.venv', 'bin', 'python');

if (!existsSync(python)) {
  console.error(`No Python venv at ${python}. See README > Fonts.`);
  process.exit(1);
}

const unicodes = Object.entries(config.unicodes)
  .filter(([key]) => !key.startsWith('_'))
  .map(([, value]) => value)
  .join(',');

mkdirSync(srcDir, { recursive: true });
mkdirSync(outDir, { recursive: true });

const py = (args) => execFileSync(python, args, { cwd: root, stdio: ['ignore', 'pipe', 'inherit'] }).toString();

async function download(relPath) {
  const local = join(srcDir, relPath.split('/').pop());
  if (existsSync(local)) return local;
  const url = UPSTREAM + relPath.split('/').map(encodeURIComponent).join('/');
  process.stdout.write(`  fetching ${relPath}\n`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  writeFileSync(local, Buffer.from(await res.arrayBuffer()));
  return local;
}

/** Reports which of Ө Ү ө ү the built file's cmap actually contains. */
function missingGlyphs(file) {
  const out = py(['-c', `
import sys
from fontTools.ttLib import TTFont
font = TTFont(sys.argv[1])
have = set()
for table in font['cmap'].tables:
    have.update(table.cmap.keys())
print(','.join(cp for cp in sys.argv[2:] if int(cp, 16) not in have))
`, file, ...REQUIRED]).trim();
  return out ? out.split(',') : [];
}

const rows = [];
let failed = false;

for (const face of config.faces) {
  console.log(`${face.out}:`);
  const source = await download(face.src);
  let input = source;

  if (face.instance) {
    const pinned = join(srcDir, `${face.out}.instance.ttf`);
    const axes = Object.entries(face.instance).map(([axis, value]) => `${axis}=${value}`);
    py(['-m', 'fontTools.varLib.instancer', source, ...axes, '-o', pinned, '--update-name-table']);
    input = pinned;
  }

  const output = join(outDir, `${face.out}.woff2`);
  py(['-m', 'fontTools.subset', input,
    `--unicodes=${unicodes}`,
    '--layout-features=kern,liga,calt,ccmp,locl,mark,mkmk,tnum,onum,frac,case',
    '--flavor=woff2',
    '--desubroutinize',
    '--no-hinting',
    '--drop-tables+=DSIG',
    '--name-IDs=*',
    `--output-file=${output}`]);

  const missing = missingGlyphs(output);
  if (missing.length) failed = true;
  rows.push({
    file: `public/fonts/${face.out}.woff2`,
    bytes: statSync(output).size,
    cyrillicExt: missing.length ? `MISSING ${missing.join(' ')}` : 'Ө Ү ө ү present',
  });
}

console.log('');
const pad = Math.max(...rows.map((r) => r.file.length));
let total = 0;
for (const row of rows) {
  total += row.bytes;
  console.log(`${row.file.padEnd(pad)}  ${String(row.bytes).padStart(7)} B  ${row.cyrillicExt}`);
}
console.log(`${'total'.padEnd(pad)}  ${String(total).padStart(7)} B`);

if (failed) {
  console.error('\nA subset is missing required Cyrillic characters. Fix before shipping.');
  process.exit(1);
}
