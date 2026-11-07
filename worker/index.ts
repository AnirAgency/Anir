/**
 * The Worker: a few routes of code in front of a static site.
 *
 * POST /api/enquiry runs the contact handler (./enquiry.ts), and GET
 * /api/health tells the health check whether this Worker holds its secret.
 * The rest are the admin's, each for editors only (./auth.ts): /api/publish
 * starts a build (POST) and follows it (GET, ./publish.ts); /api/enquiries
 * lists the enquiries and /api/enquiries/<id> changes one's status;
 * /api/storage says how much of Storage is used (./inbox.ts); /api/alerts
 * says what the Worker needs a person to know (./alerts.ts). One is the
 * build's: POST /api/builds, its report on itself, with a secret of its own
 * (./builds.ts). Everything else goes to the static assets in dist/;
 * requests that match a file are served by Workers Static Assets before
 * this code ever runs.
 *
 * Other methods on any route fall through to the assets too, which answer
 * 404 — the same thing a Pages Function exporting only onRequestPost did.
 *
 * On a schedule (wrangler.jsonc > triggers) it drains enquiries that were
 * buffered in KV while Supabase would not take them, then watches: the
 * hourly digest of flagged enquiries, and a flood (./watch.ts).
 */
import { drain, onHealth, onRequestPost, type Env as EnquiryEnv } from './enquiry.ts';
import { onAlerts } from './alerts.ts';
import { watch } from './watch.ts';
import { onPublish, onPublishStatus, type Env as PublishEnv } from './publish.ts';
import { onEnquiries, onEnquiryStatus, onStorage } from './inbox.ts';
import { onBuildReport, type Env as BuildsEnv } from './builds.ts';

// Written by scripts/headers.mjs on every build, from the same list that
// becomes dist/_headers. Missing means `npm run build` has not run.
import security from './security-headers.generated.json' with { type: 'json' };

// An intersection, not `extends`: the routes agree on SUPABASE_URL, but one
// may run before it is set (a preview) and says so as optional.
type Env = EnquiryEnv &
  PublishEnv &
  BuildsEnv & {
    ASSETS: { fetch(request: Request): Promise<Response> };
  };

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
    if (pathname === '/api/publish' && request.method === 'POST') {
      return withSecurityHeaders(await onPublish(request, env));
    }
    if (pathname === '/api/publish' && request.method === 'GET') {
      return withSecurityHeaders(await onPublishStatus(request, env));
    }
    if (pathname === '/api/enquiries' && request.method === 'GET') {
      return withSecurityHeaders(await onEnquiries(request, env));
    }
    const enquiry = /^\/api\/enquiries\/([^/]+)$/.exec(pathname);
    if (enquiry && request.method === 'POST') {
      return withSecurityHeaders(await onEnquiryStatus(request, env, decodeURIComponent(enquiry[1])));
    }
    if (pathname === '/api/storage' && request.method === 'GET') {
      return withSecurityHeaders(await onStorage(request, env));
    }
    if (pathname === '/api/builds' && request.method === 'POST') {
      return withSecurityHeaders(await onBuildReport(request, env));
    }
    if (pathname === '/api/alerts' && request.method === 'GET') {
      return withSecurityHeaders(await onAlerts(request, env));
    }
    if (pathname === '/api/health' && request.method === 'GET') {
      return withSecurityHeaders(await onHealth(request, env));
    }
    return env.ASSETS.fetch(request);
  },

  // Drain first, so the watch counts what the buffer held (./watch.ts).
  async scheduled(_controller: unknown, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(drain(env).then(() => watch(env)));
  },
};
