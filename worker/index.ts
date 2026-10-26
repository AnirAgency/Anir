/**
 * The Worker: one route of code in front of a static site.
 *
 * POST /api/enquiry runs the contact handler (./enquiry.ts). Everything else
 * goes to the static assets in dist/; requests that match a file are served by
 * Workers Static Assets before this code ever runs.
 *
 * Other methods on /api/enquiry fall through to the assets too, which answer
 * 404 — the same thing a Pages Function exporting only onRequestPost did.
 *
 * On a schedule (wrangler.jsonc > triggers) it drains enquiries that were
 * buffered in KV while Supabase would not take them.
 */
import { drain, onRequestPost, type Env as EnquiryEnv } from './enquiry.ts';

// Written by scripts/headers.mjs on every build, from the same list that
// becomes dist/_headers. Missing means `npm run build` has not run.
import security from './security-headers.generated.json';

interface Env extends EnquiryEnv {
  ASSETS: { fetch(request: Request): Promise<Response> };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

/**
 * _headers is applied to static files only, never to responses this code
 * makes — so the endpoint that takes user input would otherwise go out with
 * no CSP, no nosniff, nothing. Same headers, same values as every page.
 */
function withSecurityHeaders(response: Response): Response {
  const secured = new Response(response.body, response);
  for (const [name, value] of security as [string, string][]) secured.headers.set(name, value);
  return secured;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === '/api/enquiry' && request.method === 'POST') {
      const waitUntil = (promise: Promise<unknown>) => ctx.waitUntil(promise);
      return withSecurityHeaders(await onRequestPost({ request, env, waitUntil }));
    }
    return env.ASSETS.fetch(request);
  },

  async scheduled(_controller: unknown, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(drain(env));
  },
};
