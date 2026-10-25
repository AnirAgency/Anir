/**
 * Whether a build renders placeholder media where real media is missing.
 *
 * One answer for the three places that need it — the showreel's render gate,
 * the step that strips public/media/placeholder/ from dist/, and the budget's
 * placeholder backstop — so they cannot disagree.
 *
 *   astro dev                      yes
 *   Cloudflare Pages preview       yes: any branch but the production one
 *   Cloudflare Pages production    never; PLACEHOLDER_MEDIA=1 there fails the build
 *   local `npm run build`          no — it is the artefact `npm run budget`
 *                                  measures, so it builds exactly what ships
 *
 * PLACEHOLDER_MEDIA=1 turns placeholders on anywhere except production, and
 * PLACEHOLDER_MEDIA=0 turns them off.
 */

/** Cloudflare Pages > Settings > Production branch (README > Deploy runbook). */
export const PRODUCTION_BRANCH = 'main';

/**
 * @param {{ dev?: boolean, env?: Record<string, string | undefined> }} [options]
 * @returns {boolean}
 */
export function placeholderMode({ dev = false, env = process.env } = {}) {
  const flag = env.PLACEHOLDER_MEDIA;
  const pages = env.CF_PAGES === '1';

  if (pages && env.CF_PAGES_BRANCH === PRODUCTION_BRANCH) {
    if (flag === '1') {
      throw new Error(`PLACEHOLDER_MEDIA=1 on the production branch (${PRODUCTION_BRANCH}). Placeholders never ship.`);
    }
    return false;
  }

  if (flag === '1') return true;
  if (flag === '0') return false;
  return dev || pages;
}

/** Why this build has placeholders, for the logs. */
export function placeholderReason({ dev = false, env = process.env } = {}) {
  if (env.PLACEHOLDER_MEDIA === '1') return 'PLACEHOLDER_MEDIA=1';
  if (dev) return 'astro dev';
  return `Cloudflare Pages preview (${env.CF_PAGES_BRANCH ?? 'unknown branch'})`;
}
