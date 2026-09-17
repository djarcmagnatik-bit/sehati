/** PWA constants shared by the manifest, icon routes and metadata (pure). */

export const PWA_THEME_COLOR = "#fdfbf8";
export const PWA_BACKGROUND_COLOR = "#fdfbf8";

export const PWA_ICON_VARIANTS = {
  "192": { size: 192, maskable: false },
  "512": { size: 512, maskable: false },
  "maskable-512": { size: 512, maskable: true },
  apple: { size: 180, maskable: false },
} as const;

export type PwaIconVariant = keyof typeof PWA_ICON_VARIANTS;

export function isPwaIconVariant(value: string): value is PwaIconVariant {
  return Object.hasOwn(PWA_ICON_VARIANTS, value);
}

export const pwaIconPath = (variant: PwaIconVariant) => `/pwa-icon/${variant}`;
