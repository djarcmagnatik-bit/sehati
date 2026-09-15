/**
 * Calendar-date helpers. Wedding dates are date-only values ("YYYY-MM-DD") interpreted in the
 * wedding's time zone, so countdowns never drift because of server or browser time zones.
 */

export const DEFAULT_TIME_ZONE = "Asia/Jakarta";

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

export function isValidIsoDate(value: string): boolean {
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const [, y, m, d] = match;
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  return date.toISOString().slice(0, 10) === value;
}

export function isoDateToUtcMs(value: string): number {
  if (!isValidIsoDate(value)) throw new RangeError(`Invalid ISO date: ${value}`);
  const [y, m, d] = value.split("-").map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d);
}

/** Today's calendar date in the given IANA time zone. */
export function todayIsoInTimeZone(now: Date, timeZone: string = DEFAULT_TIME_ZONE): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function addDaysIso(value: string, days: number): string {
  return new Date(isoDateToUtcMs(value) + days * DAY_MS).toISOString().slice(0, 10);
}

export function daysBetweenIsoDates(fromIso: string, toIso: string): number {
  return Math.round((isoDateToUtcMs(toIso) - isoDateToUtcMs(fromIso)) / DAY_MS);
}

export type WeddingCountdown =
  | { state: "upcoming"; days: number }
  | { state: "today"; days: 0 }
  | { state: "past"; days: number };

export function getWeddingCountdown(
  weddingDateIso: string,
  now: Date,
  timeZone: string = DEFAULT_TIME_ZONE,
): WeddingCountdown {
  const diff = daysBetweenIsoDates(todayIsoInTimeZone(now, timeZone), weddingDateIso);
  if (diff > 0) return { state: "upcoming", days: diff };
  if (diff === 0) return { state: "today", days: 0 };
  return { state: "past", days: -diff };
}

export function describeCountdown(countdown: WeddingCountdown): string {
  switch (countdown.state) {
    case "upcoming":
      return `${countdown.days} hari menuju hari bahagia`;
    case "today":
      return "Hari ini hari bahagia kalian!";
    case "past":
      return `Hari bahagia telah lewat ${countdown.days} hari`;
  }
}

/** PostgreSQL DATE columns come back as UTC-midnight Date objects. */
export function dbDateToIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function isoToDbDate(value: string): Date {
  return new Date(isoDateToUtcMs(value));
}

export function formatIsoDateLong(value: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(isoDateToUtcMs(value)));
}

export function formatIsoDateShort(value: string): string {
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(
    new Date(isoDateToUtcMs(value)),
  );
}

export function formatDateTime(date: Date, timeZone: string = DEFAULT_TIME_ZONE): string {
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone }).format(date);
}
