/**
 * The admin's «Хавсралт 2» — Schedule 2 of the founder agreement, the money
 * Members put into the Company — over the Worker's /api/contributions routes
 * (worker/contributions.ts).
 *
 * Loaded only when «Хавсралт 2» is opened (src/scripts/admin.ts > tools), with
 * its own words (src/content/admin-contributions.ts): none of it is in the
 * admin's first load. Built from the admin's own parts, handed in, like the
 * task list — and walled off: every entry point catches, says so on the
 * status line, and the rest of the admin carries on.
 *
 * What it is for, in the order people open it: the strip — per Member,
 * principal, repaid, outstanding, outstanding × 1.5 (not yet due), the
 * uplift paid, and how much carries clause 5.1's mark — then the entries,
 * newest first. The form counts 5.1's days as the date is typed, once the
 * agreement is in force: it warns, and never changes the kind — whether late
 * money is a gift is the Members' conclusion, not the form's. «Хуулах» is
 * the recurring entry. A repayment is its own row, principal and interest
 * apart (5.2(e)).
 *
 * Money is whole tugrik here too: typed digits are read by parseMnt, shown by
 * formatMnt, and never pass through a float.
 */
import type { admin as Copy } from '../content/admin';
import { contributions as c } from '../content/admin-contributions';
import { CONTRIBUTION_GUIDE, KINDS, daysBetween, fiveOneApplies, formatMnt, isDate, parseMnt, RECORD_WITHIN_DAYS, ubDateOf, ubToday, type Kind, type Tracked } from '../lib/contribution-codes';

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
  note: string | null;
  created_by: string;
  notified_at: string | null;
  /** Worked out by the Worker, once: days from the money moving to its record, whether 5.1 runs for it, and whether it is late. */
  days: number;
  applies: boolean;
  late: boolean;
  repaid_principal: number;
  repaid_interest: number;
}
interface Member {
  id: string;
  name: string;
  editor_id: string | null;
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
  interest: number;
  late: number;
}
interface Repayment {
  id: string;
  created_at: string;
  contribution_id: string;
  paid_on: string;
  /** Negative on a reversal. */
  principal_mnt: number;
  interest_mnt: number;
  note: string | null;
  reverses?: string | null;
  reason?: string | null;
  who: string;
}
interface Change {
  contribution_id: string;
  at: string;
  who: string;
  field: Tracked;
  from_value: string;
  to_value: string;
  notified_at?: string | null;
}
/** What setting the agreement's date would mean (worker/contributions.ts > consequences). */
interface Consequences {
  date: string;
  year: number;
  future: boolean;
  before: { count: number; total: number };
  from: { count: number; total: number; late: number };
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
  /** Where this tool keeps its drafts — the core shows their dot in the tree without loading the tool. */
  draftPrefix: () => string;
  showing: (kind: string) => boolean;
}

const FIELDS = ['member_id', 'date_made', 'amount_mnt', 'what_for', 'receipt_held', 'kind', 'note'] as const;
type Field = (typeof FIELDS)[number];
type Values = Record<Field, string>;

export function createContributions(d: ContributionDeps) {
  const { h, t } = d;
  const ui = { member: '', open: new Set<string>(), editing: null as string | null, repaying: null as string | null, reversing: null as string | null, settingAgreement: false };
  let items: Entry[] = [];
  let members: Member[] = [];
  let people: Person[] = [];
  let summary: Standing[] = [];
  let repayments: Repayment[] = [];
  let changes: Change[] = [];
  let inForceFrom: string | null = null;
  let saveOpen: (() => void) | null = null;

  const money = (n: number) => c.amount.replace('{amount}', formatMnt(n));
  const memberName = (id: string) => members.find((m) => m.id === id)?.name ?? summary.find((s) => s.member_id === id)?.name ?? t.removedPerson;
  const editorName = (id: string) => people.find((p) => p.id === id)?.name ?? t.removedPerson;
  const outstanding = (e: Entry) => e.amount_mnt - e.repaid_principal;
  const readDraft = (key: string): { base: string; values: Values } | null => {
    try {
      return JSON.parse(d.remember.get(d.draftPrefix() + key) ?? 'null');
    } catch {
      return null;
    }
  };

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

  /** Clause 5.1 for a date, as the form says it: no clock yet, not this money's, in time, or late. */
  const fiveOne = (date: string, recordedOn: string): { text: string; late: boolean } => {
    if (inForceFrom === null) return { text: c.elapsedNotInForce, late: false };
    if (!fiveOneApplies(date, inForceFrom)) return { text: c.elapsedBefore.replace('{date}', inForceFrom), late: false };
    const days = daysBetween(date, recordedOn);
    const late = days > RECORD_WITHIN_DAYS;
    return { text: (late ? c.elapsedLate : c.elapsed).replace('{days}', String(days)), late };
  };

  /* ----------------------------------------------------------------- form */

  const blank = (): Values => ({
    // The signed-in editor's own Member, when they are one; otherwise chosen.
    member_id: members.find((m) => m.editor_id && m.editor_id === d.me()?.id)?.id ?? '',
    date_made: ubToday(),
    amount_mnt: '',
    what_for: '',
    receipt_held: 'false',
    kind: 'loan',
    note: '',
  });
  const valuesOf = (e: Entry): Values => ({
    member_id: e.member_id,
    date_made: e.date_made,
    amount_mnt: formatMnt(e.amount_mnt),
    what_for: e.what_for,
    receipt_held: String(e.receipt_held),
    kind: e.kind,
    note: e.note ?? '',
  });

  function form(entry: Entry | null): HTMLElement {
    const key = entry ? entry.id : 'new';
    const stored = readDraft(key);
    const start = entry ? valuesOf(entry) : blank();
    const values: Values = { ...start, ...(stored?.values ?? {}) };
    // The day clause 5.1 is counted to: today, for a new entry; its own, for one already made.
    const recordedOn = entry ? ubDateOf(entry.recorded_at) : ubToday();
    const inputs = {} as Record<Field, HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>;
    const read = (field: Field) => {
      const input = inputs[field];
      return input instanceof HTMLInputElement && input.type === 'checkbox' ? String(input.checked) : input.value;
    };
    const keepDraft = () => {
      const same = FIELDS.every((f) => values[f] === start[f]);
      d.remember.set(d.draftPrefix() + key, same ? null : JSON.stringify({ base: entry?.updated_at ?? '', values }));
      d.renderNav();
    };

    const id = (field: Field) => `contribution-${key}-${field}`;
    // Members, never editors: someone signed in is not thereby a Member (4.9).
    const memberOptions = (): [string, string][] => {
      const options = members.map((m) => [m.id, m.name] as [string, string]);
      if (values.member_id && !members.some((m) => m.id === values.member_id)) options.unshift([values.member_id, t.removedPerson]);
      return values.member_id ? options : [['', '—'], ...options];
    };
    const select = (field: Field, options: [string, string][]) => h('select', { id: id(field) }, ...options.map(([value, label]) => h('option', { value, selected: values[field] === value }, label)));
    const make: Record<Field, () => HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement> = {
      member_id: () => select('member_id', memberOptions()),
      date_made: () => h('input', { type: 'date', id: id('date_made'), value: values.date_made, max: recordedOn }),
      amount_mnt: () => h('input', { type: 'text', inputmode: 'numeric', autocomplete: 'off', id: id('amount_mnt'), value: values.amount_mnt }),
      what_for: () => h('input', { type: 'text', id: id('what_for'), value: values.what_for }),
      receipt_held: () => h('input', { type: 'checkbox', id: id('receipt_held'), checked: values.receipt_held === 'true' }),
      kind: () => select('kind', KINDS.map((k) => [k, c.kinds[k]])),
      note: () => h('textarea', { id: id('note'), rows: 2, value: values.note }),
    };

    // Clause 5.1, counted as the date is typed: said before saving, never after. It warns — it never changes the kind.
    const elapsed = h('p', { class: 'f__count ledger__elapsed', role: 'status', 'aria-live': 'polite', 'data-elapsed': '', id: `${id('date_made')}-elapsed` });
    const recount = () => {
      const date = inputs.date_made.value;
      if (!isDate(date)) return void ((elapsed.textContent = ''), (elapsed.dataset.late = ''));
      if (date > recordedOn) return void ((elapsed.textContent = c.errors['date-future']), (elapsed.dataset.late = ''));
      const said = fiveOne(date, recordedOn);
      elapsed.textContent = said.text;
      elapsed.dataset.late = said.late ? 'true' : 'false';
    };

    const rows = FIELDS.map((field) => {
      const input = (inputs[field] = make[field]());
      const helpId = `${id(field)}-help`;
      input.setAttribute('aria-describedby', field === 'date_made' ? `${helpId} ${elapsed.id}` : helpId);
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
      const help = h('p', { class: 'f__help', id: helpId }, c.fieldHelp[field]);
      if (field === 'receipt_held') return h('div', { class: 'f', 'data-field': field }, h('label', { class: 'f__row', for: input.id }, input, h('span', {}, c.fields[field])), help);
      return h('div', { class: 'f', 'data-field': field }, h('label', { class: 'f__label', for: input.id }, c.fields[field]), input, field === 'date_made' ? elapsed : null, count, help);
    });
    recount();

    const save = guarded(async () => {
      for (const field of FIELDS) values[field] = read(field).trim();
      // The Worker refuses all of these too; saying so here saves a round trip.
      const amount = parseMnt(values.amount_mnt);
      if (!values.member_id) return d.status(c.errors.member, 'bad');
      if (!isDate(values.date_made)) return d.status(c.errors.date, 'bad');
      if (values.date_made > recordedOn) return d.status(c.errors['date-future'], 'bad');
      if (amount === null) return d.status(c.errors.amount, 'bad');
      if (!values.what_for) return d.status(c.errors['what-for'], 'bad');
      if (entry?.late && !fiveOne(values.date_made, recordedOn).late) return d.status(c.errors['late-is-permanent'], 'bad');
      if (entry && amount < entry.repaid_principal) return d.status(c.errors['amount-below-repaid'], 'bad');
      d.status(c.loading, 'busy');
      const payload = {
        member_id: values.member_id,
        date_made: values.date_made,
        amount_mnt: amount,
        what_for: values.what_for,
        receipt_held: values.receipt_held === 'true',
        kind: values.kind,
        note: values.note,
        ...(entry ? { updated_at: stored?.base || entry.updated_at } : {}),
      };
      const { response, body } = await post(entry ? `/api/contributions/${entry.id}` : '/api/contributions', payload);
      if (!response.ok) {
        d.status(trouble(body), 'bad');
        if (body.error === 'conflict' || body.error === 'not-found') await render();
        return;
      }
      d.remember.set(d.draftPrefix() + key, null);
      ui.editing = null;
      saveOpen = null;
      d.status(c.saved, 'ok');
      await render();
    });
    saveOpen = () => void save();

    const cancel = () => {
      d.remember.set(d.draftPrefix() + key, null);
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
    const values: Values = { ...valuesOf(e), date_made: ubToday(), receipt_held: 'false' };
    d.remember.set(d.draftPrefix() + 'new', JSON.stringify({ base: '', values }));
    ui.editing = 'new';
    d.status(c.copied);
    // Unsaved until saved: the tree shows its dot like any other draft.
    d.renderNav();
    void render();
  };

  /* ------------------------------------------------------------ repayment */

  /** The oldest loan of this Member, older than this one, with principal still outstanding — or null. */
  const olderOutstanding = (e: Entry) =>
    items
      .filter((o) => o.id !== e.id && o.member_id === e.member_id && o.kind === 'loan' && outstanding(o) > 0 && (o.date_made < e.date_made || (o.date_made === e.date_made && o.recorded_at < e.recorded_at)))
      .sort((a, b) => (a.date_made < b.date_made ? -1 : a.date_made > b.date_made ? 1 : a.recorded_at < b.recorded_at ? -1 : 1))[0] ?? null;

  function repayBox(e: Entry): HTMLElement {
    const id = (field: string) => `contribution-${e.id}-repay-${field}`;
    const inputs = {
      paid_on: h('input', { type: 'date', id: id('paid_on'), value: ubToday(), min: e.date_made, max: ubToday() }),
      principal_mnt: h('input', { type: 'text', inputmode: 'numeric', autocomplete: 'off', id: id('principal_mnt') }),
      interest_mnt: h('input', { type: 'text', inputmode: 'numeric', autocomplete: 'off', id: id('interest_mnt') }),
      note: h('input', { type: 'text', id: id('note') }),
    };
    const older = olderOutstanding(e);
    const submit = guarded(async () => {
      const principal = inputs.principal_mnt.value.trim() ? parseMnt(inputs.principal_mnt.value, { allowZero: true }) : 0;
      if (principal === null) return d.status(c.errors.principal, 'bad');
      const interest = inputs.interest_mnt.value.trim() ? parseMnt(inputs.interest_mnt.value, { allowZero: true }) : 0;
      if (interest === null) return d.status(c.errors.interest, 'bad');
      if (principal === 0 && interest === 0) return d.status(c.errors['repayment-empty'], 'bad');
      const paidOn = inputs.paid_on.value;
      if (!isDate(paidOn) || paidOn < e.date_made || paidOn > ubToday()) return d.status(c.errors['repaid-date'], 'bad');
      if (e.repaid_principal + principal > e.amount_mnt) return d.status(c.errors['repaid-over'], 'bad');
      d.status(c.loading, 'busy');
      const { response, body } = await post(`/api/contributions/${e.id}/repay`, { paid_on: paidOn, principal_mnt: principal, interest_mnt: interest, note: inputs.note.value.trim() });
      if (!response.ok) return void d.status(trouble(body), 'bad');
      ui.repaying = null;
      d.status(c.saved, 'ok');
      await render();
    });
    return h(
      'div',
      { class: 'f task__reason ledger__repay', 'data-repay': e.id },
      ...(Object.keys(inputs) as (keyof typeof inputs)[]).map((field) => {
        const input = inputs[field];
        input.setAttribute('aria-describedby', `${id(field)}-help`);
        return h('div', { class: 'f' }, h('label', { class: 'f__label', for: input.id }, c.repay.fields[field]), input, h('p', { class: 'f__help', id: `${id(field)}-help` }, c.repay.help[field]));
      }),
      older
        ? h('p', { class: 'task__sent-back', 'data-older': older.id }, c.repay.older.replace('{date}', older.date_made).replace('{amount}', formatMnt(older.amount_mnt)).replace('{left}', formatMnt(outstanding(older))))
        : null,
      h('p', { class: 'main__hint' }, c.repay.appendOnly),
      h('button', { type: 'button', class: 'btn btn--primary', 'data-repay-confirm': e.id, onclick: () => void submit() }, c.repay.confirm)
    );
  }

  /* ------------------------------------------------------------ reversal */

  /** A wrong repayment, reversed by a row of its own with a reason — the original stays, and is marked. */
  const reverse = guarded(async (e: Entry, r: Repayment, reason: string) => {
    if (!reason.trim()) return d.status(c.errors['reversal-reason'], 'bad');
    d.status(c.loading, 'busy');
    const { response, body } = await post(`/api/contributions/${e.id}/repayments/${r.id}/reverse`, { reason: reason.trim() });
    if (!response.ok) return void d.status(trouble(body), 'bad');
    ui.reversing = null;
    d.status(c.saved, 'ok');
    await render();
  });

  function repaymentLine(e: Entry, r: Repayment, all: Repayment[]): HTMLElement {
    if (r.reverses) {
      return h(
        'li',
        { 'data-reversal': r.reverses },
        c.reversal.line
          .replace('{date}', d.when(r.created_at))
          .replace('{principal}', formatMnt(-r.principal_mnt))
          .replace('{interest}', formatMnt(-r.interest_mnt))
          .replace('{reason}', r.reason ?? '')
          .replace('{who}', r.who)
      );
    }
    const reversed = all.some((other) => other.reverses === r.id);
    const id = `contribution-${e.id}-reverse-${r.id}`;
    const reason = h('textarea', { id, rows: 2, 'aria-describedby': `${id}-help` });
    return h(
      'li',
      { 'data-repayment': r.id, 'data-reversed': reversed ? 'true' : undefined },
      c.repay.line.replace('{date}', r.paid_on).replace('{principal}', formatMnt(r.principal_mnt)).replace('{interest}', formatMnt(r.interest_mnt)).replace('{who}', r.who),
      r.note ? ` · ${r.note}` : '',
      reversed ? h('span', { class: 'task__overdue', 'data-marker': 'reversed' }, c.reversal.reversed) : null,
      reversed
        ? null
        : h('button', { type: 'button', class: 'btn btn--ghost', 'data-reverse-open': r.id, onclick: () => ((ui.reversing = ui.reversing === r.id ? null : r.id), void render()) }, c.reversal.action),
      !reversed && ui.reversing === r.id
        ? h(
            'div',
            { class: 'f task__reason', 'data-reverse': r.id },
            h('label', { class: 'f__label', for: id }, c.reversal.label),
            reason,
            h('p', { class: 'f__help', id: `${id}-help` }, c.reversal.help),
            h('button', { type: 'button', class: 'btn btn--primary', 'data-reverse-confirm': r.id, onclick: () => void reverse(e, r, reason.value) }, c.reversal.confirm)
          )
        : null
    );
  }

  /* ----------------------------------------------------------- agreement */

  /**
   * Setting the agreement's date: once, and only after seeing what it will
   * mean. The confirmation is offered only for the date previewed — change
   * the date and it goes — and carries the counts it was shown, so the
   * Worker refuses it if they have changed since.
   */
  function agreementBox(): HTMLElement {
    const id = 'contribution-agreement-date';
    const input = h('input', { type: 'date', id, 'aria-describedby': `${id}-help` });
    const shown = h('div', { class: 'ledger__preview', 'data-agreement-preview': '', role: 'status', 'aria-live': 'polite' });
    let previewed: Consequences | null = null;
    const confirm = h('button', { type: 'button', class: 'btn btn--primary', 'data-agreement-confirm': '', disabled: true }, c.agreement.confirm);
    const show = (p: Consequences) => {
      previewed = p;
      shown.replaceChildren(
        ...[
          h('p', { 'data-agreement-year': String(p.year) }, c.agreement.year.replace('{year}', String(p.year)).replace('{date}', p.date)),
          p.future ? h('p', { class: 'task__sent-back' }, c.agreement.future) : null,
          h('p', { 'data-agreement-before': String(p.before.count) }, c.agreement.before.replace('{count}', String(p.before.count)).replace('{total}', formatMnt(p.before.total))),
          h('p', { 'data-agreement-after': String(p.from.count), 'data-agreement-late': String(p.from.late) }, c.agreement.after.replace('{count}', String(p.from.count)).replace('{total}', formatMnt(p.from.total)).replace('{late}', String(p.from.late))),
          h('p', { class: 'task__sent-back' }, c.agreement.final),
        ].filter((line): line is HTMLParagraphElement => line !== null)
      );
      confirm.disabled = false;
    };
    // A different date is a different consequence: the preview, and the confirmation with it, go.
    input.addEventListener('input', () => ((previewed = null), shown.replaceChildren(), (confirm.disabled = true)));
    const preview = guarded(async () => {
      if (!isDate(input.value)) return d.status(c.errors['agreement-date'], 'bad');
      const { response, body } = await d.worker(`/api/contributions/agreement?date=${input.value}`);
      if (!response.ok) return void d.status(trouble(body), 'bad');
      d.status('');
      show(body.preview as Consequences);
    });
    confirm.addEventListener('click', () =>
      void guarded(async () => {
        if (!previewed || previewed.date !== input.value) return d.status(c.agreement.previewFirst, 'bad');
        d.status(c.loading, 'busy');
        const { response, body } = await post('/api/contributions/agreement', { in_force_from: previewed.date, seen: { before: previewed.before.count, from: previewed.from.count, late: previewed.from.late } });
        if (!response.ok) {
          d.status(trouble(body), 'bad');
          if (body.preview) show(body.preview as Consequences);
          if (body.error === 'agreement-set') await render();
          return;
        }
        ui.settingAgreement = false;
        d.status(c.agreement.set, 'ok');
        await render();
      })()
    );
    return h(
      'div',
      { class: 'f task__reason', 'data-agreement-form': '' },
      h('label', { class: 'f__label', for: id }, c.agreement.label),
      input,
      h('p', { class: 'f__help', id: `${id}-help` }, c.agreement.help),
      h('div', { class: 'img__buttons' }, h('button', { type: 'button', class: 'btn btn--ghost', 'data-agreement-preview-button': '', onclick: () => void preview() }, c.agreement.preview)),
      shown,
      h('div', { class: 'img__buttons' }, confirm, h('button', { type: 'button', class: 'btn btn--ghost', onclick: () => ((ui.settingAgreement = false), d.status(''), void render()) }, c.agreement.cancel))
    );
  }

  /* ----------------------------------------------------------------- list */

  const shownValue = (field: Tracked, value: string) =>
    field === 'amount_mnt' ? money(Number(value)) : field === 'kind' ? (c.kinds[value] ?? value) : field === 'member_id' ? memberName(value) : value;

  function row(e: Entry): HTMLElement {
    const mine = changes.filter((ch) => ch.contribution_id === e.id);
    const paid = repayments.filter((r) => r.contribution_id === e.id);
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
          h('span', { class: 'row__sub' }, [memberName(e.member_id), c.kinds[e.kind] ?? e.kind, e.receipt_held ? c.receipt.yes : c.receipt.no].join(' · '))
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
              e.kind === 'loan'
                ? h('p', { 'data-repaid': '' }, c.repaidLine.replace('{repaid}', formatMnt(e.repaid_principal)).replace('{interest}', formatMnt(e.repaid_interest)).replace('{left}', formatMnt(outstanding(e))))
                : null,
              e.note ? h('p', { class: 'task__done' }, e.note) : null,
              h('p', { class: 'main__hint' }, c.recorded.replace('{date}', d.when(e.recorded_at)).replace('{who}', editorName(e.created_by))),
              e.notified_at ? h('p', { class: 'main__hint' }, c.notified.replace('{date}', d.when(e.notified_at))) : h('p', { class: 'task__sent-back', 'data-not-notified': '' }, c.notNotified),
              e.kind === 'loan' ? h('p', { class: 'f__label' }, c.repay.title) : null,
              paid.length
                ? h('ul', { class: 'ledger__history', 'data-repayments': e.id }, ...paid.map((r) => repaymentLine(e, r, paid)))
                : e.kind === 'loan'
                  ? h('p', { class: 'main__hint' }, c.repay.none)
                  : null,
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
                          .replace('{to}', shownValue(ch.field, ch.to_value)),
                        // A change of kind is told to the Member: whether it was, beside it.
                        ch.field === 'kind' ? h('span', { 'data-told': ch.notified_at ? 'true' : 'false' }, ` · ${ch.notified_at ? c.history.told : c.history.notTold}`) : null
                      )
                    )
                  )
                : h('p', { class: 'main__hint' }, c.history.none),
              h(
                'div',
                { class: 'img__buttons' },
                h('button', { type: 'button', class: 'btn btn--ghost', 'data-edit': e.id, onclick: () => ((ui.editing = e.id), (ui.repaying = null), void render()) }, c.edit),
                h('button', { type: 'button', class: 'btn btn--ghost', 'data-copy': e.id, onclick: () => copy(e) }, c.copy),
                e.kind === 'loan' && outstanding(e) > 0
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
        h('thead', {}, h('tr', {}, ...[s.member, s.principal, s.repaid, s.outstanding, s.owed, s.interest, s.late].map((label) => h('th', { scope: 'col' }, label)))),
        h(
          'tbody',
          {},
          ...summary.map((m) =>
            h('tr', { 'data-standing': m.member_id }, h('th', { scope: 'row' }, m.name), cell(m.principal), cell(m.repaid), cell(m.outstanding), cell(m.owed), cell(m.interest), cell(m.late))
          )
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
    members = (body.members ?? []) as Member[];
    people = (body.people ?? []) as Person[];
    summary = (body.summary ?? []) as Standing[];
    repayments = (body.repayments ?? []) as Repayment[];
    changes = (body.events ?? []) as Change[];
    inForceFrom = ((body.agreement as { in_force_from?: string | null } | undefined)?.in_force_from ?? null) || null;

    // Whether 5.1's clock runs at all — said first, because it decides what «late» can mean.
    const agreement = h('p', { class: 'main__hint', 'data-agreement': inForceFrom ?? '' }, inForceFrom ? c.agreement.from.replace('{date}', inForceFrom) : c.agreement.none);
    // Unset, it can be set here — once, after its preview.
    const setting = inForceFrom
      ? null
      : ui.settingAgreement
        ? agreementBox()
        : h('div', { class: 'img__buttons' }, h('button', { type: 'button', class: 'btn btn--ghost', 'data-agreement-open': '', onclick: () => ((ui.settingAgreement = true), void render()) }, c.agreement.open));
    head.replaceChildren(agreement, ...(setting ? [setting] : []), strip());
    const who = h('select', { id: 'contributions-filter-member', 'aria-label': c.filters.member }, h('option', { value: '' }, `${c.filters.member}: ${c.filters.any}`), ...summary.map((m) => h('option', { value: m.member_id, selected: m.member_id === ui.member }, `${c.filters.member}: ${m.name}`)));
    who.addEventListener('change', () => ((ui.member = who.value), void render()));
    bar.replaceChildren(who);

    if (ui.editing === 'new') top.replaceChildren(form(null));
    if (!items.length) return void list.replaceChildren(h('p', { class: 'main__hint' }, c.empty));
    list.replaceChildren(...items.map(row));
  });

  return {
    render,
    /** Ctrl+S here: save the open form, if there is one. */
    save: () => saveOpen?.(),
  };
}
