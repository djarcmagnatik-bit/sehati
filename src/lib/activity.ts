/** Activity feed vocabulary and presentation (pure, client-safe). */
import { formatDateTime, formatIsoDateLong, isValidIsoDate } from "@/lib/dates";
import { GUEST_INVITATION_LABEL, type GuestInvitationStatusValue } from "@/lib/guests";
import { GIFT_ITEM_STATUS_LABEL, type GiftItemStatusValue } from "@/lib/planning";
import { formatRupiah } from "@/lib/money";
import { VENDOR_RESEARCH_STATUS_LABEL, type VendorResearchStatusValue } from "@/lib/vendors";

export const ACTIVITY_ACTIONS = [
  "wedding.created",
  "wedding.date_changed",
  "couple_note.updated",
  "checklist.generated",
  "task.created",
  "task.updated",
  "task.completed",
  "task.reopened",
  "task.deleted",
  "partner.invited",
  "partner.invitation_revoked",
  "partner.invitation_declined",
  "partner.joined",
  "partner.removed",
  "budget.initialized",
  "budget.settings_updated",
  "budget.category_created",
  "budget.category_updated",
  "budget.category_deleted",
  "expense.created",
  "expense.updated",
  "expense.deleted",
  "payment.recorded",
  "payment.deleted",
  "vendor_research.created",
  "vendor_research.updated",
  "vendor_research.deleted",
  "vendor.booked",
  "vendor.created",
  "vendor.updated",
  "vendor.deleted",
  "guests.groups_initialized",
  "guest_group.created",
  "guest_group.updated",
  "guest_group.deleted",
  "guest.created",
  "guest.updated",
  "guest.deleted",
  "guests.imported",
  "guests.bulk_status_updated",
  "invitation.created",
  "invitation.settings_updated",
  "invitation.theme_changed",
  "invitation.section_updated",
  "invitation.sections_reordered",
  "invitation.published",
  "invitation.unpublished",
  "wedding_event.created",
  "wedding_event.updated",
  "wedding_event.deleted",
  "love_story.created",
  "love_story.updated",
  "love_story.deleted",
  "gallery.image_added",
  "gallery.image_removed",
  "gift_account.created",
  "gift_account.updated",
  "gift_account.deleted",
  "rsvp.received",
  "wish.received",
  "wish.hidden",
  "wish.restored",
  "wish.deleted",
  "savings.recorded",
  "savings.updated",
  "savings.deleted",
  "savings.target_updated",
  "seserahan.item_created",
  "seserahan.item_updated",
  "seserahan.item_deleted",
  "rundown.item_created",
  "rundown.item_updated",
  "rundown.item_deleted",
  "calendar.event_created",
  "calendar.event_updated",
  "calendar.event_deleted",
  "invitation.music_updated",
  "billing.payment_paid",
  "billing.payment_refunded",
  "billing.promo_redeemed",
  "data.exported",
] as const;

export type ActivityAction = (typeof ACTIVITY_ACTIONS)[number];

/** Flat, non-secret context. Never tokens, passwords or full email addresses. Amounts as digit strings. */
export type ActivityMetadata = Record<string, string | number | boolean | null>;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function readText(meta: Record<string, unknown>, key: string): string {
  const value = meta[key];
  return typeof value === "string" ? value : "";
}

function readNumber(meta: Record<string, unknown>, key: string): number | null {
  const value = meta[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readMoney(meta: Record<string, unknown>, key: string): string {
  const value = readText(meta, key);
  return /^\d{1,19}$/.test(value) ? formatRupiah(BigInt(value)) : "";
}

function quoted(value: string, fallback: string): string {
  return value ? `“${value}”` : fallback;
}

export function describeActivity(entry: { action: string; actorName: string; metadata: unknown }): string {
  const actor = entry.actorName.trim() || "Seseorang";
  const meta = asRecord(entry.metadata);
  const title = readText(meta, "title");
  const name = readText(meta, "name");
  const money = readMoney(meta, "amount");
  const count = readNumber(meta, "count");
  const seats = readNumber(meta, "seats");
  const task = title ? `tugas “${title}”` : "sebuah tugas";

  switch (entry.action) {
    case "wedding.created":
      return `${actor} membuat workspace pernikahan`;
    case "wedding.date_changed": {
      const to = readText(meta, "to");
      const recalculated = readNumber(meta, "recalculated") ?? 0;
      const date = isValidIsoDate(to) ? ` menjadi ${formatIsoDateLong(to)}` : "";
      const suffix = recalculated > 0 ? ` dan menghitung ulang ${recalculated} tenggat tugas` : "";
      return `${actor} mengubah tanggal pernikahan${date}${suffix}`;
    }
    case "couple_note.updated":
      return `${actor} memperbarui catatan untuk berdua`;
    case "checklist.generated":
      return count !== null ? `${actor} membuat checklist otomatis (${count} tugas)` : `${actor} membuat checklist otomatis`;
    case "task.created":
      return `${actor} menambahkan ${task}`;
    case "task.updated":
      return `${actor} mengubah ${task}`;
    case "task.completed":
      return `${actor} menyelesaikan ${task}`;
    case "task.reopened":
      return `${actor} membuka kembali ${task}`;
    case "task.deleted":
      return `${actor} menghapus ${task}`;
    case "partner.invited": {
      const email = readText(meta, "email");
      return email ? `${actor} mengundang ${email} sebagai pasangan` : `${actor} mengundang pasangan`;
    }
    case "partner.invitation_revoked":
      return `${actor} membatalkan undangan pasangan`;
    case "partner.invitation_declined":
      return `${actor} menolak undangan workspace`;
    case "partner.joined":
      return `${actor} bergabung ke workspace`;
    case "partner.removed":
      return name ? `${actor} mengeluarkan ${name} dari workspace` : `${actor} mengeluarkan pasangan dari workspace`;
    case "budget.initialized":
      return `${actor} menyiapkan kategori budget`;
    case "budget.settings_updated":
      return money ? `${actor} mengatur target budget menjadi ${money}` : `${actor} memperbarui pengaturan budget`;
    case "budget.category_created":
      return `${actor} menambahkan kategori budget ${quoted(name, "baru")}`;
    case "budget.category_updated":
      return `${actor} mengubah kategori budget ${quoted(name, "")}`.trimEnd();
    case "budget.category_deleted":
      return `${actor} menghapus kategori budget ${quoted(name, "")}`.trimEnd();
    case "expense.created":
      return `${actor} menambahkan pengeluaran ${quoted(title, "baru")}${money ? ` senilai ${money}` : ""}`;
    case "expense.updated":
      return `${actor} mengubah pengeluaran ${quoted(title, "")}`.trimEnd();
    case "expense.deleted":
      return `${actor} menghapus pengeluaran ${quoted(title, "")}`.trimEnd();
    case "payment.recorded":
      return `${actor} mencatat pembayaran${money ? ` ${money}` : ""}${title ? ` untuk “${title}”` : ""}`;
    case "payment.deleted":
      return `${actor} menghapus pembayaran${money ? ` ${money}` : ""}${title ? ` untuk “${title}”` : ""}`;
    case "vendor_research.created":
      return `${actor} menambahkan kandidat vendor ${quoted(name, "baru")}`;
    case "vendor_research.updated": {
      const label = VENDOR_RESEARCH_STATUS_LABEL[readText(meta, "status") as VendorResearchStatusValue];
      return `${actor} memperbarui kandidat vendor ${quoted(name, "")}${label ? ` (${label})` : ""}`.replace("  ", " ");
    }
    case "vendor_research.deleted":
      return `${actor} menghapus kandidat vendor ${quoted(name, "")}`.trimEnd();
    case "vendor.booked":
      return `${actor} memilih ${quoted(name, "kandidat")} sebagai vendor${money ? ` dengan kontrak ${money}` : ""}`;
    case "vendor.created":
      return `${actor} menambahkan vendor ${quoted(name, "baru")}${money ? ` dengan kontrak ${money}` : ""}`;
    case "vendor.updated":
      return `${actor} mengubah data vendor ${quoted(name, "")}`.trimEnd();
    case "vendor.deleted":
      return `${actor} menghapus vendor ${quoted(name, "")}`.trimEnd();
    case "guests.groups_initialized":
      return `${actor} menyiapkan grup tamu`;
    case "guest_group.created":
      return `${actor} menambahkan grup tamu ${quoted(name, "baru")}`;
    case "guest_group.updated":
      return `${actor} mengubah grup tamu ${quoted(name, "")}`.trimEnd();
    case "guest_group.deleted":
      return `${actor} menghapus grup tamu ${quoted(name, "")}`.trimEnd();
    case "guest.created":
      return `${actor} menambahkan tamu ${quoted(name, "baru")}${seats ? ` (${seats} kursi)` : ""}`;
    case "guest.updated":
      return `${actor} mengubah data tamu ${quoted(name, "")}`.trimEnd();
    case "guest.deleted":
      return `${actor} menghapus tamu ${quoted(name, "")}`.trimEnd();
    case "guests.imported":
      return count !== null
        ? `${actor} mengimpor ${count} undangan tamu${seats ? ` (${seats} kursi)` : ""}`
        : `${actor} mengimpor daftar tamu`;
    case "guests.bulk_status_updated": {
      const label = GUEST_INVITATION_LABEL[readText(meta, "status") as GuestInvitationStatusValue];
      return `${actor} menandai ${count ?? "beberapa"} undangan sebagai ${label ? `“${label}”` : "diperbarui"}`;
    }
    case "invitation.created":
      return `${actor} membuat undangan digital`;
    case "invitation.settings_updated":
      return `${actor} memperbarui pengaturan undangan${name ? ` (${name})` : ""}`;
    case "invitation.theme_changed":
      return `${actor} mengganti tema undangan${name ? ` menjadi ${name}` : ""}`;
    case "invitation.section_updated":
      return `${actor} mengubah bagian undangan${name ? ` “${name}”` : ""}`;
    case "invitation.sections_reordered":
      return `${actor} mengubah urutan bagian undangan`;
    case "invitation.published":
      return `${actor} menerbitkan undangan${name ? ` di /undangan/${name}` : ""}`;
    case "invitation.unpublished":
      return `${actor} menonaktifkan undangan dari publik`;
    case "wedding_event.created":
      return `${actor} menambahkan acara ${quoted(name, "baru")}`;
    case "wedding_event.updated":
      return `${actor} mengubah acara ${quoted(name, "")}`.trimEnd();
    case "wedding_event.deleted":
      return `${actor} menghapus acara ${quoted(name, "")}`.trimEnd();
    case "love_story.created":
      return `${actor} menambahkan cerita ${quoted(title, "baru")}`;
    case "love_story.updated":
      return `${actor} mengubah cerita ${quoted(title, "")}`.trimEnd();
    case "love_story.deleted":
      return `${actor} menghapus cerita ${quoted(title, "")}`.trimEnd();
    case "gallery.image_added":
      return `${actor} menambahkan foto ke galeri undangan`;
    case "gallery.image_removed":
      return `${actor} menghapus foto dari galeri undangan`;
    case "gift_account.created":
      return `${actor} menambahkan info hadiah ${quoted(name, "baru")}`;
    case "gift_account.updated":
      return `${actor} mengubah info hadiah ${quoted(name, "")}`.trimEnd();
    case "gift_account.deleted":
      return `${actor} menghapus info hadiah ${quoted(name, "")}`.trimEnd();
    case "rsvp.received": {
      const status = readText(meta, "status");
      if (status === "ATTENDING") return `${quoted(name, "Seorang tamu")} konfirmasi hadir${count ? ` (${count} orang)` : ""}`;
      if (status === "MAYBE") return `${quoted(name, "Seorang tamu")} menjawab mungkin hadir`;
      if (status === "DECLINED") return `${quoted(name, "Seorang tamu")} menjawab berhalangan hadir`;
      return `${quoted(name, "Seorang tamu")} mengirim konfirmasi kehadiran`;
    }
    case "wish.received":
      return `${quoted(name, "Seorang tamu")} mengirim ucapan & doa`;
    case "wish.hidden":
      return `${actor} menyembunyikan ucapan dari ${quoted(name, "seorang tamu")}`;
    case "wish.restored":
      return `${actor} menampilkan kembali ucapan dari ${quoted(name, "seorang tamu")}`;
    case "wish.deleted":
      return `${actor} menghapus ucapan dari ${quoted(name, "seorang tamu")}`;
    case "savings.recorded":
      return `${actor} mencatat tabungan${money ? ` ${money}` : ""}${name ? ` dari ${name}` : ""}`;
    case "savings.updated":
      return `${actor} mengubah catatan tabungan${name ? ` dari ${name}` : ""}`;
    case "savings.deleted":
      return `${actor} menghapus catatan tabungan${money ? ` ${money}` : ""}`;
    case "savings.target_updated":
      return money && readText(meta, "amount") !== "0"
        ? `${actor} mengatur target dana pernikahan menjadi ${money}`
        : `${actor} memperbarui target tabungan`;
    case "seserahan.item_created":
      return `${actor} menambahkan seserahan ${quoted(name, "baru")}`;
    case "seserahan.item_updated": {
      const label = GIFT_ITEM_STATUS_LABEL[readText(meta, "status") as GiftItemStatusValue];
      return `${actor} memperbarui seserahan ${quoted(name, "")}${label ? ` (${label})` : ""}`.replace("  ", " ");
    }
    case "seserahan.item_deleted":
      return `${actor} menghapus seserahan ${quoted(name, "")}`.trimEnd();
    case "rundown.item_created":
      return `${actor} menambahkan ${quoted(title, "acara")} ke rundown`;
    case "rundown.item_updated":
      return `${actor} mengubah rundown ${quoted(title, "")}`.trimEnd();
    case "rundown.item_deleted":
      return `${actor} menghapus ${quoted(title, "acara")} dari rundown`;
    case "calendar.event_created":
      return `${actor} menambahkan agenda ${quoted(title, "baru")}`;
    case "calendar.event_updated":
      return `${actor} mengubah agenda ${quoted(title, "")}`.trimEnd();
    case "calendar.event_deleted":
      return `${actor} menghapus agenda ${quoted(title, "")}`.trimEnd();
    case "billing.payment_paid":
      return `Pembayaran ${quoted(name, "paket")}${money ? ` sebesar ${money}` : ""} berhasil diterima`;
    case "billing.payment_refunded":
      return `Pembayaran ${quoted(name, "paket")}${money ? ` sebesar ${money}` : ""} dikembalikan; aksesnya dicabut`;
    case "billing.promo_redeemed": {
      const code = readText(meta, "code");
      return `${actor} mengaktifkan ${quoted(name, "paket")} gratis dengan kode promo${code ? ` ${code}` : ""}`;
    }
    case "invitation.music_updated":
      return `${actor} mengatur musik latar undangan`;
    case "data.exported": {
      const format = readText(meta, "format");
      return `${actor} mengunduh data ${name.toLowerCase() || "workspace"}${format ? ` (${format})` : ""}`;
    }
    default:
      return `${actor} melakukan perubahan`;
  }
}

/** "putri.ayu@gmail.com" → "pu***@gmail.com" */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at <= 0) return "***";
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const visible = local.slice(0, local.length > 2 ? 2 : 1);
  return `${visible}***@${domain}`;
}

const relativeFormatter = new Intl.RelativeTimeFormat("id", { numeric: "auto" });

export function formatRelativeTime(date: Date, now: Date, timeZone?: string): string {
  const seconds = Math.round((now.getTime() - date.getTime()) / 1000);
  if (seconds < 45) return "baru saja";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return relativeFormatter.format(-minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (hours < 24) return relativeFormatter.format(-hours, "hour");
  const days = Math.round(hours / 24);
  if (days < 7) return relativeFormatter.format(-days, "day");
  return formatDateTime(date, timeZone);
}
