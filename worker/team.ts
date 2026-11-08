/**
 * What the team's own tools share — the task list (./tasks.ts) and the
 * Schedule 2 record (./contributions.ts): who is on the team, as shown, and
 * the one Telegram group both speak to. Neither imports the other; each is
 * loaded on its own, walled off in ./index.ts.
 */
import { admin as t } from '../src/content/admin.ts';

/** Someone on the team, as shown: their display name, else their email (editors, migration 0011). */
export interface Person {
  id: string;
  name: string;
}

export interface TeamEnv {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  TELEGRAM_BOT_TOKEN?: string;
  /** The tasks group, apart from the enquiries one. Unset: no team messages, nothing else changes. */
  TELEGRAM_TASKS_CHAT_ID?: string;
}

/** The editors, by name, read with the service key. */
export async function people(env: TeamEnv, fetcher: typeof fetch): Promise<Person[]> {
  const headers = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` };
  const response = await fetcher(`${env.SUPABASE_URL}/rest/v1/editors?select=user_id,email,display_name&order=email`, { headers });
  if (!response.ok) throw new Error(`editors answered ${response.status}`);
  const rows = (await response.json()) as { user_id: string; email: string; display_name: string | null }[];
  return rows.map((row) => ({ id: row.user_id, name: row.display_name?.trim() || row.email }));
}

/** A person as shown — never a bare id: someone no longer an editor is «Хасагдсан хэрэглэгч». */
export const nameOf = (list: Person[], id: string | null) => (id ? (list.find((p) => p.id === id)?.name ?? t.removedPerson) : '—');

export const fill = (template: string, values: Record<string, string>) => template.replace(/\{(\w+)\}/g, (all, key) => values[key] ?? all);

/**
 * One message to the tasks group. Never the enquiries chat, never throws,
 * and with TELEGRAM_TASKS_CHAT_ID unset it is skipped — said in the log, and
 * nothing else changes. Whether it was delivered.
 */
export async function tellTeam(env: TeamEnv, message: string, fetcher: typeof fetch, what: string): Promise<boolean> {
  if (!env.TELEGRAM_TASKS_CHAT_ID) {
    console.log(`${what}: skipped — TELEGRAM_TASKS_CHAT_ID is not set`);
    return false;
  }
  return tellChat(env, env.TELEGRAM_TASKS_CHAT_ID, message, fetcher, what);
}

/**
 * One message to one chat — a Member's private chat with the bot, or the
 * tasks group. Never throws; skipped without the bot's token. Whether it was
 * delivered.
 */
export async function tellChat(env: TeamEnv, chatId: string, message: string, fetcher: typeof fetch, what: string): Promise<boolean> {
  if (!env.TELEGRAM_BOT_TOKEN) {
    console.log(`${what}: skipped — TELEGRAM_BOT_TOKEN is not set`);
    return false;
  }
  try {
    const response = await fetcher(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: message }),
    });
    console.log(`${what}: ${response.ok ? 'sent' : `FAILED — Telegram answered ${response.status}`}`);
    return response.ok;
  } catch (error) {
    console.error(`${what}: FAILED — ${(error as Error)?.message ?? error}`);
    return false;
  }
}
