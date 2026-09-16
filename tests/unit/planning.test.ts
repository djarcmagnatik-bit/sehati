import { describe, expect, it } from "vitest";
import { describeActivity } from "@/lib/activity";
import { audioRejection, readAudioType } from "@/lib/media";
import {
  describeDuration,
  formatTimeRange,
  groupEntriesByDate,
  isGiftItemDone,
  isValidMonth,
  isValidTime,
  monthGrid,
  monthLabel,
  monthsUntil,
  savingsProgress,
  shiftMonth,
  weekGrid,
  type CalendarEntry,
} from "@/lib/planning";
import {
  calendarEventSchema,
  giftItemSchema,
  invitationMusicSchema,
  rundownItemSchema,
  savingsEntrySchema,
  savingsSettingsSchema,
} from "@/lib/validation/planning";

const M = 1_000_000n;

describe("savings progress", () => {
  it("counts the current month as a month left", () => {
    expect(monthsUntil("2026-09-17", "2026-09-30")).toBe(1);
    expect(monthsUntil("2026-09-17", "2027-03-01")).toBe(7);
    expect(monthsUntil("2026-09-17", "2025-01-01")).toBe(1);
  });

  it("computes what is left and what to save each month, rounding up", () => {
    expect(savingsProgress(40n * M, 100n * M, { monthsLeft: 7 })).toEqual({
      remaining: 60n * M,
      percent: 40,
      requiredMonthly: 8_571_429n,
    });
  });

  it("never reports a negative remainder once the target is reached", () => {
    expect(savingsProgress(120n * M, 100n * M, { monthsLeft: 3 })).toMatchObject({ remaining: 0n, requiredMonthly: 0n });
  });

  it("has no progress without a target", () => {
    expect(savingsProgress(5n * M, null, { monthlyTarget: 2n * M })).toEqual({
      remaining: null,
      percent: null,
      requiredMonthly: 2n * M,
    });
  });
});

describe("rundown time helpers", () => {
  it("validates 24-hour times", () => {
    expect(isValidTime("07:30")).toBe(true);
    expect(isValidTime("23:59")).toBe(true);
    expect(isValidTime("24:00")).toBe(false);
    expect(isValidTime("7:30")).toBe(false);
  });

  it("describes durations in Indonesian", () => {
    expect(describeDuration("09:00", "10:30")).toBe("1 jam 30 menit");
    expect(describeDuration("09:00", "11:00")).toBe("2 jam");
    expect(describeDuration("09:00", "09:45")).toBe("45 menit");
    expect(describeDuration("09:00", null)).toBeNull();
    expect(describeDuration("10:00", "09:00")).toBeNull();
  });

  it("formats a range", () => {
    expect(formatTimeRange("07:00", "08:30")).toBe("07:00 – 08:30");
    expect(formatTimeRange("07:00", null)).toBe("07:00");
  });
});

describe("calendar grid", () => {
  it("shifts months across years", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-05", -17)).toBe("2024-12");
  });

  it("validates month parameters", () => {
    expect(isValidMonth("2026-09")).toBe(true);
    expect(isValidMonth("2026-13")).toBe(false);
    expect(isValidMonth("1999-01")).toBe(false);
    expect(isValidMonth("2026-9")).toBe(false);
    expect(monthLabel("2026-09")).toBe("September 2026");
  });

  it("builds whole Monday-first weeks around a month", () => {
    // September 2026 starts on a Tuesday and ends on a Wednesday.
    const grid = monthGrid("2026-09");
    expect(grid[0]).toBe("2026-08-31");
    expect(grid.at(-1)).toBe("2026-10-04");
    expect(grid.length % 7).toBe(0);
    expect(grid).toContain("2026-09-30");
  });

  it("finds the Monday-to-Sunday week of a date", () => {
    expect(weekGrid("2026-09-17")).toEqual([
      "2026-09-14",
      "2026-09-15",
      "2026-09-16",
      "2026-09-17",
      "2026-09-18",
      "2026-09-19",
      "2026-09-20",
    ]);
    expect(weekGrid("2026-09-20")[0]).toBe("2026-09-14");
  });

  it("groups entries by day, timed ones first in time order", () => {
    const entry = (id: string, dateIso: string, time: string | null, title: string): CalendarEntry => ({
      id,
      source: "custom",
      title,
      dateIso,
      time,
      href: "#",
      detail: null,
      done: false,
    });
    const grouped = groupEntriesByDate([
      entry("a", "2026-09-17", null, "Bayar DP"),
      entry("b", "2026-09-17", "14:00", "Fitting"),
      entry("c", "2026-09-17", "09:00", "Survey gedung"),
      entry("d", "2026-09-18", null, "Lainnya"),
    ]);
    expect(grouped.get("2026-09-17")?.map((item) => item.id)).toEqual(["c", "b", "a"]);
    expect(grouped.get("2026-09-18")).toHaveLength(1);
  });
});

describe("planning validation", () => {
  it("parses a savings deposit and refuses zero", () => {
    expect(savingsEntrySchema.parse({ contributor: " Fajar ", amount: "2.500.000", entryDate: "2026-09-17", account: "", notes: "" })).toEqual({
      contributor: "Fajar",
      amount: 2_500_000n,
      entryDate: "2026-09-17",
      account: null,
      notes: null,
    });
    expect(savingsEntrySchema.safeParse({ contributor: "Fajar", amount: "0", entryDate: "2026-09-17" }).success).toBe(false);
    expect(savingsEntrySchema.safeParse({ contributor: "Fajar", amount: "1000", entryDate: "2026-02-30" }).success).toBe(false);
    expect(savingsSettingsSchema.parse({ savingsTarget: "", savingsMonthlyTarget: "5.000.000" })).toEqual({
      savingsTarget: null,
      savingsMonthlyTarget: 5n * M,
    });
  });

  it("parses a seserahan item with defaults", () => {
    expect(giftItemSchema.parse({ name: "Set mukena", status: "PLANNED" })).toMatchObject({
      name: "Set mukena",
      categoryId: null,
      quantity: 1,
      estimatedPrice: null,
      status: "PLANNED",
    });
    expect(giftItemSchema.safeParse({ name: "X", quantity: "0", status: "PLANNED" }).success).toBe(false);
    expect(giftItemSchema.safeParse({ name: "X", quantity: "1000", status: "PLANNED" }).success).toBe(false);
    expect(giftItemSchema.safeParse({ name: "X", status: "LOST" }).success).toBe(false);
  });

  it("requires a start time and a forward range for rundown items", () => {
    expect(rundownItemSchema.parse({ title: "Makeup", startTime: "05:00", endTime: "07:00" })).toMatchObject({
      itemDate: null,
      startTime: "05:00",
      endTime: "07:00",
    });
    expect(rundownItemSchema.safeParse({ title: "Makeup", startTime: "" }).success).toBe(false);
    const reversed = rundownItemSchema.safeParse({ title: "Makeup", startTime: "07:00", endTime: "05:00" });
    expect(reversed.success).toBe(false);
    expect(reversed.error?.issues[0]?.path).toEqual(["endTime"]);
  });

  it("allows an all-day agenda but not an end without a start", () => {
    expect(calendarEventSchema.parse({ title: "Fitting", eventDate: "2026-10-01" })).toMatchObject({ startTime: null, endTime: null });
    expect(calendarEventSchema.safeParse({ title: "Fitting", eventDate: "2026-10-01", endTime: "10:00" }).success).toBe(false);
  });

  it("bounds the music volume", () => {
    expect(invitationMusicSchema.parse({ musicEnabled: true, musicVolume: "" })).toEqual({ musicEnabled: true, musicVolume: 60 });
    expect(invitationMusicSchema.safeParse({ musicEnabled: true, musicVolume: "101" }).success).toBe(false);
  });
});

describe("seserahan status", () => {
  it("counts packed and ready items as done", () => {
    expect(isGiftItemDone("PLANNED")).toBe(false);
    expect(isGiftItemDone("PURCHASED")).toBe(false);
    expect(isGiftItemDone("PACKED")).toBe(true);
    expect(isGiftItemDone("READY")).toBe(true);
  });
});

describe("audio validation", () => {
  const id3 = Buffer.concat([Buffer.from("ID3"), Buffer.alloc(64)]);
  const frame = Buffer.concat([Buffer.from([0xff, 0xfb, 0x90, 0x64]), Buffer.alloc(64)]);
  const m4a = Buffer.concat([Buffer.from([0, 0, 0, 0x20]), Buffer.from("ftypM4A "), Buffer.alloc(64)]);
  const ogg = Buffer.concat([Buffer.from("OggS"), Buffer.alloc(64)]);

  it("recognizes formats from their headers", () => {
    expect(readAudioType(id3)).toBe("audio/mpeg");
    expect(readAudioType(frame)).toBe("audio/mpeg");
    expect(readAudioType(m4a)).toBe("audio/mp4");
    expect(readAudioType(ogg)).toBe("audio/ogg");
    expect(readAudioType(Buffer.from("not audio, just text......"))).toBeNull();
  });

  it("accepts browser aliases but rejects a mismatch or an oversized file", () => {
    expect(audioRejection(id3, "audio/mp3")).toBeNull();
    expect(audioRejection(m4a, "audio/x-m4a")).toBeNull();
    expect(audioRejection(id3, "")).toBeNull();
    expect(audioRejection(ogg, "audio/mpeg")).toBe("unsupported_type");
    expect(audioRejection(id3, "video/mp4")).toBe("unsupported_type");
    expect(audioRejection(Buffer.alloc(7 * 1024 * 1024), "audio/mpeg")).toBe("too_large");
  });
});

describe("planning activity descriptions", () => {
  it("describes the new actions in Indonesian", () => {
    expect(describeActivity({ action: "savings.recorded", actorName: "Fajar", metadata: { name: "Fajar", amount: "2500000" } })).toMatch(
      /Fajar mencatat tabungan Rp\s2\.500\.000 dari Fajar/,
    );
    expect(describeActivity({ action: "savings.target_updated", actorName: "Putri", metadata: { amount: "0" } })).toBe(
      "Putri memperbarui target tabungan",
    );
    expect(describeActivity({ action: "seserahan.item_updated", actorName: "Putri", metadata: { name: "Mukena", status: "READY" } })).toBe(
      "Putri memperbarui seserahan “Mukena” (Siap diantar)",
    );
    expect(describeActivity({ action: "rundown.item_created", actorName: "Fajar", metadata: { title: "Akad" } })).toBe(
      "Fajar menambahkan “Akad” ke rundown",
    );
    expect(describeActivity({ action: "calendar.event_deleted", actorName: "Fajar", metadata: { title: "Fitting" } })).toBe(
      "Fajar menghapus agenda “Fitting”",
    );
  });
});
