import { readSheet } from "read-excel-file/node";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { describeActivity } from "@/lib/activity";
import { addDaysIso, isoToDbDate, todayIsoInTimeZone } from "@/lib/dates";
import { toCsv } from "@/lib/export/table";
import type { GuestInput } from "@/lib/validation/guests";
import { getRecentActivity } from "@/server/activity/activity-service";
import { WeddingAccessError } from "@/server/authz/wedding-access";
import { FeatureLockedError } from "@/server/billing/access";
import { createExpense, recordPayment, updateBudgetSettings } from "@/server/budget/budget-service";
import { getDb } from "@/server/db";
import { createGuest } from "@/server/guests/guest-service";
import { createRundownItem } from "@/server/planning/rundown-service";
import { buildExport, toXlsxBuffer } from "@/server/reports/export-service";
import { getProgressCard } from "@/server/reports/progress-card-service";
import { getGuestReport, getTaskReport, getVendorReport } from "@/server/reports/report-service";
import { createVendor } from "@/server/vendors/vendor-service";
import { createTestUser, deleteUsers, ensureReferenceData } from "../support/integration-helpers";
import { createOwnerWorkspace } from "../support/workspace-helpers";

const userIds: string[] = [];
const M = 1_000_000n;
const today = todayIsoInTimeZone(new Date());

beforeAll(async () => {
  await ensureReferenceData();
});

afterAll(async () => {
  await deleteUsers(userIds);
});

function guestInput(overrides: Partial<GuestInput> = {}): GuestInput {
  return {
    guestName: "Ahmad Fauzi",
    invitationName: "Keluarga Bapak Ahmad",
    groupId: null,
    phone: "0812-3456-7890",
    email: null,
    address: null,
    seatCount: 4,
    invitationStatus: "SENT",
    rsvpStatus: "PENDING",
    attendingCount: 0,
    notes: null,
    ...overrides,
  };
}

/** A wedding with guests, a vendor contract with a DP, an unrelated expense and a rundown item. */
async function populatedWorkspace() {
  const workspace = await createOwnerWorkspace(userIds);
  const { owner, weddingId } = workspace;
  const db = getDb();
  const group = await db.guestGroup.findFirstOrThrow({ where: { weddingId }, orderBy: { sortOrder: "asc" } });
  await createGuest(owner.userId, weddingId, guestInput({ groupId: group.id, rsvpStatus: "ATTENDING", attendingCount: 3 }));
  await createGuest(owner.userId, weddingId, guestInput({ invitationName: "=HYPERLINK(\"http://evil.example\")", guestName: "Iseng", seatCount: 2 }));
  await createGuest(owner.userId, weddingId, guestInput({ invitationName: "Ibu Sari", rsvpStatus: "DECLINED", seatCount: 1 }));

  const budgetCategory = await db.budgetCategory.findFirstOrThrow({ where: { weddingId }, select: { id: true } });
  const vendorCategory = await db.vendorCategory.findFirstOrThrow({ select: { id: true } });
  const vendor = await createVendor(owner.userId, weddingId, {
    name: "Katering Nusantara",
    categoryId: vendorCategory.id,
    contactPerson: "Bu Rina",
    whatsapp: null,
    phone: null,
    instagram: null,
    website: null,
    packageName: "Paket 500 pax",
    bookingDate: today,
    eventLabel: null,
    notes: null,
    contractValue: 30n * M,
    budgetCategoryId: budgetCategory.id,
    paymentDueDate: addDaysIso(today, 20),
  });
  if (!vendor.ok || !vendor.expenseId) throw new Error("vendor failed");
  await recordPayment(owner.userId, vendor.expenseId, { amount: 10n * M, paymentDate: today, method: "BANK_TRANSFER", reference: "DP-01", notes: null });
  await createExpense(owner.userId, weddingId, {
    title: "Souvenir",
    categoryId: budgetCategory.id,
    vendorId: null,
    totalAmount: 2n * M,
    dueDate: null,
    notes: "+62 hubungi toko",
  });
  await createRundownItem(owner.userId, weddingId, {
    title: "Akad nikah",
    itemDate: null,
    startTime: "09:00",
    endTime: "10:00",
    description: null,
    pic: "Penghulu",
    location: "Masjid",
    category: "Acara",
    notes: null,
  });
  return { ...workspace, vendorId: vendor.vendorId, groupName: group.name };
}

describe("data exports", () => {
  it("exports guests without their secret invitation links, and records the download", async () => {
    const { owner, weddingId, groupName } = await populatedWorkspace();
    const table = await buildExport(owner.userId, weddingId, "guests", "csv");
    expect(table.columns.map((column) => column.header)).toContain("Nama di undangan");
    expect(table.rows).toHaveLength(3);
    const ahmad = table.rows.find((row) => row[0] === "Keluarga Bapak Ahmad")!;
    expect(ahmad).toEqual(["Keluarga Bapak Ahmad", "Ahmad Fauzi", groupName, "0812-3456-7890", null, null, 4, "Terkirim", "Hadir", 3, null]);

    const tokens = await getDb().guest.findMany({ where: { weddingId }, select: { invitationToken: true } });
    const csv = toCsv(table);
    for (const { invitationToken } of tokens) expect(csv).not.toContain(invitationToken);
    expect(csv).toContain(`"'=HYPERLINK(""http://evil.example"")"`);

    const [latest] = await getRecentActivity(owner.userId, weddingId, 1);
    expect(latest).toMatchObject({ action: "data.exported", metadata: { name: "Tamu", format: "CSV", count: 3 } });
    expect(describeActivity(latest!)).toBe("Fajar mengunduh data tamu (CSV)");
  });

  it("writes typed XLSX cells: numbers stay numbers and formula-like text stays text", async () => {
    const { owner, weddingId } = await populatedWorkspace();
    const buffer = await toXlsxBuffer(await buildExport(owner.userId, weddingId, "guests", "xlsx"));
    const rows = (await readSheet(buffer)) as unknown[][];
    expect(rows[0]).toContain("Jumlah kursi");
    const formulaRow = rows.find((row) => typeof row[0] === "string" && row[0].startsWith("=HYPERLINK"));
    expect(formulaRow?.[0]).toBe('=HYPERLINK("http://evil.example")');
    expect(typeof formulaRow?.[6]).toBe("number");
  });

  it("computes vendor, expense and payment money from the rows", async () => {
    const { owner, weddingId } = await populatedWorkspace();
    const vendors = await buildExport(owner.userId, weddingId, "vendors", "csv");
    expect(vendors.rows).toHaveLength(1);
    const header = vendors.columns.map((column) => column.header);
    const row = vendors.rows[0]!;
    expect(row[header.indexOf("Nilai kontrak")]).toBe(30n * M);
    expect(row[header.indexOf("Dibayar")]).toBe(10n * M);
    expect(row[header.indexOf("Sisa")]).toBe(20n * M);

    const expenses = await buildExport(owner.userId, weddingId, "expenses", "csv");
    expect(expenses.rows.map((item) => [item[0], item[3], item[4], item[5], item[6]])).toEqual(
      expect.arrayContaining([
        ["Souvenir", 2n * M, 0n, 2n * M, "Belum dibayar"],
        [expect.any(String), 30n * M, 10n * M, 20n * M, "Dibayar sebagian"],
      ]),
    );
    expect(toCsv(expenses)).toContain("'+62 hubungi toko");

    const payments = await buildExport(owner.userId, weddingId, "payments", "xlsx");
    expect(payments.rows).toEqual([[today, expect.any(String), expect.any(String), "Katering Nusantara", 10n * M, "Transfer bank", "DP-01", null]]);

    const rundown = await buildExport(owner.userId, weddingId, "rundown", "csv");
    expect(rundown.rows[0]).toEqual([expect.any(String), "09:00", "10:00", "Akad nikah", null, "Penghulu", "Masjid", "Acara", null]);
  });

  it("refuses outsiders and weddings without the matching access", async () => {
    const { weddingId } = await populatedWorkspace();
    const outsider = await createTestUser(userIds, "Asing");
    await expect(buildExport(outsider.userId, weddingId, "guests", "csv")).rejects.toBeInstanceOf(WeddingAccessError);

    const free = await createOwnerWorkspace(userIds, { access: "free" });
    for (const dataset of ["guests", "vendors", "expenses", "payments", "rundown"] as const) {
      await expect(buildExport(free.owner.userId, free.weddingId, dataset, "csv")).rejects.toBeInstanceOf(FeatureLockedError);
    }
    expect(await getDb().activityLog.count({ where: { weddingId: free.weddingId, action: "data.exported" } })).toBe(0);
  });
});

describe("reports", () => {
  it("summarizes tasks per category with overdue counts", async () => {
    const { owner, weddingId } = await createOwnerWorkspace(userIds, { access: "free" });
    const db = getDb();
    await db.task.deleteMany({ where: { weddingId } });
    const [first, second] = await db.taskCategory.findMany({ orderBy: { sortOrder: "asc" }, take: 2, select: { id: true } });
    const task = (categoryId: string, status: "TODO" | "COMPLETED" | "CANCELLED", dueIso: string | null) =>
      db.task.create({ data: { weddingId, categoryId, title: "Tugas", status, source: "CUSTOM", dueDate: dueIso ? isoToDbDate(dueIso) : null } });
    await task(first!.id, "COMPLETED", addDaysIso(today, -5));
    await task(first!.id, "TODO", addDaysIso(today, -1));
    await task(first!.id, "CANCELLED", addDaysIso(today, -1));
    await task(second!.id, "TODO", addDaysIso(today, 10));

    const report = await getTaskReport(owner.userId, weddingId, today);
    expect(report).toMatchObject({ total: 3, completed: 1, overdue: 1, percent: 33, cancelled: 1 });
    expect(report.categories.map((row) => [row.total, row.completed, row.overdue, row.percent])).toEqual([
      [2, 1, 1, 50],
      [1, 0, 0, 0],
    ]);
  });

  it("breaks guests down per group and lists vendors with their next due date", async () => {
    const { owner, weddingId, groupName, vendorId } = await populatedWorkspace();
    const guests = await getGuestReport(owner.userId, weddingId);
    expect(guests.guests).toHaveLength(3);
    expect(guests.groups).toEqual(
      expect.arrayContaining([
        { name: groupName, invitations: 1, seats: 4, attendingSeats: 3, declined: 0, pending: 0 },
        { name: "Tanpa grup", invitations: 2, seats: 3, attendingSeats: 0, declined: 1, pending: 1 },
      ]),
    );

    const vendors = await getVendorReport(owner.userId, weddingId);
    expect(vendors.rows).toEqual([
      { id: vendorId, name: "Katering Nusantara", category: expect.any(String), contract: 30n * M, paid: 10n * M, outstanding: 20n * M, nextDueIso: addDaysIso(today, 20) },
    ]);
    expect(vendors.totals).toEqual({ contract: 30n * M, paid: 10n * M, outstanding: 20n * M });
  });
});

describe("progress card", () => {
  it("shows percentages by default and amounts only when chosen", async () => {
    const { owner, weddingId } = await populatedWorkspace();
    await updateBudgetSettings(owner.userId, weddingId, { targetBudget: 64n * M, warningPercent: 80 });

    const minimal = await getProgressCard(owner.userId, weddingId, { checklist: true, nextTasks: false, guests: false, budget: false, budgetAmounts: false });
    expect(minimal).toMatchObject({ budget: null, guests: null, nextTasks: null, unavailable: [] });
    expect(minimal.countdownDays).toBe(400);
    expect(minimal.checklist?.total).toBeGreaterThan(0);

    const percentOnly = await getProgressCard(owner.userId, weddingId, { checklist: false, nextTasks: true, guests: true, budget: true, budgetAmounts: false });
    // Committed 32 of 64 million, 10 of 32 million paid.
    expect(percentOnly.budget).toEqual({ usedPercent: 50, paidPercent: 31, committed: null, target: null, paid: null });
    expect(JSON.stringify(percentOnly)).not.toMatch(/Rp/);
    expect(percentOnly.guests).toEqual({ attendingSeats: 3, invitations: 3, respondedPercent: 66 });
    expect(percentOnly.nextTasks).toHaveLength(3);

    const withAmounts = await getProgressCard(owner.userId, weddingId, { checklist: false, nextTasks: false, guests: false, budget: true, budgetAmounts: true });
    expect(withAmounts.budget?.committed).toMatch(/32\.000\.000/);
    expect(withAmounts.budget?.target).toMatch(/64\.000\.000/);
  });

  it("leaves out sections the wedding cannot use, and refuses outsiders", async () => {
    const free = await createOwnerWorkspace(userIds, { access: "free" });
    const card = await getProgressCard(free.owner.userId, free.weddingId, { checklist: true, nextTasks: false, guests: true, budget: true, budgetAmounts: true });
    expect(card).toMatchObject({ guests: null, budget: null, unavailable: ["guests", "budget"] });

    const outsider = await createTestUser(userIds, "Asing");
    await expect(getProgressCard(outsider.userId, free.weddingId, { checklist: true, nextTasks: false, guests: false, budget: false, budgetAmounts: false })).rejects.toBeInstanceOf(
      WeddingAccessError,
    );
  });
});
