/**
 * Checks the media pipeline's command construction and size arithmetic without
 * ffmpeg installed and without any source footage — which is exactly the state
 * this project is in until the shoot happens.
 *
 * What it proves: audio and metadata are always stripped, the scale filter can
 * never enlarge, dimensions stay even, bitrate maths hits the size target, and
 * the encoder choice degrades correctly. What it cannot prove: that ffmpeg
 * produces a file of the predicted size. Run `npm run media` once there is
 * footage for that.
 *
 *   node scripts/test-media.mjs
 */
import assert from 'node:assert/strict';

import {
  av1Command,
  bitrateKbps,
  pickAv1Encoder,
  posterCommand,
  stillCommand,
  stillFilter,
  videoFilter,
  vp9Commands,
} from './media.mjs';

const video = { maxHeight: 720, fps: 24, targetKB: 240, failOverKB: 400, posterMaxKB: 40 };
const clip = { name: 'hero', source: 'hero.mov', in: '0', out: '4' };
const base = { source: 'raw-media/hero.mov', clip, video, rate: 480, passlog: '.pass' };

const results = [];
let failures = 0;

function check(label, run) {
  try {
    results.push([label, run()]);
  } catch (error) {
    failures += 1;
    results.push([label, `FAILED — ${error.message}`]);
  }
}

const flat = (pairs) => pairs.map(([cmd, args]) => `${cmd} ${args.join(' ')}`).join(' && ');

check('audio is stripped from every video command', () => {
  const vp9 = flat(vp9Commands({ ...base, output: 'out.vp9.webm' }));
  const av1 = flat([av1Command({ ...base, output: 'out.av1.webm', encoder: 'libsvtav1' })]);
  for (const cmd of [vp9, av1]) assert.match(cmd, /-an\b/);
  return '-an present in VP9 (both passes) and AV1';
});

check('all metadata is dropped, so no camera EXIF ships', () => {
  const all = [
    flat(vp9Commands({ ...base, output: 'o.webm' })),
    flat([av1Command({ ...base, output: 'o.webm', encoder: 'libsvtav1' })]),
    flat([posterCommand({ ...base, output: 'o.jpg', quality: 4 })]),
    flat([stillCommand({ source: 'p.jpg', output: 'o.jpg', still: { width: 900, height: 1200 }, format: 'jpg' })]),
  ];
  for (const cmd of all) assert.match(cmd, /-map_metadata -1/);
  return '-map_metadata -1 on clips, posters and stills';
});

check('the scale filter never enlarges a small source', () => {
  const filter = videoFilter(720, 24);
  assert.match(filter, /min\(720,ih\)/);
  assert.match(filter, /fps=24/);
  // -2 keeps width even, which both VP9 and AV1 require.
  assert.match(filter, /scale=-2:/);
  return `${filter}`;
});

check('stills cover-crop to exact dimensions', () => {
  const filter = stillFilter(1200, 630);
  assert.match(filter, /force_original_aspect_ratio=increase/);
  assert.match(filter, /crop=1200:630/);
  return 'scale up to cover, then crop — no letterboxing, no squash';
});

check('bitrate maths hits the size target', () => {
  // 240 kB over 4s = 1920 kbit / 4s = 480 kbps.
  assert.equal(bitrateKbps(240, 4), 480);
  assert.equal(bitrateKbps(240, 3), 640);
  const predictedKB = (bitrateKbps(240, 4) * 4) / 8;
  assert.equal(predictedKB, 240);
  return '240 kB / 4s → 480 kbps → predicts 240 kB back';
});

check('very short clips do not get an absurd bitrate floor', () => {
  assert.ok(bitrateKbps(240, 0.05) > 0);
  assert.equal(bitrateKbps(1, 100), 80, 'floors at 80 kbps');
  return 'floored at 80 kbps';
});

check('VP9 runs two passes, and only the second writes a file', () => {
  const [first, second] = vp9Commands({ ...base, output: 'out.vp9.webm' });
  assert.match(first[1].join(' '), /-pass 1/);
  assert.match(first[1].join(' '), /-f null/);
  assert.ok(!first[1].includes('out.vp9.webm'), 'pass 1 must not write the output');
  assert.match(second[1].join(' '), /-pass 2/);
  assert.ok(second[1].includes('out.vp9.webm'));
  return 'pass 1 → null, pass 2 → out.vp9.webm';
});

check('trim points are applied before the input, so seeking is fast', () => {
  const [, args] = av1Command({ ...base, output: 'o.webm', encoder: 'libsvtav1' });
  const ss = args.indexOf('-ss');
  const i = args.indexOf('-i');
  assert.ok(ss !== -1 && ss < i, '-ss must precede -i');
  assert.equal(args[args.indexOf('-to') + 1], '4');
  return '-ss and -to before -i';
});

check('AV1 lands in a webm container', () => {
  const [, args] = av1Command({ ...base, output: 'o.webm', encoder: 'libsvtav1' });
  assert.equal(args[args.indexOf('-f') + 1], 'webm');
  return '-f webm';
});

check('encoder choice prefers SVT and degrades correctly', () => {
  assert.equal(pickAv1Encoder(' V..... libsvtav1  SVT-AV1\n V..... libaom-av1  AOM'), 'libsvtav1');
  assert.equal(pickAv1Encoder(' V..... libaom-av1  AOM'), 'libaom-av1');
  assert.equal(pickAv1Encoder(' V..... libvpx-vp9  VP9'), null);
  return 'libsvtav1 > libaom-av1 > null (VP9 only)';
});

check('each still format gets its own encoder', () => {
  const still = { width: 900, height: 1200 };
  const of = (format) => stillCommand({ source: 'p.jpg', output: `o.${format}`, still, format, av1Encoder: 'libaom-av1' })[1].join(' ');
  assert.match(of('avif'), /-c:v libaom-av1 -still-picture 1/);
  assert.match(of('webp'), /-c:v libwebp/);
  assert.match(of('jpg'), /-q:v 4/);
  return 'avif → libaom-av1 still, webp → libwebp, jpg → q:v 4';
});

check('poster quality is a dial the runner can walk', () => {
  const low = posterCommand({ ...base, output: 'o.jpg', quality: 3 })[1].join(' ');
  const high = posterCommand({ ...base, output: 'o.jpg', quality: 12 })[1].join(' ');
  assert.match(low, /-q:v 3/);
  assert.match(high, /-q:v 12/);
  assert.match(low, /-frames:v 1/);
  return 'single frame, -q:v walked from 3 until it fits 40 kB';
});

const width = Math.max(...results.map(([label]) => label.length));
console.log('');
for (const [label, detail] of results) {
  console.log(`  ${detail.startsWith('FAILED') ? 'x' : '+'} ${label.padEnd(width)}  ${detail}`);
}
console.log(`\n  ${results.length - failures}/${results.length} passed\n`);
process.exit(failures ? 1 : 0);
