/**
 * The media caps CLAUDE.md sets (Budget > Below-the-fold media), in one
 * place: `npm run budget` holds every page to them, and `npm run media`
 * holds every committed video file to them, so the two can never disagree.
 */

/** 1.2 MB per video. */
export const VIDEO_MAX = 1_200_000;
/** 40 kB per poster. */
export const POSTER_MAX = 40_000;
/**
 * 3 MB per placeholder video or poster. Looser, not exempt: "production
 * never ships them" is a rule, not a fact about who downloads them — every
 * preview build serves them, and a public preview copy has. So they are
 * held to a cap too, and scripts/no-placeholders.mjs fails a production
 * build whose output names one.
 */
export const PLACEHOLDER_MAX = 3_000_000;
