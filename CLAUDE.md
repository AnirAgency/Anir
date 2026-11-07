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

The team edits its words and images in an admin, by the owner's direction
(see **The admin** below) — but a visitor never meets a CMS: every publish is
a static build, held to every rule in this file like any other.

---

## Hard constraints

These are not preferences. Breaking one is a bug.

| Constraint | Value |
|---|---|
| Language | **Mongolian only.** No English toggle, no i18n framework. |
| First load | **Under 1 MB.** JS under 200 KB. See Budget below for the one lazy asset and the below-the-fold media allowed on top. |
| Hosting | **Cloudflare Workers**, with Static Assets. Not Vercel — Cloudflare has a PoP in Ulaanbaatar, Vercel's nearest edge is Tokyo/Seoul. |
| Output | **Static.** No SSR, no server runtime except the Worker's routes: the contact form and its health check, the admin's — publishing, and, by the owner's direction, the enquiries inbox and the Worker's alerts — for editors only, and the build's report on itself, with its own secret; and the 15-minute schedule (drain, digest, flood). |
| Enquiries | **No visitor input may cause one not to be stored.** What does not match the published form is stored as sent and flagged — even a body that cannot be read — never refused; only the honeypot and the rate limit (5 per IP an hour, the only bound on the table) keep one out. Nothing about a request's *shape* discards it: the health check is known by a credential (`HEALTH_CHECK_SECRET`), never by its body. The table checks only the lengths the Worker cuts to. `scripts/test-enquiry.ts` holds it with hundreds of hostile inputs. |
| 3D / WebGL | **No runtime 3D. Pre-rendered stills are allowed.** Nothing ships a render loop, a scene graph or a WebGL context. The hero mark is 7 pre-rendered frames in one 7 × 1 strip at 600 × 667; the tilt is a `background-position` lookup. |
| Cyrillic | Every font must render **Ө Ү ө ү**. These live in the `cyrillic-ext` subset — a font with only `cyrillic` will tofu on Mongolian. |
| Node | **Pin to 22** via `.nvmrc`. Workers Builds is set to Node 22 (`NODE_VERSION`); building locally on a different major than CI is a needless risk on a static site. |
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
place, `src/lib/placeholders.mjs`. It is **checked, not assumed**:
`scripts/no-placeholders.mjs`, last in `npm run budget`, fails a production
build if any file in its output — page, script, style, data — names a
placeholder file. And placeholders are downloaded all the same, by every
preview and by any public preview copy, so they are held to a size cap
too (below).

Two stand-ins are held to more, because they would make a **claim** rather
than look unfinished: the stand-in testimonial, a quote nobody said; and a
product's old picture marked `demo` — Ezmath and Olymo, built new, set up as
redesigns for review — a before-and-after for work that never happened.
Production renders neither: a testimonial needs a name and words, and a
`demo` picture resolves to nothing in `src/lib/media.ts` whatever is named or
uploaded into it. `npm run budget` fails if a production page carries either.

`scripts/budget.mjs` checks the three budgets separately and must stay blocking.
Do not make it advisory. The ceilings are per page — a visitor pays for one
page at a time — and `npm run budget` holds every built page to them: the home
page in full, the rest through `scripts/budget-pages.mjs`. A `<picture>` counts
as the one file a browser fetches from it, its first source (AVIF); the WebP
and JPEG beside it are never fetched by a browser this site supports.

**Video is held twice: on the page and as a file.** Video is a committed
build-time asset, so an oversized export is permanent in git and downloaded by
every visitor. `npm run media` ends every run by holding every video and poster
in `public/media/` — encoded there or copied in by hand — to its cap (a clip
400 kB, any other video 1.2 MB, a poster 40 kB, a placeholder 3 MB — looser,
never exempt; `scripts/limits.mjs`, shared with `budget.mjs`), and fails as
`npm run budget` does; `npm run budget` runs the same check
(`media.mjs --check`) on every build. Blocking, never advisory.

---

## Design tokens

Taken from the Figma file's `Anir / Colour` variable collection. These are the
only colours in the project. No one-off hex values.

```css
--ink:     #08090B;  /* primary background          */
--ink-2:   #121519;  /* deep surface, hover ground  */
--paper:   #EEF0F3;  /* light background            */
--paper-2: #DCE0E5;  /* plates — where imagery sits */
--dim:     #7C828B;  /* secondary text on dark      */
--dim-2:   #5D636D;  /* secondary text on light     */
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

**The process circles are a graphic mark, not a UI surface claiming
interactivity.** That is the same distinction the `border-radius` rule draws,
and it is what lets orange circles and a neutral heading live under one rule:
headings, column heads and labels stay neutral; the chain is the brand's
mark, drawn in its colour. The Services marquee bands are the same kind of
surface: an orange ground, with the service's name on it in `--ink`.

**One exception, by the owner's direction:** the orange silk behind the home
page's products statement — a still generated for Anir, on dark or, on /v2,
on --paper — and, dimmed, behind each product page's introduction, is
decoration, and is allowed as such. A shade of the section's own ground
sits between it and the words, so text is never set on bright orange; it
appears nowhere else.

### Contrast — measured, not assumed

Measured in Phase 02; re-measured in Phase 16 with the film grain in place,
and again when the grain was matched, by the owner's direction, to
visioned.ch's. The grain — a 168px tile made by `scripts/grain.mjs`: half
its pixels white, half black at 30% strength, single pixels that tend to
differ from their neighbours, laid over the page at 5% and shown at three
offsets in turn, 0.15 s each — lifts the white half of `--ink` by about 12
levels, as visioned's does, and lies over the whole page, the nav included,
so it moves text and ground alike. One grain does not change how readable a
letter is; the eye integrates over the stroke. So the grain is read as a
local average over a stroke-sized box, 3 × 3 at body size, at every position
of the tile — each pixel blended exactly as CSS blends it — and each "with
grain" figure is the **worst** pairing: the text under the box that moves it
most against the ground under the box that moves it most the other way. On
`--ink` the boxes move it between −0.1 and +11.0 levels, +6.1 on average.
The boil only moves the tile, so the set of boxes never changes.

| Pair | Flat | With grain | Verdict |
|---|---|---|---|
| `--dim` on `--ink` | 5.14 : 1 | 4.64 : 1 | passes AA |
| `--dim` on `--paper` | 3.39 : 1 | 3.05 : 1 | **fails** |
| `--dim-2` on `--paper` | 5.30 : 1 | 4.63 : 1 | passes AA |
| `--dim-2` on `--ink` | 3.29 : 1 | 2.98 : 1 | **fails** |
| `--orange` on `--ink` | 5.43 : 1 | 4.89 : 1 | passes AA |
| `--orange` on `--paper` | 3.21 : 1 | 3.02 : 1 | **fails** for text below large size |
| `--ink` on `--orange` | 5.43 : 1 | 4.89 : 1 | passes AA |
| white on `--orange` | 3.67 : 1 | 3.45 : 1 | **fails** |
| `--paper` at `--rest-opacity` (0.40) on `--ink` | 3.43 : 1 | 3.11 : 1 | passes 3:1, large text only |

The last row is the Services list at rest: rows sit at `--rest-opacity` and
the hovered or open one goes to full. 0.40 keeps one step above the floor —
at 0.39 the worst pairing is 3.00, right on the bar. Opacity is never a way
to dim text below 24px; that is what `--muted` is for.

Phase 16 moved the two greys and nothing else: `--dim` #767C85 → #7C828B,
`--dim-2` #656B75 → #5D636D. Under the speck grain of the time, the Phase 02
values fell to 4.17 and 4.07. `--paper` stays #EEF0F3 — `--orange` on it
holds 3.02 against its 3.0 bar — and `--orange` stays: the logo fixes it.

The grain is at its ceiling. At 6% `--orange` on `--paper` falls to 2.99 and
the build fails; so does visioned's black half at full strength (`--dim` on
`--ink` 4.36, `--orange` on `--paper` 2.82), which is why it is at 30% — on
the dark grounds a black grain changes nothing either way, so there it is
visioned's exactly. Their ground, though, is a charcoal (#1A1A1A), where
the same grain shows more than on `--ink`'s near-black; `--orange` and
`--dim` fail on that charcoal as text (4.19 and 3.97), so `--ink` stays. Three grains came before this one and were set aside: sparse white
specks, too few and too bright; a soft-light grain, too faint on black; and
this one still, which the owner, watching visioned's, found lifeless.

`npm run contrast` measures this table from `tokens.css` and the shipped tile,
and fails if a pair that must pass does not. `npm run budget` runs it. If it
fails after a change to the grain or a token, fix the token or the tile, not
the opacity alone.

Three rules follow:

1. **`--muted` is tone-split.** One grey cannot serve both grounds — a grey dark
   enough for `--paper` fails on `--ink`. Section sets `--dim` on dark and
   `--dim-2` on light.
2. On light sections, orange fails the 4.5:1 small-text bar (3.02:1 with the
   grain) but passes the 3:1 large-text bar. It may be used as text only at >=24px
   regular or >=18.66px bold — Display/M (26–34px) qualifies. Below that it
   is a mark, not a text colour: use --muted and return the orange as a 2px
   rule or dot.
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
  needs dark ground), and the ruled services list after the sparse process
  (low-alpha orange needs dark ground). **By the owner's direction, the
  enquiry form is dark too**: it follows the ruled services list, and the
  section's hairline and corner ticks mark the boundary.
- **A fluid layout that mixes scaled graphics with fixed-minimum text has a
  breakpoint, and it has to be found by measurement, not derived.** The
  process spine is the case that taught it: its circles scale with the
  viewport, its labels cannot shrink below legibility, and two columns stop
  fitting below 1280px — measured by overlapping label boxes, not computed.
- Structure is drawn with **1px hairlines**, not shadows or rounded cards.
  Grids are built as a 1px-gap flex/grid whose container background is the
  hairline colour. Corner ticks on section boundaries. **One exception, by the
  owner's direction:** the showreel mosaic's tiles sit apart on 8px of the
  page's own ground, slightly out of line, like prints scattered on a table —
  it is the work on display, not structure. The wall of screens at the top of
  each product page, the two pictures laid against each other in its
  impressions, and the screens floating around the products page's name are
  the same kind of surface.
- No `border-radius` on UI surfaces: buttons, inputs, cards, media frames,
  the enquiry form. Geometric marks that are circular by nature are not UI
  surfaces. The eyebrow pills (100px) are the one rounded UI element — and,
  by the owner's direction, three on a product's own page: the round handle
  on its old-and-new comparison line, the round portrait in its testimonial,
  and the round button to the next product.

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
- **Cloudflare Workers** — hosting. Static Assets serves `dist/`; the Worker
  (`worker/index.ts`) answers the contact endpoint and the admin's endpoints
  (publish, the enquiries inbox, the storage figure). `_headers` is not applied
  to Worker responses, so the Worker attaches the same security headers itself,
  from the list `scripts/headers.mjs` generates — `npm run test:headers` checks it.
- **Supabase** — stores contact submissions, and the content the team edits in
  the admin. Anir already runs Supabase for Ethos and Ezmath, so this is not a
  new dependency.

No React. No Tailwind. No UI library. Plain `.astro` components and CSS custom
properties — the site is a handful of static pages, a framework earns nothing
here.

---

## Conventions

- Components in `src/components/`, one per section, named in English
  (`Pricing.astro`), with Mongolian content inside.
- Pages in `src/pages/`: the home page; `/products/`, Anir's own products;
  and `/products/<id>/`, one page per product, built from `site.products`
  alone — add a product there and its page exists. Their nav anchors lead
  back to the home page. `/v2` is a review page, built on dev and preview
  builds only, never in production.
- **All copy lives in `src/content/site.ts`** as a typed object — its types
  and its seed — and what the team saves in the admin is laid over it at
  build time. Components read `site` and nothing else. Never hardcode
  Mongolian strings in a component — the team needs one place to proofread:
  `site.ts` and the admin for the site, `src/content/admin.ts` for the admin's
  own words. Nobody proofreads those files: `npm run copy:export` writes every
  Mongolian string, site and admin, as one ordered list with where each appears.
- Prices are data, not markup. They change; they live in `site.ts` and the
  admin.
- Every image ships with explicit `width`/`height` to prevent layout shift.
- Every video: `muted`, `playsinline`, `loop`, `preload="none"`, a `poster`
  frame, and `loading="lazy"` on anything below the fold. Below the fold the
  poster is a lazy `<img>` under the video, not the `poster` attribute —
  browsers fetch that eagerly, whatever `preload` says.

---

## The admin

`/admin/` is where the team edits every word and image and adds, removes and
orders products. By the owner's direction it stores content in Supabase; the
site stays static.

- **Save** writes to Supabase (`supabase/migrations/0002_content.sql`):
  `site_content`, one row per section of `site.ts`; `products`, one row per
  product; uploads in the `media` bucket. Anyone may read; only a user listed
  in `editors` may write, enforced by row level security — never by the
  admin's own code.
- **Every save checks it is not overwriting.** A write sends back the
  `updated_at` the admin read and lands only if the row still has it; if
  someone saved in between, the editor is told, the table is read afresh, and
  their typing stays in the draft to lay back over it. A save writes only the
  row it saves — never every product from one browser's copy.
- **Publish** (`worker/publish.ts`) checks the caller is an editor and starts a
  production build through the Workers Builds deploy hook, a Worker secret.
  The build reports on itself — `npm run ci` wraps `npm run budget` and posts
  its start, exit code, branch and commit to `POST /api/builds`
  (`worker/builds.ts`) with a secret that can write one status row and nothing
  else, always `|| true` so a report can never change the build's exit code —
  and the admin reads that row: queued, building, done or failed, and why;
  fifteen minutes without a final report says so. Never a status code. **No
  Cloudflare API token**: the only permission level the Builds API offers
  could change the build command and deploy anything.
- **The enquiries inbox** (`worker/inbox.ts`), by the owner's direction, is the
  only reader of `enquiries`: the Worker checks the caller is an editor, then
  uses the service_role key, which never leaves it. The table keeps RLS on with
  no policies. Nothing deletes an enquiry — closing one sets its status — and
  opening one never marks it read. «Шинэ» lists new enquiries with nothing to
  check, and the badge counts only those; flagged ones — almost always bots,
  now that nothing is refused — wait under «Шалгах», counted apart, so the
  badge keeps counting people.
- **The order to switch publishing on** (README > The admin): migrations,
  the build secret, the merge with the build command unchanged, the same
  value as a Worker secret, `DEPLOY_HOOK_URL`, `HEALTH_CHECK_SECRET` (required:
  unset, a health check stores junk) — and only then the build command to
  `npm run ci`, or the first report posts to a route not yet deployed.
- **Notifications serve people, not the table.** Only an enquiry with
  nothing to check notifies at once; flagged ones are one «Шалгах: N шинэ»
  an hour at most, and a day past 50 stored enquiries sends one flood
  message (`worker/watch.ts`). The rate limiter fails open, never closed —
  but never silently: logged, recorded, shown in the admin.
- **The build** pulls the content first (`scripts/content-pull.mjs`): every
  upload is cut to its slot's `width` × `height` and encoded AVIF, WebP and
  JPEG into `public/media/live/`, so the site serves it itself. The content is
  laid over `site.ts` (`src/content/live.ts`); a type that disagrees stops the
  build. So a bad save, a page over budget or a broken image fails the build
  and the site stays as it was — nothing reaches a visitor unchecked.
- The forms are built from `site.ts`'s shape. A value that is code, not copy
  — a form field's name, an option's value the enquiries table checks — is
  hidden in the admin (`RULES` in `src/scripts/admin-schema.ts`). Add a field
  to `site.ts` and the admin shows it; hide it there if it is not copy.
- **No field shows as its English key.** Every field the admin shows needs a
  label and a line of help saying where it shows (`src/content/admin.ts`),
  and every list of things a declared row title (`SUMMARY`). The admin page's
  build checks them all and fails naming each one missing — so adding a field
  to `site.ts` means giving it words, or hiding it.
- **Length guidance, never a limit.** Past a field's length the admin says
  what happens — a second line, a cut Google title — and the editor decides.
  Each length (`LIMITS`) is measured on the built page at 1440 and 390, not
  guessed; re-measure when a section's layout changes.
- The tree follows the home page's order, top to bottom — never how often a
  section changes. It is how an editor knows where on the page they are.
- Video is not uploaded through the admin: it needs the media pipeline
  (`npm run media`).

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
2. Every built page is under the weight budget (`npm run budget`).
3. It renders correctly with JS disabled — content is static HTML; motion is enhancement.
4. `prefers-reduced-motion: reduce` kills all animation.
5. Ө and Ү render in every font on the page.
6. Nothing is hardcoded that belongs in `site.ts` or the token file.