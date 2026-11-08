/**
 * The admin's word check, run by the admin page's build
 * (src/pages/admin/index.astro): what the admin would show without Mongolian
 * words, each problem a line. Build-only — it reads the tools' words too
 * (src/content/admin-tasks.ts, src/content/admin-contributions.ts), and the
 * admin's own script must not, or those would ride in its first load
 * instead of loading with their tools.
 */
import type { admin as Core } from '../content/admin';
import type { tasks as TaskWords } from '../content/admin-tasks';
import type { contributions as ContributionWords } from '../content/admin-contributions';
import { MOVES, TASK_PROJECTS, TASK_STATES } from '../lib/task-codes.ts';
import { KINDS, TRACKED } from '../lib/contribution-codes.ts';
import { CODES, GROUPS, LIMITS, VIEWS, allFields, isHidden, summaryRule, text, whereFor, type Obj, type Path } from './admin-schema.ts';

/** Every word the admin says: the core, and each tool's own. */
export type AllWords = typeof Core & { tasks: typeof TaskWords; contributions: typeof ContributionWords };

const shape = (path: Path) => path.map((segment) => (typeof segment === 'number' ? '*' : segment)).join('.');

/**
 * What the admin would show without Mongolian words: each problem a line.
 * Empty means every field, section, group, list, length and value has them.
 */
export function checkAdmin(seed: Obj, t: AllWords): string[] {
  const problems = new Set<string>();
  const fields = allFields(seed);
  const off = (path: Path) => VIEWS.some((v) => v.off && v.parts.some((part) => path[0] === part));

  for (const { path, kind } of fields) {
    const key = path[path.length - 1];
    // Every name a field is shown under. An item of a list is shown by its number.
    if (typeof key === 'string' && !t.labels[key]) problems.add(`no label for "${key}" (${shape(path)})`);
    // A line of help under every field and list; a section that is off says so instead.
    if (kind !== 'group' && !off(path) && !whereFor(path, t)) problems.add(`no help saying where ${shape(path)} shows`);
    // Every list of things names its rows.
    if (kind === 'things' && !summaryRule(path)) problems.add(`no row summary for the list ${shape(path)}`);
  }

  // Every section's every key is in some view, hidden, or under a view that is off.
  for (const [section, value] of Object.entries(seed)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    for (const key of Object.keys(value)) {
      const path = [section, key];
      if (isHidden(path)) continue;
      const home = VIEWS.some((v) => v.parts.some((part) => part === section || part === `${section}.${key}`));
      if (!home) problems.add(`${section}.${key} is in no view: give it a home, or hide it in RULES`);
    }
  }

  for (const view of VIEWS) {
    if (!t.views[view.id]) problems.add(`no name for the view "${view.id}"`);
    if (!t.viewHelp[view.id]) problems.add(`no description for the view "${view.id}"`);
  }
  for (const group of GROUPS) if (!t.groups[group]) problems.add(`no name for the group "${group}"`);
  for (const says of new Set(Object.values(LIMITS).map((limit) => limit.says))) {
    if (!t.limits.says[says]) problems.add(`no words for the length consequence "${says}"`);
  }
  for (const status of ['new', 'read', 'replied', 'closed']) {
    if (!t.inbox.statuses[status]) problems.add(`no name for the enquiry status "${status}"`);
  }
  // The task list: every code src/lib/task-codes.ts names has its words here.
  for (const state of TASK_STATES) if (!t.tasks.states[state]) problems.add(`no name for the task state "${state}"`);
  for (const project of TASK_PROJECTS) if (!t.tasks.projects[project]) problems.add(`no name for the task project "${project}"`);
  for (const name of Object.keys(MOVES)) if (!t.tasks.moves[name]) problems.add(`no words for the task move "${name}"`);
  for (const field of ['title', 'done_means', 'project', 'owner_id', 'approver_id', 'due_date']) {
    if (!t.tasks.fields[field]) problems.add(`no label for the task field "${field}"`);
    if (!t.tasks.fieldHelp[field]) problems.add(`no help under the task field "${field}"`);
  }
  for (const code of ['title', 'done-means', 'done-means-repeats-title', 'project', 'owner', 'approver', 'due', 'reason-required', 'not-approver', 'bad-transition', 'approved']) {
    if (!t.tasks.errors[code]) problems.add(`no sentence for the task error "${code}"`);
  }
  const slots: Record<string, string[]> = { assigned: ['{who}', '{title}', '{done}'], submitted: ['{who}', '{by}', '{title}'], sentBack: ['{who}', '{title}', '{reason}'] };
  for (const [message, needs] of Object.entries(slots)) {
    const words = (t.tasks.notify as Record<string, string>)[message] ?? '';
    if (!needs.every((slot) => words.includes(slot))) problems.add(`the task Telegram message "${message}" needs its words, with ${needs.join(', ')}`);
  }
  if (!t.work.group) problems.add('no name for «Ажил» in the tree');
  if (!t.work.badgeMine.includes('{n}') || !t.work.badgeApprove.includes('{n}')) problems.add('the task badge needs its two sentences, with {n}');
  if (!t.toolFailed) problems.add('no words for a tool that did not load');
  for (const [name, rule] of Object.entries(MOVES)) {
    if (!rule.reason) continue;
    if (!t.tasks.reasons[name] || !t.tasks.reasonHelp[name] || !t.tasks.reasonRequired[name]) problems.add(`the task move "${name}" needs a reason's label, help and refusal`);
  }
  if (!t.removedPerson) problems.add('no words for a person who is no longer an editor');
  for (const part of ['submitted', 'approved', 'sentBack', 'reopened', 'overdue']) {
    if (!(t.tasks.report as Record<string, string>)[part]) problems.add(`no heading for the Тайлан's "${part}"`);
  }
  if (!['{date}', '{who}'].every((slot) => t.tasks.report.when.includes(slot))) problems.add("the Тайлан's fact line needs {date} and {who}");
  if (!t.tasks.report.reason?.includes('{reason}')) problems.add("the Тайлан's reason line needs {reason}");
  // Schedule 2: every field, kind and refusal src/lib/contribution-codes.ts and the Worker name has its words.
  const c = t.contributions;
  if (!t.views.contributions || !t.preview.contributions) problems.add('«Хавсралт 2» needs its name in the tree and its preview sentence');
  const contributionFields = ['member_id', 'date_made', 'amount_mnt', 'what_for', 'receipt_held', 'kind', 'note'];
  for (const field of contributionFields) {
    if (!c.fields[field]) problems.add(`no label for the Schedule 2 field "${field}"`);
    if (!c.fieldHelp[field]) problems.add(`no help under the Schedule 2 field "${field}"`);
  }
  for (const field of TRACKED) if (!contributionFields.includes(field)) problems.add(`the tracked Schedule 2 field "${field}" has no label`);
  for (const field of ['paid_on', 'principal_mnt', 'interest_mnt', 'note']) {
    if (!c.repay.fields[field] || !c.repay.help[field]) problems.add(`the Schedule 2 repayment field "${field}" needs its label and help`);
  }
  for (const kind of KINDS) if (!c.kinds[kind]) problems.add(`no name for the Schedule 2 kind "${kind}"`);
  const contributionErrors = ['member', 'date', 'date-future', 'amount', 'what-for', 'receipt', 'kind', 'note', 'late-is-permanent', 'amount-below-repaid', 'gift-has-repayments', 'gift-not-repaid'];
  const repaymentErrors = ['principal', 'interest', 'repayment-empty', 'repaid-over', 'repaid-date', 'repayment-note', 'not-found', 'reversal-reason', 'already-reversed', 'reversal-of-reversal'];
  const agreementErrors = ['agreement-date', 'agreement-set', 'agreement-preview-first', 'agreement-preview-stale'];
  for (const code of agreementErrors) if (!c.errors[code]) problems.add(`no sentence for the Schedule 2 error "${code}"`);
  for (const part of ['open', 'label', 'help', 'preview', 'confirm', 'cancel', 'future', 'final', 'previewFirst', 'set']) {
    if (!(c.agreement as Record<string, string>)[part]) problems.add(`no words for setting the agreement's date: "${part}"`);
  }
  for (const part of ['action', 'label', 'help', 'confirm', 'reversed']) {
    if (!(c.reversal as Record<string, string>)[part]) problems.add(`no words for reversing a repayment: "${part}"`);
  }
  if (!c.history.told || !c.history.notTold) problems.add('a change of kind needs words for whether the Member was told');
  for (const code of [...contributionErrors, ...repaymentErrors]) {
    if (!c.errors[code]) problems.add(`no sentence for the Schedule 2 error "${code}"`);
  }
  for (const part of ['title', 'member', 'principal', 'repaid', 'outstanding', 'owed', 'interest', 'late', 'notDue']) {
    if (!(c.summary as Record<string, string>)[part]) problems.add(`no words for the Schedule 2 strip's "${part}"`);
  }
  const contributionSlots: [string, string | undefined, string[]][] = [
    ['notify', c.notify, ['{member}', '{amount}', '{what_for}']],
    ['agreement.none', c.agreement.none, []],
    ['agreement.from', c.agreement.from, ['{date}']],
    ['elapsed', c.elapsed, ['{days}']],
    ['elapsedLate', c.elapsedLate, ['{days}']],
    ['elapsedNotInForce', c.elapsedNotInForce, []],
    ['elapsedBefore', c.elapsedBefore, ['{date}']],
    ['lateRow', c.lateRow, ['{days}']],
    ['recorded', c.recorded, ['{date}', '{who}']],
    ['notified', c.notified, ['{date}']],
    ['repaidLine', c.repaidLine, ['{repaid}', '{interest}', '{left}']],
    ['amount', c.amount, ['{amount}']],
    ['repay.line', c.repay.line, ['{date}', '{principal}', '{interest}', '{who}']],
    ['repay.older', c.repay.older, ['{date}', '{amount}', '{left}']],
    ['repay.appendOnly', c.repay.appendOnly, []],
    ['reversal.line', c.reversal.line, ['{date}', '{principal}', '{interest}', '{reason}', '{who}']],
    ['agreement.year', c.agreement.year, ['{year}', '{date}']],
    ['agreement.before', c.agreement.before, ['{count}', '{total}']],
    ['agreement.after', c.agreement.after, ['{count}', '{total}', '{late}']],
    ['notifyKind', c.notifyKind, ['{member}', '{who}', '{from}', '{to}', '{date}', '{amount}', '{what_for}']],
    ['history.line', c.history.line, ['{date}', '{who}', '{field}', '{from}', '{to}']],
  ];
  for (const [name, words, needs] of contributionSlots) {
    if (!words || !needs.every((slot) => words.includes(slot))) problems.add(`the Schedule 2 words "${name}" need ${needs.join(', ')}`);
  }
  for (const filter of ['new', 'flagged', 'read', 'replied', 'closed']) {
    if (!t.inbox.filters[filter]) problems.add(`no name for the inbox filter "${filter}"`);
  }
  if (!t.notify.digest.includes('{n}') || !t.notify.flood.includes('{n}')) problems.add('the Telegram digest and flood messages need their words, with {n}');
  if (!t.alerts.limiter.includes('{when}')) problems.add('the limiter alert needs its words, with {when}');
  if (!t.alerts.drain.includes('{when}')) problems.add('the stuck-enquiry alert needs its words, with {when}');
  if (!t.notify.stuck.includes('{n}')) problems.add('the stuck-enquiry Telegram line needs its words, with {n}');
  if (!['{kind}', '{when}'].every((slot) => t.alerts.other.includes(slot))) problems.add('an alert of a kind with no words of its own needs words, with {kind} and {when}');
  for (const flag of ['name', 'contact', 'body', 'userAgent']) {
    if (!(t.inbox.flags as Record<string, string>)[flag]) problems.add(`no words for the enquiry flag "${flag}"`);
  }
  if (!['{field}', '{length}', '{max}'].every((slot) => t.inbox.flags.cut.includes(slot))) problems.add('a cut value needs its words, with {field}, {length} and {max}');
  for (const reason of ['content', 'image', 'claim', 'budget', 'contrast', 'labels', 'alt', 'seo', 'video', 'other']) {
    if (!t.publish.reasons[reason]) problems.add(`no sentence for a build that failed for "${reason}"`);
  }
  // The values an editor picks between in the contact form: each needs words a visitor reads.
  for (const group of (((seed.contact as Obj).form as Obj).groups as Obj[]) ?? []) {
    for (const option of (group.options as Obj[]) ?? []) {
      if (!text(option.label)) problems.add(`the contact option "${String(option.value)}" has no label`);
    }
  }
  return [...problems];
}
