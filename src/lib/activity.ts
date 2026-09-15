/** Activity feed vocabulary and presentation (pure, client-safe). */
import { formatDateTime, formatIsoDateLong, isValidIsoDate } from "@/lib/dates";
import { formatRupiah } from "@/lib/money";

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
    case "checklist.generated": {
      const count = readNumber(meta, "count");
      return count !== null ? `${actor} membuat checklist otomatis (${count} tugas)` : `${actor} membuat checklist otomatis`;
    }
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
