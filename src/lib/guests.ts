/** Guest vocabulary and attendance rules (pure, client-safe). */

export const GUEST_RSVP_STATUSES = ["PENDING", "ATTENDING", "MAYBE", "DECLINED"] as const;
export type GuestRsvpStatusValue = (typeof GUEST_RSVP_STATUSES)[number];

export const GUEST_RSVP_LABEL: Record<GuestRsvpStatusValue, string> = {
  PENDING: "Belum merespons",
  ATTENDING: "Hadir",
  MAYBE: "Mungkin hadir",
  DECLINED: "Tidak hadir",
};

export const GUEST_INVITATION_STATUSES = ["NOT_SENT", "SENT", "OPENED", "FOLLOW_UP"] as const;
export type GuestInvitationStatusValue = (typeof GUEST_INVITATION_STATUSES)[number];

export const GUEST_INVITATION_LABEL: Record<GuestInvitationStatusValue, string> = {
  NOT_SENT: "Belum dikirim",
  SENT: "Terkirim",
  OPENED: "Dibuka",
  FOLLOW_UP: "Perlu follow up",
};

/** "Dibuka" is only set by real open tracking (public invitation), never by hand. */
export const EDITABLE_INVITATION_STATUSES = ["NOT_SENT", "SENT", "FOLLOW_UP"] as const;
export type EditableInvitationStatus = (typeof EDITABLE_INVITATION_STATUSES)[number];

export const MAX_SEATS_PER_INVITATION = 50;

/** Indonesian phone → digits with country code: "0812-3456-7890" → "6281234567890". */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("0")) digits = `62${digits.slice(1)}`;
  else if (digits.startsWith("8")) digits = `62${digits}`;
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

/** Comparison key for names: trimmed, single-spaced, lowercase. */
export function normalizeGuestName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLocaleLowerCase("id");
}

/** Only "Hadir" and "Mungkin" carry an attending count; other statuses always count 0. */
export function normalizeAttendance(rsvpStatus: GuestRsvpStatusValue, attendingCount: number): number {
  return rsvpStatus === "ATTENDING" || rsvpStatus === "MAYBE" ? attendingCount : 0;
}

/** RSVP rule: attending_count <= seat_count (and at least 1 when attending). */
export function attendanceError(rsvpStatus: GuestRsvpStatusValue, attendingCount: number, seatCount: number): string | null {
  const count = normalizeAttendance(rsvpStatus, attendingCount);
  if (!Number.isInteger(count) || count < 0) return "Jumlah hadir tidak valid";
  if (count > seatCount) return `Jumlah hadir tidak boleh melebihi ${seatCount} kursi`;
  if (rsvpStatus === "ATTENDING" && count < 1) return "Isi jumlah yang hadir (minimal 1)";
  return null;
}

/** Keeps "Dibuka" when a planner re-marks an opened invitation as sent. */
export function nextInvitationStatus(
  current: GuestInvitationStatusValue,
  requested: EditableInvitationStatus,
): GuestInvitationStatusValue {
  return current === "OPENED" && requested === "SENT" ? "OPENED" : requested;
}
