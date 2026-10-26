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
 * the worker stays a few kB and the project keeps its "lenis, nothing else"
 * runtime dependency list.
 *
 * It must never lose an enquiry. If Supabase does not take the row — paused
 * project, outage, network, a bad key — the enquiry is buffered in KV and the
 * visitor is told it arrived, because it did; a scheduled drain moves it on
 * (drain, below). Only if both stores fail does the visitor see an error. And
 * every enquiry tells the team it arrived, saying which path it took, so a
 * quiet week is distinguishable from a broken one (notify, below).
 */

// Explicit .ts extension: esbuild (Wrangler, Astro) and Node's own type
// stripping both resolve it, so the test harness can import this file directly.
import { site } from '../src/content/site.ts';

interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
  list(options: { prefix: string; cursor?: string }): Promise<{
    keys: { name: string }[];
    list_complete: boolean;
    cursor?: string;
  }>;
}

export interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  /** Optional. Without it, rate limiting is skipped — see underRateLimit. */
  RATE_LIMIT?: KVNamespace;
  /** Where an enquiry waits when Supabase will not take it — see buffer. */
  ENQUIRY_BUFFER?: KVNamespace;
  /** Email notification through Resend: the key, and comma-separated recipients. */
  RESEND_API_KEY?: string;
  NOTIFY_EMAIL?: string;
  /** Sender. Defaults to Resend's test sender until a domain is verified. */
  NOTIFY_FROM?: string;
  /** Chat notification through a Telegram bot. */
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
}

interface Context {
  request: Request;
  env: Env;
  /** Keeps work running after the reply. Without it, the work is awaited. */
  waitUntil?: (promise: Promise<unknown>) => void;
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

/* ------------------------------------------------------------------ storage */

/** One enquiry, as Supabase stores it. id and created_at are set only when it
 *  is buffered: a drained row keeps its real arrival time, and writing it
 *  twice cannot make two rows. */
interface Enquiry {
  id?: string;
  created_at?: string;
  service: string;
  budget: string;
  timing: string;
  name: string;
  contact: string;
  message: string | null;
  user_agent: string | null;
}

type Path = 'live' | 'buffered';

const BUFFER_PREFIX = 'enquiry:';
/** A backstop for a drain that never runs. */
const BUFFER_TTL_SECONDS = 30 * 24 * 60 * 60;

async function writeToSupabase(env: Env, row: Enquiry, { drained = false } = {}): Promise<boolean> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return false;
  try {
    const response = await fetch(`${env.SUPABASE_URL}/rest/v1/enquiries`, {
      method: 'POST',
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        // A drained row carries its own id; if it is already in, skip it.
        Prefer: drained ? 'return=minimal,resolution=ignore-duplicates' : 'return=minimal',
      },
      body: JSON.stringify(row),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * The safety net: an enquiry Supabase would not take goes to KV instead. It
 * has already passed validation and the rate limit, so the buffer only ever
 * holds enquiries that would have been accepted.
 */
async function buffer(env: Env, row: Enquiry): Promise<boolean> {
  if (!env.ENQUIRY_BUFFER) return false;
  const now = new Date().toISOString();
  const entry: Enquiry = { ...row, id: crypto.randomUUID(), created_at: now };
  try {
    await env.ENQUIRY_BUFFER.put(`${BUFFER_PREFIX}${now}-${entry.id!.slice(0, 8)}`, JSON.stringify(entry), {
      expirationTtl: BUFFER_TTL_SECONDS,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Moves every buffered enquiry into Supabase, deleting each once it is in.
 * Run on a schedule (worker/index.ts). Idempotent: an entry that fails to
 * write stays for the next run, and one written but not deleted is skipped
 * by its id when it comes round again.
 */
export async function drain(env: Env): Promise<{ buffered: number; written: number; kept: number }> {
  if (!env.ENQUIRY_BUFFER) {
    console.warn('enquiry drain: ENQUIRY_BUFFER is not bound');
    return { buffered: 0, written: 0, kept: 0 };
  }
  const keys: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await env.ENQUIRY_BUFFER.list({ prefix: BUFFER_PREFIX, cursor });
    keys.push(...page.keys.map((key) => key.name));
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);

  let written = 0;
  for (const key of keys) {
    const value = await env.ENQUIRY_BUFFER.get(key);
    if (!value) continue;
    let row: Enquiry;
    try {
      row = JSON.parse(value) as Enquiry;
    } catch {
      console.error(`enquiry drain: ${key} is not valid JSON; left in place`);
      continue;
    }
    if (!(await writeToSupabase(env, row, { drained: true }))) continue;
    written += 1;
    try {
      await env.ENQUIRY_BUFFER.delete(key);
    } catch {
      // Written but not deleted: the next run skips it by id.
    }
  }

  const result = { buffered: keys.length, written, kept: keys.length - written };
  console.log(
    `enquiry drain: ${result.buffered} buffered, ${result.written} written to Supabase, ${result.kept} kept for the next run`
  );
  return result;
}

/* ------------------------------------------------------------- notification */

const labelFor = (group: string, value: string) =>
  site.contact.form.groups.find((g) => g.name === group)?.options.find((o) => o.value === value)?.label ?? value;

/** The team's copy. Plain text, so a submitted message can never be markup. */
function describe(row: Enquiry, path: Path) {
  const where =
    path === 'live'
      ? 'Stored in Supabase.'
      : 'BUFFERED in Cloudflare KV: Supabase did not take it (paused project? outage?). ' +
        'The drain retries every 15 minutes; if the project is paused, restore it.';
  return [
    where,
    '',
    `Name:    ${row.name}`,
    `Contact: ${row.contact}`,
    `Service: ${labelFor('service', row.service)}`,
    `Budget:  ${labelFor('budget', row.budget)}`,
    `Timing:  ${labelFor('timing', row.timing)}`,
    ...(row.message ? ['', row.message] : []),
  ].join('\n');
}

/**
 * Tells the team an enquiry arrived — by email through Resend, by Telegram,
 * or both, whichever has its secrets set. Runs after the reply, and no
 * failure here can reach the visitor: the enquiry is already safe.
 */
export async function notify(env: Env, row: Enquiry, path: Path): Promise<void> {
  const subject = `New enquiry from ${row.name}${path === 'buffered' ? ' (buffered)' : ''}`;
  const text = describe(row, path);
  const sends: Array<[string, Promise<Response>]> = [];

  if (env.RESEND_API_KEY && env.NOTIFY_EMAIL) {
    sends.push([
      'email',
      fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: env.NOTIFY_FROM || 'Anir site <onboarding@resend.dev>',
          to: env.NOTIFY_EMAIL.split(',').map((address) => address.trim()),
          subject,
          text,
        }),
      }),
    ]);
  }
  if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
    sends.push([
      'telegram',
      fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text: `${subject}\n\n${text}` }),
      }),
    ]);
  }

  if (sends.length === 0) {
    console.warn(`enquiry notification: no channel configured (${path}). Set RESEND_API_KEY + NOTIFY_EMAIL or TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID.`);
    return;
  }
  const results = await Promise.allSettled(sends.map(([, send]) => send));
  results.forEach((result, i) => {
    const sent = result.status === 'fulfilled' && result.value.ok;
    console.log(`enquiry notification via ${sends[i][0]}: ${sent ? 'sent' : 'FAILED'} (${path})`);
  });
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

  const row: Enquiry = {
    service,
    budget,
    timing,
    name,
    contact,
    message: message || null,
    user_agent: clean(request.headers.get('User-Agent'), MAX.userAgent) || null,
  };

  // Supabase, or failing that the KV buffer. Only when neither kept it is the
  // visitor told something went wrong — and then nothing was kept.
  let path: Path;
  if (await writeToSupabase(env, row)) {
    path = 'live';
  } else if (await buffer(env, row)) {
    path = 'buffered';
    console.warn('enquiry buffered: Supabase did not take the write');
  } else {
    console.error('enquiry LOST: Supabase and the KV buffer both failed');
    return reply(request, 502, false, messages.error);
  }

  const told = notify(env, row, path).catch(() => {});
  if (context.waitUntil) context.waitUntil(told);
  else await told;

  return reply(request, 200, true, messages.success);
}
