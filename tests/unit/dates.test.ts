import { describe, expect, it } from "vitest";
import {
  daysBetweenIsoDates,
  dbDateToIso,
  describeCountdown,
  getWeddingCountdown,
  isoToDbDate,
  isValidIsoDate,
  todayIsoInTimeZone,
} from "@/lib/dates";

describe("isValidIsoDate", () => {
  it.each(["2027-12-20", "2028-02-29", "2027-01-01"])("accepts %s", (value) => {
    expect(isValidIsoDate(value)).toBe(true);
  });

  it.each(["2027-02-29", "2027-13-01", "2027-04-31", "20-12-2027", "2027-12-20T00:00", ""])("rejects %j", (value) => {
    expect(isValidIsoDate(value)).toBe(false);
  });
});

describe("todayIsoInTimeZone", () => {
  const instant = new Date("2027-12-19T17:30:00Z");

  it("uses the wedding time zone, not the server time zone", () => {
    expect(todayIsoInTimeZone(instant, "Asia/Jakarta")).toBe("2027-12-20"); // UTC+7
    expect(todayIsoInTimeZone(instant, "UTC")).toBe("2027-12-19");
    expect(todayIsoInTimeZone(instant, "Asia/Jayapura")).toBe("2027-12-20"); // UTC+9
  });
});

describe("daysBetweenIsoDates", () => {
  it("counts calendar days including leap days", () => {
    expect(daysBetweenIsoDates("2028-02-28", "2028-03-01")).toBe(2);
    expect(daysBetweenIsoDates("2027-12-20", "2027-12-20")).toBe(0);
    expect(daysBetweenIsoDates("2027-12-21", "2027-12-20")).toBe(-1);
  });
});

describe("getWeddingCountdown", () => {
  it("counts down in whole days (PRD example: 120 days)", () => {
    const now = new Date("2027-08-22T03:00:00Z"); // 22 Aug 2027, 10:00 WIB
    expect(getWeddingCountdown("2027-12-20", now, "Asia/Jakarta")).toEqual({ state: "upcoming", days: 120 });
  });

  it("switches days exactly at local midnight", () => {
    expect(getWeddingCountdown("2027-12-20", new Date("2027-12-19T16:59:59Z"), "Asia/Jakarta")).toEqual({
      state: "upcoming",
      days: 1,
    });
    expect(getWeddingCountdown("2027-12-20", new Date("2027-12-19T17:00:00Z"), "Asia/Jakarta")).toEqual({
      state: "today",
      days: 0,
    });
  });

  it("reports days since the wedding once it has passed", () => {
    expect(getWeddingCountdown("2027-12-20", new Date("2027-12-23T05:00:00Z"), "Asia/Jakarta")).toEqual({
      state: "past",
      days: 3,
    });
  });
});

describe("describeCountdown", () => {
  it("renders Indonesian copy for each state", () => {
    expect(describeCountdown({ state: "upcoming", days: 120 })).toBe("120 hari menuju hari bahagia");
    expect(describeCountdown({ state: "today", days: 0 })).toBe("Hari ini hari bahagia kalian!");
    expect(describeCountdown({ state: "past", days: 3 })).toBe("Hari bahagia telah lewat 3 hari");
  });
});

describe("DATE column conversion", () => {
  it("round-trips without time zone drift", () => {
    const stored = isoToDbDate("2027-12-20");
    expect(stored.toISOString()).toBe("2027-12-20T00:00:00.000Z");
    expect(dbDateToIso(stored)).toBe("2027-12-20");
  });
});
