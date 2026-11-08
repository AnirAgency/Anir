/**
 * Makes the film grain tile, src/assets/grain.webp.
 *
 * Matched, by the owner's direction, to visioned.ch's grain — their
 * grain-slow.gif, read frame by frame: every pixel solid black or solid
 * white, half and half, single pixels, laid over the whole page at 5%, in
 * three frames of fresh noise shown for 0.15 s each. On a dark ground the
 * white half lifts it by about 12 levels and the black half does nothing; on
 * a light one the black half darkens it by as much; in the mid-tones and
 * pictures both show. Dense and even, it reads as a texture, not specks.
 *
 * So the tile is the same — half white, half black — but for one thing: its
 * black half is at 30% of full strength (BLACK). At visioned's full black,
 * grey text darkened by one patch of grains beside ground lightened by
 * another fails the contrast table (--dim on --ink 4.36, --orange on --paper
 * 2.82); at 30% everything passes, with orange on paper at 3.02. On the dark
 * grounds, most of the site, black grains change nothing either way, so
 * there it is visioned's grain exactly; on light grounds and pictures it
 * darkens at a third of theirs. The page lays the tile over itself at 5%
 * (tokens.css > --grain-opacity) and shows it at three offsets in turn
 * (base.css), which reads as three fresh frames. Grains are
 * drawn by thresholding Gaussian noise that has had a share of its
 * neighbours' average taken away (ANTI), so neighbours tend to differ, as
 * they do in the references the owner first sent. The neighbours wrap at the
 * edges, so the tile is seamless; the noise is seeded, so the tile is the
 * same on every run.
 *
 * The tile has to stay under 4 kB, so the build inlines it into the CSS and
 * the grain arrives with the page (scripts/budget.mjs fails the build
 * otherwise). One bit a pixel compresses to about that, so the tile is as
 * large as fits: the larger it is, the less a repeat can show.
 *
 * Run it after changing a setting here, then `npm run contrast`, which
 * measures whatever tile ships.
 *
 *   node scripts/grain.mjs
 */
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Tile size in pixels; it is drawn at the same size in CSS pixels. */
const SIZE = Number(process.env.GRAIN_SIZE ?? 168);
/** Share of the neighbours' average taken from each pixel before the threshold. */
const ANTI = Number(process.env.GRAIN_ANTI ?? 1.5);
/** Share of pixels white; the rest are black. visioned's frames are half and half. */
const LIT = 0.5;
/** How strong the black half is beside the white, 0 to 1: visioned's is 1; 0.35 is the most the contrast table takes. */
const BLACK = Number(process.env.GRAIN_BLACK ?? 0.3);
const SEED = 0x416e6972; // "Anir"

// A small seeded generator (mulberry32) and Box–Muller for the Gaussian.
let state = SEED;
const random = () => {
  state = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(state ^ (state >>> 15), 1 | state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const gaussian = () => Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random());

const noise = Float64Array.from({ length: SIZE * SIZE }, gaussian);
const at = (field, x, y) => field[((y + SIZE) % SIZE) * SIZE + ((x + SIZE) % SIZE)];

const sharpened = new Float64Array(SIZE * SIZE);
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    let ring = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) ring += at(noise, x + dx, y + dy);
    sharpened[y * SIZE + x] = at(noise, x, y) - (ANTI * ring) / 8;
  }
}

// Light exactly LIT of the pixels: those above the matching quantile.
const threshold = [...sharpened].sort((a, b) => a - b)[Math.floor((1 - LIT) * sharpened.length)];
const lit = sharpened.map((v) => (v >= threshold ? 1 : 0));

// Solid white where lit; black elsewhere, at BLACK of full strength.
const pixels = Buffer.alloc(SIZE * SIZE * 2);
for (let i = 0; i < lit.length; i++) {
  pixels[i * 2] = lit[i] ? 255 : 0;
  pixels[i * 2 + 1] = lit[i] ? 255 : Math.round(BLACK * 255);
}

// How alike neighbours are, to compare with the references' −0.16.
let num = 0;
let den = 0;
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const a = at(lit, x, y) - LIT;
    num += a * (at(lit, x + 1, y) - LIT);
    den += a * a;
  }
}

const out = join(root, 'src', 'assets', 'grain.webp');
const info = await sharp(pixels, { raw: { width: SIZE, height: SIZE, channels: 2 } })
  .webp({ lossless: true, effort: 6 })
  .toFile(out);
console.log(
  `  grain: ${SIZE} × ${SIZE}, ${Math.round(LIT * 100)}% white, the rest black at ${BLACK}, neighbour correlation ${(num / den).toFixed(2)} → ${out} (${info.size} bytes)`
);
if (info.size >= 4096) {
  console.error('  over 4 kB: it would not be inlined. Use a smaller tile.');
  process.exitCode = 1;
}
