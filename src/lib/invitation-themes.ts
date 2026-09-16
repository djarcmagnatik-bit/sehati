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

export type InvitationTheme = {
  code: string;
  name: string;
  description: string;
  defaultCoverLayout: CoverLayout;
  tokens: ThemeTokens;
};

const SERIF = '"Fraunces", ui-serif, Georgia, serif';
const SANS = '"Plus Jakarta Sans", ui-sans-serif, system-ui, sans-serif';

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
];

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
  return {
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
