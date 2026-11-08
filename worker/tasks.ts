/**
 * The team's task list, by the owner's direction (CLAUDE.md > The admin).
 *
 *   GET  /api/tasks?view=mine|all&owner=&project=&state=&overdue=1   the list
 *   GET  /api/tasks/counts            the badge: mine to do, mine to approve
 *   GET  /api/tasks/report?week=&person=   the Тайлан: one person, one week
 *   POST /api/tasks                   a new task
 *   POST /api/tasks/<id>              edit it (with the updated_at it read)
 *   POST /api/tasks/<id>/move         start, submit, approve, send back, reopen
 *
 * Every route answers editors only, and who is asking comes first: a
 * stranger gets 401 before learning anything is here (./auth.ts). The tables
 * (migrations 0010, 0011) are read and written with the service_role key,
 * which never leaves the Worker — the inbox's model.
 *
 * History: `tasks` is where a task is now; `task_events` is everything that
 * happened to it, one row per change of state, written by a trigger in the
 * same transaction (0011). Every move sets `moved_by`, which the trigger
 * records as who did it. The Тайлан reads the events, never the task's last
 * decision — a task sent back twice and then approved is three facts, not
 * one tidy approval. An approval made by mistake is reopened by the
 * approver, with a reason: a fact of its own, not an edit.
 *
 * People are shown by `editors.display_name`, or their email where it is
 * empty; an id no longer in `editors` is «Хасагдсан хэрэглэгч», never a bare
 * id — in the Тайлан, the rows and Telegram alike.
 *
 * Coupled one way: worker/index.ts loads this file only when a /api/tasks*
 * request arrives, behind its own try/catch, and no public page imports it —
 * whatever fails in here answers this route and nothing else
 * (scripts/test-isolation.ts).
 *
 * Telegram: the tasks group (TELEGRAM_TASKS_CHAT_ID), never the enquiries
 * one, and exactly three messages — assigned to you; submitted for your
 * approval; sent back, with the reason. Starting, approving and reopening
 * send nothing. Without the secret they are skipped, and nothing else
 * changes (scripts/test-tasks.ts).
 */
import { tasks as words } from '../src/content/admin-tasks.ts';
import { MOVES, TASK_LIMITS, TASK_PROJECTS, isDate, repeatsTitle, ubToday, weekOf, type Move, type TaskState } from '../src/lib/task-codes.ts';
import { answer, callerOf, refusal } from './auth.ts';
import { fill, nameOf, people as team, tellTeam, type Person, type TeamEnv } from './team.ts';

export type { Person };
export type Env = TeamEnv;

export interface Task {
  id: string;
  created_at: string;
  updated_at: string;
  title: string;
  done_means: string;
  project: string;
  owner_id: string;
  approver_id: string;
  created_by: string;
  due_date: string | null;
  state: TaskState;
  submitted_at: string | null;
  submitted_by: string | null;
  decided_at: string | null;
  decided_by: string | null;
  reject_reason: string | null;
  /** Who moved it last — what the trigger writes into task_events.by. */
  moved_by?: string | null;
}

/** One change of a task's state, kept (task_events, migration 0011). */
export interface TaskEvent {
  id: number;
  task_id: string;
  at: string;
  by: string;
  from_state: TaskState;
  to_state: TaskState;
  reason: string | null;
}

interface Context {
  /** Keeps a Telegram message going after the answer. Without it, it is awaited. */
  waitUntil?: (promise: Promise<unknown>) => void;
  fetcher?: typeof fetch;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

/* --------------------------------------------------------------- the table */

function store(env: Env, fetcher: typeof fetch) {
  const rest = `${env.SUPABASE_URL}/rest/v1`;
  const headers = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` };
  const read = async <T>(response: Response, what: string): Promise<T> => {
    if (!response.ok) throw new Error(`${what} answered ${response.status}`);
    return (await response.json()) as T;
  };
  return {
    people: (): Promise<Person[]> => team(env, fetcher),
    /** The changes of state in a span of time, oldest first. */
    events: async (from: string, until: string) =>
      read<TaskEvent[]>(await fetcher(`${rest}/task_events?select=*&at=gte.${encodeURIComponent(from)}&at=lt.${encodeURIComponent(until)}&order=at`, { headers }), 'task_events'),
    select: async (query: string) => read<Task[]>(await fetcher(`${rest}/tasks?select=*&${query}`, { headers }), 'tasks'),
    async one(id: string): Promise<Task | null> {
      return (await read<Task[]>(await fetcher(`${rest}/tasks?select=*&id=eq.${id}`, { headers }), 'tasks'))[0] ?? null;
    },
    async count(query: string): Promise<number> {
      const response = await fetcher(`${rest}/tasks?select=id&${query}&limit=1`, { headers: { ...headers, Prefer: 'count=exact' } });
      if (!response.ok) throw new Error(`tasks answered ${response.status}`);
      return Number((response.headers.get('Content-Range') ?? '').split('/')[1]) || 0;
    },
    async insert(row: Partial<Task>): Promise<Task> {
      const response = await fetcher(`${rest}/tasks`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify(row),
      });
      return (await read<Task[]>(response, 'tasks'))[0];
    },
    /** Writes only if the row still has the updated_at the editor read; null if someone wrote in between. */
    async update(id: string, version: string, patch: Partial<Task>): Promise<Task | null> {
      const response = await fetcher(`${rest}/tasks?id=eq.${id}&updated_at=eq.${encodeURIComponent(version)}`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
      });
      return (await read<Task[]>(response, 'tasks'))[0] ?? null;
    },
  };
}
type Store = ReturnType<typeof store>;

/* ---------------------------------------------------------------- Telegram */

/** One message to the tasks group (./team.ts): never the enquiries chat, never throws, skipped when unset. */
export const tellTasks = (env: Env, message: string, fetcher: typeof fetch = fetch) => tellTeam(env, message, fetcher, 'task notification');

/* -------------------------------------------------------------- the fields */

type Fields = Pick<Task, 'title' | 'done_means' | 'project' | 'owner_id' | 'approver_id' | 'due_date'>;

/** What is wrong with a task's fields, as a code the admin turns into words; null when nothing is. */
function wrongWith(fields: Fields, people: Person[]): string | null {
  if (!fields.title || fields.title.length > TASK_LIMITS.title) return 'title';
  if (!fields.done_means || fields.done_means.length > TASK_LIMITS.done_means) return 'done-means';
  if (repeatsTitle(fields.title, fields.done_means)) return 'done-means-repeats-title';
  if (!(TASK_PROJECTS as readonly string[]).includes(fields.project)) return 'project';
  if (!people.some((p) => p.id === fields.owner_id)) return 'owner';
  if (!people.some((p) => p.id === fields.approver_id)) return 'approver';
  if (fields.due_date !== null && !isDate(fields.due_date)) return 'due';
  return null;
}

/* ------------------------------------------------------------------ routes */

export async function onTasks(request: Request, env: Env, ctx: Context = {}): Promise<Response> {
  const fetcher = ctx.fetcher ?? fetch;
  let caller;
  try {
    caller = await callerOf(request, fetcher);
  } catch {
    return answer(502, { ok: false, error: 'supabase' });
  }
  const refused = refusal(caller);
  if (refused) return refused;
  if (caller.kind !== 'editor') return answer(401, { ok: false, error: 'signed-out' });
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return answer(503, { ok: false, error: 'not-configured' });
  const me = caller;

  const url = new URL(request.url);
  const parts = url.pathname.replace(/^\/api\/tasks\/?/, '').split('/').filter(Boolean);
  const db = store(env, fetcher);
  // A message goes on after the answer when the platform allows; otherwise it is awaited. Never thrown.
  const later = async (promise: Promise<unknown>) => {
    if (ctx.waitUntil) ctx.waitUntil(promise);
    else await promise;
  };

  try {
    if (request.method === 'GET' && parts.length === 0) return await list(db, me.id, url.searchParams);
    if (request.method === 'GET' && parts.length === 1 && parts[0] === 'counts') return await counts(db, me.id);
    if (request.method === 'GET' && parts.length === 1 && parts[0] === 'report') return await report(db, me.id, url.searchParams);
    if (request.method === 'POST' && parts.length === 0) return await create(db, env, me.id, await body(request), later, fetcher);
    if (request.method === 'POST' && parts.length === 1 && UUID.test(parts[0])) return await edit(db, env, me.id, parts[0], await body(request), later, fetcher);
    if (request.method === 'POST' && parts.length === 2 && UUID.test(parts[0]) && parts[1] === 'move') return await move(db, env, me.id, parts[0], await body(request), later, fetcher);
    return answer(404, { ok: false, error: 'not-found' });
  } catch (error) {
    return answer(502, { ok: false, error: 'supabase', detail: String((error as Error)?.message ?? error).slice(0, 300) });
  }
}

const body = async (request: Request) => ((await request.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;

/** «Mine» by default: what is assigned to me and not approved, and what waits on my approval. */
async function list(db: Store, me: string, params: URLSearchParams): Promise<Response> {
  const where: string[] = [];
  if ((params.get('view') ?? 'mine') === 'mine') where.push(`or=(and(owner_id.eq.${me},state.neq.approved),and(approver_id.eq.${me},state.eq.submitted))`);
  const owner = params.get('owner');
  if (owner && UUID.test(owner)) where.push(`owner_id=eq.${owner}`);
  const project = params.get('project');
  if (project && (TASK_PROJECTS as readonly string[]).includes(project)) where.push(`project=eq.${project}`);
  const state = params.get('state');
  if (state && state in { new: 1, doing: 1, submitted: 1, approved: 1 }) where.push(`state=eq.${state}`);
  if (params.get('overdue') === '1') where.push(`due_date=lt.${ubToday()}`, 'state=neq.approved');
  const [items, people] = await Promise.all([db.select(`${where.join('&')}${where.length ? '&' : ''}order=due_date.asc.nullslast,created_at.desc&limit=500`), db.people()]);
  return answer(200, { ok: true, me, today: ubToday(), items, people });
}

/** The badge's two numbers: assigned to me and not done; waiting for my approval. */
async function counts(db: Store, me: string): Promise<Response> {
  const [mine, approve] = await Promise.all([db.count(`owner_id=eq.${me}&state=in.(new,doing)`), db.count(`approver_id=eq.${me}&state=eq.submitted`)]);
  return answer(200, { ok: true, mine, approve });
}

/**
 * One person's week, as facts, from task_events (migration 0011): each time
 * they submitted; each approval, send-back (with its reason) and reopening of
 * their work; and what of theirs is overdue now. A task sent back twice and
 * then approved shows three facts, not one tidy approval.
 */
async function report(db: Store, me: string, params: URLSearchParams): Promise<Response> {
  const person = UUID.test(params.get('person') ?? '') ? (params.get('person') as string) : me;
  const week = weekOf(isDate(params.get('week')) ? (params.get('week') as string) : ubToday());
  const [events, overdue, people] = await Promise.all([
    db.events(week.from, week.until),
    db.select(`owner_id=eq.${person}&state=neq.approved&due_date=lt.${ubToday()}&order=due_date`),
    db.people(),
  ]);
  const ids = [...new Set(events.map((event) => event.task_id))];
  const tasks = ids.length ? await db.select(`id=in.(${ids.join(',')})`) : [];
  const taskOf = (id: string) => tasks.find((task) => task.id === id);
  const fact = (event: TaskEvent) => {
    const task = taskOf(event.task_id);
    return { at: event.at, by: nameOf(people, event.by), reason: event.reason, task: task ? { id: task.id, title: task.title, project: task.project } : null };
  };
  const theirs = (event: TaskEvent) => taskOf(event.task_id)?.owner_id === person;
  return answer(200, {
    ok: true,
    me,
    person,
    week: { start: week.start, end: week.end },
    today: ubToday(),
    people,
    submitted: events.filter((e) => e.to_state === 'submitted' && e.by === person).map(fact),
    approved: events.filter((e) => e.to_state === 'approved' && theirs(e)).map(fact),
    sentBack: events.filter((e) => e.from_state === 'submitted' && e.to_state === 'doing' && theirs(e)).map(fact),
    reopened: events.filter((e) => e.from_state === 'approved' && e.to_state === 'doing' && theirs(e)).map(fact),
    overdue,
  });
}

async function create(db: Store, env: Env, me: string, input: Record<string, unknown>, later: (p: Promise<unknown>) => Promise<void>, fetcher: typeof fetch): Promise<Response> {
  const people = await db.people();
  const fields: Fields = {
    title: text(input.title),
    done_means: text(input.done_means),
    project: text(input.project),
    owner_id: text(input.owner_id),
    // The approver defaults to whoever created it — not always the studio's owner.
    approver_id: text(input.approver_id) || me,
    due_date: text(input.due_date) || null,
  };
  const wrong = wrongWith(fields, people);
  if (wrong) return answer(400, { ok: false, error: wrong });
  const item = await db.insert({ ...fields, created_by: me, state: 'new' });
  if (fields.owner_id !== me) {
    await later(tellTasks(env, fill(words.notify.assigned, { who: nameOf(people, fields.owner_id), title: fields.title, done: fields.done_means }), fetcher));
  }
  return answer(201, { ok: true, item });
}

async function edit(db: Store, env: Env, me: string, id: string, input: Record<string, unknown>, later: (p: Promise<unknown>) => Promise<void>, fetcher: typeof fetch): Promise<Response> {
  const version = text(input.updated_at);
  if (!version) return answer(400, { ok: false, error: 'no-version' });
  const [current, people] = await Promise.all([db.one(id), db.people()]);
  if (!current) return answer(404, { ok: false, error: 'not-found' });
  if (current.state === 'approved') return answer(409, { ok: false, error: 'approved' });
  const has = (key: string) => Object.prototype.hasOwnProperty.call(input, key);
  const fields: Fields = {
    title: has('title') ? text(input.title) : current.title,
    done_means: has('done_means') ? text(input.done_means) : current.done_means,
    project: has('project') ? text(input.project) : current.project,
    owner_id: has('owner_id') ? text(input.owner_id) : current.owner_id,
    approver_id: has('approver_id') ? text(input.approver_id) : current.approver_id,
    due_date: has('due_date') ? text(input.due_date) || null : current.due_date,
  };
  const wrong = wrongWith(fields, people);
  if (wrong) return answer(400, { ok: false, error: wrong });
  const item = await db.update(id, version, fields);
  if (!item) return answer(409, { ok: false, error: 'conflict' });
  if (fields.owner_id !== current.owner_id && fields.owner_id !== me) {
    await later(tellTasks(env, fill(words.notify.assigned, { who: nameOf(people, fields.owner_id), title: fields.title, done: fields.done_means }), fetcher));
  }
  return answer(200, { ok: true, item });
}

async function move(db: Store, env: Env, me: string, id: string, input: Record<string, unknown>, later: (p: Promise<unknown>) => Promise<void>, fetcher: typeof fetch): Promise<Response> {
  const name = text(input.move) as Move;
  const rule = MOVES[name];
  if (!Object.prototype.hasOwnProperty.call(MOVES, name) || !rule) return answer(400, { ok: false, error: 'bad-move' });
  const version = text(input.updated_at);
  if (!version) return answer(400, { ok: false, error: 'no-version' });
  const reason = text(input.reason);
  if (rule.reason && !reason) return answer(400, { ok: false, error: 'reason-required' });
  if (reason.length > TASK_LIMITS.reject_reason) return answer(400, { ok: false, error: 'reason' });

  const current = await db.one(id);
  if (!current) return answer(404, { ok: false, error: 'not-found' });
  if (!rule.from.includes(current.state)) return answer(409, { ok: false, error: 'bad-transition', state: current.state });
  if (rule.approverOnly && current.approver_id !== me) return answer(403, { ok: false, error: 'not-approver' });

  const now = new Date().toISOString();
  // moved_by is who the trigger records in task_events: every move says who made it.
  const patch: Partial<Task> =
    name === 'start'
      ? { state: 'doing', moved_by: me }
      : name === 'submit'
        ? { state: 'submitted', submitted_at: now, submitted_by: me, moved_by: me }
        : name === 'approve'
          ? { state: 'approved', decided_at: now, decided_by: me, reject_reason: null, moved_by: me }
          : { state: 'doing', decided_at: now, decided_by: me, reject_reason: reason, moved_by: me }; // sendBack, reopen
  const item = await db.update(id, version, patch);
  if (!item) return answer(409, { ok: false, error: 'conflict' });

  if (name === 'submit' && current.approver_id !== me) {
    const people = await db.people();
    await later(tellTasks(env, fill(words.notify.submitted, { who: nameOf(people, current.approver_id), by: nameOf(people, me), title: current.title, done: current.done_means }), fetcher));
  }
  if (name === 'sendBack' && current.submitted_by && current.submitted_by !== me) {
    const people = await db.people();
    await later(tellTasks(env, fill(words.notify.sentBack, { who: nameOf(people, current.submitted_by), title: current.title, reason }), fetcher));
  }
  return answer(200, { ok: true, item });
}
