/**
 * The site's one real address, in one place: Astro's `site` (canonical URLs,
 * og:url, the sitemap — astro.config.mjs) and the Worker's test for which
 * hosts search engines may index (worker/index.ts) both read it here.
 *
 * aniragency.mn is not registered yet. Until it is, every address the site
 * answers on is a copy — anir.<account>.workers.dev and each preview — and
 * every one of them says noindex (here for the Worker's own responses, and
 * in dist/_headers for everything else: scripts/headers.mjs).
 */
export const SITE_URL = 'https://aniragency.mn';

const apex = new URL(SITE_URL).hostname;

/** The hosts that are the site itself, and may be indexed. */
export const PRODUCTION_HOSTS = [apex, `www.${apex}`];

/** Whether a response from this host may appear in search results. */
export const indexable = (hostname) => PRODUCTION_HOSTS.includes(String(hostname).toLowerCase());
