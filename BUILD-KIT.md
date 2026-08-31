# Anir site — build kit

Numbered phases. Run one at a time, in order, each in its own Claude Code
session with `CLAUDE.md` in the repo root. Every prompt ends by asking for a
report — read it before starting the next phase.

**Do not skip Phase 00.** Phases 03 onward assume the assets exist.

---

## Phase 00 — Gather this first (no prompt, just do it)

### Accounts

- [ ] **GitHub repo** — `anir-site`, private. Everyone gets access.
- [ ] **Cloudflare account** — free tier. Needed for Pages, and its Ulaanbaatar PoP is the whole reason we're not on Vercel.
- [ ] **Domain `aniragency.mn`** — `.mn` is administered by Datacom; register through them or a reseller, then point the nameservers at Cloudflare. Confirm the registrar's process yourself, don't assume.
- [ ] **Supabase project** — for contact-form submissions. You already run Supabase, so reuse the org.
- [ ] **Figma Education** — all four of you. Free Professional for two years. Do this before paying for seats.

### Figma housekeeping

- [ ] Move `Anir Agency — Website` **out of Drafts** into a team project. Drafts don't support multiple editors — this is why you can't add Bat-Enkh.
- [ ] Confirm who needs a **Full seat** (Bat-Enkh, Delgertsetseg) vs a **Dev seat** (Bayarbayasgalan) vs a free **View seat** (Bat-Erdene).

### Assets

- [ ] **Logo as SVG** — from whoever drew it. The version in Figma is a trace; good, but not exact.
- [ ] **Favicon** — 32×32 and 180×180 from the mark.
- [ ] **Hero loop** — 3–6s, seamless, silent.
- [ ] **Four discipline plates** — one per service. Shot in one session, one light source.
- [ ] **Four portraits** — same light, same crop, same background.
- [ ] **OG image** — 1200×630, for link previews.

Encode spec for every clip: 3–4s, locked-off camera, 720p max, 24fps,
AV1 or VP9 WebM, **150–300 KB each**, audio track stripped, poster JPG exported.

### Content

- [ ] **Mongolian copy proofread** by a native reader. The draft in the Figma file and the prototype is mine — your product taglines are verbatim, everything else needs a pass.
- [ ] Final email address (`hello@aniragency.mn`?) and whether you want a phone number listed.
- [ ] Decide: do you publish prices on the site? You gave me a full list and I built the section, but showing prices is a real strategic choice. It filters out tyre-kickers and reads as confident — it also lets competitors undercut you. Decide before Phase 04.

---

## Phase 01 — Scaffold

```
Read CLAUDE.md first.

Scaffold the Anir site:

- Astro, TypeScript, static output (`output: 'static'`), no UI framework integration.
- Cloudflare Pages adapter configured for static build with a `functions/` directory.
- Folder structure: src/components/, src/layouts/, src/styles/, src/content/, public/fonts/, public/media/
- Self-host the three fonts as woff2 in public/fonts/, subset to cyrillic + cyrillic-ext + latin:
  Oswald 500 & 600, PT Serif 400 & 400-italic, JetBrains Mono 300 & 400.
  Use @font-face with font-display: swap and a real fallback stack.
  Verify each subset actually contains Ө Ү ө ү before you finish.
- Install gsap and lenis. Nothing else.
- Add an npm script `budget` that builds, then sums the byte size of dist/index.html
  plus every asset it references, and fails with a non-zero exit if the total exceeds
  1 MB or if JS exceeds 200 KB. Print the breakdown by file type.
- Create src/content/site.ts exporting a typed, empty-but-shaped object for all site
  copy: nav, hero, disciplines[], pricing groups[], projects[], process[], team[], contact.
  Types only for now, no content.
- .gitignore, README with local dev instructions in English.

Do not build any page sections yet.

Report back: the folder tree, the exact font files and their byte sizes, confirmation
that Ө/Ү are present in each, and the output of `npm run budget` on the empty build.
```

---

## Phase 02 — Tokens and layout primitives

```
Read CLAUDE.md first.

Build the design foundation. No page content yet.

1. src/styles/tokens.css — the six colour custom properties and the full type scale
   from CLAUDE.md, exactly. Define a type-scale utility class per named style
   (.t-display-xl, .t-serif-italic, .t-mono-label, etc.). Use clamp() so the scale
   is fluid between 390px and 1440px, with the CLAUDE.md values as the 1440 anchors.

2. src/styles/base.css — reset, box-sizing, body background from --ink, focus-visible
   ring in --orange, and a prefers-reduced-motion block that kills all animation and
   transition globally.

3. src/components/Section.astro — the alternating light/dark section wrapper.
   Props: `tone` ('dark' | 'light'), `id`. Sets local CSS custom properties
   (--bg, --fg, --muted, --line, --plate) so children never reference the palette
   directly. Renders the blueprint corner ticks. Applies the 144px left inset.

4. src/components/Grid.astro — the hairline grid primitive. A container whose
   background is the hairline colour with a 1px gap, so children read as cells
   separated by rules. Props: `cols` (number or 'auto'), and it must collapse to
   one column under 860px.

5. src/components/Header.astro — fixed top bar, mix-blend-mode: difference so it
   reads on both light and dark sections. Wordmark left, five nav links right,
   the last one in --orange.

6. src/components/Rail.astro — the fixed 88px left rail: "УБ" tick at top, a 1px
   track with an --orange progress fill, and a vertical current-section label.
   Progress and label update on scroll with requestAnimationFrame throttling.
   Hidden below 860px.

Build a /styleguide page that renders every token, every type style with a
Ө Ү sample, and one of each primitive. This page is dev-only — exclude it from
the production build.

Report back: a screenshot of /styleguide at 1440 and at 390, and `npm run budget`.
```

---

   ## Phase 03 — Hero and marquee

   ```
   Read CLAUDE.md first. The Figma file page `01 · Desktop` is the reference.

   Build the hero and the marquee strip.

   Hero (dark, min-height 100svh, contents vertically centred):
   - The ANIR AGENCY logo as inline SVG, fill currentColor set to --orange, max-width
   min(78vw, 660px). Use public/media/logo.svg — if it isn't there yet, use a
   placeholder and tell me.
   - Serif tagline, centred, two lines: "Улаанбаатараас —" then the second line in italic.
   - Mono lede paragraph, centred, max 60ch, uppercase, --dim.
   - Three product cards in a hairline Grid: Ezmath, Ethos, Olymo. Each has an eyebrow,
   an Oswald name, a one-line Mongolian tagline, and a "Үзэх +" row. Hover fills the
   card with --plate and turns the text --orange.
   - A slot for the hero video loop behind the logo: <video> with poster, muted,
   playsinline, loop, preload="none". If public/media/hero.webm is absent, render
   the poster-less plate placeholder instead and do not break the build.

   Marquee (dark, thin): "ЖИЖИГ БАГ — БҮТЭН АНХААРАЛ —" repeating, Oswald 500, 45%
   opacity, the em-dashes in --orange. CSS animation, duplicated track for a seamless
   loop, paused under reduced-motion.

   All copy comes from src/content/site.ts. Nothing hardcoded in the component.

   Report back: screenshots at 1440 and 390, `npm run budget`, and confirmation the
   page still renders with JS disabled.
   ```

   ---

## Phase 04 — Disciplines and pricing

```
Read CLAUDE.md first.

Build two sections.

Үйлчилгээ (light) — four discipline blocks in a vertical hairline Grid.
Each block is a two-column split (0.9fr / 1.1fr, collapsing to one column under 860px):
- Left: a service code in --orange (ВЭБ / ДИЗАЙН / ЗУРАГ / АПП), a PT Serif title with
  one italic word, and a row of bordered tag chips.
- Right: a mono body paragraph, then a 16:10 media plate.
The plate is a <video> when public/media/plate-0N.webm exists, otherwise a labelled
placeholder showing the plate number and expected format. Same video attributes as Phase 03.

Note: these are four parallel disciplines, not a sequence — use the service codes as
markers, NOT 01/02/03/04 numbering. Numbering implies an order that doesn't exist.

Үнэ (dark) — the price list, in two groups.
- Group "Вэб ба систем": Аудит, Лендинг, Backend + Frontend, Сургалтын веб.
- Group "Дизайн ба контент": Постер, Instagram carousel, Зураг авалт, Reel видео.
Each row: name (Oswald), description (mono label, --dim), price right-aligned
(Oswald) with a small unit line beneath. Rows separated by hairlines, whole row
turns --orange on hover. Use font-variant-numeric: tabular-nums on prices.

All prices and copy from site.ts. Prices are data — a non-technical person must be
able to change one number in one file.

Report back: screenshots of both sections at 1440 and 390, and `npm run budget`.
```

---

## Phase 05 — Work, process, team

```
Read CLAUDE.md first.

Three sections.

Ажил (light) — three project rows in a hairline Grid. Each row is three columns
(58px index / 1fr body / 1.05fr spec), collapsing to one column under 860px:
- Index: 001, 002, 003 in mono.
- Body: project name (Oswald large), PT Serif italic tagline, mono description.
- Spec: a definition list — Үүрэг, Технологи, Он.
Projects: Ezmath, Ethos, Olymo. Row hover turns the index --orange and fills --plate.

Гурван үе шат (dark) — three equal steps in a horizontal hairline Grid.
Numbering IS legitimate here — it is a real sequence. Big --orange numeral,
PT Serif title, mono description. Steps: Хэлэлцэх / Хийх / Хүлээлгэн өгөх.

Баг (light) — four members in a horizontal hairline Grid. Each: a 3:4 portrait
plate, then name (Oswald) and role (mono label). Members:
Бат-Эрдэнэ (Гүйцэтгэх захирал · Хөгжүүлэгч), Бат-Энх (UI/UX дизайнер),
Баярбаясгалан (Ахлах хөгжүүлэгч), Дэлгэрцэцэг (График дизайнер).
Portraits come from public/media/portrait-0N.jpg; render a labelled placeholder
if absent.

Report back: screenshots at 1440 and 390, and `npm run budget`.
```

---

## Phase 06 — Contact form, for real

```
Read CLAUDE.md first.

Build the enquiry section (dark, two columns) and make it actually submit.

Left column: eyebrow pill "Хүсэлт", a large Oswald heading "Юу хэрэгтэй байгааг
хэлээрэй", the email address in --orange as a mailto link, and an address block.

Right column: a real <form>, not decoration.
- Three chip groups, each a fieldset of radio inputs styled as chips. Selected chip
  gets an --orange fill. Must be keyboard navigable with arrow keys and have visible
  focus. Groups: Юу вэ / Төсөв / Хугацаа, options as in the Figma file.
- Then: name, email or phone, and a message textarea. Mongolian labels.
- Submit button in --orange.

Backend:
- A Cloudflare Pages Function at functions/api/enquiry.ts that validates the payload,
  rate-limits by IP, and inserts into a Supabase table `enquiries`
  (columns: id, created_at, service, budget, timing, name, contact, message, user_agent).
- Use the Supabase service key from an environment variable. Never expose it client-side.
- Return Mongolian success and error messages.
- Progressive enhancement: the form must work as a normal POST if JS is disabled.

Also write the SQL migration for the enquiries table with row-level security enabled
and no public read access.

Do not send email notifications yet — just store it. Tell me what it would take to
add email later.

Report back: the migration SQL, a screenshot of the section, proof of a successful
test submission, and what happens on validation failure.
```

---

## Phase 07 — Motion pass

```
Read CLAUDE.md first.

Add motion. This is the phase where restraint matters most — the reference site
uses very few effects, executed precisely. Resist adding more.

1. Lenis smooth scroll, duration ~1.15. Must be completely disabled (not just
   shortened) under prefers-reduced-motion. Anchor links scroll through Lenis.
2. GSAP ScrollTrigger reveals: elements fade up 24px over ~0.9s with a
   cubic-bezier(.22,.61,.36,1) ease, staggered ~65ms within a group, triggered once
   at 12% from the viewport bottom. Never re-animate on scroll back up.
3. Hover transitions on cards, rows and chips: 0.3–0.4s, colour and background only.
   No transforms, no scaling.
4. The rail progress fill and section label update smoothly.
5. Import GSAP and ScrollTrigger as named imports so the bundle tree-shakes. Check
   the JS budget after — if GSAP pushes you near 200 KB, replace the reveals with
   IntersectionObserver and keep GSAP only if it earns its weight.

Do not add: parallax, cursor followers, magnetic buttons, text scrambles, page
transitions, or a preloader. If you think one is needed, tell me why instead of
building it.

Report back: the JS bundle size before and after, a description of every animation
you added, and confirmation that reduced-motion produces a completely static page.
```

---

## Phase 08 — Media pipeline

```
Read CLAUDE.md first.

Build the tooling that keeps this site inside its weight budget, then process
whatever media exists in raw-media/.

1. A script `npm run media` that, for every source clip in raw-media/:
   - trims to a specified in/out point (config file, per clip)
   - strips the audio track entirely
   - encodes VP9 WebM and AV1 WebM at 720p max, 24fps, targeting 150–300 KB
   - exports a poster JPG from the first frame at ~40 KB
   - writes everything to public/media/ with consistent names
   Print a table of input size → output size per clip and fail loudly if any clip
   lands over 400 KB.

2. Same for stills: portraits and OG image to AVIF + WebP + JPG fallback, correct
   dimensions, stripped EXIF.

3. Wire every plate and portrait in the components to the processed output, with
   <picture> / <video> source ordering best-format-first and explicit width/height.

4. Update `npm run budget` to report per-section weight, so we can see which section
   is expensive.

Use ffmpeg. Document the exact commands in README so the team can re-run it without me.

Report back: the size table, the new total page weight, and which sections are heaviest.
```

---

## Phase 09 — Mobile

```
Read CLAUDE.md first.

The desktop layout is done. Now make 390px genuinely good — not just unbroken.

- Rail hidden, left inset drops from 144px to ~38px.
- All two- and three-column grids collapse to one column.
- Type scale: the clamp() values should already handle this, but check every heading
  for awkward wrapping and fix with text-wrap: balance or explicit breaks.
- Header nav: drop to the wordmark plus two links, or a simple disclosure. No
  hamburger overlay with animation — this site doesn't need one.
- Price rows: name and price on one line, description wrapping beneath.
- Product cards and team members stack.
- Touch targets minimum 44px. Chips especially.
- Verify the hero still fits without the logo colliding with the tagline on a short
  viewport (iPhone SE, 375×667).

Test at 390, 375, and 768.

Report back: screenshots at all three widths for every section, and anything you had
to compromise.
```

---

## Phase 10 — Performance, accessibility, SEO

```
Read CLAUDE.md first. This is the audit phase — find problems, don't add features.

Performance:
- Run the budget script. If over 1 MB or 200 KB JS, fix it and say what you cut.
- Verify fonts are subset, preloaded for above-the-fold faces only, font-display: swap.
- Confirm no render-blocking resources and no layout shift (every image and video
  has explicit dimensions).
- Simulate a 17 Mbps connection with 250ms latency and report time to first
  meaningful paint.

Accessibility:
- Full keyboard pass: every interactive element reachable, visible focus, logical order.
- Colour contrast against WCAG AA for every text/background pair in both tones.
  The known failures were found in Phase 02 and are documented in CLAUDE.md —
  verify the fixes held (tone-split --muted, orange as a mark not text on light
  grounds, --ink on orange fills) and check any pair introduced since.
- Semantic headings in order, landmarks, alt text in Mongolian, lang="mn" on <html>.
- Screen-reader pass on the enquiry form: are the chip groups announced as groups?

SEO and metadata:
- Mongolian title and description, Open Graph and Twitter cards, OG image.
- favicon set, web manifest, robots.txt, sitemap.xml.
- JSON-LD LocalBusiness / ProfessionalService schema with the Ulaanbaatar address.
- Cloudflare Web Analytics — it's cookieless, so it needs no consent banner. Do not
  add Google Analytics; it would force a cookie banner onto a site this clean.

Report back: a table of every issue found with severity, what you fixed, and what
you're leaving for me to decide.
```

---

## Phase 11 — Deploy

```
Read CLAUDE.md first.

Ship it.

1. Connect the GitHub repo to Cloudflare Pages. Build command, output directory,
   Node version pinned.
2. Environment variables for the Supabase keys, set in the Cloudflare dashboard —
   never committed.
3. Custom domain aniragency.mn plus www redirect. Confirm the certificate issues.
4. Set cache headers: immutable long-cache for hashed assets in /_astro/ and
   /fonts/, short cache for HTML.
5. Security headers via _headers: CSP, X-Content-Type-Options, Referrer-Policy,
   Permissions-Policy.
6. Verify the contact form works on the live domain, end to end, and that a real
   submission lands in Supabase.
7. Confirm the deployed page is served from the Ulaanbaatar PoP (check the
   cf-ray header's colo code from a Mongolian connection — ask me to run this,
   since you can't test from there).

Report back: the live URL, real measured page weight from the deployed site,
the colo code, and a short runbook for how the team redeploys.
```

---

## After launch

Things deliberately left out of the build, in rough priority order:

1. **Case studies.** Right now the site shows three of your own products. The first
   real client project should become a proper case-study page — that's what turns a
   portfolio into a sales tool.
2. **A CMS.** Only if someone other than a developer needs to add work. Not before.
3. **English version.** Only if you start chasing international clients. It doubles
   the copy maintenance, so do it for a reason, not for completeness.
4. **Email notification on enquiry.** Phase 06 stores submissions; someone still has
   to remember to check. Worth adding once you're getting real ones.