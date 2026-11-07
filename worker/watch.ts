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
 *
 * Counts are exact: read from the table (as the drain has just filled it)
 * plus whatever still waits in the buffer. The "already sent" marks live in
 * KV beside the buffer. Without Supabase or the buffer it says why and
 * waits for the next run; it never throws.
 */
import { admin as t } from '../src/content/admin.ts';
import { tell, type Env } from './enquiry.ts';

export const DIGEST_EVERY_MS = 60 * 60 * 1000;
export const FLOOD_AT = 50;
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

/** Buffered enquiries that arrived since `since`: their keys carry their arrival (./enquiry.ts > buffer). */
async function bufferedSince(env: Env, since: Date): Promise<number> {
  if (!env.ENQUIRY_BUFFER) return 0;
  let n = 0;
  let cursor: string | undefined;
  do {
    const page = await env.ENQUIRY_BUFFER.list({ prefix: 'enquiry:', cursor });
    for (const { name } of page.keys) if (Date.parse(name.slice('enquiry:'.length, name.lastIndexOf('-'))) >= since.getTime()) n += 1;
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return n;
}

export async function digest(env: Env, now: Date, fetcher: typeof fetch = fetch): Promise<string> {
  const kv = env.ENQUIRY_BUFFER;
  if (!kv) return 'skipped — no ENQUIRY_BUFFER to remember the last digest';
  const last = await kv.get(DIGEST_MARK);
  if (last && now.getTime() - Date.parse(last) < DIGEST_EVERY_MS) return 'not due — one went out within the hour';
  const since = last ?? new Date(now.getTime() - DIGEST_EVERY_MS).toISOString();
  const n = await count(env, `status=eq.new&unrecognised=neq.${EMPTY}&created_at=gt.${encodeURIComponent(since)}`, fetcher);
  if (n === 0) return 'nothing flagged since the last digest';
  // «Шалгах: N шинэ», and nothing else.
  await tell(env, t.notify.digest.replace('{n}', String(n)), '', 'enquiry digest');
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
  await tell(env, t.notify.flood.replace('{n}', String(stored)), '', 'enquiry flood');
  await kv.put(floodMark(day), now.toISOString(), { expirationTtl: 2 * 24 * 60 * 60 });
  return `sent — ${stored} today`;
}

/** Both watches, each on its own: one failing never keeps the other from running. */
export async function watch(env: Env, now = new Date(), fetcher: typeof fetch = fetch): Promise<{ digest: string; flood: string }> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return { digest: 'skipped — no database', flood: 'skipped — no database' };
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
  return { digest: await run('digest', () => digest(env, now, fetcher)), flood: await run('flood', () => flood(env, now, fetcher)) };
}
