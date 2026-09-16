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

/** Offset of a time zone at a given instant, in milliseconds (WIB → +7h). */
function timeZoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  const asUtc = Date.UTC(part("year"), part("month") - 1, part("day"), part("hour"), part("minute"), part("second"));
  return asUtc - instant.getTime();
}

/**
 * The UTC instant of a wall-clock date and time in a time zone: "2026-10-21" 09:00 in
 * Asia/Jakarta → 2026-10-21T02:00:00Z. Used for countdowns that must tick to the local ceremony.
 */
export function zonedTimeToUtcMs(dateIso: string, timeZone: string = DEFAULT_TIME_ZONE, time = "00:00"): number {
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  const naive = isoDateToUtcMs(dateIso) + hours * 3_600_000 + minutes * 60_000;
  // Two passes so a zone change between the guess and the result still lands on the right instant.
  let guess = naive - timeZoneOffsetMs(new Date(naive), timeZone);
  guess = naive - timeZoneOffsetMs(new Date(guess), timeZone);
  return guess;
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
