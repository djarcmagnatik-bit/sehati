/** Invitation vocabulary: sections, slugs and public links (pure, client-safe). */

export const INVITATION_SECTION_TYPES = [
  "COVER",
  "COUPLE",
  "QUOTE",
  "EVENTS",
  "COUNTDOWN",
  "LOVE_STORY",
  "GALLERY",
  "LOCATION",
  "RSVP",
  "WISHES",
  "GIFT",
  "CLOSING",
] as const;
export type InvitationSectionTypeValue = (typeof INVITATION_SECTION_TYPES)[number];

export const SECTION_LABEL: Record<InvitationSectionTypeValue, string> = {
  COVER: "Sampul",
  COUPLE: "Mempelai",
  QUOTE: "Kutipan",
  EVENTS: "Acara",
  COUNTDOWN: "Hitung mundur",
  LOVE_STORY: "Cerita cinta",
  GALLERY: "Galeri",
  LOCATION: "Lokasi",
  RSVP: "Konfirmasi kehadiran",
  WISHES: "Ucapan & doa",
  GIFT: "Hadiah digital",
  CLOSING: "Penutup",
};

export const SECTION_DESCRIPTION: Record<InvitationSectionTypeValue, string> = {
  COVER: "Halaman pembuka dengan nama mempelai, tanggal, dan nama tamu.",
  COUPLE: "Nama lengkap kedua mempelai beserta nama orang tua.",
  QUOTE: "Kutipan atau ayat pembuka.",
  EVENTS: "Akad, resepsi, dan acara lain beserta waktunya.",
  COUNTDOWN: "Hitung mundur menuju hari pernikahan.",
  LOVE_STORY: "Perjalanan kalian berdua dalam beberapa momen.",
  GALLERY: "Foto prewedding atau momen pilihan.",
  LOCATION: "Alamat lengkap dan tautan peta acara.",
  RSVP: "Formulir konfirmasi kehadiran tamu (aktif pada tahap RSVP).",
  WISHES: "Ucapan dan doa dari tamu (aktif pada tahap RSVP).",
  GIFT: "Informasi rekening dan alamat kirim hadiah.",
  CLOSING: "Ucapan terima kasih di akhir undangan.",
};

/** RSVP and wishes need the public submission flow, which is not built yet. */
export const SECTIONS_NOT_YET_INTERACTIVE: readonly InvitationSectionTypeValue[] = ["RSVP", "WISHES"];

/** Sections whose body comes from other tables; they have no text content of their own to edit. */
export const SECTIONS_WITHOUT_BODY: readonly InvitationSectionTypeValue[] = ["COUNTDOWN"];

export const INVITATION_STATUSES = ["DRAFT", "PUBLISHED"] as const;
export type InvitationStatusValue = (typeof INVITATION_STATUSES)[number];
export const INVITATION_STATUS_LABEL: Record<InvitationStatusValue, string> = {
  DRAFT: "Draf",
  PUBLISHED: "Terbit",
};

export const GIFT_ACCOUNT_TYPES = ["BANK", "EWALLET"] as const;
export type GiftAccountTypeValue = (typeof GIFT_ACCOUNT_TYPES)[number];
export const GIFT_ACCOUNT_LABEL: Record<GiftAccountTypeValue, string> = {
  BANK: "Rekening bank",
  EWALLET: "Dompet digital",
};

export const SLUG_MIN_LENGTH = 3;
export const SLUG_MAX_LENGTH = 60;

/**
 * Slugs live at the site root namespace (/undangan/{slug}), so a few words are kept for the app
 * itself and for anything that could look like an official page.
 */
export const RESERVED_SLUGS: readonly string[] = [
  "admin",
  "api",
  "app",
  "auth",
  "dashboard",
  "demo",
  "guests",
  "help",
  "invite",
  "login",
  "logout",
  "media",
  "new",
  "preview",
  "register",
  "rsvp",
  "sehati",
  "settings",
  "support",
  "undangan",
];

/** "Fajar & Putri!" → "fajar-putri". Diacritics are folded so Indonesian names stay readable. */
export function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/-+$/g, "");
}

export function slugError(slug: string): string | null {
  if (slug.length < SLUG_MIN_LENGTH) return `Alamat undangan minimal ${SLUG_MIN_LENGTH} karakter`;
  if (slug.length > SLUG_MAX_LENGTH) return `Alamat undangan maksimal ${SLUG_MAX_LENGTH} karakter`;
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return "Gunakan huruf kecil, angka, dan tanda hubung saja";
  if (RESERVED_SLUGS.includes(slug)) return "Alamat undangan ini sudah dipakai sistem";
  return null;
}

/** Fallback slug for a new invitation, e.g. "putri-fajar". */
export function suggestSlug(brideName: string, groomName: string): string {
  const base = slugify(`${brideName} ${groomName}`) || "undangan-kami";
  return base.length >= SLUG_MIN_LENGTH ? base : `${base}-wedding`;
}

export function invitationPath(slug: string): string {
  return `/undangan/${slug}`;
}

/** Personalized link: the token identifies the guest, so no name ever appears in the URL. */
export function guestInvitationPath(token: string): string {
  return `/i/${token}`;
}

export function absoluteUrl(appUrl: string, path: string): string {
  return `${appUrl.replace(/\/+$/, "")}${path}`;
}

/** WhatsApp share text for one guest. */
export function whatsappShareUrl(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}
