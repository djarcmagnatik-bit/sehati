/** Vendor vocabulary and safe link helpers (pure, client-safe). */

export const VENDOR_RESEARCH_STATUSES = [
  "RESEARCHING",
  "CONTACTED",
  "MEETING",
  "SHORTLISTED",
  "REJECTED",
  "SELECTED",
] as const;
export type VendorResearchStatusValue = (typeof VENDOR_RESEARCH_STATUSES)[number];

export const VENDOR_RESEARCH_STATUS_LABEL: Record<VendorResearchStatusValue, string> = {
  RESEARCHING: "Riset",
  CONTACTED: "Sudah dihubungi",
  MEETING: "Jadwal meeting",
  SHORTLISTED: "Kandidat kuat",
  REJECTED: "Tidak dipilih",
  SELECTED: "Dipilih",
};

/** Statuses a person can set manually; SELECTED is only reached through booking. */
export const EDITABLE_RESEARCH_STATUSES = VENDOR_RESEARCH_STATUSES.filter(
  (status): status is Exclude<VendorResearchStatusValue, "SELECTED"> => status !== "SELECTED",
);

export const MAX_COMPARE_VENDORS = 4;

/**
 * wa.me link from an Indonesian phone number: "0812-3456-7890" / "+62 812…" / "812…" → https://wa.me/62812…
 * Returns null when the number is not plausible.
 */
export function whatsappLink(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("0")) digits = `62${digits.slice(1)}`;
  else if (digits.startsWith("8")) digits = `62${digits}`;
  if (digits.length < 9 || digits.length > 15) return null;
  return `https://wa.me/${digits}`;
}

export function instagramUrl(handle: string | null | undefined): string | null {
  if (!handle || !/^[A-Za-z0-9._]{1,30}$/.test(handle)) return null;
  return `https://instagram.com/${handle}`;
}

/** Only http(s) URLs may be rendered as links (blocks javascript:, data:, etc.). */
export function safeExternalUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Accepts "abc.com", "https://abc.com/x"; returns a normalized https?:// URL or null. */
export function normalizeWebsite(value: string): string | null {
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`;
  const safe = safeExternalUrl(candidate);
  if (!safe) return null;
  return new URL(safe).hostname.includes(".") ? safe : null;
}

/** "@abc.def" / "instagram.com/abc.def" / "abc.def" → "abc.def" */
export function normalizeInstagram(value: string): string {
  return value
    .trim()
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
    .replace(/^@/, "")
    .replace(/\/+$/, "");
}

export function ratingLabel(rating: number | null | undefined): string {
  if (!rating) return "Belum dinilai";
  return `${"★".repeat(rating)}${"☆".repeat(5 - rating)} (${rating}/5)`;
}
