/**
 * Contrast check for the CLAUDE.md table, with the film grain in place.
 *
 * The grain (base.css > body::after) is grey noise at a few percent opacity
 * over the whole page, so it moves the text and the ground alike. Each pair is
 * measured at its worst: a text pixel and a ground pixel under opposite
 * extremes of grain, black and white, whichever pairing compresses the
 * contrast most. Levels 0 and 255 bound any tile, so swapping the grain asset
 * cannot invalidate the result. It is checked at the declared opacity and at
 * 5%, the top of the range the designer may pick from.
 *
 * Token values and the opacity are read from src/styles/tokens.css, so this
 * measures what ships. Exits non-zero if a pair that must pass does not.
 *
 *   npm run contrast
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(join(root, 'src', 'styles', 'tokens.css'), 'utf8');

const token = (name) => {
  const match = new RegExp(`--${name}:\\s*([^;]+);`).exec(css);
  if (!match) throw new Error(`--${name} not found in tokens.css`);
  return match[1].trim();
};

const rgb = (hex) => {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
};

const channel = (c) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const luminance = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
const ratio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/** A colour under one grain pixel of grey level g, composited in sRGB. */
const grained = (colour, g, opacity) => colour.map((c) => c * (1 - opacity) + g * opacity);
const EXTREMES = [0, 255];
const worst = (text, ground, opacity) =>
  Math.min(
    ...EXTREMES.flatMap((a) => EXTREMES.map((b) => ratio(grained(text, a, opacity), grained(ground, b, opacity))))
  );

const colours = {
  '--ink': rgb(token('ink')),
  '--paper': rgb(token('paper')),
  '--dim': rgb(token('dim')),
  '--dim-2': rgb(token('dim-2')),
  '--orange': rgb(token('orange')),
  white: [255, 255, 255],
};
const opacity = Number(token('grain-opacity'));
const RANGE_TOP = 0.05;

/*
  [text, ground, bar, must pass]. The failing pairs are listed because the
  table documents them; nothing on the page uses them.
*/
const pairs = [
  ['--dim', '--ink', 4.5, true],
  ['--dim', '--paper', 4.5, false],
  ['--dim-2', '--paper', 4.5, true],
  ['--dim-2', '--ink', 4.5, false],
  ['--orange', '--ink', 4.5, true],
  ['--orange', '--paper', 3, true], // large text only (CLAUDE.md rule 2)
  ['--ink', '--orange', 4.5, true],
  ['white', '--orange', 4.5, false],
  ['--paper', '--ink', 4.5, true],
  ['--ink', '--paper', 4.5, true],
];

console.log(`\n  CONTRAST - worst grain pixels at ${opacity * 100}% (declared) and ${RANGE_TOP * 100}% (range top)\n`);
console.log(`  ${'pair'.padEnd(22)} ${'flat'.padStart(6)} ${'grain'.padStart(6)} ${'at 5%'.padStart(6)}   bar`);

const failures = [];
for (const [text, ground, bar, mustPass] of pairs) {
  const t = colours[text];
  const g = colours[ground];
  const flat = ratio(t, g);
  const now = worst(t, g, opacity);
  const top = worst(t, g, Math.max(opacity, RANGE_TOP));
  const low = Math.min(now, top);
  const verdict = low >= bar ? 'pass' : mustPass ? 'FAIL' : 'fails (documented, unused)';
  console.log(
    `  ${`${text} on ${ground}`.padEnd(22)} ${flat.toFixed(2).padStart(6)} ${now.toFixed(2).padStart(6)} ${top.toFixed(2).padStart(6)}   ${bar}  ${verdict}`
  );
  if (mustPass && low < bar) failures.push(`${text} on ${ground} is ${low.toFixed(2)}:1 against a ${bar}:1 bar.`);
}

if (failures.length) {
  console.error('');
  for (const failure of failures) console.error(`  FAIL  ${failure} Fix the token, not the grain opacity.`);
  console.error('');
  process.exit(1);
}
console.log('\n  PASS\n');
