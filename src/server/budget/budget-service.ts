import "server-only";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { budgetWarningLevel, expensePaymentState, percentOf, summarizeBudget } from "@/lib/budget";
import { EXPENSE_PAGE_SIZE, type ExpenseFilters, type ExpenseSort } from "@/lib/budget-filters";
import { isoToDbDate } from "@/lib/dates";
import type { BudgetCategoryInput, BudgetSettingsInput, ExpenseInput, PaymentInput } from "@/lib/validation/budget";
import { recordActivity } from "@/server/activity/activity-service";
import { memberWeddingWhere, requireWeddingMember, WeddingAccessError } from "@/server/authz/wedding-access";
import { getDb } from "@/server/db";

type Tx = Prisma.TransactionClient;

const uuidSchema = z.uuid();
const isUuid = (value: string) => uuidSchema.safeParse(value).success;

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/** Row lock that serializes every change to one expense's payments / total. */
async function lockExpense(tx: Tx, expenseId: string): Promise<void> {
  await tx.$queryRaw`SELECT 1 AS locked FROM expenses WHERE id = ${expenseId}::uuid FOR UPDATE`;
}

async function sumPayments(tx: Tx, expenseId: string): Promise<bigint> {
  const result = await tx.payment.aggregate({ where: { expenseId }, _sum: { amount: true } });
  return result._sum.amount ?? 0n;
}

// ─── Initialization ──────────────────────────────────────────────────────────

export async function createBudgetCategoriesFromTemplates(tx: Tx, weddingId: string): Promise<number> {
  const templates = await tx.budgetCategoryTemplate.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { name: true, sortOrder: true },
  });
  if (templates.length === 0) return 0;
  const result = await tx.budgetCategory.createMany({
    data: templates.map((template) => ({ weddingId, name: template.name, sortOrder: template.sortOrder })),
    skipDuplicates: true,
  });
  return result.count;
}

export type InitializeBudgetResult = { ok: true; created: number } | { ok: false; reason: "already_initialized" };

/** For workspaces created before budgets existed. Runs at most once per wedding. */
export async function initializeBudgetIfMissing(
  userId: string,
  weddingId: string,
  now: Date = new Date(),
): Promise<InitializeBudgetResult> {
  const membership = await requireWeddingMember(userId, weddingId);
  return getDb().$transaction(async (tx) => {
    const claimed = await tx.wedding.updateMany({
      where: { id: membership.weddingId, budgetInitializedAt: null, deletedAt: null },
      data: { budgetInitializedAt: now },
    });
    if (claimed.count === 0) return { ok: false, reason: "already_initialized" } as const;

    const created = await createBudgetCategoriesFromTemplates(tx, membership.weddingId);
    await recordActivity(tx, {
      weddingId: membership.weddingId,
      userId,
      actorName: membership.displayName,
      action: "budget.initialized",
      entityType: "budget",
      entityId: membership.weddingId,
      metadata: { count: created },
    });
    return { ok: true, created } as const;
  });
}

// ─── Overview & settings ─────────────────────────────────────────────────────

export async function getBudgetOverview(userId: string, weddingId: string) {
  const membership = await requireWeddingMember(userId, weddingId);
  const id = membership.weddingId;
  const db = getDb();

  const [wedding, categories, committedRows, paidRows] = await Promise.all([
    db.wedding.findUniqueOrThrow({
      where: { id },
      select: { targetBudget: true, budgetWarningPercent: true, budgetInitializedAt: true },
    }),
    db.budgetCategory.findMany({
      where: { weddingId: id },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, allocatedAmount: true },
    }),
    db.expense.groupBy({
      by: ["categoryId"],
      where: { weddingId: id },
      _sum: { totalAmount: true },
      _count: { _all: true },
    }),
    db.$queryRaw<Array<{ category_id: string; paid: string }>>`
      SELECT e.category_id::text AS category_id, SUM(p.amount)::text AS paid
      FROM payments p
      JOIN expenses e ON e.id = p.expense_id
      WHERE p.wedding_id = ${id}::uuid
      GROUP BY e.category_id
    `,
  ]);

  const committedByCategory = new Map(
    committedRows.map((row) => [row.categoryId, { committed: row._sum.totalAmount ?? 0n, count: row._count._all }]),
  );
  const paidByCategory = new Map(paidRows.map((row) => [row.category_id, BigInt(row.paid)]));
  const threshold = wedding.budgetWarningPercent;

  const rows = categories.map((category) => {
    const committed = committedByCategory.get(category.id)?.committed ?? 0n;
    const paid = paidByCategory.get(category.id) ?? 0n;
    return {
      id: category.id,
      name: category.name,
      allocated: category.allocatedAmount,
      committed,
      paid,
      outstanding: committed - paid,
      remaining: category.allocatedAmount - committed,
      usagePercent: percentOf(committed, category.allocatedAmount),
      warning: budgetWarningLevel(committed, category.allocatedAmount, threshold),
      expenseCount: committedByCategory.get(category.id)?.count ?? 0,
    };
  });

  return {
    weddingId: id,
    targetBudget: wedding.targetBudget,
    warningPercent: threshold,
    initialized: wedding.budgetInitializedAt !== null,
    categories: rows,
    totals: summarizeBudget(wedding.targetBudget, rows, threshold),
  };
}

export async function updateBudgetSettings(userId: string, weddingId: string, input: BudgetSettingsInput): Promise<void> {
  const membership = await requireWeddingMember(userId, weddingId);
  await getDb().$transaction(async (tx) => {
    await tx.wedding.update({
      where: { id: membership.weddingId },
      data: { targetBudget: input.targetBudget, budgetWarningPercent: input.warningPercent },
    });
    await recordActivity(tx, {
      weddingId: membership.weddingId,
      userId,
      actorName: membership.displayName,
      action: "budget.settings_updated",
      entityType: "budget",
      entityId: membership.weddingId,
      metadata: { amount: input.targetBudget?.toString() ?? null, warningPercent: input.warningPercent },
    });
  });
}

// ─── Categories ──────────────────────────────────────────────────────────────

export async function getBudgetCategoryOptions(userId: string, weddingId: string) {
  const membership = await requireWeddingMember(userId, weddingId);
  return getDb().budgetCategory.findMany({
    where: { weddingId: membership.weddingId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true },
  });
}

export async function getBudgetCategoryForUser(userId: string, categoryId: string) {
  if (!isUuid(categoryId)) return null;
  return getDb().budgetCategory.findFirst({
    where: { id: categoryId, wedding: memberWeddingWhere(userId) },
    select: { id: true, weddingId: true, name: true, allocatedAmount: true, _count: { select: { expenses: true } } },
  });
}

async function categoryNameTaken(tx: Tx, weddingId: string, name: string, excludeId?: string): Promise<boolean> {
  const existing = await tx.budgetCategory.findFirst({
    where: {
      weddingId,
      name: { equals: name, mode: "insensitive" },
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
    select: { id: true },
  });
  return existing !== null;
}

export type BudgetCategoryResult = { ok: true; categoryId: string } | { ok: false; reason: "duplicate_name" };

export async function createBudgetCategory(
  userId: string,
  weddingId: string,
  input: BudgetCategoryInput,
): Promise<BudgetCategoryResult> {
  const membership = await requireWeddingMember(userId, weddingId);
  try {
    return await getDb().$transaction(async (tx) => {
      if (await categoryNameTaken(tx, membership.weddingId, input.name)) {
        return { ok: false, reason: "duplicate_name" } as const;
      }
      const last = await tx.budgetCategory.aggregate({
        where: { weddingId: membership.weddingId },
        _max: { sortOrder: true },
      });
      const category = await tx.budgetCategory.create({
        data: {
          weddingId: membership.weddingId,
          name: input.name,
          allocatedAmount: input.allocatedAmount,
          sortOrder: (last._max.sortOrder ?? 0) + 10,
        },
        select: { id: true },
      });
      await recordActivity(tx, {
        weddingId: membership.weddingId,
        userId,
        actorName: membership.displayName,
        action: "budget.category_created",
        entityType: "budget_category",
        entityId: category.id,
        metadata: { name: input.name, amount: input.allocatedAmount.toString() },
      });
      return { ok: true, categoryId: category.id } as const;
    });
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, reason: "duplicate_name" };
    throw error;
  }
}

export async function updateBudgetCategory(
  userId: string,
  categoryId: string,
  input: BudgetCategoryInput,
): Promise<BudgetCategoryResult> {
  const category = await getBudgetCategoryForUser(userId, categoryId);
  if (!category) throw new WeddingAccessError();
  const membership = await requireWeddingMember(userId, category.weddingId);

  try {
    return await getDb().$transaction(async (tx) => {
      if (await categoryNameTaken(tx, category.weddingId, input.name, category.id)) {
        return { ok: false, reason: "duplicate_name" } as const;
      }
      await tx.budgetCategory.update({
        where: { id: category.id },
        data: { name: input.name, allocatedAmount: input.allocatedAmount },
      });
      await recordActivity(tx, {
        weddingId: category.weddingId,
        userId,
        actorName: membership.displayName,
        action: "budget.category_updated",
        entityType: "budget_category",
        entityId: category.id,
        metadata: { name: input.name, amount: input.allocatedAmount.toString() },
      });
      return { ok: true, categoryId: category.id } as const;
    });
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, reason: "duplicate_name" };
    throw error;
  }
}

export async function deleteBudgetCategory(
  userId: string,
  categoryId: string,
): Promise<{ ok: true } | { ok: false; reason: "has_expenses" }> {
  const category = await getBudgetCategoryForUser(userId, categoryId);
  if (!category) throw new WeddingAccessError();
  if (category._count.expenses > 0) return { ok: false, reason: "has_expenses" };
  const membership = await requireWeddingMember(userId, category.weddingId);

  await getDb().$transaction(async (tx) => {
    await tx.budgetCategory.delete({ where: { id: category.id } });
    await recordActivity(tx, {
      weddingId: category.weddingId,
      userId,
      actorName: membership.displayName,
      action: "budget.category_deleted",
      entityType: "budget_category",
      entityId: category.id,
      metadata: { name: category.name },
    });
  });
  return { ok: true };
}

// ─── Expenses ────────────────────────────────────────────────────────────────

type ExpenseRow = {
  id: string;
  title: string;
  total_amount: string;
  paid: string;
  due_date: string | null;
  category_id: string;
  category_name: string;
};

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

const EXPENSE_ORDER: Record<ExpenseSort, Prisma.Sql> = {
  due: Prisma.sql`e.due_date ASC NULLS LAST, e.created_at DESC, e.id ASC`,
  recent: Prisma.sql`e.created_at DESC, e.id ASC`,
  amount: Prisma.sql`e.total_amount DESC, e.id ASC`,
  outstanding: Prisma.sql`(e.total_amount - COALESCE(p.paid, 0)) DESC, e.due_date ASC NULLS LAST, e.id ASC`,
};

/** Outstanding per expense is computed in SQL from the payment rows, so filters/sorts stay exact. */
async function queryExpenses(weddingId: string, filters: ExpenseFilters, limit: number, offset: number) {
  const conditions: Prisma.Sql[] = [Prisma.sql`e.wedding_id = ${weddingId}::uuid`];
  if (filters.categoryId) conditions.push(Prisma.sql`e.category_id = ${filters.categoryId}::uuid`);
  if (filters.q) conditions.push(Prisma.sql`e.title ILIKE ${`%${escapeLike(filters.q)}%`} ESCAPE '\\'`);
  if (filters.status === "outstanding") conditions.push(Prisma.sql`COALESCE(p.paid, 0) < e.total_amount`);
  if (filters.status === "paid") conditions.push(Prisma.sql`COALESCE(p.paid, 0) >= e.total_amount`);

  const from = Prisma.sql`
    FROM expenses e
    JOIN budget_categories c ON c.id = e.category_id
    LEFT JOIN (
      SELECT expense_id, SUM(amount) AS paid FROM payments WHERE wedding_id = ${weddingId}::uuid GROUP BY expense_id
    ) p ON p.expense_id = e.id
    WHERE ${Prisma.join(conditions, " AND ")}
  `;

  const db = getDb();
  const [countRows, rows] = await Promise.all([
    db.$queryRaw<Array<{ count: number }>>`SELECT COUNT(*)::int AS count ${from}`,
    db.$queryRaw<ExpenseRow[]>`
      SELECT e.id::text AS id, e.title, e.total_amount::text AS total_amount, COALESCE(p.paid, 0)::text AS paid,
             to_char(e.due_date, 'YYYY-MM-DD') AS due_date, c.id::text AS category_id, c.name AS category_name
      ${from}
      ORDER BY ${EXPENSE_ORDER[filters.sort]}
      LIMIT ${limit} OFFSET ${offset}
    `,
  ]);

  const items = rows.map((row) => {
    const totalAmount = BigInt(row.total_amount);
    const paid = BigInt(row.paid);
    return {
      id: row.id,
      title: row.title,
      totalAmount,
      paid,
      ...expensePaymentState(totalAmount, paid),
      dueDateIso: row.due_date,
      category: { id: row.category_id, name: row.category_name },
    };
  });
  return { total: countRows[0]?.count ?? 0, items };
}

export async function listExpenses(userId: string, weddingId: string, filters: ExpenseFilters) {
  const membership = await requireWeddingMember(userId, weddingId);
  const result = await queryExpenses(
    membership.weddingId,
    filters,
    EXPENSE_PAGE_SIZE,
    (filters.page - 1) * EXPENSE_PAGE_SIZE,
  );
  return { ...result, page: filters.page, pageSize: EXPENSE_PAGE_SIZE };
}

/** Expenses that still have an outstanding balance, nearest due date first. */
export async function getUpcomingPayments(userId: string, weddingId: string, limit = 5) {
  const membership = await requireWeddingMember(userId, weddingId);
  const result = await queryExpenses(
    membership.weddingId,
    { status: "outstanding", categoryId: null, q: "", sort: "due", page: 1 },
    limit,
    0,
  );
  return result.items;
}

export async function getExpenseForUser(userId: string, expenseId: string) {
  if (!isUuid(expenseId)) return null;
  const expense = await getDb().expense.findFirst({
    where: { id: expenseId, wedding: memberWeddingWhere(userId) },
    select: {
      id: true,
      weddingId: true,
      title: true,
      totalAmount: true,
      dueDate: true,
      notes: true,
      categoryId: true,
      createdAt: true,
      updatedAt: true,
      category: { select: { name: true } },
      createdBy: { select: { name: true } },
      payments: {
        orderBy: [{ paymentDate: "desc" }, { createdAt: "desc" }],
        select: {
          id: true,
          amount: true,
          paymentDate: true,
          method: true,
          reference: true,
          notes: true,
          createdAt: true,
          createdBy: { select: { name: true } },
        },
      },
    },
  });
  if (!expense) return null;
  const paid = expense.payments.reduce((sum, payment) => sum + payment.amount, 0n);
  return { ...expense, paid, ...expensePaymentState(expense.totalAmount, paid) };
}

export type ExpenseMutationResult =
  | { ok: true; expenseId: string }
  | { ok: false; reason: "invalid_category" }
  | { ok: false; reason: "total_below_paid"; paid: bigint };

async function categoryBelongsToWedding(categoryId: string, weddingId: string): Promise<boolean> {
  const category = await getDb().budgetCategory.findFirst({ where: { id: categoryId, weddingId }, select: { id: true } });
  return category !== null;
}

export async function createExpense(userId: string, weddingId: string, input: ExpenseInput): Promise<ExpenseMutationResult> {
  const membership = await requireWeddingMember(userId, weddingId);
  if (!(await categoryBelongsToWedding(input.categoryId, membership.weddingId))) {
    return { ok: false, reason: "invalid_category" };
  }

  return getDb().$transaction(async (tx) => {
    const expense = await tx.expense.create({
      data: {
        weddingId: membership.weddingId,
        categoryId: input.categoryId,
        title: input.title,
        totalAmount: input.totalAmount,
        dueDate: input.dueDate ? isoToDbDate(input.dueDate) : null,
        notes: input.notes,
        createdById: userId,
      },
      select: { id: true },
    });
    await recordActivity(tx, {
      weddingId: membership.weddingId,
      userId,
      actorName: membership.displayName,
      action: "expense.created",
      entityType: "expense",
      entityId: expense.id,
      metadata: { title: input.title, amount: input.totalAmount.toString() },
    });
    return { ok: true, expenseId: expense.id } as const;
  });
}

async function findExpenseScope(userId: string, expenseId: string) {
  if (!isUuid(expenseId)) throw new WeddingAccessError();
  const expense = await getDb().expense.findFirst({
    where: { id: expenseId, wedding: memberWeddingWhere(userId) },
    select: { id: true, weddingId: true, title: true },
  });
  if (!expense) throw new WeddingAccessError();
  const membership = await requireWeddingMember(userId, expense.weddingId);
  return { expense, membership };
}

export async function updateExpense(userId: string, expenseId: string, input: ExpenseInput): Promise<ExpenseMutationResult> {
  const { expense, membership } = await findExpenseScope(userId, expenseId);
  if (!(await categoryBelongsToWedding(input.categoryId, expense.weddingId))) {
    return { ok: false, reason: "invalid_category" };
  }

  return getDb().$transaction(async (tx) => {
    await lockExpense(tx, expense.id);
    const paid = await sumPayments(tx, expense.id);
    if (input.totalAmount < paid) return { ok: false, reason: "total_below_paid", paid } as const;

    await tx.expense.update({
      where: { id: expense.id },
      data: {
        categoryId: input.categoryId,
        title: input.title,
        totalAmount: input.totalAmount,
        dueDate: input.dueDate ? isoToDbDate(input.dueDate) : null,
        notes: input.notes,
      },
    });
    await recordActivity(tx, {
      weddingId: expense.weddingId,
      userId,
      actorName: membership.displayName,
      action: "expense.updated",
      entityType: "expense",
      entityId: expense.id,
      metadata: { title: input.title, amount: input.totalAmount.toString() },
    });
    return { ok: true, expenseId: expense.id } as const;
  });
}

/** Expenses with payment history cannot be deleted (delete the payments first). */
export async function deleteExpense(
  userId: string,
  expenseId: string,
): Promise<{ ok: true } | { ok: false; reason: "has_payments" }> {
  const { expense, membership } = await findExpenseScope(userId, expenseId);

  return getDb().$transaction(async (tx) => {
    await lockExpense(tx, expense.id);
    const payments = await tx.payment.count({ where: { expenseId: expense.id } });
    if (payments > 0) return { ok: false, reason: "has_payments" } as const;

    await tx.expense.delete({ where: { id: expense.id } });
    await recordActivity(tx, {
      weddingId: expense.weddingId,
      userId,
      actorName: membership.displayName,
      action: "expense.deleted",
      entityType: "expense",
      entityId: expense.id,
      metadata: { title: expense.title },
    });
    return { ok: true } as const;
  });
}

// ─── Payments ────────────────────────────────────────────────────────────────

export type RecordPaymentResult =
  | { ok: true; paymentId: string; outstanding: bigint }
  | { ok: false; reason: "exceeds_outstanding"; outstanding: bigint };

/** Overpayment is rejected; the expense row lock makes concurrent payments safe. */
export async function recordPayment(userId: string, expenseId: string, input: PaymentInput): Promise<RecordPaymentResult> {
  const { expense, membership } = await findExpenseScope(userId, expenseId);

  return getDb().$transaction(async (tx) => {
    await lockExpense(tx, expense.id);
    const [current, paid] = await Promise.all([
      tx.expense.findUniqueOrThrow({ where: { id: expense.id }, select: { totalAmount: true } }),
      sumPayments(tx, expense.id),
    ]);
    const { outstanding } = expensePaymentState(current.totalAmount, paid);
    if (input.amount > outstanding) return { ok: false, reason: "exceeds_outstanding", outstanding } as const;

    const payment = await tx.payment.create({
      data: {
        weddingId: expense.weddingId,
        expenseId: expense.id,
        amount: input.amount,
        paymentDate: isoToDbDate(input.paymentDate),
        method: input.method,
        reference: input.reference,
        notes: input.notes,
        createdById: userId,
      },
      select: { id: true },
    });
    await recordActivity(tx, {
      weddingId: expense.weddingId,
      userId,
      actorName: membership.displayName,
      action: "payment.recorded",
      entityType: "payment",
      entityId: payment.id,
      metadata: { title: expense.title, amount: input.amount.toString() },
    });
    return { ok: true, paymentId: payment.id, outstanding: outstanding - input.amount } as const;
  });
}

export async function deletePayment(userId: string, paymentId: string): Promise<{ expenseId: string }> {
  if (!isUuid(paymentId)) throw new WeddingAccessError();
  const payment = await getDb().payment.findFirst({
    where: { id: paymentId, wedding: memberWeddingWhere(userId) },
    select: { id: true, weddingId: true, expenseId: true, amount: true, expense: { select: { title: true } } },
  });
  if (!payment) throw new WeddingAccessError();
  const membership = await requireWeddingMember(userId, payment.weddingId);

  await getDb().$transaction(async (tx) => {
    await lockExpense(tx, payment.expenseId);
    await tx.payment.delete({ where: { id: payment.id } });
    await recordActivity(tx, {
      weddingId: payment.weddingId,
      userId,
      actorName: membership.displayName,
      action: "payment.deleted",
      entityType: "payment",
      entityId: payment.id,
      metadata: { title: payment.expense.title, amount: payment.amount.toString() },
    });
  });
  return { expenseId: payment.expenseId };
}
