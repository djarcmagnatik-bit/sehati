import { describe, expect, it } from "vitest";
import {
  budgetExceededContent,
  isSafeInternalLink,
  partnerInvitedContent,
  partnerJoinedContent,
  paymentDueContent,
  relativeDayLabel,
  retryDelayMs,
  rsvpReceivedContent,
  summarizeTitles,
  taskDueContent,
  taskOverdueContent,
} from "@/lib/notifications";

describe("notification links", () => {
  it("accepts only paths inside the app", () => {
    for (const link of ["/budget", "/guests/abc", "/checklist?view=overdue&sort=due", "/"]) {
      expect(isSafeInternalLink(link)).toBe(true);
    }
    for (const link of ["//evil.example", "/\\evil.example", "https://evil.example", "javascript:alert(1)", "budget", "/a b", "", null, undefined, `/${"a".repeat(200)}`]) {
      expect(isSafeInternalLink(link)).toBe(false);
    }
  });
});

describe("notification wording", () => {
  it("labels nearby days", () => {
    expect(relativeDayLabel("2026-09-17", "2026-09-17")).toBe("hari ini");
    expect(relativeDayLabel("2026-09-18", "2026-09-17")).toBe("besok");
    expect(relativeDayLabel("2026-09-19", "2026-09-17")).toBe("lusa");
    expect(relativeDayLabel("2026-09-25", "2026-09-17")).toMatch(/25 Sep 2026/);
  });

  it("summarizes grouped task titles", () => {
    expect(summarizeTitles(["Booking MUA"], 1)).toBe("Booking MUA");
    expect(summarizeTitles(["Booking MUA", "Fitting"], 2)).toBe("Booking MUA dan Fitting");
    expect(summarizeTitles(["Booking MUA", "Fitting"], 5)).toBe("Booking MUA, Fitting, dan 3 lainnya");
    expect(summarizeTitles(["x".repeat(100)], 1)).toHaveLength(60);
  });

  it("builds task reminders with singular and plural titles", () => {
    expect(taskDueContent({ dueIso: "2026-09-18", todayIso: "2026-09-17", count: 1, titles: ["Booking MUA"] })).toEqual({
      title: "Tugas jatuh tempo besok",
      body: "Booking MUA",
      link: "/checklist?view=open&sort=due",
    });
    expect(taskDueContent({ dueIso: "2026-09-17", todayIso: "2026-09-17", count: 3, titles: ["A", "B"] }).title).toBe("3 tugas jatuh tempo hari ini");
    const overdue = taskOverdueContent({ dueIso: "2026-09-15", count: 2, titles: ["A", "B"] });
    expect(overdue.title).toBe("2 tugas terlambat");
    expect(overdue.body).toMatch(/^Tenggat 15 Sep 2026: A dan B$/);
    expect(overdue.link).toBe("/checklist?view=overdue");
  });

  it("describes payments, RSVPs, partners and budget alarms", () => {
    expect(paymentDueContent({ expenseId: "e1", title: "DP Katering", dueIso: "2026-09-19", todayIso: "2026-09-17", outstanding: "Rp 5.000.000" })).toEqual({
      title: "Pembayaran jatuh tempo lusa",
      body: "DP Katering · sisa Rp 5.000.000",
      link: "/budget/expenses/e1",
    });
    expect(rsvpReceivedContent({ guestId: "g1", guestName: "Keluarga Ahmad", status: "ATTENDING", count: 3 }).body).toBe("Hadir · 3 orang");
    expect(rsvpReceivedContent({ guestId: "g1", guestName: "Keluarga Ahmad", status: "DECLINED", count: 0 }).body).toBe("Tidak hadir");
    expect(rsvpReceivedContent({ guestId: "g1", guestName: "Keluarga Ahmad", status: "MAYBE", count: 0 }).body).toBe("Masih ragu");
    expect(partnerJoinedContent({ name: "Putri" }).title).toBe("Putri bergabung ke ruang kerja");

    const invited = partnerInvitedContent({ inviterName: "Fajar", coupleName: "Putri & Fajar", expiresIso: "2026-09-24" });
    expect(invited.link).toBeNull();
    expect(invited.body).toContain("Putri & Fajar");

    expect(budgetExceededContent({ scope: "total", committed: "Rp 60", limit: "Rp 50" })).toMatchObject({ link: "/budget" });
    expect(budgetExceededContent({ scope: "category", categoryId: "c1", name: "Gedung", committed: "Rp 30", limit: "Rp 20" })).toEqual({
      title: "Kategori Gedung melebihi alokasi",
      body: "Tercatat Rp 30 dari alokasi Rp 20.",
      link: "/budget/categories/c1",
    });
  });

  it("keeps generated text inside the column limits", () => {
    const long = "N".repeat(500);
    const content = rsvpReceivedContent({ guestId: "g", guestName: long, status: "ATTENDING", count: 1 });
    expect(content.title.length).toBeLessThanOrEqual(120);
    expect(paymentDueContent({ expenseId: "e", title: long, dueIso: "2026-09-17", todayIso: "2026-09-17", outstanding: "Rp 1" }).body.length).toBeLessThanOrEqual(300);
  });
});

describe("job retry backoff", () => {
  it("doubles from 30 seconds and caps at one hour", () => {
    expect(retryDelayMs(1)).toBe(30_000);
    expect(retryDelayMs(2)).toBe(60_000);
    expect(retryDelayMs(3)).toBe(120_000);
    expect(retryDelayMs(8)).toBe(3_600_000);
    expect(retryDelayMs(50)).toBe(3_600_000);
    expect(retryDelayMs(0)).toBe(30_000);
  });
});
