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
worker/          the Worker — the contact endpoint; everything else is static
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

The site runs on **Cloudflare Workers**. One Worker, `anir`, serves the built
site from `dist/` as static files and answers the contact form at
`/api/enquiry`. Cloudflare builds and deploys it from GitHub by itself.

### Redeploying (the normal case)

1. Make your change on a branch and open a pull request.
2. Cloudflare builds the branch and gives it a **preview URL** — it appears on
   the pull request. Open it on a phone and a laptop and check what you changed.
3. Merge the pull request into `main`. Cloudflare builds `main` and it is live
   about a minute later. Nobody deploys by hand.

If a build fails, nothing goes live — the last good version keeps serving. The
build runs `npm run budget`, so a page over its weight budget fails on purpose.
To see why: Workers & Pages → **anir** → Deployments → the failed build → read
the last lines of the log. Fix it on the branch and push again.

Run the same check on your own computer before pushing: `npm run budget`.

### Checking a deploy

```bash
npm run test:headers -- https://<the preview or live URL>
```

Checks that every page **and the contact endpoint** carry the security headers,
and that the caching rules landed. Run it on the preview before merging anything
that touches `scripts/headers.mjs` or `worker/`.

### Rolling back

Workers & Pages → **anir** → Deployments → the last good version → **Rollback**.
Then fix the problem on `main`; a rollback does not change the code.

### Deploying by hand (only if the automatic build is broken)

```bash
npx wrangler login     # once per computer — opens a browser to sign in
npm run deploy         # runs the budget, then uploads
```

### When an enquiry arrives

Every enquiry sends a notification (Telegram now, email too once the domain exists — see setup step 7)
that starts with one of two lines:

- **"Stored in Supabase."** — the normal case. It is in the `enquiries` table.
- **"BUFFERED in Cloudflare KV"** — Supabase did not take it, almost always
  because the free-plan project has **paused** after a week without activity.
  The enquiry is safe: it waits in KV for up to 30 days, and the visitor was
  told it arrived. Supabase dashboard → project **Anir** → **Restore**. Within
  15 minutes of the restore, the drain moves every waiting enquiry into the
  table, with its original arrival time.

The form only shows its error message if Supabase **and** KV both failed. Then
look at Workers & Pages → **anir** → Logs: every enquiry, buffer and drain run
writes a line there.

### First-time setup (done once; kept as the record)

**1. The Worker** is defined in `wrangler.jsonc`. The first `npm run deploy`
created it at `https://anir.<account>.workers.dev`.

**2. The secret.** `npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY`, value
from Supabase → Project Settings → API keys → `service_role`. Never commit it.
`SUPABASE_URL` is public and lives in `wrangler.jsonc`.

**3. Rate limiting** is a KV namespace bound as `RATE_LIMIT` in `wrangler.jsonc`.
Without the binding the limiter **fails open**: the form still works but nothing
throttles it, and nothing tells you. 5 submissions per IP per hour; IPs are
hashed before they are stored.

**4. Builds from GitHub.** Workers & Pages → **anir** → Settings → Build →
Connect → GitHub → `AnirAgency/Anir`.

| Setting | Value |
|---|---|
| Production branch | `main` |
| Build command | `npm run budget` |
| Deploy command | `npx wrangler deploy` |
| Builds for non-production branches | on (`npx wrangler versions upload`) |
| Build variable | `NODE_VERSION` = `22` |

**5. The database** — `supabase/migrations/0001_enquiries.sql`, applied 31 August
2026. RLS on, no policies, all grants revoked from `anon` and `authenticated`:
an anonymous client can neither read nor write the table.

**6. The domain.** `aniragency.mn` is **not registered yet**. Cloudflare does not
sell `.mn`, so: register it with a Mongolian registrar; add `aniragency.mn` as a
site in Cloudflare; at the registrar, change the nameservers to the two
Cloudflare gives you; then Workers & Pages → **anir** → Settings → Domains &
Routes → add `aniragency.mn`. For `www`, add a proxied `www` DNS record and a
Redirect Rule (the zone → Rules → Redirect Rules) sending it to
`https://aniragency.mn` with a 301 — a zone rule, because static files are
served before any Worker code runs. Wait until the certificate shows **Active**
before announcing the address.

**7. Notifications — Telegram now, email once the domain exists.** Telegram is
where the team already talks, a bot is free and takes minutes, and it needs no
domain.

1. In Telegram, message **@BotFather** → `/newbot` → give it a name. Keep the
   token it replies with; it is a secret.
2. Add the bot to the team's group, then send `/start` in the group (bots only
   see commands until you change their privacy setting).
3. Open `https://api.telegram.org/bot<token>/getUpdates` in a browser and find
   `"chat":{"id":-100…}` — the group's id, minus sign included.
4. In the project folder: `npx wrangler secret put TELEGRAM_BOT_TOKEN`, then
   `npx wrangler secret put TELEGRAM_CHAT_ID`.
5. Send one enquiry through the live form. The group should get it within
   seconds, starting "Stored in Supabase."

**Email, later.** The Worker already sends email through Resend when
`RESEND_API_KEY` and `NOTIFY_EMAIL` are set — leave them unset until
`aniragency.mn` is registered and verified in Resend with SPF, DKIM and DMARC
records, then set `NOTIFY_FROM` to an address on the domain. Mail from an
unauthenticated sender is how a new domain starts life in spam folders. Once
it works, keep both: one channel is a single point of failure.

Until a channel is set, every enquiry logs "no channel configured" — and nobody
hears about it.

### Headers

`dist/_headers` is **generated on every build** by `scripts/headers.mjs` — never
edit it by hand. It carries the security headers, with a Content-Security-Policy
holding a SHA-256 hash for every inline script Astro emitted, and the cache
rules: a year, immutable, for `/_astro/` and `/fonts/`; a week for `/media/`;
HTML keeps Cloudflare's default (`max-age=0, must-revalidate`).

Two things about `_headers` on Workers that are easy to get wrong:

- **It is not applied to responses the Worker makes.** `/api/enquiry` is Worker
  code, so it would ship with no security headers at all. The generator writes
  the same list to `worker/security-headers.generated.json` and the Worker
  attaches it to its own replies; `npm run test:headers` proves they match.
- **Every matching rule applies, and a header set twice is joined with a comma.**
  That is why the catch-all rule sets no `Cache-Control`.

To see exactly what production will serve, locally:

```bash
npm run dev:worker                    # builds, then runs the Worker on :8787
npm run test:headers -- http://localhost:8787
```

## Cloudflare Workers

The site is static. `dist/` uploads as Workers Static Assets: a request that
matches a file is served without the Worker ever running. Only `POST
/api/enquiry` reaches `worker/index.ts`, which passes it to the handler in
`worker/enquiry.ts`; anything else unmatched gets a 404.

**There is deliberately no `@astrojs/cloudflare` adapter.** That adapter exists to
run Astro on a Worker for server rendering; this site has `output: 'static'`
and CLAUDE.md forbids a server runtime beyond the contact endpoint. The Worker
is a dozen lines in front of plain files.

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
- **`worker/enquiry.ts`** — validates, rate-limits by IP, inserts one
  row into Supabase over the REST endpoint. Answers JSON to `fetch` and a small
  HTML page to a plain browser post. If Supabase will not take the row, it
  buffers the enquiry in KV (`ENQUIRY_BUFFER`) and still answers success; a
  cron every 15 minutes drains the buffer. Every enquiry notifies the team.
- **`supabase/migrations/0001_enquiries.sql`** — the table, with RLS on and
  deliberately **no policies**.
- **`scripts/test-enquiry.ts`** — `node scripts/test-enquiry.ts` exercises the
  real handler with a stubbed Supabase and KV. No Wrangler needed.

The chip groups are native radio inputs. That is deliberate — a radio group
gives arrow-key navigation, roving focus and an accessible name from its
`<legend>` for free, and rebuilding that with buttons would be worse.

### Setting it up

**1. Apply the migration.** Paste `supabase/migrations/0001_enquiries.sql` into
the project's SQL editor, or `supabase db push`. RLS is enabled with no
policies, so `anon` and `authenticated` can do nothing; the Worker writes with
the service_role key, which bypasses RLS. Do not add a policy to this table —
any policy is a way to read other people's contact details.

**2. Set the service key** as a Worker secret — `npx wrangler secret put
SUPABASE_SERVICE_ROLE_KEY` — and in `.dev.vars` for local work (see
`.dev.vars.example`). `SUPABASE_URL` is in `wrangler.jsonc`:

| Variable | Value |
|---|---|
| `SUPABASE_URL` | `https://<project-ref>.supabase.co` (`wrangler.jsonc`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Project Settings → API keys → `service_role` (secret) |

The service_role key must **never** reach the browser. It is read only inside
the Worker, which runs on the edge.

**3. Bind the KV namespace for rate limiting — not optional.** It is bound as
`RATE_LIMIT` in `wrangler.jsonc`. Without it the limiter is skipped: it **fails
open** on purpose, because losing a real client's message is worse than letting
an extra submission through — which also means a missing binding is silent.
The limit is 5 per IP per hour, and IPs are SHA-256 hashed before they touch
storage.

### Notifications and the buffer

Both are live in `worker/enquiry.ts` — see Deploy runbook → "When an enquiry
arrives" and first-time setup step 7. Once `aniragency.mn` exists, verify it in
Resend (a DKIM and an SPF record) and set `NOTIFY_FROM`, so mail comes from the
studio's own address and is not filed as spam.

## Content

Every Mongolian string and every price lives in [`src/content/site.ts`](src/content/site.ts),
typed. Nothing Mongolian is hardcoded in a component: the team proofreads one file,
and a non-technical person can change a price without opening markup.

As of Phase 01 that file is shape-only — the types are final-ish, the values are empty.
