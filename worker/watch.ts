/**
 * What the Worker's schedule watches, every 15 minutes, after the buffer
 * drains (./index.ts > scheduled):
 *
 *   flagged enquiries  at most one message an hour — «Шалгах: N шинэ», and
 *                      nothing else. They are stored and listed like any
 *                      other; they just do not each ring the team's phone:
 *                      Telegram is the only channel until the domain exists,
 *                      and a channel full of bots is how a real enquiry is
 *                      missed. An enquiry with nothing to check is still
 *                      told at once (./enquiry.ts).
 *   a flood            one message the day the stored enquiries pass
 *                      FLOOD_AT, and not again that day. The rate limiter
 *                      is the only bound on the table and it fails open, so
 *                      a flood has to be seen rather than stopped.
 *   a stuck enquiry    one waiting in the buffer over STUCK_AFTER_MS: the
 *                      drain has failed on it every pass since — a paused
 *                      project, a revoked grant, a column the table does not
 *                      have yet. A worker_alerts row (drain-stuck) on every
 *                      pass while it lasts, so the admin's status line says
 *                      so, with Supabase's own reason; one Telegram line,
 *                      again a day later if it is still stuck; and the row
 *                      cleared once the buffer is empty. Runs with or without
 *                      a database: a project with its keys gone or paused is
 *                      exactly when the admin cannot be read and Telegram is
 *                      the one who says.
 *
 * Counts are exact: read from the table (as the drain has just filled it)
 * plus whatever still waits in the buffer. The "already sent" marks live in
 * KV beside the buffer. Without Supabase or the buffer it says why and
 * waits for the next run; it never throws.
 */
import { admin as t } from '../src/content/admin.ts';
import { clearAlert, raiseAlert } from './alerts.ts';
import { tell, type Drained, type Env } from './enquiry.ts';

export const DIGEST_EVERY_MS = 60 * 60 * 1000;
export const FLOOD_AT = 50;
export const STUCK_AFTER_MS = 60 * 60 * 1000;
/** Telegram was told of this episode (24 h, so a long one is told again a day on). */
const STUCK_MARK = 'notify:stuck-at';
/** A drain-stuck worker_alerts row stands, to clear when the buffer empties. */
const STUCK_RAISED = 'alert:stuck-raised';
/** Ulaanbaatar is UTC+8 all year; "the day" is the studio's. */
const UB_OFFSET_MS = 8 * 60 * 60 * 1000;
const DIGEST_MARK = 'notify:digest-at';
const floodMark = (day: string) => `notify:flood:${day}`;
const EMPTY = '%7B%7D'; // {} — no field to check

const service = (env: Env) => ({
  apikey: env.SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
});

/** How many enquiries match, counted by PostgREST without sending any. */
async function count(env: Env, where: string, fetcher: typeof fetch): Promise<number> {
  const response = await fetcher(`${env.SUPABASE_URL}/rest/v1/enquiries?select=id&${where}&limit=1`, {
    headers: { ...service(env), Prefer: 'count=exact' },
  });
  if (!response.ok) throw new Error(`enquiries answered ${response.status}`);
  // "0-0/57", or "*/0" when none match.
  const total = Number((response.headers.get('Content-Range') ?? '').split('/')[1]);
  if (!Number.isFinite(total)) throw new Error('no count in Content-Range');
  return total;
}

/** The studio's calendar day, and when it began, in UTC. */
export function ubDay(now: Date): { day: string; start: Date } {
  const local = new Date(now.getTime() + UB_OFFSET_MS);
  const day = local.toISOString().slice(0, 10);
  return { day, start: new Date(Date.parse(`${day}T00:00:00Z`) - UB_OFFSET_MS) };
}

/** When each buffered enquiry arrived: their keys carry it (./enquiry.ts > buffer). */
async function arrivals(env: Env): Promise<number[]> {
  if (!env.ENQUIRY_BUFFER) return [];
  const times: number[] = [];
  let cursor: string | undefined;
  do {
    const page = await env.ENQUIRY_BUFFER.list({ prefix: 'enquiry:', cursor });
    for (const { name } of page.keys) times.push(Date.parse(name.slice('enquiry:'.length, name.lastIndexOf('-'))));
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return times;
}

/** Buffered enquiries that arrived since `since`. */
const bufferedSince = async (env: Env, since: Date) => (await arrivals(env)).filter((time) => time >= since.getTime()).length;

export async function digest(env: Env, now: Date, fetcher: typeof fetch = fetch): Promise<string> {
  const kv = env.ENQUIRY_BUFFER;
  if (!kv) return 'skipped — no ENQUIRY_BUFFER to remember the last digest';
  const last = await kv.get(DIGEST_MARK);
  if (last && now.getTime() - Date.parse(last) < DIGEST_EVERY_MS) return 'not due — one went out within the hour';
  const since = last ?? new Date(now.getTime() - DIGEST_EVERY_MS).toISOString();
  const n = await count(env, `status=eq.new&unrecognised=neq.${EMPTY}&created_at=gt.${encodeURIComponent(since)}`, fetcher);
  if (n === 0) return 'nothing flagged since the last digest';
  // «Шалгах: N шинэ», and nothing else. Marked only once a channel took it:
  // with none, the next run tries again, counting from the last one sent.
  if (!(await tell(env, t.notify.digest.replace('{n}', String(n)), '', 'enquiry digest'))) return `not sent — ${n} flagged, no channel took it; tried again next run`;
  await kv.put(DIGEST_MARK, now.toISOString());
  return `sent — ${n} flagged`;
}

export async function flood(env: Env, now: Date, fetcher: typeof fetch = fetch): Promise<string> {
  const kv = env.ENQUIRY_BUFFER;
  if (!kv) return 'skipped — no ENQUIRY_BUFFER to remember it was sent';
  const { day, start } = ubDay(now);
  if (await kv.get(floodMark(day))) return `already sent for ${day}`;
  const stored = (await count(env, `created_at=gte.${encodeURIComponent(start.toISOString())}`, fetcher)) + (await bufferedSince(env, start));
  if (stored <= FLOOD_AT) return `${stored} today`;
  if (!(await tell(env, t.notify.flood.replace('{n}', String(stored)), '', 'enquiry flood'))) return `not sent — ${stored} today, no channel took it; tried again next run`;
  await kv.put(floodMark(day), now.toISOString(), { expirationTtl: 2 * 24 * 60 * 60 });
  return `sent — ${stored} today`;
}

/**
 * What still waits in the buffer after the drain, and for how long. An
 * enquiry there is safe, but no person can see it — so past an hour it is
 * said: a worker_alerts row every pass (its last_at stays fresh while it
 * lasts), Telegram once and again a day later, and the row cleared when
 * nothing waits. `drained.why` is Supabase's own reason, from the drain.
 */
export async function stuck(env: Env, now: Date, drained?: Drained, fetcher: typeof fetch = fetch): Promise<string> {
  const kv = env.ENQUIRY_BUFFER;
  if (!kv) return 'skipped — no ENQUIRY_BUFFER';
  const times = await arrivals(env);
  const waiting = times.filter((time) => now.getTime() - time > STUCK_AFTER_MS);
  if (waiting.length === 0) {
    // Over: the admin stops saying so, and the next time is told afresh.
    // The alert's own mark, not Telegram's: an episode no channel heard still
    // raised the row, and the row must go.
    const raised = await kv.get(STUCK_RAISED);
    if (raised || (await kv.get(STUCK_MARK))) {
      await kv.delete(STUCK_MARK);
      await kv.delete(STUCK_RAISED);
      if (raised) await clearAlert(env, 'drain-stuck', fetcher);
      return `cleared — ${times.length} buffered, none over an hour`;
    }
    return `${times.length} buffered, none over an hour`;
  }
  const oldest = new Date(Math.min(...waiting)).toISOString();
  const detail = `${waiting.length} enquiries waiting in the buffer over an hour, the oldest since ${oldest}. ${drained?.why ? `Last refusal: ${drained.why}` : 'The drain gave no reason — is it running?'}`;
  await raiseAlert(env, 'drain-stuck', detail, fetcher);
  await kv.put(STUCK_RAISED, now.toISOString());
  if (await kv.get(STUCK_MARK)) return `alert refreshed — ${detail}`;
  // Marked told only once a channel took it: with none, the next pass tries again.
  if (!(await tell(env, t.notify.stuck.replace('{n}', String(waiting.length)), '', 'enquiry stuck'))) return `alert raised, not told — no channel took it; tried again next run — ${detail}`;
  await kv.put(STUCK_MARK, now.toISOString(), { expirationTtl: 24 * 60 * 60 });
  return `told — ${detail}`;
}

/**
 * Every watch, each on its own: one failing never keeps another from
 * running. `drained` is what the drain just did (./index.ts > scheduled).
 */
export async function watch(
  env: Env,
  now = new Date(),
  fetcher: typeof fetch = fetch,
  drained?: Drained
): Promise<{ digest: string; flood: string; stuck: string }> {
  const run = async (name: string, job: () => Promise<string>) => {
    try {
      const said = await job();
      console.log(`enquiry ${name}: ${said}`);
      return said;
    } catch (error) {
      const said = `failed — ${(error as Error).message}`;
      console.error(`enquiry ${name}: ${said}`);
      return said;
    }
  };
  // Needs no database: a project paused or its keys gone is when Telegram is the one who says.
  const stuckSaid = await run('stuck', () => stuck(env, now, drained, fetcher));
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return { digest: 'skipped — no database', flood: 'skipped — no database', stuck: stuckSaid };
  return { digest: await run('digest', () => digest(env, now, fetcher)), flood: await run('flood', () => flood(env, now, fetcher)), stuck: stuckSaid };
}
