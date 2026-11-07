# The Anir website: what has been built, explained plainly

*Written 6 November 2026. It covers everything built from 30 August to 6 November 2026.*

This guide is for anyone who needs to understand the Anir website, whether or not
they have ever built one. You do not need to know anything technical to read it.
Wherever a technical word cannot be avoided, it is explained, and there is a
glossary at the end ([section 12](#12-glossary)).

---

## Contents

1. [The short version](#1-the-short-version)
2. [What the site is for](#2-what-the-site-is-for)
3. [Where the site lives and how it gets there](#3-where-the-site-lives-and-how-it-gets-there)
4. [A map of the pages](#4-a-map-of-the-pages)
5. [The home page, top to bottom](#5-the-home-page-top-to-bottom)
6. [The products page](#6-the-products-page)
7. [A product's own page, top to bottom](#7-a-products-own-page-top-to-bottom)
8. [The admin: editing the site yourself](#8-the-admin-editing-the-site-yourself)
9. [The rules the site keeps, and why](#9-the-rules-the-site-keeps-and-why)
10. [How the work happened: a timeline](#10-how-the-work-happened-a-timeline)
11. [What is still to do](#11-what-is-still-to-do)
12. [Glossary](#12-glossary)
13. [For a developer: where things are](#13-for-a-developer-where-things-are)

---

## 1. The short version

- **Anir** (Anir ХХК) is a four-person creative studio in Ulaanbaatar. It sells
  four services: websites, posters, photo shoots and apps. It also makes its own
  products: **Ezmath**, **Ethos** and **Olymo**.
- The website is in **Mongolian only**. It has a home page, a page listing the
  products, one page for each product, and a private **admin** where the team can
  change words and pictures without a developer.
- The site is built to be **fast on Mongolian mobile internet**. Every page is
  weighed automatically, and a page that is too heavy is not allowed to go live.
- It is hosted on **Cloudflare**, which has a server in Ulaanbaatar itself, so
  pages arrive quickly.
- Enquiries from the contact form are **never lost**. They are stored in a
  database, and the team gets a message on Telegram for each one.
- Most of the newest work exists only as **previews** so far. It goes live when
  it is merged into the main version of the site (see [section 11](#11-what-is-still-to-do)).

---

## 2. What the site is for

The site has two jobs, in this order:

1. **Convince a Mongolian client that this small, young studio does serious work.**
2. **Get them to fill in the enquiry form**, ideally with a budget already chosen.

It is not a blog, and it is not a place to show off technical tricks. Every
movement and effect on the site is there because it helps one of those two jobs.
If it does not help, it comes out.

The look is restrained: near-black and light-grey backgrounds, three typefaces,
thin 1-pixel lines instead of shadows or rounded boxes, and **one** bright colour,
the Anir orange (#FF3300). The orange is kept for things that are active, selected
or clickable. That keeps it meaningful, the way the logo uses it.

The art direction takes its cues from two sites the owner chose: **visioned.ch**,
a Swiss agency (for the order of the pages and the enquiry form), and
**db-longbow** (for restraint and large type). Anir's site borrows ideas from
them, not their design or content.

---

## 3. Where the site lives and how it gets there

### Hosting: Cloudflare

The site is served by **Cloudflare**, a company that runs servers all over the
world. Cloudflare has one in Ulaanbaatar. Other popular hosts (Vercel, for
example) serve Mongolia from Tokyo or Seoul, which is noticeably slower. That is
the whole reason Cloudflare was chosen.

The intended address is **aniragency.mn**. **It is not registered yet**; that
is still to do ([section 11](#11-what-is-still-to-do)). Until it is, the live
site, meaning whatever is on `main` (see below), is at Cloudflare's own address,
https://anir.b-batuka0627.workers.dev.

### "Static": the site is a set of finished pages

Most websites build each page on the fly when someone visits. This one does not.
All pages are prepared in advance (this is called a **build**) and stored as
ready-made files. When a visitor arrives, Cloudflare hands them the finished page.
This is simpler, faster and safer: there is almost nothing on the server that can
break or be attacked.

Only two things run on the server:

1. **The contact form**, which receives an enquiry and stores it.
2. **The admin's publish button**, which asks for a new build.

### The main version, branches and previews

The site's code is kept in a history called **git**, on GitHub. Picture a
main road with side roads:

- **`main`** is the main road. Whatever is on `main` is the live site.
- New work is done on a **branch**, a side road, so it can be checked without
  touching the live site. The current branch is called
  `feat/phase-19-dolly-services`.
- When the work is approved, the branch is **merged** into `main`, and it goes
  live.

Every branch gets a **preview**: a private copy of the site at its own address,
where the work can be looked at before it goes live. The current previews are:

| Preview | Address |
|---|---|
| Cloudflare preview (the real host) | https://feat-phase-19-dolly-services-anir.b-batuka0627.workers.dev |
| The admin on that preview | https://feat-phase-19-dolly-services-anir.b-batuka0627.workers.dev/admin/ |
| A temporary second copy on Vercel | https://anir-preview.vercel.app |

The Vercel copy was made only so the owner could look at work quickly. It is
temporary and should be deleted later.

Previews show **placeholder pictures** (stand-in images) where real photos do
not exist yet. The live site never shows placeholders; it hides a section until
its real pictures exist. More on this in [section 9](#9-the-rules-the-site-keeps-and-why).

---

## 4. A map of the pages

| Page | Address | What it is |
|---|---|---|
| Home | `/` | The studio: its work, its products, how it works, its services, the enquiry form. |
| Products | `/products/` | Anir's own products, one large card each. |
| A product | `/products/ezmath/`, `/products/ethos/`, `/products/olymo/` | One long page per product. Adding a product in the admin creates its page automatically. |
| Admin | `/admin/` | The private editing screen. Not linked anywhere and hidden from Google. |
| Review page | `/v2` | A variant of the home page for comparing designs. Exists on previews only, never on the live site. |

Two further sections, **Pricing** (a price table) and **Team** (the four people),
are built and their words are kept, but they are currently hidden from the site.
Whether to bring them back is an open decision.

---

## 5. The home page, top to bottom

### Things that are on every page

**The menu (top bar).** It holds the word ANIR and three links: **Бүтээгдэхүүн**
(Products), **Үйлчилгээ** (Services) and **Холбоо +** (Contact, in orange, as the
main call to action).

- It has no background of its own; just the words, with a soft fade behind them
  so they stay readable.
- Scrolling **down** slides it away so it does not cover what you are reading.
  Scrolling **up** brings it back.
- It changes colour to suit the section beneath it: light words over dark
  sections, dark words over light ones.
- Over the orange silk picture (below), the orange Contact link would disappear,
  so there it turns light with an orange line under it.

**The left rail (desktop only).** A thin strip down the left edge with:

- **УБ** (Ulaanbaatar) at the top;
- an orange line that fills as you scroll down the page;
- the name of the section you are in, written vertically.

**No scrollbar.** By the owner's choice, the browser's scrollbar is hidden,
because the rail already shows where you are. Scrolling works exactly as normal:
mouse wheel, trackpad, touch and keyboard.

**The film grain.** A very fine texture lies over the whole site, like the grain
of photographic film. It makes the large black areas look like film rather than
flat digital black.

- It is matched to the grain on visioned.ch, as the owner asked.
- On desktop computers it gently "boils": it changes three times a second, as real
  film grain does.
- On phones, on slow devices, with data saver on, or for people who have asked
  their device to reduce motion, it stays still.
- It took four attempts to get right. The story is in [section 10](#10-how-the-work-happened-a-timeline).

**The footer.** The ANIR wordmark set edge to edge across the bottom, cut off by
the bottom of the page, so it feels bigger than the screen.

### The sections, in order

**1. Hero (Эхний дэлгэц), the first screen.**

- The large ANIR wordmark, with a 3D letter N beside it.
- On a desktop computer, the N **tilts toward your mouse**. It is not real 3D,
  which would be far too heavy: it is seven photographs of the N taken from
  different angles, and the site shows the one that matches where your mouse is.
- Those seven pictures load only after the page has appeared, and only on
  computers that can handle them. Phones and slow connections see one still
  picture of the N.
- Below are **cards for up to four products**. The cap of four is built into the
  admin.

**2. Marquee (Гүйдэг тууз).** A strip of Mongolian text that runs sideways
across the screen, between the hero and the work.

**3. Showreel mosaic (Бүтээлийн мозайк).**

- Anir's work, shown as three columns of pictures. They are slightly out of line,
  like prints scattered on a table, with a video in the middle.
- As you scroll, the section holds still and the "camera" moves in on the video,
  until the video fills the screen. Then the page carries on.
- This section **appears on the live site only once real photos and video
  exist**. On previews it shows placeholders.

**4. Products statement (Бүтээгдэхүүний мэдэгдэл).**

- One large sentence about Anir's own products, over a picture of flowing orange
  silk on black (a still image made for Anir).
- The words **light up one by one** as you scroll past, so the sentence fills in
  as you read it.
- A button leads to the products page.

**5. Products beam.** Anir's N stands in the middle of a dark screen like a lamp.
As you scroll, a beam of soft orange light turns around it and lights up each
product in turn. On phones, where there is no room for a sweeping beam, the
products are simply listed under the lamp.

**6. Process (Ажлын явц).** How a project with Anir runs, as two columns:

- **«Та»** (You): what the client does;
- **«Бид»** (We): what the studio does.

Between them runs a chain of outlined orange circles. Each circle brightens as it
passes the middle of the screen. The team can add as many steps as they like.

**7. Services (Үйлчилгээ).** Eight rows of large text, one per service:

- Зөвлөгөө (Consulting)
- Стратеги (Strategy)
- Хэрэглэгчийн туршлага (User experience)
- Вэб хөгжүүлэлт (Web development)
- Аппликейшн (Apps)
- Брэндинг ба постер (Branding and posters)
- Гэрэл зураг (Photography)
- Арчилгаа ба өсөлт (Care and growth)

Click a row and it opens:

- an orange band with the service's name runs across the screen;
- below it, a one-line description, three key points and two pictures.

Opening one row closes the others. The pictures are loaded only when their row
is opened, which saves data.

**8. Contact form (Холбоо барих).** On a dark background, by the owner's choice.

- The visitor picks:
  - **what** they need: website, app, poster or photo shoot;
  - their **budget**: under 1 million ₮, 1–3 million, 3–5 million, or over 5
    million;
  - their **timing**: this month, this quarter, or just exploring.
- They then write their name, an email or phone number, and a message.
- The borders and text were made stronger so the form is easy to see on the dark
  background.
- The form works **even if the visitor's browser has JavaScript switched off**.

**What happens to an enquiry:**

1. It is stored in the **Supabase** database, the studio's online database.
2. The team gets a **Telegram** message for each enquiry with nothing odd about it,
   straight away. Enquiries that need checking (almost always robots) do not each
   send a message. Instead, at most once an hour, one short line arrives:
   «Шалгах: N шинэ» ("Check: N new"). If more than 50 enquiries arrive in one day,
   one extra message says so, so a flood of spam is noticed. Email notifications
   will be added once the aniragency.mn domain is registered and set up for email.
3. **If the database is asleep**, the enquiry is not lost. On the free plan,
   Supabase pauses a project after a week without use. When that happens, the
   enquiry is held safely in a second store at Cloudflare for up to 30 days. Once
   the database is woken up (**Restore** in the Supabase dashboard), the waiting
   enquiries move across within 15 minutes, with their original times.
4. The visitor sees an error only if **both** stores fail.
   - **Nothing a visitor writes or picks makes an enquiry fail.** If something
     looks wrong (no name, a contact that is not an email or phone number), the
     enquiry is still kept exactly as sent, and marked for the team to check.
5. To stop spam, one visitor can send at most **5 enquiries an hour**. Visitors'
   internet addresses are scrambled (hashed) before they are stored, so they
   cannot be read back.

---

## 6. The products page

Address: `/products/`.

**The top.** The page's title sits in the middle of the screen, surrounded by
screenshots of the products floating in the dark at different depths. As you
scroll, near screenshots move faster than far ones, which gives a sense of
depth. Below it, a short sentence lights up word by word. The idea comes from the
"Referenzen" page on visioned.ch.

**The products.** One **full-width card** per product:

- a big picture;
- a thin line;
- the product's name and a short description.

Each card settles gently into place as it comes into view. Clicking a card opens
that product's page.

**The end.** An invitation to get in touch, on a light background, then the footer.

---

## 7. A product's own page, top to bottom

Every product (Ezmath, Ethos, Olymo, and any added later) gets the same long
page. Its words and pictures come from that product's entry in the admin.

**1. The wall of screens.**

- The page **opens on one big picture that fills the screen**.
- As you scroll, the view pulls back. That picture turns out to be one of many
  screenshots arranged in a wall of five columns, drifting slightly as they
  gather.
- **On phones** there is no animation: just the main picture, full width, at its
  own shape, below the menu.

**2. The introduction.** Over a dimmed version of the orange silk:

- the product's name and its tagline, in two tones;
- a description that lights up word by word;
- three short facts in three columns.

By the owner's direction, this and the home page statement are the only places
the silk is used.

**3. The big picture.** One picture filling the whole screen, moving slightly as
you scroll past. On phones it is full width at its own shape.

**4. Impressions (Сэтгэгдэл).**

- A short text and two pictures arranged together: a wide one along the bottom of
  the screen and a tall one overlapping it.
- The arrangement is calculated so the text and the wide picture always **fit on
  one screen**, whatever the screen size.
- If needed, the text sits over the picture, with a soft shade behind it so it
  stays readable.

**5. Old and new (Хуучин ба шинэ), or newly built (Эхнээс нь шинээр).** This
section has two forms:

- **For a redesign**, it shows the old version and the new one, one over the
  other, with an orange line between them.
  - When the section comes into view, the line **sweeps across by itself** once,
    turning the old design into the new one.
  - After that, the visitor takes control: they drag the **round handle** left
    or right to compare. The keyboard's arrow keys work too.
  - When the line reaches one side, the arrow pointing that way disappears,
    because there is nowhere further to go.
- **For a product built from scratch**, there is nothing old to compare, so the
  section shows the new design on its own, with different words.

In fact all three products are newly built. **Ezmath and Olymo are set up as
redesigns only to demonstrate the slider**, using placeholder "old" pictures.
Those "old" slots are marked as **demos**: the live site always shows Ezmath and
Olymo in the "newly built" form, **even if someone uploads a picture into
them**, because a before-and-after would claim a redesign that never happened.
The admin says so beside those slots. For a product that really was redesigned,
an editor removes the demo "old" part and adds a new one; that one does appear
on the live site once its picture is uploaded.

**6. Phone showcase (Дасан зохицох: "Ямар ч дэлгэцэнд төгс харагдана", looks
right on any screen).**

- Five phone-sized screens of the product, arranged like a staircase, rising
  into place as you scroll.
- In the bottom-right corner, five thin curved lines form part of a circle. Each
  has a small brighter section, all at different places along their lines.
- As you scroll down, the bright sections slide slowly to the left around their
  curves.
- The section's bottom edge moves down when the pictures are bigger, so a phone
  never pokes over the line into the next section.

**7. General impressions.** On a light background:

- a large heading of three lines, centred on the screen: «Энэ бүтээгдэхүүний /
  ерөнхий / сэтгэгдэл» (this product's general impressions);
- the product's pictures at about **80% of the screen's width**, settling into
  place as they appear.

**8. Testimonial (Хэрэглэгчийн сэтгэгдэл, what a client says).**

- A round portrait inside a thin ring that draws itself.
- The person's name and role.
- Their words, in two parts.

It appears **only when a real testimonial exists**: someone's name and their
words. One added in the admin but left empty does not count. Previews show a
stand-in so the design can be judged. Its name reads «Нэр Овог» ("First Last")
and its quote says what belongs there, so it cannot be mistaken for a real one.
The live site never shows it.

**9. Next product.**

- A full-screen picture of the next product, dimmed.
- Its name small, and **«Дараагийн бүтээгдэхүүн»** (Next product) large.
- A round orange button. The whole screen is the link.

**10. Contact invitation and footer**, as on the products page.

---

## 8. The admin: editing the site yourself

### What it is

The **admin** is a private screen where the team can change **every word and
every picture** on the site, and **add, remove and reorder products**, without
asking a developer. It is in Mongolian.

- **Where:** `/admin/` on the site. For now, on the preview:
  https://feat-phase-19-dolly-services-anir.b-batuka0627.workers.dev/admin/
  Once the work is merged (see [section 11](#11-what-is-still-to-do)), it will
  be on the live site.
- **Who:** only people the owner has given an account **and** editor rights.
  Visitors cannot sign up. At the last check there were three accounts, two of
  them editors. A signed-in person who is not an editor can look but cannot save.
- The film grain is switched off in the admin, so it is easier on the eyes.

### The two buttons that matter: Save and Publish

This is the most important thing to understand about the admin:

| Button | What it does | Does the website change? |
|---|---|---|
| **Хадгалах** (Save) | Stores your changes in the database. | **No.** Nothing visible changes yet. |
| **Нийтлэх** (Publish) | Rebuilds the whole website with everything saved so far. | **Yes**, within 2–3 minutes. |

So you can save many times, over several days, and nothing reaches visitors
until someone presses **Нийтлэх**. If you try to publish with unsaved changes,
the admin asks you to save first.

### The screen

The admin uses the whole width of the screen, in three columns:

1. **Left: what to edit.**
   - **Хүсэлтүүд** (Enquiries) comes first, with the number of new ones beside it.
     See [Enquiries](#enquiries-хүсэлтүүд) below.
   - **Нүүр хуудас** (Home page), in exactly the order a visitor scrolls past
     them: Эхний дэлгэц (hero), Гүйдэг тууз (marquee), Бүтээлийн мозайк
     (mosaic), Бүтээгдэхүүний мэдэгдэл (products statement), Ажлын явц
     (process), Үйлчилгээ (services), Холбоо барих (contact). A section that
     holds a list shows how many it has, for example «Ажлын явц · 14».
     **Үнэ** (Pricing) and **Баг** (Team) are dimmed and marked
     **Унтраалттай** (switched off): their words are kept, but no page shows
     them today.
   - **Бүтээгдэхүүн** (Products): each product, plus the words shared by every
     product page.
   - **Бүх хуудсанд** (On every page): Цэс ба зүүн шугам (the menu and the left
     rail), Google ба холбоос хуваалцах (how the site appears on Google and in
     shared links).
2. **Middle: the form.** Every word and picture of the chosen part, in plain
   Mongolian labels. Only things a visitor actually reads are shown. Technical
   values that would break the site if changed are hidden.
3. **Right: the live preview (Урьдчилан харах).** The real page, which can be
   switched between **Компьютер** (desktop) and **Утас** (phone).
   - Your unsaved changes appear in it **immediately**.
   - **Click into a field** and the matching spot on the page **lights up in
     orange**.
   - It works the other way too: **click any word or picture on the page** and
     its field opens in the form. You do not need to know where something lives
     in the admin; you can just click it.

Under every field is **a line of help**: where it appears on the site and, where
length matters, what happens if it grows, for example «20 тэмдэгтээс хэтэрвэл
хоёр мөр болно» ("past 20 characters it becomes two lines"). Those lengths were
measured on the real pages. Nothing stops you typing more: past the length, a
counter appears and says what will happen, and you decide.

### Nothing you type is lost

Every change is kept in your browser as you type, until you save. If the tab
closes or the browser crashes, the admin offers your changes back the next time:
«Хадгалаагүй өөрчлөлт байна — сэргээх үү?» ("There are unsaved changes; restore
them?"). A small orange dot in the left column marks any part with unsaved
changes. **Хадгалах** is greyed out when there is nothing to save, and reads
**Хадгалсан** ("Saved") for a moment after it works.

Keyboard: **Ctrl+S** saves, **Esc** closes the open row.

### Enquiries (Хүсэлтүүд)

Every enquiry sent from the contact form, newest first, without needing
Telegram.

- Each row shows the date, the name, how to reach them, and the first line of the
  message. Click a row to read it in full; click the email or phone number to
  write or call.
- Each enquiry has a status: **Шинэ** (new), **Уншсан** (read), **Хариулсан**
  (replied) or **Хаасан** (closed). Buttons at the top show one status at a time;
  it opens on the new ones. The number beside **Хүсэлтүүд** in the left column
  counts only the new ones with nothing to check, so it means real people.
- **Opening an enquiry does not mark it read.** You press a button for that, so
  an enquiry opened by accident is not hidden from the next person.
- **Enquiries cannot be deleted**, by anyone. When one is dealt with, close it.
  An enquiry is a client trying to give the studio money; nobody should lose one
  with a misclick.
- **New enquiries with something to check wait under «Шалгах»** ("Check"), their
  own button, counted separately. Nothing a visitor sends is ever refused, so an
  enquiry is always kept, even when something in it does not look right. Examples:
  no name, a contact that is neither an email nor a phone number, a choice the form
  does not have, or something sent other than through the form. Each is kept
  exactly as sent, and says what to look at. Most of these will be spam from
  robots, which is why they are kept apart from **Шинэ**. Still, look through them
  now and then: a real person who typed their phone number oddly lands here too.
- Only editors can see them. The enquiries never pass through anyone's browser
  except an editor's, and the database keeps them locked to everyone else.

### Editing pictures

- Click **Зураг сонгох** (Choose image) or **Солих** (Replace).
- Before you choose, the admin says the limits: JPG, PNG, WebP or AVIF, up to
  **15 MB**, and the exact size the site will use for that slot, for example
  2400 × 1350. Export your picture at that size. It also shows how much of the
  studio's storage is used, out of **1 GB** in all.
- When the site is published, your picture is **cut to that size and compressed
  automatically**, in three modern formats.
- The admin checks a picture the moment you choose it:
  - over 15 MB, it is **refused** before uploading, with its size named;
  - over 8 MB, it is uploaded, with a note that it takes up storage. Visitors
    never download the big file, only the compressed copy;
  - smaller than the slot, it is uploaded, with a warning that it will look soft
    and the size it should be;
  - a different shape from the slot, it is uploaded, with a note that its edges
    will be cut off.
- **Videos cannot be uploaded in the admin.** They need special compression, which
  a developer does. The mosaic's photos and video are also handled by a developer;
  in the admin you can only change their names.

### Lists

Things that come in lists (process steps, services, hero cards) show one row each,
named by what it holds, for example «Стратегийн ярилцлага — Та: Эхлэх уулзалт»,
with its number small beside it. Click a row to open it in place. An empty row
says «Хоосон — дарж бөглөнө үү» ("Empty — click to fill in").

- **+ Нэмэх** adds a row. **↑ ↓** move a row, and **✕** removes it. These sit at
  the row's right edge and appear when you point at the row or reach it with the
  keyboard.
- **✕ asks once**: the first press turns it into «Хасах уу?» ("Remove?"), and only
  the second press removes the row.
- Some lists have a limit: the hero holds at most **4** product cards.
- The contact form's choice buttons, and its questions, can be added, removed
  and reworded like any other list. Each new one gets a hidden code of its own
  automatically, and an enquiry that picks it is always stored.

### When two people edit the same part

If someone else saved a part after you opened it, your save does not overwrite
theirs. The admin says «Өөр хүн энэ хэсгийг хадгалсан байна. Дахин нээж,
өөрчлөлтөө оруулна уу.» ("Someone else saved this part. Reopen it and enter your
changes."). Your typing is kept. Press **Дахин нээх** (Reopen): the part opens as
they saved it, with your changes put back on top, ready for you to check and save.

### Switched-off sections

**Үнэ** (Pricing) and **Баг** (Team) open, so you can read them, but nothing in
them can be edited and there is no save button: the page code switches them off,
so nothing typed there could reach the site. Switching one back on is a
developer's job.

### Products

- **+ Бүтээгдэхүүн нэмэх** (Add product): give it a name and an address.
  - The address uses small Latin letters, numbers and dashes, for example
    `ezmath`.
  - Its page will be at `/products/ezmath/`.
- **Дээш / Доош** (Up / Down) changes the order products appear in.
- **Бүтээгдэхүүнийг устгах** (Delete product) removes it.
  - It stays on the site until the next publish.
  - The last remaining product cannot be deleted.
- The hero's product cards are edited separately, under Эхний дэлгэц.

### The safety net

Publishing never puts a broken site in front of visitors. During every build the
site checks itself:

- Is every page within its weight limit?
- Is every value the right kind? For example, text where text belongs, not a
  number.
- Do all the pictures exist?

If any check fails, the build stops, **and the live site stays exactly as it
was.**

After you press **Нийтлэх**, the admin tells you how it is going, in plain words:

- the build has started and usually takes 2–3 minutes, so there is no need to
  reload;
- it is building;
- it is done, and the site updates within a few minutes;
- or it failed. In that case it says why, for example "a page is over its weight
  limit", and what to do next. The site stays as it was.

The admin can only report "done" or "failed" once the build-reading key is set up
(see [section 11](#11-what-is-still-to-do)). Until then it says the build started.
If nothing changes after a few minutes, a developer can see why in Cloudflare.

---

## 9. The rules the site keeps, and why

These rules are written into the project's rulebook (`CLAUDE.md`), and most are
checked automatically on every build.

### Speed: a strict weight limit

The site's visitors are mostly on Mongolian mobile internet (about 17 Mbps on
average), so every kilobyte counts. Each page is weighed on every build, and a
page over its limit **fails the build**:

- **What loads immediately:** under **1 MB** in total, of which program code
  (JavaScript) is under **200 KB**. That is very lean for a modern site.
- **One extra, after the page appears:** up to **500 KB**, for the seven pictures
  of the tilting N. Only on desktops that can handle it; never with data saver
  on.
- **Pictures and video further down the page:** up to **1.6 MB**, and only loaded
  when the visitor scrolls near them:
  - the mosaic's pictures together at most **300 KB**;
  - the video at most **1.2 MB**, never loaded with data saver on.

Other choices made for speed:

- No heavy animation libraries. Most movement uses the browser's own built-in
  features.
- The fonts are trimmed to just the letters Mongolian needs.

### Readability: contrast is measured, not guessed

Every pairing of text colour and background colour has been **measured** for how
readable it is, against the international accessibility standard (WCAG AA). The
measurement includes the film grain.

- A small program checks the table on every build, and the build fails if a
  pairing drops below the bar.
- This is why the grain cannot be any stronger than it is. At 6% instead of 5%,
  orange text on the light background would become too hard to read.
- It is also why the site uses two greys, one for dark backgrounds and one for
  light: no single grey is readable on both.

### The orange rule

Orange marks only what is **active, selected or clickable**: links, hovered
things, chosen options, the scroll progress line.

There are a few deliberate exceptions, all by the owner's direction:

- the orange silk pictures;
- the process circles and the services band, which are graphic marks rather than
  buttons.

Text on orange is always black, never white, because white on orange is hard to
read.

### Mongolian only, with every letter drawn properly

- There is no English version.
- Every typeface on the site must draw **Ө, Ү, ө, ү** properly. Many fonts that
  claim "Cyrillic" lack them.
- The three typefaces:
  - **Oswald** for headlines, always in capitals;
  - **PT Serif** for subtitles, its italic giving personality;
  - **JetBrains Mono** for body text and labels.
- One small fix: the line spacing of the big headlines was opened up slightly,
  because the mark on **Й** collided with the line above.

### Motion is optional

People can ask their phone or computer to reduce motion, for example because
animation makes them dizzy. For them, **every animation on the site switches
off**, and they see the finished, still version of each section.

### It works without JavaScript

If a visitor's browser has JavaScript switched off, every page still shows all
its content, and the contact form still sends. The movement is a bonus on top,
never a requirement.

### Placeholders never reach the live site

The stand-in pictures used on previews are **stripped from the live build**.

- The build **fails** if the live site's content points at one.
- A section that has no real pictures yet, like the mosaic, is simply left off
  the live site until it does.
- Two stand-ins are held to a stricter rule, because they would make a false
  **claim** rather than just look unfinished: the stand-in testimonial (a quote
  nobody said) and the demo "old" pictures (a redesign that never happened).
  The live site never shows either, and if a mistake in the code ever let one
  through, the build would fail instead of going live.

### Built for phones too

Every section was checked on a phone-sized screen. Where an effect does not suit
a small screen, phones get a simpler version: the product wall becomes one
picture, and the products beam becomes a list.

---

## 10. How the work happened: a timeline

| Dates (2026) | What was done |
|---|---|
| 30–31 Aug | **Foundations.** The project set up; colours, typefaces and layout rules; the hero and marquee; the middle sections; a real contact form; motion; a system for compressing photos and video; the settings for hosting. |
| 5–17 Oct | **The design pass and tidy-up.** The site brought in line with the Figma design; an old screen effect removed; headline spacing fixed for Й; an unused animation library removed. |
| 24–25 Oct | **The 3D N in the hero.** Seven pictures that follow the mouse, loaded only on capable desktops, after the page appears. Fonts adjusted so the page does not jump while loading. |
| 25–26 Oct | **The work and the process.** The showreel mosaic; the process as a chain of circles; its own weight limit for pictures further down the page; the first film grain; the move to Cloudflare Workers; enquiries that can never be lost (held at Cloudflare if the database sleeps); Telegram notifications. |
| 27–30 Oct | **Showreel, services, products.** The camera moving in on the video; the services accordion with its running band; the products beam with the N as a lamp. |
| 31 Oct | **Products get their own pages.** The orange silk behind the products statement; the `/v2` comparison page; the menu reduced to words that slide away; the contact section turned dark and made easier to see; the scrollbar hidden. |
| 3 Nov | **The products page and product pages.** Floating screenshots; full-width cards; the wall that pulls back from one big picture; the intro over the silk; the big picture; impressions; the old-and-new slider; the phone showcase with its curved lines; general impressions; the testimonial; the next product. Then the phone versions of all of these. Then the **admin**: editing every word and picture, adding and removing products, publishing. |
| 4 Nov | **The admin made simpler.** Grouped by page, plain words, only what visitors read, help on every field, a live preview that lights up what you are editing. The process can now have any number of steps. |
| 6 Nov | **The film grain, done properly.** See below. |

### The film grain story

The owner found the first grain "eye tiring and very obvious". It took four
versions:

1. **Sparse white specks**: too few and too bright. They looked like dust.
2. **A soft grey noise**: too faint to see at all on black.
3. **A dense, still grain** matched to photos the owner sent: closer, but lifeless.
   The owner explained the reference grain *moved*.
4. **Matched to visioned.ch's own grain.** The owner pointed to visioned.ch and a
   screen recording of it. Their grain image was studied frame by frame:
   - every dot pure black or pure white, half and half;
   - laid over the page at 5%;
   - three fresh frames, each shown for 0.15 seconds.

   Anir's grain now matches theirs on black almost exactly. The one difference:
   Anir's black dots are at 30% strength. At full strength, some text would
   fail the readability measurement.

---

## 11. What is still to do

### To make the new work live

- [ ] **Switch publishing on, in exactly this order.** Each step needs the one
  before it; the developer's version is in the README (The admin › Setting it up).
  1. **Three database changes.** In Supabase, run
     `supabase/migrations/0004_enquiry_status.sql` (enquiries get a status, for the
     inbox), then `0005_keep_every_enquiry_and_build_status.sql` (the database stops
     refusing enquiries, and gets the build status), then `0006_worker_alerts.sql`
     (where the site notes trouble for the admin to show).
  2. **The build secret.** A developer makes one random secret and stores it in
     Cloudflare as `BUILD_REPORT_SECRET` (Settings → Build → Variables and secrets).
     It lets the build tell the admin how it went, and can do nothing else. No
     Cloudflare key is involved.
  3. **Merge the work into `main`**, leaving the build command as it is
     (`npm run budget`). All the work since late October is on a branch. Until it
     is merged, the live site has neither the product pages nor the admin.
  4. **The same secret, again**, stored on the Worker with
     `npx wrangler secret put BUILD_REPORT_SECRET`.
  5. **The Publish button's key**: the publish hook (see "Deploy hook" in the
     [glossary](#12-glossary)), stored with `npx wrangler secret put
     DEPLOY_HOOK_URL`, typed at the prompt, never into a file or a chat.
  6. **The health check's secret**, stored with `npx wrangler secret put
     HEALTH_CHECK_SECRET`. This one is required. Without it, the site's automatic
     health check would leave a fake enquiry behind every time it runs.
  7. **Only then, the build command**, changed to `npm run ci`. Done earlier, the
     first build would report to an address that does not exist yet, and the admin
     would wait fifteen minutes on a build that worked. Do it straight after step 6,
     before anyone presses **Нийтлэх**.
- [ ] **After the merge: limit publishing** to once every two minutes, so repeated
  clicks cannot use up the build minutes Cloudflare allows.
- [ ] **Delete the three test process steps** saved in the admin («Үр шим» three
  times, one with stray letters), then save.

### The domain

- [ ] **Register aniragency.mn.** `.mn` addresses are run by Datacom; register
  through them or a reseller, then point the domain at Cloudflare. It takes
  days, so it is worth starting early. Until it is registered:
  - the site has no address of its own (it runs at its Cloudflare address);
  - **hello@aniragency.mn, the email shown in the contact section, cannot
    receive mail**, so anyone who writes to it gets their message bounced;
  - enquiry notifications go by Telegram only.

### Content the team needs to supply

- [ ] **Real photos and video** for the mosaic, the product pages and the services.
- [ ] **Real testimonials** from clients, with permission and a portrait.
- [ ] **Real "old" pictures**, only for a product that really was redesigned.
  None of today's three was, so nothing is needed for them.
- [ ] **Proofreading by a native reader (Bat-Enkh)** of all the newer Mongolian
  text:
  - the product page wording: impressions, old and new, newly built, the phone
    showcase, general impressions, testimonial, next product;
  - every label and help text in the admin.

  There is no need to read code for this: `npm run copy:export` makes one list,
  `mongolian-copy.md`, of every Mongolian sentence on the site and in the admin,
  in order, each with where it appears.

### Decisions for the owner

- [ ] **Picture weight on product pages.** With real photos, a product page will
  probably go over today's 300 KB limit for pictures further down the page.
  Either raise the limit for product pages, or use fewer pictures there.
- [ ] **Should the grain move on phones too?** Today it is still on phones.
- [ ] **The size of the title on the products page.**
- [ ] **Bring back Pricing and Team, or keep them hidden?**
- [ ] **Turn on "leaked password protection"** in Supabase (Authentication →
  settings), which refuses passwords known to have been stolen elsewhere.
  Supabase's automatic security check recommends it. (The other thing it
  flagged, a permission the public did not need, was closed on 6 November.)

### Later

- [ ] **Email notifications** for enquiries, once aniragency.mn is registered and
  its email records are in place (SPF, DKIM and DMARC: the settings that stop
  the studio's mail being filed as spam).
- [ ] **Delete the temporary Vercel copy** (`anir-preview`) once it is no longer
  needed.

---

## 12. Glossary

| Word | Meaning |
|---|---|
| **Admin** | The private editing screen at `/admin/`. |
| **AVIF, WebP, JPEG** | Picture file formats. AVIF is the newest and smallest; the site makes all three from each upload and the browser uses the best one it understands. |
| **Branch** | A separate line of work in the code's history, kept apart from the live site until it is approved. |
| **Build** | Preparing every page of the site in advance as finished files. Happens on every publish. |
| **Budget (weight budget)** | The maximum size a page may be. Checked on every build; a page over it is not allowed live. |
| **Cloudflare** | The company whose servers deliver the site, including one in Ulaanbaatar. |
| **Contrast** | How much text stands out from its background, measured as a ratio. Higher is easier to read. |
| **Data saver (saveData)** | A phone setting asking websites to use less data. The site respects it by skipping heavy extras. |
| **Deploy hook** | A secret web address that, when called, starts a new build. The Publish button uses it. It is kept secret because anyone holding it could start builds. |
| **Editor** | A person with an account who is allowed to save and publish in the admin. |
| **Film grain** | The fine moving texture over the site, imitating photographic film. |
| **Git, GitHub** | The tool that keeps the history of every change to the code, and the website where that history is stored. |
| **JavaScript (JS)** | The programming language browsers run. The site uses as little as possible and works without it. |
| **Lazy loading** | Not loading a picture until the visitor scrolls near it. Saves data for people who never scroll that far. |
| **`main`** | The main line of the code. Whatever is on `main` is the live site. |
| **Merge** | Joining approved work from a branch into `main`, which makes it live. |
| **Placeholder** | A stand-in picture used on previews until the real one exists. Never shown on the live site. |
| **Preview** | A private copy of the site at its own address, for checking work before it goes live. |
| **Publish (Нийтлэх)** | The admin button that rebuilds the live site with everything saved. |
| **Reduced motion** | A device setting asking for less animation. The site switches all animation off for it. |
| **Save (Хадгалах)** | The admin button that stores changes in the database without changing the site. |
| **Scroll animation** | Movement tied to scrolling: it plays forward as you scroll down and backward as you scroll up. |
| **Static site** | A site made of finished pages prepared in advance, rather than built on each visit. |
| **Supabase** | The online database that stores enquiries and everything saved in the admin. Anir already uses it for Ethos and Ezmath. |
| **Worker** | A small program on Cloudflare's servers. The site's Worker handles the contact form and the Publish button. |

---

## 13. For a developer: where things are

If you are taking over the code, start with these, in this order:

1. **[CLAUDE.md](CLAUDE.md)**: the project's rulebook. Every rule above, in full,
   with the measurements behind it. Where it and a request disagree, ask.
2. **[README.md](README.md)**: running the site locally, deploying, rolling back,
   the enquiry form, the media pipeline and the admin's setup.
3. **[src/content/site.ts](src/content/site.ts)**: every word on the site, in one
   place. Components never contain Mongolian text of their own.
4. **[src/components/](src/components/)**: one file per section, named in English
   (for example `ProductFront.astro` is the old-and-new slider).
5. **[src/content/admin.ts](src/content/admin.ts)** and
   **[src/scripts/admin.ts](src/scripts/admin.ts)**: the admin's words and the
   admin itself.

Useful commands:

| Command | What it does |
|---|---|
| `npm run dev` | Runs the site on your own computer, with placeholders. |
| `npm run build` | Builds the site exactly as the live site will be. |
| `npm run budget` | Weighs every page and checks contrast; fails if anything is over. |
| `npm run contrast` | Measures the readability table, grain included. |
| `npm run media` | Compresses photos and video for the site. |
| `npm run grain` | Remakes the film grain picture. |
