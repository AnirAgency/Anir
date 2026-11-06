/**
 * Contrast check for the CLAUDE.md table, with the film grain in place.
 *
 * The grain (base.css > body::after) lies over the whole page, so it moves the
 * text and the ground alike. A single 1px speck does not change how readable a
 * letter is — the eye integrates over the stroke — so the grain is read as a
 * local average over a stroke-sized box, 3 × 3 at body size, at every position
 * of the actual tile (wrapping, since it tiles). Each pair is then measured at
 * its worst: the text under the box that moves it most against the ground
 * under the box that moves it most the other way. The mean box is printed
 * beside it, so the gap between the average and the worst stays visible.
 *
 * Token values, the tile, its opacity and its blend mode are read from what
 * ships — src/styles/tokens.css and src/assets/grain.webp. Each box is the
 * colour laid under each of its pixels through that blend, averaged — exact
 * for any blend, linear or not. Exits non-zero if a pair that must pass does
 * not.
 *
 *   npm run contrast
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(join(root, 'src', 'styles', 'tokens.css'), 'utf8');

/** Stroke width at body size, in tile pixels. */
const BOX = 3;

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

// sharp ships with Astro; it decodes the tile exactly as the browser sees it.
let sharp;
try {
  sharp = createRequire(join(root, 'package.json'))('sharp');
} catch {
  console.error('  sharp is not installed (it comes with astro). Run npm install.');
  process.exit(1);
}

const tilePath = join(root, 'src', 'assets', 'grain.webp');
const opacity = Number(token('grain-opacity'));
const blend = token('grain-blend');
const { data, info } = await sharp(tilePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width, height } = info;

/*
  What one tile pixel — its grey g and alpha a, out of 255 — does to one
  channel c of the colour under it, at the layer's opacity, by the CSS
  compositing spec: the blended colour B(c, g), then mixed over c by
  alpha × opacity.
*/
const BLENDS = {
  normal: (_c, g) => g,
  overlay: (c, g) => (c <= 127.5 ? (2 * c * g) / 255 : 255 - (2 * (255 - c) * (255 - g)) / 255),
  'soft-light': (c, g) => {
    const cb = c / 255;
    const cs = g / 255;
    const d = cb <= 0.25 ? ((16 * cb - 12) * cb + 4) * cb : Math.sqrt(cb);
    const r = cs <= 0.5 ? cb - (1 - 2 * cs) * cb * (1 - cb) : cb + (2 * cs - 1) * (d - cb);
    return r * 255;
  },
};
if (!BLENDS[blend]) throw new Error(`--grain-blend: ${blend} is not modelled here; add it to BLENDS.`);
const mix = (c, g, a) => c + (BLENDS[blend](c, g) - c) * (a / 255) * opacity;

// Every box over the tile, as its pixels — wrapping, since it tiles.
const at = (x, y) => (((y + height) % height) * width + ((x + width) % width)) * 4;
const windows = [];
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const box = [];
    for (let dy = 0; dy < BOX; dy++) for (let dx = 0; dx < BOX; dx++) box.push(at(x + dx, y + dy));
    windows.push(box);
  }
}

/** A colour under one box: each channel laid under each pixel, averaged. */
const under = (colour, box) =>
  colour.map((c) => box.reduce((sum, i) => sum + mix(c, data[i], data[i + 3]), 0) / box.length);

/** A colour under the whole tile, averaged: what the grain does on average. */
const allPixels = Array.from({ length: width * height }, (_, i) => i * 4);
const onAverage = (colour) => under(colour, allPixels);

/** The extremes of a colour's luminance across every box: its darkest and lightest. */
const span = (colour) => {
  let lo = colour;
  let hi = colour;
  for (const box of windows) {
    const c = under(colour, box);
    if (luminance(c) < luminance(lo)) lo = c;
    if (luminance(c) > luminance(hi)) hi = c;
  }
  return [lo, hi];
};
const worst = (text, ground) => {
  const [tLo, tHi] = span(text);
  const [gLo, gHi] = span(ground);
  return Math.min(ratio(tLo, gHi), ratio(tHi, gLo), ratio(tLo, gLo), ratio(tHi, gHi));
};

const colours = {
  '--ink': rgb(token('ink')),
  '--paper': rgb(token('paper')),
  '--dim': rgb(token('dim')),
  '--dim-2': rgb(token('dim-2')),
  '--orange': rgb(token('orange')),
  white: [255, 255, 255],
};

// The Services list at rest: --paper drawn at --rest-opacity over --ink is
// that mix, before the grain lands on top of both.
const rest = Number(token('rest-opacity'));
colours['--paper at rest'] = colours['--paper'].map((c, i) => c * rest + colours['--ink'][i] * (1 - rest));

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
  ['--paper at rest', '--ink', 3, true], // large text only: the Services list
];

const [inkLo, inkHi] = span(colours['--ink']);
const shift = (c) => (c[0] - colours['--ink'][0]).toFixed(1);
console.log(
  `\n  CONTRAST - grain read as ${BOX} × ${BOX} stroke boxes over the ${width}px tile, ${blend} at ${opacity * 100}%` +
    `\n  on --ink: mean ${shift(onAverage(colours['--ink']))} levels, boxes from ${shift(inkLo)} to +${shift(inkHi)}\n`
);
console.log(`  ${'pair'.padEnd(26)} ${'flat'.padStart(6)} ${'mean'.padStart(6)} ${'worst'.padStart(6)}   bar`);

const failures = [];
for (const [text, ground, bar, mustPass] of pairs) {
  const t = colours[text];
  const g = colours[ground];
  const flat = ratio(t, g);
  const mean = ratio(onAverage(t), onAverage(g));
  const low = worst(t, g);
  const verdict = low >= bar ? 'pass' : mustPass ? 'FAIL' : 'fails (documented, unused)';
  console.log(
    `  ${`${text} on ${ground}`.padEnd(26)} ${flat.toFixed(2).padStart(6)} ${mean.toFixed(2).padStart(6)} ${low.toFixed(2).padStart(6)}   ${bar}  ${verdict}`
  );
  if (mustPass && low < bar) failures.push(`${text} on ${ground} is ${low.toFixed(2)}:1 against a ${bar}:1 bar.`);
}

if (failures.length) {
  console.error('');
  for (const failure of failures) console.error(`  FAIL  ${failure} Fix the token or the tile, not the opacity alone.`);
  console.error('');
  process.exit(1);
}
console.log('\n  PASS\n');
