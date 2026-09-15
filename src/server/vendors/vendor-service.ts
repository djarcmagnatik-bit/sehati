import "server-only";
import { z } from "zod";
import { Prisma, type VendorResearchStatus } from "@/generated/prisma/client";
import { expensePaymentState } from "@/lib/budget";
import { isoToDbDate } from "@/lib/dates";
import { VENDOR_PAGE_SIZE, type ResearchFilters, type VendorFilters } from "@/lib/vendor-filters";
import type {
  BookVendorInput,
  VendorCreateInput,
  VendorResearchInput,
  VendorUpdateInput,
} from "@/lib/validation/vendor";
import { recordActivity } from "@/server/activity/activity-service";
import { memberWeddingWhere, requireWeddingMember, WeddingAccessError } from "@/server/authz/wedding-access";
import { getDb } from "@/server/db";

type Tx = Prisma.TransactionClient;

const uuidSchema = z.uuid();
const isUuid = (value: string) => uuidSchema.safeParse(value).success;

/** Candidates still in play (not rejected, not yet booked). */
const ACTIVE_RESEARCH_STATUSES: VendorResearchStatus[] = ["RESEARCHING", "CONTACTED", "MEETING", "SHORTLISTED"];

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

// ─── Reference data ──────────────────────────────────────────────────────────

export function getVendorCategoryOptions(includeCategoryId?: string) {
  return getDb().vendorCategory.findMany({
    where: includeCategoryId ? { OR: [{ isActive: true }, { id: includeCategoryId }] } : { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, budgetCategoryName: true },
  });
}

async function vendorCategoryUsable(categoryId: string, currentCategoryId?: string): Promise<boolean> {
  const category = await getDb().vendorCategory.findFirst({
    where: { id: categoryId, ...(categoryId === currentCategoryId ? {} : { isActive: true }) },
    select: { id: true },
  });
  return category !== null;
}

async function budgetCategoryInWedding(budgetCategoryId: string, weddingId: string): Promise<boolean> {
  const category = await getDb().budgetCategory.findFirst({
    where: { id: budgetCategoryId, weddingId },
    select: { id: true },
  });
  return category !== null;
}

/** Booked vendors for pickers (e.g. linking an expense), with the suggested budget category name. */
export async function getVendorOptions(userId: string, weddingId: string) {
  const membership = await requireWeddingMember(userId, weddingId);
  return getDb().vendor.findMany({
    where: { weddingId: membership.weddingId },
    orderBy: { name: "asc" },
    select: { id: true, name: true, category: { select: { budgetCategoryName: true } } },
  });
}

// ─── Money derived from linked expenses ─────────────────────────────────────

export type VendorMoney = { contract: bigint; paid: bigint; outstanding: bigint; expenseCount: number };
export const EMPTY_VENDOR_MONEY: VendorMoney = { contract: 0n, paid: 0n, outstanding: 0n, expenseCount: 0 };

async function vendorFinancials(weddingId: string, vendorIds?: string[]): Promise<Map<string, VendorMoney>> {
  if (vendorIds && vendorIds.length === 0) return new Map();
  const idFilter = vendorIds
    ? Prisma.sql`AND e.vendor_id IN (${Prisma.join(vendorIds.map((id) => Prisma.sql`${id}::uuid`))})`
    : Prisma.empty;

  const rows = await getDb().$queryRaw<Array<{ vendor_id: string; contract: string; paid: string; expense_count: number }>>`
    SELECT e.vendor_id::text AS vendor_id,
           SUM(e.total_amount)::text AS contract,
           COALESCE(SUM(p.paid), 0)::text AS paid,
           COUNT(*)::int AS expense_count
    FROM expenses e
    LEFT JOIN (
      SELECT expense_id, SUM(amount) AS paid FROM payments WHERE wedding_id = ${weddingId}::uuid GROUP BY expense_id
    ) p ON p.expense_id = e.id
    WHERE e.wedding_id = ${weddingId}::uuid AND e.vendor_id IS NOT NULL ${idFilter}
    GROUP BY e.vendor_id
  `;

  return new Map(
    rows.map((row) => {
      const contract = BigInt(row.contract);
      const paid = BigInt(row.paid);
      return [row.vendor_id, { contract, paid, outstanding: contract - paid, expenseCount: row.expense_count }];
    }),
  );
}

/** Dashboard numbers: researching / booked / vendors still waiting for a first payment / money. */
export async function getVendorSummary(userId: string, weddingId: string) {
  const membership = await requireWeddingMember(userId, weddingId);
  const id = membership.weddingId;
  const db = getDb();
  const [researching, booked, financials] = await Promise.all([
    db.vendorResearch.count({ where: { weddingId: id, status: { in: ACTIVE_RESEARCH_STATUSES } } }),
    db.vendor.count({ where: { weddingId: id } }),
    vendorFinancials(id),
  ]);

  let contract = 0n;
  let paid = 0n;
  let needingDp = 0;
  for (const money of financials.values()) {
    contract += money.contract;
    paid += money.paid;
    if (money.contract > 0n && money.paid === 0n) needingDp += 1;
  }
  return { researching, booked, needingDp, contract, paid, outstanding: contract - paid };
}

// ─── Research (candidates) ───────────────────────────────────────────────────

export async function listVendorResearch(userId: string, weddingId: string, filters: ResearchFilters) {
  const membership = await requireWeddingMember(userId, weddingId);
  const where: Prisma.VendorResearchWhereInput = { weddingId: membership.weddingId };
  if (filters.view === "active") where.status = { not: "REJECTED" };
  else if (filters.view !== "all") where.status = filters.view;
  if (filters.categoryId) where.categoryId = filters.categoryId;
  if (filters.q) {
    where.OR = [
      { name: { contains: filters.q, mode: "insensitive" } },
      { packageName: { contains: filters.q, mode: "insensitive" } },
      { location: { contains: filters.q, mode: "insensitive" } },
    ];
  }

  const db = getDb();
  const [total, items] = await db.$transaction([
    db.vendorResearch.count({ where }),
    db.vendorResearch.findMany({
      where,
      orderBy: [{ category: { sortOrder: "asc" } }, { name: "asc" }, { id: "asc" }],
      skip: (filters.page - 1) * VENDOR_PAGE_SIZE,
      take: VENDOR_PAGE_SIZE,
      select: {
        id: true,
        name: true,
        status: true,
        estimatedPrice: true,
        packageName: true,
        rating: true,
        location: true,
        category: { select: { id: true, name: true } },
        bookedVendor: { select: { id: true } },
      },
    }),
  ]);
  return { items, total, page: filters.page, pageSize: VENDOR_PAGE_SIZE };
}

const researchDetailSelect = {
  id: true,
  weddingId: true,
  categoryId: true,
  name: true,
  contactPerson: true,
  whatsapp: true,
  phone: true,
  instagram: true,
  website: true,
  estimatedPrice: true,
  packageName: true,
  location: true,
  rating: true,
  pros: true,
  cons: true,
  notes: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  category: { select: { name: true, budgetCategoryName: true } },
  bookedVendor: { select: { id: true, name: true } },
} satisfies Prisma.VendorResearchSelect;

export async function getVendorResearchForUser(userId: string, researchId: string) {
  if (!isUuid(researchId)) return null;
  return getDb().vendorResearch.findFirst({
    where: { id: researchId, wedding: memberWeddingWhere(userId) },
    select: researchDetailSelect,
  });
}

/** Candidates for the comparison table; ids outside the wedding are silently ignored. Keeps the requested order. */
export async function getResearchForComparison(userId: string, weddingId: string, ids: string[]) {
  const membership = await requireWeddingMember(userId, weddingId);
  const valid = ids.filter(isUuid);
  if (valid.length === 0) return [];
  const rows = await getDb().vendorResearch.findMany({
    where: { id: { in: valid }, weddingId: membership.weddingId },
    select: researchDetailSelect,
  });
  const order = new Map(valid.map((id, index) => [id, index]));
  return rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

function researchData(input: VendorResearchInput) {
  return {
    name: input.name,
    categoryId: input.categoryId,
    contactPerson: input.contactPerson,
    whatsapp: input.whatsapp,
    phone: input.phone,
    instagram: input.instagram,
    website: input.website,
    estimatedPrice: input.estimatedPrice,
    packageName: input.packageName,
    location: input.location,
    rating: input.rating,
    pros: input.pros,
    cons: input.cons,
    notes: input.notes,
  };
}

export type ResearchMutationResult = { ok: true; researchId: string } | { ok: false; reason: "invalid_category" };

export async function createVendorResearch(
  userId: string,
  weddingId: string,
  input: VendorResearchInput,
): Promise<ResearchMutationResult> {
  const membership = await requireWeddingMember(userId, weddingId);
  if (!(await vendorCategoryUsable(input.categoryId))) return { ok: false, reason: "invalid_category" };

  return getDb().$transaction(async (tx) => {
    const research = await tx.vendorResearch.create({
      data: { ...researchData(input), status: input.status, weddingId: membership.weddingId, createdById: userId },
      select: { id: true },
    });
    await recordActivity(tx, {
      weddingId: membership.weddingId,
      userId,
      actorName: membership.displayName,
      action: "vendor_research.created",
      entityType: "vendor_research",
      entityId: research.id,
      metadata: { name: input.name, status: input.status },
    });
    return { ok: true, researchId: research.id } as const;
  });
}

async function findResearchScope(userId: string, researchId: string) {
  if (!isUuid(researchId)) throw new WeddingAccessError();
  const research = await getDb().vendorResearch.findFirst({
    where: { id: researchId, wedding: memberWeddingWhere(userId) },
    select: { id: true, weddingId: true, name: true, categoryId: true, status: true, bookedVendor: { select: { id: true } } },
  });
  if (!research) throw new WeddingAccessError();
  const membership = await requireWeddingMember(userId, research.weddingId);
  return { research, membership };
}

/** A booked (SELECTED) candidate keeps its status; everything else is editable. */
export async function updateVendorResearch(
  userId: string,
  researchId: string,
  input: VendorResearchInput,
): Promise<ResearchMutationResult> {
  const { research, membership } = await findResearchScope(userId, researchId);
  if (!(await vendorCategoryUsable(input.categoryId, research.categoryId))) return { ok: false, reason: "invalid_category" };
  const status: VendorResearchStatus = research.bookedVendor ? "SELECTED" : input.status;

  await getDb().$transaction(async (tx) => {
    await tx.vendorResearch.update({ where: { id: research.id }, data: { ...researchData(input), status } });
    await recordActivity(tx, {
      weddingId: research.weddingId,
      userId,
      actorName: membership.displayName,
      action: "vendor_research.updated",
      entityType: "vendor_research",
      entityId: research.id,
      metadata: { name: input.name, status },
    });
  });
  return { ok: true, researchId: research.id };
}

/** Booked candidates are part of the vendor's history and cannot be deleted. */
export async function deleteVendorResearch(
  userId: string,
  researchId: string,
): Promise<{ ok: true } | { ok: false; reason: "is_selected" }> {
  const { research, membership } = await findResearchScope(userId, researchId);
  if (research.bookedVendor) return { ok: false, reason: "is_selected" };

  await getDb().$transaction(async (tx) => {
    await tx.vendorResearch.delete({ where: { id: research.id } });
    await recordActivity(tx, {
      weddingId: research.weddingId,
      userId,
      actorName: membership.displayName,
      action: "vendor_research.deleted",
      entityType: "vendor_research",
      entityId: research.id,
      metadata: { name: research.name },
    });
  });
  return { ok: true };
}

// ─── Booking ─────────────────────────────────────────────────────────────────

async function createContractExpense(
  tx: Tx,
  params: {
    weddingId: string;
    vendorId: string;
    vendorName: string;
    contractValue: bigint | null;
    budgetCategoryId: string | null;
    dueDate: string | null;
    userId: string;
    actorName: string;
  },
): Promise<string | null> {
  if (!params.contractValue || params.contractValue <= 0n || !params.budgetCategoryId) return null;
  const title = `Kontrak ${params.vendorName}`.slice(0, 160);
  const expense = await tx.expense.create({
    data: {
      weddingId: params.weddingId,
      categoryId: params.budgetCategoryId,
      vendorId: params.vendorId,
      title,
      totalAmount: params.contractValue,
      dueDate: params.dueDate ? isoToDbDate(params.dueDate) : null,
      createdById: params.userId,
    },
    select: { id: true },
  });
  await recordActivity(tx, {
    weddingId: params.weddingId,
    userId: params.userId,
    actorName: params.actorName,
    action: "expense.created",
    entityType: "expense",
    entityId: expense.id,
    metadata: { title, amount: params.contractValue.toString() },
  });
  return expense.id;
}

export type BookVendorResult =
  | { ok: true; vendorId: string; expenseId: string | null }
  | { ok: false; reason: "already_selected"; vendorId: string | null }
  | { ok: false; reason: "invalid_budget_category" };

/**
 * Turns a candidate into a booked vendor. The research record (price estimate, pros/cons, notes)
 * stays intact and linked; a contract value creates a linked expense in the budget.
 */
export async function bookVendorFromResearch(
  userId: string,
  researchId: string,
  input: BookVendorInput,
): Promise<BookVendorResult> {
  const { research, membership } = await findResearchScope(userId, researchId);
  if (input.budgetCategoryId && !(await budgetCategoryInWedding(input.budgetCategoryId, research.weddingId))) {
    return { ok: false, reason: "invalid_budget_category" };
  }

  try {
    return await getDb().$transaction(
      async (tx) => {
        // Serializes concurrent "choose this vendor" clicks for the same candidate.
        await tx.$queryRaw`SELECT 1 AS locked FROM vendor_research WHERE id = ${research.id}::uuid FOR UPDATE`;
        const current = await tx.vendorResearch.findUniqueOrThrow({
          where: { id: research.id },
          select: {
            name: true,
            categoryId: true,
            contactPerson: true,
            whatsapp: true,
            phone: true,
            instagram: true,
            website: true,
            packageName: true,
            notes: true,
            bookedVendor: { select: { id: true } },
          },
        });
        if (current.bookedVendor) return { ok: false, reason: "already_selected", vendorId: current.bookedVendor.id } as const;

        const vendor = await tx.vendor.create({
          data: {
            weddingId: research.weddingId,
            categoryId: current.categoryId,
            researchId: research.id,
            name: current.name,
            contactPerson: current.contactPerson,
            whatsapp: current.whatsapp,
            phone: current.phone,
            instagram: current.instagram,
            website: current.website,
            packageName: input.packageName ?? current.packageName,
            bookingDate: input.bookingDate ? isoToDbDate(input.bookingDate) : null,
            notes: current.notes,
            createdById: userId,
          },
          select: { id: true },
        });
        await tx.vendorResearch.update({ where: { id: research.id }, data: { status: "SELECTED" } });

        const expenseId = await createContractExpense(tx, {
          weddingId: research.weddingId,
          vendorId: vendor.id,
          vendorName: current.name,
          contractValue: input.contractValue,
          budgetCategoryId: input.budgetCategoryId,
          dueDate: input.paymentDueDate,
          userId,
          actorName: membership.displayName,
        });
        await recordActivity(tx, {
          weddingId: research.weddingId,
          userId,
          actorName: membership.displayName,
          action: "vendor.booked",
          entityType: "vendor",
          entityId: vendor.id,
          metadata: { name: current.name, amount: input.contractValue?.toString() ?? null },
        });
        return { ok: true, vendorId: vendor.id, expenseId } as const;
      },
      { timeout: 15_000 },
    );
  } catch (error) {
    // The unique research_id guards the rare case the row lock could not (e.g. replicas).
    if (isUniqueViolation(error)) return { ok: false, reason: "already_selected", vendorId: null };
    throw error;
  }
}

// ─── Booked vendors ──────────────────────────────────────────────────────────

export async function listVendors(userId: string, weddingId: string, filters: VendorFilters) {
  const membership = await requireWeddingMember(userId, weddingId);
  const where: Prisma.VendorWhereInput = { weddingId: membership.weddingId };
  if (filters.categoryId) where.categoryId = filters.categoryId;
  if (filters.q) {
    where.OR = [
      { name: { contains: filters.q, mode: "insensitive" } },
      { packageName: { contains: filters.q, mode: "insensitive" } },
      { eventLabel: { contains: filters.q, mode: "insensitive" } },
    ];
  }

  const db = getDb();
  const [total, vendors] = await db.$transaction([
    db.vendor.count({ where }),
    db.vendor.findMany({
      where,
      orderBy: [{ category: { sortOrder: "asc" } }, { name: "asc" }, { id: "asc" }],
      skip: (filters.page - 1) * VENDOR_PAGE_SIZE,
      take: VENDOR_PAGE_SIZE,
      select: {
        id: true,
        name: true,
        packageName: true,
        bookingDate: true,
        eventLabel: true,
        category: { select: { id: true, name: true } },
      },
    }),
  ]);
  const money = await vendorFinancials(
    membership.weddingId,
    vendors.map((vendor) => vendor.id),
  );
  const items = vendors.map((vendor) => ({ ...vendor, money: money.get(vendor.id) ?? EMPTY_VENDOR_MONEY }));
  return { items, total, page: filters.page, pageSize: VENDOR_PAGE_SIZE };
}

export async function getVendorForUser(userId: string, vendorId: string) {
  if (!isUuid(vendorId)) return null;
  const vendor = await getDb().vendor.findFirst({
    where: { id: vendorId, wedding: memberWeddingWhere(userId) },
    select: {
      id: true,
      weddingId: true,
      categoryId: true,
      name: true,
      contactPerson: true,
      whatsapp: true,
      phone: true,
      instagram: true,
      website: true,
      packageName: true,
      bookingDate: true,
      eventLabel: true,
      notes: true,
      createdAt: true,
      updatedAt: true,
      category: { select: { name: true, budgetCategoryName: true } },
      research: {
        select: { id: true, estimatedPrice: true, rating: true, pros: true, cons: true, location: true, packageName: true },
      },
      expenses: {
        orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
        select: { id: true, title: true, totalAmount: true, dueDate: true, payments: { select: { amount: true } } },
      },
    },
  });
  if (!vendor) return null;

  const expenses = vendor.expenses.map(({ payments, ...expense }) => {
    const paid = payments.reduce((sum, payment) => sum + payment.amount, 0n);
    return { ...expense, paid, ...expensePaymentState(expense.totalAmount, paid) };
  });
  const contract = expenses.reduce((sum, expense) => sum + expense.totalAmount, 0n);
  const paid = expenses.reduce((sum, expense) => sum + expense.paid, 0n);
  return {
    ...vendor,
    expenses,
    money: { contract, paid, outstanding: contract - paid, expenseCount: expenses.length } satisfies VendorMoney,
  };
}

function vendorContactData(input: VendorUpdateInput | VendorCreateInput) {
  return {
    name: input.name,
    categoryId: input.categoryId,
    contactPerson: input.contactPerson,
    whatsapp: input.whatsapp,
    phone: input.phone,
    instagram: input.instagram,
    website: input.website,
    packageName: input.packageName,
    bookingDate: input.bookingDate ? isoToDbDate(input.bookingDate) : null,
    eventLabel: input.eventLabel,
    notes: input.notes,
  };
}

export type VendorMutationResult =
  | { ok: true; vendorId: string; expenseId: string | null }
  | { ok: false; reason: "invalid_category" | "invalid_budget_category" };

/** Direct booking without prior research (e.g. a vendor recommended by family). */
export async function createVendor(userId: string, weddingId: string, input: VendorCreateInput): Promise<VendorMutationResult> {
  const membership = await requireWeddingMember(userId, weddingId);
  if (!(await vendorCategoryUsable(input.categoryId))) return { ok: false, reason: "invalid_category" };
  if (input.budgetCategoryId && !(await budgetCategoryInWedding(input.budgetCategoryId, membership.weddingId))) {
    return { ok: false, reason: "invalid_budget_category" };
  }

  return getDb().$transaction(async (tx) => {
    const vendor = await tx.vendor.create({
      data: { ...vendorContactData(input), weddingId: membership.weddingId, createdById: userId },
      select: { id: true },
    });
    const expenseId = await createContractExpense(tx, {
      weddingId: membership.weddingId,
      vendorId: vendor.id,
      vendorName: input.name,
      contractValue: input.contractValue,
      budgetCategoryId: input.budgetCategoryId,
      dueDate: input.paymentDueDate,
      userId,
      actorName: membership.displayName,
    });
    await recordActivity(tx, {
      weddingId: membership.weddingId,
      userId,
      actorName: membership.displayName,
      action: "vendor.created",
      entityType: "vendor",
      entityId: vendor.id,
      metadata: { name: input.name, amount: input.contractValue?.toString() ?? null },
    });
    return { ok: true, vendorId: vendor.id, expenseId } as const;
  });
}

async function findVendorScope(userId: string, vendorId: string) {
  if (!isUuid(vendorId)) throw new WeddingAccessError();
  const vendor = await getDb().vendor.findFirst({
    where: { id: vendorId, wedding: memberWeddingWhere(userId) },
    select: { id: true, weddingId: true, name: true, categoryId: true, researchId: true, _count: { select: { expenses: true } } },
  });
  if (!vendor) throw new WeddingAccessError();
  const membership = await requireWeddingMember(userId, vendor.weddingId);
  return { vendor, membership };
}

export async function updateVendor(userId: string, vendorId: string, input: VendorUpdateInput): Promise<VendorMutationResult> {
  const { vendor, membership } = await findVendorScope(userId, vendorId);
  if (!(await vendorCategoryUsable(input.categoryId, vendor.categoryId))) return { ok: false, reason: "invalid_category" };

  await getDb().$transaction(async (tx) => {
    await tx.vendor.update({ where: { id: vendor.id }, data: vendorContactData(input) });
    await recordActivity(tx, {
      weddingId: vendor.weddingId,
      userId,
      actorName: membership.displayName,
      action: "vendor.updated",
      entityType: "vendor",
      entityId: vendor.id,
      metadata: { name: input.name },
    });
  });
  return { ok: true, vendorId: vendor.id, expenseId: null };
}

/**
 * Vendors with linked expenses cannot be deleted (money history). The research record, if any, is
 * kept and returns to "Kandidat kuat".
 */
export async function deleteVendor(
  userId: string,
  vendorId: string,
): Promise<{ ok: true } | { ok: false; reason: "has_expenses" }> {
  const { vendor, membership } = await findVendorScope(userId, vendorId);
  if (vendor._count.expenses > 0) return { ok: false, reason: "has_expenses" };

  await getDb().$transaction(async (tx) => {
    await tx.vendor.delete({ where: { id: vendor.id } });
    if (vendor.researchId) {
      await tx.vendorResearch.update({ where: { id: vendor.researchId }, data: { status: "SHORTLISTED" } });
    }
    await recordActivity(tx, {
      weddingId: vendor.weddingId,
      userId,
      actorName: membership.displayName,
      action: "vendor.deleted",
      entityType: "vendor",
      entityId: vendor.id,
      metadata: { name: vendor.name },
    });
  });
  return { ok: true };
}
