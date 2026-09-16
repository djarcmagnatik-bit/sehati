/** RSVP and guestbook vocabulary shared by the public pages and the planner (pure, client-safe). */
import { GUEST_RSVP_LABEL, type GuestRsvpStatusValue } from "@/lib/guests";

/** "Belum merespons" is a planner state, never something a guest picks. */
export const RSVP_CHOICES = ["ATTENDING", "MAYBE", "DECLINED"] as const;
export type RsvpChoice = (typeof RSVP_CHOICES)[number];

export const RSVP_CHOICE_LABEL: Record<RsvpChoice, string> = {
  ATTENDING: "Ya, saya hadir",
  MAYBE: "Masih ragu",
  DECLINED: "Maaf, berhalangan",
};

export const RSVP_CHOICE_HINT: Record<RsvpChoice, string> = {
  ATTENDING: "Kami menyiapkan tempat untuk kamu.",
  MAYBE: "Kabari lagi kalau sudah pasti, ya.",
  DECLINED: "Terima kasih sudah mengabari.",
};

export function rsvpStatusLabel(status: GuestRsvpStatusValue): string {
  return GUEST_RSVP_LABEL[status];
}

export const WISH_NAME_MAX = 80;
export const WISH_MESSAGE_MAX = 1000;
export const WISHES_PAGE_SIZE = 20;
/** How many wishes the public page shows before asking for "muat lebih banyak". */
export const PUBLIC_WISHES_LIMIT = 30;

export const WISH_STATUSES = ["VISIBLE", "HIDDEN"] as const;
export type WishStatusValue = (typeof WISH_STATUSES)[number];
export const WISH_STATUS_LABEL: Record<WishStatusValue, string> = {
  VISIBLE: "Tampil",
  HIDDEN: "Disembunyikan",
};

/** Summary sentence for a guest who already answered. */
export function describeRsvp(status: GuestRsvpStatusValue, attendingCount: number): string {
  if (status === "ATTENDING") return `Kamu sudah konfirmasi hadir untuk ${attendingCount} orang.`;
  if (status === "MAYBE") return attendingCount > 0 ? `Kamu menjawab mungkin hadir (${attendingCount} orang).` : "Kamu menjawab mungkin hadir.";
  if (status === "DECLINED") return "Kamu menjawab berhalangan hadir.";
  return "Kamu belum mengonfirmasi kehadiran.";
}
