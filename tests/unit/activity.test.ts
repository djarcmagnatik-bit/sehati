import { describe, expect, it } from "vitest";
import { ACTIVITY_ACTIONS, describeActivity, formatRelativeTime, maskEmail } from "@/lib/activity";

const entry = (action: string, metadata: unknown = null, actorName = "Putri") => ({ action, actorName, metadata });

describe("describeActivity", () => {
  it("describes task activity with the task title", () => {
    expect(describeActivity(entry("task.completed", { title: "Booking fotografer" }))).toBe(
      "Putri menyelesaikan tugas “Booking fotografer”",
    );
    expect(describeActivity(entry("task.created", { title: "Survei cincin" }))).toBe("Putri menambahkan tugas “Survei cincin”");
    expect(describeActivity(entry("task.deleted", {}))).toBe("Putri menghapus sebuah tugas");
  });

  it("describes wedding and partner activity", () => {
    expect(describeActivity(entry("partner.joined"))).toBe("Putri bergabung ke workspace");
    expect(describeActivity(entry("partner.invited", { email: "pu***@gmail.com" }, "Fajar"))).toBe(
      "Fajar mengundang pu***@gmail.com sebagai pasangan",
    );
    expect(describeActivity(entry("partner.removed", { name: "Putri" }, "Fajar"))).toBe("Fajar mengeluarkan Putri dari workspace");
    expect(describeActivity(entry("wedding.date_changed", { to: "2027-12-20", recalculated: 12 }, "Fajar"))).toBe(
      "Fajar mengubah tanggal pernikahan menjadi Senin, 20 Desember 2027 dan menghitung ulang 12 tenggat tugas",
    );
    expect(describeActivity(entry("checklist.generated", { count: 80 }))).toBe("Putri membuat checklist otomatis (80 tugas)");
  });

  it("has a sentence for every known action", () => {
    for (const action of ACTIVITY_ACTIONS) {
      expect(describeActivity(entry(action)), action).not.toBe("Putri melakukan perubahan");
    }
  });

  it("is robust against unexpected metadata", () => {
    expect(describeActivity(entry("task.updated", "oops"))).toBe("Putri mengubah sebuah tugas");
    expect(describeActivity(entry("task.updated", { title: 42 }))).toBe("Putri mengubah sebuah tugas");
    expect(describeActivity(entry("wedding.date_changed", { to: "bukan-tanggal" }))).toBe("Putri mengubah tanggal pernikahan");
    expect(describeActivity(entry("unknown.action", null, "  "))).toBe("Seseorang melakukan perubahan");
  });
});

describe("maskEmail", () => {
  it("hides most of the local part", () => {
    expect(maskEmail("putri.ayu@gmail.com")).toBe("pu***@gmail.com");
    expect(maskEmail("ab@x.id")).toBe("a***@x.id");
    expect(maskEmail("a@x.id")).toBe("a***@x.id");
    expect(maskEmail("invalid")).toBe("***");
  });
});

describe("formatRelativeTime", () => {
  const now = new Date("2027-06-01T12:00:00Z");

  it("uses Indonesian relative phrases for recent events", () => {
    expect(formatRelativeTime(new Date("2027-06-01T11:59:50Z"), now)).toBe("baru saja");
    expect(formatRelativeTime(new Date("2027-06-01T11:55:00Z"), now)).toContain("menit");
    expect(formatRelativeTime(new Date("2027-06-01T09:00:00Z"), now)).toContain("jam");
    expect(formatRelativeTime(new Date("2027-05-29T12:00:00Z"), now)).toContain("hari");
  });

  it("falls back to an absolute date after a week", () => {
    expect(formatRelativeTime(new Date("2027-05-01T12:00:00Z"), now, "Asia/Jakarta")).toMatch(/2027/);
  });
});
