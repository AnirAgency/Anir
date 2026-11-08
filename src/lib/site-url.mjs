/**
 * The site's one real address, in one place: Astro's `site` (canonical URLs,
 * og:url, the sitemap — astro.config.mjs) and the Worker's test for which
 * hosts search engines may index (worker/index.ts) both read it here.
 *
 * aniragency.mn is not registered yet. Until it is, every address the site
 * answers on is a copy — anir.<account>.workers.dev and each preview — and
 * every one of them says noindex (here for the Worker's own responses, and
 * in dist/_headers for everything else: scripts/headers.mjs).
 *
 * Held, not hoped: `npm run seo` matches dist/_headers as Cloudflare does
 * and fails if any rule would noindex a page on these hosts, if a
 * workers.dev host would go without it, or if wrangler.jsonc attaches a
 * custom domain that is not one of them. When the domain is registered,
 * attach it in wrangler.jsonc (routes, custom_domain) — and if it is not
 * aniragency.mn, change SITE_URL here first; the build says so otherwise.
 */
export const SITE_URL = 'https://aniragency.mn';

const apex = new URL(SITE_URL).hostname;

/** The hosts that are the site itself, and may be indexed. */
export const PRODUCTION_HOSTS = [apex, `www.${apex}`];

/** Whether a response from this host may appear in search results. */
export const indexable = (hostname) => PRODUCTION_HOSTS.includes(String(hostname).toLowerCase());
