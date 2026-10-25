// @ts-check
import { rmSync } from 'node:fs';
import { defineConfig } from 'astro/config';

import { placeholderMode, placeholderReason } from './src/lib/placeholders.mjs';

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

// Static output only. Cloudflare Pages serves dist/ from its Ulaanbaatar PoP and
// picks up functions/ on its own — no SSR adapter, see README > Cloudflare Pages.
export default defineConfig({
  site: 'https://aniragency.mn',
  output: 'static',
  compressHTML: true,
  integrations: [devStyleguide(), stripPlaceholders()],
  build: {
    assets: '_astro',
    // Small sheets get inlined; anything larger stays a cacheable file.
    inlineStylesheets: 'auto',
  },
  devToolbar: { enabled: false },
});
