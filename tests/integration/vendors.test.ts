import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addDaysIso, todayIsoInTimeZone } from "@/lib/dates";
import type { BookVendorInput, VendorCreateInput, VendorResearchInput } from "@/lib/validation/vendor";
import { DEFAULT_RESEARCH_FILTERS, DEFAULT_VENDOR_FILTERS } from "@/lib/vendor-filters";
import { getRecentActivity } from "@/server/activity/activity-service";
import { WeddingAccessError } from "@/server/authz/wedding-access";
import {
  createExpense,
  deleteExpense,
  getBudgetOverview,
  getExpenseForUser,
  recordPayment,
  updateExpense,
} from "@/server/budget/budget-service";
import { getDb } from "@/server/db";
import {
  bookVendorFromResearch,
  createVendor,
  createVendorResearch,
  deleteVendor,
  deleteVendorResearch,
  getResearchForComparison,
  getVendorForUser,
  getVendorResearchForUser,
  getVendorSummary,
  listVendorResearch,
  listVendors,
  updateVendor,
  updateVendorResearch,
} from "@/server/vendors/vendor-service";
import { createTestUser, deleteUsers, ensureReferenceData } from "../support/integration-helpers";
import { createOwnerWorkspace } from "../support/workspace-helpers";

const userIds: string[] = [];
const M = 1_000_000n;
const today = todayIsoInTimeZone(new Date());
let vendorCategoryIds: Map<string, string>;

beforeAll(async () => {
  await ensureReferenceData();
  const rows = await getDb().vendorCategory.findMany({ select: { id: true, code: true } });
  vendorCategoryIds = new Map(rows.map((row) => [row.code, row.id]));
});

afterAll(async () => {
  await deleteUsers(userIds);
});

function vendorCategory(code: string): string {
  const id = vendorCategoryIds.get(code);
  if (!id) throw new Error(`missing vendor category ${code}`);
  return id;
}

async function budgetCategory(weddingId: string, name: string): Promise<string> {
  return (await getDb().budgetCategory.findFirstOrThrow({ where: { weddingId, name } })).id;
}

function researchInput(overrides: Partial<VendorResearchInput> = {}): VendorResearchInput {
  return {
    name: "ABC Catering",
    categoryId: vendorCategory("CATERING"),
    contactPerson: "Bu Rina",
    whatsapp: "0812-3456-7890",
    phone: null,
    instagram: "abccatering",
    website: "https://abccatering.id/",
    estimatedPrice: 30n * M,
    packageName: "Paket 500 pax",
    location: "Bandung",
    rating: 4,
    pros: "Rasa enak, porsi banyak",
    cons: "DP 50%",
    notes: "Test food hari Sabtu",
    status: "SHORTLISTED",
    ...overrides,
  };
}

function bookInput(overrides: Partial<BookVendorInput> = {}): BookVendorInput {
  return { contractValue: null, budgetCategoryId: null, paymentDueDate: null, bookingDate: null, packageName: null, ...overrides };
}

async function newResearch(userId: string, weddingId: string, overrides: Partial<VendorResearchInput> = {}) {
  const result = await createVendorResearch(userId, weddingId, researchInput(overrides));
  if (!result.ok) throw new Error(`createVendorResearch failed: ${result.reason}`);
  return result.researchId;
}

function payment(amount: bigint) {
  return { amount, paymentDate: today, method: "BANK_TRANSFER" as const, reference: null, notes: null };
}

describe("vendor reference data", () => {
  it("seeds vendor categories with budget category suggestions", async () => {
    const categories = await getDb().vendorCategory.findMany({ where: { isActive: true } });
    expect(categories.length).toBeGreaterThanOrEqual(10);
    expect(categories.find((c) => c.code === "CATERING")?.budgetCategoryName).toBe("Catering");
  });
});

describe("PRD flow: research → compare → select → book → pay", () => {
  it("keeps research data, creates the booked vendor and its contract, and tracks payments", async () => {
    const { owner, weddingId } = await createOwnerWorkspace(userIds);
    const abc = await newResearch(owner.userId, weddingId);
    const xyz = await newResearch(owner.userId, weddingId, { name: "XYZ Catering", estimatedPrice: 25n * M, rating: 3, status: "MEETING" });

    expect((await listVendorResearch(owner.userId, weddingId, DEFAULT_RESEARCH_FILTERS)).total).toBe(2);
    const compared = await getResearchForComparison(owner.userId, weddingId, [xyz, abc]);
    expect(compared.map((row) => [row.name, row.estimatedPrice, row.rating])).toEqual([
      ["XYZ Catering", 25n * M, 3],
      ["ABC Catering", 30n * M, 4],
    ]);
    expect(await getVendorSummary(owner.userId, weddingId)).toMatchObject({ researching: 2, booked: 0, needingDp: 0, outstanding: 0n });

    const catering = await budgetCategory(weddingId, "Catering");
    const dueDate = addDaysIso(today, 30);
    const booked = await bookVendorFromResearch(
      owner.userId,
      abc,
      bookInput({ contractValue: 30n * M, budgetCategoryId: catering, paymentDueDate: dueDate, bookingDate: today }),
    );
    if (!booked.ok || !booked.expenseId) throw new Error("booking failed");

    // Research record is intact and linked.
    expect(await getVendorResearchForUser(owner.userId, abc)).toMatchObject({
      status: "SELECTED",
      estimatedPrice: 30n * M,
      rating: 4,
      pros: "Rasa enak, porsi banyak",
      cons: "DP 50%",
      notes: "Test food hari Sabtu",
      bookedVendor: { id: booked.vendorId, name: "ABC Catering" },
    });

    const vendor = await getVendorForUser(owner.userId, booked.vendorId);
    expect(vendor).toMatchObject({
      name: "ABC Catering",
      categoryId: vendorCategory("CATERING"),
      contactPerson: "Bu Rina",
      whatsapp: "0812-3456-7890",
      instagram: "abccatering",
      website: "https://abccatering.id/",
      packageName: "Paket 500 pax",
      notes: "Test food hari Sabtu",
      research: { id: abc, pros: "Rasa enak, porsi banyak", estimatedPrice: 30n * M },
    });
    expect(vendor?.money).toEqual({ contract: 30n * M, paid: 0n, outstanding: 30n * M, expenseCount: 1 });

    const expense = await getExpenseForUser(owner.userId, booked.expenseId);
    expect(expense).toMatchObject({ title: "Kontrak ABC Catering", totalAmount: 30n * M, categoryId: catering, vendorId: booked.vendorId });
    expect(await getVendorSummary(owner.userId, weddingId)).toMatchObject({
      researching: 1,
      booked: 1,
      needingDp: 1,
      contract: 30n * M,
      outstanding: 30n * M,
    });

    await recordPayment(owner.userId, booked.expenseId, payment(10n * M));
    expect((await getVendorForUser(owner.userId, booked.vendorId))?.money).toEqual({
      contract: 30n * M,
      paid: 10n * M,
      outstanding: 20n * M,
      expenseCount: 1,
    });
    const listed = await listVendors(owner.userId, weddingId, DEFAULT_VENDOR_FILTERS);
    expect(listed.items.map((item) => [item.name, item.money.outstanding])).toEqual([["ABC Catering", 20n * M]]);
    expect(await getVendorSummary(owner.userId, weddingId)).toMatchObject({ needingDp: 0, paid: 10n * M, outstanding: 20n * M });
    expect((await getBudgetOverview(owner.userId, weddingId)).totals).toMatchObject({ committed: 30n * M, paid: 10n * M });

    const activity = await getRecentActivity(owner.userId, weddingId, 5);
    expect(activity.find((entry) => entry.action === "vendor.booked")?.metadata).toEqual({ name: "ABC Catering", amount: "30000000" });
  });

  it("books a candidate exactly once under concurrent requests", async () => {
    const { owner, weddingId } = await createOwnerWorkspace(userIds);
    const research = await newResearch(owner.userId, weddingId);
    const catering = await budgetCategory(weddingId, "Catering");
    const input = bookInput({ contractValue: 30n * M, budgetCategoryId: catering });

    const results = await Promise.all([
      bookVendorFromResearch(owner.userId, research, input),
      bookVendorFromResearch(owner.userId, research, input),
    ]);
    const winner = results.find((r) => r.ok);
    const loser = results.find((r) => !r.ok);
    expect(winner?.ok).toBe(true);
    expect(loser).toMatchObject({ ok: false, reason: "already_selected" });
    if (winner?.ok && loser && !loser.ok && loser.reason === "already_selected" && loser.vendorId) {
      expect(loser.vendorId).toBe(winner.vendorId);
    }
    const db = getDb();
    expect(await db.vendor.count({ where: { weddingId } })).toBe(1);
    expect(await db.expense.count({ where: { weddingId } })).toBe(1);
  });

  it("keeps a booked candidate's status and blocks deleting it", async () => {
    const { owner, weddingId } = await createOwnerWorkspace(userIds);
    const research = await newResearch(owner.userId, weddingId);
    const booked = await bookVendorFromResearch(owner.userId, research, bookInput());
    if (!booked.ok) throw new Error("booking failed");
    expect(booked.expenseId).toBeNull();

    await updateVendorResearch(owner.userId, research, researchInput({ name: "ABC Catering (Bandung)", status: "REJECTED" }));
    expect(await getVendorResearchForUser(owner.userId, research)).toMatchObject({ name: "ABC Catering (Bandung)", status: "SELECTED" });
    expect(await deleteVendorResearch(owner.userId, research)).toEqual({ ok: false, reason: "is_selected" });
  });
});

describe("integrity and deletion rules", () => {
  it("rejects budget categories and vendors from another workspace (service + database)", async () => {
    const a = await createOwnerWorkspace(userIds, { name: "Alice" });
    const b = await createOwnerWorkspace(userIds, { name: "Bob" });
    const db = getDb();
    const researchA = await newResearch(a.owner.userId, a.weddingId);
    const cateringB = await budgetCategory(b.weddingId, "Catering");

    expect(await bookVendorFromResearch(a.owner.userId, researchA, bookInput({ contractValue: 1n * M, budgetCategoryId: cateringB }))).toEqual({
      ok: false,
      reason: "invalid_budget_category",
    });
    expect(await db.vendor.count({ where: { weddingId: a.weddingId } })).toBe(0);
    expect((await getVendorResearchForUser(a.owner.userId, researchA))?.status).toBe("SHORTLISTED");

    const vendorB = await createVendor(b.owner.userId, b.weddingId, {
      name: "Foto B",
      categoryId: vendorCategory("PHOTOGRAPHY"),
      contactPerson: null,
      whatsapp: null,
      phone: null,
      instagram: null,
      website: null,
      packageName: null,
      bookingDate: null,
      eventLabel: null,
      notes: null,
      contractValue: null,
      budgetCategoryId: null,
      paymentDueDate: null,
    });
    if (!vendorB.ok) throw new Error("createVendor failed");
    const cateringA = await budgetCategory(a.weddingId, "Catering");
    const expenseInput = { title: "Salah vendor", categoryId: cateringA, vendorId: vendorB.vendorId, totalAmount: 1n * M, dueDate: null, notes: null };

    expect(await createExpense(a.owner.userId, a.weddingId, expenseInput)).toEqual({ ok: false, reason: "invalid_vendor" });
    // Composite FK (vendor_id, wedding_id) blocks it even if the service were bypassed.
    await expect(
      db.expense.create({ data: { weddingId: a.weddingId, categoryId: cateringA, vendorId: vendorB.vendorId, title: "x", totalAmount: 1n } }),
    ).rejects.toThrow();

    const own = await createExpense(a.owner.userId, a.weddingId, { ...expenseInput, vendorId: null });
    if (!own.ok) throw new Error("createExpense failed");
    expect(await updateExpense(a.owner.userId, own.expenseId, expenseInput)).toEqual({ ok: false, reason: "invalid_vendor" });
  });

  it("protects vendors with expenses and returns deleted vendors' research to the shortlist", async () => {
    const { owner, weddingId } = await createOwnerWorkspace(userIds);
    const research = await newResearch(owner.userId, weddingId);
    const catering = await budgetCategory(weddingId, "Catering");
    const booked = await bookVendorFromResearch(owner.userId, research, bookInput({ contractValue: 5n * M, budgetCategoryId: catering }));
    if (!booked.ok || !booked.expenseId) throw new Error("booking failed");

    expect(await deleteVendor(owner.userId, booked.vendorId)).toEqual({ ok: false, reason: "has_expenses" });
    await deleteExpense(owner.userId, booked.expenseId);
    expect(await deleteVendor(owner.userId, booked.vendorId)).toEqual({ ok: true });

    const after = await getVendorResearchForUser(owner.userId, research);
    expect(after).toMatchObject({ status: "SHORTLISTED", bookedVendor: null, pros: "Rasa enak, porsi banyak" });
    expect(await deleteVendorResearch(owner.userId, research)).toEqual({ ok: true });
  });

  it("creates vendors directly, with or without a contract", async () => {
    const { owner, weddingId } = await createOwnerWorkspace(userIds);
    const photography = await budgetCategory(weddingId, "Fotografi");
    const base: VendorCreateInput = {
      name: "Foto Kita",
      categoryId: vendorCategory("PHOTOGRAPHY"),
      contactPerson: null,
      whatsapp: null,
      phone: null,
      instagram: "fotokita",
      website: null,
      packageName: "Full day",
      bookingDate: today,
      eventLabel: "Resepsi",
      notes: null,
      contractValue: null,
      budgetCategoryId: null,
      paymentDueDate: null,
    };
    const withoutContract = await createVendor(owner.userId, weddingId, base);
    expect(withoutContract).toMatchObject({ ok: true, expenseId: null });

    const withContract = await createVendor(owner.userId, weddingId, { ...base, name: "Video Kita", contractValue: 8n * M, budgetCategoryId: photography });
    if (!withContract.ok || !withContract.expenseId) throw new Error("createVendor failed");
    expect((await getVendorForUser(owner.userId, withContract.vendorId))?.money.contract).toBe(8n * M);

    expect(await createVendor(owner.userId, weddingId, { ...base, categoryId: randomUUID() })).toEqual({ ok: false, reason: "invalid_category" });

    if (!withoutContract.ok) throw new Error("unreachable");
    expect(await updateVendor(owner.userId, withoutContract.vendorId, { ...base, name: "Foto Kita Studio" })).toMatchObject({ ok: true });
    expect((await getVendorForUser(owner.userId, withoutContract.vendorId))?.name).toBe("Foto Kita Studio");

    const found = await listVendors(owner.userId, weddingId, { ...DEFAULT_VENDOR_FILTERS, q: "studio" });
    expect(found.items.map((item) => item.name)).toEqual(["Foto Kita Studio"]);
  });
});

describe("authorization", () => {
  it("blocks outsiders from every vendor operation (IDOR)", async () => {
    const { owner, weddingId } = await createOwnerWorkspace(userIds);
    const outsider = await createTestUser(userIds, "Outsider");
    const research = await newResearch(owner.userId, weddingId);
    const booked = await bookVendorFromResearch(owner.userId, await newResearch(owner.userId, weddingId, { name: "Other" }), bookInput());
    if (!booked.ok) throw new Error("booking failed");

    await expect(listVendorResearch(outsider.userId, weddingId, DEFAULT_RESEARCH_FILTERS)).rejects.toBeInstanceOf(WeddingAccessError);
    await expect(listVendors(outsider.userId, weddingId, DEFAULT_VENDOR_FILTERS)).rejects.toBeInstanceOf(WeddingAccessError);
    await expect(getVendorSummary(outsider.userId, weddingId)).rejects.toBeInstanceOf(WeddingAccessError);
    await expect(getResearchForComparison(outsider.userId, weddingId, [research])).rejects.toBeInstanceOf(WeddingAccessError);
    await expect(createVendorResearch(outsider.userId, weddingId, researchInput())).rejects.toBeInstanceOf(WeddingAccessError);
    expect(await getVendorResearchForUser(outsider.userId, research)).toBeNull();
    expect(await getVendorForUser(outsider.userId, booked.vendorId)).toBeNull();
    await expect(updateVendorResearch(outsider.userId, research, researchInput())).rejects.toBeInstanceOf(WeddingAccessError);
    await expect(deleteVendorResearch(outsider.userId, research)).rejects.toBeInstanceOf(WeddingAccessError);
    await expect(bookVendorFromResearch(outsider.userId, research, bookInput())).rejects.toBeInstanceOf(WeddingAccessError);
    await expect(deleteVendor(outsider.userId, booked.vendorId)).rejects.toBeInstanceOf(WeddingAccessError);
    await expect(deleteVendor(outsider.userId, "not-a-uuid")).rejects.toBeInstanceOf(WeddingAccessError);

    // Another couple's comparison never includes this couple's candidates.
    const other = await createOwnerWorkspace(userIds, { name: "Other" });
    expect(await getResearchForComparison(other.owner.userId, other.weddingId, [research])).toEqual([]);
    expect(await getDb().vendor.count({ where: { weddingId } })).toBe(1);
  });
});

describe("research listing", () => {
  it("filters by status view, category and search", async () => {
    const { owner, weddingId } = await createOwnerWorkspace(userIds);
    await newResearch(owner.userId, weddingId, { name: "Gedung Serbaguna", categoryId: vendorCategory("VENUE"), status: "RESEARCHING" });
    await newResearch(owner.userId, weddingId, { name: "Gedung Mahal", categoryId: vendorCategory("VENUE"), status: "REJECTED" });
    await newResearch(owner.userId, weddingId, { name: "Katering Enak", status: "CONTACTED", location: "Cimahi" });

    const active = await listVendorResearch(owner.userId, weddingId, DEFAULT_RESEARCH_FILTERS);
    expect(active.items.map((i) => i.name).sort()).toEqual(["Gedung Serbaguna", "Katering Enak"]);
    const all = await listVendorResearch(owner.userId, weddingId, { ...DEFAULT_RESEARCH_FILTERS, view: "all" });
    expect(all.total).toBe(3);
    const rejected = await listVendorResearch(owner.userId, weddingId, { ...DEFAULT_RESEARCH_FILTERS, view: "REJECTED" });
    expect(rejected.items.map((i) => i.name)).toEqual(["Gedung Mahal"]);
    const venues = await listVendorResearch(owner.userId, weddingId, { ...DEFAULT_RESEARCH_FILTERS, view: "all", categoryId: vendorCategory("VENUE") });
    expect(venues.total).toBe(2);
    const byLocation = await listVendorResearch(owner.userId, weddingId, { ...DEFAULT_RESEARCH_FILTERS, q: "cimahi" });
    expect(byLocation.items.map((i) => i.name)).toEqual(["Katering Enak"]);
  });
});
