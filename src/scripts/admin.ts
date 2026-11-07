/**
 * The admin (/admin/): where the team edits the site's words and images,
 * adds, removes and orders products, reads the enquiries, and publishes.
 *
 * It talks to Supabase directly — Auth to sign in, the REST API to read and
 * save, Storage to upload — with plain fetch, and to this site's Worker for
 * what needs a secret: publishing and following the build
 * (worker/publish.ts), the enquiries and the storage figure
 * (worker/inbox.ts). What it may do is decided by the database's row level
 * security and by the Worker, not here: a signed-in user who is not in
 * `editors` can read the content and nothing else.
 *
 * What it shows, and how — the tree, the hidden values, the row titles, the
 * length guidance — is src/scripts/admin-schema.ts; every word it says is
 * src/content/admin.ts. The forms are built from the content itself: site.ts
 * as written is the seed (embedded in the page), and what the database holds
 * for a section is laid over it exactly as the build lays it
 * (src/content/live.ts), so a form shows what will be published.
 *
 * Beside the form, the page it edits, live — the build that made this admin
 * also embeds the site as published, so the preview finds on the page the
 * words and images a field holds: it lights them up when the field is
 * focused, shows an edit as it is typed, and, the other way, opens the field
 * of whatever is clicked on the page. It finds them by their published text
 * and image paths, so it is a preview, not a render.
 *
 * Typing is never lost: every change is kept in this browser, per field,
 * until it is saved (drafts, below).
 *
 * Everything the user typed reaches the page through textContent and value,
 * never as HTML.
 */
import config from '../lib/supabase.json';
import { admin as t } from '../content/admin';
import { ENQUIRY_MAX } from '../lib/enquiry-limits';
import { overlay } from '../content/live';
import {
  GROUPS,
  PRODUCT_ON,
  PRODUCT_ORDER,
  SUMMARY,
  VIEWS,
  codesFor,
  helpFor,
  isGrowable,
  isHidden,
  isMedia,
  isObjectList,
  limitOf,
  matches,
  maxOf,
  pathKey,
  pathOf,
  sectionsOf,
  summaryRule,
  viewOf,
  whereFor,
  type Json,
  type Obj,
  type Path,
} from './admin-schema';

// ----------------------------------------------------------------- data

const root = document.getElementById('admin') as HTMLElement;
const embedded = JSON.parse((document.getElementById('admin-data') as HTMLElement).textContent ?? '{}') as {
  seed: Obj;
  published: Obj;
};
const seed = embedded.seed;
/** The site as the build that made this admin published it: what the preview shows. */
const published = embedded.published;
const seedItems = (seed.products as Obj).items as Obj[];
const publishedItems = () => (((published.products as Obj)?.items ?? []) as Obj[]);

const clone = <T extends Json>(value: T): T => JSON.parse(JSON.stringify(value));

/**
 * A copy to start something new from: images emptied of their uploads, and,
 * with `words`, every string emptied too.
 */
function blank(value: Json, words: boolean): Json {
  if (Array.isArray(value)) return value.map((item) => blank(item, words));
  if (value && typeof value === 'object') {
    const out: Obj = {};
    for (const [key, item] of Object.entries(value)) {
      if (key === 'upload') continue;
      out[key] = isMedia(value) && key === 'name' ? null : blank(item, words && key !== 'placeholder');
    }
    return out;
  }
  return typeof value === 'string' && words ? '' : value;
}

/** Optional parts of a product: absent until added, null once removed. Each makes its part from the product. */
const OPTIONAL: Record<string, (product: Obj) => Json> = {
  'product.href': () => '',
  'product.testimonial': () => blank(clone((((seed.products as Obj).pages as Obj).testimonial as Obj).stand), true),
  // A real old version, so `demo: false` said outright: left out, the build
  // would fill it from the first product's demo slot (src/content/live.ts),
  // and a real redesign's old picture would never show.
  'product.front.before': (product) => ({ ...(blank(clone((product.front as Obj).after), false) as Obj), demo: false }),
};
const optionalAt = (path: Path) => Object.keys(OPTIONAL).find((rule) => matches(rule, path));

interface Product {
  id: string;
  data: Obj;
}

/** What is open on the right: a view of the sections, a product, or the enquiries. */
type Ref = { kind: 'section'; id: string } | { kind: 'product'; id: string } | { kind: 'inbox' };
const refKey = (ref: Ref) => (ref.kind === 'inbox' ? 'inbox' : ref.kind === 'product' ? `product:${ref.id}` : ref.id);
const sameRef = (a: Ref, b: Ref) => refKey(a) === refKey(b);

let saved: Record<string, Obj> = {};
/** When each section and product was last saved, by anyone: 'hero', 'product:ezmath'. */
let savedAt: Record<string, number> = {};
/**
 * The exact updated_at each row had when this admin read it. A save sends it
 * back and writes only if the row still has it — if someone saved in
 * between, nothing is overwritten (Conflict, below). No entry: not in the
 * table yet, so the save inserts, and fails the same way if someone else
 * inserted first.
 */
let versions: Record<string, string> = {};
let products: Product[] = [];
let view: Ref = { kind: 'inbox' };
/** The open view's content, by root: a section's key, or `product`. */
let draft: Obj = {};
/** The draft as last loaded or saved: what "changed" is measured against. */
let baseline = '{}';
let dirty = false;
/** Groups and rows left open, so a redraw — a row moved, a part added — keeps them open. */
const openPaths = new Set<string>();

// -------------------------------------------------------------- session

interface Session {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  email: string;
  id: string;
}

class SignedOut extends Error {}
/** A save that found the row changed since it was read: someone else saved first. */
class Conflict extends Error {}
/** A refusal from Supabase or the Worker. The detail is for «Дэлгэрэнгүй», never the sentence. */
class Refused extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly detail: string
  ) {
    super(code || String(status));
  }
}

const STORE = 'anir-admin-session';
const remember = {
  get: (key: string) => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set: (key: string, value: string | null) => {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch {
      /* a private window: kept as long as the page */
    }
  },
  keys: () => {
    try {
      return Object.keys(localStorage);
    } catch {
      return [];
    }
  },
};

let session: Session | null = (() => {
  try {
    return JSON.parse(remember.get(STORE) ?? 'null') as Session | null;
  } catch {
    return null;
  }
})();

function keep(next: Session | null) {
  session = next;
  remember.set(STORE, next ? JSON.stringify(next) : null);
}

async function grant(type: 'password' | 'refresh_token', body: Record<string, string>): Promise<Session> {
  const response = await fetch(`${config.url}/auth/v1/token?grant_type=${type}`, {
    method: 'POST',
    headers: { apikey: config.publishableKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new SignedOut(String(response.status));
  const s = await response.json();
  return {
    access_token: s.access_token,
    refresh_token: s.refresh_token,
    expires_at: s.expires_at ?? Math.floor(Date.now() / 1000) + s.expires_in,
    email: s.user?.email ?? '',
    id: s.user?.id ?? '',
  };
}

async function token(): Promise<string> {
  if (!session) throw new SignedOut();
  if (session.expires_at - 60 < Date.now() / 1000) {
    try {
      keep(await grant('refresh_token', { refresh_token: session.refresh_token }));
    } catch {
      keep(null);
      throw new SignedOut();
    }
  }
  return (session as Session).access_token;
}

/** A Supabase call as the signed-in user. Answers the parsed JSON, or null. */
async function api(path: string, init: RequestInit = {}): Promise<unknown> {
  const response = await fetch(`${config.url}${path}`, {
    ...init,
    headers: { apikey: config.publishableKey, Authorization: `Bearer ${await token()}`, ...(init.headers ?? {}) },
  });
  if (response.status === 401) {
    keep(null);
    throw new SignedOut();
  }
  const text = await response.text();
  if (!response.ok) throw new Refused(response.status, /PGRST\d+/.exec(text)?.[0] ?? '', `${response.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

/**
 * A call to this site's Worker as the signed-in user, with a time limit.
 * Answers the response and its JSON; a host with no such route (a static
 * copy of the site) answers 404 with HTML, so the JSON is then {}.
 */
async function worker(path: string, init: RequestInit = {}, ms = 20000): Promise<{ response: Response; body: Record<string, unknown> }> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), ms);
  try {
    const response = await fetch(path, {
      ...init,
      signal: abort.signal,
      headers: { Authorization: `Bearer ${await token()}`, ...(init.headers ?? {}) },
    });
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (response.status === 401) {
      keep(null);
      throw new SignedOut();
    }
    return { response, body };
  } finally {
    clearTimeout(timer);
  }
}

/** A thrown error as the editor reads it: a sentence, and the detail behind «Дэлгэрэнгүй». */
function explain(error: unknown, sentence: string): { text: string; detail: string } {
  if (error instanceof Refused) return { text: sentence, detail: error.detail };
  // fetch rejects with a TypeError when the network is down, and aborts on our time limit.
  if (error instanceof TypeError || (error instanceof DOMException && error.name === 'AbortError')) return { text: t.network, detail: '' };
  return { text: sentence, detail: String((error as Error)?.message ?? error) };
}

// ------------------------------------------------------------------ dom

type Child = Node | string | null | false | undefined;

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Record<string, unknown> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === false || value === null) continue;
    if (key.startsWith('on')) el.addEventListener(key.slice(2), value as EventListener);
    else if (key === 'class') el.className = String(value);
    else if (key in el && key !== 'list' && !key.includes('-')) (el as unknown as Record<string, unknown>)[key] = value;
    else el.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children) if (child) el.append(child);
  return el;
}

let uid = 0;
const nextId = (prefix: string) => `${prefix}-${++uid}`;

const ordinal = (i: number) => t.list.ordinal.replace('{n}', String(i + 1));
const labelFor = (key: string | number) => (typeof key === 'number' ? ordinal(key) : (t.labels[key] ?? key));
const ellipsis = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

/** A field's line of help, under it — never a tooltip to find. */
function helpLine(path: Path, id?: string): HTMLElement | null {
  const text = helpFor(path, t);
  return text ? h('p', { class: 'f__help', id }, text) : null;
}

interface Action {
  label: string;
  run: () => void;
}

/** A sentence, a button for the next step, and the raw detail behind «Дэлгэрэнгүй» for whoever is debugging it. */
function said(text: string, detail = '', action?: Action): Child[] {
  return [
    h('span', {}, text),
    action ? h('button', { type: 'button', class: 'btn btn--ghost said__action', onclick: action.run }, action.label) : null,
    detail ? h('details', { class: 'said' }, h('summary', {}, t.detail), h('pre', {}, detail)) : null,
  ];
}

type Tone = 'ok' | 'bad' | 'busy' | '';
function paint(el: HTMLElement | null, text: string, tone: Tone, detail = '', action?: Action) {
  if (!el) return;
  el.replaceChildren(...((text ? said(text, detail, action) : []).filter(Boolean) as Node[]));
  el.dataset.tone = tone;
}

/*
  Two places say what is happening. The bar keeps the short states —
  «Хадгалаагүй өөрчлөлт байна», «Хадгаллаа». Anything with more to say — a
  failure, a next step, a build under way — goes on a line of its own under
  the bar, the full width of the screen, so a sentence never wraps the bar.
*/
let statusEl: HTMLElement | null = null;
let stripEl: HTMLElement | null = null;
let issueEl: HTMLElement | null = null;
let publishEl: HTMLElement | null = null;
let alertEl: HTMLElement | null = null;
const showStrip = () =>
  stripEl && (stripEl.hidden = !issueEl?.childNodes.length && !publishEl?.childNodes.length && !alertEl?.childNodes.length);

function status(text: string, tone: Tone = '', detail = '', action?: Action) {
  const loud = tone === 'bad' || !!detail || !!action;
  paint(statusEl, loud ? '' : text, loud ? '' : tone);
  paint(issueEl, loud ? text : '', loud ? tone : '', detail, action);
  showStrip();
}

function publishStatus(text: string, tone: Tone = '', detail = '') {
  paint(publishEl, text, tone, detail);
  showStrip();
}

/**
 * What the Worker recorded for a person to know (worker/alerts.ts > ALERT_KINDS):
 * the contact form's rate limiter letting everything through because it
 * could not reach KV, or any kind added since. Shown on the status line for
 * a day after it last happened, as a failed publish is — the latest in
 * words, every one in «Дэлгэрэнгүй». A kind with no words of its own is
 * shown by its code, never hidden.
 */
const ALERT_FOR_MS = 24 * 60 * 60 * 1000;
type Alert = { kind: string; last_at: string; detail: string | null };
const alertWords = (alert: Alert) =>
  (alert.kind === 'limiter-open' ? t.alerts.limiter : t.alerts.other.replace('{kind}', alert.kind)).replace('{when}', when(alert.last_at));
async function readAlerts() {
  if (!session || root.dataset.state !== 'ready') return;
  try {
    const { response, body } = await worker('/api/alerts');
    if (!response.ok) return;
    const recent = ((body.alerts ?? []) as Alert[])
      .filter((alert) => Date.now() - Date.parse(alert.last_at) < ALERT_FOR_MS)
      .sort((a, b) => Date.parse(b.last_at) - Date.parse(a.last_at));
    const latest = recent[0];
    const detail = recent.map((alert) => [alert === latest ? '' : alertWords(alert), alert.detail ?? ''].filter(Boolean).join('\n')).filter(Boolean).join('\n\n');
    paint(alertEl, latest ? alertWords(latest) : '', latest ? 'bad' : '', detail);
    showStrip();
  } catch {
    /* no word rather than a wrong one; the next check tries again */
  }
}

// --------------------------------------------------------------- drafts

/*
  Every change is kept in this browser as it is typed, field by field,
  until it is saved — so a closed tab or a crashed browser costs nothing. A
  draft holds only the fields that differ from what was loaded, so laying it
  back over content another editor has saved since changes only the fields
  this editor changed. A view left with unsaved changes keeps them: it gets
  a dot in the tree, and coming back to it in the same tab puts them back;
  from another visit, the admin asks first.
*/
interface Stored {
  at: number;
  fields: Record<string, Json>;
}
const DRAFT = 'anir-admin-draft';
const draftKey = (ref: Ref) => `${DRAFT}:${session?.id ?? ''}:${refKey(ref)}`;
/** Views whose draft this tab wrote: put back without asking. */
const ownDrafts = new Set<string>();

function readDraft(ref: Ref): Stored | null {
  try {
    const stored = JSON.parse(remember.get(draftKey(ref)) ?? 'null') as Stored | null;
    return stored && Object.keys(stored.fields).length ? stored : null;
  } catch {
    return null;
  }
}

/** Where `cur` differs from `base`: whole values at the deepest path where the shapes still agree. */
function differences(base: Json | undefined, cur: Json | undefined, path: Path, out: Record<string, Json>) {
  if (JSON.stringify(base) === JSON.stringify(cur)) return;
  const plain = (v: Json | undefined): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v) && !isMedia(v);
  if (plain(base) && plain(cur)) {
    for (const key of new Set([...Object.keys(base), ...Object.keys(cur)])) differences(base[key], cur[key], [...path, key], out);
    return;
  }
  if (Array.isArray(base) && Array.isArray(cur) && base.length === cur.length) {
    cur.forEach((item, i) => differences(base[i], item, [...path, i], out));
    return;
  }
  out[pathKey(path)] = cur === undefined ? null : clone(cur);
}

function writeDraft() {
  if (view.kind === 'inbox') return;
  let fields: Record<string, Json> = {};
  differences(JSON.parse(baseline), draft, [], fields);
  // A draft still waiting on «сэргээх үү?» is kept, under what is typed now.
  if (offered) fields = { ...offered.fields, ...fields };
  if (Object.keys(fields).length) {
    remember.set(draftKey(view), JSON.stringify({ at: Date.now(), fields } satisfies Stored));
    ownDrafts.add(refKey(view));
  } else {
    remember.set(draftKey(view), null);
    ownDrafts.delete(refKey(view));
  }
}

function setAt(target: Obj, path: Path, value: Json) {
  let node: Json | undefined = target;
  for (const segment of path.slice(0, -1)) {
    if (!node || typeof node !== 'object') return;
    node = (node as Record<string, Json>)[segment as string];
  }
  if (node && typeof node === 'object') (node as Record<string, Json>)[path[path.length - 1] as string] = clone(value);
}

function applyDraft(stored: Stored) {
  for (const [key, value] of Object.entries(stored.fields)) setAt(draft, pathOf(key), value);
}

/** When the open view's sections, or its product, were last saved by anyone. */
function lastSaved(ref: Ref): number {
  if (ref.kind === 'product') return savedAt[`product:${ref.id}`] ?? 0;
  if (ref.kind === 'inbox') return 0;
  return Math.max(0, ...sectionsOf(viewOf(ref.id)).map((key) => savedAt[key] ?? 0));
}

// ------------------------------------------------------------- changes

let saveButton: HTMLButtonElement | null = null;
let savedTimer = 0;
let navTimer = 0;

/** After any edit: is anything unsaved, keep the draft, and tell the page and the tree. */
function changed() {
  dirty = JSON.stringify(draft) !== baseline;
  writeDraft();
  if (saveButton) {
    clearTimeout(savedTimer);
    saveButton.disabled = !dirty;
    saveButton.textContent = t.save;
  }
  status(dirty ? t.unsaved : '', dirty ? 'busy' : '');
  stale = true;
  schedulePreview();
  clearTimeout(navTimer);
  navTimer = window.setTimeout(renderNav, 250);
}

function draftAt(path: Path): Json | undefined {
  let node: Json | undefined = draft;
  for (const segment of path) {
    if (node === null || node === undefined || typeof node !== 'object') return undefined;
    node = (node as Record<string, Json>)[segment as string];
  }
  return node;
}

// --------------------------------------------------------------- fields

/** One value's field. `set` writes the new value into the draft. */
function field(value: Json, path: Path, set: (next: Json) => void, depth: number): HTMLElement | null {
  if (isHidden(path)) return null;
  const key = path[path.length - 1];

  if (isMedia(value)) return imageField(value, path);
  if (Array.isArray(value)) return listField(value, path, set, depth);
  if (value && typeof value === 'object') return objectField(value, path, depth);

  const id = nextId('f');
  const helpId = nextId('h');
  const help = helpLine(path, helpId);

  if (typeof value === 'boolean') {
    const input = h('input', { type: 'checkbox', id, checked: value, 'aria-describedby': help ? helpId : undefined });
    input.addEventListener('change', () => (set(input.checked), changed()));
    return h('div', { class: 'f f--check', 'data-path': pathKey(path) }, h('label', { class: 'f__row', for: id }, input, h('span', { class: 'f__label' }, labelFor(key))), help);
  }

  if (typeof value === 'number') {
    const input = h('input', { type: 'number', id, step: 'any', value: String(value), 'aria-describedby': help ? helpId : undefined });
    input.addEventListener('input', () => {
      const n = Number(input.value);
      if (Number.isFinite(n)) (set(n), changed());
    });
    return h('div', { class: 'f', 'data-path': pathKey(path) }, h('label', { class: 'f__label', for: id }, labelFor(key)), input, help);
  }

  if (typeof value === 'string') {
    const long = value.length > 70 || value.includes('\n');
    const countId = nextId('c');
    const described = [help ? helpId : '', countId].filter(Boolean).join(' ');
    const input = long
      ? h('textarea', { id, rows: Math.min(8, Math.ceil(value.length / 70) + 1), value, 'aria-describedby': described })
      : h('input', { type: 'text', id, value, 'aria-describedby': described });
    // Guidance, never a block: past the measured length, a counter and what will happen.
    const limit = limitOf(path);
    const count = h('p', { class: 'f__count', id: countId, 'aria-live': 'polite' });
    const recount = () => {
      const over = !!limit && input.value.length > limit.max;
      count.hidden = !over;
      count.textContent = over
        ? t.limits.counter
            .replace('{len}', String(input.value.length))
            .replace('{n}', String(limit.max))
            .replace('{says}', t.limits.says[limit.says])
        : '';
    };
    input.addEventListener('input', () => (set(input.value), recount(), changed()));
    recount();
    return h('div', { class: 'f', 'data-path': pathKey(path) }, h('label', { class: 'f__label', for: id }, labelFor(key)), input, count, help);
  }

  return null;
}

/** A group that folds, open as it was left. */
function fold(path: Path, open: boolean, summary: HTMLElement, ...body: Child[]): HTMLDetailsElement {
  const key = pathKey(path);
  const details = h('details', { class: 'group', open: openPaths.has(key) || (open && !openPaths.has(`!${key}`)), 'data-fold': key }, summary, ...body);
  details.addEventListener('toggle', () => {
    openPaths.delete(details.open ? `!${key}` : key);
    openPaths.add(details.open ? key : `!${key}`);
  });
  return details;
}

function objectField(value: Obj, path: Path, depth: number): HTMLElement {
  const box = h('div', { class: 'group__body' });

  const keys = Object.keys(value);
  for (const rule of Object.keys(OPTIONAL)) {
    const parts = rule.split('.');
    if (parts.length === path.length + 1 && matches(parts.slice(0, -1).join('.'), path)) {
      const key = parts[parts.length - 1];
      if (!keys.includes(key)) keys.push(key);
    }
  }
  // A product's parts in the order its page shows them.
  if (path.length === 1 && path[0] === 'product') {
    keys.sort((a, b) => (PRODUCT_ORDER.indexOf(a) + 1 || 99) - (PRODUCT_ORDER.indexOf(b) + 1 || 99));
  }

  for (const key of keys) {
    const childPath = [...path, key];
    const optional = optionalAt(childPath);
    const child = value[key];

    if (optional && (child === undefined || child === null)) {
      box.append(
        h(
          'button',
          {
            type: 'button',
            class: 'btn btn--ghost',
            onclick: () => {
              value[key] = OPTIONAL[optional](draft.product as Obj);
              openPaths.add(pathKey(childPath));
              changed();
              renderMain();
            },
          },
          `${t.optional.add}: ${labelFor(key)}`
        )
      );
      continue;
    }
    if (child === undefined || child === null) continue;

    const el = field(child, childPath, (next) => (value[key] = next), depth + 1);
    if (!el) continue;
    if (optional) {
      el.append(
        h(
          'button',
          {
            type: 'button',
            class: 'btn btn--ghost btn--small',
            onclick: () => {
              value[key] = null;
              changed();
              renderMain();
            },
          },
          `${t.optional.remove}: ${labelFor(key)}`
        )
      );
    }
    box.append(el);
  }

  if (depth === 0) return box;
  const key = path[path.length - 1];
  const where = whereFor(path, t);
  return fold(
    path,
    depth < 2,
    h('summary', {}, h('span', { class: 'summary__name' }, labelFor(key))),
    h('div', { class: 'group__body', 'data-path': pathKey(path) }, where ? h('p', { class: 'f__help' }, where) : null, ...box.childNodes)
  );
}

/**
 * A new chip or question gets codes of its own (admin-schema.ts > CODES): a
 * question's name, and every option's value under it — never an empty one,
 * never one another item has.
 */
function coded(path: Path, item: Obj) {
  const code = (prefix: string) => `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
  const own = codesFor(path);
  if (own) for (const key of own.at) item[key] = code(own.prefix);
  for (const [key, value] of Object.entries(item)) {
    if (Array.isArray(value) && isObjectList(value)) {
      const inner = codesFor([...path, 0, key]);
      if (inner) for (const option of value as Obj[]) for (const at of inner.at) option[at] = code(inner.prefix);
    }
  }
}

/** ↑ ↓ ✕ for a row, at its right edge. ✕ asks once: the first press arms it, the second removes. */
function rowControls(list: Json[], i: number, rerender: () => void, label: string): HTMLElement {
  const stop = (e: Event) => (e.preventDefault(), e.stopPropagation());
  const move = (by: number) => (e: Event) => {
    stop(e);
    list.splice(i + by, 0, ...list.splice(i, 1));
    rerender();
  };
  const remove = h('button', { type: 'button', class: 'btn btn--icon', title: t.list.remove, 'aria-label': `${t.list.remove}: ${label}`, disabled: list.length <= 1 }, '✕');
  let armed = 0;
  remove.addEventListener('click', (e) => {
    stop(e);
    if (armed) {
      clearTimeout(armed);
      list.splice(i, 1);
      rerender();
      return;
    }
    remove.textContent = t.list.confirmRemove;
    remove.classList.add('btn--armed');
    remove.setAttribute('aria-label', `${t.list.confirmRemove} ${label}`);
    armed = window.setTimeout(() => {
      armed = 0;
      remove.textContent = '✕';
      remove.classList.remove('btn--armed');
      remove.setAttribute('aria-label', `${t.list.remove}: ${label}`);
    }, 4000);
  });
  return h(
    'span',
    { class: 'row__controls' },
    h('button', { type: 'button', class: 'btn btn--icon', title: t.moveUp, 'aria-label': `${t.moveUp}: ${label}`, disabled: i === 0, onclick: move(-1) }, t.list.up),
    h('button', { type: 'button', class: 'btn btn--icon', title: t.moveDown, 'aria-label': `${t.moveDown}: ${label}`, disabled: i === list.length - 1, onclick: move(1) }, t.list.down),
    remove
  );
}

function listField(list: Json[], path: Path, set: (next: Json) => void, depth: number): HTMLElement {
  const key = path[path.length - 1];
  const things = isObjectList(list);
  const growable = things || isGrowable(path);
  const max = maxOf(path);
  const rule = things ? summaryRule(path) : undefined;
  const body = h('div', { class: 'list', 'data-path': pathKey(path) });
  const where = whereFor(path, t);
  if (where) body.append(h('p', { class: 'f__help' }, where));

  const rerender = () => {
    set(list);
    changed();
    renderMain();
  };

  list.forEach((item, i) => {
    const itemPath = [...path, i];
    if (things) {
      // A row says what it holds: its title, a second muted line, its number small.
      const title = h('span', { class: 'row__title' });
      const sub = h('span', { class: 'row__sub' });
      const name = () => {
        const summary = rule ? SUMMARY[rule](item as Obj, t) : { title: '', sub: '' };
        title.textContent = summary.title ? ellipsis(summary.title, 60) : t.list.empty;
        title.classList.toggle('row__title--empty', !summary.title);
        sub.textContent = ellipsis(summary.sub, 90);
        sub.hidden = !summary.sub;
        return summary.title || t.list.empty;
      };
      const label = name();
      const row = fold(
        itemPath,
        false,
        h(
          'summary',
          { class: 'row' },
          h('span', { class: 'row__ord' }, ordinal(i)),
          h('span', { class: 'row__text' }, title, sub),
          growable ? rowControls(list, i, rerender, label) : null
        ),
        objectField(item as Obj, itemPath, 0)
      );
      row.classList.add('group--item');
      row.dataset.path = pathKey(itemPath);
      row.addEventListener('input', name);
      body.append(row);
    } else {
      const el = field(item, itemPath, (next) => (list[i] = next), depth + 1);
      if (el) body.append(h('div', { class: 'list__row' }, el, growable ? rowControls(list, i, rerender, ordinal(i)) : null));
    }
  });

  if (growable && list.length > 0) {
    const full = list.length >= max;
    body.append(
      h(
        'button',
        {
          type: 'button',
          class: 'btn btn--ghost',
          disabled: full,
          onclick: () => {
            const added = blank(clone(list[list.length - 1]), things);
            if (added && typeof added === 'object' && !Array.isArray(added)) coded(path, added);
            list.push(added);
            openPaths.add(pathKey([...path, list.length - 1]));
            rerender();
          },
        },
        full ? t.list.max.replace('{n}', String(max)) : t.list.add
      )
    );
  }

  return fold(path, depth < 2, h('summary', {}, h('span', { class: 'summary__name' }, labelFor(key), h('span', { class: 'summary__count' }, ` · ${list.length}`))), body);
}

// --------------------------------------------------------------- images

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
};
/** The media bucket's own limit (supabase/migrations/0002_content.sql), under the Free plan's 50 MB. */
const MAX_UPLOAD = 15 * 1024 * 1024;
/** Past this an upload is worth a word: it is kept whole in Storage, 1 GB in all. */
const BIG_UPLOAD = 8 * 1024 * 1024;

const bytes = (n: number) =>
  n >= 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(n % 1024 ** 3 ? 1 : 0)} GB` : n >= 1024 ** 2 ? `${(n / 1024 ** 2).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;

/** How much of Storage is used: read once from the Worker, or null where it cannot say (a preview). */
let storage: { used: number; limit: number } | null | undefined;
const storageLines = new Set<HTMLElement>();
async function readStorage(force = false) {
  if (storage !== undefined && !force) return;
  storage = null;
  try {
    const { response, body } = await worker('/api/storage');
    if (response.ok && typeof body.used === 'number') storage = { used: body.used, limit: Number(body.limit) };
  } catch {
    /* no figure rather than a made-up one */
  }
  // Lines whose field has been redrawn away are let go.
  for (const line of storageLines) (line.isConnected ? drawStorage(line) : storageLines.delete(line));
}
function drawStorage(line: HTMLElement) {
  line.hidden = !storage;
  if (storage) line.textContent = t.image.storage.replace('{used}', bytes(storage.used)).replace('{limit}', bytes(storage.limit));
}

const previewOf = (media: Obj): { src: string; note: string } | null => {
  if (typeof media.upload === 'string' && media.upload) {
    return { src: `${config.url}/storage/v1/object/public/media/${encodeURIComponent(media.upload)}`, note: t.image.uploaded };
  }
  if (typeof media.name === 'string' && media.name) return { src: `/media/${media.name}.jpg`, note: t.image.current };
  if (typeof media.src === 'string' && media.src && !media.src.startsWith('/media/placeholder/')) {
    return { src: media.src, note: t.image.current };
  }
  if (typeof media.placeholder === 'string') return { src: media.placeholder, note: t.image.placeholder };
  if (typeof media.src === 'string' && media.src) return { src: media.src, note: t.image.placeholder };
  return null;
};

/** What a chosen file will do, read in the browser before it is sent: a block, or warnings. */
async function judge(file: File, w: number, h: number): Promise<{ block: string; warnings: string[] }> {
  if (file.size > MAX_UPLOAD) {
    return { block: t.image.blocked.replace('{max}', bytes(MAX_UPLOAD)).replace('{size}', bytes(file.size)), warnings: [] };
  }
  const warnings: string[] = [];
  const fill = (text: string, extra: Record<string, string | number> = {}) =>
    Object.entries({ w, h, size: bytes(file.size), ...extra }).reduce((out, [key, value]) => out.replaceAll(`{${key}}`, String(value)), text);
  if (file.size > BIG_UPLOAD) warnings.push(fill(t.image.big));
  try {
    const bitmap = await createImageBitmap(file);
    const { width: iw, height: ih } = bitmap;
    bitmap.close();
    // The build cuts it to w × h, covering: smaller either way, it is stretched.
    if (iw < w || ih < h) warnings.push(fill(t.image.soft, { iw, ih }));
    else if (Math.abs(iw / ih - w / h) > 0.02 * (w / h)) warnings.push(fill(t.image.crop));
  } catch {
    /* a format this browser cannot open: the build reads it all the same */
  }
  return { block: '', warnings };
}

function imageField(media: Obj, path: Path): HTMLElement {
  const key = path[path.length - 1];
  const w = Number(media.width);
  const hgt = Number(media.height);
  const preview = h('div', { class: 'img__preview' });
  const note = h('p', { class: 'img__note' });
  const error = h('p', { class: 'img__error', role: 'alert' });
  const warn = h('div', { class: 'img__warn', 'aria-live': 'polite' });
  const usage = h('p', { class: 'img__size', hidden: true });
  storageLines.add(usage);
  drawStorage(usage);

  const draw = () => {
    preview.replaceChildren();
    const shown = previewOf(media);
    if (shown) {
      const img = h('img', { src: shown.src, alt: '', loading: 'lazy' });
      img.addEventListener('error', () => {
        img.remove();
        note.textContent = t.image.none;
      });
      preview.append(img);
    }
    // A demo slot never reaches the live site (site.ts > Media.demo), uploaded or not.
    note.textContent = media.demo === true ? t.image.demo : (shown?.note ?? t.image.none);
    pick.textContent = media.upload ? t.image.replace : t.image.choose;
    remove.hidden = !media.upload;
  };

  const file = h('input', { type: 'file', accept: Object.keys(EXTENSIONS).join(','), hidden: true });
  const pick = h('button', { type: 'button', class: 'btn', onclick: () => file.click() });
  const remove = h(
    'button',
    {
      type: 'button',
      class: 'btn btn--ghost',
      onclick: () => {
        delete media.upload;
        warn.replaceChildren();
        changed();
        draw();
      },
    },
    t.image.remove
  );

  file.addEventListener('change', async () => {
    const chosen = file.files?.[0];
    file.value = '';
    error.replaceChildren();
    warn.replaceChildren();
    if (!chosen) return;
    const extension = EXTENSIONS[chosen.type];
    if (!extension) return void (error.textContent = t.image.wrongType);
    const { block, warnings } = await judge(chosen, w, hgt);
    if (block) return void (error.textContent = block);
    warn.replaceChildren(...warnings.map((text) => h('p', {}, text)));

    pick.disabled = true;
    pick.textContent = t.image.uploading;
    const name = `${crypto.randomUUID()}.${extension}`;
    try {
      await api(`/storage/v1/object/media/${name}`, {
        method: 'POST',
        headers: { 'Content-Type': chosen.type, 'x-upsert': 'false' },
        body: chosen,
      });
      media.upload = name;
      changed();
      readStorage(true);
    } catch (err) {
      if (err instanceof SignedOut) return renderSignIn(t.signIn.expired);
      const { text, detail } = explain(err, t.image.uploadFailed);
      error.replaceChildren(...(said(text, detail).filter(Boolean) as Node[]));
    } finally {
      pick.disabled = false;
      draw();
    }
  });

  const limits = t.image.limits.replace('{max}', bytes(MAX_UPLOAD)).replace('{w}', String(w)).replace('{h}', String(hgt));
  const body = h(
    'div',
    { class: 'img' },
    preview,
    h(
      'div',
      { class: 'img__side' },
      note,
      h('p', { class: 'img__size' }, limits),
      usage,
      h('div', { class: 'img__buttons' }, pick, remove, file),
      error,
      warn,
      'alt' in media ? field(media.alt as Json, [...path, 'alt'], (next) => (media.alt = next), 9) : null
    )
  );
  draw();
  return h('div', { class: 'group group--image', 'data-path': pathKey(path) }, h('p', { class: 'group__title' }, labelFor(key)), helpLine(path), body);
}

// ---------------------------------------------------------------- views

let mainEl: HTMLElement;
let navEl: HTMLElement;

function sectionDraft(key: string): Obj {
  return overlay(seed[key], saved[key], key) as Obj;
}

function productDraft(product: Product): Obj {
  const template = seedItems.find((item) => item.id === product.id) ?? seedItems[0];
  return overlay(template, { ...product.data, id: product.id }, `products.items[${product.id}]`) as Obj;
}

/** A view's content as saved, by root. */
function contentOf(ref: Ref): Obj {
  if (ref.kind === 'product') return { product: clone(productDraft(products.find((p) => p.id === ref.id) as Product)) };
  if (ref.kind === 'inbox') return {};
  return Object.fromEntries(sectionsOf(viewOf(ref.id)).map((key) => [key, clone(sectionDraft(key))]));
}

/** A stored draft from another visit, waiting for the editor to say whether to put it back. */
let offered: Stored | null = null;

function select(next: Ref) {
  // Edits left unsaved are still on the preview's page: load it afresh.
  if (dirty) framePage = '';
  view = next;
  draft = contentOf(next);
  baseline = JSON.stringify(draft);
  offered = null;
  const stored = next.kind === 'inbox' ? null : readDraft(next);
  if (stored && ownDrafts.has(refKey(next))) applyDraft(stored);
  else if (stored) offered = stored;
  dirty = JSON.stringify(draft) !== baseline;
  stale = true;
  status(dirty ? t.unsaved : '', dirty ? 'busy' : '');
  renderNav();
  if (next.kind === 'inbox') renderInbox();
  else renderMain();
}

/** The list a view counts in the tree, as it is now. */
function countOf(ref: Ref): number | null {
  if (ref.kind !== 'section') return null;
  const v = viewOf(ref.id);
  if (!v.count) return null;
  const path = pathOf(v.count);
  const source = sameRef(ref, view) ? draft : contentOf(ref);
  const list = path.reduce<Json | undefined>((node, segment) => (node && typeof node === 'object' ? (node as Obj)[segment as string] : undefined), source);
  return Array.isArray(list) ? list.length : null;
}

const hasDraft = (ref: Ref) => (sameRef(ref, view) ? dirty : !!readDraft(ref));

function renderNav() {
  const item = (ref: Ref, label: string, extra: Child[] = [], off = false) =>
    h(
      'button',
      {
        type: 'button',
        class: `nav__item${off ? ' nav__item--off' : ''}`,
        'aria-current': sameRef(ref, view) ? 'true' : undefined,
        onclick: () => select(ref),
      },
      hasDraft(ref) ? h('span', { class: 'nav__dot', title: t.draft.dot, 'aria-label': t.draft.dot }) : null,
      h('span', { class: 'nav__name' }, label),
      ...extra
    );

  const viewItem = (id: string) => {
    const v = viewOf(id);
    const ref: Ref = { kind: 'section', id };
    const count = countOf(ref);
    return h(
      'li',
      {},
      item(ref, t.views[id], [count !== null ? h('span', { class: 'nav__count' }, ` · ${count}`) : null, v.off ? h('span', { class: 'nav__off' }, t.off) : null], v.off)
    );
  };
  const groupOf = (group: string) => VIEWS.filter((v) => v.group === group).map((v) => viewItem(v.id));

  const productItems = products.map((product, i) =>
    h(
      'li',
      { class: 'nav__product' },
      item({ kind: 'product', id: product.id }, String(product.data.name ?? product.id) || product.id),
      h('button', { type: 'button', class: 'btn btn--icon', title: t.moveUp, 'aria-label': `${t.moveUp}: ${product.data.name}`, disabled: i === 0, onclick: () => moveProduct(i, -1) }, t.list.up),
      h('button', { type: 'button', class: 'btn btn--icon', title: t.moveDown, 'aria-label': `${t.moveDown}: ${product.data.name}`, disabled: i === products.length - 1, onclick: () => moveProduct(i, 1) }, t.list.down)
    )
  );

  const unread = inbox.counts?.new ?? 0;
  const groups = GROUPS.flatMap((group) => {
    const title = h('p', { class: 'nav__title' }, t.groups[group], group === 'products' ? h('span', { class: 'nav__count' }, ` · ${products.length}`) : null);
    if (group !== 'products') return [title, h('ul', { class: 'nav__list' }, ...groupOf(group))];
    return [
      title,
      h('ul', { class: 'nav__list' }, ...productItems),
      h('button', { type: 'button', class: 'btn btn--ghost', onclick: () => renderNewProduct() }, t.addProduct),
      h('ul', { class: 'nav__list' }, ...groupOf(group)),
    ];
  });

  // A redraw must not take the keyboard away from someone moving through the tree.
  const focused = navEl.contains(document.activeElement) ? (document.activeElement as HTMLElement).textContent : null;
  navEl.replaceChildren(
    h('ul', { class: 'nav__list nav__list--first' }, h('li', {}, item({ kind: 'inbox' }, t.views.inbox, [unread ? h('span', { class: 'nav__badge', 'aria-label': `${t.inbox.statuses.new}: ${unread}` }, String(unread)) : null]))),
    ...groups,
    h('ol', { class: 'steps' }, ...t.steps.map((text) => h('li', {}, text)))
  );
  if (focused !== null) [...navEl.querySelectorAll('button')].find((b) => b.textContent === focused)?.focus();
}

function renderMain() {
  if (view.kind === 'inbox') return renderInbox();
  const v = view.kind === 'section' ? viewOf(view.id) : null;
  const title = view.kind === 'section' ? t.views[view.id] : String((draft.product as Obj).name || (draft.product as Obj).id);

  // A section the page code switches off is shown read only: no save, no field to type in.
  const off = !!v?.off;
  saveButton = off ? null : h('button', { type: 'button', class: 'btn btn--primary', disabled: !dirty, onclick: () => save() }, t.save);
  const head = h('div', { class: 'main__head' }, h('h1', { class: 'main__title' }, title), saveButton);

  // What this is, and where it shows.
  const page = pageOf(view);
  const about = h(
    'div',
    { class: 'main__about' },
    h('p', {}, v ? t.viewHelp[v.id] : t.productHelp),
    v?.off ? h('p', { class: 'main__off' }, h('span', { class: 'nav__off' }, t.off), ' ', t.offHelp) : null,
    h('p', { class: 'main__hint' }, v && (v.id === 'meta' || v.off) ? t.noPageAt : `${t.page}: ${page ?? `/products/${(draft.product as Obj)?.id}/`}`)
  );

  const banner = offered
    ? h(
        'div',
        { class: 'banner', role: 'status' },
        h('p', {}, t.draft.found),
        offered.at < lastSaved(view) ? h('p', { class: 'main__hint' }, t.draft.older) : null,
        h(
          'div',
          { class: 'img__buttons' },
          h('button', {
            type: 'button',
            class: 'btn btn--primary',
            onclick: () => {
              applyDraft(offered as Stored);
              offered = null;
              ownDrafts.add(refKey(view));
              changed();
              renderMain();
            },
          }, t.draft.restore),
          h('button', {
            type: 'button',
            class: 'btn btn--ghost',
            onclick: () => {
              offered = null;
              remember.set(draftKey(view), null);
              renderNav();
              renderMain();
            },
          }, t.draft.discard)
        )
      )
    : null;

  const extra =
    view.kind === 'product'
      ? h(
          'div',
          { class: 'main__meta' },
          h('p', { class: 'main__hint' }, t.heroCardsNote),
          h('button', { type: 'button', class: 'btn btn--danger', onclick: () => deleteProduct() }, t.deleteProduct)
        )
      : null;

  // A view's parts, each in place: a whole section's fields, or one piece of a section under its name.
  const form = v
    ? h(
        'div',
        { class: 'group__body' },
        ...v.parts.map((part) => {
          const path = pathOf(part);
          const value = draftAt(path);
          if (value === undefined || value === null) return null;
          return path.length === 1 ? objectField(value as Obj, path, 0) : field(value as Json, path, (next) => setAt(draft, path, next), 1);
        })
      )
    : objectField(draft.product as Obj, ['product'], 0);
  if (off) {
    for (const control of form.querySelectorAll('input, textarea, select, button')) (control as HTMLInputElement).disabled = true;
    form.dataset.readonly = '';
  }

  const scroll = mainEl.scrollTop;
  mainEl.replaceChildren(head, banner ?? '', about, extra ?? '', form, h('p', { class: 'main__keys' }, t.keys));
  mainEl.scrollTop = scroll;
  showPage();
}

// --------------------------------------------------------------- inbox

/*
  The enquiries, from the Worker (worker/inbox.ts) — the browser never
  reads the table. Opening one shows it in full and changes nothing; marking
  it is a click, so a page visited by accident never hides a new enquiry
  from the next person. Nothing here deletes: closing sets a status.
*/
interface Enquiry {
  id: string;
  created_at: string;
  service: string;
  budget: string;
  timing: string;
  name: string;
  contact: string;
  message: string | null;
  status: string;
  status_changed_at: string | null;
  status_changed_by: string | null;
  /** What did not look as the form sends it, stored as sent (migration 0005). */
  unrecognised?: string[];
  /** Answers to questions added in the admin, by the question's code. */
  answers?: Record<string, string>;
}

/** Why an enquiry is worth a second look, in words: each field it was stored with unmatched, or cut. */
function flagsOf(enquiry: Enquiry): string[] {
  const form = ((published.contact as Obj)?.form ?? {}) as Obj;
  const groups = (form.groups ?? []) as Obj[];
  const inputs = (form.fields ?? {}) as Record<string, Obj>;
  return (enquiry.unrecognised ?? []).map((field) => {
    if (field === 'name') return t.inbox.flags.name;
    if (field === 'contact') return t.inbox.flags.contact;
    if (field === 'body') return t.inbox.flags.body;
    // cut:<field>:<characters it came with> — kept to its limit, the rest cut (worker/enquiry.ts).
    if (field.startsWith('cut:')) {
      const [, part, length] = field.split(':');
      const label = part === 'user_agent' ? t.inbox.flags.userAgent : String(inputs[part]?.label ?? groups.find((g) => g.name === part)?.legend ?? part);
      const max = (ENQUIRY_MAX as Record<string, number>)[part] ?? ENQUIRY_MAX.choice;
      return t.inbox.flags.cut.replace('{field}', label).replace('{length}', length ?? '?').replace('{max}', String(max));
    }
    const value = (enquiry as unknown as Record<string, unknown>)[field] ?? enquiry.answers?.[field] ?? '';
    const legend = String(groups.find((g) => g.name === field)?.legend ?? field);
    return t.inbox.flags.choice.replace('{legend}', legend).replace('{value}', String(value));
  });
}
const inbox: { status: string; counts: Record<string, number> | null; open: Set<string> } = { status: 'new', counts: null, open: new Set() };

const when = (iso: string) => {
  const d = new Date(iso);
  const two = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${two(d.getMonth() + 1)}.${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}`;
};

/** A chip's words, as the form showed them: «Төсөв: 1–3 сая». */
function chip(group: string, value: string): string {
  const groups = (((published.contact as Obj)?.form as Obj)?.groups ?? []) as Obj[];
  const found = groups.find((g) => g.name === group);
  const option = ((found?.options ?? []) as Obj[]).find((o) => o.value === value);
  return `${found?.legend ?? group}: ${option?.label ?? value}`;
}

/** The inbox's own refusals, as sentences. */
function inboxTrouble(response: Response, body: Record<string, unknown>): { text: string; detail: string } {
  if (response.status === 404 || response.status === 405) return { text: t.inbox.missing, detail: '' };
  if (body.error === 'not-configured') return { text: t.inbox.notConfigured, detail: '' };
  if (body.error === 'not-editor') return { text: t.signIn.notEditor, detail: '' };
  return { text: t.inbox.failed, detail: `${response.status} ${String(body.error ?? '')} ${String(body.detail ?? '')}`.trim() };
}

async function readCounts() {
  if (!session || root.dataset.state !== 'ready') return;
  try {
    const { response, body } = await worker('/api/enquiries?status=new');
    if (response.ok && body.counts) {
      inbox.counts = body.counts as Record<string, number>;
      renderNav();
    }
  } catch (error) {
    if (error instanceof SignedOut) renderSignIn(t.signIn.expired);
  }
}

async function renderInbox() {
  if (view.kind !== 'inbox') return;
  saveButton = null;
  const list = h('div', { class: 'inbox__list' }, h('p', { class: 'main__hint' }, t.inbox.loading));
  const filters = h('div', { class: 'inbox__filters', role: 'group', 'aria-label': t.inbox.title });
  const head = h(
    'div',
    { class: 'main__head' },
    h('h1', { class: 'main__title' }, t.inbox.title),
    h('button', { type: 'button', class: 'btn btn--ghost', onclick: () => renderInbox() }, t.inbox.refresh)
  );
  mainEl.replaceChildren(head, h('div', { class: 'main__about' }, h('p', {}, t.inbox.help)), filters, list, h('p', { class: 'main__keys' }, t.keys));
  showPage();

  let response: Response;
  let body: Record<string, unknown>;
  try {
    ({ response, body } = await worker(`/api/enquiries?status=${inbox.status}`));
  } catch (error) {
    if (error instanceof SignedOut) return renderSignIn(t.signIn.expired);
    const { text, detail } = explain(error, t.inbox.failed);
    return void list.replaceChildren(h('div', { class: 'main__hint' }, ...said(text, detail)));
  }
  if (view.kind !== 'inbox') return;
  if (!response.ok) {
    const { text, detail } = inboxTrouble(response, body);
    return void list.replaceChildren(h('div', { class: 'main__hint' }, ...said(text, detail)));
  }

  inbox.counts = body.counts as Record<string, number>;
  renderNav();
  // «Шинэ» is new and unflagged — what the badge counts; «Шалгах», new with something to check.
  filters.replaceChildren(
    ...Object.keys(t.inbox.filters).map((filter) =>
      h(
        'button',
        {
          type: 'button',
          class: 'btn btn--ghost inbox__filter',
          'aria-pressed': filter === inbox.status ? 'true' : 'false',
          onclick: () => ((inbox.status = filter), renderInbox()),
        },
        `${t.inbox.filters[filter]} · ${inbox.counts?.[filter] ?? 0}`
      )
    )
  );

  const items = (body.items ?? []) as Enquiry[];
  if (!items.length) return void list.replaceChildren(h('p', { class: 'main__hint' }, t.inbox.empty));
  list.replaceChildren(
    ...items.map((enquiry) => {
      const first = (enquiry.message ?? '').split('\n').find((line) => line.trim()) ?? '';
      const link = enquiry.contact.includes('@') ? `mailto:${enquiry.contact}` : `tel:${enquiry.contact.replace(/[^\d+]/g, '')}`;
      const details = h(
        'details',
        { class: 'group group--item enquiry', open: inbox.open.has(enquiry.id) },
        h(
          'summary',
          { class: 'row' },
          h('span', { class: 'row__ord' }, when(enquiry.created_at)),
          h(
            'span',
            { class: 'row__text' },
            h('span', { class: 'row__title' }, `${enquiry.name} · ${enquiry.contact}`),
            h('span', { class: 'row__sub' }, `${enquiry.unrecognised?.length ? `${t.inbox.flags.title} · ` : ''}${first ? ellipsis(first, 90) : t.inbox.noMessage}`)
          )
        ),
        h(
          'div',
          { class: 'group__body enquiry__body' },
          h('p', { class: 'enquiry__message' }, enquiry.message || t.inbox.noMessage),
          flagsOf(enquiry).length
            ? h('div', { class: 'enquiry__flags' }, h('p', {}, t.inbox.flags.title), ...flagsOf(enquiry).map((text) => h('p', {}, text)))
            : null,
          h(
            'p',
            { class: 'main__hint' },
            [
              chip('service', enquiry.service),
              chip('budget', enquiry.budget),
              chip('timing', enquiry.timing),
              ...Object.entries(enquiry.answers ?? {}).map(([group, value]) => chip(group, value)),
            ].join(' · ')
          ),
          h('p', {}, h('a', { href: link, class: 'enquiry__contact' }, enquiry.contact)),
          enquiry.status_changed_at
            ? h(
                'p',
                { class: 'main__hint' },
                t.inbox.changed
                  .replace('{status}', t.inbox.statuses[enquiry.status] ?? enquiry.status)
                  .replace('{who}', enquiry.status_changed_by ?? '—')
                  .replace('{when}', when(enquiry.status_changed_at))
              )
            : null,
          h(
            'div',
            { class: 'img__buttons' },
            ...Object.keys(t.inbox.mark)
              .filter((status) => status !== enquiry.status)
              .map((status) => h('button', { type: 'button', class: 'btn btn--ghost', onclick: () => mark(enquiry.id, status) }, t.inbox.mark[status]))
          )
        )
      );
      details.addEventListener('toggle', () => (details.open ? inbox.open.add(enquiry.id) : inbox.open.delete(enquiry.id)));
      return details;
    })
  );

  async function mark(id: string, next: string) {
    try {
      const { response, body } = await worker(`/api/enquiries/${encodeURIComponent(id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      if (!response.ok) {
        const { text, detail } = inboxTrouble(response, body);
        return status(text, 'bad', detail);
      }
      status('');
      renderInbox();
    } catch (error) {
      if (error instanceof SignedOut) return renderSignIn(t.signIn.expired);
      const { text, detail } = explain(error, t.inbox.failed);
      status(text, 'bad', detail);
    }
  }
}

// --------------------------------------------------------------- preview

/*
  The page beside the form: the site's own page in a frame — same origin, so
  the admin can reach into it (scripts/headers.mjs lets only this site frame
  itself). A desktop view is the page at 1440 wide, scaled to fit; a phone
  view, at 390.
*/

let previewEl: HTMLElement | null = null;
let frame: HTMLIFrameElement | null = null;
let framePage = '';
let previewNote: HTMLElement | null = null;
let device: 'desktop' | 'phone' = 'desktop';

/** Where a view shows: its page, or null where it shows on none. */
function pageOf(ref: Ref): string | null {
  const items = publishedItems();
  if (ref.kind === 'inbox') return null;
  if (ref.kind === 'section') {
    const v = viewOf(ref.id);
    if (v.off) return null;
    // The product pages' shared words: shown on the first product's page.
    if (v.id === 'productPages') return items[0] ? `/products/${items[0].id}/` : null;
    // What is on every page stays on whichever page is showing.
    if (v.group === 'site') return framePage || '/';
    return v.page ?? '/';
  }
  return items.some((item) => item.id === ref.id) ? `/products/${ref.id}/` : null;
}

/** What the published page holds at a path: a section's, or the open product's. */
function publishedAt(path: Path, ref: Ref = view): Json | undefined {
  let node: Json | undefined =
    path[0] === 'product' ? publishedItems().find((item) => ref.kind === 'product' && item.id === ref.id) : published[path[0] as string];
  for (const segment of path.slice(1)) {
    if (node === null || node === undefined || typeof node !== 'object') return undefined;
    node = (node as Record<string, Json>)[segment as string];
  }
  return node;
}

function fit() {
  if (!previewEl || !frame) return;
  const box = previewEl.querySelector('.preview__stage') as HTMLElement;
  const width = device === 'desktop' ? 1440 : 390;
  const scale = Math.min(1, box.clientWidth / width);
  frame.style.width = `${width}px`;
  frame.style.height = `${box.clientHeight / scale}px`;
  frame.style.left = `${Math.max(0, (box.clientWidth - width * scale) / 2)}px`;
  frame.style.transform = `scale(${scale})`;
}

function showPage() {
  if (!previewEl || previewEl.hidden) return;
  const page = pageOf(view);
  const stage = previewEl.querySelector('.preview__stage') as HTMLElement;
  if (!page) {
    frame?.remove();
    frame = null;
    framePage = '';
    const why = view.kind === 'inbox' ? t.preview.inbox : view.kind === 'section' && viewOf(view.id).off ? t.offHelp : t.preview.noPage;
    stage.replaceChildren(h('p', { class: 'preview__empty' }, why));
    return;
  }
  if (frame && framePage === page) return void schedulePreview();
  framePage = page;
  frame = h('iframe', { class: 'preview__frame', src: page, title: t.preview.show });
  frame.addEventListener('load', () => {
    found.clear();
    swapped.clear();
    stale = true;
    const doc = frame?.contentDocument;
    if (!doc) return;
    const style = doc.createElement('style');
    style.textContent = `.__admin-mark { outline: 3px solid #ff3300 !important; outline-offset: 4px !important; }
      .__admin-hover { outline: 1px dashed #ff3300 !important; outline-offset: 3px !important; cursor: pointer !important; }`;
    doc.head.append(style);
    doc.addEventListener('click', pickOnPage, true);
    doc.addEventListener('mouseover', hoverOnPage, true);
    applyPreview();
  });
  stage.replaceChildren(frame);
  fit();
}

const norm = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();

/** Where a published text sits on the page: its text nodes, or the smallest elements that hold just it. */
const found = new Map<string, (Text | Element)[]>();
function findText(key: string, text: string): (Text | Element)[] {
  if (found.has(key)) return found.get(key) as (Text | Element)[];
  const doc = frame?.contentDocument;
  const want = norm(text);
  let hits: (Text | Element)[] = [];
  if (doc && want) {
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (norm(node.nodeValue) === want) hits.push(node as Text);
    }
    if (hits.length === 0) {
      const holders = [...doc.body.querySelectorAll('*')].filter(
        (el) => el.children.length > 0 && el.tagName !== 'SCRIPT' && el.tagName !== 'STYLE' && norm(el.textContent) === want
      );
      hits = holders.filter((el) => !holders.some((other) => other !== el && el.contains(other)));
    }
  }
  found.set(key, hits);
  return hits;
}

const marksOf = (media: Obj | undefined) =>
  media
    ? [
        typeof media.name === 'string' && media.name ? `/media/${media.name}.` : '',
        typeof media.src === 'string' ? media.src : '',
        typeof media.placeholder === 'string' ? media.placeholder : '',
      ].filter(Boolean)
    : [];

/** Where a published image sits on the page: the <img>s showing it. */
function findImages(media: Obj | undefined): HTMLImageElement[] {
  const doc = frame?.contentDocument;
  const marks = marksOf(media);
  if (!doc || !marks.length) return [];
  // An image already showing an upload is found by what it showed before.
  return [...doc.querySelectorAll('img')].filter((img) => {
    const src = swapped.get(img) ?? img.getAttribute('src') ?? '';
    return marks.some((mark) => src.includes(mark));
  });
}

const swapped = new Map<HTMLImageElement, string>();

/** The draft shown on the page: every word that differs from what is published, and every new upload. */
function applyPreview() {
  if (!frame?.contentDocument || view.kind === 'inbox') return;

  const walk = (d: Json | undefined, p: Json | undefined, path: Path) => {
    if (typeof d === 'string' && typeof p === 'string') {
      const key = pathKey(path);
      if (d === p && !found.has(key)) return;
      for (const hit of findText(key, p)) hit.textContent = d;
      return;
    }
    if (isMedia(d as Json)) {
      const media = d as Obj;
      for (const img of findImages(p as Obj | undefined)) {
        if (!swapped.has(img)) swapped.set(img, img.getAttribute('src') ?? '');
        const upload = typeof media.upload === 'string' && media.upload ? media.upload : '';
        const src = upload ? `${config.url}/storage/v1/object/public/media/${encodeURIComponent(upload)}` : (swapped.get(img) as string);
        if (img.getAttribute('src') !== src) {
          img.src = src;
          img.parentElement?.querySelectorAll('source').forEach((source) => source.remove());
        }
      }
      if (typeof media.alt === 'string' && p && typeof (p as Obj).alt === 'string') walk(media.alt, (p as Obj).alt, [...path, 'alt']);
      return;
    }
    if (d && typeof d === 'object' && p && typeof p === 'object') {
      for (const key of Object.keys(d)) walk((d as Record<string, Json>)[key], (p as Record<string, Json>)[key], [...path, key]);
    }
  };
  for (const key of Object.keys(draft)) walk(draft[key], publishedAt([key]), [key]);
}

let previewTimer = 0;
function schedulePreview() {
  clearTimeout(previewTimer);
  previewTimer = window.setTimeout(applyPreview, 120);
}

/** Lights up on the page what the field in focus holds — and scrolls to it. */
let marked: Element[] = [];
function mark(path: Path) {
  const doc = frame?.contentDocument;
  if (!doc || !previewNote) return;
  for (const el of marked) el.classList.remove('__admin-mark');
  marked = [];

  // A picture's description is the picture's.
  const target = path[path.length - 1] === 'alt' ? path.slice(0, -1) : path;
  const value = draftAt(target);
  const was = publishedAt(target);
  let hits: Element[] = [];
  if (isMedia(value as Json)) hits = findImages(was as Obj | undefined).map((img) => img.closest('picture') ?? img);
  else if (typeof was === 'string') {
    // The frame is its own window, so its nodes are not this window's Text: test the type.
    hits = findText(pathKey(target), was).map((hit) => (hit.nodeType === Node.TEXT_NODE ? (hit.parentElement as Element) : (hit as Element)));
  }
  hits = hits.filter(Boolean);

  previewNote.textContent = hits.length ? t.preview.note : t.preview.notFound;
  if (!hits.length) return;
  for (const el of hits) {
    // Open what folds it away — a service row's details.
    for (let up = el.parentElement; up; up = up.parentElement) if (up.tagName === 'DETAILS') (up as HTMLDetailsElement).open = true;
    el.classList.add('__admin-mark');
  }
  marked = hits;
  hits[0].scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior });
}

/*
  The other way: what is clicked on the page opens its field. An index of
  every word and picture any view or product holds, by what the page shows
  — the open view's draft, everything else as published — and the click
  climbs from what was hit until it holds one of them.
*/
interface Hit {
  ref: Ref;
  path: Path;
}
let stale = true;
let words = new Map<string, Hit[]>();
let pictures: [string, Hit][] = [];

function index() {
  if (!stale) return;
  stale = false;
  words = new Map();
  pictures = [];
  const add = (ref: Ref, value: Json | undefined, path: Path) => {
    if (value === undefined || value === null || isHidden(path)) return;
    if (typeof value === 'string') {
      const key = norm(value);
      if (key) words.set(key, [...(words.get(key) ?? []), { ref, path }]);
      return;
    }
    if (isMedia(value)) {
      for (const mark of marksOf(value)) pictures.push([mark, { ref, path }]);
      if (typeof value.upload === 'string' && value.upload) pictures.push([value.upload, { ref, path }]);
      if (typeof value.alt === 'string') add(ref, value.alt, [...path, 'alt']);
      return;
    }
    if (typeof value === 'object') for (const [key, child] of Object.entries(value)) add(ref, child, [...path, Array.isArray(value) ? Number(key) : key]);
  };
  // The open view first, as typed: it wins where two fields hold the same words.
  if (view.kind !== 'inbox') for (const key of Object.keys(draft)) add(view, draft[key], [key]);
  for (const v of VIEWS) {
    if (v.off) continue;
    for (const part of v.parts) add({ kind: 'section', id: v.id }, publishedAt(pathOf(part)), pathOf(part));
  }
  for (const item of publishedItems()) add({ kind: 'product', id: String(item.id) }, item, ['product']);
}

/** The sections of a page where a view's or a product's words are. */
const regionOf = (ref: Ref) => (ref.kind === 'product' ? PRODUCT_ON : ref.kind === 'section' ? (viewOf(ref.id).on ?? '') : '');

/** The field behind what was hit on the page, and the element that holds it. */
function hitAt(target: Element): { hit: Hit; el: Element } | null {
  index();
  // Words in two fields: the one whose section holds what was hit, then the open view, then this page's.
  const choose = (hits: Hit[]) => {
    const here = hits.filter((hit) => {
      const region = regionOf(hit.ref);
      return region && target.closest(region);
    });
    const pool = here.length ? here : hits;
    return pool.find((hit) => sameRef(hit.ref, view)) ?? pool.find((hit) => pageOf(hit.ref) === framePage) ?? pool[0];
  };
  for (let el: Element | null = target, depth = 0; el && depth < 8; el = el.parentElement, depth++) {
    if (el.tagName === 'IMG') {
      const src = swapped.get(el as HTMLImageElement) ?? el.getAttribute('src') ?? '';
      const hits = pictures.filter(([mark]) => src.includes(mark)).map(([, hit]) => hit);
      if (hits.length) return { hit: choose(hits), el: el.closest('picture') ?? el };
    }
    for (const node of el.childNodes) {
      if (node.nodeType !== Node.TEXT_NODE) continue;
      const hits = words.get(norm(node.nodeValue));
      if (hits) return { hit: choose(hits), el };
    }
    const whole = norm(el.textContent);
    if (whole.length < 600) {
      const hits = words.get(whole);
      if (hits) return { hit: choose(hits), el };
    }
  }
  return null;
}

let hovered: Element | null = null;
function hoverOnPage(e: Event) {
  hovered?.classList.remove('__admin-hover');
  hovered = null;
  const got = hitAt(e.target as Element);
  if (got) (hovered = got.el).classList.add('__admin-hover');
}

function pickOnPage(e: Event) {
  const target = e.target as Element;
  // The preview is for pointing, not browsing: no link leaves the page, no form posts.
  if (target.closest('a, button[type="submit"], input[type="submit"]')) e.preventDefault();
  const got = hitAt(target);
  if (!got) {
    if (previewNote) previewNote.textContent = t.preview.noField;
    return;
  }
  e.preventDefault();
  if (!sameRef(got.hit.ref, view)) select(got.hit.ref);
  reveal(got.hit.path);
}

/** Opens and focuses a field in the form: every group around it unfolded, scrolled into view. */
function reveal(path: Path) {
  let holder: Element | null = null;
  for (let n = path.length; n > 0 && !holder; n--) holder = mainEl.querySelector(`[data-path="${CSS.escape(pathKey(path.slice(0, n)))}"]`);
  if (!holder) return;
  for (let up: Element | null = holder; up && up !== mainEl; up = up.parentElement) {
    if (up.tagName === 'DETAILS') {
      (up as HTMLDetailsElement).open = true;
      const key = (up as HTMLElement).dataset.fold;
      if (key) openPaths.add(key);
    }
  }
  holder.scrollIntoView({ block: 'center' });
  (holder.querySelector('input, textarea, button') as HTMLElement | null)?.focus({ preventScroll: true });
  mark(path);
}

function buildPreview(): HTMLElement {
  previewNote = h('p', { class: 'preview__note' }, t.preview.note);
  const pick = (next: typeof device, button: HTMLButtonElement) => {
    device = next;
    previewEl?.querySelectorAll('.preview__device').forEach((b) => b.setAttribute('aria-pressed', 'false'));
    button.setAttribute('aria-pressed', 'true');
    fit();
  };
  const desktop = h('button', { type: 'button', class: 'btn btn--ghost preview__device', 'aria-pressed': 'true' }, t.preview.desktop);
  const phone = h('button', { type: 'button', class: 'btn btn--ghost preview__device', 'aria-pressed': 'false' }, t.preview.phone);
  desktop.addEventListener('click', () => pick('desktop', desktop));
  phone.addEventListener('click', () => pick('phone', phone));

  previewEl = h(
    'aside',
    { class: 'preview', 'aria-label': t.preview.show },
    h('div', { class: 'preview__bar' }, desktop, phone, previewNote),
    h('div', { class: 'preview__stage' })
  );
  new ResizeObserver(fit).observe(previewEl);
  return previewEl;
}

function togglePreview(button: HTMLButtonElement, on: boolean) {
  if (!previewEl) return;
  previewEl.hidden = !on;
  root.dataset.preview = on ? 'on' : 'off';
  button.textContent = on ? t.preview.hide : t.preview.show;
  remember.set('anir-admin-preview', on ? 'on' : 'off');
  if (on) showPage();
}

function renderNewProduct() {
  const name = h('input', { type: 'text', id: 'new-name', required: true });
  const id = h('input', { type: 'text', id: 'new-id', required: true, pattern: '[a-z0-9]+(-[a-z0-9]+)*', maxLength: 40 });
  const error = h('p', { class: 'img__error', role: 'alert' });
  name.addEventListener('input', () => {
    if (!id.dataset.touched) id.value = name.value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  });
  id.addEventListener('input', () => (id.dataset.touched = '1'));

  const form = h(
    'form',
    {
      class: 'new',
      onsubmit: async (e: Event) => {
        e.preventDefault();
        const slug = id.value.trim();
        if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return void (error.textContent = t.newProduct.idInvalid);
        if (products.some((p) => p.id === slug)) return void (error.textContent = t.newProduct.idTaken);
        // The first product's shape, every word and upload emptied: a new
        // product is built new, so no old version, no link, no testimonial —
        // null, not left out, or the build would fill them from the first
        // product (src/content/live.ts).
        const data = blank(clone(seedItems[0]), true) as Obj;
        data.href = null;
        data.testimonial = null;
        (data.front as Obj).before = null;
        data.name = name.value.trim();
        data.id = slug;
        products.push({ id: slug, data });
        if (await write(insertMissingProducts)) {
          status(t.saved, 'ok');
          select({ kind: 'product', id: slug });
        } else products = products.filter((p) => p.id !== slug || versions[`product:${slug}`]);
      },
    },
    h('h1', { class: 'main__title' }, t.newProduct.title),
    h('div', { class: 'f' }, h('label', { class: 'f__label', for: 'new-name' }, t.newProduct.name), name),
    h('div', { class: 'f' }, h('label', { class: 'f__label', for: 'new-id' }, t.newProduct.id), id),
    error,
    h(
      'div',
      { class: 'img__buttons' },
      h('button', { type: 'submit', class: 'btn btn--primary' }, t.newProduct.create),
      h('button', { type: 'button', class: 'btn btn--ghost', onclick: () => select(view) }, t.newProduct.cancel)
    )
  );
  mainEl.replaceChildren(form);
  name.focus();
}

// ---------------------------------------------------------------- saving

/*
  Every write sends back what it read. A section or a product is written
  only if its row still has the updated_at this admin loaded — so two
  editors in the same part cannot overwrite each other: the second is told,
  the table is read afresh, and their typing stays in the draft to put back
  (Conflict). Only the row being saved is written: saving one product no
  longer rewrites every other product from this browser's copy, and a
  delete removes that one product, never "everything not on my list".
*/
interface Written {
  key?: string;
  id?: string;
  updated_at: string;
}
const returning = { 'Content-Type': 'application/json', Prefer: 'return=representation' };
const record = (key: string, row: Written) => {
  versions[key] = row.updated_at;
  savedAt[key] = Date.parse(row.updated_at) || Date.now();
};

/** An insert that someone beat to it is a conflict, like any other. */
async function insert(path: string, rows: Obj[]): Promise<Written[]> {
  try {
    return (await api(path, { method: 'POST', headers: returning, body: JSON.stringify(rows) })) as Written[];
  } catch (error) {
    if (error instanceof Refused && error.status === 409) throw new Conflict();
    throw error;
  }
}

/** One section, written only if it is as this admin read it. */
async function writeSection(key: string, data: Obj): Promise<void> {
  const version = versions[key];
  const rows = version
    ? ((await api(`/rest/v1/site_content?key=eq.${encodeURIComponent(key)}&updated_at=eq.${encodeURIComponent(version)}`, {
        method: 'PATCH',
        headers: returning,
        body: JSON.stringify({ data }),
      })) as Written[])
    : await insert('/rest/v1/site_content', [{ key, data }]);
  if (!rows.length) throw new Conflict();
  record(key, rows[0]);
  saved[key] = data;
}

/**
 * While the products table is empty the site uses site.ts's products; the
 * first product write puts every product in it, in order, so the table is
 * the list from then on. Then only a product added here is missing.
 */
async function insertMissingProducts(): Promise<void> {
  const missing = products.map((product, position) => ({ product, position })).filter(({ product }) => !versions[`product:${product.id}`]);
  if (!missing.length) return;
  const rows = await insert('/rest/v1/products', missing.map(({ product, position }) => ({ id: product.id, position, data: product.data })));
  for (const row of rows) record(`product:${row.id}`, row);
}

/** One product's content, written only if it is as this admin read it. */
async function writeProduct(product: Product): Promise<void> {
  const key = `product:${product.id}`;
  if (!versions[key]) return insertMissingProducts();
  const rows = (await api(`/rest/v1/products?id=eq.${encodeURIComponent(product.id)}&updated_at=eq.${encodeURIComponent(versions[key])}`, {
    method: 'PATCH',
    headers: returning,
    body: JSON.stringify({ data: product.data }),
  })) as Written[];
  if (!rows.length) throw new Conflict();
  record(key, rows[0]);
}

/** Where the products stand: each one's position, and nothing else of it. */
async function writePositions(): Promise<void> {
  await insertMissingProducts();
  for (const [position, product] of products.entries()) {
    const rows = (await api(`/rest/v1/products?id=eq.${encodeURIComponent(product.id)}`, {
      method: 'PATCH',
      headers: returning,
      body: JSON.stringify({ position }),
    })) as Written[];
    if (rows[0]) record(`product:${product.id}`, rows[0]);
  }
}

/** Everything the table holds, read afresh: on start, and after a conflict. */
async function readAll(): Promise<void> {
  const [sections, rows] = (await Promise.all([
    api('/rest/v1/site_content?select=key,data,updated_at'),
    api('/rest/v1/products?select=id,position,data,updated_at&order=position.asc'),
  ])) as [{ key: string; data: Obj; updated_at: string }[], { id: string; data: Obj; updated_at: string }[]];
  saved = Object.fromEntries(sections.map((row) => [row.key, row.data]));
  savedAt = {
    ...Object.fromEntries(sections.map((row) => [row.key, Date.parse(row.updated_at) || 0])),
    ...Object.fromEntries(rows.map((row) => [`product:${row.id}`, Date.parse(row.updated_at) || 0])),
  };
  versions = {
    ...Object.fromEntries(sections.map((row) => [row.key, row.updated_at])),
    ...Object.fromEntries(rows.map((row) => [`product:${row.id}`, row.updated_at])),
  };
  products =
    rows.length > 0 ? rows.map((row) => ({ id: row.id, data: row.data })) : seedItems.map((item) => ({ id: String(item.id), data: clone(item) }));
}

/**
 * Runs a write and says how it went. A conflict reads the table afresh and
 * keeps the draft: «Дахин нээх» opens the part again, as the other editor
 * saved it, with this editor's own changes laid back over it.
 */
async function write(run: () => Promise<void>): Promise<boolean> {
  status(t.saving, 'busy');
  try {
    await run();
    return true;
  } catch (error) {
    if (error instanceof SignedOut) {
      renderSignIn(t.signIn.expired);
      return false;
    }
    if (error instanceof Conflict) {
      try {
        await readAll();
      } catch {
        /* the sentence stands; reopening will read again */
      }
      renderNav();
      status(t.conflict, 'bad', '', { label: t.reopen, run: () => select(view) });
      return false;
    }
    const { text, detail } = explain(error, t.saveFailed);
    status(text, 'bad', detail);
    return false;
  }
}

/** Saved: what was typed is now what is measured against, the draft goes, the button says so. */
function wasSaved() {
  baseline = JSON.stringify(draft);
  dirty = false;
  remember.set(draftKey(view), null);
  ownDrafts.delete(refKey(view));
  status(t.saved, 'ok');
  if (saveButton) {
    saveButton.disabled = true;
    saveButton.textContent = t.savedShort;
    clearTimeout(savedTimer);
    savedTimer = window.setTimeout(() => saveButton && !dirty && (saveButton.textContent = t.save), 3000);
  }
  renderNav();
}

async function save() {
  if (view.kind === 'inbox' || !dirty) return;
  // A section the page code switches off is shown, not edited.
  if (view.kind === 'section' && viewOf(view.id).off) return;
  if (saveButton) saveButton.disabled = true;

  let ok: boolean;
  if (view.kind === 'product') {
    const current = view.id;
    const product = products.find((p) => p.id === current) as Product;
    const before = product.data;
    product.data = clone(draft.product as Obj);
    ok = await write(() => writeProduct(product));
    if (!ok) product.data = before;
  } else {
    // Each section this view touched, each only if it is as it was read.
    const base = JSON.parse(baseline) as Obj;
    const changedKeys = Object.keys(draft).filter((key) => JSON.stringify(draft[key]) !== JSON.stringify(base[key]));
    ok = await write(async () => {
      for (const key of changedKeys) {
        const data = clone(draft[key] as Obj);
        if (key === 'products') delete data.items;
        await writeSection(key, data);
      }
    });
  }
  if (ok) wasSaved();
  else if (saveButton) saveButton.disabled = !dirty;
}

async function moveProduct(i: number, by: number) {
  products.splice(i + by, 0, ...products.splice(i, 1));
  if (await write(writePositions)) status(t.saved, 'ok');
  renderNav();
}

async function deleteProduct() {
  if (view.kind !== 'product') return;
  if (products.length <= 1) return void status(t.lastProduct, 'bad');
  if (!confirm(t.confirmDelete)) return;
  const id = view.id;
  products = products.filter((p) => p.id !== id);
  remember.set(draftKey(view), null);
  dirty = false;
  const removed = await write(async () => {
    await insertMissingProducts();
    await api(`/rest/v1/products?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
    delete versions[`product:${id}`];
    await writePositions();
  });
  if (removed) {
    status(t.saved, 'ok');
    select({ kind: 'product', id: products[0].id });
  }
}

// ------------------------------------------------------------ publishing

/*
  Publish says what happened, in three states, without a status code:
  queued or building (and how long it takes, so nobody reloads two seconds
  later), done, or failed — why, and what to do next. The build reports on
  itself (worker/builds.ts) and the admin reads that report through the
  Worker (worker/publish.ts); no Cloudflare token is involved. Its id is
  kept, so a reload picks the following up again, and fifteen minutes
  without a final report says so.
*/
const BUILD = 'anir-admin-build';
/** Builds take two or three minutes; fifteen without a final report means something is wrong. */
const SILENT_AFTER = 15 * 60 * 1000;
let followTimer = 0;

function follow(build: string, since = Date.now()) {
  remember.set(BUILD, JSON.stringify({ build, since }));
  clearTimeout(followTimer);
  const stop = () => remember.set(BUILD, null);
  const tick = async () => {
    // A build that never reports — it died before it could, or the report
    // never arrived — is said to be silent, not left «building» for ever.
    if (Date.now() - since > SILENT_AFTER) return void (stop(), publishStatus(t.publish.silent, 'bad'));
    try {
      const { response, body } = await worker(`/api/publish?build=${encodeURIComponent(build)}`);
      if (response.ok && body.ok) {
        const state = String(body.state);
        if (state === 'done') return void (stop(), publishStatus(t.publish.done, 'ok'));
        if (state === 'cancelled') return void (stop(), publishStatus(t.publish.cancelled, 'bad'));
        if (state === 'failed') {
          stop();
          const reason = t.publish.reasons[String(body.reason)] ?? t.publish.reasons.other;
          return publishStatus(`${t.publish.failed} ${reason}`, 'bad', String(body.detail ?? ''));
        }
        publishStatus(state === 'building' ? t.publish.building : t.publish.queued, 'busy');
      } else if (body.error === 'no-status' || response.status === 404) {
        return void (stop(), publishStatus(t.publish.unfollowed, 'ok'));
      }
    } catch (error) {
      if (error instanceof SignedOut) return renderSignIn(t.signIn.expired);
      /* a dropped request: ask again on the next tick */
    }
    followTimer = window.setTimeout(tick, 8000);
  };
  publishStatus(t.publish.queued, 'busy');
  followTimer = window.setTimeout(tick, 4000);
}

async function publish() {
  if (view.kind !== 'inbox' && dirty) return void publishStatus(t.publish.saveFirst, 'bad');
  const waiting = [
    ...VIEWS.filter((v) => readDraft({ kind: 'section', id: v.id })).map((v) => t.views[v.id]),
    ...products.filter((p) => readDraft({ kind: 'product', id: p.id })).map((p) => String(p.data.name ?? p.id)),
  ];
  if (waiting.length && !confirm(t.publish.otherDrafts.replace('{views}', waiting.join(', ')))) return;

  publishStatus(t.publish.starting, 'busy');
  let response: Response;
  let body: Record<string, unknown>;
  try {
    ({ response, body } = await worker('/api/publish', { method: 'POST' }));
  } catch (error) {
    if (error instanceof SignedOut) return renderSignIn(t.signIn.expired);
    return publishStatus(t.publish.errors.network, 'bad');
  }
  if (response.ok && body.ok) {
    if (typeof body.build === 'string' && body.following) return follow(body.build);
    return publishStatus(t.publish.unfollowed, 'ok');
  }
  // No such route: a static copy of the site, or a host without the Worker.
  if (response.status === 404 || response.status === 405) return publishStatus(t.publish.errors.missing, 'bad');
  const known = t.publish.errors[String(body.error ?? '')];
  if (known) return publishStatus(known, 'bad');
  publishStatus(t.publish.errors.other, 'bad', `${response.status} ${String(body.error ?? '')} ${String(body.detail ?? '')}`.trim());
}

// -------------------------------------------------------------- keyboard

function keys(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault();
    save();
    return;
  }
  if (e.key === 'Escape') {
    const open = (document.activeElement as Element | null)?.closest('details[open]') as HTMLDetailsElement | null;
    if (!open || !mainEl.contains(open)) return;
    open.open = false;
    (open.querySelector(':scope > summary') as HTMLElement | null)?.focus();
  }
}

// ---------------------------------------------------------------- start

async function load() {
  root.dataset.state = 'loading';
  root.replaceChildren(h('p', { class: 'admin__message' }, t.loading));
  try {
    await readAll();
  } catch (error) {
    if (error instanceof SignedOut) return renderSignIn(t.signIn.expired);
    const setUp = error instanceof Refused && error.code === 'PGRST205';
    const { text, detail } = explain(error, t.loadFailed);
    root.replaceChildren(h('div', { class: 'admin__message admin__message--bad' }, ...said(setUp ? t.notSetUp : text, setUp ? '' : detail)));
    return;
  }

  statusEl = h('div', { class: 'bar__status', role: 'status', 'aria-live': 'polite' });
  issueEl = h('div', { class: 'strip__line', role: 'status', 'aria-live': 'polite' });
  publishEl = h('div', { class: 'strip__line strip__line--publish', role: 'status', 'aria-live': 'polite' });
  alertEl = h('div', { class: 'strip__line strip__line--alert', role: 'status', 'aria-live': 'polite' });
  stripEl = h('div', { class: 'strip', hidden: true }, alertEl, issueEl, publishEl);
  navEl = h('nav', { class: 'nav', 'aria-label': t.sectionsTitle });
  mainEl = h('main', { class: 'main' });
  const preview = buildPreview();
  const previewButton = h('button', { type: 'button', class: 'btn btn--ghost bar__preview' });
  previewButton.addEventListener('click', () => togglePreview(previewButton, previewEl?.hidden ?? true));

  // The field in focus lit up on the page.
  let last = '';
  mainEl.addEventListener('focusin', (e) => {
    const holder = (e.target as Element).closest?.('[data-path]') as HTMLElement | null;
    if (!holder || holder.dataset.path === last || previewEl?.hidden) return;
    last = holder.dataset.path as string;
    mark(pathOf(last));
  });

  root.dataset.state = 'ready';
  root.replaceChildren(
    h(
      'header',
      { class: 'bar' },
      h('p', { class: 'bar__brand' }, t.title),
      statusEl,
      previewButton,
      h('button', { type: 'button', class: 'btn btn--primary', onclick: () => publish() }, t.publish.button),
      h('p', { class: 'bar__who' }, session?.email ?? ''),
      h('button', { type: 'button', class: 'btn btn--ghost', onclick: () => (keep(null), (dirty = false), renderSignIn()) }, t.signOut)
    ),
    stripEl,
    h('div', { class: 'body' }, navEl, mainEl, preview)
  );
  document.addEventListener('keydown', keys);

  // The preview on by default where there is room for it beside the form.
  const remembered = remember.get('anir-admin-preview');
  togglePreview(previewButton, remembered ? remembered === 'on' : innerWidth >= 1100);

  // The enquiries first: the one thing anyone opens daily.
  dirty = false;
  select({ kind: 'inbox' });
  readStorage();
  readAlerts();
  setInterval(() => (readCounts(), readAlerts()), 2 * 60 * 1000);
  addEventListener('focus', () => (readCounts(), readAlerts()));

  // A build started before a reload is followed again.
  try {
    const pending = JSON.parse(remember.get(BUILD) ?? 'null') as { build: string; since: number } | null;
    if (pending && Date.now() - pending.since < SILENT_AFTER) follow(pending.build, pending.since);
  } catch {
    remember.set(BUILD, null);
  }
}

function renderSignIn(message = '') {
  keep(null);
  document.removeEventListener('keydown', keys);
  root.dataset.state = 'signed-out';
  const email = h('input', { type: 'email', id: 'sign-email', autocomplete: 'username', required: true });
  const password = h('input', { type: 'password', id: 'sign-password', autocomplete: 'current-password', required: true });
  const error = h('p', { class: 'img__error', role: 'alert' }, message);
  const submit = h('button', { type: 'submit', class: 'btn btn--primary' }, t.signIn.submit);

  const form = h(
    'form',
    {
      class: 'sign',
      onsubmit: async (e: Event) => {
        e.preventDefault();
        submit.disabled = true;
        submit.textContent = t.signIn.working;
        error.textContent = '';
        try {
          const next = await grant('password', { email: email.value.trim(), password: password.value });
          keep(next);
          const rows = (await api(`/rest/v1/editors?select=user_id&user_id=eq.${encodeURIComponent(next.id)}`)) as unknown[];
          if (!rows.length) {
            keep(null);
            error.textContent = t.signIn.notEditor;
            return;
          }
          await load();
        } catch (failure) {
          keep(null);
          error.textContent = failure instanceof TypeError ? t.network : t.signIn.failed;
        } finally {
          submit.disabled = false;
          submit.textContent = t.signIn.submit;
        }
      },
    },
    h('h1', { class: 'main__title' }, t.signIn.title),
    h('div', { class: 'f' }, h('label', { class: 'f__label', for: 'sign-email' }, t.signIn.email), email),
    h('div', { class: 'f' }, h('label', { class: 'f__label', for: 'sign-password' }, t.signIn.password), password),
    error,
    submit
  );
  root.replaceChildren(form);
  email.focus();
}

addEventListener('beforeunload', (e) => {
  if (dirty) e.preventDefault();
});

if (!config.url || !config.publishableKey) {
  root.replaceChildren(h('p', { class: 'admin__message admin__message--bad' }, t.notConfigured));
} else if (session) {
  load();
} else {
  renderSignIn();
}
