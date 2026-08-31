/**
 * Media pipeline. Turns camera originals in raw-media/ into the web-ready
 * files public/media/ ships.
 *
 *   npm run media              encode everything the config lists
 *   npm run media -- --dry-run print the exact ffmpeg commands, run nothing
 *   npm run media -- hero      just one clip or still, by name
 *
 * Every clip comes out twice — AV1 for browsers that take it, VP9 for the rest —
 * plus a poster frame. Stills come out as AVIF, WebP and JPG. Audio is stripped
 * outright and all metadata is dropped, so no camera EXIF reaches the web.
 *
 * The command builders below are pure functions, exported so scripts/test-media.mjs
 * can check them without ffmpeg installed.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rawDir = join(root, 'raw-media');
const outDir = join(root, 'public', 'media');
const configPath = join(root, 'scripts', 'media.config.json');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const only = args.filter((a) => !a.startsWith('--'));

const kb = (bytes) => `${(bytes / 1000).toFixed(1)} kB`;

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
    process.exit(1);
  }

  if (rows.length === 0 && missing.length > 0) {
    console.log('  Nothing to do yet. Drop the sources listed above into raw-media/.\n');
  }

}
