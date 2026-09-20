/**
 * Original invitation themes. A theme is only presentation: colors, typography, decoration and
 * cover layout. Content never depends on it, so switching themes cannot lose data.
 */

export const COVER_LAYOUTS = ["center", "bottom", "split"] as const;
export type CoverLayout = (typeof COVER_LAYOUTS)[number];
export const COVER_LAYOUT_LABEL: Record<CoverLayout, string> = {
  center: "Judul di tengah",
  bottom: "Judul di bawah",
  split: "Dua kolom",
};

export type ThemeTokens = {
  /** Page background behind the invitation card. */
  background: string;
  surface: string;
  ink: string;
  muted: string;
  accent: string;
  accentSoft: string;
  border: string;
  coverOverlay: string;
  coverInk: string;
  displayFont: string;
  bodyFont: string;
  radius: string;
  /** Decorative band drawn behind section headings. */
  ornament: string;
};

/** Decoration drawn under section headings (and above the cover title for the non-line motifs). */
export const THEME_MOTIFS = ["line", "bow", "squiggle", "sparkle", "film", "sprig"] as const;
export type ThemeMotif = (typeof THEME_MOTIFS)[number];
/** Frame for gallery photos. */
export const PHOTO_SHAPES = ["rounded", "arch", "polaroid"] as const;
export type PhotoShape = (typeof PHOTO_SHAPES)[number];
/** How cards (events, gift accounts) are drawn. */
export const CARD_STYLES = ["soft", "ink", "pop", "lace"] as const;
export type CardStyle = (typeof CARD_STYLES)[number];

/**
 * Character beyond colors. Every field is optional; the defaults reproduce the original look, so
 * older themes need none of it.
 */
export type ThemeStyle = {
  headingWeight?: number;
  headingStyle?: "normal" | "italic";
  headingCase?: "none" | "uppercase";
  headingTracking?: string;
  /** Small uppercase labels (cover prefix, "Kepada Yth.", time labels). Defaults to the body font. */
  labelFont?: string;
  card?: CardStyle;
  photo?: PhotoShape;
  motif?: ThemeMotif;
  /** Film-grain texture over the cover. */
  grain?: boolean;
  /** Line-drawn botanical sprigs in the cover corners, swaying gently. */
  corners?: boolean;
};

export type InvitationTheme = {
  code: string;
  name: string;
  description: string;
  defaultCoverLayout: CoverLayout;
  tokens: ThemeTokens;
  style?: ThemeStyle;
};

const SERIF = '"Fraunces", ui-serif, Georgia, serif';
const SANS = '"Plus Jakarta Sans", ui-sans-serif, system-ui, sans-serif';
// Invitation-only fonts, loaded by components/invitation/invitation-fonts.ts.
const INSTRUMENT = '"Instrument Serif", ui-serif, Georgia, serif';
const CORMORANT = '"Cormorant Garamond", ui-serif, Georgia, serif';
const BRICOLAGE = '"Bricolage Grotesque", ui-sans-serif, system-ui, sans-serif';
const DM_SERIF = '"DM Serif Display", ui-serif, Georgia, serif';
const MONO = '"Space Mono", ui-monospace, SFMono-Regular, monospace';

export const INVITATION_THEMES: readonly InvitationTheme[] = [
  {
    code: "minimal",
    name: "Minimal",
    description: "Putih bersih, banyak ruang kosong, tipografi tenang.",
    defaultCoverLayout: "center",
    tokens: {
      background: "#f7f6f3",
      surface: "#ffffff",
      ink: "#1f1d1b",
      muted: "#6f6a64",
      accent: "#9a8873",
      accentSoft: "#efeae3",
      border: "#e5e0d8",
      coverOverlay: "linear-gradient(180deg, rgba(31,29,27,0.08) 0%, rgba(31,29,27,0.55) 100%)",
      coverInk: "#ffffff",
      displayFont: SERIF,
      bodyFont: SANS,
      radius: "1.25rem",
      ornament: "linear-gradient(90deg, transparent, #cfc6b8, transparent)",
    },
  },
  {
    code: "elegant",
    name: "Elegan",
    description: "Krem hangat dengan aksen emas tua.",
    defaultCoverLayout: "bottom",
    tokens: {
      background: "#f3ece1",
      surface: "#fffdf9",
      ink: "#2b2418",
      muted: "#6d6150",
      accent: "#a8874a",
      accentSoft: "#f0e5cf",
      border: "#e0d3ba",
      coverOverlay: "linear-gradient(180deg, rgba(43,36,24,0.10) 0%, rgba(43,36,24,0.62) 100%)",
      coverInk: "#fffdf9",
      displayFont: SERIF,
      bodyFont: SANS,
      radius: "1.5rem",
      ornament: "linear-gradient(90deg, transparent, #c8a86a, transparent)",
    },
  },
  {
    code: "floral",
    name: "Floral",
    description: "Nuansa merah muda lembut dengan ornamen bunga.",
    defaultCoverLayout: "center",
    tokens: {
      background: "#fdf3f3",
      surface: "#fffafa",
      ink: "#3a2328",
      muted: "#7c5b62",
      accent: "#c2707f",
      accentSoft: "#fae3e6",
      border: "#f0d3d7",
      coverOverlay: "linear-gradient(180deg, rgba(58,35,40,0.08) 0%, rgba(58,35,40,0.58) 100%)",
      coverInk: "#fffafa",
      displayFont: SERIF,
      bodyFont: SANS,
      radius: "1.75rem",
      ornament: "linear-gradient(90deg, transparent, #e2a9b3, transparent)",
    },
  },
  {
    code: "traditional",
    name: "Tradisional",
    description: "Cokelat tanah dan merah bata, terasa adat tanpa meniru desain pihak lain.",
    defaultCoverLayout: "bottom",
    tokens: {
      background: "#f4ece3",
      surface: "#fdf8f1",
      ink: "#31211a",
      muted: "#6c5245",
      accent: "#9c4a2b",
      accentSoft: "#f3ddd0",
      border: "#e3cdbb",
      coverOverlay: "linear-gradient(180deg, rgba(49,33,26,0.12) 0%, rgba(49,33,26,0.66) 100%)",
      coverInk: "#fdf8f1",
      displayFont: SERIF,
      bodyFont: SANS,
      radius: "1rem",
      ornament: "repeating-linear-gradient(90deg, #b4674a 0 10px, transparent 10px 20px)",
    },
  },
  {
    code: "modern",
    name: "Modern",
    description: "Kontras tinggi, garis tegas, tipografi sans-serif.",
    defaultCoverLayout: "split",
    tokens: {
      background: "#eef1f4",
      surface: "#ffffff",
      ink: "#12181f",
      muted: "#5b6672",
      accent: "#1f6feb",
      accentSoft: "#e3edfd",
      border: "#d7dee6",
      coverOverlay: "linear-gradient(120deg, rgba(18,24,31,0.72) 0%, rgba(18,24,31,0.18) 100%)",
      coverInk: "#ffffff",
      displayFont: SANS,
      bodyFont: SANS,
      radius: "0.75rem",
      ornament: "linear-gradient(90deg, #1f6feb, transparent)",
    },
  },
  {
    code: "dark-luxury",
    name: "Dark Luxury",
    description: "Latar gelap dengan aksen emas, cocok untuk acara malam.",
    defaultCoverLayout: "center",
    tokens: {
      background: "#101014",
      surface: "#1a1a20",
      ink: "#f3efe7",
      muted: "#a49c8d",
      accent: "#d4b169",
      accentSoft: "#2a2620",
      border: "#2f2c33",
      coverOverlay: "linear-gradient(180deg, rgba(8,8,10,0.30) 0%, rgba(8,8,10,0.82) 100%)",
      coverInk: "#f6f1e6",
      displayFont: SERIF,
      bodyFont: SANS,
      radius: "1.25rem",
      ornament: "linear-gradient(90deg, transparent, #d4b169, transparent)",
    },
  },
  {
    code: "playful",
    name: "Playful",
    description: "Warna cerah dan bentuk membulat untuk suasana santai.",
    defaultCoverLayout: "center",
    tokens: {
      background: "#fff6ec",
      surface: "#ffffff",
      ink: "#2a2438",
      muted: "#6b6280",
      accent: "#f2784b",
      accentSoft: "#ffe6d8",
      border: "#f4ddcb",
      coverOverlay: "linear-gradient(180deg, rgba(42,36,56,0.05) 0%, rgba(42,36,56,0.55) 100%)",
      coverInk: "#ffffff",
      displayFont: SANS,
      bodyFont: SANS,
      radius: "2rem",
      ornament: "repeating-linear-gradient(90deg, #f2784b 0 6px, transparent 6px 14px)",
    },
  },
  {
    code: "islamic",
    name: "Islami",
    description: "Hijau tenang dengan ornamen geometris, ruang lapang untuk doa.",
    defaultCoverLayout: "bottom",
    tokens: {
      background: "#eef3ee",
      surface: "#fbfdfa",
      ink: "#1b2a22",
      muted: "#5c6f63",
      accent: "#2f6b4f",
      accentSoft: "#dcebe1",
      border: "#cddcd2",
      coverOverlay: "linear-gradient(180deg, rgba(27,42,34,0.10) 0%, rgba(27,42,34,0.62) 100%)",
      coverInk: "#fbfdfa",
      displayFont: SERIF,
      bodyFont: SANS,
      radius: "1.5rem",
      ornament: "repeating-linear-gradient(45deg, #2f6b4f 0 4px, transparent 4px 12px)",
    },
  },
  {
    code: "javanese",
    name: "Jawa Kontemporer",
    description: "Sogan cokelat keemasan dengan motif garis, tafsir baru gaya Jawa.",
    defaultCoverLayout: "split",
    tokens: {
      background: "#f2ebdd",
      surface: "#fbf6ea",
      ink: "#2e2416",
      muted: "#6b5b3e",
      accent: "#8a6321",
      accentSoft: "#eadfc4",
      border: "#ddcdaa",
      coverOverlay: "linear-gradient(180deg, rgba(46,36,22,0.12) 0%, rgba(46,36,22,0.68) 100%)",
      coverInk: "#fbf6ea",
      displayFont: SERIF,
      bodyFont: SANS,
      radius: "0.5rem",
      ornament: "repeating-linear-gradient(135deg, #8a6321 0 3px, transparent 3px 9px)",
    },
  },

  // ─── 2026 themes (Gen Z directions: typography-led, coquette, color play, scribble, flash film) ───
  {
    code: "editorial",
    name: "Editorial",
    description: "Seperti sampul majalah: serif besar, hitam-gading, aksen mocha, banyak ruang kosong.",
    defaultCoverLayout: "bottom",
    tokens: {
      background: "#f5f0e8",
      surface: "#fbf8f2",
      ink: "#1a1a1a",
      muted: "#5e5850",
      accent: "#6b4f3a",
      accentSoft: "#e9e0d3",
      border: "#1a1a1a",
      coverOverlay: "linear-gradient(180deg, rgba(26,26,26,0) 35%, rgba(26,26,26,0.72) 100%)",
      coverInk: "#fbf8f2",
      displayFont: INSTRUMENT,
      bodyFont: SANS,
      radius: "0",
      ornament: "linear-gradient(90deg, #1a1a1a, #1a1a1a)",
    },
    style: { headingWeight: 400, headingTracking: "-0.01em", card: "ink", photo: "rounded", motif: "line" },
  },
  {
    code: "coquette",
    name: "Coquette",
    description: "Pita, renda, dan merah muda pucat. Romantis, manis, sedikit vintage.",
    defaultCoverLayout: "center",
    tokens: {
      background: "#fff6f3",
      surface: "#fffbf9",
      ink: "#4a2a33",
      muted: "#7d5c64",
      accent: "#a14b63",
      accentSoft: "#f8dfe3",
      border: "#efc9d1",
      coverOverlay: "linear-gradient(180deg, rgba(74,42,51,0.05) 0%, rgba(74,42,51,0.55) 100%)",
      coverInk: "#fffbf9",
      displayFont: CORMORANT,
      bodyFont: SANS,
      radius: "1.5rem",
      ornament: "linear-gradient(90deg, transparent, #e3a4b3, transparent)",
    },
    style: { headingWeight: 600, headingStyle: "italic", card: "lace", photo: "arch", motif: "bow" },
  },
  {
    code: "pop",
    name: "Retro Pop",
    description: "Kobalt dan peach yang berani, kartu bergaris tebal ala stiker. Ceria dan percaya diri.",
    defaultCoverLayout: "center",
    tokens: {
      background: "#fff1e6",
      surface: "#ffffff",
      ink: "#111111",
      muted: "#4d4640",
      accent: "#2b4eff",
      accentSoft: "#ffd3b8",
      border: "#111111",
      coverOverlay: "linear-gradient(180deg, rgba(17,17,17,0.05) 0%, rgba(17,17,17,0.6) 100%)",
      coverInk: "#ffffff",
      displayFont: BRICOLAGE,
      bodyFont: SANS,
      radius: "1rem",
      ornament: "repeating-linear-gradient(90deg, #2b4eff 0 10px, transparent 10px 16px)",
    },
    style: { headingWeight: 800, headingTracking: "-0.02em", card: "pop", photo: "rounded", motif: "sparkle" },
  },
  {
    code: "butter",
    name: "Butter Garden",
    description: "Kuning mentega, sage, dan blush dengan garis coretan tangan. Ringan seperti pesta taman.",
    defaultCoverLayout: "center",
    tokens: {
      background: "#fbf5dc",
      surface: "#fffdf4",
      ink: "#34362a",
      muted: "#5f6352",
      accent: "#5d7355",
      accentSoft: "#f3e6ad",
      border: "#e3d9ac",
      coverOverlay: "linear-gradient(180deg, rgba(52,54,42,0.05) 0%, rgba(52,54,42,0.55) 100%)",
      coverInk: "#fffdf4",
      displayFont: DM_SERIF,
      bodyFont: SANS,
      radius: "2rem",
      ornament: "linear-gradient(90deg, transparent, #9bad94, transparent)",
    },
    style: { headingWeight: 400, card: "soft", photo: "arch", motif: "squiggle" },
  },
  {
    code: "film",
    name: "Film Flash",
    description: "Gelap dengan butiran film, foto bergaya polaroid, dan huruf mesin tik. Candid dan sinematik.",
    defaultCoverLayout: "bottom",
    tokens: {
      background: "#141312",
      surface: "#1d1c1a",
      ink: "#f2ede4",
      muted: "#b3aa9c",
      accent: "#f5b82e",
      accentSoft: "#2a2723",
      border: "#3a3631",
      coverOverlay: "linear-gradient(180deg, rgba(20,19,18,0.15) 0%, rgba(20,19,18,0.85) 100%)",
      coverInk: "#f2ede4",
      displayFont: INSTRUMENT,
      bodyFont: SANS,
      radius: "0.25rem",
      ornament: "linear-gradient(90deg, #f5b82e, transparent)",
    },
    style: { headingWeight: 400, headingStyle: "italic", labelFont: MONO, card: "soft", photo: "polaroid", motif: "film", grain: true },
  },
  // ─── Popular Indonesian digital-invitation looks (boho dried flowers, dusty blue florals) ───
  {
    code: "boho",
    name: "Boho Rustic",
    description: "Nuansa bunga kering dan pampas: krem hangat, terakota, dan dusty rose.",
    defaultCoverLayout: "center",
    tokens: {
      background: "#f6efe6",
      surface: "#fdf9f3",
      ink: "#3e2f25",
      muted: "#6b5a4d",
      accent: "#8f5236",
      accentSoft: "#efe1d1",
      border: "#e2d1bd",
      coverOverlay: "linear-gradient(180deg, rgba(62,47,37,0.05) 0%, rgba(62,47,37,0.55) 100%)",
      coverInk: "#fdf9f3",
      displayFont: CORMORANT,
      bodyFont: SANS,
      radius: "1.25rem",
      ornament: "linear-gradient(90deg, transparent, #c9a58a, transparent)",
    },
    style: { headingWeight: 600, headingStyle: "italic", card: "soft", photo: "arch", motif: "sprig", corners: true },
  },
  {
    code: "dusty-blue",
    name: "Dusty Blue",
    description: "Biru pudar, putih, dan perak dengan sulur bunga. Tenang dan anggun.",
    defaultCoverLayout: "center",
    tokens: {
      background: "#eef2f6",
      surface: "#fbfcfd",
      ink: "#1f2d3a",
      muted: "#526374",
      accent: "#3f607f",
      accentSoft: "#dde6ef",
      border: "#cfdae5",
      coverOverlay: "linear-gradient(180deg, rgba(31,45,58,0.05) 0%, rgba(31,45,58,0.55) 100%)",
      coverInk: "#fbfcfd",
      displayFont: DM_SERIF,
      bodyFont: SANS,
      radius: "1.5rem",
      ornament: "linear-gradient(90deg, transparent, #9fb4c8, transparent)",
    },
    style: { headingWeight: 400, card: "soft", photo: "rounded", motif: "sprig", corners: true },
  },
];

const CARD_CSS: Record<CardStyle, { border: string; shadow: string }> = {
  soft: { border: "1px solid var(--inv-border)", shadow: "none" },
  ink: { border: "1px solid var(--inv-ink)", shadow: "none" },
  pop: { border: "2px solid var(--inv-ink)", shadow: "4px 4px 0 var(--inv-ink)" },
  lace: { border: "1.5px dashed var(--inv-accent)", shadow: "0 0 0 4px var(--inv-surface), 0 0 0 5px var(--inv-border)" },
};

/** The theme's style with every default filled in. */
export function themeLook(theme: InvitationTheme): Required<Omit<ThemeStyle, "labelFont">> & { labelFont: string } {
  const style = theme.style ?? {};
  return {
    headingWeight: style.headingWeight ?? 600,
    headingStyle: style.headingStyle ?? "normal",
    headingCase: style.headingCase ?? "none",
    headingTracking: style.headingTracking ?? "normal",
    labelFont: style.labelFont ?? theme.tokens.bodyFont,
    card: style.card ?? "soft",
    photo: style.photo ?? "rounded",
    motif: style.motif ?? "line",
    grain: style.grain ?? false,
    corners: style.corners ?? false,
  };
}

export const DEFAULT_THEME_CODE = "minimal";

export function getTheme(code: string): InvitationTheme {
  return INVITATION_THEMES.find((theme) => theme.code === code) ?? INVITATION_THEMES[0]!;
}

export function isThemeCode(code: string): boolean {
  return INVITATION_THEMES.some((theme) => theme.code === code);
}

/** Inline CSS variables for one theme, applied to the invitation root element. */
export function themeStyle(theme: InvitationTheme): Record<string, string> {
  const { tokens } = theme;
  const look = themeLook(theme);
  const card = CARD_CSS[look.card];
  return {
    "--inv-heading-weight": String(look.headingWeight),
    "--inv-heading-style": look.headingStyle,
    "--inv-heading-case": look.headingCase,
    "--inv-heading-tracking": look.headingTracking,
    "--inv-label-font": look.labelFont,
    "--inv-card-border": card.border,
    "--inv-card-shadow": card.shadow,
    "--inv-background": tokens.background,
    "--inv-surface": tokens.surface,
    "--inv-ink": tokens.ink,
    "--inv-muted": tokens.muted,
    "--inv-accent": tokens.accent,
    "--inv-accent-soft": tokens.accentSoft,
    "--inv-border": tokens.border,
    "--inv-cover-overlay": tokens.coverOverlay,
    "--inv-cover-ink": tokens.coverInk,
    "--inv-display-font": tokens.displayFont,
    "--inv-body-font": tokens.bodyFont,
    "--inv-radius": tokens.radius,
    "--inv-ornament": tokens.ornament,
  };
}
