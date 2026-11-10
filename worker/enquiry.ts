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
 *
 * And no visitor input may cause one not to be stored. Nothing a visitor
 * types, picks or leaves out is refused: a chip that is not one of the
 * published form's, a contact that is neither an email nor a phone number,
 * an empty name — each is stored as sent, and named in the row's
 * `unrecognised` so the team knows to look. The text is made storable first
 * (no NUL, no broken character) and cut to what its column holds — the
 * User-Agent header too — so the table can never refuse what the Worker
 * sends. A cut is never silent: a form field's is flagged, the User-Agent's
 * only noted (`diagnostics`), since a long one says nothing about the
 * visitor. Only the honeypot and the rate limit keep an enquiry out,
 * and both are defences against bots, not readings of a visitor's answers.
 * Even a body that cannot be read is stored: its raw text in the message,
 * flagged 'body'. Nothing about a request's shape discards it — a shape
 * that did would let anyone who had read this code drop an enquiry on
 * purpose. The one request that is not stored is the health check, and it
 * is known by a credential (HEALTH_CHECK_SECRET), never by what it looks
 * like. scripts/test-enquiry.ts holds the line with a few hundred hostile
 * inputs.
 */

// Explicit .ts extension: esbuild (Wrangler, Astro) and Node's own type
// stripping both resolve it, so the test harness can import this file directly.
import { site } from '../src/content/site.ts';
import { ENQUIRY_MAX } from '../src/lib/enquiry-limits.ts';
import { raiseAlert } from './alerts.ts';
import { answer, same } from './auth.ts';
import { fit } from './text.ts';

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
  /**
   * Sender: an address on send.aniragency.mn, the domain verified in Resend
   * (wrangler.jsonc > vars). Unset, Resend's test sender — which a key
   * restricted to that domain refuses, so email would fail (and only email).
   */
  NOTIFY_FROM?: string;
  /** Chat notification through a Telegram bot. */
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
  /**
   * The health check's credential (scripts/test-headers.mjs). A request that
   * carries it in X-Health-Check is answered and stored nowhere; a request
   * without it — whatever its body — is an enquiry. Unset: no health check.
   */
  HEALTH_CHECK_SECRET?: string;
}

interface Context {
  request: Request;
  env: Env;
  /** Keeps work running after the reply. Without it, the work is awaited. */
  waitUntil?: (promise: Promise<unknown>) => void;
}

const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_SECONDS = 60 * 60;

const messages = site.contact.form.messages;

/** The form's chip values, taken from the same published source the form
 *  renders from — so the check cannot drift from the options. */
const allowed: Record<string, Set<string>> = Object.fromEntries(
  site.contact.form.groups.map((group) => [group.name, new Set(group.options.map((o) => o.value))])
);

/** The questions with a column of their own; any other the admin adds goes in `answers`. */
const COLUMNS = ['service', 'budget', 'timing'] as const;

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
:root{--ink:#08090b;--paper:#eef0f3;--dim:#7c828b;--orange:#f30}
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

// Text made storable and cut to fit, in characters as the table counts them (./text.ts).

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
 * But never silently: `open` says why, and the handler logs it and raises an
 * alert the admin shows (./alerts.ts). Now that nothing a visitor sends is
 * refused, this limit is the only bound on the table.
 */
async function rateLimit(env: Env, ip: string): Promise<{ allowed: boolean; open?: string }> {
  if (!env.RATE_LIMIT) return { allowed: true, open: 'RATE_LIMIT is not bound' };
  try {
    const key = await ipKey(ip);
    const count = Number((await env.RATE_LIMIT.get(key)) ?? '0');
    if (count >= RATE_LIMIT_MAX) return { allowed: false };
    await env.RATE_LIMIT.put(key, String(count + 1), { expirationTtl: RATE_LIMIT_WINDOW_SECONDS });
    return { allowed: true };
  } catch (error) {
    return { allowed: true, open: `KV unreachable: ${(error as Error)?.message ?? error}` };
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
  /** Fields that did not look as the form sends them; only when there are any. */
  unrecognised?: string[];
  /** Answers to questions added in the admin; only when there are any. */
  answers?: Record<string, string>;
  /** Notes that route nothing — a cut User-Agent (migration 0008); only when there are any. */
  diagnostics?: string[];
}

type Path = 'live' | 'buffered';

const BUFFER_PREFIX = 'enquiry:';
/** A backstop for a drain that never runs. */
const BUFFER_TTL_SECONDS = 30 * 24 * 60 * 60;

/** Whether Supabase took the row, and if not, why — in words a person can act on. */
async function writeToSupabase(env: Env, row: Enquiry, { drained = false } = {}): Promise<{ ok: boolean; why?: string }> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return { ok: false, why: 'SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set' };
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
    if (response.ok) return { ok: true };
    // PostgREST names the refusal in `code` and `message`; its `details` would
    // repeat the visitor's row, so that stays out of logs and alerts.
    const said = (await response.json().catch(() => ({}))) as { code?: unknown; message?: unknown };
    return { ok: false, why: `Supabase answered ${response.status}${said.code ? ` ${said.code}` : ''}${said.message ? `: ${said.message}` : ''}` };
  } catch (error) {
    return { ok: false, why: `Supabase unreachable: ${(error as Error)?.message ?? error}` };
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

export interface Drained {
  buffered: number;
  written: number;
  kept: number;
  /** Why the last entry kept was kept — Supabase's own words — for the watch's alert (./watch.ts > stuck). */
  why?: string;
}

/**
 * Moves every buffered enquiry into Supabase, deleting each once it is in.
 * Run on a schedule (worker/index.ts). Idempotent: an entry that fails to
 * write stays for the next run, and one written but not deleted is skipped
 * by its id when it comes round again. Never throws, so the watch after it
 * always runs: it is the watch that tells a person when an enquiry has
 * waited too long (./watch.ts > stuck), and why, from `why` here.
 */
export async function drain(env: Env): Promise<Drained> {
  if (!env.ENQUIRY_BUFFER) {
    console.warn('enquiry drain: ENQUIRY_BUFFER is not bound');
    return { buffered: 0, written: 0, kept: 0 };
  }
  const keys: string[] = [];
  let cursor: string | undefined;
  try {
    do {
      const page = await env.ENQUIRY_BUFFER.list({ prefix: BUFFER_PREFIX, cursor });
      keys.push(...page.keys.map((key) => key.name));
      cursor = page.list_complete ? undefined : page.cursor;
    } while (cursor);
  } catch (error) {
    const why = `the buffer could not be listed: ${(error as Error)?.message ?? error}`;
    console.error(`enquiry drain: ${why}`);
    return { buffered: 0, written: 0, kept: 0, why };
  }

  let written = 0;
  let why: string | undefined;
  for (const key of keys) {
    let value: string | null;
    try {
      value = await env.ENQUIRY_BUFFER.get(key);
    } catch (error) {
      why = `${key} could not be read: ${(error as Error)?.message ?? error}`;
      continue;
    }
    if (!value) continue;
    let row: Enquiry;
    try {
      row = JSON.parse(value) as Enquiry;
    } catch {
      why = `${key} is not valid JSON; left in place`;
      console.error(`enquiry drain: ${why}`);
      continue;
    }
    const write = await writeToSupabase(env, row, { drained: true });
    if (!write.ok) {
      why = write.why;
      continue;
    }
    written += 1;
    try {
      await env.ENQUIRY_BUFFER.delete(key);
    } catch {
      // Written but not deleted: the next run skips it by id.
    }
  }

  const result: Drained = { buffered: keys.length, written, kept: keys.length - written, ...(why ? { why } : {}) };
  console.log(
    `enquiry drain: ${result.buffered} buffered, ${result.written} written to Supabase, ${result.kept} kept for the next run${why ? ` — last kept because ${why}` : ''}`
  );
  return result;
}

/* ------------------------------------------------------------- notification */

const labelFor = (group: string, value: string) =>
  site.contact.form.groups.find((g) => g.name === group)?.options.find((o) => o.value === value)?.label ?? value;
const legendFor = (group: string) => site.contact.form.groups.find((g) => g.name === group)?.legend ?? group;

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
    ...Object.entries(row.answers ?? {}).map(([group, value]) => `${legendFor(group)}: ${labelFor(group, value)}`),
    ...(row.unrecognised?.length ? ['', `CHECK: ${row.unrecognised.join(', ')} did not look as the form sends it — stored as sent.`] : []),
    ...(row.message ? ['', row.message] : []),
  ].join('\n');
}

/**
 * Tells the team an enquiry arrived — by email through Resend, by Telegram,
 * or both, whichever has its secrets set. Runs after the reply, and no
 * failure here can reach the visitor: the enquiry is already safe.
 *
 * Only an enquiry with nothing to check is told at once. A flagged one —
 * almost always a bot's, now that nothing is refused — is stored the same,
 * and told in the hourly digest instead (./watch.ts): Telegram is the only
 * channel until the domain exists, and a channel full of bots is how a real
 * enquiry gets missed.
 */
export async function notify(env: Env, row: Enquiry, path: Path): Promise<void> {
  const subject = `New enquiry from ${row.name}${path === 'buffered' ? ' (buffered)' : ''}`;
  await tell(env, subject, describe(row, path), `enquiry notification (${path})`);
}

/**
 * One message on every channel that has its secrets set. Never throws.
 * Whether any channel took it: with none configured — TELEGRAM_BOT_TOKEN
 * unset, as production has run for weeks — it logs "no channel configured"
 * and answers false, so a caller that remembers "already sent" (./watch.ts)
 * only remembers what was.
 */
export async function tell(env: Env, subject: string, text: string, what: string): Promise<boolean> {
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
          text: text || subject,
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
        // A message with no body — the digest — is its one line, nothing else.
        body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text: text ? `${subject}\n\n${text}` : subject }),
      }),
    ]);
  }

  if (sends.length === 0) {
    console.warn(`${what}: no channel configured. Set RESEND_API_KEY + NOTIFY_EMAIL or TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID.`);
    return false;
  }
  const results = await Promise.allSettled(sends.map(([, send]) => send));
  let delivered = false;
  results.forEach((result, i) => {
    const sent = result.status === 'fulfilled' && result.value.ok;
    delivered ||= sent;
    console.log(`${what} via ${sends[i][0]}: ${sent ? 'sent' : 'FAILED'}`);
  });
  return delivered;
}

/**
 * GET /api/health — liveness, for the holder of the health-check secret
 * only, and nothing else: no body is read, nothing is stored, and the
 * answer says nothing about the Worker beyond "yes". The health check asks
 * this first and only posts its enquiry-shaped request on a yes — so a check
 * pointed at a Worker without the secret, or with another one, cannot leave
 * a junk enquiry behind.
 *
 * Every way of not holding the secret — none sent, a wrong one, none set
 * here — gets the one same refusal, and the comparison runs either way, so
 * neither the status, the body nor the time taken says whether a secret is
 * set. No version, no environment, no table state: ever.
 */
export async function onHealth(request: Request, env: Env): Promise<Response> {
  const probe = request.headers.get('X-Health-Check') ?? '';
  const holds = await same(probe, env.HEALTH_CHECK_SECRET ?? '');
  if (!env.HEALTH_CHECK_SECRET || !probe || !holds) return answer(401, { ok: false });
  return answer(200, { ok: true });
}

/* ------------------------------------------------------------------ handler */

export async function onRequestPost(context: Context): Promise<Response> {
  const { request, env } = context;

  // The health check, known by its credential and nothing else: answered,
  // stored nowhere, counted against no one. Without the right secret it is
  // an enquiry like any other.
  const probe = request.headers.get('X-Health-Check');
  if (probe && env.HEALTH_CHECK_SECRET && (await same(probe, env.HEALTH_CHECK_SECRET))) {
    return json(200, { ok: true, check: 'nothing stored' });
  }

  // Read the body in whichever shape the caller sent it. One that cannot be
  // read is kept as it came, to store in the message.
  const type = request.headers.get('Content-Type') ?? '';
  let raw = '';
  try {
    raw = await request.text();
  } catch {
    /* a body that broke off: stored empty, flagged */
  }
  let payload: Record<string, unknown> = {};
  let unreadable = '';
  try {
    if (type.includes('application/json')) {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) payload = parsed as Record<string, unknown>;
      else unreadable = raw;
    } else if (type.includes('multipart/form-data') || type.includes('application/x-www-form-urlencoded')) {
      payload = Object.fromEntries(await new Response(raw, { headers: { 'Content-Type': type } }).formData()) as Record<string, unknown>;
    } else if (raw) {
      unreadable = raw;
    }
  } catch {
    unreadable = raw;
  }

  // A bot filled the field no human can see. Answer as if it worked, and
  // store nothing — telling a spammer it was caught only helps it adapt.
  if (fit(payload[HONEYPOT], 100).text !== '') {
    return reply(request, 200, true, messages.success);
  }

  // Every value cut to what its column holds — never refused, since a value
  // the table refuses loses the whole enquiry. What came longer is kept to
  // its limit and said: `cut:<field>:<characters it came with>`. For these
  // fields that is a flag: the form's maxlength keeps a browser inside them,
  // so a cut means the enquiry did not come from the form.
  const cut: string[] = [];
  const take = (field: string, value: unknown, max: number) => {
    const { text, cutFrom } = fit(value, max);
    if (cutFrom !== undefined) cut.push(`cut:${field}:${cutFrom}`);
    return text;
  };

  const [service, budget, timing] = COLUMNS.map((group) => take(group, payload[group], ENQUIRY_MAX.choice));
  const name = take('name', payload.name, ENQUIRY_MAX.name);
  const contact = take('contact', payload.contact, ENQUIRY_MAX.contact);
  // An unreadable body's own text, where the message would be: whatever it said is kept.
  const message = take('message', payload.message, ENQUIRY_MAX.message) || take('message', unreadable, ENQUIRY_MAX.message);
  // A header, not a form field, and no evidence about the visitor: in-app
  // browsers run long. Its own fit, so a cut is only ever a note on the row
  // (`diagnostics`) — never a flag, never «Шалгах», never a held-back message.
  const agent = fit(request.headers.get('User-Agent'), ENQUIRY_MAX.user_agent);
  const diagnostics = agent.cutFrom === undefined ? [] : [`cut:user_agent:${agent.cutFrom}`];

  // Checked against the published form, and never refused: what does not
  // match is stored as sent, and named.
  const unrecognised: string[] = [];
  const answers: Record<string, string> = {};
  for (const group of site.contact.form.groups) {
    const value = (COLUMNS as readonly string[]).includes(group.name)
      ? ({ service, budget, timing } as Record<string, string>)[group.name]
      : (answers[group.name] = take(group.name, payload[group.name], ENQUIRY_MAX.choice));
    if (!allowed[group.name]?.has(value)) unrecognised.push(group.name);
  }
  // A question the admin removed is simply blank: nothing to check.
  if (unreadable) unrecognised.unshift('body');
  if (!name) unrecognised.push('name');
  if (!contact || !looksContactable(contact)) unrecognised.push('contact');
  // The form's own maxlength keeps a person inside every limit; past one, it did not come from the form.
  unrecognised.push(...cut);

  const ip = request.headers.get('CF-Connecting-IP') ?? '0.0.0.0';
  const limit = await rateLimit(env, ip);
  if (!limit.allowed) {
    return reply(request, 429, false, messages.tooMany);
  }
  // Let through because the limiter could not count: said, never silent.
  if (limit.open) {
    const raised = raiseAlert(env, 'limiter-open', limit.open);
    if (context.waitUntil) context.waitUntil(raised);
    else await raised;
  }

  const row: Enquiry = {
    service,
    budget,
    timing,
    name,
    contact,
    message: message || null,
    user_agent: agent.text || null,
    // Only when there is something to say: an ordinary enquiry is the same
    // row it always was, and stores even before migration 0005.
    ...(unrecognised.length ? { unrecognised } : {}),
    ...(Object.keys(answers).length ? { answers } : {}),
    ...(diagnostics.length ? { diagnostics } : {}),
  };

  // Supabase, or failing that the KV buffer. Only when neither kept it is the
  // visitor told something went wrong — and then nothing was kept.
  let path: Path;
  const live = await writeToSupabase(env, row);
  if (live.ok) {
    path = 'live';
  } else if (await buffer(env, row)) {
    path = 'buffered';
    console.warn(`enquiry buffered: Supabase did not take the write — ${live.why}`);
  } else {
    console.error(`enquiry LOST: Supabase and the KV buffer both failed — ${live.why}`);
    return reply(request, 502, false, messages.error);
  }

  // Told at once only when there is nothing to check; flagged ones wait for the hourly digest.
  if (!row.unrecognised?.length) {
    const told = notify(env, row, path).catch(() => {});
    if (context.waitUntil) context.waitUntil(told);
    else await told;
  }

  return reply(request, 200, true, messages.success);
}
