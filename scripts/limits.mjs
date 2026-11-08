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

/**
 * What a preview build's placeholders may add to a page, on top of
 * production's budget — a limit, not an exemption. The page budget protects
 * real visitors; previews serve four people, and their placeholders stand in
 * for real photographs that will likely weigh more, so shrinking them would
 * only make a preview pass that tells nothing about the real site. So in a
 * placeholder build (src/lib/placeholders.mjs), scripts/budget.mjs holds:
 *
 *   real media      to production's caps, exactly — a genuine regression
 *                   in real page weight still fails a branch build;
 *   placeholders    to this allowance, and each video or poster to
 *                   PLACEHOLDER_MAX;
 *
 * so the preview ceiling is production's cap plus this. Sized to the v4
 * placeholder set (public/media/placeholder/): tiles 798 kB, video 2.30 MB,
 * poster 16 kB — 3.12 MB below the fold. Raising it is a decision, made here.
 */
export const PLACEHOLDER_ALLOWANCE = {
  /** All placeholder media below the fold on one page. */
  below: 3_200_000,
  /** Placeholder tiles on one page, together. */
  tiles: 850_000,
};
