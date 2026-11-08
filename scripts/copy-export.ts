/**
 * Every Mongolian string the site and the admin show, in order, with where
 * each one appears — for the proofreader, so nobody has to read site.ts or
 * admin.ts to proofread.
 *
 *   npm run copy:export                 everything        → mongolian-copy.md
 *   npm run copy:export -- --visitor    what visitors read → mongolian-copy-visitor.md
 *   npm run copy:export -- --admin      the admin's words  → mongolian-copy-admin.md
 *
 * --visitor is the one that blocks a launch: the home page top to bottom,
 * the products page and every product's page, the contact form, the menu,
 * Google's title and description, and the words only screen readers read.
 * Nothing a visitor never sees: no admin label, no section switched off, no
 * stand-in that only a preview shows. --admin is the admin's own words —
 * labels, help, messages — with the key a developer needs to change one.
 * Both flags together write both files.
 *
 * It walks the same schema the admin's build check walks
 * (src/scripts/admin-schema.ts), in the admin's tree order, each string under
 * the names the admin gives it and the line of help that says where it shows.
 * The site's words are as published now: site.ts with everything the team
 * has saved laid over it (`precopy:export` pulls the saved content first).
 */
import { writeFileSync } from 'node:fs';

import { admin as t } from '../src/content/admin.ts';
import { site } from '../src/content/site.ts';
import { GROUPS, PRODUCT_ORDER, VIEWS, isHidden, isMedia, pathOf, whereFor, type Json, type Obj, type Path } from '../src/scripts/admin-schema.ts';

const args = process.argv.slice(2);
const wantVisitor = args.includes('--visitor');
const wantAdmin = args.includes('--admin');
const wantAll = !wantVisitor && !wantAdmin;

const MONGOLIAN = /[Ѐ-ӿ]/;

/**
 * On no page a visitor can open: the old products reel's words, the silk's
 * light variant (the /v2 review page), the stand-in testimonial (previews
 * only), and the sections the page code switches off.
 */
const UNSEEN = ['products.controls', 'products.intro.eyebrow', 'products.intro.title', 'products.statement.backdropLight', 'products.pages.testimonial.stand', 'pricing', 'team'];
const seenByVisitors = (path: Path) => !UNSEEN.some((prefix) => path.join('.') === prefix || path.join('.').startsWith(`${prefix}.`));

interface Line {
  path: Path;
  where: string;
  help: string;
  text: string;
}

const name = (segment: string | number) =>
  typeof segment === 'number' ? t.list.ordinal.replace('{n}', String(segment + 1)) : segment === '*' ? 'бүх' : (t.labels[segment] ?? segment);
/** A section by the name its view has in the tree: «Эхний дэлгэц», not its key. */
const sectionName = (key: string) =>
  key === 'products' ? t.groups.products : key === 'nav' || key === 'chrome' ? t.views.frame : (t.views[key] ?? key);
/** A field's place, in the admin's own names: «Оршил», «Эхний дэлгэц › Логоны тайлбар». */
const placeOf = (path: Path, from = 1) =>
  [...(from === 0 && typeof path[0] === 'string' ? [sectionName(path[0])] : []), ...path.slice(from === 0 ? 1 : from).map(name)].join(' › ') ||
  name(path[0]);
const cell = (text: string) => text.replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');

let seen = new Set<string>();

/** The Mongolian strings at a path, in content order, each once; `hidden` picks those the admin hides. */
function strings(value: Json | undefined, path: Path, out: Line[], { hidden = false, from = 1 } = {}): Line[] {
  if (value === undefined || value === null) return out;
  // Stand-ins for missing media never ship: nothing there to proofread.
  if (path.includes('placeholder')) return out;
  const key = path.join('.');
  if (typeof value === 'string') {
    if (!MONGOLIAN.test(value) || seen.has(key)) return out;
    seen.add(key);
    // Hidden if it, or anything it sits in, is hidden in the admin.
    const off = path.some((_, i) => isHidden(path.slice(0, i + 1)));
    if (off !== hidden) return out;
    out.push({ path, where: placeOf(path, from), help: off ? '' : whereFor(path, t), text: value });
    return out;
  }
  if (Array.isArray(value)) {
    value.forEach((item, i) => strings(item, [...path, i], out, { hidden, from }));
    return out;
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value);
    if (path.length === 1 && path[0] === 'product') keys.sort((a, b) => (PRODUCT_ORDER.indexOf(a) + 1 || 99) - (PRODUCT_ORDER.indexOf(b) + 1 || 99));
    // A picture's own words are its description.
    for (const k of isMedia(value) ? ['alt'] : keys) strings((value as Obj)[k], [...path, k], out, { hidden, from });
  }
  return out;
}

const at = (path: Path) =>
  path.reduce<Json | undefined>((node, segment) => (node && typeof node === 'object' ? (node as Obj)[segment as string] : undefined), site as unknown as Obj);

// -------------------------------------------------------- the site's words

interface Section {
  title: string;
  note?: string;
  lines: Line[];
  /** On a page a visitor can open. */
  visitor: boolean;
}
const sections: Section[] = [];
for (const group of GROUPS) {
  for (const view of VIEWS.filter((v) => v.group === group)) {
    const lines: Line[] = [];
    for (const part of view.parts) strings(at(pathOf(part)), pathOf(part), lines, { from: 1 });
    sections.push({ title: `${t.groups[group]} › ${t.views[view.id]}`, note: view.off ? t.offHelp : undefined, lines, visitor: !view.off });
  }
  if (group === 'products') {
    for (const product of site.products.items as unknown as Obj[]) {
      seen = new Set();
      sections.push({ title: `${t.groups.products} › ${String(product.name)}`, lines: strings(product as Json, ['product'], [], { from: 1 }), visitor: true });
    }
  }
}

// Read by screen readers, or on no page today: not in the admin, still proofread.
seen = new Set();
const hiddenLines: Line[] = [];
for (const [section, value] of Object.entries(site as unknown as Obj)) {
  if (section === 'products') {
    for (const [k, v] of Object.entries(value as Obj)) if (k !== 'items') strings(v, [section, k], hiddenLines, { hidden: true, from: 0 });
    for (const product of (value as Obj).items as Obj[]) strings(product as Json, ['product'], hiddenLines, { hidden: true, from: 0 });
  } else strings(value, [section], hiddenLines, { hidden: true, from: 0 });
}

// --------------------------------------------------------- the admin's words

/** What each part of the admin's words is, so a string's key says where it shows. */
const ADMIN_PARTS: Record<string, string> = {
  labels: 'Талбарын нэр',
  helpAt: 'Талбарын доорх тайлбар',
  help: 'Талбарын доорх тайлбар',
  views: 'Зүүн цэсний нэр',
  viewHelp: 'Хэсгийн дээд талын тайлбар',
  groups: 'Зүүн цэсний бүлэг',
  publish: '«Нийтлэх» товчны мэдэгдэл',
  inbox: 'Хүсэлтүүд',
  image: 'Зураг байршуулах',
  draft: 'Хадгалаагүй өөрчлөлт',
  limits: 'Уртын анхааруулга',
  preview: 'Урьдчилан харах',
  signIn: 'Нэвтрэх',
  list: 'Жагсаалт',
  rows: 'Жагсаалтын мөр',
  newProduct: 'Шинэ бүтээгдэхүүн',
  tasks: 'Ажил (даалгавар, тайлан)',
  notify: 'Telegram мэдэгдэл',
  alerts: 'Төлөвийн мөрийн анхааруулга',
};
/** What the Worker says on its own — to the team's Telegram, or on the admin's status line. Never to a visitor. */
const OPERATIONAL = new Set(['notify', 'alerts']);
const adminLines: Line[] = [];
const walkAdmin = (value: unknown, path: string[]) => {
  if (typeof value === 'string') {
    if (!MONGOLIAN.test(value)) return;
    const [part, ...rest] = path;
    const place = part === 'helpAt' ? rest.join('.').split('.').map(name).join(' › ') : rest.join(' › ');
    adminLines.push({ path, where: `${ADMIN_PARTS[part] ?? 'Ерөнхий'}${place ? ` › ${place}` : ''}`, help: `\`${path.join('.')}\``, text: value });
    return;
  }
  if (Array.isArray(value)) return value.forEach((item, i) => walkAdmin(item, [...path, String(i + 1)]));
  if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) walkAdmin(child, [...path, key]);
};
walkAdmin(t, []);

// ------------------------------------------------------------ the documents

const today = new Date().toISOString().slice(0, 10);
const table = (lines: Line[], n: { i: number }, keys = false) => [
  '| № | Хаана | Бичвэр |',
  '|---|---|---|',
  ...lines.map((line) => `| ${++n.i} | ${cell(line.where)}${line.help ? `<br><sub>${keys ? line.help : cell(line.help)}</sub>` : ''} | ${cell(line.text)} |`),
  '',
];

function document(title: string, intro: string[], parts: { heading: string; sections: Section[]; keys?: boolean }[]): { text: string; count: number } {
  const n = { i: 0 };
  const count = parts.reduce((k, p) => k + p.sections.reduce((m, s) => m + s.lines.length, 0), 0);
  const out = [`# ${title}`, '', `Хянах ${count} бичвэр. ${today}-нд \`npm run copy:export\`-аар үүсгэв — гараар засахгүй.`, '', ...intro, ''];
  for (const part of parts) {
    out.push(`## ${part.heading}`, '');
    for (const section of part.sections) {
      if (!section.lines.length) continue;
      if (part.sections.length > 1) out.push(`### ${section.title}`, '');
      if (section.note) out.push(`> ${section.note}`, '');
      out.push(...table(section.lines, n, part.keys));
    }
  }
  return { text: out.join('\n'), count };
}

const siteIntro = '- **Сайтын бичвэр** — удирдлагын хэсэгт «Хаана» баганад бичсэн нэрээр нь олж засна (зүүн цэс › талбар).';
const adminIntro = '- **Удирдлагын бичвэр** — засах шаардлагатай бол доорх түлхүүрийг сайтыг хөгжүүлсэн хүнд хэлнэ.';
const hiddenNote = 'Дэлгэц уншигч уншдаг, эсвэл одоо ямар ч хуудсанд гардаггүй бичвэрүүд. Засвар хэрэгтэй бол сайтыг хөгжүүлсэн хүнд хэлнэ.';
const operationalNote = 'Зочдод хэзээ ч харагддаггүй. Сайт өөрөө ажлынханд Telegram-аар илгээдэг, эсвэл удирдлагын дээд талын төлөвийн мөрөнд гаргадаг бичвэр. {n}, {when} — програм бөглөнө, хэвээр үлдээнэ.';
const admin: Section[] = [
  { title: 'Удирдлагын дэлгэц', lines: adminLines.filter((line) => !OPERATIONAL.has(String(line.path[0]))), visitor: false },
  { title: 'Ажлын мэдэгдэл, анхааруулга', note: operationalNote, lines: adminLines.filter((line) => OPERATIONAL.has(String(line.path[0]))), visitor: false },
];
const operational = admin[1].lines.map((line) => line.text);

const written: string[] = [];
const write = (file: string, doc: { text: string; count: number }) => {
  writeFileSync(file, doc.text);
  written.push(`  ${String(doc.count).padStart(4)} strings → ${file}`);
};

if (wantAll) {
  write(
    'mongolian-copy.md',
    document('Анир — монгол бичвэрийн жагсаалт', [siteIntro, adminIntro], [
      { heading: '1. Сайтын бичвэр', sections: [...sections, { title: 'Удирдлагад харагддаггүй', note: hiddenNote, lines: hiddenLines, visitor: false }] },
      { heading: '2. Удирдлагын бичвэр', sections: admin, keys: true },
    ])
  );
}
if (wantVisitor) {
  // Only what a visitor can read: switched-off sections, the preview's stand-in and the old reel's words left out.
  const visible = sections.filter((s) => s.visitor).map((s) => ({ ...s, lines: s.lines.filter((line) => seenByVisitors(line.path)) }));
  const readers = hiddenLines.filter((line) => seenByVisitors(line.path));
  const doc = document('Анир — зочдод харагдах бичвэр', [siteIntro, '- Нүүр хуудас дээрээс доош, «Бүтээгдэхүүн» хуудас ба бүтээгдэхүүн бүрийн хуудас, маягт, цэс, Google, эцэст нь дэлгэц уншигчийн бичвэр. Удирдлагын бичвэр, Telegram мэдэгдэл, унтраалттай хэсэг, урьдчилан харахын түр бичвэр орохгүй.'], [
    { heading: 'Сайтын бичвэр', sections: [...visible, { title: 'Дэлгэц уншигч уншдаг', note: 'Хуудсан дээр харагдахгүй ч дэлгэц уншигч уншдаг бичвэр. Засвар хэрэгтэй бол сайтыг хөгжүүлсэн хүнд хэлнэ.', lines: readers, visitor: true }] },
  ]);
  // The proofreader's document carries nothing the Worker says to the team.
  // Each message is looked for by its longest fixed run of words between
  // placeholders — not by what comes before the first one, which is nothing
  // for «{n} хүсэлт…» and one common word for «Сайт {when}…», and matched
  // the site's own copy.
  const fixed = (text: string) => text.split(/\{\w+\}/).map((part) => part.trim()).sort((a, b) => b.length - a.length)[0] ?? '';
  const leaked = operational.filter((text) => fixed(text).length >= 12 && doc.text.includes(fixed(text)));
  if (leaked.length) throw new Error(`copy:export --visitor carries operational strings: ${leaked.join(' | ')}`);
  write('mongolian-copy-visitor.md', doc);
}
if (wantAdmin) {
  write('mongolian-copy-admin.md', document('Анир — удирдлагын бичвэр', [adminIntro], [{ heading: 'Удирдлагын бичвэр', sections: admin, keys: true }]));
}

console.log(`\n  COPY EXPORT\n${written.join('\n')}\n`);
