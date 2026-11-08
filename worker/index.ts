/**
 * The Worker: a few routes of code in front of a static site.
 *
 * POST /api/enquiry runs the contact handler (./enquiry.ts), and GET
 * /api/health answers "alive" to the holder of the health-check secret and
 * one same refusal to everyone else — nothing about how the Worker is set up.
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
 *
 * /api/tasks* is the team's task list (./tasks.ts) and /api/contributions* is
 * Schedule 2, the Members' contributions (./contributions.ts): editors only,
 * each loaded only when asked for and walled off on its own — see makeWorker.
 */
import { drain, onHealth, onRequestPost, type Env as EnquiryEnv } from './enquiry.ts';
import { onAlerts } from './alerts.ts';
import { watch } from './watch.ts';
import { onPublish, onPublishStatus, type Env as PublishEnv } from './publish.ts';
import { onEnquiries, onEnquiryStatus, onStorage } from './inbox.ts';
import { onBuildReport, type Env as BuildsEnv } from './builds.ts';
import { answer } from './auth.ts';
import { indexable } from '../src/lib/site-url.mjs';
// Types only — erased at build. The team's tools are never imported here
// statically: see the loaders below.
import type { Env as TasksEnv } from './tasks.ts';
import type { Env as ContributionsEnv } from './contributions.ts';

/**
 * The team's tools' code, each loaded only when a request for its own routes
 * arrives — never at start-up, never on any other route. Coupled one way
 * (CLAUDE.md > The admin): if one fails to load or throws, that request is
 * answered with an error and nothing else is touched — not the site, not the
 * other tool. Replaceable so scripts/test-isolation.ts can make them fail on
 * purpose.
 */
type Handler = (request: Request, env: TasksEnv & ContributionsEnv, ctx: { waitUntil?: (p: Promise<unknown>) => void }) => Promise<Response>;
type TasksModule = { onTasks: Handler };
type ContributionsModule = { onContributions: Handler };
export interface Loaders {
  tasks: () => Promise<TasksModule>;
  contributions: () => Promise<ContributionsModule>;
}
const LOADERS: Loaders = {
  tasks: () => import('./tasks.ts'),
  contributions: () => import('./contributions.ts'),
};
/** Which tool a path belongs to, its handler's name, and the error its failure answers. */
const WALLED = [
  { prefix: '/api/tasks', tool: 'tasks', handler: 'onTasks' },
  { prefix: '/api/contributions', tool: 'contributions', handler: 'onContributions' },
] as const;

// Written by scripts/headers.mjs on every build, from the same list that
// becomes dist/_headers. Missing means `npm run build` has not run.
import security from './security-headers.generated.json' with { type: 'json' };

// An intersection, not `extends`: the routes agree on SUPABASE_URL, but one
// may run before it is set (a preview) and says so as optional.
type Env = EnquiryEnv &
  PublishEnv &
  BuildsEnv &
  TasksEnv &
  ContributionsEnv & {
    ASSETS: { fetch(request: Request): Promise<Response> };
  };

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

/**
 * _headers is applied to static files only, never to responses this code
 * makes — so the endpoint that takes user input would otherwise go out with
 * no CSP, no nosniff, nothing. Same headers, same values as every page. And
 * on any host that is not the production domain — workers.dev, a preview —
 * the same noindex the static files get there (src/lib/site-url.mjs).
 */
function withSecurityHeaders(response: Response, hostname: string): Response {
  const secured = new Response(response.body, response);
  for (const [name, value] of security as [string, string][]) secured.headers.set(name, value);
  if (!indexable(hostname)) secured.headers.set('X-Robots-Tag', 'noindex');
  return secured;
}

/** The Worker, with the tools' loaders passed in — the real ones, or in a test, ones that fail. */
export function makeWorker(loaders: Partial<Loaders> = {}) {
  const load: Loaders = { ...LOADERS, ...loaders };
  return {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const { pathname, hostname } = new URL(request.url);
    const secure = (response: Response) => withSecurityHeaders(response, hostname);
    // The team's tools, each walled off: its own route prefix, loaded on
    // demand, and whatever goes wrong inside it ends here, as this route's error.
    const walled = WALLED.find(({ prefix }) => pathname === prefix || pathname.startsWith(`${prefix}/`));
    if (walled) {
      try {
        const module = (await load[walled.tool]()) as Record<string, Handler>;
        return secure(await module[walled.handler](request, env, { waitUntil: (promise) => ctx.waitUntil(promise) }));
      } catch (error) {
        console.error(`${walled.tool}: FAILED — ${(error as Error)?.message ?? error}`);
        return secure(answer(500, { ok: false, error: walled.tool }));
      }
    }
    if (pathname === '/api/enquiry' && request.method === 'POST') {
      const waitUntil = (promise: Promise<unknown>) => ctx.waitUntil(promise);
      return secure(await onRequestPost({ request, env, waitUntil }));
    }
    if (pathname === '/api/publish' && request.method === 'POST') {
      return secure(await onPublish(request, env));
    }
    if (pathname === '/api/publish' && request.method === 'GET') {
      return secure(await onPublishStatus(request, env));
    }
    if (pathname === '/api/enquiries' && request.method === 'GET') {
      return secure(await onEnquiries(request, env));
    }
    const enquiry = /^\/api\/enquiries\/([^/]+)$/.exec(pathname);
    if (enquiry && request.method === 'POST') {
      return secure(await onEnquiryStatus(request, env, decodeURIComponent(enquiry[1])));
    }
    if (pathname === '/api/storage' && request.method === 'GET') {
      return secure(await onStorage(request, env));
    }
    if (pathname === '/api/builds' && request.method === 'POST') {
      return secure(await onBuildReport(request, env));
    }
    if (pathname === '/api/alerts' && request.method === 'GET') {
      return secure(await onAlerts(request, env));
    }
    if (pathname === '/api/health' && request.method === 'GET') {
      return secure(await onHealth(request, env));
    }
    return env.ASSETS.fetch(request);
  },

  // Drain first, so the watch counts what the buffer held and knows why
  // anything is still in it (./watch.ts > stuck). The drain never throws, so
  // the watch always runs.
  async scheduled(_controller: unknown, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(drain(env).then((drained) => watch(env, new Date(), fetch, drained)));
  },
  };
}

export default makeWorker();
