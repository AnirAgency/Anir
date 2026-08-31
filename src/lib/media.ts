/**
 * Works out which encoded variants of an asset actually exist on disk, at build
 * time, so a component can emit only the sources it really has.
 *
 * site.ts stores a basename — 'hero', 'plate-01', 'portrait-01' — and the media
 * pipeline writes the variants beside it. Nothing here guesses: if the shoot
 * has not happened, every list comes back empty and the component renders its
 * placeholder instead of a broken <source>.
 */
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { Media } from '../content/site';

/** Best first. A browser takes the first source it understands, so AV1 — the
 *  smaller encode — has to precede VP9, and AVIF has to precede WebP. */
const VIDEO_VARIANTS = [
  { ext: 'av1.webm', type: 'video/webm; codecs="av01.0.05M.08"' },
  { ext: 'vp9.webm', type: 'video/webm; codecs="vp9"' },
] as const;

const IMAGE_VARIANTS = [
  { ext: 'avif', type: 'image/avif' },
  { ext: 'webp', type: 'image/webp' },
] as const;

export interface MediaSource {
  src: string;
  type: string;
}

export interface ResolvedMedia {
  /** <source> entries, best format first. Empty when nothing is encoded yet. */
  sources: MediaSource[];
  /** Poster frame for video, or the <img> fallback for a picture. */
  fallback: string | null;
  /** True when there is something real to render. */
  present: boolean;
}

const onDisk = (publicPath: string) =>
  existsSync(fileURLToPath(new URL(`../../public${publicPath}`, import.meta.url)));

function resolve(media: Media, variants: readonly { ext: string; type: string }[]): ResolvedMedia {
  if (!media.name) return { sources: [], fallback: null, present: false };

  const sources: MediaSource[] = [];
  for (const variant of variants) {
    const path = `/media/${media.name}.${variant.ext}`;
    if (onDisk(path)) sources.push({ src: path, type: variant.type });
  }

  const jpg = `/media/${media.name}.jpg`;
  const fallback = onDisk(jpg) ? jpg : null;

  return { sources, fallback, present: sources.length > 0 || fallback !== null };
}

/** Video: AV1 then VP9, with the poster JPG as `fallback`. */
export const resolveVideo = (media: Media) => resolve(media, VIDEO_VARIANTS);

/**
 * Image: AVIF then WebP as <source>, with the JPG as the <img>. A picture with
 * no <img> renders nothing, so an image is only "present" once the JPG exists.
 */
export function resolveImage(media: Media): ResolvedMedia {
  const resolved = resolve(media, IMAGE_VARIANTS);
  return { ...resolved, present: resolved.fallback !== null };
}
