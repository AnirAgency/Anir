/**
 * The admin (/admin/): where the team edits the site's words and images, and
 * adds, removes and orders products, then publishes.
 *
 * It talks to Supabase directly — Auth to sign in, the REST API to read and
 * save, Storage to upload — with plain fetch, and to this site's Worker to
 * publish (worker/publish.ts). What it may do is decided by the database's
 * row level security (supabase/migrations/0002_content.sql), not here: a
 * signed-in user who is not in `editors` can read and nothing else.
 *
 * The forms are built from the content itself. site.ts as written is the
 * seed (embedded in the page); what the database holds for a section is laid
 * over it exactly as the build lays it (src/content/live.ts), so a form shows
 * what will be published. Strings become text fields, numbers number fields,
 * booleans checkboxes; an object with a width, a height and an `alt` or a
 * `src` is an image; lists of things can grow and shrink, lists of words and
 * of images keep their length unless listed below. RULES says what is hidden
 * — values that are code, not copy — and what is optional.
 *
 * Every field has a "?" saying what it does (src/content/admin.ts > helpAt,
 * help). Beside the form, the page it edits, live: the build that made this
 * admin also embeds the site as published, so the preview can find on the
 * page the words and images a field holds — to light them up when the field
 * is hovered or focused, and to show an edit on the page as it is typed,
 * before it is saved. It finds them by their published text and image paths,
 * so it is a preview, not a render: a word split across lines, or the same
 * words in two places, are found as best they can be.
 *
 * Everything the user typed reaches the page through textContent and value,
 * never as HTML.
 */
import config from '../lib/supabase.json';
import { admin as t } from '../content/admin';
import { overlay } from '../content/live';

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type Obj = { [key: string]: Json };

// ---------------------------------------------------------------- rules

/** Paths, a segment each; `*` is any index or key. Products' paths start at `product`. */
const RULES = {
  hidden: [
    'meta.ogImage',
    'meta.countryCode',
    'hero.mark',
    'hero.video',
    'showreel.media',
    'showreel.placeholder',
    'products.items',
    // Form field names and option values are what the Worker and the
    // enquiries table check (supabase/migrations/0001_enquiries.sql); the
    // labels beside them are the copy.
    'contact.form.groups.*.name',
    'contact.form.groups.*.options.*.value',
    'contact.form.fields.*.name',
    'contact.form.honeypot',
    'product.id',
  ],
  /** Lists of images or words that may grow and shrink. */
  growable: ['product.gallery.more', 'product.gallery.mobile', 'product.responsive', 'contact.address'],
  /** How long a list may grow: the hero's cards share one row, four at most (Hero.astro). */
  max: { 'hero.products': 4 } as Record<string, number>,
  /** Sections and parts no page shows today — marked so, so nobody edits them in vain. */
  unused: ['pricing', 'team', 'products.controls'],
};

/** Optional parts of a product: absent until added, null once removed. */
const OPTIONAL: Record<string, (draft: Obj) => Json> = {
  'product.href': () => '',
  'product.testimonial': () => blank(clone((seed.products as Obj & { pages: Obj }).pages.testimonial as Obj).stand, true),
  'product.front.before': (draft) => blank(clone((draft.front as Obj).after), false),
};

const matches = (pattern: string, path: (string | number)[]) => {
  const parts = pattern.split('.');
  return parts.length === path.length && parts.every((part, i) => part === '*' || part === String(path[i]));
};
const isHidden = (path: (string | number)[]) => RULES.hidden.some((rule) => matches(rule, path));
const isGrowable = (path: (string | number)[]) => RULES.growable.some((rule) => matches(rule, path));
const isUnused = (path: (string | number)[]) => RULES.unused.some((rule) => matches(rule, path));
const maxOf = (path: (string | number)[]) =>
  Object.entries(RULES.max).find(([rule]) => matches(rule, path))?.[1] ?? Infinity;
const optionalAt = (path: (string | number)[]) =>
  Object.keys(OPTIONAL).find((rule) => matches(rule, path));

/** What a field does: the most particular `helpAt` that matches, else `help` by its name. */
function helpFor(path: (string | number)[]): string {
  const at = Object.entries(t.helpAt)
    .filter(([rule]) => matches(rule, path))
    .sort(([a], [b]) => b.replace(/\*/g, '').length - a.replace(/\*/g, '').length)[0];
  if (at) return at[1];
  const name = [...path].reverse().find((segment) => typeof segment === 'string') as string | undefined;
  return (name && t.help[name]) || '';
}

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
const SECTIONS = Object.keys(seed);

const clone = <T extends Json>(value: T): T => JSON.parse(JSON.stringify(value));

const isMedia = (v: Json): v is Obj =>
  !!v && typeof v === 'object' && !Array.isArray(v) && typeof v.width === 'number' && typeof v.height === 'number' &&
  ('alt' in v || typeof v.src === 'string') && !('poster' in v);

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

interface Product {
  id: string;
  data: Obj;
}

let saved: Record<string, Obj> = {};
let products: Product[] = [];
let view: { kind: 'section'; key: string } | { kind: 'product'; id: string } = { kind: 'section', key: 'hero' };
let draft: Obj = {};
let dirty = false;

// -------------------------------------------------------------- session

interface Session {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  email: string;
  id: string;
}

class SignedOut extends Error {}

const STORE = 'anir-admin-session';
let session: Session | null = (() => {
  try {
    return JSON.parse(localStorage.getItem(STORE) ?? 'null') as Session | null;
  } catch {
    return null;
  }
})();

function keep(next: Session | null) {
  session = next;
  try {
    if (next) localStorage.setItem(STORE, JSON.stringify(next));
    else localStorage.removeItem(STORE);
  } catch {
    /* a private window: the session lasts as long as the page */
  }
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
  if (!response.ok) throw new Error(`${response.status} ${text.slice(0, 160)}`);
  return text ? JSON.parse(text) : null;
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
    if (value === undefined || value === false) continue;
    if (key.startsWith('on')) el.addEventListener(key.slice(2), value as EventListener);
    else if (key === 'class') el.className = String(value);
    else if (key in el && key !== 'list') (el as unknown as Record<string, unknown>)[key] = value;
    else el.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children) if (child) el.append(child);
  return el;
}

const labelFor = (key: string | number) =>
  typeof key === 'number' ? `${t.list.item}${key + 1}` : (t.labels[key] ?? key);

/** The "?" beside a field's name: what the field does, shown on hover and on focus. */
function helpMark(text: string): HTMLElement | null {
  if (!text) return null;
  return h(
    'span',
    {
      class: 'help',
      tabindex: 0,
      role: 'note',
      'aria-label': `${t.helpLabel}: ${text}`,
      // Inside a <label> or <summary>, a click would focus the field or fold the group.
      onclick: (e: Event) => (e.preventDefault(), e.stopPropagation()),
    },
    '?',
    h('span', { class: 'help__tip', 'aria-hidden': 'true' }, text)
  );
}

const labelRow = (key: string | number, path: (string | number)[]) =>
  h('span', { class: 'f__label' }, labelFor(key), helpMark(helpFor(path)));

const pathKey = (path: (string | number)[]) => path.join('.');

let statusEl: HTMLElement | null = null;
function status(text: string, tone: 'ok' | 'bad' | 'busy' | '' = '') {
  if (!statusEl) return;
  statusEl.textContent = text;
  statusEl.dataset.tone = tone;
}

function markDirty() {
  dirty = true;
  status(t.unsaved, 'busy');
  schedulePreview();
}

const leaveOk = () => !dirty || confirm(t.leaveUnsaved);

// --------------------------------------------------------------- fields

/** One value's field. `set` writes the new value into the draft. */
function field(value: Json, path: (string | number)[], set: (next: Json) => void, depth: number): HTMLElement | null {
  if (isHidden(path)) return null;
  const key = path[path.length - 1];

  if (isMedia(value)) return imageField(value, path);
  if (Array.isArray(value)) return listField(value, path, set, depth);
  if (value && typeof value === 'object') return objectField(value, path, depth);

  if (typeof value === 'boolean') {
    return h(
      'label',
      { class: 'f f--check', 'data-path': pathKey(path) },
      h('input', { type: 'checkbox', checked: value, onchange: (e: Event) => (set((e.target as HTMLInputElement).checked), markDirty()) }),
      labelRow(key, path)
    );
  }

  if (typeof value === 'number') {
    return h(
      'label',
      { class: 'f', 'data-path': pathKey(path) },
      labelRow(key, path),
      h('input', {
        type: 'number',
        step: 'any',
        value: String(value),
        oninput: (e: Event) => {
          const n = Number((e.target as HTMLInputElement).value);
          if (Number.isFinite(n)) (set(n), markDirty());
        },
      })
    );
  }

  if (typeof value === 'string') {
    const long = value.length > 70 || value.includes('\n');
    const input = long
      ? h('textarea', { rows: Math.min(8, Math.ceil(value.length / 70) + 1), value })
      : h('input', { type: 'text', value });
    input.addEventListener('input', () => (set(input.value), markDirty()));
    return h('label', { class: 'f', 'data-path': pathKey(path) }, labelRow(key, path), input);
  }

  return null;
}

function objectField(value: Obj, path: (string | number)[], depth: number): HTMLElement {
  const box = h('div', { class: 'group__body' });

  const keys = Object.keys(value);
  for (const rule of Object.keys(OPTIONAL)) {
    const parts = rule.split('.');
    if (parts.length === path.length + 1 && matches(parts.slice(0, -1).join('.'), path)) {
      const key = parts[parts.length - 1];
      if (!keys.includes(key)) keys.push(key);
    }
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
              value[key] = OPTIONAL[optional](draft);
              markDirty();
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
              markDirty();
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
  return h('details', { class: 'group', open: depth < 2 }, summaryOfGroup(key, path), box);
}

/** A group's title: its name, what it is, and whether any page shows it. */
const summaryOfGroup = (key: string | number, path: (string | number)[], ...extra: Child[]) =>
  h(
    'summary',
    {},
    h(
      'span',
      { class: 'summary__name' },
      labelFor(key),
      helpMark(helpFor(path)),
      isUnused(path) ? h('span', { class: 'unused' }, t.notShown) : null
    ),
    ...extra
  );

/** The first words of a list item, to name it in its summary. */
function summaryOf(item: Json): string {
  if (item && typeof item === 'object' && !Array.isArray(item)) {
    for (const key of ['name', 'title', 'label', 'legend', 'text', 'eyebrow']) {
      if (typeof item[key] === 'string' && item[key]) return String(item[key]).slice(0, 48);
    }
  }
  return '';
}

function listField(list: Json[], path: (string | number)[], set: (next: Json) => void, depth: number): HTMLElement {
  const key = path[path.length - 1];
  const ofObjects = list.length > 0 && list.every((item) => item && typeof item === 'object' && !Array.isArray(item) && !isMedia(item));
  const growable = ofObjects || isGrowable(path);
  const max = maxOf(path);
  const body = h('div', { class: 'list' });

  const rerender = () => {
    set(list);
    markDirty();
    renderMain();
  };

  list.forEach((item, i) => {
    const itemPath = [...path, i];
    const controls = growable
      ? h(
          'span',
          { class: 'list__controls' },
          h('button', { type: 'button', class: 'btn btn--icon', title: t.moveUp, disabled: i === 0, onclick: () => (list.splice(i - 1, 0, ...list.splice(i, 1)), rerender()) }, t.list.up),
          h('button', { type: 'button', class: 'btn btn--icon', title: t.moveDown, disabled: i === list.length - 1, onclick: () => (list.splice(i + 1, 0, ...list.splice(i, 1)), rerender()) }, t.list.down),
          h('button', { type: 'button', class: 'btn btn--icon', title: t.list.remove, disabled: list.length <= 1, onclick: () => (list.splice(i, 1), rerender()) }, '✕')
        )
      : null;

    if (ofObjects) {
      const inner = objectField(item as Obj, itemPath, 0);
      body.append(
        h(
          'details',
          { class: 'group group--item' },
          h('summary', {}, h('span', { class: 'summary__name' }, `${labelFor(i)} ${summaryOf(item)}`), controls),
          inner
        )
      );
    } else {
      const el = field(item, itemPath, (next) => (list[i] = next), depth + 1);
      if (el) body.append(h('div', { class: 'list__row' }, el, controls));
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
            list.push(blank(clone(list[list.length - 1]), false));
            rerender();
          },
        },
        full ? t.list.max.replace('{n}', String(max)) : t.list.add
      )
    );
  }

  return h('details', { class: 'group', open: depth < 2 }, summaryOfGroup(key, path), body);
}

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
};

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

function imageField(media: Obj, path: (string | number)[]): HTMLElement {
  const key = path[path.length - 1];
  const preview = h('div', { class: 'img__preview' });
  const note = h('p', { class: 'img__note' });
  const error = h('p', { class: 'img__error' });

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
    note.textContent = shown?.note ?? t.image.none;
    pick.textContent = media.upload ? t.image.replace : t.image.choose;
    remove.hidden = !media.upload;
  };

  const file = h('input', { type: 'file', accept: Object.keys(EXTENSIONS).join(','), hidden: true });
  const pick = h('button', { type: 'button', class: 'btn', onclick: () => file.click() });
  const remove = h('button', {
    type: 'button',
    class: 'btn btn--ghost',
    onclick: () => {
      delete media.upload;
      markDirty();
      draw();
    },
  }, t.image.remove);

  file.addEventListener('change', async () => {
    const chosen = file.files?.[0];
    file.value = '';
    error.textContent = '';
    if (!chosen) return;
    const extension = EXTENSIONS[chosen.type];
    if (!extension) return void (error.textContent = t.image.wrongType);
    if (chosen.size > 15 * 1024 * 1024) return void (error.textContent = t.image.tooBig);

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
      markDirty();
    } catch (err) {
      if (err instanceof SignedOut) return renderSignIn(t.signIn.expired);
      error.textContent = `${t.image.uploadFailed}: ${(err as Error).message}`;
    } finally {
      pick.disabled = false;
      draw();
    }
  });

  const body = h(
    'div',
    { class: 'img' },
    preview,
    h(
      'div',
      { class: 'img__side' },
      note,
      h('p', { class: 'img__size' }, t.image.size.replace('{w}', String(media.width)).replace('{h}', String(media.height))),
      h('div', { class: 'img__buttons' }, pick, remove, file),
      error,
      'alt' in media ? field(media.alt as Json, [...path, 'alt'], (next) => (media.alt = next), 9) : null
    )
  );
  draw();
  const size = t.imageHelp.replace('{w}', String(media.width)).replace('{h}', String(media.height));
  const help = [helpFor(path), size].filter(Boolean).join(' ');
  return h(
    'div',
    { class: 'group group--image', 'data-path': pathKey(path) },
    h('p', { class: 'group__title' }, labelFor(key), helpMark(help)),
    body
  );
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

function select(next: typeof view) {
  if (!leaveOk()) return;
  // Edits left unsaved are still on the preview's page: load it afresh.
  if (dirty) framePage = '';
  view = next;
  dirty = false;
  draft =
    next.kind === 'section'
      ? clone(sectionDraft(next.key))
      : clone(productDraft(products.find((p) => p.id === next.id) as Product));
  status('');
  renderNav();
  renderMain();
}

function renderNav() {
  const sectionButtons = SECTIONS.map((key) =>
    h(
      'li',
      {},
      h(
        'button',
        {
          type: 'button',
          class: isUnused([key]) ? 'nav__item nav__item--unused' : 'nav__item',
          'aria-current': view.kind === 'section' && view.key === key ? 'true' : undefined,
          onclick: () => select({ kind: 'section', key }),
        },
        t.sections[key] ?? key,
        isUnused([key]) ? h('span', { class: 'unused' }, t.notShown) : null
      )
    )
  );

  const productButtons = products.map((product, i) =>
    h(
      'li',
      { class: 'nav__product' },
      h(
        'button',
        {
          type: 'button',
          class: 'nav__item',
          'aria-current': view.kind === 'product' && view.id === product.id ? 'true' : undefined,
          onclick: () => select({ kind: 'product', id: product.id }),
        },
        String(product.data.name ?? product.id) || product.id
      ),
      h('button', { type: 'button', class: 'btn btn--icon', title: t.moveUp, disabled: i === 0, onclick: () => moveProduct(i, -1) }, t.list.up),
      h('button', { type: 'button', class: 'btn btn--icon', title: t.moveDown, disabled: i === products.length - 1, onclick: () => moveProduct(i, 1) }, t.list.down)
    )
  );

  navEl.replaceChildren(
    h('p', { class: 'nav__title' }, t.sectionsTitle),
    h('ul', { class: 'nav__list' }, ...sectionButtons),
    h('p', { class: 'nav__title' }, t.productsTitle),
    h('ul', { class: 'nav__list' }, ...productButtons),
    h('button', { type: 'button', class: 'btn btn--ghost', onclick: () => renderNewProduct() }, t.addProduct)
  );
}

function renderMain() {
  const title = view.kind === 'section' ? (t.sections[view.key] ?? view.key) : String(draft.name || draft.id);
  const head = h(
    'div',
    { class: 'main__head' },
    h('h1', { class: 'main__title' }, title),
    h('button', { type: 'button', class: 'btn btn--primary', onclick: () => save() }, t.save)
  );

  // What this is, and where it shows.
  const page = pageOf(view);
  const about = h(
    'div',
    { class: 'main__about' },
    h('p', {}, view.kind === 'section' ? (t.sectionHelp[view.key] ?? '') : t.productHelp),
    h('p', { class: 'main__hint' }, view.kind === 'section' && view.key === 'meta' ? t.noPageAt : `${t.page}: ${page ?? `/products/${draft.id}/`}`)
  );

  const extra =
    view.kind === 'product'
      ? h(
          'div',
          { class: 'main__meta' },
          h('p', { class: 'main__hint' }, t.heroCardsNote),
          h('button', { type: 'button', class: 'btn btn--danger', onclick: () => deleteProduct() }, t.deleteProduct)
        )
      : null;

  const form = objectField(draft, view.kind === 'section' ? [view.key] : ['product'], 0);
  const scroll = mainEl.scrollTop;
  mainEl.replaceChildren(head, about, extra ?? '', form);
  mainEl.scrollTop = scroll;
  showPage();
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

/** Where a section or product shows: its page, or null for a product not yet published. */
function pageOf(v: typeof view): string | null {
  if (v.kind === 'section') return '/';
  const items = ((published.products as Obj)?.items ?? []) as Obj[];
  return items.some((item) => item.id === v.id) ? `/products/${v.id}/` : null;
}

/** What the published page holds at a path of the current form. */
function publishedAt(path: (string | number)[]): Json | undefined {
  let node: Json | undefined =
    view.kind === 'section'
      ? published[view.key]
      : (((published.products as Obj)?.items ?? []) as Obj[]).find((item) => item.id === view.id);
  for (const segment of path.slice(1)) {
    if (node === null || node === undefined || typeof node !== 'object') return undefined;
    node = (node as Record<string, Json>)[segment as string];
  }
  return node;
}

function draftAt(path: (string | number)[]): Json | undefined {
  let node: Json | undefined = draft;
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
    stage.replaceChildren(h('p', { class: 'preview__empty' }, t.preview.noPage));
    return;
  }
  if (frame && framePage === page) return void schedulePreview();
  framePage = page;
  frame = h('iframe', { class: 'preview__frame', src: page, title: t.preview.show });
  frame.addEventListener('load', () => {
    found.clear();
    swapped.clear();
    const doc = frame?.contentDocument;
    if (!doc) return;
    const style = doc.createElement('style');
    style.textContent = `.__admin-mark { outline: 3px solid #ff3300 !important; outline-offset: 4px !important; }`;
    doc.head.append(style);
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

/** Where a published image sits on the page: the <img>s showing it. */
function findImages(media: Obj | undefined): HTMLImageElement[] {
  const doc = frame?.contentDocument;
  if (!doc || !media) return [];
  const marks = [
    typeof media.name === 'string' && media.name ? `/media/${media.name}.` : '',
    typeof media.src === 'string' ? media.src : '',
    typeof media.placeholder === 'string' ? media.placeholder : '',
  ].filter(Boolean);
  // An image already showing an upload is found by what it showed before.
  return [...doc.querySelectorAll('img')].filter((img) => {
    const src = swapped.get(img) ?? img.getAttribute('src') ?? '';
    return marks.some((mark) => src.includes(mark));
  });
}

const swapped = new Map<HTMLImageElement, string>();

/** The draft shown on the page: every word that differs from what is published, and every new upload. */
function applyPreview() {
  if (!frame?.contentDocument) return;
  const root = view.kind === 'section' ? [view.key] : ['product'];

  const walk = (d: Json | undefined, p: Json | undefined, path: (string | number)[]) => {
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
  walk(draft, publishedAt(root), root);
}

let previewTimer = 0;
function schedulePreview() {
  clearTimeout(previewTimer);
  previewTimer = window.setTimeout(applyPreview, 120);
}

/** Lights up on the page what the field under the pointer, or in focus, holds — and scrolls to it. */
let marked: Element[] = [];
function mark(path: (string | number)[]) {
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

function buildPreview(): HTMLElement {
  previewNote = h('p', { class: 'preview__note' }, t.preview.note);
  const pick = (next: typeof device, button: HTMLButtonElement) => {
    device = next;
    previewEl?.querySelectorAll('.preview__device').forEach((b) => b.removeAttribute('aria-pressed'));
    button.setAttribute('aria-pressed', 'true');
    fit();
  };
  const desktop = h('button', { type: 'button', class: 'btn btn--ghost preview__device', 'aria-pressed': 'true' }, t.preview.desktop);
  const phone = h('button', { type: 'button', class: 'btn btn--ghost preview__device' }, t.preview.phone);
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
  try {
    localStorage.setItem('anir-admin-preview', on ? 'on' : 'off');
  } catch {
    /* remembered for this page only */
  }
  if (on) showPage();
}

function renderNewProduct() {
  if (!leaveOk()) return;
  dirty = false;
  const name = h('input', { type: 'text', required: true });
  const id = h('input', { type: 'text', required: true, pattern: '[a-z0-9]+(-[a-z0-9]+)*', maxLength: 40 });
  const error = h('p', { class: 'img__error' });
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
        // product is built new, so no old version, no link, no testimonial.
        const data = blank(clone(seedItems[0]), true) as Obj;
        delete data.href;
        delete data.testimonial;
        delete (data.front as Obj).before;
        data.name = name.value.trim();
        data.id = slug;
        products.push({ id: slug, data });
        if (await saveProducts()) select({ kind: 'product', id: slug });
      },
    },
    h('h1', { class: 'main__title' }, t.newProduct.title),
    h('label', { class: 'f' }, h('span', { class: 'f__label' }, t.newProduct.name), name),
    h('label', { class: 'f' }, h('span', { class: 'f__label' }, t.newProduct.id), id),
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

async function guard<T>(run: () => Promise<T>): Promise<T | undefined> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof SignedOut) {
      renderSignIn(t.signIn.expired);
      return undefined;
    }
    status(`${t.saveFailed}: ${(error as Error).message}`, 'bad');
    return undefined;
  }
}

async function saveProducts(): Promise<boolean> {
  status(t.saving, 'busy');
  const done = await guard(async () => {
    const rows = products.map((product, position) => ({ id: product.id, position, data: product.data }));
    await api('/rest/v1/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(rows),
    });
    const keepIds = products.map((p) => `"${p.id}"`).join(',');
    await api(`/rest/v1/products?id=not.in.(${encodeURIComponent(keepIds)})`, { method: 'DELETE' });
    return true;
  });
  if (done) {
    dirty = false;
    status(t.saved, 'ok');
    renderNav();
  }
  return !!done;
}

async function save() {
  if (view.kind === 'product') {
    const current = view.id;
    const product = products.find((p) => p.id === current) as Product;
    product.data = clone(draft);
    await saveProducts();
    return;
  }

  const key = view.key;
  const data = clone(draft);
  if (key === 'products') delete data.items;
  status(t.saving, 'busy');
  const done = await guard(async () => {
    await api('/rest/v1/site_content', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ key, data }),
    });
    return true;
  });
  if (done) {
    saved[key] = data;
    dirty = false;
    status(t.saved, 'ok');
  }
}

async function moveProduct(i: number, by: number) {
  if (!leaveOk()) return;
  products.splice(i + by, 0, ...products.splice(i, 1));
  await saveProducts();
  select(view);
}

async function deleteProduct() {
  if (view.kind !== 'product') return;
  if (products.length <= 1) return void status(t.lastProduct, 'bad');
  if (!confirm(t.confirmDelete)) return;
  const id = view.id;
  products = products.filter((p) => p.id !== id);
  dirty = false;
  if (await saveProducts()) select({ kind: 'product', id: products[0].id });
}

async function publish() {
  if (dirty) return void status(t.publishSaveFirst, 'bad');
  status(t.publishing, 'busy');
  try {
    const response = await fetch('/api/publish', { method: 'POST', headers: { Authorization: `Bearer ${await token()}` } });
    const body = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (response.ok && body.ok) return void status(t.published, 'ok');
    if (response.status === 401) return renderSignIn(t.signIn.expired);
    status(t.publishErrors[body.error ?? ''] ?? `${t.publishErrors.other} (${response.status})`, 'bad');
  } catch (error) {
    if (error instanceof SignedOut) return renderSignIn(t.signIn.expired);
    status(t.publishErrors.other, 'bad');
  }
}

// ---------------------------------------------------------------- start

async function load() {
  root.dataset.state = 'loading';
  root.replaceChildren(h('p', { class: 'admin__message' }, t.loading));
  try {
    const [sections, rows] = (await Promise.all([
      api('/rest/v1/site_content?select=key,data'),
      api('/rest/v1/products?select=id,position,data&order=position.asc'),
    ])) as [{ key: string; data: Obj }[], { id: string; data: Obj }[]];
    saved = Object.fromEntries(sections.map((row) => [row.key, row.data]));
    products =
      rows.length > 0
        ? rows.map((row) => ({ id: row.id, data: row.data }))
        : seedItems.map((item) => ({ id: String(item.id), data: clone(item) }));
  } catch (error) {
    if (error instanceof SignedOut) return renderSignIn(t.signIn.expired);
    const message = (error as Error).message.includes('PGRST205') ? t.notSetUp : `${t.loadFailed} ${(error as Error).message}`;
    root.replaceChildren(h('p', { class: 'admin__message admin__message--bad' }, message));
    return;
  }

  statusEl = h('p', { class: 'bar__status', role: 'status', 'aria-live': 'polite' });
  navEl = h('nav', { class: 'nav', 'aria-label': t.sectionsTitle });
  mainEl = h('main', { class: 'main' });
  const preview = buildPreview();
  const previewButton = h('button', { type: 'button', class: 'btn btn--ghost bar__preview' });
  previewButton.addEventListener('click', () => togglePreview(previewButton, previewEl?.hidden ?? true));

  // The field under the pointer, or in focus, lit up on the page.
  let last = '';
  const follow = (e: Event) => {
    const holder = (e.target as Element).closest?.('[data-path]') as HTMLElement | null;
    if (!holder || holder.dataset.path === last || previewEl?.hidden) return;
    last = holder.dataset.path as string;
    mark(last.split('.').map((segment) => (/^\d+$/.test(segment) ? Number(segment) : segment)));
  };
  mainEl.addEventListener('focusin', follow);
  mainEl.addEventListener('mouseover', follow);

  root.dataset.state = 'ready';
  root.replaceChildren(
    h(
      'header',
      { class: 'bar' },
      h('p', { class: 'bar__brand' }, t.title),
      statusEl,
      previewButton,
      h('button', { type: 'button', class: 'btn btn--primary', onclick: () => publish() }, t.publish),
      h('p', { class: 'bar__who' }, session?.email ?? ''),
      h('button', { type: 'button', class: 'btn btn--ghost', onclick: () => (leaveOk() && (keep(null), (dirty = false), renderSignIn())) }, t.signOut)
    ),
    h('div', { class: 'body' }, navEl, mainEl, preview)
  );

  // The preview on by default where there is room for it beside the form.
  let remembered: string | null = null;
  try {
    remembered = localStorage.getItem('anir-admin-preview');
  } catch {
    /* no memory: decide by width */
  }
  togglePreview(previewButton, remembered ? remembered === 'on' : innerWidth >= 1100);

  dirty = false;
  select(view);
}

function renderSignIn(message = '') {
  keep(null);
  root.dataset.state = 'signed-out';
  const email = h('input', { type: 'email', autocomplete: 'username', required: true });
  const password = h('input', { type: 'password', autocomplete: 'current-password', required: true });
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
        } catch {
          keep(null);
          error.textContent = t.signIn.failed;
        } finally {
          submit.disabled = false;
          submit.textContent = t.signIn.submit;
        }
      },
    },
    h('h1', { class: 'main__title' }, t.signIn.title),
    h('label', { class: 'f' }, h('span', { class: 'f__label' }, t.signIn.email), email),
    h('label', { class: 'f' }, h('span', { class: 'f__label' }, t.signIn.password), password),
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

