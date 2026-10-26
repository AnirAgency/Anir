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
 */

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
 * The desktop mosaic is three columns. The sides are stacks of work, top to
 * bottom, that drift upward as the camera moves in; the centre is one image
 * above the video and one below it, at the video's width, and holds still.
 * Mix portrait and landscape down each side — the stagger reads from the
 * seams between tiles, and the two columns need comparable heights.
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
  /** The mockup beside the text. A labelled plate until it is made. */
  plate: Media;
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
  services: Services;
  pricing: Pricing;
  process: Process;
  team: Team;
  contact: Contact;
}

export const site: Site = {
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
    // The cards linked to the Work section, which Phase 19 removed. Give a
    // card an href — its product's own site, once it has one — and it becomes
    // a link again, CTA and hover included.
    products: [
      {
        eyebrow: 'Бүтээгдэхүүн',
        name: 'Ezmath',
        tagline: 'Математикаа бэлд',
        cta: 'Үзэх +',
      },
      {
        eyebrow: 'Бүтээгдэхүүн',
        name: 'Ethos',
        tagline: 'Зөв хандив',
        cta: 'Үзэх +',
      },
      {
        eyebrow: 'Бүтээгдэхүүн',
        name: 'Olymo',
        tagline: 'Боловсролын мэдээлэл',
        cta: 'Үзэх +',
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
        plate: { name: null, alt: 'Макет — Зөвлөгөө', width: 1200, height: 900, label: 'Макет 01', format: 'Дэлгэцийн макет' },
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
        plate: { name: null, alt: 'Макет — Стратеги', width: 1200, height: 900, label: 'Макет 02', format: 'Дэлгэцийн макет' },
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
        plate: { name: null, alt: 'Макет — Хэрэглэгчийн туршлага', width: 1200, height: 900, label: 'Макет 03', format: 'Дэлгэцийн макет' },
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
        plate: { name: null, alt: 'Макет — Вэб хөгжүүлэлт', width: 1200, height: 900, label: 'Макет 04', format: 'Дэлгэцийн макет' },
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
        plate: { name: null, alt: 'Макет — Аппликейшн', width: 1200, height: 900, label: 'Макет 05', format: 'Дэлгэцийн макет' },
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
        plate: { name: null, alt: 'Макет — Брэндинг ба постер', width: 1200, height: 900, label: 'Макет 06', format: 'Хэвлэлийн макет' },
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
        plate: { name: null, alt: 'Макет — Гэрэл зураг', width: 1200, height: 900, label: 'Макет 07', format: 'Зураг' },
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
        plate: { name: null, alt: 'Макет — Арчилгаа ба өсөлт', width: 1200, height: 900, label: 'Макет 08', format: 'Дэлгэцийн макет' },
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

export default site;
