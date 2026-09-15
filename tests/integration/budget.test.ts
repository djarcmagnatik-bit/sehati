import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { DEFAULT_EXPENSE_FILTERS } from "@/lib/budget-filters";
import { todayIsoInTimeZone } from "@/lib/dates";
import type { ExpenseInput, PaymentInput } from "@/lib/validation/budget";
import { getRecentActivity } from "@/server/activity/activity-service";
import { WeddingAccessError } from "@/server/authz/wedding-access";
import {
  createBudgetCategory,
  createExpense,
  deleteBudgetCategory,
  deleteExpense,
  deletePayment,
  getBudgetOverview,
  getExpenseForUser,
  getUpcomingPayments,
  initializeBudgetIfMissing,
  listExpenses,
  recordPayment,
  updateBudgetCategory,
  updateBudgetSettings,
  updateExpense,
} from "@/server/budget/budget-service";
import { getDb } from "@/server/db";
import { createTestUser, deleteUsers } from "../support/integration-helpers";
import { createOwnerWorkspace } from "../support/workspace-helpers";

const userIds: string[] = [];
const M = 1_000_000n;
const today = todayIsoInTimeZone(new Date());

afterAll(async () => {
  await deleteUsers(userIds);
});

async function categoryId(weddingId: string, name: string): Promise<string> {
  return (await getDb().budgetCategory.findFirstOrThrow({ where: { weddingId, name } })).id;
}

function expenseInput(category: string, overrides: Partial<ExpenseInput> = {}): ExpenseInput {
  return { title: "Pengeluaran", categoryId: category, vendorId: null, totalAmount: 10n * M, dueDate: null, notes: null, ...overrides };
}

function paymentInput(amount: bigint, overrides: Partial<PaymentInput> = {}): PaymentInput {
  return { amount, paymentDate: today, method: "BANK_TRANSFER", reference: null, notes: null, ...overrides };
}

async function newExpense(userId: string, weddingId: string, input: ExpenseInput): Promise<string> {
  const result = await createExpense(userId, weddingId, input);
  if (!result.ok) throw new Error(`createExpense failed: ${result.reason}`);
  return result.expenseId;
}

describe("budget initialization", () => {
  it("creates the default categories with new workspaces, exactly once", async () => {
    const { owner, weddingId } = await createOwnerWorkspace(userIds);
    const db = getDb();
    const templates = await db.budgetCategoryTemplate.count({ where: { isActive: true } });
    expect(templates).toBeGreaterThanOrEqual(10);
    expect(await db.budgetCategory.count({ where: { weddingId } })).toBe(templates);
    expect(await initializeBudgetIfMissing(owner.userId, weddingId)).toEqual({ ok: false, reason: "already_initialized" });

    // Simulate a workspace created before budgets existed; concurrent initialization.
    await db.budgetCategory.deleteMany({ where: { weddingId } });
    await db.wedding.update({ where: { id: weddingId }, data: { budgetInitializedAt: null } });
    const results = await Promise.all([
      initializeBudgetIfMissing(owner.userId, weddingId),
      initializeBudgetIfMissing(owner.userId, weddingId),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await db.budgetCategory.count({ where: { weddingId } })).toBe(templates);
  });
});

describe("PRD acceptance: contract Rp30.000.000 with DP Rp10.000.000", () => {
  it("reports paid Rp10jt and outstanding Rp20jt everywhere", async () => {
    const { owner, weddingId } = await createOwnerWorkspace(userIds);
    const catering = await categoryId(weddingId, "Catering");

    await updateBudgetCategory(owner.userId, catering, { name: "Catering", allocatedAmount: 35n * M });
    const expenseId = await newExpense(owner.userId, weddingId, expenseInput(catering, { title: "ABC Catering", totalAmount: 30n * M }));
    const payment = await recordPayment(owner.userId, expenseId, paymentInput(10n * M, { reference: "DP-001" }));
    expect(payment).toMatchObject({ ok: true, outstanding: 20n * M });

    const expense = await getExpenseForUser(owner.userId, expenseId);
    expect(expense).toMatchObject({ totalAmount: 30n * M, paid: 10n * M, outstanding: 20n * M, status: "partial" });

    const overview = await getBudgetOverview(owner.userId, weddingId);
    expect(overview.totals).toMatchObject({
      target: 100n * M,
      allocated: 35n * M,
      committed: 30n * M,
      paid: 10n * M,
      unpaid: 20n * M,
      remaining: 70n * M,
      warning: "none",
      overAllocated: false,
    });
    expect(overview.categories.find((c) => c.id === catering)).toMatchObject({
      allocated: 35n * M,
      committed: 30n * M,
      paid: 10n * M,
      outstanding: 20n * M,
      remaining: 5n * M,
      usagePercent: 85,
      warning: "near",
      expenseCount: 1,
    });

    const upcoming = await getUpcomingPayments(owner.userId, weddingId);
    expect(upcoming.map((e) => [e.title, e.outstanding])).toEqual([["ABC Catering", 20n * M]]);
  });
});

describe("financial integrity", () => {
  it("keeps totals correct across create, edit and delete", async () => {
    const { owner, weddingId } = await createOwnerWorkspace(userIds);
    const venue = await categoryId(weddingId, "Venue");
    const expenseId = await newExpense(owner.userId, weddingId, expenseInput(venue, { title: "Gedung", totalAmount: 30n * M }));

    const first = await recordPayment(owner.userId, expenseId, paymentInput(5n * M));
    const second = await recordPayment(owner.userId, expenseId, paymentInput(25n * M));
    if (!first.ok || !second.ok) throw new Error("payment failed");
    expect(await getExpenseForUser(owner.userId, expenseId)).toMatchObject({ paid: 30n * M, outstanding: 0n, status: "paid" });
    expect(await recordPayment(owner.userId, expenseId, paymentInput(1n))).toEqual({
      ok: false,
      reason: "exceeds_outstanding",
      outstanding: 0n,
    });

    // Total cannot drop below what has been paid.
    expect(await updateExpense(owner.userId, expenseId, expenseInput(venue, { title: "Gedung", totalAmount: 25n * M }))).toEqual({
      ok: false,
      reason: "total_below_paid",
      paid: 30n * M,
    });
    expect((await updateExpense(owner.userId, expenseId, expenseInput(venue, { title: "Gedung", totalAmount: 40n * M }))).ok).toBe(true);
    expect(await getExpenseForUser(owner.userId, expenseId)).toMatchObject({ paid: 30n * M, outstanding: 10n * M, status: "partial" });

    expect(await deletePayment(owner.userId, second.paymentId)).toEqual({ expenseId });
    expect(await getExpenseForUser(owner.userId, expenseId)).toMatchObject({ paid: 5n * M, outstanding: 35n * M });
    expect((await getBudgetOverview(owner.userId, weddingId)).totals).toMatchObject({
      committed: 40n * M,
      paid: 5n * M,
      unpaid: 35n * M,
      remaining: 60n * M,
    });

    expect(await deleteExpense(owner.userId, expenseId)).toEqual({ ok: false, reason: "has_payments" });
    await deletePayment(owner.userId, first.paymentId);
    expect(await deleteExpense(owner.userId, expenseId)).toEqual({ ok: true });
    expect((await getBudgetOverview(owner.userId, weddingId)).totals).toMatchObject({ committed: 0n, paid: 0n, unpaid: 0n });
  });

  it("never lets concurrent payments exceed the expense total", async () => {
    const { owner, weddingId } = await createOwnerWorkspace(userIds);
    const venue = await categoryId(weddingId, "Venue");
    const expenseId = await newExpense(owner.userId, weddingId, expenseInput(venue, { totalAmount: 20n * M }));

    expect(await recordPayment(owner.userId, expenseId, paymentInput(25n * M))).toEqual({
      ok: false,
      reason: "exceeds_outstanding",
      outstanding: 20n * M,
    });

    const results = await Promise.all([
      recordPayment(owner.userId, expenseId, paymentInput(15n * M)),
      recordPayment(owner.userId, expenseId, paymentInput(15n * M)),
      recordPayment(owner.userId, expenseId, paymentInput(15n * M)),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const paid = await getDb().payment.aggregate({ where: { expenseId }, _sum: { amount: true } });
    expect(paid._sum.amount).toBe(15n * M);
  });

  it("enforces money integrity in the database itself", async () => {
    const a = await createOwnerWorkspace(userIds, { name: "Alice" });
    const b = await createOwnerWorkspace(userIds, { name: "Bob" });
    const db = getDb();
    const venueA = await categoryId(a.weddingId, "Venue");
    const expenseA = await newExpense(a.owner.userId, a.weddingId, expenseInput(venueA));

    await expect(db.budgetCategory.update({ where: { id: venueA }, data: { allocatedAmount: -1n } })).rejects.toThrow();
    await expect(db.expense.update({ where: { id: expenseA }, data: { totalAmount: 0n } })).rejects.toThrow();
    await expect(
      db.payment.create({
        data: { weddingId: a.weddingId, expenseId: expenseA, amount: 0n, paymentDate: new Date(), method: "CASH" },
      }),
    ).rejects.toThrow();
    // Composite FK: a payment cannot point at another workspace's expense.
    await expect(
      db.payment.create({
        data: { weddingId: b.weddingId, expenseId: expenseA, amount: 1n, paymentDate: new Date(), method: "CASH" },
      }),
    ).rejects.toThrow();
    // Composite FK: an expense cannot use another workspace's category.
    await expect(
      db.expense.create({ data: { weddingId: b.weddingId, categoryId: venueA, title: "x", totalAmount: 1n } }),
    ).rejects.toThrow();
  });
});

describe("categories and warnings", () => {
  it("manages categories with unique names and blocks deleting used ones", async () => {
    const { owner, weddingId } = await createOwnerWorkspace(userIds);
    const created = await createBudgetCategory(owner.userId, weddingId, { name: "Honeymoon", allocatedAmount: 5n * M });
    if (!created.ok) throw new Error("create failed");

    expect(await createBudgetCategory(owner.userId, weddingId, { name: "honeymoon", allocatedAmount: 0n })).toEqual({
      ok: false,
      reason: "duplicate_name",
    });
    expect(await updateBudgetCategory(owner.userId, created.categoryId, { name: "VENUE", allocatedAmount: 0n })).toEqual({
      ok: false,
      reason: "duplicate_name",
    });

    const expenseId = await newExpense(owner.userId, weddingId, expenseInput(created.categoryId));
    expect(await deleteBudgetCategory(owner.userId, created.categoryId)).toEqual({ ok: false, reason: "has_expenses" });
    await deleteExpense(owner.userId, expenseId);
    expect(await deleteBudgetCategory(owner.userId, created.categoryId)).toEqual({ ok: true });
  });

  it("uses the configurable warning threshold for categories and the target", async () => {
    const { owner, weddingId } = await createOwnerWorkspace(userIds);
    const catering = await categoryId(weddingId, "Catering");
    const decor = await categoryId(weddingId, "Dekorasi");
    await updateBudgetCategory(owner.userId, catering, { name: "Catering", allocatedAmount: 35n * M });
    await newExpense(owner.userId, weddingId, expenseInput(catering, { totalAmount: 30n * M }));
    await newExpense(owner.userId, weddingId, expenseInput(decor, { totalAmount: 1n * M })); // no allocation

    await updateBudgetSettings(owner.userId, weddingId, { targetBudget: 100n * M, warningPercent: 90 });
    let overview = await getBudgetOverview(owner.userId, weddingId);
    expect(overview.categories.find((c) => c.id === catering)?.warning).toBe("none");
    expect(overview.categories.find((c) => c.id === decor)?.warning).toBe("over");

    await updateBudgetSettings(owner.userId, weddingId, { targetBudget: 30n * M, warningPercent: 80 });
    overview = await getBudgetOverview(owner.userId, weddingId);
    expect(overview.categories.find((c) => c.id === catering)?.warning).toBe("near");
    expect(overview.totals).toMatchObject({ warning: "over", overAllocated: true, remaining: -1n * M });

    await updateBudgetSettings(owner.userId, weddingId, { targetBudget: null, warningPercent: 80 });
    expect((await getBudgetOverview(owner.userId, weddingId)).totals).toMatchObject({ target: null, remaining: null, warning: "none" });
  });
});

describe("authorization and collaboration", () => {
  it("blocks outsiders from every budget operation (IDOR)", async () => {
    const { owner, weddingId } = await createOwnerWorkspace(userIds);
    const other = await createOwnerWorkspace(userIds, { name: "Other" });
    const outsider = await createTestUser(userIds, "Outsider");
    const venue = await categoryId(weddingId, "Venue");
    const expenseId = await newExpense(owner.userId, weddingId, expenseInput(venue));
    const payment = await recordPayment(owner.userId, expenseId, paymentInput(1n * M));
    if (!payment.ok) throw new Error("payment failed");

    await expect(getBudgetOverview(outsider.userId, weddingId)).rejects.toBeInstanceOf(WeddingAccessError);
    await expect(listExpenses(outsider.userId, weddingId, DEFAULT_EXPENSE_FILTERS)).rejects.toBeInstanceOf(WeddingAccessError);
    await expect(getUpcomingPayments(outsider.userId, weddingId)).rejects.toBeInstanceOf(WeddingAccessError);
    await expect(updateBudgetSettings(outsider.userId, weddingId, { targetBudget: 1n, warningPercent: 50 })).rejects.toBeInstanceOf(
      WeddingAccessError,
    );
    await expect(createBudgetCategory(outsider.userId, weddingId, { name: "x", allocatedAmount: 0n })).rejects.toBeInstanceOf(
      WeddingAccessError,
    );
    await expect(updateBudgetCategory(outsider.userId, venue, { name: "x", allocatedAmount: 0n })).rejects.toBeInstanceOf(
      WeddingAccessError,
    );
    await expect(deleteBudgetCategory(outsider.userId, venue)).rejects.toBeInstanceOf(WeddingAccessError);
    await expect(createExpense(outsider.userId, weddingId, expenseInput(venue))).rejects.toBeInstanceOf(WeddingAccessError);
    expect(await getExpenseForUser(outsider.userId, expenseId)).toBeNull();
    await expect(updateExpense(outsider.userId, expenseId, expenseInput(venue))).rejects.toBeInstanceOf(WeddingAccessError);
    await expect(deleteExpense(outsider.userId, expenseId)).rejects.toBeInstanceOf(WeddingAccessError);
    await expect(recordPayment(outsider.userId, expenseId, paymentInput(1n))).rejects.toBeInstanceOf(WeddingAccessError);
    await expect(deletePayment(outsider.userId, payment.paymentId)).rejects.toBeInstanceOf(WeddingAccessError);
    await expect(deletePayment(outsider.userId, "not-a-uuid")).rejects.toBeInstanceOf(WeddingAccessError);

    // A member of another workspace cannot use this workspace's category.
    expect(await createExpense(other.owner.userId, other.weddingId, expenseInput(venue))).toEqual({
      ok: false,
      reason: "invalid_category",
    });
    expect((await getExpenseForUser(owner.userId, expenseId))?.paid).toBe(1n * M);
  });

  it("partner shares the budget and payments are logged with amounts", async () => {
    const { owner, weddingId } = await createOwnerWorkspace(userIds);
    const partner = await createTestUser(userIds, "Putri");
    await getDb().weddingMember.create({ data: { weddingId, userId: partner.userId, role: "PARTNER", displayName: "Putri" } });
    const catering = await categoryId(weddingId, "Catering");
    const expenseId = await newExpense(owner.userId, weddingId, expenseInput(catering, { title: "ABC Catering", totalAmount: 30n * M }));

    await recordPayment(partner.userId, expenseId, paymentInput(2n * M));
    expect((await getBudgetOverview(owner.userId, weddingId)).totals.paid).toBe(2n * M);

    const [latest] = await getRecentActivity(owner.userId, weddingId, 1);
    expect(latest).toMatchObject({
      action: "payment.recorded",
      actorName: "Putri",
      metadata: { title: "ABC Catering", amount: "2000000" },
    });
  });
});

describe("expense listing", () => {
  it("filters by status, category and search (with LIKE wildcards escaped) and paginates", async () => {
    const { owner, weddingId } = await createOwnerWorkspace(userIds);
    const venue = await categoryId(weddingId, "Venue");
    const souvenir = await categoryId(weddingId, "Souvenir");

    const paidId = await newExpense(owner.userId, weddingId, expenseInput(venue, { title: "Diskon 50% gedung", totalAmount: 5n * M }));
    await recordPayment(owner.userId, paidId, paymentInput(5n * M));
    await newExpense(owner.userId, weddingId, expenseInput(venue, { title: "Diskon 500 ribu", totalAmount: 1n * M }));
    for (let i = 0; i < 31; i += 1) {
      await newExpense(owner.userId, weddingId, expenseInput(souvenir, { title: `Souvenir batch ${i}`, totalAmount: BigInt(i + 1) * 1000n }));
    }

    const all = await listExpenses(owner.userId, weddingId, DEFAULT_EXPENSE_FILTERS);
    expect(all.total).toBe(33);
    expect(all.items).toHaveLength(30);
    const page2 = await listExpenses(owner.userId, weddingId, { ...DEFAULT_EXPENSE_FILTERS, page: 2 });
    expect(page2.items).toHaveLength(3);
    expect(new Set([...all.items, ...page2.items].map((e) => e.id)).size).toBe(33);

    const paid = await listExpenses(owner.userId, weddingId, { ...DEFAULT_EXPENSE_FILTERS, status: "paid" });
    expect(paid.items.map((e) => e.id)).toEqual([paidId]);
    const outstanding = await listExpenses(owner.userId, weddingId, { ...DEFAULT_EXPENSE_FILTERS, status: "outstanding" });
    expect(outstanding.total).toBe(32);

    const search = await listExpenses(owner.userId, weddingId, { ...DEFAULT_EXPENSE_FILTERS, q: "50%" });
    expect(search.items.map((e) => e.title)).toEqual(["Diskon 50% gedung"]);

    const byCategory = await listExpenses(owner.userId, weddingId, { ...DEFAULT_EXPENSE_FILTERS, categoryId: venue });
    expect(byCategory.total).toBe(2);

    const largestOutstanding = await listExpenses(owner.userId, weddingId, { ...DEFAULT_EXPENSE_FILTERS, sort: "outstanding" });
    expect(largestOutstanding.items[0]?.title).toBe("Diskon 500 ribu");

    expect(await listExpenses(owner.userId, weddingId, { ...DEFAULT_EXPENSE_FILTERS, categoryId: randomUUID() })).toMatchObject({
      total: 0,
      items: [],
    });
  });
});
