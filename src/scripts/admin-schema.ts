/**
 * What the admin shows, and how — the half of the admin that is not the app
 * (src/scripts/admin.ts). Plain data and pure functions, so the build can
 * read it too: the admin page's build runs `checkAdmin` and fails when any
 * field, section, list or value the admin would show has no Mongolian words
 * (src/pages/admin/index.astro). A silent English fallback was the bug; a
 * build that stops is the fix.
 *
 * Paths are a segment each; `*` is any index or key. A product's paths
 * start at `product`.
 */
import type { admin as Copy } from '../content/admin';

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type Obj = { [key: string]: Json };
export type Path = (string | number)[];

export const matches = (pattern: string, path: Path) => {
  const parts = pattern.split('.');
  return parts.length === path.length && parts.every((part, i) => part === '*' || part === String(path[i]));
};
export const pathKey = (path: Path) => path.join('.');
export const pathOf = (key: string): Path => key.split('.').map((segment) => (/^\d+$/.test(segment) ? Number(segment) : segment));

export const RULES = {
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
    // Read by screen readers only, or not shown on any page: kept out of the
    // way, so what is left is what a visitor reads.
    'hero.logoAlt',
    'products.controls',
    'products.pages.compare.control',
    // The old products reel's heading (Products.astro); no page shows it.
    'products.intro.eyebrow',
    'products.intro.title',
    // The silk on the light ground: only the /v2 review page, which
    // production never builds.
    'products.statement.backdropLight',
    // Whether a picture is a demo is code, not copy (site.ts > Media.demo).
    '*.demo',
  ],
  /** Lists of images or words that may grow and shrink. */
  growable: ['product.gallery.more', 'product.gallery.mobile', 'product.responsive', 'contact.address'],
  /** How long a list may grow: the hero's cards share one row, four at most (Hero.astro). */
  max: { 'hero.products': 4 } as Record<string, number>,
};

/** Optional parts of a product: absent until added, null once removed. */
export const OPTIONAL_PATHS = ['product.href', 'product.testimonial', 'product.front.before'];

export const isHidden = (path: Path) =>
  RULES.hidden.some((rule) => (rule.startsWith('*.') ? path[path.length - 1] === rule.slice(2) : matches(rule, path)));
export const isGrowable = (path: Path) => RULES.growable.some((rule) => matches(rule, path));

/**
 * The codes a new item in a list needs, by list: the hidden values the form
 * posts — a chip's value, a question's name. An editor never sees or types
 * one; the admin makes it when the item is added, so two new chips can never
 * share a code. Any code is safe: the Worker stores whatever the form sends
 * and flags what it does not recognise (worker/enquiry.ts), so a chip added
 * here can never make an enquiry fail to save.
 */
export const CODES: Record<string, { prefix: string; at: string[] }> = {
  'contact.form.groups': { prefix: 'q', at: ['name'] },
  'contact.form.groups.*.options': { prefix: 'x', at: ['value'] },
};
export const codesFor = (path: Path) => Object.entries(CODES).find(([rule]) => matches(rule, path))?.[1];
export const maxOf = (path: Path) => Object.entries(RULES.max).find(([rule]) => matches(rule, path))?.[1] ?? Infinity;

export const isMedia = (v: Json | undefined): v is Obj =>
  !!v && typeof v === 'object' && !Array.isArray(v) && typeof v.width === 'number' && typeof v.height === 'number' &&
  ('alt' in v || typeof v.src === 'string') && !('poster' in v);

export const isObjectList = (list: Json[]) =>
  list.length > 0 && list.every((item) => !!item && typeof item === 'object' && !Array.isArray(item) && !isMedia(item));

// ---------------------------------------------------------------- the tree

export type GroupId = 'home' | 'products' | 'site';

/*
  The left column. The inbox comes first, outside any group: it is the one
  thing anyone opens daily, and it is not part of a page.

  Home-page views are in exactly the order a visitor scrolls past them —
  once the preview is clickable, the tree is how an editor knows where on
  the page they are, and page order is the only order that is right for
  that. Not by how often each changes. Pricing and Team are switched off
  (index.astro renders neither); they stay listed, dimmed, so they read as
  off rather than missing.

  What used to be «Бусад» is sorted by what each thing is: what belongs to
  one home-page section went into it (the rail's label for the hero), and
  what is on every page has its own group, named for that.

  A view edits parts of one or more sections: a part with one segment is a
  whole section; with more, one piece of it. Saving writes each section it
  touched.
*/
export interface View {
  id: string;
  group: GroupId;
  parts: string[];
  /** Where it shows. null: on no page (search engines); a product's page for the product pages' words. */
  page: string | null;
  /** The list whose length the tree shows beside the name. */
  count?: string;
  /** Switched off: on no page today. */
  off?: boolean;
  /**
   * Where on a page its words are: the sections' ids. When the same words
   * are in two fields — «Бүтээгдэхүүн» in the menu and on a hero card — a
   * click on the page opens the one whose section holds what was clicked.
   */
  on?: string;
}

/** Where a product's own words are, on its page and on the products page. */
export const PRODUCT_ON = '#products-list, #wall, #product, #feature, #impressions, #front, #responsive, #overview, #testimonial, #next';

export const GROUPS: GroupId[] = ['home', 'products', 'site'];

export const VIEWS: View[] = [
  { id: 'hero', group: 'home', parts: ['hero.tagline', 'hero.lede', 'hero.products', 'chrome.heroLabel'], page: '/', count: 'hero.products', on: '#hero' },
  { id: 'marquee', group: 'home', parts: ['marquee'], page: '/', on: '#marquee' },
  { id: 'showreel', group: 'home', parts: ['showreel'], page: '/', on: '#showreel' },
  { id: 'statement', group: 'home', parts: ['products.statement', 'products.intro'], page: '/', on: '#products, #products-beam' },
  { id: 'process', group: 'home', parts: ['process'], page: '/', count: 'process.events', on: '#process' },
  { id: 'services', group: 'home', parts: ['services'], page: '/', count: 'services.items', on: '#services' },
  { id: 'contact', group: 'home', parts: ['contact'], page: '/', on: '#contact, #contact-cta' },
  { id: 'pricing', group: 'home', parts: ['pricing'], page: null, count: 'pricing.groups', off: true, on: '#pricing' },
  { id: 'team', group: 'home', parts: ['team'], page: null, count: 'team.items', off: true, on: '#team' },
  { id: 'productPages', group: 'products', parts: ['products.pages', 'products.specLabels'], page: null, on: `#products-head, ${PRODUCT_ON}` },
  {
    id: 'frame',
    group: 'site',
    parts: ['nav', 'chrome.railTick', 'chrome.skipToContent', 'chrome.navLabel', 'chrome.railLabel'],
    page: '/',
    count: 'nav.links',
    on: 'header, .rail, .skip-link, footer',
  },
  { id: 'meta', group: 'site', parts: ['meta'], page: null },
];
export const viewOf = (id: string) => VIEWS.find((v) => v.id === id) as View;
/** The sections a view saves. */
export const sectionsOf = (v: View) => [...new Set(v.parts.map((part) => part.split('.')[0]))];

/** A product's fields in the order its page shows them. */
export const PRODUCT_ORDER = ['name', 'tagline', 'description', 'spec', 'href', 'shot', 'feature', 'impressions', 'front', 'responsive', 'gallery', 'testimonial'];

// ------------------------------------------------------------- list rows

/*
  How a row in a list of things names itself: a title from its first
  meaningful words, and a muted second line where there is one. Declared
  per list, never guessed — every list of things the admin shows must have
  one, or the build stops (checkAdmin).
*/
type Copied = typeof Copy;
const text = (value: Json | undefined) => (typeof value === 'string' ? value.trim() : '');
const at = (item: Obj, key: string) => key.split('.').reduce<Json | undefined>((node, part) => (node && typeof node === 'object' && !Array.isArray(node) ? (node as Obj)[part] : undefined), item);

export const SUMMARY: Record<string, (item: Obj, t: Copied) => { title: string; sub: string }> = {
  'hero.products': (item) => ({ title: text(item.name), sub: text(item.tagline) }),
  'nav.links': (item) => ({ title: text(item.label), sub: text(item.href) }),
  'services.items': (item) => ({ title: text(item.name), sub: text(item.line) }),
  'process.events': (item, t) => {
    const both = text(at(item, 'both.title'));
    if (both) return { title: both, sub: t.rows.both };
    const studio = text(at(item, 'studio.title'));
    const client = text(at(item, 'client.title'));
    if (studio && client) return { title: studio, sub: `${t.rows.client}: ${client}` };
    return { title: studio || client, sub: studio ? t.rows.studio : client ? t.rows.client : '' };
  },
  'contact.form.groups': (item) => ({
    title: text(item.legend),
    sub: Array.isArray(item.options) ? item.options.map((option) => text(at(option as Obj, 'label'))).filter(Boolean).join(' · ') : '',
  }),
  'contact.form.groups.*.options': (item) => ({ title: text(item.label), sub: '' }),
  'pricing.groups': (item) => ({ title: text(item.title), sub: '' }),
  'pricing.groups.*.rows': (item) => ({ title: text(item.name), sub: [text(item.price), text(item.unit)].filter(Boolean).join(' ') }),
  'team.items': (item) => ({ title: text(item.name), sub: text(item.role) }),
};
export const summaryRule = (path: Path) => Object.keys(SUMMARY).find((rule) => matches(rule, path));

// ---------------------------------------------------------------- lengths

/*
  Length guidance, not limits: past `max` characters the field shows a
  counter and what will happen, and the editor decides. Each `max` is
  measured, not guessed — the field's own element on the built page,
  lengthened until it takes one more line, at 1440 and at 390 wide; a
  one-line heading or button takes the narrower of the two. The two Google
  figures are where its results cut a title and a description.
*/
export type Consequence = 'twoLines' | 'moreLines' | 'button' | 'round' | 'google' | 'phone';
export const LIMITS: Record<string, { max: number; says: Consequence }> = {
  'meta.title': { max: 60, says: 'google' },
  'meta.description': { max: 155, says: 'google' },
  'nav.links.*.label': { max: 15, says: 'phone' },
  'hero.tagline.line': { max: 55, says: 'moreLines' },
  'hero.tagline.lineItalic': { max: 22, says: 'twoLines' },
  'hero.lede': { max: 150, says: 'moreLines' },
  'hero.products.*.eyebrow': { max: 35, says: 'twoLines' },
  'hero.products.*.name': { max: 22, says: 'twoLines' },
  'hero.products.*.tagline': { max: 44, says: 'twoLines' },
  'hero.products.*.cta': { max: 35, says: 'twoLines' },
  'products.statement.text': { max: 150, says: 'moreLines' },
  'products.statement.cta': { max: 33, says: 'button' },
  'process.intro.title': { max: 20, says: 'twoLines' },
  'process.events.*.*.title': { max: 25, says: 'twoLines' },
  'process.events.*.*.description': { max: 50, says: 'twoLines' },
  'services.intro.title': { max: 20, says: 'twoLines' },
  'services.items.*.name': { max: 39, says: 'twoLines' },
  'services.items.*.line': { max: 55, says: 'moreLines' },
  'services.items.*.points.*': { max: 60, says: 'twoLines' },
  'contact.intro.title': { max: 30, says: 'moreLines' },
  'contact.email': { max: 24, says: 'phone' },
  'contact.form.groups.*.options.*.label': { max: 36, says: 'button' },
  'contact.form.submit': { max: 33, says: 'button' },
  'products.pages.title': { max: 14, says: 'phone' },
  'products.pages.headline': { max: 37, says: 'twoLines' },
  'products.pages.intro': { max: 106, says: 'twoLines' },
  'products.pages.open': { max: 40, says: 'twoLines' },
  'products.pages.next': { max: 23, says: 'twoLines' },
  'products.pages.about': { max: 12, says: 'round' },
  'products.pages.compare.title': { max: 18, says: 'phone' },
  'products.pages.compare.note': { max: 66, says: 'moreLines' },
  'products.pages.fresh.title': { max: 18, says: 'phone' },
  'products.pages.fresh.note': { max: 92, says: 'moreLines' },
  'products.pages.responsive.title.*': { max: 18, says: 'phone' },
  'products.pages.overview.*': { max: 19, says: 'phone' },
  'products.specLabels.*': { max: 40, says: 'twoLines' },
  'product.name': { max: 14, says: 'twoLines' },
  'product.tagline': { max: 36, says: 'moreLines' },
  'product.description': { max: 65, says: 'moreLines' },
  'product.spec.*': { max: 49, says: 'twoLines' },
  'product.impressions.text': { max: 180, says: 'moreLines' },
  'product.testimonial.name': { max: 31, says: 'twoLines' },
  'product.testimonial.role': { max: 38, says: 'moreLines' },
  'product.testimonial.quote.0': { max: 182, says: 'moreLines' },
  'product.testimonial.quote.1': { max: 57, says: 'moreLines' },
};
export const limitOf = (path: Path) => {
  const rule = Object.keys(LIMITS).find((pattern) => matches(pattern, path));
  return rule ? LIMITS[rule] : null;
};

// ------------------------------------------------------------------ help

/** Where a field shows: the most particular `helpAt`, else `help` by its name. */
export function whereFor(path: Path, t: Copied): string {
  const rule = Object.keys(t.helpAt)
    .filter((pattern) => matches(pattern, path))
    .sort((a, b) => b.replace(/\*/g, '').length - a.replace(/\*/g, '').length)[0];
  const name = [...path].reverse().find((segment) => typeof segment === 'string') as string | undefined;
  return rule ? t.helpAt[rule] : (name && t.help[name]) || '';
}

/** A field's line of help: where it shows, then its length guidance. */
export function helpFor(path: Path, t: Copied): string {
  const where = whereFor(path, t);
  const limit = limitOf(path);
  return limit ? `${where} ${t.limits.sentence.replace('{n}', String(limit.max)).replace('{says}', t.limits.says[limit.says])}` : where;
}

// ----------------------------------------------------------------- check

export interface Field {
  path: Path;
  kind: 'text' | 'number' | 'boolean' | 'image' | 'list' | 'things' | 'group';
}

/** Every field, list and group the admin draws for `value` at `path`, as it draws them. */
export function fieldsOf(value: Json | undefined, path: Path, out: Field[] = []): Field[] {
  if (value === undefined || value === null || isHidden(path)) return out;
  if (isMedia(value)) {
    out.push({ path, kind: 'image' });
    if ('alt' in value) out.push({ path: [...path, 'alt'], kind: 'text' });
    return out;
  }
  if (Array.isArray(value)) {
    out.push({ path, kind: isObjectList(value) ? 'things' : 'list' });
    value.forEach((item, i) => fieldsOf(item, [...path, i], out));
    return out;
  }
  if (typeof value === 'object') {
    if (path.length > 1) out.push({ path, kind: 'group' });
    for (const [key, child] of Object.entries(value as Obj)) fieldsOf(child, [...path, key], out);
    return out;
  }
  out.push({ path, kind: typeof value === 'string' ? 'text' : (typeof value as 'number' | 'boolean') });
  return out;
}

/** Every field the admin can show: the sections' and a product's, with the parts a product may add. */
export function allFields(seed: Obj): Field[] {
  const out: Field[] = [];
  for (const view of VIEWS) {
    for (const part of view.parts) {
      const path = pathOf(part);
      const value = path.reduce<Json | undefined>((node, segment) => (node && typeof node === 'object' ? (node as Obj)[segment as string] : undefined), seed);
      fieldsOf(value, path, out);
    }
  }
  const products = seed.products as Obj;
  for (const item of products.items as Obj[]) fieldsOf(item, ['product'], out);
  // The parts a product may add: a link, a testimonial, an old version.
  out.push({ path: ['product', 'href'], kind: 'text' });
  fieldsOf(((products.pages as Obj).testimonial as Obj).stand, ['product', 'testimonial'], out);
  fieldsOf((((products.items as Obj[])[0].front as Obj).after as Obj), ['product', 'front', 'before'], out);
  return out;
}

const shape = (path: Path) => path.map((segment) => (typeof segment === 'number' ? '*' : segment)).join('.');

/**
 * What the admin would show without Mongolian words: each problem a line.
 * Empty means every field, section, group, list, length and value has them.
 */
export function checkAdmin(seed: Obj, t: Copied): string[] {
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
  for (const reason of ['content', 'image', 'claim', 'budget', 'contrast', 'labels', 'video', 'other']) {
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
