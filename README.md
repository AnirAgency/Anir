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
| `npm run build` | Pulls the admin's content from Supabase, then a static build into `dist/` |
| `npm run preview` | Serves the built `dist/` locally |
| `npm run budget` | Builds, then enforces the weight budget, the contrast table, the video budget and no placeholder in the output. **Exits non-zero if a page is over, a pair fails, a committed video is over its cap, or a production build names a placeholder.** |
| `npm run ci` | What Workers Builds runs: `npm run budget`, reporting its start and its end to the admin (`scripts/build-report.mjs`). The report can never change the build's exit code. |
| `npm run copy:export` | Writes `mongolian-copy.md`: every Mongolian string the site and the admin show, in order, with where it appears. `-- --visitor`: only what visitors read, the launch-blocking subset; `-- --admin`: only the admin's words |
| `npm run labels` | Lists any field the admin would show without Mongolian words (the build runs the same check) |
| `npm run contrast` | Measures the CLAUDE.md contrast table under the film grain, from `tokens.css` and the shipped tile |
| `npm run grain` | Remakes the film grain tile, `src/assets/grain.webp`, matched to the owner's references — run `npm run contrast` after |
| `npm run fonts` | Rebuilds the subset woff2 files in `public/fonts/` |
| `npm run shot` | Screenshots and measures a page — see [Screenshots](#screenshots) |
| `npm run test:publish` · `test:builds` · `test:inbox` | Exercise the admin's Worker routes against stubs — see [The admin](#the-admin) |

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
build runs `npm run budget`, so a page over its weight budget, or a text colour
that no longer clears its contrast bar, fails on purpose. To see why: Workers &
Pages → **anir** → Deployments → the failed build → read the last lines of the
log. Fix it on the branch and push again.

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

Every enquiry **with nothing to check** sends a notification at once (Telegram now,
email too once the domain exists — see setup step 7). A **flagged** one — stored
like any other, under the inbox's «Шалгах» — does not: Telegram is the only channel
until the domain exists, and a channel full of bot submissions is how a real enquiry
gets missed. Instead the Worker's 15-minute schedule (`worker/watch.ts`) sends:

- **«Шалгах: N шинэ»** — at most one message an hour, nothing else: how many flagged
  enquiries arrived since the last one.
- **«Өнөөдөр N хүсэлт хадгалагдлаа…»** — once, the day (Ulaanbaatar's) the stored
  enquiries pass 50, buffered ones counted. The rate limiter is the only bound on the
  table and it fails open, so a flood is made visible rather than stopped.
- If the limiter ever fails open — KV unreachable, or unbound — the Worker logs
  `ALERT limiter-open`, records it in `worker_alerts`, and the admin shows it on its
  status line for a day. The limiter is never made to fail closed: a dropped
  enquiry is worse than an unbounded table.
- **An enquiry stuck in the buffer** over an hour — the drain has failed on it every
  pass: a paused project, a revoked grant, a schema behind the Worker — raises a
  `drain-stuck` alert on every pass while it lasts, its detail carrying Supabase's
  own reason (`PGRST204: Could not find the 'diagnostics' column…`), and sends one
  Telegram line, «N хүсэлт … түр санд хүлээж байна», again a day later if it lasts.
  This watch needs no database, so a paused project — when the admin cannot load —
  is still told. Once nothing waits, the alert is cleared. The kinds of alert are listed in the
  Worker (`ALERT_KINDS` in `worker/alerts.ts`), not in the table — migration 0007
  dropped its check, so a new kind is never refused — and the admin shows a kind it
  has no words for by its code rather than hiding it.

An immediate notification starts with one of two lines:

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
| Build command | `npm run budget` — becomes `npm run ci` (which runs it and reports to the admin) only at the last step of [the publishing order](#setting-it-up-once) |
| Deploy command | `npx wrangler deploy` |
| Builds for non-production branches | on |
| Preview command | `npx wrangler preview` (the default) |
| Build variable | `NODE_VERSION` = `22` |

Each pull request gets a **Preview** named after its branch; Cloudflare turns
`feat/x` into `feat-x` in the URL itself. A Preview takes only the bindings in
the `previews` block of `wrangler.jsonc` — without that block every preview
build fails. A preview has no database and its own KV, so an enquiry sent from
one is answered as received but never reaches the `enquiries` table and
notifies nobody.

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

Then every run ends on the **video budget**: every video and poster in
`public/media/` — what it just encoded, and anything copied in by hand, such as
the showreel's MP4 — held to its cap, and a **FAIL** that exits non-zero, the way
`npm run budget` fails:

| File | Cap |
|---|---|
| a clip this pipeline encodes (`media.config.json`) | 400 kB (`failOverKB`) |
| any other video (`.mp4`, `.webm`) | 1.2 MB — the same `VIDEO_MAX` `npm run budget` holds a page to (`scripts/limits.mjs`) |
| a poster | 40 kB |
| a placeholder video or poster (`placeholder/`) | 3 MB — looser, never exempt: every preview serves them |

`npm run media -- --check` runs the budget alone — no ffmpeg, no sources — and
`npm run budget` runs it on every build, so an oversized video fails the build that
would ship it. Video is committed, so an oversized export is permanent in git and
downloaded by every visitor — run the check before committing one.

And `scripts/no-placeholders.mjs`, last in `npm run budget`, fails a production build
whose output — any page, script, style or data file — names a placeholder file, or
holds `media/placeholder/` at all. "Production never ships placeholders" is checked
on every build, not assumed.

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
- **`worker/enquiry.ts`** — checks, rate-limits by IP, inserts one
  row into Supabase over the REST endpoint. Answers JSON to `fetch` and a small
  HTML page to a plain browser post. If Supabase will not take the row, it
  buffers the enquiry in KV (`ENQUIRY_BUFFER`) and still answers success; a
  cron every 15 minutes drains the buffer. Every enquiry notifies the team.
- **No visitor input causes an enquiry not to be stored.** A chip the published
  form does not have, a contact that is neither an email nor a phone number, an
  empty name — each is stored as sent and named in the row's `unrecognised`, and
  the inbox and the notification say what to check. The text is made storable
  first (no NUL, no broken character) and cut to what its column holds
  ([`src/lib/enquiry-limits.ts`](src/lib/enquiry-limits.ts): name 100, contact
  120, message 2000, User-Agent 1000 characters, counted as Postgres counts them),
  so the table can never refuse what the Worker sends. A cut is never silent. A cut
  name, contact, message or chip is flagged `cut:<field>:<characters it came with>`
  — the form's own maxlength keeps a browser inside those, so a cut means the
  enquiry did not come from the form. A cut User-Agent is **not** a flag: it is a
  header, its length says nothing about whether a visitor is real (the Facebook and
  Instagram in-app browsers, where much of the traffic opens, append a block of
  their own — 165 characters in all for Facebook on Android, captured from a real
  phone and kept as a test fixture; longer on iOS), so it is only noted in `diagnostics` (migration
  0008) — never «Шалгах», never a held-back notification. 1000 leaves every real
  browser room. Even a body that cannot be read is stored, its raw text in the
  message. Answers to questions added in the admin go in `answers`. Only the
  honeypot and the rate limit keep one out — and the health check, known by its
  credential (`HEALTH_CHECK_SECRET`), never by its shape.
- **The rate limit is the only bound on the table now.** It stands in front of
  everything that is stored, flagged or not, 5 per IP an hour; it fails open if KV
  is unbound, and it is per IP, so a bot spread across many addresses is held back
  only by the honeypot. What gets through lands flagged in the inbox's **Шалгах**,
  not in **Шинэ**, so the badge keeps counting people.
- **`supabase/migrations/0001_enquiries.sql`** — the table, with RLS on and
  deliberately **no policies**; **`0005`** drops its checks on chip values and
  minimum lengths, so the table never refuses an enquiry the Worker keeps.
- **`scripts/test-enquiry.ts`** — `node scripts/test-enquiry.ts` exercises the
  real handler with a stubbed Supabase and KV. No Wrangler needed. It holds the
  invariant with 400 seeded hostile submissions — JSON and form, Supabase up and
  down — against a stub that refuses what the real table would.

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
typed, as its seed — and the team edits it in [the admin](#the-admin), which is laid
over the seed at build time. Nothing Mongolian is hardcoded in a component.

## The admin

`https://aniragency.mn/admin/` — sign in, edit any section or product, **Хадгалах**
(save), then **Нийтлэх** (publish). The site rebuilds in two to three minutes. Saving
alone changes nothing on the site; publishing is what ships it.

What an editor gets:

- **The tree**, in the order a visitor meets things: **Хүсэлтүүд** (the enquiries,
  with the number of new ones) first; the home page's sections in page order, each
  list's length beside it, Pricing and Team dimmed as switched off; the products;
  then what is on every page.
- **A line of help under every field** — where it shows on the site, and, where
  length matters, what happens past a measured length. Past it, a counter says so;
  nothing blocks typing.
- **Rows that name themselves** — a process step by its title and column, not `№5`.
  ↑ ↓ ✕ at the row's right edge; ✕ asks once.
- **Nothing typed is lost**: every change is kept in the browser until it is saved,
  and offered back after a closed tab. A dot in the tree marks unsaved edits.
- **The page beside the form**: focusing a field lights it up on the page, and
  clicking anything on the page opens its field.
- **Publish says what happened**: started, building, done — or failed, why, and what
  to do. No status codes.
- **Uploads say their limits before the picker**, and warn — never silently — when a
  picture is too small for its slot or large for Storage (1 GB on the Free plan).
  Over 15 MB is refused before it is sent.
- `Ctrl+S` saves; `Esc` closes the open row.

How it fits together (CLAUDE.md > The admin has the rules):

| Piece | What it does |
|---|---|
| [`src/scripts/admin.ts`](src/scripts/admin.ts) | The admin app. Talks to Supabase directly with the publishable key and the editor's session. |
| [`src/scripts/admin-schema.ts`](src/scripts/admin-schema.ts) | What the admin shows: the tree, hidden values, row titles, measured lengths — and `checkAdmin`, which stops the build if any field would show without Mongolian words. |
| [`src/content/admin.ts`](src/content/admin.ts) | Every word the admin says: labels, the help under each field, messages. |
| [`supabase/migrations/0002_content.sql`](supabase/migrations/0002_content.sql) | `site_content`, `products`, `editors`, the `media` bucket, and the policies that let only editors write. |
| [`supabase/migrations/0004_enquiry_status.sql`](supabase/migrations/0004_enquiry_status.sql) | The enquiries' `status` for the inbox, and the storage figure. |
| [`worker/publish.ts`](worker/publish.ts) | `POST /api/publish`: checks the caller is an editor, then posts to the deploy hook. `GET /api/publish?build=…`: how that build is going, and why it failed. |
| [`worker/inbox.ts`](worker/inbox.ts) | `GET /api/enquiries`, `POST /api/enquiries/<id>`, `GET /api/storage` — editors only; the only code that reads enquiries, with the service key. No delete. |
| [`scripts/content-pull.mjs`](scripts/content-pull.mjs) | First step of every build: content into `src/content/live.json`, uploads encoded into `public/media/live/`. |
| [`src/content/live.ts`](src/content/live.ts) | Lays the content over `site.ts`; a value of the wrong kind stops the build. |
| [`src/lib/supabase.json`](src/lib/supabase.json) | The project URL and **publishable** key — public by design; row level security guards writes. |
| [`worker/tasks.ts`](worker/tasks.ts) | The task list: `/api/tasks` (list, `counts`, `report`, create, edit, `move`) — editors only, service key, every write conditional on the `updated_at` it read. |
| [`supabase/migrations/0010_tasks.sql`](supabase/migrations/0010_tasks.sql), [`0011_task_events_and_names.sql`](supabase/migrations/0011_task_events_and_names.sql) | `tasks`; then `task_events` (every move, by trigger) and `editors.display_name`. RLS on, no policies. |
| [`src/scripts/admin-tasks.ts`](src/scripts/admin-tasks.ts) | «Ажил» in the admin: «Даалгавар» (opens on «Минийх») and the read-only «Тайлан». |
| [`src/lib/task-codes.ts`](src/lib/task-codes.ts) | The states, projects and moves both of them obey. |

### The task list («Ажил»)

Four people assigning, submitting and approving work — not a project tool.
Deliberately not in it: attachments, comments, recurring tasks, time tracking,
sub-tasks, custom fields, labels, per-person permissions. Everyone signed in
sees everything.

- **A task says what done means.** `done_means` is required and may not be the
  title again (the table, the Worker and the form all refuse it): approval is
  checked against it.
- **Who does what.** Anyone may start or submit a task — someone finishing a
  colleague's is normal. Only the named approver approves or sends back, and a
  send-back needs a reason. The approver defaults to whoever created the task.
  An approval made by mistake is undone by the approver with «Дахин нээх»: back
  to doing, with a reason, recorded like any other move.
- **History, not a last word.** Every change of state is a row in `task_events`
  (migration 0011), written by a trigger in the same transaction as the change —
  who, when, from what, to what, and why for a send-back or a reopening. The
  task row only says where it is now.
- **People by name.** `editors.display_name`, set by the owner in the SQL editor
  (`update public.editors set display_name = 'Анна' where email = '…';`), is
  what Telegram, the rows and the «Тайлан» show; empty, the email. Someone no
  longer an editor reads «Хасагдсан хэрэглэгч», never an id.
- **«Даалгавар»** opens on «Минийх» — assigned to me and not done, or waiting on
  my approval — with «Бүгд» and filters (who, project, state, overdue) a click
  away. Its badge has two numbers: mine to do, and ✓ waiting on my approval.
  An overdue task says so on its row in words, not colour alone.
- **«Тайлан»**: one person, one week (this one by default) — each submission,
  each send-back with its reason, each approval, each reopening, and what is
  overdue now. It reads `task_events`, so a task sent back twice and then
  approved is six lines — three submissions, two send-backs with their
  reasons, one approval — not one tidy approval. Read only; no charts or export.
- **Telegram**, to a group of its own — never the enquiries group: assigned to
  you; submitted for your approval; sent back, with the reason. Nothing else —
  starting, approving and reopening send nothing.
  Set it up: make a second group, add the bot, send `/start@anir_enquiries_bot`
  in it, read the group's id (it is negative), and `npx wrangler secret put
  TELEGRAM_TASKS_CHAT_ID`. Unset, the messages are skipped and nothing else
  changes.
- **Walled off.** `worker/index.ts` loads the task code only for `/api/tasks*`,
  inside its own try/catch; no public page imports it. `npm run test:isolation`
  proves the site, the enquiry form and the inbox carry on when it fails. If the
  task list ever grows beyond this, it moves to its own Worker.
- Tests: `npm run test:tasks` (the routes), `npm run test:isolation`,
  `npm run build && npm run test:tasks-browser` (the admin in Chrome or Edge).

### Setting it up (once)

1. **The tables.** Paste [`supabase/migrations/0002_content.sql`](supabase/migrations/0002_content.sql)
   into the project's SQL editor and run it (or `supabase db push`). Until then the
   build says *the admin tables are not set up yet* and the site is `site.ts` as written.
2. **No sign-ups.** Authentication → Sign In / Providers → turn **Allow new users to sign
   up** off. Accounts are made by the owner, not by visitors.
3. **The team's accounts.** Authentication → Users → **Add user** → *Create new user*, with
   each person's email and a password, *Auto Confirm User* on. Then, in the SQL editor:

   ```sql
   insert into public.editors (user_id, email)
   select id, email from auth.users where email in ('one@example.com', 'two@example.com');
   ```

   Someone signed in but not in `editors` can read and do nothing else. To take access
   away: `delete from public.editors where email = '…';`

   **Passwords, before the accounts:** Authentication → Providers → Email → minimum
   length **12**, and require **all four character classes** (lowercase, uppercase,
   digits, symbols). Supabase checks a password only when it is set, so an account
   made before this keeps its old password until it is changed — change any that
   would not pass.

   **The security advisor, read once and accepted.** Four findings stay, on purpose:
   - *RLS enabled, no policy* on `enquiries`, `build_status` and `worker_alerts` —
     the design: only the Worker, with service_role, reads or writes them. Adding a
     policy to clear it would expose them. (See each migration's lockdown note.)
   - *Signed-in users can execute `is_editor()`* — they must: every save's row level
     security calls it. Anon cannot (0003).
   - *Leaked password protection disabled* — **accepted: Pro plan only.** This
     project is on Free, where the setting does not exist. The password rules above
     are what Free offers, and they are set.
4. **Publishing, in this order — each step needs the one before it.**

   1. **The migrations.** Paste [`0004_enquiry_status.sql`](supabase/migrations/0004_enquiry_status.sql),
      [`0005_keep_every_enquiry_and_build_status.sql`](supabase/migrations/0005_keep_every_enquiry_and_build_status.sql)
      and [`0006_worker_alerts.sql`](supabase/migrations/0006_worker_alerts.sql), in that
      order, into the SQL editor and run them. 0004 gives enquiries a status (the
      inbox); 0005 drops the checks that refused an enquiry, adds its flags, and makes
      the one-row `build_status` table; 0006 makes `worker_alerts`, where the Worker
      records the rate limiter failing open. Then
      [`0007_any_alert_kind.sql`](supabase/migrations/0007_any_alert_kind.sql), which
      lets `worker_alerts` take any kind the Worker raises, and
      [`0008_user_agent_room_and_diagnostics.sql`](supabase/migrations/0008_user_agent_room_and_diagnostics.sql),
      which gives the User-Agent 1000 characters and adds `diagnostics`, the notes
      that route nothing. None adds a policy to `enquiries`, and none should ever be
      added. The Worker that the merge deploys needs all five. (On the live project
      all five were applied on 7 November.) Then
      [`0009_applied_migrations.sql`](supabase/migrations/0009_applied_migrations.sql),
      a service-role-only function that reads Supabase's own migration history, so
      the test suite can check it.

      **A migration pasted into the SQL editor is not recorded** in
      `supabase_migrations.schema_migrations` — so whoever rebuilds from that history
      gets a schema without it. Record it straight after it runs:
      `npm run migration:record -- 0009` prints the SQL to paste (same convention as
      the rows the connector writes; `--at <ISO time>` for one that ran earlier). `npm
      run test:enquiry`, with the service role key in `.dev.vars`, fails naming every
      file with no history row, and every row with no file. **This check is manual,
      never automated:** it needs the service role key, and no build has that key or
      ever should. Without the key the suite does not fail — it prints a boxed
      `SKIPPED — NOT CHECKED` and counts the check apart from the passes — so a green
      run without the key says nothing about the history. Note that the Supabase
      CLI keys migrations on the file name's leading digits, which here are `0001`…,
      not the history's timestamps — so `supabase db push` cannot be used on this
      folder as it stands; the parity check matches by name.
   2. **The build secret.** Make one random secret —
      `node -e "console.log(crypto.randomBytes(32).toString('hex'))"` — and add it as a
      build secret: Workers & Pages → anir → Settings → Build → Variables and secrets →
      `BUILD_REPORT_SECRET`, type *Secret*. Keep the value at hand for step 4, never in
      a file or a chat. Nothing reads it yet.
   3. **The merge**, with the build command **unchanged** — it is `npm run budget`
      today; leave it. **Before it, by hand: the migration parity check** — the
      service role key in `.dev.vars`, `npm run test:enquiry`, and no
      `SKIPPED — NOT CHECKED` box at the end. The Worker the merge deploys expects
      every migration in the folder; this is the one check that the live project has
      them, and nothing runs it for you. This deploys `POST /api/builds`. Switching to `npm run ci` before
      this would make the first report post to a route that does not exist yet, and
      the admin would show a fifteen-minute silence on a build that worked.
   4. **The Worker secret**, the identical value: `npx wrangler secret put
      BUILD_REPORT_SECRET`. After the merge, so `secret put` finds the live version the
      newest one (it refuses otherwise).
   5. **The publish button.** Workers & Pages → anir → Settings → Builds → **Deploy
      Hooks** → the hook for `main`. Copy its URL — it is a credential: whoever has it
      can start builds — and set it as a Worker secret, never in a file:
      `npx wrangler secret put DEPLOY_HOOK_URL`. If the URL ever leaks, delete the hook
      and make a new one.
   6. **The health check's secret — required, not optional:** `npx wrangler secret put
      HEALTH_CHECK_SECRET`, any long random string. Since every POST without it is
      stored as an enquiry, a health check run against a Worker that does not hold it
      would leave a junk enquiry behind every time — the bug the secret exists to fix.
      `scripts/test-headers.mjs` asks `GET /api/health` first (it stores nothing) and
      posts only when this Worker holds the same secret, but **do not point the health
      check at production until this step is done.** `GET /api/health` says "alive" to
      the secret's holder and nothing else; anyone else — a wrong secret, none, or a
      Worker with none set — gets the same 401, so it never tells a stranger whether
      the secret is set. The admin's routes and the build's report likewise check who
      is asking before saying whether anything is set up.
   7. **Only then, the build command**: `npm run budget` → `npm run ci`. Do it straight
      after step 6: a publish in between would start a build that does not report, and
      show the fifteen-minute silence.

   The report's secret can write the one status row and nothing else: at worst, a
   leaked one makes the admin say a build failed when it did not. No Cloudflare API
   token is involved. Until aniragency.mn is the address, the report goes to
   `anir.b-batuka0627.workers.dev`; after, set the build variable `BUILD_REPORT_URL` to
   `https://aniragency.mn/api/builds`.
5. **Running the health check**: `HEALTH_CHECK_SECRET=… npm run test:headers --
   https://…`, with the value from step 4.6. It is how the Worker knows a health
   check — by a credential, never by its body: every POST without it is an enquiry and
   is stored. Without the secret in the shell the check skips its POST; with one the
   Worker does not hold, it asks first and skips too.

### When a publish does not show up

The admin follows the build and says *Нийтэллээ* when it is done, or why it failed. If
it says the build never reported (fifteen minutes with nothing), the build died before
it could, or the report did not arrive: Workers & Pages → anir → Deployments → the
newest build's log names the reason — a page over the weight budget, or
`content: … is number in the database, string in site.ts` for a value of the wrong
kind.

### Saving over someone else

Every save sends back the `updated_at` the admin read, and writes only if the row
still has it. If someone else saved that part in between, nothing is overwritten:
the admin says «Өөр хүн энэ хэсгийг хадгалсан байна…», reads the table afresh, and
keeps the editor's typing in the browser — **Дахин нээх** opens the part as the
other editor saved it, with this editor's changes laid back over it.

### Testing it

`npm run test:publish` exercises the publish endpoint: an editor publishes; no token, a
dead token and a non-editor are refused; a failing Supabase or hook is reported; a
build is followed from queued to done or failed, from its own report — and no
Cloudflare API is ever called.

`npm run test:builds` exercises the report: only its secret is accepted; only the
production branch is kept; it writes one row; a failure's cause is read from its
lines; a late "started" never undoes how a build ended; and the reporter stays quiet,
and exits 0, anywhere but a production build.

`npm run test:watch` exercises the schedule's watches: the flagged digest at most hourly,
exactly «Шалгах: N шинэ»; the flood message once per Ulaanbaatar day past 50, buffered
enquiries counted; one watch failing never stops the other.

`npm run test:inbox` exercises the inbox: only editors get anything; enquiries are read
and changed with the service key only; a status change records who and when; and no
route — through the Worker's own router — deletes one.

`npm run labels` lists any field the admin would show without Mongolian words. The
build runs the same check, and stops naming every one missing.

`npm run copy:export` writes `mongolian-copy.md` — not committed; run it when a
proofread is due — every Mongolian string, the site's as saved now, in the admin's
tree order with where each appears, then the admin's own words with their keys.
`-- --visitor` writes only what visitors read (`mongolian-copy-visitor.md`): the
home page, the products and product pages, the contact form, the menu, Google and
the screen readers' words — the subset that blocks a launch. `-- --admin` writes
only the admin's words (`mongolian-copy-admin.md`).
