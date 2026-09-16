/** Vocabulary for the planning extras: savings, seserahan, rundown and the calendar (pure). */
import { percentOf } from "@/lib/budget";

// ─── Savings ─────────────────────────────────────────────────────────────────

export type SavingsSummary = {
  target: bigint | null;
  saved: bigint;
  /** target − saved, never below zero. Null when no target is set. */
  remaining: bigint | null;
  percent: number | null;
  monthlyTarget: bigint | null;
  /** What still has to be saved per month to reach the target before the wedding. */
  requiredMonthly: bigint | null;
  contributors: number;
};

/** Months left counts the current month, so a wedding this month still needs one deposit. */
export function monthsUntil(todayIso: string, weddingDateIso: string): number {
  const [ty, tm] = todayIso.split("-").map(Number) as [number, number, number];
  const [wy, wm] = weddingDateIso.split("-").map(Number) as [number, number, number];
  return Math.max(0, (wy - ty) * 12 + (wm - tm)) + 1;
}

export function savingsProgress(
  saved: bigint,
  target: bigint | null,
  options: { monthlyTarget?: bigint | null; monthsLeft?: number | null } = {},
): Pick<SavingsSummary, "remaining" | "percent" | "requiredMonthly"> {
  if (target === null || target <= 0n) {
    return { remaining: null, percent: null, requiredMonthly: options.monthlyTarget ?? null };
  }
  const remaining = saved >= target ? 0n : target - saved;
  const months = options.monthsLeft ?? null;
  const requiredMonthly = remaining > 0n && months && months > 0 ? remaining / BigInt(months) + (remaining % BigInt(months) > 0n ? 1n : 0n) : 0n;
  return { remaining, percent: percentOf(saved, target), requiredMonthly };
}

// ─── Seserahan ───────────────────────────────────────────────────────────────

export const GIFT_ITEM_STATUSES = ["PLANNED", "PURCHASED", "PACKED", "READY"] as const;
export type GiftItemStatusValue = (typeof GIFT_ITEM_STATUSES)[number];

export const GIFT_ITEM_STATUS_LABEL: Record<GiftItemStatusValue, string> = {
  PLANNED: "Direncanakan",
  PURCHASED: "Sudah dibeli",
  PACKED: "Sudah dikemas",
  READY: "Siap diantar",
};

export const GIFT_ITEM_STATUS_HINT: Record<GiftItemStatusValue, string> = {
  PLANNED: "Belum dibeli.",
  PURCHASED: "Sudah dibeli, belum dikemas.",
  PACKED: "Sudah masuk kotak/hantaran.",
  READY: "Siap dibawa ke acara.",
};

/** "Selesai" for progress: packed or ready to hand over. */
export const GIFT_ITEM_DONE_STATUSES: readonly GiftItemStatusValue[] = ["PACKED", "READY"];

export function isGiftItemDone(status: GiftItemStatusValue): boolean {
  return GIFT_ITEM_DONE_STATUSES.includes(status);
}

export const MAX_GIFT_QUANTITY = 999;

// ─── Rundown ─────────────────────────────────────────────────────────────────

export const TIME_PATTERN = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

export function isValidTime(value: string): boolean {
  return TIME_PATTERN.test(value);
}

export function minutesOfDay(time: string): number {
  const [hours, minutes] = time.split(":").map(Number) as [number, number];
  return hours * 60 + minutes;
}

/** "09:00"–"10:30" → "1 jam 30 menit". Null when there is no end time or it is not after the start. */
export function describeDuration(startTime: string, endTime: string | null): string | null {
  if (!endTime || !isValidTime(startTime) || !isValidTime(endTime)) return null;
  const minutes = minutesOfDay(endTime) - minutesOfDay(startTime);
  if (minutes <= 0) return null;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} menit`;
  return rest === 0 ? `${hours} jam` : `${hours} jam ${rest} menit`;
}

export function formatTimeRange(startTime: string, endTime: string | null): string {
  return endTime ? `${startTime} – ${endTime}` : startTime;
}

/** Suggested rundown categories; the field itself stays free text. */
export const RUNDOWN_CATEGORIES = ["Persiapan", "Akad", "Resepsi", "Dokumentasi", "Hiburan", "Lainnya"] as const;

// ─── Calendar ────────────────────────────────────────────────────────────────

export const CALENDAR_SOURCES = ["task", "payment", "wedding_event", "vendor_meeting", "custom"] as const;
export type CalendarSource = (typeof CALENDAR_SOURCES)[number];

export const CALENDAR_SOURCE_LABEL: Record<CalendarSource, string> = {
  task: "Tugas",
  payment: "Pembayaran",
  wedding_event: "Acara",
  vendor_meeting: "Janji vendor",
  custom: "Agenda",
};

/**
 * Each source gets a colour AND a symbol: colour alone must never be the only way to tell
 * entries apart.
 */
export const CALENDAR_SOURCE_STYLE: Record<CalendarSource, { symbol: string; className: string }> = {
  task: { symbol: "✓", className: "bg-sage-50 text-sage-700 ring-sage-100" },
  payment: { symbol: "Rp", className: "bg-clay-50 text-clay-700 ring-clay-300" },
  wedding_event: { symbol: "♥", className: "bg-danger-50 text-danger-600 ring-danger-600/30" },
  vendor_meeting: { symbol: "☎", className: "bg-cream-100 text-ink-700 ring-cream-300" },
  custom: { symbol: "●", className: "bg-white text-ink-700 ring-cream-300" },
};

export const CALENDAR_VIEWS = ["month", "week", "agenda"] as const;
export type CalendarView = (typeof CALENDAR_VIEWS)[number];
export const CALENDAR_VIEW_LABEL: Record<CalendarView, string> = {
  month: "Bulan",
  week: "Minggu",
  agenda: "Agenda",
};

export type CalendarEntry = {
  id: string;
  source: CalendarSource;
  title: string;
  dateIso: string;
  time: string | null;
  /** Where clicking the entry takes the planner. */
  href: string;
  detail: string | null;
  done: boolean;
};

const MONTH_NAMES = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
] as const;

export function monthLabel(month: string): string {
  const [year, index] = month.split("-").map(Number) as [number, number];
  return `${MONTH_NAMES[index - 1] ?? ""} ${year}`;
}

/** "2026-10" → the previous/next month, staying in YYYY-MM form. */
export function shiftMonth(month: string, delta: number): string {
  const [year, index] = month.split("-").map(Number) as [number, number];
  const zeroBased = index - 1 + delta;
  const shiftedYear = year + Math.floor(zeroBased / 12);
  const shiftedMonth = ((zeroBased % 12) + 12) % 12;
  return `${shiftedYear}-${String(shiftedMonth + 1).padStart(2, "0")}`;
}

export function isValidMonth(value: string): boolean {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return false;
  const year = Number(value.slice(0, 4));
  return year >= 2000 && year <= 2100;
}

export function monthOf(dateIso: string): string {
  return dateIso.slice(0, 7);
}

/** Calendar grid for a month: whole weeks, Monday first, as ISO dates. */
export function monthGrid(month: string): string[] {
  const [year, index] = month.split("-").map(Number) as [number, number];
  const first = new Date(Date.UTC(year, index - 1, 1));
  const offset = (first.getUTCDay() + 6) % 7; // Monday = 0
  const start = new Date(first.getTime() - offset * 86_400_000);
  const daysInMonth = new Date(Date.UTC(year, index, 0)).getUTCDate();
  const cells = Math.ceil((offset + daysInMonth) / 7) * 7;
  return Array.from({ length: cells }, (_, day) => new Date(start.getTime() + day * 86_400_000).toISOString().slice(0, 10));
}

/** The Monday-to-Sunday week that contains `dateIso`. */
export function weekGrid(dateIso: string): string[] {
  const date = new Date(`${dateIso}T00:00:00Z`);
  const offset = (date.getUTCDay() + 6) % 7;
  const monday = new Date(date.getTime() - offset * 86_400_000);
  return Array.from({ length: 7 }, (_, day) => new Date(monday.getTime() + day * 86_400_000).toISOString().slice(0, 10));
}

export const WEEKDAY_LABELS = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"] as const;

export function groupEntriesByDate(entries: readonly CalendarEntry[]): Map<string, CalendarEntry[]> {
  const grouped = new Map<string, CalendarEntry[]>();
  for (const entry of entries) {
    const list = grouped.get(entry.dateIso);
    if (list) list.push(entry);
    else grouped.set(entry.dateIso, [entry]);
  }
  for (const list of grouped.values()) {
    list.sort((a, b) => (a.time ?? "99:99").localeCompare(b.time ?? "99:99") || a.title.localeCompare(b.title));
  }
  return grouped;
}
