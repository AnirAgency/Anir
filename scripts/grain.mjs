/**
 * Makes the film grain tile, src/assets/grain.webp.
 *
 * Film grain is not specks: every point of the frame is a little lighter or
 * a little darker than it should be, in soft clumps a pixel or two across,
 * the same in every direction. So the tile is grey noise around a neutral
 * mid-grey — Gaussian, then softened by one small blur so neighbouring
 * pixels lean together into clumps — and the page lays it over itself with
 * soft-light (tokens.css > --grain-blend), which leaves mid-grey untouched,
 * lightens and darkens by turns, and shows in the mid-tones and the pictures
 * more than in the deep black, as film does.
 *
 * Overlay was tried and set aside: it puts nearly all the grain into the
 * mid-grey text, which fails the contrast table before the black ground shows
 * any at all.
 *
 * The blur wraps at the edges, so the tile is seamless; the noise is seeded,
 * so the tile is the same on every run. Run it after changing a setting
 * here, then `npm run contrast`, which measures whatever tile ships — the
 * worst box moves with the seed and the size, so measure every tile.
 *
 *   node scripts/grain.mjs
 */
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/*
  The tile has to stay under 4 kB, so the build inlines it into the CSS and
  the grain arrives with the page, never as a request of its own
  (scripts/budget.mjs fails the build otherwise). Noise hardly compresses, so
  that bounds two things: the tile's size, and how many greys it uses. 120px
  at 7 greys is the largest that fits. Few greys is no loss here: laid over
  the page with soft-light at a quarter's strength, a step between two of
  them moves the screen by a few levels in the mid-tones and by less than one
  in the black, and the noise around it hides the step. An odd number keeps
  mid-grey itself, which the blend leaves untouched.
*/
/** Tile size in pixels; it is drawn at the same size in CSS pixels. */
const SIZE = Number(process.env.GRAIN_SIZE ?? 120);
/** How many greys the tile uses, evenly spread from black to white. */
const LEVELS = Number(process.env.GRAIN_LEVELS ?? 7);
/** Spread of the grain around mid-grey, after the blur, out of 1. */
const SPREAD = 0.16;
/** How much a pixel takes from its eight neighbours: the size of the clumps. */
const CLUMP = 0.2;
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

const raw = Float64Array.from({ length: SIZE * SIZE }, gaussian);

// One soft 3 × 3 blur, wrapping, so the clumps tile across the seam.
const at = (x, y) => raw[((y + SIZE) % SIZE) * SIZE + ((x + SIZE) % SIZE)];
const soft = new Float64Array(SIZE * SIZE);
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    let ring = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) ring += at(x + dx, y + dy);
    soft[y * SIZE + x] = at(x, y) + (CLUMP * ring) / 8;
  }
}

// Back to a known spread around exactly mid-grey, so the grain lightens and
// darkens by as much as each other and lifts nothing on average.
const mean = soft.reduce((sum, v) => sum + v, 0) / soft.length;
const sd = Math.sqrt(soft.reduce((sum, v) => sum + (v - mean) ** 2, 0) / soft.length);
const pixels = Buffer.alloc(SIZE * SIZE);
for (let i = 0; i < soft.length; i++) {
  const v = Math.min(1, Math.max(0, 0.5 + ((soft[i] - mean) / sd) * SPREAD));
  pixels[i] = Math.round((Math.round(v * (LEVELS - 1)) / (LEVELS - 1)) * 255);
}

const out = join(root, 'src', 'assets', 'grain.webp');
const info = await sharp(pixels, { raw: { width: SIZE, height: SIZE, channels: 1 } })
  .webp({ lossless: true, effort: 6 })
  .toFile(out);
console.log(
  `  grain: ${SIZE} × ${SIZE}, ${LEVELS} greys, spread ${SPREAD}, clump ${CLUMP} → ${out} (${info.size} bytes)`
);
if (info.size >= 4096) {
  console.error(`  over 4 kB: it would not be inlined. Use fewer greys or a smaller tile.`);
  process.exitCode = 1;
}
