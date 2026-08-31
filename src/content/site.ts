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
  /** The pill above the heading. */
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
  href: string;
}

export interface Hero {
  /** Alt text for the inline logo SVG. */
  logoAlt: string;
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

/* ------------------------------------------------------------- disciplines */

export interface Discipline {
  /** ВЭБ / ДИЗАЙН / ЗУРАГ / АПП. A marker, not a sequence number. */
  code: string;
  title: string;
  /** The single word inside `title` set in italic. Must appear in `title`. */
  italicWord: string;
  tags: string[];
  body: string;
  plate: Media;
}

export interface Disciplines {
  intro: SectionIntro;
  items: Discipline[];
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

/* ---------------------------------------------------------------- projects */

export interface Project {
  /** 001, 002, 003 — displayed as written. */
  index: string;
  name: string;
  tagline: string;
  description: string;
  spec: {
    role: string;
    tech: string;
    year: string;
  };
  /** Optional: none of the three products has a public URL yet. When one
   *  does, the row renders as a link instead of a plain block. */
  href?: string;
}

/** Labels for the project spec list. Mongolian, so they live here. */
export interface ProjectSpecLabels {
  role: string;
  tech: string;
  year: string;
}

export interface Projects {
  intro: SectionIntro;
  specLabels: ProjectSpecLabels;
  items: Project[];
}

/* ----------------------------------------------------------------- process */

export interface ProcessStep {
  /** A real sequence, unlike the disciplines — so numbering is legitimate,
   *  and CLAUDE.md's orange rule lists step numbers as a permitted use. */
  number: string;
  title: string;
  description: string;
}

export interface Process {
  intro: SectionIntro;
  items: ProcessStep[];
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
  disciplines: Disciplines;
  pricing: Pricing;
  projects: Projects;
  process: Process;
  team: Team;
  contact: Contact;
}

export const site: Site = {
  meta: {
    title: 'Anir — Улаанбаатарын бүтээлч студи',
    description:
      'Вэб сайт, аппликейшн, постер, зураг авалт хийдэг дөрвөн хүний баг. ' +
      'Ил тод үнэ, хурдан ачаалагддаг ажил.',
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
      { label: 'Үнэ', href: '#pricing' },
      { label: 'Ажил', href: '#work' },
      { label: 'Баг', href: '#team' },
      { label: 'Холбоо +', href: '#contact', accent: true },
    ],
  },
  hero: {
    logoAlt: 'Анир агентлаг',
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
    products: [
      {
        eyebrow: 'Бүтээгдэхүүн',
        name: 'Ezmath',
        tagline: 'Математикаа бэлд',
        cta: 'Үзэх +',
        href: '#work',
      },
      {
        eyebrow: 'Бүтээгдэхүүн',
        name: 'Ethos',
        tagline: 'Зөв хандив',
        cta: 'Үзэх +',
        href: '#work',
      },
      {
        eyebrow: 'Бүтээгдэхүүн',
        name: 'Olymo',
        tagline: 'Боловсролын мэдээлэл',
        cta: 'Үзэх +',
        href: '#work',
      },
    ],
  },
  marquee: {
    text: 'Жижиг баг — Бүтэн анхаарал —',
  },
  disciplines: {
    intro: {
      label: 'Үйлчилгээ',
      eyebrow: 'Дөрвөн чиглэл',
      title: 'Бидний хийдэг зүйл',
    },
    items: [
      {
        code: 'ВЭБ',
        title: 'Хурдан ачаалагддаг сайт',
        italicWord: 'Хурдан',
        tags: ['Astro', 'Next', 'Webflow', 'CMS'],
        body:
          'Статик болгож бэлдээд ирмэг сүлжээнээс түгээдэг. Учир нь зочдын ихэнх нь ' +
          'монголын мобайл холболт дээр байдаг. Эхний ачаалалт нэг мегабайтаас доош.',
        plate: {
          name: 'plate-01',
          alt: 'Вэб төслийн дэлгэцийн бичлэг',
          width: 1280,
          height: 800,
          label: 'Плейт 01',
          format: 'Видео давталт · 720p',
        },
      },
      {
        code: 'ДИЗАЙН',
        title: 'Хэвлэлийн бүтээл',
        italicWord: 'Хэвлэлийн',
        tags: ['Постер', 'Айдентити', 'Carousel', 'Хэвлэх файл'],
        body:
          'Эхлээд үсгийн урлаг. Арга хэмжээ, шинэ бүтээгдэхүүн, кампанит ажлын постер — ' +
          'хэвлэхэд бэлэн, өнгө нь ялгагдсан файлаар хүлээлгэн өгнө.',
        plate: {
          name: 'plate-02',
          alt: 'Хөдөлгөөнт постерын давталт',
          width: 1280,
          height: 800,
          label: 'Плейт 02',
          format: 'Хөдөлгөөнт постер',
        },
      },
      {
        code: 'ЗУРАГ',
        title: 'Зураг ба видео',
        italicWord: 'видео',
        tags: ['Бүтээгдэхүүн', 'Хөрөг', 'Эвент', 'Reel'],
        body:
          'Эхлээд вэбд зориулж буудна. Багц бүр хөдөлгөөнгүй зураг, богино шахагдсан ' +
          'давталт хоёулаа болж ирнэ — хуудсанд тавихад хагас мегабайт идэхгүй.',
        plate: {
          name: 'plate-03',
          alt: 'Бүтээгдэхүүний зураг авалтын давталт',
          width: 1280,
          height: 800,
          label: 'Плейт 03',
          format: 'Видео давталт · 720p',
        },
      },
      {
        code: 'АПП',
        title: 'Аппликейшн, эхнээс нь дуустал',
        italicWord: 'дуустал',
        tags: ['React', 'Supabase', 'Нэвтрэлт', 'Төлбөр'],
        body:
          'Бид өөрсдийн гурван бүтээгдэхүүнийг гаргаад одоо ажиллуулж байна. Тань дээр ' +
          'ажиллахдаа дараа нь засварлаж арчлах талд нь суугаад ажилладаг.',
        plate: {
          name: 'plate-04',
          alt: 'Аппликейшны дэлгэцийн бичлэг',
          width: 1280,
          height: 800,
          label: 'Плейт 04',
          format: 'Дэлгэцийн бичлэг',
        },
      },
    ],
  },
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
  projects: {
    intro: {
      label: 'Ажил',
      eyebrow: 'Сонгосон ажил',
      title: 'Өөрсдийн бүтээгдэхүүн',
    },
    specLabels: {
      role: 'Үүрэг',
      tech: 'Технологи',
      year: 'Он',
    },
    items: [
      {
        index: '001',
        name: 'Ezmath',
        tagline: 'Математикаа бэлд. Шалгалтаа дав.',
        description: 'Математикийн мэдлэгээ бататгах хүртэлх таны ухаалаг туслах.',
        spec: {
          role: 'Бүтээгдэхүүн, брэнд, хөгжүүлэлт',
          tech: 'Next · Supabase',
          year: '2026',
        },
      },
      {
        index: '002',
        name: 'Ethos',
        tagline: 'Зөв хандив. Бодит тус.',
        description: 'Бодит сайн үйлсийг холбож, сайн дурын оролцоог дэмжинэ.',
        spec: {
          role: 'Бүтээгдэхүүн, хөгжүүлэлт',
          tech: 'Next · Supabase',
          year: '2026',
        },
      },
      {
        index: '003',
        name: 'Olymo',
        tagline: 'Боловсролын шинэ мэдээлэл бүхнийг нэг дороос.',
        description:
          'Олимпиад, боловсролын хамгийн хэрэгтэй мэдээллийг нэг дороос шуурхай хүргэнэ.',
        spec: {
          role: 'Бүтээгдэхүүн, эдиториал',
          tech: 'Astro · CMS',
          year: '2026',
        },
      },
    ],
  },
  process: {
    intro: {
      label: 'Гурван үе шат',
      eyebrow: 'Хэрхэн явагддаг',
      title: 'Гурван үе шат',
    },
    items: [
      {
        number: '01',
        title: 'Хэлэлцэх',
        description:
          'Нэг уулзалт, дараа нь тогтсон үнэ, хугацаа бүхий бичгэн санал. ' +
          'Хэрэв бид тохирохгүй бол яг энд хэлнэ.',
      },
      {
        number: '02',
        title: 'Хийх',
        description:
          'Эхний долоо хоногоос амьд холбоос өгнө. Төгсгөлд нь гайхшруулахыг ' +
          'хүлээхгүй, бүтэхийг нь харж явна.',
      },
      {
        number: '03',
        title: 'Хүлээлгэн өгөх',
        description:
          'Код, эх файл, заавар бүгд тань дээр очно. Юу ч бидэнд түгжигдэхгүй, ' +
          'хүсвэл дэмжлэг үргэлжилнэ.',
      },
    ],
  },
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
