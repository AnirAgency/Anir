/**
 * The task list's codes and rules, shared by the Worker (worker/tasks.ts) and
 * the admin (src/scripts/admin-tasks.ts) so the two cannot disagree. Stored
 * as codes, shown with Mongolian words (src/content/admin.ts > tasks).
 *
 * Imported by those two only — never by a public page, layout or component
 * (scripts/test-isolation.ts holds it): the task list is coupled one way.
 */

export const TASK_STATES = ['new', 'doing', 'submitted', 'approved'] as const;
export type TaskState = (typeof TASK_STATES)[number];

/** site, Ezmath, Ethos, Olymo, and anything else. */
export const TASK_PROJECTS = ['site', 'ezmath', 'ethos', 'olymo', 'other'] as const;
export type TaskProject = (typeof TASK_PROJECTS)[number];

export type Move = 'start' | 'submit' | 'approve' | 'sendBack' | 'reopen';

/**
 * What may happen to a task, from which states, and who may do it. Anyone
 * may start or submit — someone finishing a colleague's task is normal, and
 * refusing it only makes the data lie. Approving and sending back are the
 * named approver's alone; sending back needs a reason, or people stop using
 * the thing. An approval made by mistake is undone the same way: the
 * approver reopens it to doing, with a reason. Every move is a row in
 * task_events (migration 0011), so none of this rewrites history.
 */
export const MOVES: Record<Move, { from: readonly TaskState[]; to: TaskState; approverOnly: boolean; reason: boolean }> = {
  start: { from: ['new'], to: 'doing', approverOnly: false, reason: false },
  submit: { from: ['new', 'doing'], to: 'submitted', approverOnly: false, reason: false },
  approve: { from: ['submitted'], to: 'approved', approverOnly: true, reason: false },
  sendBack: { from: ['submitted'], to: 'doing', approverOnly: true, reason: true },
  reopen: { from: ['approved'], to: 'doing', approverOnly: true, reason: true },
};

/** What the table holds (supabase/migrations/0010). */
export const TASK_LIMITS = { title: 200, done_means: 1000, reject_reason: 1000 } as const;
/** Guidance in the form, never a limit: a title that reads in a line, a done that reads in a few. */
export const TASK_GUIDE = { title: 80, done_means: 300 } as const;

const plain = (text: string) => text.toLocaleLowerCase('mn').replace(/[^\p{L}\p{N}]+/gu, '');
/** Whether "done means" only says the title again — which leaves nothing to approve against. */
export const repeatsTitle = (title: string, doneMeans: string) => plain(title) !== '' && plain(title) === plain(doneMeans);

/** Ulaanbaatar is UTC+8 all year; the studio's days and weeks are its own. */
const UB_MS = 8 * 60 * 60 * 1000;
const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Today in Ulaanbaatar, YYYY-MM-DD. */
export const ubToday = (now = Date.now()) => day(now + UB_MS);

/** The Monday-to-Monday week holding a day (YYYY-MM-DD), and its bounds as instants. */
export function weekOf(date: string): { start: string; end: string; from: string; until: string } {
  const at = Date.parse(`${date}T00:00:00Z`);
  const monday = at - ((new Date(at).getUTCDay() + 6) % 7) * 86_400_000;
  const start = day(monday);
  const end = day(monday + 7 * 86_400_000);
  return { start, end, from: `${start}T00:00:00+08:00`, until: `${end}T00:00:00+08:00` };
}

export const isDate = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
