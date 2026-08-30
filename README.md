# Anir Agency — aniragency.mn

Static Astro site for Anir ХХК. Read [CLAUDE.md](CLAUDE.md) before writing code —
it holds the design tokens, the type scale and the hard constraints. Where this
README and CLAUDE.md disagree, CLAUDE.md wins.

## Requirements

- **Node 20.3+** (developed on 25.9)
- **Python 3.11+** — only needed to rebuild the fonts, not to run the site

## Local development

```bash
npm install
npm run dev          # http://localhost:4321
```

| Script | What it does |
|---|---|
| `npm run dev` | Dev server with HMR |
| `npm run build` | Static build into `dist/` |
| `npm run preview` | Serves the built `dist/` locally |
| `npm run budget` | Builds, then enforces the weight budget. **Exits non-zero if the page is over.** |
| `npm run fonts` | Rebuilds the subset woff2 files in `public/fonts/` |
| `npm run shot` | Screenshots and measures a page — see [Screenshots](#screenshots) |

## The styleguide

`http://localhost:4321/styleguide` renders every colour token, every type style
with a Ө Ү sample, and one of each layout primitive in both tones. It is the
fastest way to see whether a font subset or a token has broken.

**It exists only in `astro dev`.** The page lives in `src/dev/`, not
`src/pages/`, and the `anir:dev-styleguide` integration in `astro.config.mjs`
injects it as a route when the dev server starts. A production build never
renders it, never emits it, and has no file to leak.

## Layout

```
src/
  components/    Section, Grid, Header, Rail — plus one per page section
  content/
    site.ts      ALL Mongolian copy and every price, typed
  dev/
    styleguide.astro   dev-only route, never built for production
  layouts/       page shells
  pages/         routes
  styles/
    fonts.css    @font-face declarations and the three family stacks
    tokens.css   the six colours and the nine type styles
    base.css     reset, focus ring, reduced-motion block
public/
  fonts/         the six subset woff2 files (committed)
  media/         video loops, plates, portraits (Phase 08 fills this)
functions/       Cloudflare Pages Functions — the contact endpoint only
scripts/
  budget.mjs     the weight budget
  fonts.mjs      the font subsetting pipeline
  shot.mjs       screenshots and page measurements over CDP
tools/
  fonts.config.json   which faces to build, and the unicode ranges
```

## The weight budget

CLAUDE.md caps the first load at **1 MB total and 200 kB of JS**. `npm run budget`
builds the site, walks `dist/index.html` and everything it references — following
CSS to catch the fonts, which nothing in the HTML links directly — and fails the
command if either ceiling is broken. It prints a per-file table and a breakdown by
file type so you can see what grew.

Budgets are counted in **decimal bytes** (1 MB = 1,000,000), because the constraint
they encode is bandwidth and link speed is measured decimally. Raw bytes are what
the budget enforces; the brotli column next to it is informational — it is what
actually crosses the wire, and it is near-useless for woff2 and video, which are
already compressed.

Inline `<script>` bodies count toward the JS ceiling even though they also sit
inside the HTML total. Otherwise inlining a bundle would hide a breach.

## Design foundation

Three files and four components carry the whole visual system.

- **`src/styles/tokens.css`** — the six colours, the two derived hairline
  colours, and the nine named type styles as `.t-*` utility classes. Sizes are
  `clamp()`, fluid between 390px and 1440px, hitting the Figma value exactly at
  1440. Never restate a size or a tracking in a component; use the class.
- **`src/styles/base.css`** — reset, the `--orange` focus ring, and the
  `prefers-reduced-motion` block that kills every animation and transition.
- **`Section.astro`** — the light/dark wrapper. Its job is to set `--bg`,
  `--fg`, `--muted`, `--line` and `--plate`. **Nothing below a Section should
  ever name `--ink` or `--paper` directly** — that indirection is what lets a
  section flip tone without any child knowing.
- **`Grid.astro`** — the hairline grid. Container painted `--line`, 1px gap,
  cells painted `--bg`. Collapses to one column under 860px.
- **`Header.astro`** and **`Rail.astro`** — fixed chrome, both using
  `mix-blend-mode: difference` so they read on either tone with no JS.

### Why the chrome is two layers

`difference` is what lets one set of markup read correctly on both tones:
`--paper` differenced against `--paper` is black, and against `--ink` is
near-white. But it would also eat `--orange` — orange over `--ink` stays orange,
while orange over `--paper` comes out cyan, which breaks the orange rule on
exactly the element that converts.

So the header and the rail each render two fixed siblings: a blended layer, and
an unblended one carrying the orange. They have to be siblings rather than
nested, because `position: fixed` creates a stacking context, which isolates the
blend group — a blended child inside a fixed parent has nothing to blend
against. Keep that in mind before restructuring either component.

## Screenshots

`npm run shot` drives whichever Chrome or Edge is already installed over the
DevTools protocol, using Node's built-in WebSocket — no Playwright, no
dependency. Viewport size is set with `Emulation.setDeviceMetricsOverride`, so
390 means 390 CSS pixels; passing `--window-size` to a headless browser does
not, and will lie to you about overflow.

```bash
npm run shot -- http://localhost:4321/styleguide out.png 1440 900 --full
npm run shot -- http://localhost:4321/styleguide out.png 390 844 --scroll=1400
npm run shot -- http://localhost:4321/styleguide --measure 390
npm run shot -- http://localhost:4321/ --measure 390 --reduced-motion
```

`--measure` reports scroll width, page height, and every element sticking out
past the viewport — the fastest way to find what is causing a horizontal
scrollbar. `--eval=<expr>` runs an expression in the page and prints the result.

## Fonts

Three families, six faces, self-hosted. **Do not replace these with Google Fonts
links** — an extra DNS lookup plus TLS handshake is expensive on a 17 Mbps
connection, which is what the audience is on.

| File | Face |
|---|---|
| `oswald-500.woff2` | Oswald 500 — display |
| `oswald-600.woff2` | Oswald 600 — display |
| `ptserif-400.woff2` | PT Serif 400 — accent |
| `ptserif-400-italic.woff2` | PT Serif 400 italic — accent |
| `jetbrainsmono-300.woff2` | JetBrains Mono 300 — body |
| `jetbrainsmono-400.woff2` | JetBrains Mono 400 — labels |

Each is subset to **latin + cyrillic + cyrillic-ext**, plus `U+20AE` (₮). The
cyrillic-ext range is not optional: **Ө Ү ө ү live in it**, and a cyrillic-only
subset tofus on Mongolian. `npm run fonts` verifies all four characters are present
with real outlines in every file and fails if any is missing.

### Rebuilding them

The pipeline needs Python with `fonttools` and `brotli`. It lives in a venv so it
never touches your system Python:

```bash
python -m venv tools/.venv
tools/.venv/Scripts/python -m pip install "fonttools[woff]" brotli   # Windows
# tools/.venv/bin/python -m pip install "fonttools[woff]" brotli     # macOS/Linux

npm run fonts
```

It downloads the upstream OFL sources from `google/fonts`, pins the variable axes
(Oswald and JetBrains Mono ship as variable fonts) to the exact weights above,
subsets, writes woff2, and prints a size table. Sources cache in `tools/fonts-src/`
and are gitignored — the built woff2 files in `public/fonts/` are what's committed.

To change which weights ship, edit `tools/fonts.config.json`, run `npm run fonts`,
and update `src/styles/fonts.css` to match.

## Cloudflare Pages

The site is static. `dist/` uploads as plain assets and `functions/` compiles into
the one Pages Function that serves `/api/*`.

**There is deliberately no `@astrojs/cloudflare` adapter.** That adapter exists to
run Astro on a Worker for SSR; this site has `output: 'static'` and CLAUDE.md
forbids a server runtime beyond the contact endpoint. Adding it would ship a
Worker to serve pages that are already files. Cloudflare Pages discovers
`functions/` on its own — no adapter is involved.

`public/_routes.json` narrows Function invocation to `/api/*`, so every static
request is served from the edge cache without waking a worker.

Deploy settings (wired up in Phase 11):

| Setting | Value |
|---|---|
| Build command | `npm run build` |
| Output directory | `dist` |
| Node version | pin to 20 or newer |

Secrets — the Supabase service key — are set in the Cloudflare dashboard under
**Settings → Environment variables**. They are never committed.

## Content

Every Mongolian string and every price lives in [`src/content/site.ts`](src/content/site.ts),
typed. Nothing Mongolian is hardcoded in a component: the team proofreads one file,
and a non-technical person can change a price without opening markup.

As of Phase 01 that file is shape-only — the types are final-ish, the values are empty.
