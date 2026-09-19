import { Bricolage_Grotesque, Cormorant_Garamond, DM_Serif_Display, Instrument_Serif, Space_Mono } from "next/font/google";

/**
 * Fonts used only by invitation themes. Declared here (not in the root layout) so the rest of the app
 * never loads them; `preload: false` lets the browser fetch just the fonts the chosen theme uses.
 * Themes refer to them by family name (see invitation-themes.ts); next/font registers the real names.
 */
const instrumentSerif = Instrument_Serif({ weight: "400", style: ["normal", "italic"], subsets: ["latin"], display: "swap", preload: false, variable: "--font-instrument-serif" });
const cormorant = Cormorant_Garamond({ weight: ["500", "600"], style: ["normal", "italic"], subsets: ["latin"], display: "swap", preload: false, variable: "--font-cormorant" });
const bricolage = Bricolage_Grotesque({ weight: ["500", "700", "800"], subsets: ["latin"], display: "swap", preload: false, variable: "--font-bricolage" });
const dmSerif = DM_Serif_Display({ weight: "400", style: ["normal", "italic"], subsets: ["latin"], display: "swap", preload: false, variable: "--font-dm-serif" });
const spaceMono = Space_Mono({ weight: ["400", "700"], subsets: ["latin"], display: "swap", preload: false, variable: "--font-space-mono" });

/** Put on the element that renders an invitation (or theme previews) so the @font-face rules ship with it. */
export const invitationFontsClassName = [instrumentSerif, cormorant, bricolage, dmSerif, spaceMono].map((font) => font.variable).join(" ");
