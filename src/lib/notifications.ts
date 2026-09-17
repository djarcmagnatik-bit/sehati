/** Notification vocabulary and message wording (pure, client-safe). */
import { daysBetweenIsoDates, formatIsoDateShort } from "@/lib/dates";

export const NOTIFICATION_TYPES = [
  "TASK_DUE",
  "TASK_OVERDUE",
  "PAYMENT_DUE",
  "PARTNER_INVITED",
  "PARTNER_JOINED",
  "RSVP_RECEIVED",
  "BUDGET_EXCEEDED",
] as const;
export type NotificationTypeValue = (typeof NOTIFICATION_TYPES)[number];

export const NOTIFICATION_TYPE_LABEL: Record<NotificationTypeValue, string> = {
  TASK_DUE: "Tugas jatuh tempo",
  TASK_OVERDUE: "Tugas terlambat",
  PAYMENT_DUE: "Pembayaran mendekat",
  PARTNER_INVITED: "Undangan pasangan",
  PARTNER_JOINED: "Pasangan bergabung",
  RSVP_RECEIVED: "RSVP masuk",
  BUDGET_EXCEEDED: "Budget terlampaui",
};

/** Reminders look this many days ahead (today included). */
export const DUE_SOON_DAYS = 3;
/** Tasks that became overdue within this many days are reminded once; older ones stay on the checklist. */
export const OVERDUE_WINDOW_DAYS = 7;

export const NOTIFICATION_PAGE_SIZE = 30;

/** Only paths inside this app: "/budget" yes, "//evil.test" or "https://…" no. */
export function isSafeInternalLink(link: string | null | undefined): link is string {
  return typeof link === "string" && link.length <= 200 && /^\/(?![/\\])[^\s]*$/.test(link);
}

/** "hari ini", "besok", "lusa", otherwise a short date. */
export function relativeDayLabel(dateIso: string, todayIso: string): string {
  const days = daysBetweenIsoDates(todayIso, dateIso);
  if (days === 0) return "hari ini";
  if (days === 1) return "besok";
  if (days === 2) return "lusa";
  return formatIsoDateShort(dateIso);
}

function clip(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

/** "A, B, dan 3 lainnya" from the first titles of a group. */
export function summarizeTitles(titles: readonly string[], total: number): string {
  const shown = titles.slice(0, 2).map((title) => clip(title, 60));
  const rest = total - shown.length;
  if (rest <= 0) return shown.length === 2 ? `${shown[0]} dan ${shown[1]}` : (shown[0] ?? "");
  return `${shown.join(", ")}, dan ${rest} lainnya`;
}

export type NotificationContent = { title: string; body: string; link: string | null };

export function taskDueContent(input: { dueIso: string; todayIso: string; count: number; titles: readonly string[] }): NotificationContent {
  const when = relativeDayLabel(input.dueIso, input.todayIso);
  return {
    title: input.count === 1 ? `Tugas jatuh tempo ${when}` : `${input.count} tugas jatuh tempo ${when}`,
    body: clip(summarizeTitles(input.titles, input.count), 300),
    link: "/checklist?view=open&sort=due",
  };
}

export function taskOverdueContent(input: { dueIso: string; count: number; titles: readonly string[] }): NotificationContent {
  return {
    title: input.count === 1 ? "Tugas terlambat" : `${input.count} tugas terlambat`,
    body: clip(`Tenggat ${formatIsoDateShort(input.dueIso)}: ${summarizeTitles(input.titles, input.count)}`, 300),
    link: "/checklist?view=overdue",
  };
}

export function paymentDueContent(input: {
  expenseId: string;
  title: string;
  dueIso: string;
  todayIso: string;
  outstanding: string;
}): NotificationContent {
  return {
    title: clip(`Pembayaran jatuh tempo ${relativeDayLabel(input.dueIso, input.todayIso)}`, 120),
    body: clip(`${input.title} · sisa ${input.outstanding}`, 300),
    link: `/budget/expenses/${input.expenseId}`,
  };
}

const RSVP_ANSWER = { DECLINED: "Tidak hadir", MAYBE: "Masih ragu", PENDING: "Belum menjawab" } as const;

export function rsvpReceivedContent(input: {
  guestId: string;
  guestName: string;
  status: "ATTENDING" | "MAYBE" | "DECLINED" | "PENDING";
  count: number;
}): NotificationContent {
  const answer = input.status === "ATTENDING" ? `Hadir · ${input.count} orang` : RSVP_ANSWER[input.status];
  return {
    title: clip(`${input.guestName} membalas RSVP`, 120),
    body: answer,
    link: `/guests/${input.guestId}`,
  };
}

export function partnerJoinedContent(input: { name: string }): NotificationContent {
  return {
    title: clip(`${input.name} bergabung ke ruang kerja`, 120),
    body: "Sekarang kalian bisa merencanakan pernikahan bersama.",
    link: "/settings/partner",
  };
}

/** The invite link carries a secret token, so it only ever travels by email — never in a notification. */
export function partnerInvitedContent(input: { inviterName: string; coupleName: string; expiresIso: string }): NotificationContent {
  return {
    title: clip(`${input.inviterName} mengundangmu merencanakan pernikahan`, 120),
    body: clip(`${input.coupleName}. Buka tautan undangan di emailmu sebelum ${formatIsoDateShort(input.expiresIso)}.`, 300),
    link: null,
  };
}

export function budgetExceededContent(
  input: { scope: "total"; committed: string; limit: string } | { scope: "category"; categoryId: string; name: string; committed: string; limit: string },
): NotificationContent {
  if (input.scope === "total") {
    return {
      title: "Pengeluaran melebihi target budget",
      body: `Tercatat ${input.committed} dari target ${input.limit}.`,
      link: "/budget",
    };
  }
  return {
    title: clip(`Kategori ${input.name} melebihi alokasi`, 120),
    body: `Tercatat ${input.committed} dari alokasi ${input.limit}.`,
    link: `/budget/categories/${input.categoryId}`,
  };
}

// ─── Jobs ────────────────────────────────────────────────────────────────────

/** Exponential backoff: 30 s, 1 min, 2 min … capped at one hour. */
export function retryDelayMs(attempts: number): number {
  const exponent = Math.max(0, Math.min(attempts - 1, 20));
  return Math.min(30_000 * 2 ** exponent, 60 * 60 * 1000);
}
