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
  /** Path under /media, or null while the asset is still being shot. */
  src: string | null;
  /** Poster frame for video. Required whenever `src` is a video. */
  poster: string | null;
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
  eyebrow: string;
  heading: string;
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
    messages: {
      success: string;
      error: string;
      /** Shown when a required field is empty or malformed. */
      invalid: string;
    };
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
    title: '',
    description: '',
    ogImage: null,
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
      src: '/media/hero.webm',
      poster: '/media/hero.jpg',
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
          src: '/media/plate-01.webm',
          poster: '/media/plate-01.jpg',
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
          src: '/media/plate-02.webm',
          poster: '/media/plate-02.jpg',
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
          src: '/media/plate-03.webm',
          poster: '/media/plate-03.jpg',
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
          src: '/media/plate-04.webm',
          poster: '/media/plate-04.jpg',
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
          src: '/media/portrait-01.jpg',
          poster: null,
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
          src: '/media/portrait-02.jpg',
          poster: null,
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
          src: '/media/portrait-03.jpg',
          poster: null,
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
          src: '/media/portrait-04.jpg',
          poster: null,
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
    eyebrow: '',
    heading: '',
    email: '',
    address: [],
    form: {
      groups: [],
      fields: {
        name: { name: 'name', label: '', placeholder: '' },
        contact: { name: 'contact', label: '', placeholder: '' },
        message: { name: 'message', label: '', placeholder: '' },
      },
      submit: '',
      messages: {
        success: '',
        error: '',
        invalid: '',
      },
    },
  },
};

export default site;
