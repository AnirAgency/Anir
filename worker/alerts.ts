/**
 * What the Worker needs a person to know, kept where the admin can show it.
 *
 * raiseAlert writes one row per kind of trouble — its last occurrence — to
 * public.worker_alerts (supabase/migrations/0006) with the service_role key,
 * and logs it, so it is in the Worker's logs even when Supabase is not
 * there to write to. GET /api/alerts hands the rows to the admin, editors
 * only (./auth.ts), and the admin puts a recent one on its status line, as
 * it does a failed publish.
 *
 * The kinds are listed here, not in the table (migration 0007 dropped its
 * check): a kind the table did not know would have been refused, silently,
 * in the one place meant to make failures seen. A kind missing from this
 * list is recorded all the same, and the admin shows a kind it has no words
 * for rather than hiding it.
 */
import { answer, callerOf, refusal } from './auth.ts';
import { fit } from './text.ts';

export interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

/**
 * Every kind of trouble the Worker raises. Add a kind here, and its words in
 * src/content/admin.ts > alerts.
 *
 *   limiter-open  the contact form's rate limiter let everything through
 *                 because it could not reach KV (./enquiry.ts).
 *   drain-stuck   an enquiry has waited in the KV buffer over an hour:
 *                 Supabase will not take it — paused, a revoked grant, a
 *                 schema behind the Worker (./watch.ts > stuck). Cleared
 *                 when the buffer empties.
 */
export const ALERT_KINDS = ['limiter-open', 'drain-stuck'] as const;
export type AlertKind = (typeof ALERT_KINDS)[number];

const service = (env: Env) => ({
  apikey: env.SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
});

/** Logs it, then records it for the admin. Never throws: an alert must not cost an enquiry. */
export async function raiseAlert(env: Env, kind: AlertKind, detail: string, fetcher: typeof fetch = fetch): Promise<void> {
  console.error(`enquiry ALERT ${kind}: ${detail}`);
  // Checked here, never refused: an unlisted kind is still trouble someone should hear of.
  if (!(ALERT_KINDS as readonly string[]).includes(kind)) console.error(`enquiry ALERT ${kind}: not in ALERT_KINDS — recorded all the same`);
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return;
  try {
    const response = await fetcher(`${env.SUPABASE_URL}/rest/v1/worker_alerts`, {
      method: 'POST',
      headers: { ...service(env), 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
      // Cut as the column counts, never inside a character: a split emoji would make Postgres refuse the alert itself.
      body: JSON.stringify({ kind, last_at: new Date().toISOString(), detail: fit(detail, 500).text }),
    });
    if (!response.ok) console.error(`enquiry ALERT ${kind}: not recorded — worker_alerts answered ${response.status}`);
  } catch (error) {
    console.error(`enquiry ALERT ${kind}: not recorded — ${(error as Error).message}`);
  }
}

/** The trouble is over — for a kind that is a state, not an event (drain-stuck). Never throws. */
export async function clearAlert(env: Env, kind: AlertKind, fetcher: typeof fetch = fetch): Promise<void> {
  console.log(`enquiry ALERT ${kind}: cleared`);
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return;
  try {
    const response = await fetcher(`${env.SUPABASE_URL}/rest/v1/worker_alerts?kind=eq.${encodeURIComponent(kind)}`, {
      method: 'DELETE',
      headers: { ...service(env), Prefer: 'return=minimal' },
    });
    if (!response.ok) console.error(`enquiry ALERT ${kind}: not cleared — worker_alerts answered ${response.status}`);
  } catch (error) {
    console.error(`enquiry ALERT ${kind}: not cleared — ${(error as Error).message}`);
  }
}

/** GET /api/alerts — the rows, for an editor's admin. */
export async function onAlerts(request: Request, env: Env, fetcher: typeof fetch = fetch): Promise<Response> {
  let caller;
  try {
    caller = await callerOf(request, fetcher);
  } catch {
    return answer(502, { ok: false, error: 'supabase' });
  }
  const refused = refusal(caller);
  if (refused) return refused;
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return answer(503, { ok: false, error: 'not-configured' });
  try {
    const response = await fetcher(`${env.SUPABASE_URL}/rest/v1/worker_alerts?select=kind,last_at,detail`, { headers: service(env) });
    if (!response.ok) return answer(502, { ok: false, error: 'supabase', detail: `worker_alerts answered ${response.status}` });
    return answer(200, { ok: true, alerts: await response.json() });
  } catch {
    return answer(502, { ok: false, error: 'supabase' });
  }
}
