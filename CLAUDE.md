# Anir Agency — website

The portfolio site for Anir ХХК, a four-person creative studio in Ulaanbaatar.
Domain: **aniragency.mn**

Read this file before writing any code. It is the constitution — where this
document and a request disagree, ask rather than guess.

---

## What this site is for

Anir sells four things: website development, poster design, photo shoots, and
app development. The site has to do two jobs, in this order:

1. Convince a Mongolian client that this small, young studio does serious work.
2. Get them into the enquiry form with a budget already selected.

It is **not** a blog, not a CMS-driven marketing site, and not a place to
demonstrate technical tricks. Every effect either serves the two jobs above or
comes out.

---

## Hard constraints

These are not preferences. Breaking one is a bug.

| Constraint | Value |
|---|---|
| Language | **Mongolian only.** No English toggle, no i18n framework. |
| First load | **Under 1 MB.** JS under 200 KB. See Budget below for the one lazy asset and the below-the-fold media allowed on top. |
| Hosting | **Cloudflare Pages.** Not Vercel — Cloudflare has a PoP in Ulaanbaatar, Vercel's nearest edge is Tokyo/Seoul. |
| Output | **Static.** No SSR, no server runtime except the one contact-form function. |
| 3D / WebGL | **No runtime 3D. Pre-rendered stills are allowed.** Nothing ships a render loop, a scene graph or a WebGL context. The hero mark is 7 pre-rendered frames in one 7 × 1 strip at 600 × 667; the tilt is a `background-position` lookup. |
| Cyrillic | Every font must render **Ө Ү ө ү**. These live in the `cyrillic-ext` subset — a font with only `cyrillic` will tofu on Mongolian. |
| Node | **Pin to 22** via `.nvmrc`. Cloudflare Pages' V3 build image ships Node 22 by default; building locally on a different major than CI is a needless risk on a static site. |
| Motion | Must fully disable under `prefers-reduced-motion: reduce`. |

Audience is on ~17 Mbps mobile and ~23 Mbps fixed connections. Assume every
kilobyte is felt.

### Budget

Three budgets, checked separately:

- **First load: 1 MB, of which JS 200 KB.** Exactly as above, for everyone.
- **Lazy: up to 500 KB, on top of that.** One desktop-only asset may load
  *after* first paint, gated on `(pointer: fine)` and `(min-width: 861px)` —
  the same query, character for character, as the layout it serves — and
  skipped when `navigator.connection.saveData` is true or
  `hardwareConcurrency <= 4`. Today that asset is the hero mark's sprite sheet.

**A lazy asset waits for first contentful paint, not for `load`. `load` fires
before FCP on a fast build.**

- **Below-the-fold media: 1.6 MB total.** Every item lazy and out of the
  critical path. **No single file over 300 kB is fetched when
  `navigator.connection.saveData` is true.** Within it:
  - Tiles **≤ 300 kB together**, on every connection — a separate cap from
    the `saveData` rule. AVIF, encoded at display size, never scaled
    down in CSS from something larger. Explicit `width`/`height` on every one.
    Plain `<img loading="lazy" decoding="async">` — they are the work, so they
    load on every connection, `saveData` included, with JS on or off.
  - Video **≤ 1.2 MB**, `preload="none"`, `muted`, `playsinline`, `loop`,
    explicit dimensions, poster **≤ 40 kB**. Its `src` is attached by script
    only when the section is within one viewport, behind the same `saveData`
    and `hardwareConcurrency` gates as the lazy asset; otherwise the poster
    stands in.

  An element joins this lane by declaring `data-lane="tile|poster|video"`.
  On `saveData` every tile and the poster load and the video does not. That
  is not generous: the tiles are lazy, so a visitor who never scrolls to the
  mosaic never fetches them. The bytes go only to someone who chose to look
  at the work.

Placeholder media lives in `public/media/placeholder/`. It stands in for
missing real media in `astro dev` and on Workers Builds preview builds, so
a section can be reviewed on a preview URL. Production — the `main` branch —
never renders it: the build strips the folder from `dist/`, fails if real
media in `site.ts` points inside it, and fails if `PLACEHOLDER_MEDIA=1` is
set. A local `npm run build` builds what production ships;
`PLACEHOLDER_MEDIA=1` adds the placeholders to it. The rule lives in one
place, `src/lib/placeholders.mjs`.

`scripts/budget.mjs` checks the three budgets separately and must stay blocking.
Do not make it advisory.

---

## Design tokens

Taken from the Figma file's `Anir / Colour` variable collection. These are the
only colours in the project. No one-off hex values.

```css
--ink:     #08090B;  /* primary background          */
--ink-2:   #121519;  /* deep surface, hover ground  */
--paper:   #EEF0F3;  /* light background            */
--paper-2: #DCE0E5;  /* plates — where imagery sits */
--dim:     #767C85;  /* secondary text              */
--orange:  #FF3300;  /* active state ONLY           */
```

### The orange rule

`--orange` marks what is **active, selected, or clickable**. It never
decorates. Concretely: the hero wordmark, scroll progress, the current section
label, hover states, selected chips, step numbers. If you are reaching for
orange and the element is not interactive or live, use `--dim` instead.

This rule exists because the logo ships in exactly two states — all black or
all orange, never mixed. Scattering orange across headings turns a restrained
palette into a fast-food one within a week.

### Contrast — measured, not assumed

Measured in Phase 02. An earlier draft of this file predicted these backwards;
these are the real numbers.

| Pair | Ratio | Verdict |
|---|---|---|
| `--dim` on `--ink` | 4.74 : 1 | passes AA |
| `--dim` on `--paper` | 3.68 : 1 | **fails** |
| `--orange` on `--ink` | 5.43 : 1 | passes AA |
| `--orange` on `--paper` | 3.21 : 1 | **fails** for text |
| `--ink` on `--orange` | 5.43 : 1 | passes AA |
| white on `--orange` | 3.67 : 1 | **fails** |

Three rules follow:

1. **`--muted` is tone-split.** One grey cannot serve both grounds — a grey dark
   enough for `--paper` fails on `--ink`. Section sets `#767C85` on dark and
   `#656B75` on light.
2. On light sections, orange fails the 4.5:1 small-text bar (3.21:1) but
   passes the 3:1 large-text bar. It may be used as text only at >=24px
   regular or >=18.66px bold — the enquiry email at Display/M (26–34px)
   qualifies. Below that it is a mark, not a text colour: use --muted and
   return the orange as a 2px rule or dot.
3. **Text on an orange fill is `--ink`, never white.** White on orange fails.

The Figma `Anir / Colour` collection must carry the same split, or the design
file and the build disagree.

### Typography

Three faces, three jobs, all Cyrillic-native. Self-host as woff2 — do not link
Google Fonts in production (extra DNS + connection on a slow network).

| Role | Face | Where |
|---|---|---|
| Display | **Oswald** (500, 600) | Headlines, section titles, prices, project names. Always uppercase. |
| Accent | **PT Serif** (400, 400 italic) | Section subtitles, product taglines. Italic carries the personality. |
| Body / UI | **JetBrains Mono** (300, 400) | All body copy, labels, specs. Uppercase + wide tracking for labels. |

PT Serif is deliberate: ParaType built it to cover the minority Cyrillic
languages of Russia, so Ө and Ү are properly drawn rather than bolted on.

**Subsetting rule.** Do NOT ship Google's whole `cyrillic-ext` range. Mongolian
Cyrillic is the 33 Russian letters — already covered by the `cyrillic` subset —
plus exactly four characters from ext:

```
U+04AE  Ү      U+04AF  ү
U+04E8  Ө      U+04E9  ө
```

So every face ships `latin` + `cyrillic` + those four codepoints, nothing else.
Shipping full `cyrillic-ext` buys Serbian, Macedonian, Bashkir and Kazakh glyphs
this site will never render — and it is most expensive precisely on PT Serif,
because broad minority-language coverage is the reason we chose that face.

Fonts are the single largest fixed cost on this site. Any change to the font
files must be followed by `npm run budget`, and the number reported.

Scale (sizes match the Figma text styles exactly — do not invent sizes).
Display/XL, L and M are set at 102% leading, not Figma's 96 / 98 / 100%: below
1.02 the breve on Й collides with the line above. The Figma text styles must
carry the same values, or the design file and the build disagree.

```
Display/XL     Oswald 600   92px / 102% / +0.5% / uppercase
Display/L      Oswald 600   56px / 102% / uppercase
Display/M      Oswald 600   34px / 102% / uppercase
Display/S      Oswald 500   22px / 110% / +8%  / uppercase
Serif/Display  PT Serif 400 44px / 120%
Serif/Italic   PT Serif 400i 21px / 135%
Mono/Body      JB Mono 300  11px / 200% / +7%  / uppercase
Mono/Label     JB Mono 400  10px / 160% / +18% / uppercase
Mono/Spec      JB Mono 400  10.5px / 185%
```

### Layout

- Desktop canvas 1440. Content inset: **144px left** (an 88px rail + 56px pad), 56px right.
- Sections alternate light and dark. Where two dark sections have to meet,
  one is full and the other sparse, so density separates them where tone
  cannot: the edge-to-edge showreel mosaic after the hero (a glowing video
  needs dark ground), and the sparse process after the ruled work rows
  (low-alpha orange needs dark ground).
- Structure is drawn with **1px hairlines**, not shadows or rounded cards.
  Grids are built as a 1px-gap flex/grid whose container background is the
  hairline colour. Corner ticks on section boundaries.
- No `border-radius` on UI surfaces: buttons, inputs, cards, media frames,
  the enquiry form. Geometric marks that are circular by nature are not UI
  surfaces. The eyebrow pills (100px) are the one rounded UI element.

---

## Stack

- **Astro** — static output. Chosen because it ships zero JS by default, which
  solves the bandwidth constraint at the architecture level instead of forcing
  us to optimise our way out later.
- **No animation library** — scroll reveals are IntersectionObserver plus a CSS
  transition, ~1 kB (`src/scripts/motion.ts`), against ~115 kB for GSAP +
  ScrollTrigger. Do not reintroduce GSAP without a real timeline need —
  scrubbing, pinning, sequenced timelines — and none of those is on this site.
- **Lenis** — smooth scroll. Must no-op under reduced-motion.
- **Cloudflare Pages** — hosting. **Pages Functions** for the one contact endpoint.
- **Supabase** — stores contact submissions. Anir already runs Supabase for
  Ethos and Ezmath, so this is not a new dependency.

No React. No Tailwind. No UI library. Plain `.astro` components and CSS custom
properties — the site is one static page, a framework earns nothing here.

---

## Conventions

- Components in `src/components/`, one per section, named in English
  (`Pricing.astro`), with Mongolian content inside.
- **All copy lives in `src/content/site.ts`** as a typed object. Never hardcode
  Mongolian strings in a component — the team needs one file to proofread.
- Prices are data, not markup. They change; they live in `site.ts`.
- Every image ships with explicit `width`/`height` to prevent layout shift.
- Every video: `muted`, `playsinline`, `loop`, `preload="none"`, a `poster`
  frame, and `loading="lazy"` on anything below the fold. Below the fold the
  poster is a lazy `<img>` under the video, not the `poster` attribute —
  browsers fetch that eagerly, whatever `preload` says.

---

## Reference

- **Figma:** https://www.figma.com/design/xJxjku0wp5zX4AO23pdJP5 — page `01 · Desktop`
  is the layout, page `02 · Foundations` is the token reference.
- **Art direction:** db-longbow.webflow.io (restraint, video-as-hero, type scale)
- **Structure:** visioned.ch (agency page order, budget-qualifying enquiry form)

---

## Definition of done

A phase is not finished until:

1. `npm run build` succeeds with no warnings.
2. The built page is under the weight budget (`npm run budget`).
3. It renders correctly with JS disabled — content is static HTML; motion is enhancement.
4. `prefers-reduced-motion: reduce` kills all animation.
5. Ө and Ү render in every font on the page.
6. Nothing is hardcoded that belongs in `site.ts` or the token file.