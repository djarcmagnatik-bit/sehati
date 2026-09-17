import "server-only";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { isoToDbDate } from "@/lib/dates";
import { ORDER_ID_PATTERN, PAYMENT_STATUSES, type PaymentStatusValue } from "@/lib/billing";
import type { AddonInput, PlanInput, PromoCodeInput } from "@/lib/validation/admin";
import { getDb } from "@/server/db";
import { ADMIN_PAGE_SIZE, pageArgs, recordAdminAudit, requireAdmin } from "./admin-access";

const uuidSchema = z.uuid();
const isUuid = (value: string) => uuidSchema.safeParse(value).success;

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

// ─── Transactions ────────────────────────────────────────────────────────────

export type TransactionFilter = { status: PaymentStatusValue | "all"; q: string; page: number };

export async function listTransactions(adminId: string, filter: TransactionFilter) {
  await requireAdmin(adminId);
  const { page, skip, take } = pageArgs(filter.page);
  const where: Prisma.PaymentTransactionWhereInput = {
    ...((PAYMENT_STATUSES as readonly string[]).includes(filter.status) ? { status: filter.status as PaymentStatusValue } : {}),
    ...(filter.q
      ? {
          OR: [
            { orderId: { contains: filter.q.toUpperCase() } },
            { user: { email: { contains: filter.q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
  const db = getDb();
  const [total, items] = await db.$transaction([
    db.paymentTransaction.count({ where }),
    db.paymentTransaction.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take,
      select: {
        orderId: true,
        itemName: true,
        amount: true,
        discountAmount: true,
        status: true,
        provider: true,
        createdAt: true,
        paidAt: true,
        weddingId: true,
        user: { select: { email: true } },
        promoCode: { select: { code: true } },
      },
    }),
  ]);
  return { items, total, page, pageSize: ADMIN_PAGE_SIZE };
}

export async function getTransactionDetail(adminId: string, orderId: string) {
  await requireAdmin(adminId);
  if (!ORDER_ID_PATTERN.test(orderId)) return null;
  return getDb().paymentTransaction.findUnique({
    where: { orderId },
    select: {
      id: true,
      orderId: true,
      kind: true,
      itemName: true,
      amount: true,
      originalAmount: true,
      discountAmount: true,
      currency: true,
      status: true,
      provider: true,
      providerReference: true,
      expiresAt: true,
      paidAt: true,
      failedAt: true,
      refundedAt: true,
      createdAt: true,
      weddingId: true,
      user: { select: { id: true, email: true } },
      promoCode: { select: { id: true, code: true } },
      entitlement: { select: { id: true, revokedAt: true } },
      addonPurchase: { select: { id: true, quota: true, revokedAt: true } },
      webhookEvents: {
        orderBy: { createdAt: "asc" },
        // Payloads stay in the database; the admin view only needs what happened.
        select: { id: true, reportedStatus: true, outcome: true, createdAt: true },
      },
    },
  });
}

// ─── Plans ───────────────────────────────────────────────────────────────────

export async function listPlansForAdmin(adminId: string) {
  await requireAdmin(adminId);
  return getDb().plan.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      code: true,
      name: true,
      description: true,
      price: true,
      durationDays: true,
      features: true,
      isActive: true,
      sortOrder: true,
      _count: { select: { entitlements: true, transactions: true } },
    },
  });
}

export async function getPlanForAdmin(adminId: string, planId: string) {
  await requireAdmin(adminId);
  if (!isUuid(planId)) return null;
  return getDb().plan.findUnique({
    where: { id: planId },
    select: { id: true, code: true, name: true, description: true, price: true, durationDays: true, features: true, isActive: true, sortOrder: true },
  });
}

export type CatalogResult = { ok: true; id: string } | { ok: false; reason: "duplicate_code" | "not_found" };

function planData(input: PlanInput) {
  return {
    name: input.name,
    description: input.description,
    price: input.price,
    durationDays: input.durationDays,
    features: input.features,
    isActive: input.isActive,
    sortOrder: input.sortOrder,
  };
}

function planSummary(input: PlanInput) {
  return {
    code: input.code,
    price: input.price.toString(),
    durationDays: input.durationDays,
    features: input.features.join(","),
    isActive: input.isActive,
  };
}

export async function createPlan(adminId: string, input: PlanInput): Promise<CatalogResult> {
  const actor = await requireAdmin(adminId);
  try {
    return await getDb().$transaction(async (tx) => {
      const plan = await tx.plan.create({ data: { ...planData(input), code: input.code }, select: { id: true } });
      await recordAdminAudit(tx, actor, { action: "plan.created", targetType: "plan", targetId: plan.id, summary: planSummary(input) });
      return { ok: true, id: plan.id } as const;
    });
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, reason: "duplicate_code" };
    throw error;
  }
}

/**
 * The code identifies a plan everywhere (seed, grants, scripts), so it never changes. Price changes
 * only affect new checkouts: existing orders keep the amount they were created with.
 */
export async function updatePlan(adminId: string, planId: string, input: PlanInput): Promise<CatalogResult> {
  const actor = await requireAdmin(adminId);
  if (!isUuid(planId)) return { ok: false, reason: "not_found" };
  return getDb().$transaction(async (tx) => {
    const before = await tx.plan.findUnique({ where: { id: planId }, select: { code: true, price: true, isActive: true } });
    if (!before) return { ok: false, reason: "not_found" } as const;
    await tx.plan.update({ where: { id: planId }, data: planData(input) });
    await recordAdminAudit(tx, actor, {
      action: "plan.updated",
      targetType: "plan",
      targetId: planId,
      summary: { ...planSummary({ ...input, code: before.code }), previousPrice: before.price.toString(), previousActive: before.isActive },
    });
    return { ok: true, id: planId } as const;
  });
}

// ─── Add-ons ─────────────────────────────────────────────────────────────────

export async function listAddonsForAdmin(adminId: string) {
  await requireAdmin(adminId);
  return getDb().addon.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      code: true,
      name: true,
      description: true,
      price: true,
      quotaAmount: true,
      unit: true,
      isActive: true,
      _count: { select: { purchases: true } },
    },
  });
}

export async function updateAddon(adminId: string, addonId: string, input: AddonInput): Promise<CatalogResult> {
  const actor = await requireAdmin(adminId);
  if (!isUuid(addonId)) return { ok: false, reason: "not_found" };
  return getDb().$transaction(async (tx) => {
    const before = await tx.addon.findUnique({ where: { id: addonId }, select: { code: true, price: true, isActive: true } });
    if (!before) return { ok: false, reason: "not_found" } as const;
    await tx.addon.update({ where: { id: addonId }, data: input });
    await recordAdminAudit(tx, actor, {
      action: "addon.updated",
      targetType: "addon",
      targetId: addonId,
      summary: {
        code: before.code,
        price: input.price.toString(),
        previousPrice: before.price.toString(),
        quotaAmount: input.quotaAmount,
        isActive: input.isActive,
      },
    });
    return { ok: true, id: addonId } as const;
  });
}

// ─── Promo codes ─────────────────────────────────────────────────────────────

export async function listPromoCodes(adminId: string, now: Date = new Date()) {
  await requireAdmin(adminId);
  const db = getDb();
  const promos = await db.promoCode.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      code: true,
      description: true,
      discountType: true,
      discountValue: true,
      startsAt: true,
      expiresAt: true,
      usageLimit: true,
      perUserLimit: true,
      isActive: true,
      plan: { select: { name: true } },
    },
  });
  const used = await db.promoRedemption.groupBy({
    by: ["promoCodeId"],
    where: { transaction: { OR: [{ status: "PAID" }, { status: "PENDING", expiresAt: { gt: now } }] } },
    _count: { _all: true },
  });
  const usage = new Map(used.map((row) => [row.promoCodeId, row._count._all]));
  return promos.map((promo) => ({ ...promo, uses: usage.get(promo.id) ?? 0 }));
}

export async function getPromoCodeForAdmin(adminId: string, promoId: string) {
  await requireAdmin(adminId);
  if (!isUuid(promoId)) return null;
  return getDb().promoCode.findUnique({
    where: { id: promoId },
    select: {
      id: true,
      code: true,
      description: true,
      discountType: true,
      discountValue: true,
      planId: true,
      startsAt: true,
      expiresAt: true,
      usageLimit: true,
      perUserLimit: true,
      isActive: true,
    },
  });
}

/** Dates are whole days in Asia/Jakarta: a promo "until 31 Oct" works through the end of that day. */
function promoData(input: PromoCodeInput) {
  const JAKARTA_OFFSET_MS = 7 * 60 * 60 * 1000;
  const startOfDay = (iso: string) => new Date(isoToDbDate(iso).getTime() - JAKARTA_OFFSET_MS);
  return {
    description: input.description,
    discountType: input.discountType,
    discountValue: input.discountValue,
    planId: input.planId,
    startsAt: input.startsOn ? startOfDay(input.startsOn) : null,
    expiresAt: input.endsOn ? new Date(startOfDay(input.endsOn).getTime() + 86_400_000) : null,
    usageLimit: input.usageLimit,
    perUserLimit: input.perUserLimit,
    isActive: input.isActive,
  };
}

function promoSummary(input: PromoCodeInput) {
  return {
    code: input.code,
    discountType: input.discountType,
    discountValue: input.discountValue.toString(),
    usageLimit: input.usageLimit,
    isActive: input.isActive,
  };
}

export async function createPromoCode(adminId: string, input: PromoCodeInput): Promise<CatalogResult | { ok: false; reason: "invalid_plan" }> {
  const actor = await requireAdmin(adminId);
  const db = getDb();
  if (input.planId && !(await db.plan.findUnique({ where: { id: input.planId }, select: { id: true } }))) {
    return { ok: false, reason: "invalid_plan" };
  }
  try {
    return await db.$transaction(async (tx) => {
      const promo = await tx.promoCode.create({
        data: { ...promoData(input), code: input.code, createdById: actor.id },
        select: { id: true },
      });
      await recordAdminAudit(tx, actor, { action: "promo.created", targetType: "promo_code", targetId: promo.id, summary: promoSummary(input) });
      return { ok: true, id: promo.id } as const;
    });
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, reason: "duplicate_code" };
    throw error;
  }
}

/** The code itself is fixed once created, since it may already be printed or shared. */
export async function updatePromoCode(
  adminId: string,
  promoId: string,
  input: PromoCodeInput,
): Promise<CatalogResult | { ok: false; reason: "invalid_plan" }> {
  const actor = await requireAdmin(adminId);
  if (!isUuid(promoId)) return { ok: false, reason: "not_found" };
  const db = getDb();
  if (input.planId && !(await db.plan.findUnique({ where: { id: input.planId }, select: { id: true } }))) {
    return { ok: false, reason: "invalid_plan" };
  }
  return db.$transaction(async (tx) => {
    const before = await tx.promoCode.findUnique({ where: { id: promoId }, select: { code: true } });
    if (!before) return { ok: false, reason: "not_found" } as const;
    await tx.promoCode.update({ where: { id: promoId }, data: promoData(input) });
    await recordAdminAudit(tx, actor, {
      action: "promo.updated",
      targetType: "promo_code",
      targetId: promoId,
      summary: promoSummary({ ...input, code: before.code }),
    });
    return { ok: true, id: promoId } as const;
  });
}
