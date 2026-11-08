/**
 * The admin's «Хавсралт 2» — Schedule 2 of the founder agreement, the money
 * Members put into the Company — over the Worker's /api/contributions routes
 * (worker/contributions.ts).
 *
 * Built only from the admin's own parts, handed in by src/scripts/admin.ts,
 * like the task list: no look of its own, no dependency of its own, and
 * walled off — every entry point catches, says so on the status line, and
 * the rest of the admin carries on.
 *
 * What it is for, in the order people open it: the strip at the top — per
 * Member, principal, repaid, outstanding and outstanding × 1.5, not yet due —
 * then the entries, newest first. The form counts clause 5.1's days as the
 * date is typed, so a two-month-old receipt is found out before saving, not
 * after. «Хуулах» is the recurring entry: the same subscription, a new month.
 *
 * Money is whole tugrik here too: typed digits are read by parseMnt, shown by
 * formatMnt, and never pass through a float.
 */
import type { admin as Copy } from '../content/admin';
import { CONTRIBUTION_GUIDE, KINDS, daysBetween, formatMnt, isDate, parseMnt, RECORD_WITHIN_DAYS, ubDateOf, ubToday, type Kind, type Tracked } from '../lib/contribution-codes';

type Child = Node | string | null | false | undefined;
type H = <K extends keyof HTMLElementTagNameMap>(tag: K, props?: Record<string, unknown>, ...children: Child[]) => HTMLElementTagNameMap[K];
type Tone = 'ok' | 'bad' | 'busy' | '';

interface Entry {
  id: string;
  updated_at: string;
  member_id: string;
  date_made: string;
  recorded_at: string;
  amount_mnt: number;
  what_for: string;
  receipt_held: boolean;
  kind: Kind;
  repaid_mnt: number;
  note: string | null;
  created_by: string;
  notified_at: string | null;
  /** Worked out by the Worker, once: days from the money moving to its record, and whether that broke clause 5.1. */
  days: number;
  late: boolean;
}
interface Person {
  id: string;
  name: string;
}
interface Standing {
  member_id: string;
  name: string;
  principal: number;
  repaid: number;
  outstanding: number;
  owed: number;
}
interface Change {
  contribution_id: string;
  at: string;
  who: string;
  field: Tracked;
  from_value: string;
  to_value: string;
}

export interface ContributionDeps {
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
  showing: (kind: string) => boolean;
}

const FIELDS = ['member_id', 'date_made', 'amount_mnt', 'what_for', 'receipt_held', 'kind', 'note', 'repaid_mnt'] as const;
type Field = (typeof FIELDS)[number];
type Values = Record<Field, string>;

export function createContributions(d: ContributionDeps) {
  const { h, t } = d;
  const c = t.contributions;
  const ui = { member: '', open: new Set<string>(), editing: null as string | null, repaying: null as string | null };
  let items: Entry[] = [];
  let people: Person[] = [];
  let summary: Standing[] = [];
  let changes: Change[] = [];
  let saveOpen: (() => void) | null = null;

  const money = (n: number) => c.amount.replace('{amount}', formatMnt(n));
  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? summary.find((s) => s.member_id === id)?.name ?? t.removedPerson;
  const repayable = (e: Entry) => e.kind === 'loan' && !e.late;
  const draftPrefix = () => `anir-admin-contribution:${d.me()?.id ?? ''}:`;
  const readDraft = (key: string): { base: string; values: Values } | null => {
    try {
      return JSON.parse(d.remember.get(draftPrefix() + key) ?? 'null');
    } catch {
      return null;
    }
  };
  const hasDraft = () => d.remember.keys().some((key) => key.startsWith(draftPrefix()));

  const guarded =
    <A extends unknown[]>(run: (...args: A) => Promise<void> | void) =>
    async (...args: A) => {
      try {
        await run(...args);
      } catch (error) {
        if (d.isSignedOut(error)) return d.signedOut();
        const { text, detail } = d.explain(error, c.failed);
        d.status(text, 'bad', detail);
      }
    };
  const trouble = (body: Record<string, unknown>) => {
    const code = String(body.error ?? '');
    if (code === 'conflict') return t.conflict;
    if (code === 'not-editor') return t.signIn.notEditor;
    return c.errors[code] ?? c.failed;
  };
  const post = (path: string, payload: unknown) => d.worker(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });

  /* ----------------------------------------------------------------- form */

  const blank = (): Values => ({
    member_id: people.some((p) => p.id === d.me()?.id) ? (d.me()?.id ?? '') : '',
    date_made: ubToday(),
    amount_mnt: '',
    what_for: '',
    receipt_held: 'false',
    kind: 'loan',
    note: '',
    repaid_mnt: '0',
  });
  const valuesOf = (e: Entry): Values => ({
    member_id: e.member_id,
    date_made: e.date_made,
    amount_mnt: formatMnt(e.amount_mnt),
    what_for: e.what_for,
    receipt_held: String(e.receipt_held),
    kind: e.kind,
    note: e.note ?? '',
    repaid_mnt: formatMnt(e.repaid_mnt),
  });

  function form(entry: Entry | null): HTMLElement {
    const key = entry ? entry.id : 'new';
    const stored = readDraft(key);
    const start = entry ? valuesOf(entry) : blank();
    const values: Values = { ...start, ...(stored?.values ?? {}) };
    // The instant clause 5.1 is counted to: now, for a new entry; its own, for one already made.
    const recordedOn = entry ? ubDateOf(entry.recorded_at) : ubToday();
    const fields: Field[] = entry && repayable(entry) ? [...FIELDS] : FIELDS.filter((f) => f !== 'repaid_mnt');
    const inputs = {} as Record<Field, HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>;
    const read = (field: Field) => {
      const input = inputs[field];
      return input instanceof HTMLInputElement && input.type === 'checkbox' ? String(input.checked) : input.value;
    };
    const keepDraft = () => {
      const same = fields.every((f) => values[f] === start[f]);
      d.remember.set(draftPrefix() + key, same ? null : JSON.stringify({ base: entry?.updated_at ?? '', values }));
      d.renderNav();
    };

    const id = (field: Field) => `contribution-${key}-${field}`;
    const members = (): [string, string][] => {
      const options = people.map((p) => [p.id, p.name] as [string, string]);
      if (values.member_id && !people.some((p) => p.id === values.member_id)) options.unshift([values.member_id, t.removedPerson]);
      return values.member_id ? options : [['', '—'], ...options];
    };
    const select = (field: Field, options: [string, string][]) => h('select', { id: id(field) }, ...options.map(([value, label]) => h('option', { value, selected: values[field] === value }, label)));
    const make: Record<Field, () => HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement> = {
      member_id: () => select('member_id', members()),
      date_made: () => h('input', { type: 'date', id: id('date_made'), value: values.date_made, max: recordedOn }),
      amount_mnt: () => h('input', { type: 'text', inputmode: 'numeric', autocomplete: 'off', id: id('amount_mnt'), value: values.amount_mnt }),
      what_for: () => h('input', { type: 'text', id: id('what_for'), value: values.what_for }),
      receipt_held: () => h('input', { type: 'checkbox', id: id('receipt_held'), checked: values.receipt_held === 'true' }),
      kind: () => select('kind', KINDS.map((k) => [k, c.kinds[k]])),
      note: () => h('textarea', { id: id('note'), rows: 2, value: values.note }),
      repaid_mnt: () => h('input', { type: 'text', inputmode: 'numeric', autocomplete: 'off', id: id('repaid_mnt'), value: values.repaid_mnt }),
    };

    // Clause 5.1, counted as the date is typed: shown before saving, never after.
    const elapsed = h('p', { class: 'f__count ledger__elapsed', role: 'status', 'aria-live': 'polite', 'data-elapsed': '' });
    const recount = () => {
      const date = inputs.date_made.value;
      const kind = inputs.kind as HTMLSelectElement;
      if (!isDate(date)) return void ((elapsed.textContent = ''), (elapsed.dataset.late = ''));
      const days = daysBetween(date, recordedOn);
      if (days < 0) return void ((elapsed.textContent = c.errors['date-future']), (elapsed.dataset.late = ''));
      const late = days > RECORD_WITHIN_DAYS;
      elapsed.textContent = (late ? c.elapsedLate : c.elapsed).replace('{days}', String(days));
      elapsed.dataset.late = late ? 'true' : 'false';
      // A late entry is a gift: the kind says so, and cannot be talked out of it.
      if (late) kind.value = 'gift';
      kind.disabled = late;
    };

    const rows = fields.map((field) => {
      const input = (inputs[field] = make[field]());
      const helpId = `${id(field)}-help`;
      input.setAttribute('aria-describedby', field === 'date_made' ? `${helpId} ${id(field)}-elapsed` : helpId);
      const guide = field === 'what_for' || field === 'note' ? CONTRIBUTION_GUIDE[field] : 0;
      const count = h('p', { class: 'f__count', 'aria-live': 'polite', hidden: true });
      const recountLength = () => {
        const over = !!guide && input.value.length > guide;
        count.hidden = !over;
        count.textContent = over ? c.guide.replace('{n}', String(input.value.length)).replace('{max}', String(guide)) : '';
      };
      const changed = () => ((values[field] = read(field)), recountLength(), field === 'date_made' && recount(), keepDraft());
      input.addEventListener('input', changed);
      input.addEventListener('change', changed);
      recountLength();
      const label = h('label', { class: 'f__label', for: input.id }, c.fields[field]);
      const help = h('p', { class: 'f__help', id: helpId }, c.fieldHelp[field]);
      if (field === 'receipt_held') return h('div', { class: 'f', 'data-field': field }, h('label', { class: 'f__row', for: input.id }, input, h('span', {}, c.fields[field])), help);
      if (field === 'date_made') elapsed.id = `${id(field)}-elapsed`;
      return h('div', { class: 'f', 'data-field': field }, label, input, field === 'date_made' ? elapsed : null, count, help);
    });
    recount();

    const save = guarded(async () => {
      for (const field of fields) values[field] = read(field).trim();
      // The Worker refuses all of these too; saying so here saves a round trip.
      const amount = parseMnt(values.amount_mnt);
      if (!values.member_id) return d.status(c.errors.member, 'bad');
      if (!isDate(values.date_made)) return d.status(c.errors.date, 'bad');
      if (values.date_made > recordedOn) return d.status(c.errors['date-future'], 'bad');
      if (amount === null) return d.status(c.errors.amount, 'bad');
      if (!values.what_for) return d.status(c.errors['what-for'], 'bad');
      if (entry?.late && daysBetween(values.date_made, recordedOn) <= RECORD_WITHIN_DAYS) return d.status(c.errors['late-is-permanent'], 'bad');
      const repaid = fields.includes('repaid_mnt') ? parseMnt(values.repaid_mnt, { allowZero: true }) : undefined;
      if (repaid === null) return d.status(c.errors.repaid, 'bad');
      d.status(c.loading, 'busy');
      const payload = {
        member_id: values.member_id,
        date_made: values.date_made,
        amount_mnt: amount,
        what_for: values.what_for,
        receipt_held: values.receipt_held === 'true',
        kind: (inputs.kind as HTMLSelectElement).value,
        note: values.note,
        ...(repaid !== undefined ? { repaid_mnt: repaid } : {}),
        ...(entry ? { updated_at: stored?.base || entry.updated_at } : {}),
      };
      const { response, body } = await post(entry ? `/api/contributions/${entry.id}` : '/api/contributions', payload);
      if (!response.ok) {
        d.status(trouble(body), 'bad');
        if (body.error === 'conflict' || body.error === 'not-found') await render();
        return;
      }
      d.remember.set(draftPrefix() + key, null);
      ui.editing = null;
      saveOpen = null;
      d.status(c.saved, 'ok');
      await render();
    });
    saveOpen = () => void save();

    const cancel = () => {
      d.remember.set(draftPrefix() + key, null);
      ui.editing = null;
      saveOpen = null;
      d.status('');
      d.renderNav();
      void render();
    };
    return h(
      'div',
      { class: 'task__form', 'data-form': key },
      ...rows,
      h('div', { class: 'img__buttons' }, h('button', { type: 'button', class: 'btn btn--primary', onclick: () => void save() }, c.save), h('button', { type: 'button', class: 'btn btn--ghost', onclick: cancel }, c.cancel))
    );
  }

  /** «Хуулах»: the same entry again — a subscription's next month — dated today, as a new form, not saved. */
  const copy = (e: Entry) => {
    const values: Values = { ...valuesOf(e), date_made: ubToday(), receipt_held: 'false', repaid_mnt: '0', kind: e.late ? 'loan' : e.kind };
    d.remember.set(draftPrefix() + 'new', JSON.stringify({ base: '', values }));
    ui.editing = 'new';
    d.status(c.copied);
    // Unsaved until saved: the tree shows its dot like any other draft.
    d.renderNav();
    void render();
  };

  /* ------------------------------------------------------------ repayment */

  /** The oldest repayable loan of this Member, older than this one, with something still outstanding — or null. */
  const olderOutstanding = (e: Entry) =>
    items
      .filter((o) => o.id !== e.id && o.member_id === e.member_id && repayable(o) && o.repaid_mnt < o.amount_mnt && (o.date_made < e.date_made || (o.date_made === e.date_made && o.recorded_at < e.recorded_at)))
      .sort((a, b) => (a.date_made < b.date_made ? -1 : a.date_made > b.date_made ? 1 : a.recorded_at < b.recorded_at ? -1 : 1))[0] ?? null;

  const repay = guarded(async (e: Entry, typed: string) => {
    const amount = parseMnt(typed);
    if (amount === null) return d.status(c.errors.repaid, 'bad');
    if (e.repaid_mnt + amount > e.amount_mnt) return d.status(c.errors['repaid-over'], 'bad');
    d.status(c.loading, 'busy');
    const { response, body } = await post(`/api/contributions/${e.id}/repay`, { amount_mnt: amount, updated_at: e.updated_at });
    if (!response.ok) {
      d.status(trouble(body), 'bad');
      if (body.error === 'conflict') await render();
      return;
    }
    ui.repaying = null;
    d.status(c.saved, 'ok');
    await render();
  });

  function repayBox(e: Entry): HTMLElement {
    const id = `contribution-${e.id}-repay`;
    const input = h('input', { type: 'text', inputmode: 'numeric', autocomplete: 'off', id, 'aria-describedby': `${id}-help` });
    const older = olderOutstanding(e);
    return h(
      'div',
      { class: 'f task__reason', 'data-repay': e.id },
      h('label', { class: 'f__label', for: id }, c.repay.label),
      input,
      h('p', { class: 'f__help', id: `${id}-help` }, c.repay.help),
      older
        ? h('p', { class: 'task__sent-back', 'data-older': older.id }, c.repay.older.replace('{date}', older.date_made).replace('{amount}', formatMnt(older.amount_mnt)).replace('{left}', formatMnt(older.amount_mnt - older.repaid_mnt)))
        : null,
      h('button', { type: 'button', class: 'btn btn--primary', 'data-repay-confirm': e.id, onclick: () => void repay(e, input.value) }, c.repay.confirm)
    );
  }

  /* ----------------------------------------------------------------- list */

  const shownValue = (field: Tracked, value: string) =>
    field === 'amount_mnt' || field === 'repaid_mnt' ? money(Number(value)) : field === 'kind' ? (c.kinds[value] ?? value) : field === 'member_id' ? nameOf(value) : value;

  function row(e: Entry): HTMLElement {
    const mine = changes.filter((ch) => ch.contribution_id === e.id);
    const details = h(
      'details',
      { class: 'group group--item task', open: ui.open.has(e.id) || ui.editing === e.id || ui.repaying === e.id, 'data-entry': e.id, 'data-late': e.late ? 'true' : undefined },
      h(
        'summary',
        { class: 'row' },
        h('span', { class: 'row__ord' }, e.date_made),
        h(
          'span',
          { class: 'row__text' },
          h('span', { class: 'row__title' }, h('span', { 'data-money': '' }, money(e.amount_mnt)), ` — ${e.what_for}`),
          h('span', { class: 'row__sub' }, [nameOf(e.member_id), c.kinds[e.kind] ?? e.kind, e.receipt_held ? c.receipt.yes : c.receipt.no].join(' · '))
        ),
        e.late ? h('span', { class: 'task__overdue', 'data-marker': 'late' }, c.late) : null
      ),
      h(
        'div',
        { class: 'group__body task__body' },
        ui.editing === e.id
          ? form(e)
          : h(
              'div',
              {},
              e.late ? h('p', { class: 'task__sent-back', 'data-late-row': '' }, c.lateRow.replace('{days}', String(e.days))) : null,
              repayable(e) ? h('p', { 'data-repaid': '' }, c.repaidLine.replace('{repaid}', formatMnt(e.repaid_mnt)).replace('{left}', formatMnt(e.amount_mnt - e.repaid_mnt))) : null,
              e.note ? h('p', { class: 'task__done' }, e.note) : null,
              h('p', { class: 'main__hint' }, c.recorded.replace('{date}', d.when(e.recorded_at)).replace('{who}', nameOf(e.created_by))),
              e.notified_at ? h('p', { class: 'main__hint' }, c.notified.replace('{date}', d.when(e.notified_at))) : h('p', { class: 'task__sent-back', 'data-not-notified': '' }, c.notNotified),
              h('p', { class: 'f__label' }, c.history.title),
              mine.length
                ? h(
                    'ul',
                    { class: 'ledger__history' },
                    ...mine.map((ch) =>
                      h(
                        'li',
                        {},
                        c.history.line
                          .replace('{date}', d.when(ch.at))
                          .replace('{who}', ch.who)
                          .replace('{field}', c.fields[ch.field] ?? ch.field)
                          .replace('{from}', shownValue(ch.field, ch.from_value))
                          .replace('{to}', shownValue(ch.field, ch.to_value))
                      )
                    )
                  )
                : h('p', { class: 'main__hint' }, c.history.none),
              h(
                'div',
                { class: 'img__buttons' },
                h('button', { type: 'button', class: 'btn btn--ghost', 'data-edit': e.id, onclick: () => ((ui.editing = e.id), (ui.repaying = null), void render()) }, c.edit),
                h('button', { type: 'button', class: 'btn btn--ghost', 'data-copy': e.id, onclick: () => copy(e) }, c.copy),
                repayable(e) && e.repaid_mnt < e.amount_mnt
                  ? h('button', { type: 'button', class: 'btn btn--ghost', 'data-repay-open': e.id, onclick: () => ((ui.repaying = ui.repaying === e.id ? null : e.id), void render()) }, c.repay.action)
                  : null
              ),
              ui.repaying === e.id ? repayBox(e) : null
            )
      )
    );
    details.addEventListener('toggle', () => (details.open ? ui.open.add(e.id) : ui.open.delete(e.id)));
    return details;
  }

  /** The strip: one row per Member, the figures people open this for. Not yet due — said under it, every time. */
  function strip(): HTMLElement {
    const s = c.summary;
    const cell = (n: number) => h('td', { 'data-money': '' }, money(n));
    return h(
      'section',
      { class: 'ledger', 'data-summary': '' },
      h(
        'table',
        { class: 'ledger__table' },
        h('caption', { class: 'f__label' }, s.title),
        h('thead', {}, h('tr', {}, ...[s.member, s.principal, s.repaid, s.outstanding, s.owed].map((label) => h('th', { scope: 'col' }, label)))),
        h(
          'tbody',
          {},
          ...summary.map((m) => h('tr', { 'data-standing': m.member_id }, h('th', { scope: 'row' }, m.name), cell(m.principal), cell(m.repaid), cell(m.outstanding), cell(m.owed)))
        )
      ),
      h('p', { class: 'main__hint', 'data-not-due': '' }, s.notDue)
    );
  }

  const render = guarded(async () => {
    if (!d.showing('contributions')) return;
    const list = h('div', { class: 'inbox__list', 'data-list': 'contributions' }, h('p', { class: 'main__hint' }, c.loading));
    const top = h('div', { class: 'task__new' });
    const head = h('div', {});
    const bar = h('div', { class: 'inbox__filters tasks__bar', role: 'group', 'aria-label': c.filters.member });
    d.main().replaceChildren(
      h(
        'div',
        { class: 'main__head' },
        h('h1', { class: 'main__title' }, t.views.contributions),
        h('button', { type: 'button', class: 'btn btn--primary', 'data-new-entry': '', onclick: () => ((ui.editing = 'new'), void render()) }, c.new)
      ),
      h('div', { class: 'main__about' }, h('p', {}, c.help)),
      head,
      bar,
      top,
      list,
      h('p', { class: 'main__keys' }, t.keys)
    );
    d.showPage();

    const { response, body } = await d.worker(`/api/contributions${ui.member ? `?member=${ui.member}` : ''}`);
    if (!d.showing('contributions')) return;
    if (!response.ok) return void list.replaceChildren(h('div', { class: 'main__hint' }, ...d.said(trouble(body), `${response.status} ${String(body.error ?? '')}`)));
    items = (body.items ?? []) as Entry[];
    people = (body.people ?? []) as Person[];
    summary = (body.summary ?? []) as Standing[];
    changes = (body.events ?? []) as Change[];

    head.replaceChildren(strip());
    const who = h('select', { id: 'contributions-filter-member', 'aria-label': c.filters.member }, h('option', { value: '' }, `${c.filters.member}: ${c.filters.any}`), ...summary.map((m) => h('option', { value: m.member_id, selected: m.member_id === ui.member }, `${c.filters.member}: ${m.name}`)));
    who.addEventListener('change', () => ((ui.member = who.value), void render()));
    bar.replaceChildren(who);

    if (ui.editing === 'new') top.replaceChildren(form(null));
    if (!items.length) return void list.replaceChildren(h('p', { class: 'main__hint' }, c.empty));
    list.replaceChildren(...items.map(row));
  });

  return {
    hasDraft,
    render,
    /** Ctrl+S here: save the open form, if there is one. */
    save: () => saveOpen?.(),
  };
}
