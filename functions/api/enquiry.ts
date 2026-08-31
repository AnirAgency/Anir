/**
 * The site's only server-side code.
 *
 * Accepts an enquiry, validates it, rate-limits by IP, and inserts one row into
 * Supabase. Everything else on aniragency.mn is a static file.
 *
 * It answers two callers with the same logic:
 *   - fetch() from the form's progressive enhancement, which asks for JSON
 *   - a plain browser form POST with JS disabled, which gets an HTML page back
 *
 * Talks to Supabase over its REST endpoint with fetch rather than the JS SDK:
 * the worker stays a few kB and the project keeps its "gsap and lenis, nothing
 * else" dependency list.
 */

// Explicit .ts extension: esbuild (Wrangler, Astro) and Node's own type
// stripping both resolve it, so the test harness can import this file directly.
import { site } from '../../src/content/site.ts';

interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  /** Optional. Without it, rate limiting is skipped — see checkRateLimit. */
  RATE_LIMIT?: KVNamespace;
}

interface Context {
  request: Request;
  env: Env;
}

const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_SECONDS = 60 * 60;

const MAX = {
  name: 100,
  contact: 120,
  message: 2000,
  userAgent: 400,
} as const;

const messages = site.contact.form.messages;

/** Allowed values for the three chip groups, taken from the same source the
 *  form renders from — so the validator cannot drift from the options. */
const allowed: Record<string, Set<string>> = Object.fromEntries(
  site.contact.form.groups.map((group) => [group.name, new Set(group.options.map((o) => o.value))])
);

const HONEYPOT = site.contact.form.honeypot.name;

/* ------------------------------------------------------------------ replies */

/** The caller wants JSON if it asked for it; a browser form post did not. */
const wantsJson = (request: Request) => {
  const accept = request.headers.get('Accept') ?? '';
  return accept.includes('application/json');
};

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });

/**
 * The no-JS reply. A small self-contained page rather than a redirect, because
 * a redirect back to a static page cannot say which field was wrong.
 */
const html = (status: number, heading: string, ok: boolean) =>
  new Response(
    `<!doctype html><html lang="mn"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${ok ? 'Хүсэлт хүлээн авлаа' : 'Алдаа'} — Anir</title>
<style>
:root{--ink:#08090b;--paper:#eef0f3;--dim:#767c85;--orange:#f30}
body{margin:0;min-height:100vh;display:grid;place-items:center;padding:2rem;
background:var(--ink);color:var(--paper);
font:400 14px/1.8 ui-monospace,Consolas,"Liberation Mono",monospace;text-align:center}
main{max-width:46ch}
p{color:var(--dim)}
a{color:var(--orange)}
</style></head><body><main>
<p style="color:var(--orange);letter-spacing:.18em;text-transform:uppercase;font-size:10px">Anir</p>
<p style="color:var(--paper);font-size:16px">${heading}</p>
<p><a href="/#contact">← Буцах</a></p>
</main></body></html>`,
    {
      status,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    }
  );

const reply = (request: Request, status: number, ok: boolean, message: string) =>
  wantsJson(request) ? json(status, { ok, message }) : html(status, message, ok);

/* --------------------------------------------------------------- validation */

const clean = (value: unknown, max: number) =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

/** An email, or a Mongolian phone number with or without country code. */
function looksContactable(value: string) {
  if (/^[^@\s]+@[^@\s.]+\.[^@\s]{2,}$/.test(value)) return true;
  const digits = value.replace(/[\s\-()+]/g, '');
  return /^(976)?\d{8}$/.test(digits);
}

/* -------------------------------------------------------------- rate limit */

/** IPs are hashed before they touch storage — the limiter needs to compare
 *  callers, not to know who they are. */
async function ipKey(ip: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip));
  return `rl:${[...new Uint8Array(digest)].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Fails open. If the KV binding is missing or KV itself errors, the enquiry is
 * allowed through: losing a real client's message is a worse outcome than
 * letting one extra submission past, and this is a contact form, not a login.
 */
async function underRateLimit(env: Env, ip: string): Promise<boolean> {
  if (!env.RATE_LIMIT) return true;
  try {
    const key = await ipKey(ip);
    const count = Number((await env.RATE_LIMIT.get(key)) ?? '0');
    if (count >= RATE_LIMIT_MAX) return false;
    await env.RATE_LIMIT.put(key, String(count + 1), { expirationTtl: RATE_LIMIT_WINDOW_SECONDS });
    return true;
  } catch {
    return true;
  }
}

/* ------------------------------------------------------------------ handler */

export async function onRequestPost(context: Context): Promise<Response> {
  const { request, env } = context;

  // Read the body in whichever shape the caller sent it.
  let payload: Record<string, unknown>;
  try {
    const type = request.headers.get('Content-Type') ?? '';
    if (type.includes('application/json')) {
      payload = (await request.json()) as Record<string, unknown>;
    } else {
      payload = Object.fromEntries(await request.formData()) as Record<string, unknown>;
    }
  } catch {
    return reply(request, 400, false, messages.invalid);
  }

  // A bot filled the field no human can see. Answer as if it worked, and
  // store nothing — telling a spammer it was caught only helps it adapt.
  if (clean(payload[HONEYPOT], 100) !== '') {
    return reply(request, 200, true, messages.success);
  }

  const service = clean(payload.service, 40);
  const budget = clean(payload.budget, 40);
  const timing = clean(payload.timing, 40);
  const name = clean(payload.name, MAX.name);
  const contact = clean(payload.contact, MAX.contact);
  const message = clean(payload.message, MAX.message);

  const valid =
    allowed.service?.has(service) &&
    allowed.budget?.has(budget) &&
    allowed.timing?.has(timing) &&
    name.length > 0 &&
    contact.length > 0 &&
    looksContactable(contact);

  if (!valid) return reply(request, 422, false, messages.invalid);

  const ip = request.headers.get('CF-Connecting-IP') ?? '0.0.0.0';
  if (!(await underRateLimit(env, ip))) {
    return reply(request, 429, false, messages.tooMany);
  }

  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return reply(request, 500, false, messages.error);
  }

  try {
    const response = await fetch(`${env.SUPABASE_URL}/rest/v1/enquiries`, {
      method: 'POST',
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        service,
        budget,
        timing,
        name,
        contact,
        message: message || null,
        user_agent: clean(request.headers.get('User-Agent'), MAX.userAgent) || null,
      }),
    });

    if (!response.ok) return reply(request, 502, false, messages.error);
  } catch {
    return reply(request, 502, false, messages.error);
  }

  return reply(request, 200, true, messages.success);
}
