/**
 * The admin's task list — «Ажил»: «Даалгавар» and «Тайлан» — over the
 * Worker's /api/tasks routes (worker/tasks.ts).
 *
 * Loaded only when «Даалгавар» or «Тайлан» is opened (src/scripts/admin.ts >
 * tools), with its own words (src/content/admin-tasks.ts): none of it is in
 * the admin's first load. The tree's badge and draft dot are the core's, so
 * they show without loading this. Built only from the admin's own parts,
 * handed in — h(), the Worker call, the status line, the core's words — so
 * it has no look of its own and no dependency of its own. And walled off the same way the
 * Worker walls its routes: every entry point here catches, says so on the
 * status line, and the rest of the admin carries on.
 *
 * Reuses Phase 20's habits: rows that name themselves, a line of help under
 * every field, length guidance never a limit, a draft kept in localStorage
 * per form, the unsaved dot in the tree, Ctrl+S and Esc. The default view is
 * «Минийх» — what is assigned to me and what waits on my approval — because a
 * list that opens on every task is a list nobody reads.
 */
import type { admin as Copy } from '../content/admin';
import { tasks as words } from '../content/admin-tasks';
import { MOVES, TASK_GUIDE, TASK_PROJECTS, TASK_STATES, repeatsTitle, ubToday, weekOf, type Move, type TaskState } from '../lib/task-codes';

type Child = Node | string | null | false | undefined;
type H = <K extends keyof HTMLElementTagNameMap>(tag: K, props?: Record<string, unknown>, ...children: Child[]) => HTMLElementTagNameMap[K];
type Tone = 'ok' | 'bad' | 'busy' | '';

export interface Task {
  id: string;
  updated_at: string;
  title: string;
  done_means: string;
  project: string;
  owner_id: string;
  approver_id: string;
  due_date: string | null;
  state: TaskState;
  submitted_at: string | null;
  submitted_by: string | null;
  decided_at: string | null;
  decided_by: string | null;
  reject_reason: string | null;
}
/** Someone on the team as shown: display name, else email (worker/tasks.ts). */
interface Person {
  id: string;
  name: string;
}

/** One change of state from task_events, as the Тайлан shows it. */
interface Fact {
  at: string;
  by: string;
  reason: string | null;
  task: { id: string; title: string; project: string } | null;
}

export interface TaskDeps {
  h: H;
  t: typeof Copy;
  main: () => HTMLElement;
  me: () => { id: string; email: string } | null;
  worker: (path: string, init?: RequestInit) => Promise<{ response: Response; body: Record<string, unknown> }>;
  status: (text: string, tone?: Tone, detail?: string) => void;
  said: (text: string, detail?: string) => Child[];
  explain: (error: unknown, sentence: string) => { text: string; detail: string };
  isSignedOut: (error: unknown) => boolean;
  signedOut: () => void;
  renderNav: () => void;
  showPage: () => void;
  when: (iso: string) => string;
  remember: { get(key: string): string | null; set(key: string, value: string | null): void; keys(): string[] };
  /** Where this tool keeps its drafts — the core shows their dot in the tree without loading the tool. */
  draftPrefix: () => string;
  /** The badge's numbers, read afresh by the core after a save or a move. */
  readCounts: () => Promise<void> | void;
  /** Whether that view is still the one open — an answer for one that was left is dropped. */
  showing: (kind: 'tasks' | 'report') => boolean;
}

const FIELDS = ['title', 'done_means', 'project', 'owner_id', 'approver_id', 'due_date'] as const;
type Field = (typeof FIELDS)[number];
type Values = Record<Field, string>;

export function createTasks(d: TaskDeps) {
  const { h, t } = d;
  const ui = { view: 'mine', owner: '', project: '', state: '', overdue: false, open: new Set<string>(), editing: null as string | null, week: '', person: '' };
  let people: Person[] = [];
  let today = ubToday();
  let items: Task[] = [];
  /** The open form's save, for Ctrl+S. */
  let saveOpen: (() => void) | null = null;

  /** Never a bare id: someone no longer an editor is «Хасагдсан хэрэглэгч». */
  const nameOf = (id: string | null) => (id ? (people.find((p) => p.id === id)?.name ?? t.removedPerson) : '—');
  const draftPrefix = () => d.draftPrefix();
  const readDraft = (key: string): { base: string; values: Values } | null => {
    try {
      return JSON.parse(d.remember.get(draftPrefix() + key) ?? 'null');
    } catch {
      return null;
    }
  };
  const overdue = (task: Task) => !!task.due_date && task.due_date < today && task.state !== 'approved';

  /** Whatever goes wrong in here is said on the status line, and the admin carries on. */
  const guarded =
    <A extends unknown[]>(run: (...args: A) => Promise<void> | void) =>
    async (...args: A) => {
      try {
        await run(...args);
      } catch (error) {
        if (d.isSignedOut(error)) return d.signedOut();
        const { text, detail } = d.explain(error, words.failed);
        d.status(text, 'bad', detail);
      }
    };

  /** A refusal from the Worker, in words: the shared conflict sentence, or the task's own. */
  const trouble = (body: Record<string, unknown>, fallback: string) => {
    const code = String(body.error ?? '');
    if (code === 'conflict') return t.conflict;
    if (code === 'not-editor') return t.signIn.notEditor;
    return words.errors[code] ?? fallback;
  };

  /* ----------------------------------------------------------------- form */

  function form(task: Task | null): HTMLElement {
    const me = d.me()?.id ?? '';
    const key = task ? task.id : 'new';
    const stored = readDraft(key);
    const start: Values = {
      title: task?.title ?? '',
      done_means: task?.done_means ?? '',
      project: task?.project ?? 'site',
      owner_id: task?.owner_id ?? me,
      approver_id: task?.approver_id ?? me,
      due_date: task?.due_date ?? '',
    };
    const values: Values = { ...start, ...(stored?.values ?? {}) };
    const inputs = {} as Record<Field, HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>;
    const keepDraft = () => {
      const same = FIELDS.every((f) => values[f] === start[f]);
      d.remember.set(draftPrefix() + key, same ? null : JSON.stringify({ base: task?.updated_at ?? '', values }));
      d.renderNav();
    };

    const select = (field: Field, options: [string, string][]) =>
      h('select', { id: `task-${key}-${field}` }, ...options.map(([value, label]) => h('option', { value, selected: values[field] === value }, label)));
    const personOptions = (field: Field): [string, string][] => {
      const options = people.map((p) => [p.id, p.name] as [string, string]);
      return values[field] && !people.some((p) => p.id === values[field]) ? [[values[field], t.removedPerson], ...options] : options;
    };
    const make: Record<Field, () => HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement> = {
      title: () => h('input', { type: 'text', id: `task-${key}-title`, value: values.title }),
      done_means: () => h('textarea', { id: `task-${key}-done_means`, rows: 3, value: values.done_means }),
      project: () => select('project', TASK_PROJECTS.map((p) => [p, words.projects[p]])),
      owner_id: () => select('owner_id', personOptions('owner_id')),
      approver_id: () => select('approver_id', personOptions('approver_id')),
      due_date: () => h('input', { type: 'date', id: `task-${key}-due_date`, value: values.due_date }),
    };

    const rows = FIELDS.map((field) => {
      const input = (inputs[field] = make[field]());
      const helpId = `task-${key}-${field}-help`;
      input.setAttribute('aria-describedby', helpId);
      const guide = field === 'title' || field === 'done_means' ? TASK_GUIDE[field] : 0;
      const count = h('p', { class: 'f__count', 'aria-live': 'polite', hidden: true });
      const recount = () => {
        const over = !!guide && input.value.length > guide;
        count.hidden = !over;
        count.textContent = over ? words.guide.replace('{n}', String(input.value.length)).replace('{max}', String(guide)) : '';
      };
      input.addEventListener('input', () => ((values[field] = input.value), recount(), keepDraft()));
      input.addEventListener('change', () => ((values[field] = input.value), keepDraft()));
      recount();
      return h('div', { class: 'f', 'data-field': field }, h('label', { class: 'f__label', for: input.id }, words.fields[field]), input, count, h('p', { class: 'f__help', id: helpId }, words.fieldHelp[field]));
    });

    const save = guarded(async () => {
      for (const field of FIELDS) values[field] = inputs[field].value.trim();
      // The Worker refuses these too; saying so here saves a round trip.
      if (!values.done_means) return d.status(words.errors['done-means'], 'bad');
      if (repeatsTitle(values.title, values.done_means)) return d.status(words.errors['done-means-repeats-title'], 'bad');
      d.status(words.loading, 'busy');
      const payload = { ...values, ...(task ? { updated_at: stored?.base || task.updated_at } : {}) };
      const { response, body } = await d.worker(task ? `/api/tasks/${task.id}` : '/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        // A conflict keeps the typing: the list is read afresh, the draft waits to be laid back over it.
        d.status(trouble(body, words.failed), 'bad');
        if (body.error === 'conflict') await renderTasks();
        return;
      }
      d.remember.set(draftPrefix() + key, null);
      ui.editing = null;
      saveOpen = null;
      d.status(words.saved, 'ok');
      await Promise.all([renderTasks(), d.readCounts()]);
    });
    saveOpen = () => void save();

    const cancel = () => {
      d.remember.set(draftPrefix() + key, null);
      ui.editing = null;
      saveOpen = null;
      d.status('');
      // The draft is gone: so is its dot in the tree.
      d.renderNav();
      void renderTasks();
    };
    return h(
      'div',
      { class: 'task__form', 'data-form': key },
      ...rows,
      h('div', { class: 'img__buttons' }, h('button', { type: 'button', class: 'btn btn--primary', onclick: () => void save() }, words.save), h('button', { type: 'button', class: 'btn btn--ghost', onclick: cancel }, words.cancel))
    );
  }

  /* ---------------------------------------------------------------- moves */

  const move = guarded(async (task: Task, name: Move, reason: string = '') => {
    if (MOVES[name].reason && !reason.trim()) return d.status(words.reasonRequired[name] ?? words.errors['reason-required'], 'bad');
    d.status(words.loading, 'busy');
    const { response, body } = await d.worker(`/api/tasks/${task.id}/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ move: name, reason, updated_at: task.updated_at }),
    });
    if (!response.ok) {
      d.status(trouble(body, words.failed), 'bad');
      if (body.error === 'conflict' || body.error === 'bad-transition') await renderTasks();
      return;
    }
    d.status('');
    await Promise.all([renderTasks(), d.readCounts()]);
  });

  function actions(task: Task): HTMLElement {
    const me = d.me()?.id;
    const allowed = (Object.keys(MOVES) as Move[]).filter((name) => MOVES[name].from.includes(task.state) && (!MOVES[name].approverOnly || task.approver_id === me));
    // A move that needs a reason opens a box for it first: send back, reopen.
    const boxes = new Map<Move, HTMLElement>();
    const reasoned = allowed.filter((name) => MOVES[name].reason);
    for (const name of reasoned) {
      const id = `task-${task.id}-${name}-reason`;
      const reason = h('textarea', { id, rows: 2, 'aria-describedby': `${id}-help` });
      boxes.set(
        name,
        h(
          'div',
          { class: 'f task__reason', hidden: true, 'data-reason': name },
          h('label', { class: 'f__label', for: id }, words.reasons[name]),
          reason,
          h('p', { class: 'f__help', id: `${id}-help` }, words.reasonHelp[name]),
          h('button', { type: 'button', class: 'btn btn--primary', 'data-move': `${name}-confirm`, onclick: () => void move(task, name, reason.value) }, words.moves[name])
        )
      );
    }
    const open = (name: Move) => {
      for (const [other, box] of boxes) box.hidden = other !== name;
      (boxes.get(name)?.querySelector('textarea') as HTMLTextAreaElement | null)?.focus();
    };
    return h(
      'div',
      { class: 'task__actions' },
      h(
        'div',
        { class: 'img__buttons' },
        ...allowed.map((name) =>
          h(
            'button',
            {
              type: 'button',
              class: name === 'approve' || name === 'submit' ? 'btn btn--primary' : 'btn btn--ghost',
              'data-move': name,
              onclick: () => (MOVES[name].reason ? open(name) : void move(task, name)),
            },
            words.moves[name]
          )
        ),
        task.state !== 'approved' ? h('button', { type: 'button', class: 'btn btn--ghost', onclick: () => ((ui.editing = task.id), void renderTasks()) }, words.edit) : null
      ),
      ...boxes.values()
    );
  }

  /* ----------------------------------------------------------------- list */

  function row(task: Task): HTMLElement {
    const late = overdue(task);
    const details = h(
      'details',
      { class: 'group group--item task', open: ui.open.has(task.id) || ui.editing === task.id, 'data-task': task.id, 'data-state': task.state, 'data-overdue': late ? 'true' : undefined },
      h(
        'summary',
        { class: 'row' },
        h('span', { class: 'row__ord' }, task.due_date ?? '—'),
        h(
          'span',
          { class: 'row__text' },
          h('span', { class: 'row__title' }, task.title),
          h('span', { class: 'row__sub' }, [words.states[task.state], words.projects[task.project] ?? task.project, words.owner.replace('{who}', nameOf(task.owner_id))].join(' · '))
        ),
        late ? h('span', { class: 'task__overdue', 'data-marker': 'overdue' }, words.overdue) : null
      ),
      h(
        'div',
        { class: 'group__body task__body' },
        ui.editing === task.id
          ? form(task)
          : h(
              'div',
              {},
              h('p', { class: 'f__label' }, words.fields.done_means),
              h('p', { class: 'task__done' }, task.done_means),
              task.reject_reason && task.state !== 'approved' ? h('p', { class: 'task__sent-back' }, words.sentBack.replace('{reason}', task.reject_reason)) : null,
              h('p', { class: 'main__hint' }, [words.owner.replace('{who}', nameOf(task.owner_id)), words.approver.replace('{who}', nameOf(task.approver_id)), task.due_date ? words.due.replace('{date}', task.due_date) : ''].filter(Boolean).join(' · ')),
              actions(task)
            )
      )
    );
    details.addEventListener('toggle', () => (details.open ? ui.open.add(task.id) : ui.open.delete(task.id)));
    return details;
  }

  const query = () => {
    const q = new URLSearchParams({ view: ui.view });
    if (ui.owner) q.set('owner', ui.owner);
    if (ui.project) q.set('project', ui.project);
    if (ui.state) q.set('state', ui.state);
    if (ui.overdue) q.set('overdue', '1');
    return q.toString();
  };

  const renderTasks = guarded(async () => {
    if (!d.showing('tasks')) return;
    const list = h('div', { class: 'inbox__list', 'data-list': 'tasks' }, h('p', { class: 'main__hint' }, words.loading));
    const top = h('div', { class: 'task__new' });
    const bar = h('div', { class: 'inbox__filters tasks__bar', role: 'group', 'aria-label': t.views.tasks });
    d.main().replaceChildren(
      h(
        'div',
        { class: 'main__head' },
        h('h1', { class: 'main__title' }, t.views.tasks),
        h('button', { type: 'button', class: 'btn btn--primary', 'data-new-task': '', onclick: () => ((ui.editing = 'new'), void renderTasks()) }, words.new)
      ),
      h('div', { class: 'main__about' }, h('p', {}, words.help)),
      bar,
      top,
      list,
      h('p', { class: 'main__keys' }, t.keys)
    );
    d.showPage();

    const { response, body } = await d.worker(`/api/tasks?${query()}`);
    if (!d.showing('tasks')) return;
    if (!response.ok) return void list.replaceChildren(h('div', { class: 'main__hint' }, ...d.said(trouble(body, words.failed), `${response.status} ${String(body.error ?? '')}`)));
    items = (body.items ?? []) as Task[];
    people = (body.people ?? []) as Person[];
    today = String(body.today ?? ubToday());

    const pick = (label: string, current: string, options: [string, string][], set: (value: string) => void) => {
      const id = `tasks-filter-${label}`;
      const el = h('select', { id, 'aria-label': label }, h('option', { value: '' }, `${label}: ${words.filters.any}`), ...options.map(([value, text]) => h('option', { value, selected: value === current }, `${label}: ${text}`)));
      el.addEventListener('change', () => (set(el.value), void renderTasks()));
      return el;
    };
    const overdueBox = h('input', { type: 'checkbox', id: 'tasks-filter-overdue', checked: ui.overdue });
    overdueBox.addEventListener('change', () => ((ui.overdue = overdueBox.checked), void renderTasks()));
    bar.replaceChildren(
      ...(['mine', 'all'] as const).map((view) =>
        h('button', { type: 'button', class: 'btn btn--ghost inbox__filter', 'data-view': view, 'aria-pressed': ui.view === view ? 'true' : 'false', onclick: () => ((ui.view = view), void renderTasks()) }, words.views[view])
      ),
      pick(words.filters.owner, ui.owner, people.map((p) => [p.id, p.name]), (v) => (ui.owner = v)),
      pick(words.filters.project, ui.project, TASK_PROJECTS.map((p) => [p, words.projects[p]]), (v) => (ui.project = v)),
      pick(words.filters.state, ui.state, TASK_STATES.map((s) => [s, words.states[s]]), (v) => (ui.state = v)),
      h('label', { class: 'f__row tasks__overdue-filter', for: 'tasks-filter-overdue' }, overdueBox, h('span', {}, words.filters.overdue))
    );

    if (ui.editing === 'new') top.replaceChildren(form(null));
    if (!items.length) return void list.replaceChildren(h('p', { class: 'main__hint' }, ui.view === 'mine' && !ui.owner && !ui.project && !ui.state && !ui.overdue ? words.emptyMine : words.empty));
    list.replaceChildren(...items.map(row));
  });

  /* --------------------------------------------------------------- Тайлан */

  const renderReport = guarded(async () => {
    if (!d.showing('report')) return;
    const me = d.me()?.id ?? '';
    const week = weekOf(ui.week || ubToday());
    const person = ui.person || me;
    const body = h('div', { class: 'report', 'data-report': '' }, h('p', { class: 'main__hint' }, words.loading));
    const shift = (days: number) => {
      const at = Date.parse(`${week.start}T00:00:00Z`) + days * 86_400_000;
      ui.week = new Date(at).toISOString().slice(0, 10);
      void renderReport();
    };
    const range = words.report.range.replace('{start}', week.start).replace('{end}', new Date(Date.parse(`${week.end}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10));
    const whoSelect = h('select', { id: 'report-person', 'aria-label': words.report.person });
    whoSelect.addEventListener('change', () => ((ui.person = whoSelect.value), void renderReport()));
    d.main().replaceChildren(
      h('div', { class: 'main__head' }, h('h1', { class: 'main__title' }, words.report.title)),
      h('div', { class: 'main__about' }, h('p', {}, words.report.help)),
      h(
        'div',
        { class: 'inbox__filters report__bar', role: 'group', 'aria-label': words.report.week },
        h('label', { class: 'f__label', for: 'report-person' }, words.report.person),
        whoSelect,
        h('button', { type: 'button', class: 'btn btn--ghost', 'data-week-step': '-7', onclick: () => shift(-7) }, words.report.prev),
        h('span', { class: 'report__range', 'data-week': week.start }, range),
        h('button', { type: 'button', class: 'btn btn--ghost', 'data-week-step': '7', onclick: () => shift(7) }, words.report.next),
        h('button', { type: 'button', class: 'btn btn--ghost', 'data-week-step': '0', onclick: () => ((ui.week = ''), void renderReport()) }, words.report.thisWeek)
      ),
      body
    );
    d.showPage();

    const { response, body: data } = await d.worker(`/api/tasks/report?week=${week.start}&person=${person}`);
    if (!d.showing('report')) return;
    if (!response.ok) return void body.replaceChildren(h('div', { class: 'main__hint' }, ...d.said(trouble(data, words.failed), `${response.status} ${String(data.error ?? '')}`)));
    people = (data.people ?? []) as Person[];
    whoSelect.replaceChildren(
      ...(people.some((p) => p.id === person) ? [] : [h('option', { value: person, selected: true }, t.removedPerson)]),
      ...people.map((p) => h('option', { value: p.id, selected: p.id === person }, p.name))
    );

    const part = (key: string, lines: string[]) =>
      h(
        'section',
        { class: 'report__part', 'data-part': key },
        h('h2', { class: 'f__label' }, `${(words.report as Record<string, string>)[key]} · ${lines.length}`),
        lines.length ? h('ul', {}, ...lines.map((line) => h('li', {}, line))) : h('p', { class: 'main__hint' }, words.report.none)
      );
    const project = (code: string) => words.projects[code] ?? code;
    // Each fact on its own line: a task sent back twice is two lines, not one.
    const facts = (key: 'submitted' | 'approved' | 'sentBack' | 'reopened', why: boolean) =>
      ((data[key] ?? []) as Fact[]).map((fact) =>
        [
          fact.task ? `${fact.task.title} — ${project(fact.task.project)}` : words.report.none,
          why && fact.reason ? words.report.reason.replace('{reason}', fact.reason) : '',
          words.report.when.replace('{date}', d.when(fact.at)).replace('{who}', fact.by),
        ]
          .filter(Boolean)
          .join(' · ')
      );
    body.replaceChildren(
      part('submitted', facts('submitted', false)),
      part('approved', facts('approved', false)),
      part('sentBack', facts('sentBack', true)),
      part('reopened', facts('reopened', true)),
      part('overdue', ((data.overdue ?? []) as Task[]).map((task) => `${task.title} — ${words.due.replace('{date}', task.due_date ?? '')}`))
    );
  });

  return {
    renderTasks,
    renderReport,
    /** Ctrl+S on the task list: save the open form, if there is one. */
    save: () => saveOpen?.(),
  };
}
