/**
 * Every word of Mongolian copy on the site lives here.
 *
 * Rules (CLAUDE.md > Conventions):
 *  - Never hardcode a Mongolian string in a component. The team proofreads this
 *    one file, not nine.
 *  - Prices are data. A non-technical person must be able to change one number
 *    here and have the site update.
 *
 * Copy is stored in sentence case and uppercased by CSS where the type scale
 * calls for it, so this file stays readable prose for proofreading.
 *
 * Since the admin (/admin/), this file is the types and the seed: what the
 * site says while the database holds nothing for a section. What the team
 * saves in the admin is laid over it at build time (./live.ts), so `site`
 * below is the seed with their edits — and `seed` is this file as written,
 * which the admin uses for its forms' shapes and templates.
 */

import liveJson from './live.json' with { type: 'json' };
import { applyLive, type Live } from './live.ts';

/* ------------------------------------------------------------------ shared */

/** Any image or video plate. Dimensions are required — CLAUDE.md forbids
 *  layout shift, so nothing renders without an intrinsic box. */
export interface Media {
  /**
   * Basename under /media with no extension — 'hero', 'plate-01'. The media
   * pipeline writes the encoded variants beside it (.av1.webm, .vp9.webm and a
   * poster .jpg for clips; .avif, .webp, .jpg for stills) and the component
   * emits whichever exist. null while the asset is still unshot.
   */
  name: string | null;
  /** Mongolian alt text. */
  alt: string;
  width: number;
  height: number;
  /** Shown on the placeholder until the asset exists: "Плейт 01". */
  label?: string;
  /** Shown on the placeholder: the format we expect back from the shoot. */
  format?: string;
  /**
   * A stand-in under /media/placeholder/, shown in dev and preview builds
   * while `name` is null — cropped to this slot's size. Never in production:
   * there the labelled plate shows instead (src/lib/placeholders.mjs).
   */
  placeholder?: string;
}

export interface Link {
  label: string;
  href: string;
}

/** The head of a section: its rail marker, its eyebrow pill, its heading. */
export interface SectionIntro {
  /** Short name — the rail marker and the section's accessible name. */
  label: string;
  /** The pill above the heading. Leave empty ('') to omit the pill. */
  eyebrow: string;
  /** The visible heading. */
  title: string;
}

/* --------------------------------------------------------------------- nav */

export interface NavLink extends Link {
  /** The last link — the enquiry CTA — is the only one allowed --orange. */
  accent?: boolean;
}

export interface Nav {
  wordmark: string;
  links: NavLink[];
}

/* -------------------------------------------------------------------- hero */

export interface ProductCard {
  eyebrow: string;
  name: string;
  tagline: string;
  cta: string;
  /** Optional: none of the three products has a public URL yet. Without one
   *  the card renders as a plain block, with no CTA and no hover. */
  href?: string;
}

/**
 * The pre-rendered 3D N beside the wordmark. It carries no text: the h1 beside
 * it already names the brand, so the mark is hidden from assistive tech rather
 * than announced twice.
 */
export interface HeroMark {
  /**
   * Basename under /media. The render pipeline ships three files beside it:
   * `${name}-still.webp`, the centre frame every visitor gets first;
   * `${name}.avif`, the sprite sheet, lazy and desktop-only (CLAUDE.md > Budget);
   * `${name}.json`, the sheet's grid and the angle of every row and column.
   */
  name: string;
}

export interface Hero {
  /** Alt text for the inline logo SVG. */
  logoAlt: string;
  mark: HeroMark | null;
  tagline: {
    line: string;
    lineItalic: string;
  };
  lede: string;
  video: Media | null;
  products: ProductCard[];
}

/* ----------------------------------------------------------------- marquee */

export interface Marquee {
  /** One repetition of the strip. The component duplicates the track. */
  text: string;
}

/* ---------------------------------------------------------------- showreel */

/** One piece of work in the mosaic. */
export interface ShowreelTile {
  /** Public path, extension included. AVIF, encoded at the size it displays —
   *  never scaled down in CSS from something larger. */
  src: string;
  /** Mongolian alt text. */
  alt: string;
  /** Its real pixel size. The desktop mosaic shows every tile at its own
   *  aspect ratio, so these set the shape of the column it sits in. */
  width: number;
  height: number;
}

export interface ShowreelVideo {
  /** H.264 MP4: AV1 hardware decode is not universal on budget Android. */
  src: string;
  /** AVIF, 40 kB at most. Shown until the video plays, and instead of it on
   *  saveData, slow devices and reduced motion. */
  poster: string;
  /** Mongolian. The video is silent and wordless, so this is all of it. */
  label: string;
  width: number;
  height: number;
}

/**
 * The mosaic is three columns. The sides are stacks of work, top to bottom,
 * shown at their own aspect ratios; as the camera moves in, the left one
 * drifts up and the right one down. The centre is one image above the video
 * and one below it, each cropped to the video's cell — a third of the screen
 * each way. Mix portrait and landscape down each side, so the seams fall in
 * different places and the columns read as scattered rather than ruled.
 */
export interface ShowreelMedia {
  left: ShowreelTile[];
  right: ShowreelTile[];
  above: ShowreelTile;
  below: ShowreelTile;
  video: ShowreelVideo;
}

export interface Showreel {
  /** Rail marker and the section's accessible name. */
  label: string;
  /**
   * The real work. null until the shoot, and with null the section does not
   * render in production at all — so main is always deployable. Must never
   * point inside /media/placeholder/: the build fails if it does.
   */
  media: ShowreelMedia | null;
  /** Stands in for missing real media in dev and preview builds only
   *  (src/lib/placeholders.mjs). Never shipped. */
  placeholder: ShowreelMedia;
}

/* ---------------------------------------------------------------- products */

/** Someone's word on a product, with their portrait. */
export interface Testimonial {
  name: string;
  /** Their position, and where. */
  role: string;
  /** The quote in two parts; the second is set apart, further right. */
  quote: [string, string];
  portrait: Media;
}

/** One of Anir's own products: a slide in the products reel. */
export interface Product {
  /** ASCII. The slide's anchor is #product-<id>; the hero cards link to it. */
  id: string;
  name: string;
  tagline: string;
  description: string;
  spec: {
    role: string;
    tech: string;
    year: string;
  };
  /** Its own site, once it has a public one. */
  href?: string;
  /** A screen of the product. A labelled plate until it is shot. */
  shot: Media;
  /** Its screens, by kind. The wall at the top of its page is built from all
   *  of them; `more` are also its general impressions, one after another. */
  gallery: {
    /** Two wide screens. */
    screens: [Media, Media];
    /** Phone screens. */
    mobile: Media[];
    /** More of the product: its general impressions. */
    more: Media[];
  };
  /** One big picture after the introduction, the screen's full width. */
  feature: Media;
  /** A paragraph on the product, with two pictures set against it. */
  impressions: {
    text: string;
    /** A wide one, and a tall one laid over its lower corner. */
    images: [Media, Media];
  };
  /**
   * The product's front page. With `before` — the old site it replaced — its
   * page compares the two, old on the left and new on the right; without it,
   * a product built from nothing, it shows the new one alone.
   */
  front: {
    before?: Media;
    after: Media;
  };
  /** Five of its pages on a phone, whole: tall screenshots, left to right. */
  responsive: Media[];
  /**
   * What someone who uses it said — real words, given with their permission,
   * never written for them. Without one, production shows no testimonial;
   * dev and preview builds show `pages.testimonial.stand` in its place.
   */
  testimonial?: Testimonial;
}

export interface Products {
  intro: SectionIntro;
  specLabels: {
    role: string;
    tech: string;
    year: string;
  };
  /** The reel's accessible names and its pause button. */
  controls: {
    label: string;
    slide: string;
    pause: string;
    play: string;
  };
  /** The home page's word on the products: one statement and the way in. */
  statement: {
    eyebrow: string;
    text: string;
    cta: string;
    /** The flowing orange behind it: a still, decorative, cover-fitted. */
    backdrop: {
      src: string;
      width: number;
      height: number;
    };
    /** The same silk on the light ground, for the light version (/v2). */
    backdropLight: {
      src: string;
      width: number;
      height: number;
    };
  };
  /** The products page, and what every product's own page shares. */
  pages: {
    title: string;
    headline: string;
    intro: string;
    /** On each card of the products page. */
    open: string;
    /** Back from a product to all of them. */
    back: string;
    /** On a product that has a public site. */
    visit: string;
    next: string;
    /** On the round button to the next product. */
    about: string;
    /** Over a product's general impressions, in its three lines. */
    overview: [string, string, string];
    /** A product's testimonial: its label, and the stand-in that shows on
     *  dev and preview builds while the product has no real one. */
    testimonial: {
      label: string;
      stand: Testimonial;
    };
    /** The label over a product's impressions. */
    impressions: string;
    /** Over the old and new front pages of a redesign. */
    compare: {
      title: string;
      note: string;
      before: string;
      after: string;
      /** The line's accessible name, for a screen reader and the keyboard. */
      control: string;
    };
    /** Over the front page of a product built from nothing. */
    fresh: {
      title: string;
      note: string;
    };
    /** Over a product's pages on a phone. The title in its two lines. */
    responsive: {
      label: string;
      title: [string, string];
    };
  };
  items: Product[];
}

/* ---------------------------------------------------------------- services */

/** One service: a row in the list, then a section of its own below it. */
export interface Service {
  /** 01, 02 … — displayed as written. */
  index: string;
  name: string;
  /** One sentence beneath the heading. */
  line: string;
  /** Exactly three, each a row led by an arrow. */
  points: [string, string, string];
  /** Beside the text, side by side at one height: a landscape, then a
   *  portrait. Labelled plates until they are made. */
  images: [Media, Media];
}

export interface Services {
  intro: SectionIntro;
  items: Service[];
}

/* ----------------------------------------------------------------- pricing */

export interface PriceRow {
  name: string;
  description: string;
  /**
   * The figure exactly as it should read: "1.5–3 сая", "60,000",
   * "Тохиролцоно". A string rather than a number because the real list quotes
   * ranges, open-ended starting prices, and one row that is not a number at
   * all — and because this way changing a price means editing what you see.
   */
  price: string;
  /** The small line beneath the figure: "төгрөг", "эхлээд", "ярилцъя". */
  unit: string;
}

export interface PricingGroup {
  title: string;
  rows: PriceRow[];
}

export interface Pricing {
  intro: SectionIntro;
  groups: PricingGroup[];
}

/* ----------------------------------------------------------------- process */

export interface ProcessStep {
  title: string;
  description: string;
}

/**
 * One point on the process, as a swimlane: what the client does and what the
 * studio does at that moment. The tracks are not equal — either side can be
 * null. An event both parties genuinely share is written once, as `both`, and
 * renders as one circle with the same label on each side.
 */
export type ProcessEvent =
  | { both: ProcessStep }
  | { client: ProcessStep | null; studio: ProcessStep | null };

export interface Process {
  intro: SectionIntro;
  /** The two track heads: the client on the left, the studio on the right. */
  sides: { client: string; studio: string };
  /** In order, top to bottom. Each one is a circle on the chain. */
  events: ProcessEvent[];
}

/* -------------------------------------------------------------------- team */

export interface TeamMember {
  name: string;
  role: string;
  portrait: Media;
}

export interface Team {
  intro: SectionIntro;
  items: TeamMember[];
}

/* ----------------------------------------------------------------- contact */

export interface ChipOption {
  /** Submitted value. Keep ASCII — it ends up in Supabase. */
  value: string;
  label: string;
}

export interface ChipGroup {
  /** Form field name: service | budget | timing. */
  name: string;
  legend: string;
  options: ChipOption[];
}

export interface FormField {
  name: string;
  label: string;
  placeholder: string;
}

export interface Contact {
  intro: SectionIntro;
  email: string;
  /** One line per element, rendered as an address block. */
  address: string[];
  form: {
    groups: ChipGroup[];
    fields: {
      name: FormField;
      contact: FormField;
      message: FormField;
    };
    submit: string;
    /** Shown while the request is in flight. */
    sending: string;
    messages: {
      success: string;
      error: string;
      /** Shown when a required field is empty or malformed. */
      invalid: string;
      /** Shown when the IP rate limit trips. */
      tooMany: string;
    };
    /** Invisible field that only a bot fills in. Its label is never seen. */
    honeypot: FormField;
  };
}

/* ------------------------------------------------------------------ chrome */

/** Copy that belongs to the furniture — rail, skip link, nav landmark. Short,
 *  but still Mongolian, so it still lives here rather than in a component. */
export interface Chrome {
  /** The rail's top tick. Ulaanbaatar. */
  railTick: string;
  /** aria-label on the main nav landmark. */
  navLabel: string;
  /** aria-label on the rail's progress readout. */
  railLabel: string;
  skipToContent: string;
  /** Rail marker for the hero, which has no visible section heading. */
  heroLabel: string;
}

/* -------------------------------------------------------------------- meta */

export interface Meta {
  title: string;
  description: string;
  /** 1200×630, for link previews. */
  ogImage: string | null;
  /** Postal address, for the JSON-LD business record. */
  locality: string;
  country: string;
  countryCode: string;
  /** Year the company was founded, for the same. */
  founded: string;
}

/* -------------------------------------------------------------------- site */

export interface Site {
  meta: Meta;
  chrome: Chrome;
  nav: Nav;
  hero: Hero;
  marquee: Marquee;
  showreel: Showreel;
  products: Products;
  services: Services;
  pricing: Pricing;
  process: Process;
  team: Team;
  contact: Contact;
}

/**
 * A screen on a product's own page, not shot yet: a labelled plate in
 * production, the named placeholder on dev and preview builds.
 */
const screen = (product: string, n: number, kind: 'wide' | 'phone' | 'grid', placeholder: string): Media => ({
  name: null,
  alt: `${product} — ${kind === 'phone' ? 'утасны дэлгэц' : 'дэлгэц'} ${n}`,
  width: kind === 'wide' ? 1600 : kind === 'phone' ? 900 : 1200,
  height: kind === 'wide' ? 1000 : kind === 'phone' ? 1200 : 900,
  label: `${kind === 'phone' ? 'Утас' : 'Дэлгэц'} ${String(n).padStart(2, '0')}`,
  format: kind === 'wide' ? 'Дэлгэцийн зураг · 16:10' : kind === 'phone' ? 'Утасны дэлгэц · 3:4' : 'Дэлгэцийн зураг · 4:3',
  placeholder: `/media/placeholder/${placeholder}.avif`,
});

/**
 * Any other picture on a product's own page, not shot yet: the big picture,
 * the impressions, the front pages. Like `screen`, a labelled plate in
 * production and the named placeholder on dev and preview builds.
 */
const still = (alt: string, width: number, height: number, label: string, format: string, placeholder: string): Media => ({
  name: null,
  alt,
  width,
  height,
  label,
  format,
  placeholder: `/media/placeholder/${placeholder}.avif`,
});

/** A product's pages on a phone, whole — tall screenshots, one per placeholder. */
const phonePages = (product: string, placeholders: string[]): Media[] =>
  placeholders.map((placeholder, i) => {
    const n = String(i + 1).padStart(2, '0');
    return still(`${product} — гар утсан дээрх хуудас ${n}`, 780, 1688, `Утас ${n}`, 'Утасны бүтэн хуудас · 9:19.5', placeholder);
  });

export const seed: Site = {
  meta: {
    title: 'Anir — Улаанбаатарын бүтээлч студи',
    description:
      'Вэб сайт, аппликейшн, постер, зураг авалт хийдэг Улаанбаатарын дөрвөн хүний бүтээлч студи. ' +
      'Таны уулзсан хүн ажлыг чинь өөрөө хийнэ.',
    ogImage: '/og.png',
    locality: 'Улаанбаатар',
    country: 'Монгол Улс',
    countryCode: 'MN',
    founded: '2026',
  },
  chrome: {
    railTick: 'УБ',
    navLabel: 'Үндсэн цэс',
    railLabel: 'Хуудсны явц',
    skipToContent: 'Үндсэн хэсэг рүү очих',
    heroLabel: 'Нүүр',
  },
  nav: {
    wordmark: 'ANIR',
    links: [
      { label: 'Бүтээгдэхүүн', href: '/products/' },
      { label: 'Үйлчилгээ', href: '#services' },
      { label: 'Холбоо +', href: '#contact', accent: true },
    ],
  },
  hero: {
    logoAlt: 'Анир агентлаг',
    mark: {
      name: 'mark-3d',
    },
    tagline: {
      line: 'Улаанбаатараас —',
      lineItalic: 'бодит бүтээгдэхүүн',
    },
    lede:
      'Вэб сайт, аппликейшн, постер, зураг авалт хийдэг дөрвөн хүний баг. ' +
      'Багаа зориудаар жижиг байлгадаг — таны уулзсан хүн ажлыг чинь өөрөө хийнэ.',
    video: {
      name: 'hero',
      alt: 'Анир багийн ажлын давталт',
      width: 1280,
      height: 720,
    },
    // Each card opens its product's own page.
    products: [
      {
        eyebrow: 'Бүтээгдэхүүн',
        name: 'Ezmath',
        tagline: 'Математикаа бэлд',
        cta: 'Үзэх +',
        href: '/products/ezmath/',
      },
      {
        eyebrow: 'Бүтээгдэхүүн',
        name: 'Ethos',
        tagline: 'Зөв хандив',
        cta: 'Үзэх +',
        href: '/products/ethos/',
      },
      {
        eyebrow: 'Бүтээгдэхүүн',
        name: 'Olymo',
        tagline: 'Боловсролын мэдээлэл',
        cta: 'Үзэх +',
        href: '/products/olymo/',
      },
    ],
  },
  marquee: {
    text: 'Жижиг баг — Бүтэн анхаарал —',
  },
  showreel: {
    // New Mongolian — Bat-Enkh to proofread. The video label reuses the hero
    // video's proofread alt text.
    label: 'Бүтээл',
    // The real work goes here the day the shoot lands, and the section appears.
    media: null,
    /*
      Placeholders: device mockups rendered at real weight, each marked
      ОРЛУУЛАХ · NN so it cannot pass for work. Phones and laptops alternate
      down each side, so the two columns are of comparable height and their
      seams interleave; the two wide laptops go above and below the video.
    */
    placeholder: {
      left: [
        { src: '/media/placeholder/tile-01.avif', alt: 'Түр зураг 01', width: 750, height: 1000 },
        { src: '/media/placeholder/tile-04.avif', alt: 'Түр зураг 04', width: 1000, height: 750 },
        { src: '/media/placeholder/tile-02.avif', alt: 'Түр зураг 02', width: 750, height: 1000 },
      ],
      right: [
        { src: '/media/placeholder/tile-05.avif', alt: 'Түр зураг 05', width: 1000, height: 750 },
        { src: '/media/placeholder/tile-03.avif', alt: 'Түр зураг 03', width: 750, height: 1000 },
        { src: '/media/placeholder/tile-06.avif', alt: 'Түр зураг 06', width: 1000, height: 750 },
      ],
      above: { src: '/media/placeholder/tile-07.avif', alt: 'Түр зураг 07', width: 1100, height: 660 },
      below: { src: '/media/placeholder/tile-08.avif', alt: 'Түр зураг 08', width: 1100, height: 660 },
      video: {
        src: '/media/placeholder/showreel.mp4',
        poster: '/media/placeholder/showreel-poster.avif',
        label: 'Анир багийн ажлын давталт',
        width: 1280,
        height: 720,
      },
    },
  },
  /*
    The three products. Names, taglines, descriptions and specs are the old
    Work section's proofread copy; the reel's control labels are new —
    Bat-Enkh to proofread those.
  */
  products: {
    intro: {
      label: 'Бүтээгдэхүүн',
      eyebrow: 'Сонгосон ажил',
      title: 'Өөрсдийн бүтээгдэхүүн',
    },
    specLabels: {
      role: 'Үүрэг',
      tech: 'Технологи',
      year: 'Он',
    },
    controls: {
      label: 'Бүтээгдэхүүний слайд',
      slide: 'слайд',
      pause: 'Түр зогсоох',
      play: 'Үргэлжлүүлэх',
    },
    // New, for the products page and each product's own page. Bat-Enkh to
    // proofread. The statement is true to the old disciplines copy: Anir
    // built its three products and runs them.
    statement: {
      eyebrow: 'Бүтээгдэхүүн',
      text: 'Бид санааг бодит бүтээгдэхүүн болгодог. Ezmath, Ethos, Olymo — гурвууланг нь өөрсдөө зохиож, бүтээж, өдөр бүр ажиллуулдаг.',
      cta: 'Бүтээгдэхүүн үзэх',
      // Generated with Gemini for Anir, its mock-up text removed; the source
      // and the cleaned PNG are in raw-media/ (not committed).
      backdrop: { src: '/media/statement-backdrop.avif', width: 1400, height: 752 },
      // Its white tinted to --paper, so the ground is the token exactly.
      backdropLight: { src: '/media/statement-backdrop-light.avif', width: 1400, height: 752 },
    },
    pages: {
      title: 'Бүтээгдэхүүн',
      headline: 'Бүтээгдэхүүн бүр өөрийн түүхтэй',
      intro: 'Бидний бүтээж, өдөр бүр ажиллуулдаг гурван бүтээгдэхүүн.',
      open: 'Үзэх +',
      back: 'Бүх бүтээгдэхүүн',
      visit: 'Сайтыг үзэх +',
      next: 'Дараагийн бүтээгдэхүүн',
      // New. Bat-Enkh to proofread.
      about: 'Дэлгэрэнгүй',
      overview: ['Энэ бүтээгдэхүүний', 'ерөнхий', 'сэтгэгдэл'],
      // The stand-in says what belongs there, so a preview can never be
      // mistaken for a real testimonial. It never ships: production shows a
      // product's testimonial only when the product has a real one.
      testimonial: {
        label: 'Хэрэглэгчийн сэтгэгдэл',
        stand: {
          name: 'Нэр Овог',
          role: 'Албан тушаал, байгууллага',
          quote: [
            '«Энд бүтээгдэхүүнийг ашигласан хүн эсвэл захиалагчийн бодит сэтгэгдэл орно. Бид өөрсдөө бичихгүй — хүлээн авсан үгийг нь зөвшөөрлийг нь авч байж нийтэлнэ.',
            'Ишлэлийн сүүлийн хэсэг энд, баруун тийш шилжиж төгсөнө.»',
          ],
          portrait: {
            name: null,
            alt: 'Хөрөг',
            width: 600,
            height: 600,
            label: 'Хөрөг',
            format: '1:1',
          },
        },
      },
      // New, with the impressions and the front pages. Bat-Enkh to proofread.
      impressions: 'Сэтгэгдэл',
      compare: {
        title: 'Хуучин ба шинэ',
        note: 'Шугамыг чирж, хуучин болон шинэ хувилбарыг харьцуулаарай.',
        before: 'Хуучин',
        after: 'Шинэ',
        control: 'Хуучин, шинэ хувилбарыг харьцуулах шугам',
      },
      fresh: {
        title: 'Эхнээс нь шинээр',
        note: 'Хуучин хувилбар гэж байгаагүй — бид анхны мөрөөс нь зохиож бүтээсэн.',
      },
      responsive: {
        label: 'Дасан зохицох',
        title: ['Ямар ч дэлгэцэнд', 'төгс харагдана'],
      },
    },
    items: [
      {
        id: 'ezmath',
        name: 'Ezmath',
        tagline: 'Математикаа бэлд. Шалгалтаа дав.',
        description: 'Математикийн мэдлэгээ бататгах хүртэлх таны ухаалаг туслах.',
        spec: {
          role: 'Бүтээгдэхүүн, брэнд, хөгжүүлэлт',
          tech: 'Next · Supabase',
          year: '2026',
        },
        shot: {
          name: null,
          alt: 'Ezmath — дэлгэцийн зураг',
          width: 1600,
          height: 1000,
          label: 'Ezmath',
          format: 'Дэлгэцийн зураг · 16:10',
          placeholder: '/media/placeholder/tile-07.avif',
        },
        gallery: {
          screens: [
          screen('Ezmath', 1, 'wide', 'tile-07'),
          screen('Ezmath', 2, 'wide', 'tile-05'),
          ],
          mobile: [
          screen('Ezmath', 1, 'phone', 'tile-01'),
          screen('Ezmath', 2, 'phone', 'tile-02'),
          screen('Ezmath', 3, 'phone', 'tile-03'),
          ],
          more: [
          screen('Ezmath', 3, 'grid', 'tile-04'),
          screen('Ezmath', 4, 'grid', 'tile-06'),
          screen('Ezmath', 5, 'grid', 'tile-08'),
          screen('Ezmath', 6, 'grid', 'tile-05'),
          ],
        },
        feature: still('Ezmath — ерөнхий зураг', 2400, 1350, 'Ezmath', 'Ерөнхий зураг · 16:9', 'tile-08'),
        // New. Bat-Enkh to proofread; the owner to confirm it says what Ezmath is for.
        impressions: {
          text: 'Ezmath-ийг бид сурагч математикаа өдөр бүр бага багаар, өөрийн хурдаар бататгаж чадахаар бүтээсэн. Энгийн, ойлгомжтой дэлгэцүүд нь анхаарлыг зөвхөн бодлогод төвлөрүүлдэг.',
          images: [
            still('Ezmath — зөөврийн компьютер дээр', 1600, 1000, 'Ezmath', 'Сэтгэгдэл · 16:10', 'tile-05'),
            still('Ezmath — гар утсан дээр', 900, 1200, 'Ezmath', 'Сэтгэгдэл · 3:4', 'tile-02'),
          ],
        },
        // Built new, not a redesign: the `before` is set, by the owner's
        // direction, so the comparison can be reviewed. It has no real image,
        // so production shows the new front page alone.
        front: {
          before: still('Ezmath — хуучин нүүр хуудас', 1600, 1000, 'Хуучин', 'Нүүр хуудас · 16:10', 'tile-06'),
          after: still('Ezmath — шинэ нүүр хуудас', 1600, 1000, 'Шинэ', 'Нүүр хуудас · 16:10', 'tile-07'),
        },
        responsive: phonePages('Ezmath', ['tile-01', 'tile-02', 'tile-03', 'tile-02', 'tile-01']),
      },
      {
        id: 'ethos',
        name: 'Ethos',
        tagline: 'Зөв хандив. Бодит тус.',
        description: 'Бодит сайн үйлсийг холбож, сайн дурын оролцоог дэмжинэ.',
        spec: {
          role: 'Бүтээгдэхүүн, хөгжүүлэлт',
          tech: 'Next · Supabase',
          year: '2026',
        },
        shot: {
          name: null,
          alt: 'Ethos — дэлгэцийн зураг',
          width: 1600,
          height: 1000,
          label: 'Ethos',
          format: 'Дэлгэцийн зураг · 16:10',
          placeholder: '/media/placeholder/tile-04.avif',
        },
        gallery: {
          screens: [
          screen('Ethos', 1, 'wide', 'tile-04'),
          screen('Ethos', 2, 'wide', 'tile-08'),
          ],
          mobile: [
          screen('Ethos', 1, 'phone', 'tile-02'),
          screen('Ethos', 2, 'phone', 'tile-03'),
          screen('Ethos', 3, 'phone', 'tile-01'),
          ],
          more: [
          screen('Ethos', 3, 'grid', 'tile-06'),
          screen('Ethos', 4, 'grid', 'tile-07'),
          screen('Ethos', 5, 'grid', 'tile-05'),
          screen('Ethos', 6, 'grid', 'tile-04'),
          ],
        },
        feature: still('Ethos — ерөнхий зураг', 2400, 1350, 'Ethos', 'Ерөнхий зураг · 16:9', 'tile-07'),
        // New. Bat-Enkh to proofread; the owner to confirm it says what Ethos is for.
        impressions: {
          text: 'Ethos сайн үйлсийг хүмүүстэй холбодог. Хандив хаашаа очиж, ямар тус болж байгааг ил тод харуулах нь бидний гол зорилго байсан.',
          images: [
            still('Ethos — зөөврийн компьютер дээр', 1600, 1000, 'Ethos', 'Сэтгэгдэл · 16:10', 'tile-06'),
            still('Ethos — гар утсан дээр', 900, 1200, 'Ethos', 'Сэтгэгдэл · 3:4', 'tile-03'),
          ],
        },
        // Built from nothing: no `before`, so its page shows the new front page alone.
        front: {
          after: still('Ethos — нүүр хуудас', 1600, 1000, 'Нүүр хуудас', 'Нүүр хуудас · 16:10', 'tile-04'),
        },
        responsive: phonePages('Ethos', ['tile-02', 'tile-03', 'tile-01', 'tile-03', 'tile-02']),
      },
      {
        id: 'olymo',
        name: 'Olymo',
        tagline: 'Боловсролын шинэ мэдээлэл бүхнийг нэг дороос.',
        description: 'Олимпиад, боловсролын хамгийн хэрэгтэй мэдээллийг нэг дороос шуурхай хүргэнэ.',
        spec: {
          role: 'Бүтээгдэхүүн, эдиториал',
          tech: 'Astro · CMS',
          year: '2026',
        },
        shot: {
          name: null,
          alt: 'Olymo — дэлгэцийн зураг',
          width: 1600,
          height: 1000,
          label: 'Olymo',
          format: 'Дэлгэцийн зураг · 16:10',
          placeholder: '/media/placeholder/tile-08.avif',
        },
        gallery: {
          screens: [
          screen('Olymo', 1, 'wide', 'tile-08'),
          screen('Olymo', 2, 'wide', 'tile-06'),
          ],
          mobile: [
          screen('Olymo', 1, 'phone', 'tile-03'),
          screen('Olymo', 2, 'phone', 'tile-01'),
          screen('Olymo', 3, 'phone', 'tile-02'),
          ],
          more: [
          screen('Olymo', 3, 'grid', 'tile-05'),
          screen('Olymo', 4, 'grid', 'tile-04'),
          screen('Olymo', 5, 'grid', 'tile-07'),
          screen('Olymo', 6, 'grid', 'tile-08'),
          ],
        },
        feature: still('Olymo — ерөнхий зураг', 2400, 1350, 'Olymo', 'Ерөнхий зураг · 16:9', 'tile-05'),
        // New. Bat-Enkh to proofread; the owner to confirm it says what Olymo is for.
        impressions: {
          text: 'Olymo олимпиад, боловсролын мэдээллийг нэг дор цуглуулдаг. Сурагч, багш, эцэг эх хэн ч хэрэгтэй мэдээллээ хурдан олохоор бүтээсэн.',
          images: [
            still('Olymo — зөөврийн компьютер дээр', 1600, 1000, 'Olymo', 'Сэтгэгдэл · 16:10', 'tile-04'),
            still('Olymo — гар утсан дээр', 900, 1200, 'Olymo', 'Сэтгэгдэл · 3:4', 'tile-01'),
          ],
        },
        // Built new, not a redesign: the `before` is set, by the owner's
        // direction, so the comparison can be reviewed. It has no real image,
        // so production shows the new front page alone.
        front: {
          before: still('Olymo — хуучин нүүр хуудас', 1600, 1000, 'Хуучин', 'Нүүр хуудас · 16:10', 'tile-08'),
          after: still('Olymo — шинэ нүүр хуудас', 1600, 1000, 'Шинэ', 'Нүүр хуудас · 16:10', 'tile-06'),
        },
        responsive: phonePages('Olymo', ['tile-03', 'tile-01', 'tile-02', 'tile-01', 'tile-03']),
      },
    ],
  },
  /*
    Phase 19. The names and lines come from the brief; the three points under
    each are new — drafted in the same voice, partly from the proofread copy
    of the old disciplines. Bat-Enkh to proofread all of it before it ships.
    The section heading and label reuse the old section's proofread ones.
  */
  services: {
    intro: {
      label: 'Үйлчилгээ',
      eyebrow: '',
      title: 'Бидний хийдэг зүйл',
    },
    items: [
      {
        index: '01',
        name: 'Зөвлөгөө',
        line: 'Төслийн зорилго, боломжийг тодорхойлж, эхлэх замыг зурна.',
        points: [
          'Одоогийн байдал, зорилгоо хамтдаа тодорхойлно',
          'Төсөв, хугацааны бодит үнэлгээ гаргана',
          'Эхний алхмыг тодорхой төлөвлөгөө болгоно',
        ],
        images: [
          { name: null, alt: 'Макет — Зөвлөгөө', width: 1200, height: 900, label: 'Макет 01', format: 'Дэлгэц · 4:3', placeholder: '/media/placeholder/tile-04.avif' },
          { name: null, alt: 'Утасны макет — Зөвлөгөө', width: 900, height: 1200, label: 'Макет 01', format: 'Утас · 3:4', placeholder: '/media/placeholder/tile-01.avif' },
        ],
      },
      {
        index: '02',
        name: 'Стратеги',
        line: 'Хэнд, юуг, яаж хэлэхээ шийдэж, төлөвлөгөө болгоно.',
        points: [
          'Зорилтот хэрэглэгч, тэдний хэрэгцээг тодорхойлно',
          'Зах зээл, өрсөлдөгчдийг судална',
          'Хэмжиж болохуйц зорилт тавина',
        ],
        images: [
          { name: null, alt: 'Макет — Стратеги', width: 1200, height: 900, label: 'Макет 02', format: 'Дэлгэц · 4:3', placeholder: '/media/placeholder/tile-05.avif' },
          { name: null, alt: 'Утасны макет — Стратеги', width: 900, height: 1200, label: 'Макет 02', format: 'Утас · 3:4', placeholder: '/media/placeholder/tile-02.avif' },
        ],
      },
      {
        index: '03',
        name: 'Хэрэглэгчийн туршлага',
        line: 'Хүн төвтэй бүтэц, ойлгомжтой урсгалыг зохионо.',
        points: [
          'Хуудасны бүтэц, навигацийг төлөвлөнө',
          'Загвар, прототипоор урьдчилан туршина',
          'Гар утсанд эхлээд тохируулна',
        ],
        images: [
          { name: null, alt: 'Макет — Хэрэглэгчийн туршлага', width: 1200, height: 900, label: 'Макет 03', format: 'Дэлгэц · 4:3', placeholder: '/media/placeholder/tile-06.avif' },
          { name: null, alt: 'Утасны макет — Хэрэглэгчийн туршлага', width: 900, height: 1200, label: 'Макет 03', format: 'Утас · 3:4', placeholder: '/media/placeholder/tile-03.avif' },
        ],
      },
      {
        index: '04',
        name: 'Вэб хөгжүүлэлт',
        line: 'Хурдан ачаалагддаг, арчлахад хялбар сайт бүтээнэ.',
        points: [
          'Эхний ачаалалт нэг мегабайтаас доош',
          'Монголын мобайл сүлжээнд зориулж оновчилно',
          'Хайлтын системд зөв харагдахаар бүтээнэ',
        ],
        images: [
          { name: null, alt: 'Макет — Вэб хөгжүүлэлт', width: 1200, height: 900, label: 'Макет 04', format: 'Дэлгэц · 4:3', placeholder: '/media/placeholder/tile-07.avif' },
          { name: null, alt: 'Утасны макет — Вэб хөгжүүлэлт', width: 900, height: 1200, label: 'Макет 04', format: 'Утас · 3:4', placeholder: '/media/placeholder/tile-01.avif' },
        ],
      },
      {
        index: '05',
        name: 'Аппликейшн',
        line: 'Гар утасны болон вэб аппликейшн хөгжүүлнэ.',
        points: [
          'Нэвтрэлт, төлбөр, мэдэгдлийг холбоно',
          'Өөрсдийн гурван бүтээгдэхүүний туршлагад тулгуурлана',
          'Эхний хувилбараа хурдан гаргаж, хэрэглэгчээр туршина',
        ],
        images: [
          { name: null, alt: 'Макет — Аппликейшн', width: 1200, height: 900, label: 'Макет 05', format: 'Дэлгэц · 4:3', placeholder: '/media/placeholder/tile-08.avif' },
          { name: null, alt: 'Утасны макет — Аппликейшн', width: 900, height: 1200, label: 'Макет 05', format: 'Утас · 3:4', placeholder: '/media/placeholder/tile-02.avif' },
        ],
      },
      {
        index: '06',
        name: 'Брэндинг ба постер',
        line: 'Лого, өнгө, үсгийн хэв, хэвлэлийн материал.',
        points: [
          'Лого болон брэндийн гарын авлага',
          'Арга хэмжээ, кампанит ажлын постер',
          'Хэвлэхэд бэлэн, өнгө нь ялгагдсан файл',
        ],
        images: [
          { name: null, alt: 'Макет — Брэндинг ба постер', width: 1200, height: 900, label: 'Макет 06', format: 'Хэвлэл · 4:3', placeholder: '/media/placeholder/tile-04.avif' },
          { name: null, alt: 'Постерын макет — Брэндинг ба постер', width: 900, height: 1200, label: 'Макет 06', format: 'Постер · 3:4', placeholder: '/media/placeholder/tile-03.avif' },
        ],
      },
      {
        index: '07',
        name: 'Гэрэл зураг',
        line: 'Бүтээгдэхүүн, баг, орчны зураг авалт.',
        points: [
          'Эхлээд вэбд зориулж буудна',
          'Багц бүр хөдөлгөөнгүй зураг, богино давталттай',
          'Боловсруулалт, өнгө засвар багтсан',
        ],
        images: [
          { name: null, alt: 'Зураг авалт — Гэрэл зураг', width: 1200, height: 900, label: 'Зураг 07', format: 'Зураг · 4:3', placeholder: '/media/placeholder/tile-05.avif' },
          { name: null, alt: 'Хөрөг — Гэрэл зураг', width: 900, height: 1200, label: 'Зураг 07', format: 'Зураг · 3:4', placeholder: '/media/placeholder/tile-01.avif' },
        ],
      },
      {
        index: '08',
        name: 'Арчилгаа ба өсөлт',
        line: 'Нийтэлсний дараа хэмжиж, сайжруулж, тогтмол арчилна.',
        points: [
          'Хурд, хандалтыг сар бүр хэмжинэ',
          'Аюулгүй байдлын шинэчлэлийг тогтмол хийнэ',
          'Шинэ хэсэг, контентыг үе шаттай нэмнэ',
        ],
        images: [
          { name: null, alt: 'Макет — Арчилгаа ба өсөлт', width: 1200, height: 900, label: 'Макет 08', format: 'Дэлгэц · 4:3', placeholder: '/media/placeholder/tile-06.avif' },
          { name: null, alt: 'Утасны макет — Арчилгаа ба өсөлт', width: 900, height: 1200, label: 'Макет 08', format: 'Утас · 3:4', placeholder: '/media/placeholder/tile-02.avif' },
        ],
      },
    ],
  },
  /*
    Retained deliberately — NOT dead code, do not delete. Not rendered: the
    Pricing section was taken off the page in October 2026. Pricing.astro still
    reads this, so the section can return by adding it back to index.astro.
  */
  pricing: {
    intro: {
      label: 'Үнэ',
      eyebrow: 'Ил тод',
      title: 'Үнийн санал',
    },
    groups: [
      {
        title: 'Вэб ба систем',
        rows: [
          {
            name: 'Аудит',
            description: 'Одоо байгаа сайт, системийн шинжилгээ ба зөвлөмж',
            price: '1.5–3 сая',
            unit: 'төгрөг',
          },
          {
            name: 'Лендинг',
            description: 'UI/UX дизайн, функцтэй нэг хуудас сайт',
            price: '1.5–2.5 сая',
            unit: 'төгрөг',
          },
          {
            name: 'Backend + Frontend',
            description: 'Системийн хэмжээнээс хамаарч тодорхойлно',
            price: '3 сая ₮-с',
            unit: 'эхлээд',
          },
          {
            name: 'Сургалтын веб',
            description: 'Видео хичээл, төлбөр, суралцагчийн бүртгэлтэй',
            price: '5 сая ₮-с',
            unit: 'эхлээд',
          },
        ],
      },
      {
        title: 'Дизайн ба контент',
        rows: [
          {
            name: 'Постер',
            description: 'Нэг постер, хэвлэхэд бэлэн файлаар',
            price: '60,000',
            unit: 'төгрөг',
          },
          {
            name: 'Instagram carousel',
            description: 'Олон хуудастай багц дизайн',
            price: '80,000',
            unit: 'төгрөг',
          },
          {
            name: 'Зураг авалт',
            description: 'Бүх төрлийн зураг авалт, боловсруулалттай',
            price: '300–500 мянга',
            unit: 'төгрөг',
          },
          {
            name: 'Reel видео',
            description: 'Урт болон зохиолоос хамаарч үнэ тогтоно',
            price: 'Тохиролцоно',
            unit: 'ярилцъя',
          },
        ],
      },
    ],
  },
  /*
    New Mongolian, from the Phase 15 brief — Anir's own words, not the
    reference site's. Bat-Enkh to proofread before it ships. The heading reuses
    the old three-step section's proofread eyebrow.
  */
  process: {
    intro: {
      label: 'Процесс',
      eyebrow: 'Процесс',
      title: 'Хэрхэн явагддаг',
    },
    sides: {
      client: 'Та',
      studio: 'Бид',
    },
    events: [
      { both: { title: 'Зөвлөгөөний уулзалт', description: 'Төслийн зорилго, шаардлагыг хамтдаа тодорхойлно.' } },
      { client: null, studio: { title: 'Судалгаа', description: 'Сайтад хэрэгтэй мэдээллийг цуглуулна.' } },
      { client: null, studio: { title: 'Санал', description: 'Зардал, үйлчилгээг нарийвчлан багцална.' } },
      { both: { title: 'Үнийн ярилцлага', description: 'Зардлын бүтэц, төлбөрийн нөхцөлийг тодруулна.' } },
      {
        client: { title: 'Эхлэх уулзалт', description: 'Төслийг албан ёсоор эхлүүлнэ.' },
        studio: { title: 'Стратегийн ярилцлага', description: 'Хэрэгжүүлэлтийн стратегийг тусгайлан боловсруулна.' },
      },
      {
        client: { title: 'Контент өгөх', description: 'Текст, зураг болон бусад агуулгыг өгнө.' },
        studio: { title: 'Загварын заавар', description: 'Өнгө, үсгийн хэв зэрэг дүрмийг тогтооно.' },
      },
      { client: null, studio: { title: 'Нүүр хуудсын загвар', description: 'Сайтын гол хуудсыг зохионо.' } },
      {
        client: { title: 'Үзэл баримтлалын шүүмж', description: 'Танилцуулсан загварт санал хүсэлтээ хэлнэ.' },
        studio: { title: 'Бүх сайтын загвар', description: 'Заавар, саналд тулгуурлан бүрэн загварыг гаргана.' },
      },
      {
        client: { title: 'Бүрэн загварын шүүмж', description: 'Эцсийн хэрэгжүүлэлтийн өмнө бүх загварыг хянана.' },
        studio: { title: 'Хөгжүүлэлт', description: 'Сайтыг Astro дээр бүтээнэ.' },
      },
      {
        client: { title: 'Бэлэн сайтын шүүмж', description: 'Нийтлэхийн өмнө бэлэн сайтыг хянана.' },
        studio: { title: 'Агуулга оруулах', description: 'Бүх текст, зургийг сайтад байршуулна.' },
      },
      { client: null, studio: { title: 'Тест ба тохируулга', description: 'Бүх үйлдлийг нарийн шалгана.' } },
      { client: null, studio: { title: 'Нийтлэх', description: 'Бэлэн сайтыг олны хүртээл болгоно.' } },
      { client: null, studio: { title: 'Сайжруулалт ба арчилгаа', description: 'Нийтэлсний дараа тогтмол арчилж, сайжруулна.' } },
      { client: { title: 'Үр шим', description: 'Үйлчлүүлэгчээ гайхшруулна.' }, studio: null },
    ],
  },
  /*
    Retained deliberately — NOT dead code, do not delete. Not rendered: the
    Team section was taken off the page in October 2026. Team.astro still reads
    this, so the section can return by adding it back to index.astro.
  */
  team: {
    intro: {
      label: 'Баг',
      eyebrow: 'Баг',
      title: 'Бид дөрвүүлээ',
    },
    items: [
      {
        name: 'Бат-Эрдэнэ',
        role: 'Гүйцэтгэх захирал · Хөгжүүлэгч',
        portrait: {
          name: 'portrait-01',
          alt: 'Бат-Эрдэнэ, гүйцэтгэх захирал ба хөгжүүлэгч',
          width: 900,
          height: 1200,
          label: 'Хөрөг',
          format: '01',
        },
      },
      {
        name: 'Бат-Энх',
        role: 'UI/UX дизайнер',
        portrait: {
          name: 'portrait-02',
          alt: 'Бат-Энх, UI/UX дизайнер',
          width: 900,
          height: 1200,
          label: 'Хөрөг',
          format: '02',
        },
      },
      {
        name: 'Баярбаясгалан',
        role: 'Ахлах хөгжүүлэгч',
        portrait: {
          name: 'portrait-03',
          alt: 'Баярбаясгалан, ахлах хөгжүүлэгч',
          width: 900,
          height: 1200,
          label: 'Хөрөг',
          format: '03',
        },
      },
      {
        name: 'Дэлгэрцэцэг',
        role: 'График дизайнер',
        portrait: {
          name: 'portrait-04',
          alt: 'Дэлгэрцэцэг, график дизайнер',
          width: 900,
          height: 1200,
          label: 'Хөрөг',
          format: '04',
        },
      },
    ],
  },
  contact: {
    intro: {
      label: 'Холбоо барих',
      eyebrow: 'Хүсэлт',
      title: 'Юу хэрэгтэй байгааг хэлээрэй',
    },
    email: 'hello@aniragency.mn',
    address: [
      'Улаанбаатар, Монгол Улс',
      'Анир ХХК · 2026 онд байгуулагдсан',
      'aniragency.mn',
    ],
    form: {
      groups: [
        {
          name: 'service',
          legend: 'Юу вэ',
          options: [
            { value: 'web', label: 'Вэб сайт' },
            { value: 'app', label: 'Аппликейшн' },
            { value: 'poster', label: 'Постер' },
            { value: 'photo', label: 'Зураг авалт' },
          ],
        },
        {
          name: 'budget',
          legend: 'Төсөв',
          options: [
            { value: 'under-1m', label: '1 саяас доош' },
            { value: '1-3m', label: '1–3 сая' },
            { value: '3-5m', label: '3–5 сая' },
            { value: 'over-5m', label: '5 саяас дээш' },
          ],
        },
        {
          name: 'timing',
          legend: 'Хугацаа',
          options: [
            { value: 'this-month', label: 'Энэ сард' },
            { value: 'this-quarter', label: 'Энэ улиралд' },
            { value: 'exploring', label: 'Судалж байна' },
          ],
        },
      ],
      fields: {
        name: {
          name: 'name',
          label: 'Нэр',
          placeholder: 'Таны нэр',
        },
        contact: {
          name: 'contact',
          label: 'И-мэйл эсвэл утас',
          placeholder: 'hello@example.com эсвэл 99112233',
        },
        message: {
          name: 'message',
          label: 'Товч тайлбар',
          placeholder: 'Юу хийлгэхийг хүсэж байна вэ?',
        },
      },
      submit: 'Илгээх',
      sending: 'Илгээж байна…',
      messages: {
        success:
          'Баярлалаа — хүсэлт хүлээн авлаа. Нэг ажлын өдрийн дотор хариу бичнэ.',
        error:
          'Уучлаарай, илгээхэд алдаа гарлаа. Дахин оролдоно уу, эсвэл hello@aniragency.mn руу шууд бичээрэй.',
        invalid: 'Талбаруудаа шалгана уу — нэр, холбоо барих мэдээлэл, сонголтууд шаардлагатай.',
        tooMany: 'Хэт олон хүсэлт илгээлээ. Хэсэг хүлээгээд дахин оролдоно уу.',
      },
      honeypot: {
        name: 'website',
        label: 'Энэ талбарыг хоосон орхино уу',
        placeholder: '',
      },
    },
  },
};

/**
 * The site as the build renders it: the seed with the admin's content laid
 * over it. live.json is written by scripts/content-pull.mjs before every
 * build and dev server — `{}` when there is nothing to pull.
 */
export const site: Site = applyLive(seed, liveJson as Live);

export default site;
