/**
 * Media pipeline. Turns camera originals in raw-media/ into the web-ready
 * files public/media/ ships.
 *
 *   npm run media              encode everything the config lists
 *   npm run media -- --dry-run print the exact ffmpeg commands, run nothing
 *   npm run media -- hero      just one clip or still, by name
 *   npm run media -- --check   hold every committed video to the budget, encode nothing
 *
 * Every clip comes out twice — AV1 for browsers that take it, VP9 for the rest —
 * plus a poster frame. Stills come out as AVIF, WebP and JPG. Audio is stripped
 * outright and all metadata is dropped, so no camera EXIF reaches the web.
 *
 * And every run ends by holding every video and poster in public/media/ to
 * its cap — not only what it just encoded, but anything copied in by hand,
 * placeholders included — and fails, the way `npm run budget` fails, if one
 * is over (videoBudget, below). Video is committed: an oversized export stays in git for good and
 * is downloaded by every visitor, so the check runs before it can be
 * committed, and again on every build (`npm run budget` runs --check).
 *
 * The command builders below are pure functions, exported so scripts/test-media.mjs
 * can check them without ffmpeg installed.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PLACEHOLDER_MAX, POSTER_MAX, VIDEO_MAX } from './limits.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rawDir = join(root, 'raw-media');
const outDir = join(root, 'public', 'media');
const configPath = join(root, 'scripts', 'media.config.json');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const checkOnly = args.includes('--check');
const only = args.filter((a) => !a.startsWith('--'));

const kb = (bytes) => `${(bytes / 1000).toFixed(1)} kB`;

/* ------------------------------------------------------------ video budget */

const VIDEO_EXT = new Set(['.webm', '.mp4', '.mov', '.m4v']);
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif']);

/**
 * Every video and poster under `dir`, each with the cap it is held to:
 *
 *   a clip this pipeline encodes (its name in media.config.json)
 *       → the config's failOverKB — clips loop, so they are small
 *   any other video, such as the showreel's MP4, which is exported by hand
 *       → VIDEO_MAX, 1.2 MB, as `npm run budget` holds it on a page
 *   a clip's poster frame, or any image named as a poster
 *       → POSTER_MAX, 40 kB
 *   a placeholder video or poster (public/media/placeholder/)
 *       → PLACEHOLDER_MAX, 3 MB — looser, never exempt: every preview build
 *         serves them, and a public preview has
 *
 * Exported so scripts/test-media.mjs can check it without ffmpeg.
 */
export function videoBudget(config, dir = outDir) {
  const clips = new Set(config.clips.map((clip) => clip.name));
  const files = [];
  const walk = (at) => {
    if (!existsSync(at)) return;
    for (const entry of readdirSync(at, { withFileTypes: true })) {
      const full = join(at, entry.name);
      if (entry.isDirectory()) walk(full);
      else files.push(full);
    }
  };
  walk(dir);

  const rows = [];
  for (const file of files) {
    const ext = extname(file).toLowerCase();
    const name = file.slice(dir.length + 1).split(sep).join('/');
    const base = name.split('/').pop().split('.')[0];
    let cap = null;
    let kind = '';
    if (name.startsWith('placeholder/')) {
      if (VIDEO_EXT.has(ext) || (IMAGE_EXT.has(ext) && /poster/i.test(name))) {
        cap = PLACEHOLDER_MAX;
        kind = 'stand-in';
      }
    } else if (VIDEO_EXT.has(ext)) {
      const encodedHere = clips.has(base) && ext === '.webm';
      cap = encodedHere ? config.video.failOverKB * 1000 : VIDEO_MAX;
      kind = encodedHere ? 'clip' : 'video';
    } else if (IMAGE_EXT.has(ext) && ((clips.has(base) && ext === '.jpg') || /poster/i.test(name))) {
      cap = Math.min(POSTER_MAX, config.video.posterMaxKB * 1000);
      kind = 'poster';
    }
    if (cap !== null) rows.push({ name, kind, bytes: statSync(file).size, cap });
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

/** Prints the budget, as `npm run budget` prints its own. Answers how many are over. */
function reportVideoBudget(config) {
  const rows = videoBudget(config);
  const over = rows.filter((row) => row.bytes > row.cap);
  console.log(`\n  VIDEO BUDGET - every committed video and poster in ${relative(root, outDir).split(sep).join('/')}/\n`);
  if (!rows.length) console.log('  none yet');
  const width = Math.max(12, ...rows.map((row) => row.name.length));
  for (const row of rows) {
    console.log(`  ${row.name.padEnd(width)}  ${row.kind.padEnd(8)}  ${kb(row.bytes).padStart(10)} of ${kb(row.cap).padStart(10)}  ${row.bytes > row.cap ? 'OVER' : 'ok'}`);
  }
  for (const row of over) {
    const cap = row.kind === 'poster' ? 'poster' : row.kind === 'stand-in' ? 'placeholder' : 'video';
    console.error(`  FAIL  ${row.name} is ${kb(row.bytes - row.cap).trim()} over the ${kb(row.cap).trim()} ${cap} cap.`);
  }
  console.log(over.length ? '' : '\n  PASS\n');
  if (over.length) console.error('  Re-export shorter or at a lower bitrate before committing: a committed video stays in git for good.\n');
  return over.length;
}

/* ------------------------------------------------------------------ ffmpeg */

export function hasFfmpeg() {
  const probe = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' });
  return !probe.error && probe.status === 0;
}

/** Which AV1 encoder this ffmpeg build actually has. SVT is much faster. */
export function pickAv1Encoder(encoderList) {
  if (/\blibsvtav1\b/.test(encoderList)) return 'libsvtav1';
  if (/\blibaom-av1\b/.test(encoderList)) return 'libaom-av1';
  return null;
}

function encoders() {
  try {
    return execFileSync('ffmpeg', ['-hide_banner', '-encoders'], { encoding: 'utf8' });
  } catch {
    return '';
  }
}

function duration(file) {
  const out = execFileSync(
    'ffprobe',
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file],
    { encoding: 'utf8' }
  );
  return Number(out.trim());
}

/* -------------------------------------------------------- command builders */

/**
 * Scale to fit inside maxHeight without ever enlarging, keep even dimensions
 * (both codecs require it), and resample to a constant frame rate.
 */
export const videoFilter = (maxHeight, fps) =>
  `scale=-2:'min(${maxHeight},ih)':flags=lanczos,fps=${fps}`;

/** Bitrate that lands a clip of this length on the target size. */
export const bitrateKbps = (targetKB, seconds) =>
  Math.max(80, Math.round((targetKB * 8) / Math.max(seconds, 0.1)));

export function vp9Commands({ source, output, clip, video, rate, passlog }) {
  const common = [
    '-y',
    '-ss', String(clip.in),
    '-to', String(clip.out),
    '-i', source,
    '-an',                      // strip audio outright
    '-map_metadata', '-1',      // and every scrap of metadata
    '-vf', videoFilter(video.maxHeight, video.fps),
    '-c:v', 'libvpx-vp9',
    '-b:v', `${rate}k`,
    '-row-mt', '1',
    '-passlogfile', passlog,
  ];
  return [
    ['ffmpeg', [...common, '-pass', '1', '-cpu-used', '4', '-f', 'null', '-']],
    ['ffmpeg', [...common, '-pass', '2', '-cpu-used', '2', output]],
  ];
}

export function av1Command({ source, output, clip, video, rate, encoder }) {
  const args = [
    '-y',
    '-ss', String(clip.in),
    '-to', String(clip.out),
    '-i', source,
    '-an',
    '-map_metadata', '-1',
    '-vf', videoFilter(video.maxHeight, video.fps),
    '-c:v', encoder,
  ];
  if (encoder === 'libsvtav1') {
    args.push('-preset', '6', '-b:v', `${rate}k`);
  } else {
    args.push('-cpu-used', '4', '-b:v', `${rate}k`);
  }
  args.push('-f', 'webm', output);
  return ['ffmpeg', args];
}

export function posterCommand({ source, output, clip, video, quality }) {
  return [
    'ffmpeg',
    [
      '-y',
      '-ss', String(clip.in),
      '-i', source,
      '-frames:v', '1',
      '-map_metadata', '-1',
      '-vf', `scale=-2:'min(${video.maxHeight},ih)':flags=lanczos`,
      '-q:v', String(quality),
      output,
    ],
  ];
}

/** Cover-crop to exact dimensions, so every portrait is the same shape. */
export const stillFilter = (width, height) =>
  `scale=${width}:${height}:force_original_aspect_ratio=increase:flags=lanczos,crop=${width}:${height}`;

export function stillCommand({ source, output, still, format, av1Encoder }) {
  const args = ['-y', '-i', source, '-map_metadata', '-1', '-vf', stillFilter(still.width, still.height)];
  if (format === 'avif') args.push('-c:v', av1Encoder ?? 'libaom-av1', '-still-picture', '1', '-crf', '32');
  if (format === 'webp') args.push('-c:v', 'libwebp', '-quality', '76');
  if (format === 'jpg') args.push('-q:v', '4');
  args.push(output);
  return ['ffmpeg', args];
}

/* ------------------------------------------------------------------- runner */

const show = (cmd, cmdArgs) =>
  `${cmd} ${cmdArgs.map((a) => (/[\s'"]/.test(a) ? JSON.stringify(a) : a)).join(' ')}`;

function run(cmd, cmdArgs) {
  if (dryRun) {
    console.log(`    ${show(cmd, cmdArgs)}`);
    return;
  }
  execFileSync(cmd, cmdArgs, { stdio: ['ignore', 'ignore', 'pipe'] });
}

/* --------------------------------------------------------------------- main */

/** Only runs when this file is executed directly. Importing it — which
 *  scripts/test-media.mjs does to check the command builders — must not
 *  kick off an encode. */
const isDirectRun =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  const { video } = config;

  // The budget alone: no sources and no ffmpeg needed, so a build can run it.
  if (checkOnly) process.exit(reportVideoBudget(config) ? 1 : 0);

  if (!existsSync(rawDir)) {
    console.error(`No raw-media/ directory. Create it and add sources — see raw-media/README.md.`);
    process.exit(1);
  }

  if (!dryRun && !hasFfmpeg()) {
    for (const line of [
      '',
      '  ffmpeg is not on PATH, so nothing can be encoded.',
      '',
      '    Windows   winget install Gyan.FFmpeg',
      '    macOS     brew install ffmpeg',
      '    Linux     apt install ffmpeg',
      '',
      '  Run "npm run media -- --dry-run" to see the exact commands without it.',
      '',
    ]) {
      console.error(line);
    }
    process.exit(1);
  }

  const encoderList = dryRun ? '' : encoders();
  const av1Encoder = dryRun ? 'libsvtav1' : pickAv1Encoder(encoderList);

  mkdirSync(outDir, { recursive: true });

  const rows = [];
  const missing = [];
  let over = 0;

  const wanted = (name) => only.length === 0 || only.includes(name);

  /* clips ------------------------------------------------------------------- */

  for (const clip of config.clips) {
    if (!wanted(clip.name)) continue;
    const source = join(rawDir, clip.source);
    if (!existsSync(source)) {
      missing.push(`${clip.source} → ${clip.name}.{av1,vp9}.webm`);
      continue;
    }

    console.log(`${clip.name}:`);
    const inputBytes = statSync(source).size;
    const seconds = dryRun ? Number(clip.out) - Number(clip.in) : duration(source);
    const rate = bitrateKbps(video.targetKB, Math.min(seconds, Number(clip.out) - Number(clip.in) || seconds));
    const passlog = join(outDir, `.${clip.name}-pass`);

    const vp9Out = join(outDir, `${clip.name}.vp9.webm`);
    for (const [cmd, cmdArgs] of vp9Commands({ source, output: vp9Out, clip, video, rate, passlog })) {
      run(cmd, cmdArgs);
    }

    const av1Out = join(outDir, `${clip.name}.av1.webm`);
    if (av1Encoder) {
      const [cmd, cmdArgs] = av1Command({ source, output: av1Out, clip, video, rate, encoder: av1Encoder });
      run(cmd, cmdArgs);
    } else {
      console.log('    (no AV1 encoder in this ffmpeg build — VP9 only)');
    }

    // Poster: walk the quality down until it fits the cap, so posters cannot
    // quietly become the heaviest thing on the page.
    const posterOut = join(outDir, `${clip.name}.jpg`);
    let posterQuality = 3;
    for (; posterQuality <= 15; posterQuality += 1) {
      const [cmd, cmdArgs] = posterCommand({ source, output: posterOut, clip, video, quality: posterQuality });
      run(cmd, cmdArgs);
      if (dryRun) break;
      if (statSync(posterOut).size <= video.posterMaxKB * 1000) break;
    }

    // Two-pass leaves its log behind.
    for (const leftover of readdirSync(outDir)) {
      if (leftover.startsWith(`.${clip.name}-pass`)) unlinkSync(join(outDir, leftover));
    }

    if (dryRun) continue;

    for (const [label, file] of [
      ['av1', av1Out],
      ['vp9', vp9Out],
      ['poster', posterOut],
    ]) {
      if (!existsSync(file)) continue;
      const bytes = statSync(file).size;
      const cap = label === 'poster' ? video.posterMaxKB * 1000 : video.failOverKB * 1000;
      if (bytes > cap) over += 1;
      rows.push({ name: `${clip.name} ${label}`, input: inputBytes, output: bytes, cap });
    }
  }

  /* stills ------------------------------------------------------------------ */

  for (const still of config.stills) {
    if (!wanted(still.name)) continue;
    const source = join(rawDir, still.source);
    if (!existsSync(source)) {
      missing.push(`${still.source} → ${still.name}.{avif,webp,jpg}`);
      continue;
    }

    console.log(`${still.name}:`);
    const inputBytes = statSync(source).size;

    for (const format of ['avif', 'webp', 'jpg']) {
      if (format === 'avif' && !av1Encoder) continue;
      const output = join(outDir, `${still.name}.${format}`);
      const [cmd, cmdArgs] = stillCommand({ source, output, still, format, av1Encoder });
      try {
        run(cmd, cmdArgs);
      } catch {
        console.log(`    (${format} failed — this ffmpeg build may not support it)`);
        continue;
      }
      if (dryRun || !existsSync(output)) continue;
      rows.push({ name: `${still.name} ${format}`, input: inputBytes, output: statSync(output).size, cap: Infinity });
    }
  }

  /* report ------------------------------------------------------------------ */

  if (dryRun) {
    console.log('\n  Dry run — nothing was encoded.\n');
    process.exit(0);
  }

  if (rows.length) {
    const width = Math.max(...rows.map((r) => r.name.length), 12);
    console.log(`\n  ${'output'.padEnd(width)}  ${'source'.padStart(11)}  ${'encoded'.padStart(11)}  ratio`);
    console.log(`  ${'-'.repeat(width)}  ${'-'.repeat(11)}  ${'-'.repeat(11)}  -----`);
    for (const row of rows) {
      const flag = row.output > row.cap ? '  OVER' : '';
      console.log(
        `  ${row.name.padEnd(width)}  ${kb(row.input).padStart(11)}  ${kb(row.output).padStart(11)}` +
          `  ${((row.output / row.input) * 100).toFixed(1).padStart(5)}%${flag}`
      );
    }
    const total = rows.reduce((sum, r) => sum + r.output, 0);
    console.log(`  ${'total encoded'.padEnd(width)}  ${''.padStart(11)}  ${kb(total).padStart(11)}\n`);
  }

  if (missing.length) {
    console.log('  Not encoded — no source in raw-media/:');
    for (const item of missing) console.log(`    ${item}`);
    console.log('');
  }

  if (over > 0) {
    console.error(`  FAIL  ${over} output(s) over the size cap. Trim the clip shorter or lower targetKB.\n`);
  }

  if (rows.length === 0 && missing.length > 0) {
    console.log('  Nothing to do yet. Drop the sources listed above into raw-media/.\n');
  }

  // Every run ends on the whole budget, not only what it just encoded.
  const overBudget = reportVideoBudget(config);
  if (over > 0 || overBudget > 0) process.exit(1);
}
