/**
 * Every word of Mongolian copy on the site lives here.
 *
 * Rules (CLAUDE.md > Conventions):
 *  - Never hardcode a Mongolian string in a component. The team proofreads this
 *    one file, not nine.
 *  - Prices are data. A non-technical person must be able to change one number
 *    here and have the site update.
 *
 * Phase 01 ships the shape only. Content lands in Phases 03–06.
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
}

export interface Link {
  label: string;
  href: string;
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
  /** The single word inside `title` set in italic. */
  italicWord: string;
  tags: string[];
  body: string;
  plate: Media;
}

/* ----------------------------------------------------------------- pricing */

export interface PriceRow {
  name: string;
  description: string;
  /** Bare number in ₮. Formatting and the currency mark are the view's job. */
  amount: number;
  /** The small line under the price — "төслөөс", "хоногт", etc. */
  unit: string;
  /** Renders an "-аас" style prefix when the figure is a starting price. */
  from?: boolean;
}

export interface PricingGroup {
  title: string;
  rows: PriceRow[];
}

export interface Pricing {
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
  href: string;
}

/* ----------------------------------------------------------------- process */

export interface ProcessStep {
  /** A real sequence, unlike the disciplines. */
  number: string;
  title: string;
  description: string;
}

/* -------------------------------------------------------------------- team */

export interface TeamMember {
  name: string;
  role: string;
  portrait: Media;
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
  disciplines: Discipline[];
  pricing: Pricing;
  projects: Project[];
  process: ProcessStep[];
  team: TeamMember[];
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
  },
  nav: {
    wordmark: 'ANIR',
    links: [
      { label: 'Үйлчилгээ', href: '#services' },
      { label: 'Үнэ', href: '#pricing' },
      { label: 'Ажил', href: '#work' },
      { label: 'Баг', href: '#team' },
      { label: 'Холбоо барих', href: '#contact', accent: true },
    ],
  },
  hero: {
    logoAlt: '',
    tagline: {
      line: '',
      lineItalic: '',
    },
    lede: '',
    video: null,
    products: [],
  },
  marquee: {
    text: '',
  },
  disciplines: [],
  pricing: {
    groups: [],
  },
  projects: [],
  process: [],
  team: [],
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
