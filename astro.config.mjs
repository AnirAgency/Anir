// @ts-check
import { readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';

import { placeholderMode, placeholderReason } from './src/lib/placeholders.mjs';
import { SITE_URL } from './src/lib/site-url.mjs';

/**
 * /styleguide exists in `astro dev` and nowhere else.
 *
 * The page deliberately does not live in src/pages — it lives in src/dev and is
 * injected as a route only when the dev server starts, so a production build
 * never renders it, never emits it, and never has a file to leak. It is our
 * reference for the tokens, not a page for a client to stumble onto.
 */
function devStyleguide() {
  return {
    name: 'anir:dev-styleguide',
    hooks: {
      'astro:config:setup': ({ command, injectRoute, logger }) => {
        if (command !== 'dev') return;
        injectRoute({
          pattern: '/styleguide',
          entrypoint: './src/dev/styleguide.astro',
        });
        logger.info('/styleguide mounted (dev only)');
      },
    },
  };
}

/**
 * public/media/placeholder/ is for dev and preview builds only. Astro copies
 * all of public/ into dist/, so every other build — production included —
 * deletes the copy afterwards: the placeholders are never deployed to
 * production, referenced or not.
 */
function stripPlaceholders() {
  return {
    name: 'anir:strip-placeholders',
    hooks: {
      'astro:build:done': ({ dir, logger }) => {
        if (placeholderMode()) {
          logger.warn(`placeholder media kept in dist/ (${placeholderReason()}). Not a production build.`);
          return;
        }
        rmSync(new URL('media/placeholder/', dir), { recursive: true, force: true });
      },
    },
  };
}

// Static output only. Workers Static Assets serves dist/, and the Worker in
// worker/ answers the contact endpoint — no SSR adapter, see README > Cloudflare Workers.
/**
 * sitemap.xml and robots.txt, written from what the build produced — never by
 * hand, so a new product's page is listed the moment it exists. Every built
 * page goes in except one that says noindex (the admin, /v2, the 404 page):
 * the rule is the page's own robots meta, not a list to keep in step.
 */
function searchFiles() {
  return {
    name: 'anir:search-files',
    hooks: {
      'astro:build:done': ({ dir, logger }) => {
        const out = fileURLToPath(dir);
        const pages = [];
        const walk = (folder) => {
          for (const name of readdirSync(folder)) {
            const full = join(folder, name);
            if (statSync(full).isDirectory()) walk(full);
            else if (name === 'index.html') pages.push(full);
          }
        };
        walk(out);
        const urls = pages
          .filter((file) => !/<meta\s+name="robots"\s+content="[^"]*noindex/i.test(readFileSync(file, 'utf8')))
          .map((file) => new URL(relative(out, dirname(file)).split(sep).join('/').replace(/^(.+)$/, '$1/'), SITE_URL).href)
          .sort();
        writeFileSync(
          join(out, 'sitemap.xml'),
          `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((url) => `  <url><loc>${url}</loc></url>`).join('\n')}\n</urlset>\n`
        );
        writeFileSync(
          join(out, 'robots.txt'),
          [
            'User-agent: *',
            'Allow: /',
            '',
            "# The Worker's endpoints are not pages.",
            'Disallow: /api/',
            '',
            `Sitemap: ${new URL('/sitemap.xml', SITE_URL).href}`,
            '',
          ].join('\n')
        );
        logger.info(`sitemap.xml: ${urls.length} page(s); robots.txt written`);
      },
    },
  };
}

export default defineConfig({
  site: SITE_URL,
  output: 'static',
  compressHTML: true,
  integrations: [devStyleguide(), stripPlaceholders(), searchFiles()],
  build: {
    assets: '_astro',
    // Small sheets get inlined; anything larger stays a cacheable file.
    inlineStylesheets: 'auto',
  },
  devToolbar: { enabled: false },
});
