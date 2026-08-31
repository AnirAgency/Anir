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

## Deploy runbook

### Redeploying (the normal case)

Push to `main`. Cloudflare Pages builds and deploys it. That is the whole loop.

Before pushing, run `npm run budget` — it builds and fails if the page is over
1 MB or 200 kB of JS. A red build is cheaper than a slow site.

### First-time setup

Steps 1–4 need the Cloudflare dashboard and cannot be scripted from this repo.

**1. Create the Pages project.** Workers & Pages → Create → Pages → connect to
GitHub → `AnirAgency/Anir`.

| Setting | Value |
|---|---|
| Production branch | `main` |
| Build command | `npm run build` |
| Output directory | `dist` |
| Node version | `22` (`.nvmrc` pins it; set `NODE_VERSION=22` too if the build image ignores it) |

**2. Environment variables** — Settings → Environment variables → Production:

| Variable | Where it comes from |
|---|---|
| `SUPABASE_URL` | `https://tyrzajpotvtirfjmacfm.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → `service_role` |

Never commit these. The service_role key bypasses row level security; it is read
only inside the Pages Function, which runs on the edge.

**3. Apply the database migration.** Paste
`supabase/migrations/0001_enquiries.sql` into the Supabase SQL editor. Until this
runs, the form returns its Mongolian error message and stores nothing.

**4. Bind KV for rate limiting.** Create a KV namespace (`anir-rate-limit`) and
bind it as **`RATE_LIMIT`** under Settings → Functions → KV namespace bindings.
Without it the limiter **fails open** — the form still works, it just does not
throttle. 5 requests per IP per hour; IPs are SHA-256 hashed before storage.

**5. Custom domain.** `aniragency.mn` is registered through Datacom. Point its
nameservers at Cloudflare, then Pages → Custom domains → add `aniragency.mn` and
`www.aniragency.mn`. Cloudflare issues the certificate automatically; wait for
"Active" before announcing the URL. Add a redirect rule sending `www` → apex.

### Headers

`dist/_headers` is **generated on every build** by `scripts/headers.mjs` — never
edit it by hand, it is overwritten. It sets long-cache immutable rules for
`/_astro/` and `/fonts/`, a week for `/media/`, no cache for HTML or `/api/`,
and a Content-Security-Policy carrying a SHA-256 hash for every inline script
Astro emitted. Hand-maintained hashes rot after the first build that changes a
script; generated ones cannot.

To check a policy change before it reaches production:

```bash
npm run build
node scripts/serve-dist.mjs           # serves dist/ WITH the _headers applied
npm run shot -- http://localhost:4331/ --measure 1440 --console
```

`astro preview` ignores `_headers`, so it cannot catch a CSP that blocks your
own scripts. That command can — `--console` surfaces CSP violations, which are
otherwise silent.

### Rolling back

Cloudflare Pages keeps every deployment. Deployments → pick the last good one →
Rollback. Then fix forward on `main`; a rollback does not change the repo.

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

## Media pipeline

Camera originals go in `raw-media/` (gitignored). `npm run media` encodes them
into `public/media/`, which is what ships. Nothing hand-exported should ever be
dropped straight into `public/media/` — it will not be checked against the
weight budget.

```bash
npm run media                  # encode everything in scripts/media.config.json
npm run media -- --dry-run     # print the exact ffmpeg commands, run nothing
npm run media -- plate-01      # just one clip or still
npm run test:media             # check the pipeline's own logic, no ffmpeg needed
```

**ffmpeg is required** and is not bundled: `winget install Gyan.FFmpeg` on
Windows, `brew install ffmpeg` on macOS, `apt install ffmpeg` on Linux. The
script says so and stops if it is missing.

### What it does to a clip

Trim points come from `scripts/media.config.json`, one entry per clip. Each clip
is encoded **twice** — AV1 for browsers that take it, VP9 for everything else —
plus a poster frame. Audio is stripped outright and all metadata is dropped, so
no camera EXIF or GPS ever reaches the web.

```bash
# VP9, two passes. Pass one measures, pass two writes.
ffmpeg -y -ss 0 -to 4 -i raw-media/hero.mov -an -map_metadata -1 \
  -vf "scale=-2:'min(720,ih)':flags=lanczos,fps=24" \
  -c:v libvpx-vp9 -b:v 480k -row-mt 1 -passlogfile .hero-pass \
  -pass 1 -cpu-used 4 -f null -
ffmpeg -y -ss 0 -to 4 -i raw-media/hero.mov -an -map_metadata -1 \
  -vf "scale=-2:'min(720,ih)':flags=lanczos,fps=24" \
  -c:v libvpx-vp9 -b:v 480k -row-mt 1 -passlogfile .hero-pass \
  -pass 2 -cpu-used 2 public/media/hero.vp9.webm

# AV1, same trim and filter.
ffmpeg -y -ss 0 -to 4 -i raw-media/hero.mov -an -map_metadata -1 \
  -vf "scale=-2:'min(720,ih)':flags=lanczos,fps=24" \
  -c:v libsvtav1 -preset 6 -b:v 480k -f webm public/media/hero.av1.webm

# Poster from the in-point. -q:v is walked from 3 upward until it fits 40 kB.
ffmpeg -y -ss 0 -i raw-media/hero.mov -frames:v 1 -map_metadata -1 \
  -vf "scale=-2:'min(720,ih)':flags=lanczos" -q:v 3 public/media/hero.jpg
```

The bitrate is computed, not guessed: `targetKB * 8 / duration`. At the default
240 kB over a 4s clip that is 480 kbps. `scale=-2:'min(720,ih)'` caps height at
720 **without ever enlarging** a smaller source, and `-2` keeps width even,
which both codecs require.

### What it does to a still

```bash
ffmpeg -y -i raw-media/portrait-01.jpg -map_metadata -1 \
  -vf "scale=900:1200:force_original_aspect_ratio=increase:flags=lanczos,crop=900:1200" \
  -c:v libaom-av1 -still-picture 1 -crf 32 public/media/portrait-01.avif
# …and again with -c:v libwebp -quality 76, and with -q:v 4, for .webp and .jpg
```

Scale-to-cover then crop, so every portrait is the same shape with no
letterboxing and no squashing.

### Size limits

The script prints a source → encoded table and **exits non-zero** if any clip
lands over 400 kB or any poster over 40 kB. If that trips, shorten the clip or
lower `targetKB` — do not raise the cap.

### How components find the output

`site.ts` stores a **basename** (`plate-01`), never a path. At build time
`src/lib/media.ts` checks which encodes exist on disk and the component emits
only those, best format first:

```html
<video poster="/media/plate-01.jpg" width="1280" height="800" …>
  <source src="/media/plate-01.av1.webm" type='video/webm; codecs="av01.0.05M.08"'>
  <source src="/media/plate-01.vp9.webm" type='video/webm; codecs="vp9"'>
</video>
```

A browser takes the first source it understands, so AV1 precedes VP9 and AVIF
precedes WebP. Until a file exists the slot renders a labelled placeholder and
**no `<source>` is emitted at all**, so the page never requests an asset that
was never made. Every asset carries explicit `width`/`height`.

## The enquiry form

The contact form is the only part of this site with a server side. Everything
else is a static file.

- **`src/components/Contact.astro`** — the form. A real `<form method="post"
  action="/api/enquiry">`, so it submits with JavaScript switched off. The
  inline script is enhancement only: it swaps a page navigation for an inline
  status message.
- **`functions/api/enquiry.ts`** — validates, rate-limits by IP, inserts one
  row into Supabase over the REST endpoint. Answers JSON to `fetch` and a small
  HTML page to a plain browser post.
- **`supabase/migrations/0001_enquiries.sql`** — the table, with RLS on and
  deliberately **no policies**.
- **`scripts/test-enquiry.ts`** — `node scripts/test-enquiry.ts` exercises the
  real Function with a stubbed Supabase and KV. No Wrangler needed.

The chip groups are native radio inputs. That is deliberate — a radio group
gives arrow-key navigation, roving focus and an accessible name from its
`<legend>` for free, and rebuilding that with buttons would be worse.

### Setting it up

**1. Apply the migration.** Paste `supabase/migrations/0001_enquiries.sql` into
the project's SQL editor, or `supabase db push`. RLS is enabled with no
policies, so `anon` and `authenticated` can do nothing; the Function writes with
the service_role key, which bypasses RLS. Do not add a policy to this table —
any policy is a way to read other people's contact details.

**2. Set two environment variables** in Cloudflare Pages → Settings →
Environment variables (see `.env.example`):

| Variable | Value |
|---|---|
| `SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Project Settings → API → `service_role` |

The service_role key must **never** reach the browser. It is read only inside
the Function, which runs on the edge.

**3. Optional — bind a KV namespace for rate limiting.** Create a KV namespace
and bind it as `RATE_LIMIT`. Without it the limiter is skipped: it **fails
open** on purpose, because losing a real client's message is worse than letting
an extra submission through. The limit is 5 per IP per hour, and IPs are SHA-256
hashed before they touch storage.

### Adding email notification later

Nothing about the current code has to change to add it — insert the send between
a successful Supabase write and the reply:

- **Resend** is the least work: one `fetch` to `https://api.resend.com/emails`
  with a `RESEND_API_KEY`, no dependency, and `aniragency.mn` verified by DNS
  (a DKIM and an SPF record) so mail is not filed as spam. Roughly 20 lines.
- Send it **after** the row is stored and never let a failed send fail the
  request — the enquiry is already safe in the database, and a client should not
  see an error because our mail provider blinked.
- The alternative is a Supabase **database webhook** on insert, which keeps mail
  out of the request path entirely at the cost of a second moving part.

## Content

Every Mongolian string and every price lives in [`src/content/site.ts`](src/content/site.ts),
typed. Nothing Mongolian is hardcoded in a component: the team proofreads one file,
and a non-technical person can change a price without opening markup.

As of Phase 01 that file is shape-only — the types are final-ish, the values are empty.
