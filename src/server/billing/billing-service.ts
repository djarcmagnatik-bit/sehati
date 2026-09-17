import "server-only";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import {
  CHECKOUT_TTL_MS,
  decideTransition,
  FEATURES,
  formatOrderId,
  isEntitlementActive,
  knownFeatures,
  ORDER_ID_PATTERN,
  type PaymentStatusValue,
} from "@/lib/billing";
import { getEnv } from "@/lib/env";
import { computeDiscount, normalizePromoCode, promoWindowProblem, type PromoDiscountTypeValue } from "@/lib/promo";
import { logger } from "@/lib/logger";
import { recordActivity } from "@/server/activity/activity-service";
import { memberWeddingWhere, requireWeddingMember } from "@/server/authz/wedding-access";
import { getDb } from "@/server/db";
import { getWeddingFeatures } from "./access";
import { getActivePaymentProvider, PaymentProviderError } from "./providers";

type Tx = Prisma.TransactionClient;

const ORDER_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomOrderSuffix(): string {
  const bytes = randomBytes(10);
  return Array.from(bytes, (byte) => ORDER_ALPHABET[byte % ORDER_ALPHABET.length]).join("");
}

/** A pending checkout past its expiry shows as expired even before the provider says so. */
export function effectiveStatus(transaction: { status: PaymentStatusValue; expiresAt: Date }, now: Date): PaymentStatusValue {
  return transaction.status === "PENDING" && transaction.expiresAt.getTime() <= now.getTime() ? "EXPIRED" : transaction.status;
}

// ─── Catalogue & overview ────────────────────────────────────────────────────

export function listActivePlans() {
  return getDb().plan.findMany({
    where: { isActive: true, price: { gt: 0 } },
    orderBy: [{ sortOrder: "asc" }, { price: "asc" }],
    select: { id: true, code: true, name: true, description: true, price: true, durationDays: true, features: true },
  });
}

export async function getAddonBalances(weddingId: string) {
  const db = getDb();
  const [addons, purchases, usages] = await Promise.all([
    db.addon.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, code: true, name: true, description: true, price: true, quotaAmount: true, unit: true, isActive: true } }),
    db.addonPurchase.groupBy({ by: ["addonId"], where: { weddingId, revokedAt: null }, _sum: { quota: true } }),
    db.addonUsage.groupBy({ by: ["addonId"], where: { weddingId }, _sum: { amount: true } }),
  ]);
  const bought = new Map(purchases.map((row) => [row.addonId, row._sum.quota ?? 0]));
  const used = new Map(usages.map((row) => [row.addonId, row._sum.amount ?? 0]));
  return addons.map((addon) => {
    const total = bought.get(addon.id) ?? 0;
    const spent = used.get(addon.id) ?? 0;
    return { ...addon, purchased: total, used: spent, remaining: Math.max(0, total - spent) };
  });
}

/** Everything the "Akses & pembayaran" page shows. Any member may see it. */
export async function getBillingOverview(userId: string, weddingId: string, now: Date = new Date()) {
  const membership = await requireWeddingMember(userId, weddingId);
  const db = getDb();
  const [features, entitlements, plans, addons, transactions] = await Promise.all([
    getWeddingFeatures(membership.weddingId, now),
    db.weddingEntitlement.findMany({
      where: { weddingId: membership.weddingId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        source: true,
        startsAt: true,
        expiresAt: true,
        revokedAt: true,
        plan: { select: { name: true, features: true } },
      },
    }),
    listActivePlans(),
    getAddonBalances(membership.weddingId),
    db.paymentTransaction.findMany({
      where: { weddingId: membership.weddingId },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        orderId: true,
        itemName: true,
        amount: true,
        status: true,
        expiresAt: true,
        createdAt: true,
        paidAt: true,
        checkoutUrl: true,
      },
    }),
  ]);

  return {
    features,
    lockedFeatures: FEATURES.filter((feature) => !features.has(feature)),
    activeEntitlements: entitlements.filter((entitlement) => isEntitlementActive(entitlement, now)),
    plans: plans.map((plan) => ({ ...plan, features: knownFeatures(plan.features) })),
    addons,
    transactions: transactions.map((transaction) => ({
      ...transaction,
      status: effectiveStatus(transaction, now),
    })),
  };
}

// ─── Checkout ────────────────────────────────────────────────────────────────

export type CheckoutItem = { kind: "PLAN" | "ADDON"; code: string };

export type PromoProblem = "promo_invalid" | "promo_expired" | "promo_exhausted" | "promo_not_applicable" | "promo_too_large";

export type StartCheckoutResult =
  | { ok: true; orderId: string; checkoutUrl: string; reused: boolean }
  | { ok: false; reason: "unknown_item" | "already_active" | "provider_unavailable" | PromoProblem };

type LockedPromo = {
  id: string;
  discount_type: PromoDiscountTypeValue;
  discount_value: bigint;
  plan_id: string | null;
  starts_at: Date | null;
  expires_at: Date | null;
  usage_limit: number | null;
  per_user_limit: number | null;
  is_active: boolean;
};

/**
 * Validates a promo under a lock on its row, so two buyers racing for the last use cannot both get
 * it. A use counts while its checkout is paid or still open; failed, expired and refunded orders
 * give the use back.
 */
async function reservePromo(
  tx: Tx,
  input: { code: string; planId: string; price: bigint; userId: string; now: Date },
): Promise<{ ok: true; promoId: string; discount: bigint; final: bigint } | { ok: false; reason: PromoProblem }> {
  const rows = await tx.$queryRaw<LockedPromo[]>`
    SELECT id, discount_type, discount_value, plan_id, starts_at, expires_at, usage_limit, per_user_limit, is_active
    FROM promo_codes WHERE code = ${input.code} FOR UPDATE
  `;
  const promo = rows[0];
  if (!promo) return { ok: false, reason: "promo_invalid" };

  const window = promoWindowProblem(
    { isActive: promo.is_active, startsAt: promo.starts_at, expiresAt: promo.expires_at },
    input.now,
  );
  if (window === "inactive" || window === "not_started") return { ok: false, reason: "promo_invalid" };
  if (window === "expired") return { ok: false, reason: "promo_expired" };
  if (promo.plan_id && promo.plan_id !== input.planId) return { ok: false, reason: "promo_not_applicable" };

  const inUse = {
    promoCodeId: promo.id,
    transaction: { OR: [{ status: "PAID" as const }, { status: "PENDING" as const, expiresAt: { gt: input.now } }] },
  };
  if (promo.usage_limit !== null && (await tx.promoRedemption.count({ where: inUse })) >= promo.usage_limit) {
    return { ok: false, reason: "promo_exhausted" };
  }
  if (promo.per_user_limit !== null && (await tx.promoRedemption.count({ where: { ...inUse, userId: input.userId } })) >= promo.per_user_limit) {
    return { ok: false, reason: "promo_exhausted" };
  }

  const discount = computeDiscount(input.price, promo.discount_type, BigInt(promo.discount_value));
  if ("error" in discount) return { ok: false, reason: "promo_too_large" };
  return { ok: true, promoId: promo.id, discount: discount.discount, final: discount.final };
}

/**
 * Creates a pending transaction and a provider checkout. Nothing is granted here: access only
 * changes when a verified webhook reports the payment as paid.
 */
export async function startCheckout(
  userId: string,
  weddingId: string,
  item: CheckoutItem,
  now: Date = new Date(),
  options: { promoCode?: string | null } = {},
): Promise<StartCheckoutResult> {
  const membership = await requireWeddingMember(userId, weddingId);
  const rawPromo = options.promoCode?.trim() ?? "";
  const promoCode = rawPromo ? normalizePromoCode(rawPromo) : null;
  if (rawPromo && !promoCode) return { ok: false, reason: "promo_invalid" };
  if (promoCode && item.kind !== "PLAN") return { ok: false, reason: "promo_not_applicable" };
  const db = getDb();

  const catalogue: { id: string; name: string; price: bigint; features: string[] } | null =
    item.kind === "PLAN"
      ? await db.plan.findFirst({
          where: { code: item.code, isActive: true, price: { gt: 0 } },
          select: { id: true, name: true, price: true, features: true },
        })
      : await db.addon
          .findFirst({ where: { code: item.code, isActive: true, price: { gt: 0 } }, select: { id: true, name: true, price: true } })
          .then((addon) => (addon ? { ...addon, features: [] } : null));
  if (!catalogue) return { ok: false, reason: "unknown_item" };

  if (item.kind === "PLAN") {
    const owned = await getWeddingFeatures(membership.weddingId, now);
    const planFeatures = knownFeatures(catalogue.features);
    if (planFeatures.length > 0 && planFeatures.every((feature) => owned.has(feature))) return { ok: false, reason: "already_active" };
  }

  let provider;
  try {
    provider = getActivePaymentProvider();
  } catch (error) {
    logger.error("billing.provider_unavailable", { error });
    return { ok: false, reason: "provider_unavailable" };
  }

  // Double-clicks and "back" buttons reuse the open checkout instead of creating a second order.
  // A checkout with a promo is always new, so the promo is validated again under its lock.
  const itemFilter = item.kind === "PLAN" ? { planId: catalogue.id } : { addonId: catalogue.id };
  if (!promoCode) {
    const open = await db.paymentTransaction.findFirst({
      where: {
        weddingId: membership.weddingId,
        ...itemFilter,
        provider: provider.code,
        status: "PENDING",
        expiresAt: { gt: new Date(now.getTime() + 10 * 60_000) },
        amount: catalogue.price,
        promoCodeId: null,
        checkoutUrl: { not: null },
      },
      orderBy: { createdAt: "desc" },
      select: { orderId: true, checkoutUrl: true },
    });
    if (open?.checkoutUrl) return { ok: true, orderId: open.orderId, checkoutUrl: open.checkoutUrl, reused: true };
  }

  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true, email: true } });
  const orderId = formatOrderId(now, randomOrderSuffix());
  const expiresAt = new Date(now.getTime() + CHECKOUT_TTL_MS);

  const created = await db.$transaction(async (tx) => {
    const promo = promoCode
      ? await reservePromo(tx, { code: promoCode, planId: catalogue.id, price: catalogue.price, userId, now })
      : null;
    if (promo && !promo.ok) return promo;

    const amount = promo?.ok ? promo.final : catalogue.price;
    const transaction = await tx.paymentTransaction.create({
      data: {
        orderId,
        weddingId: membership.weddingId,
        userId,
        kind: item.kind,
        ...itemFilter,
        itemName: catalogue.name,
        amount,
        originalAmount: catalogue.price,
        discountAmount: promo?.ok ? promo.discount : 0n,
        promoCodeId: promo?.ok ? promo.promoId : null,
        provider: provider.code,
        expiresAt,
      },
      select: { id: true },
    });
    if (promo?.ok) {
      await tx.promoRedemption.create({
        data: { promoCodeId: promo.promoId, transactionId: transaction.id, userId, weddingId: membership.weddingId, discountAmount: promo.discount },
      });
    }
    return { ok: true as const, transactionId: transaction.id, amount };
  });
  if (!created.ok) return created;
  const transaction = { id: created.transactionId };

  try {
    const session = await provider.createCheckout({
      orderId,
      amount: created.amount,
      itemName: catalogue.name,
      customer: { name: user.name, email: user.email },
      expiresAt,
      returnUrl: `${getEnv().APP_URL.replace(/\/+$/, "")}/billing/return?order=${orderId}`,
    });
    await db.paymentTransaction.update({
      where: { id: transaction.id },
      data: { checkoutUrl: session.checkoutUrl, providerReference: session.reference },
    });
    return { ok: true, orderId, checkoutUrl: session.checkoutUrl, reused: false };
  } catch (error) {
    // The order never reached the provider, so it can be closed here without a webhook.
    await db.paymentTransaction.update({ where: { id: transaction.id }, data: { status: "FAILED", failedAt: now } });
    logger.error("billing.checkout_failed", { error, orderId, reason: error instanceof PaymentProviderError ? error.reason : "unknown" });
    return { ok: false, reason: "provider_unavailable" };
  }
}

export async function getTransactionForUser(userId: string, orderId: string, now: Date = new Date()) {
  if (!ORDER_ID_PATTERN.test(orderId)) return null;
  const transaction = await getDb().paymentTransaction.findFirst({
    where: { orderId, wedding: memberWeddingWhere(userId) },
    select: {
      id: true,
      orderId: true,
      weddingId: true,
      kind: true,
      itemName: true,
      amount: true,
      status: true,
      provider: true,
      checkoutUrl: true,
      expiresAt: true,
      paidAt: true,
      createdAt: true,
    },
  });
  return transaction ? { ...transaction, status: effectiveStatus(transaction, now) } : null;
}

// ─── Access grants (admin / scripts / webhook) ───────────────────────────────

export async function grantPlanToWedding(
  tx: Tx,
  input: {
    weddingId: string;
    planId: string;
    durationDays: number | null;
    source: "PURCHASE" | "ADMIN_GRANT";
    transactionId?: string | null;
    grantedById?: string | null;
    note?: string | null;
    now: Date;
  },
): Promise<string> {
  const entitlement = await tx.weddingEntitlement.create({
    data: {
      weddingId: input.weddingId,
      planId: input.planId,
      source: input.source,
      transactionId: input.transactionId ?? null,
      startsAt: input.now,
      expiresAt: input.durationDays ? new Date(input.now.getTime() + input.durationDays * 86_400_000) : null,
      grantedById: input.grantedById ?? null,
      note: input.note ?? null,
    },
    select: { id: true },
  });
  return entitlement.id;
}

/** Support/admin tool: give a wedding a plan without payment. Recorded as an admin grant. */
export async function adminGrantPlan(
  weddingId: string,
  planCode: string,
  options: { grantedById?: string | null; note?: string | null; now?: Date } = {},
): Promise<{ ok: true; entitlementId: string } | { ok: false; reason: "unknown_plan" | "unknown_wedding" }> {
  if (!z.uuid().safeParse(weddingId).success) return { ok: false, reason: "unknown_wedding" };
  const db = getDb();
  const [plan, wedding] = await Promise.all([
    db.plan.findUnique({ where: { code: planCode }, select: { id: true, durationDays: true } }),
    db.wedding.findFirst({ where: { id: weddingId, deletedAt: null }, select: { id: true } }),
  ]);
  if (!plan) return { ok: false, reason: "unknown_plan" };
  if (!wedding) return { ok: false, reason: "unknown_wedding" };

  const now = options.now ?? new Date();
  const entitlementId = await db.$transaction((tx) =>
    grantPlanToWedding(tx, {
      weddingId,
      planId: plan.id,
      durationDays: plan.durationDays,
      source: "ADMIN_GRANT",
      grantedById: options.grantedById,
      note: options.note ?? "Diberikan oleh admin",
      now,
    }),
  );
  return { ok: true, entitlementId };
}

// ─── Add-on quota ────────────────────────────────────────────────────────────

export type ConsumeQuotaResult = { ok: true; remaining: number } | { ok: false; reason: "unknown_addon" | "insufficient_quota" };

/**
 * Spends quota atomically: concurrent spends for the same wedding and add-on are serialized, so the
 * balance can never go below zero.
 */
export async function consumeAddonQuota(
  userId: string,
  weddingId: string,
  addonCode: string,
  amount: number,
  reason: string,
  referenceId: string | null = null,
): Promise<ConsumeQuotaResult> {
  if (!Number.isInteger(amount) || amount <= 0) throw new RangeError("amount must be a positive integer");
  const membership = await requireWeddingMember(userId, weddingId);
  const db = getDb();
  const addon = await db.addon.findUnique({ where: { code: addonCode }, select: { id: true } });
  if (!addon) return { ok: false, reason: "unknown_addon" };

  return db.$transaction(async (tx) => {
    const lockKey = `addon:${membership.weddingId}:${addon.id}`;
    await tx.$executeRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext(${lockKey}::text))`;
    const [purchased, used] = await Promise.all([
      tx.addonPurchase.aggregate({ where: { weddingId: membership.weddingId, addonId: addon.id, revokedAt: null }, _sum: { quota: true } }),
      tx.addonUsage.aggregate({ where: { weddingId: membership.weddingId, addonId: addon.id }, _sum: { amount: true } }),
    ]);
    const remaining = (purchased._sum.quota ?? 0) - (used._sum.amount ?? 0);
    if (remaining < amount) return { ok: false, reason: "insufficient_quota" } as const;

    await tx.addonUsage.create({
      data: { weddingId: membership.weddingId, addonId: addon.id, amount, reason: reason.slice(0, 120), referenceId },
    });
    return { ok: true, remaining: remaining - amount } as const;
  });
}

// ─── Webhook processing ──────────────────────────────────────────────────────

export type WebhookOutcome =
  | "applied"
  | "duplicate"
  | "unchanged"
  | "ignored_transition"
  | "unknown_order"
  | "provider_mismatch"
  | "amount_mismatch";

export type NotificationInput = {
  provider: string;
  orderId: string;
  status: PaymentStatusValue;
  reportedStatus: string;
  amount: bigint | null;
  eventKey: string;
  reference: string | null;
  payload: Record<string, unknown>;
};

type LockedTransaction = {
  id: string;
  wedding_id: string;
  status: PaymentStatusValue;
  amount: bigint;
  provider: string;
  kind: "PLAN" | "ADDON";
  plan_id: string | null;
  addon_id: string | null;
  item_name: string;
};

function jsonSafe(payload: Record<string, unknown>): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(payload, (_key, value) => (typeof value === "bigint" ? value.toString() : value))) as Prisma.InputJsonValue;
}

/**
 * Applies one verified provider notification exactly once. The transaction row is locked for the
 * whole decision, the event key makes replays no-ops, and only allowed status transitions happen.
 */
export async function processPaymentNotification(input: NotificationInput, now: Date = new Date()): Promise<WebhookOutcome> {
  try {
    return await applyNotification(input, now);
  } catch (error) {
    // Two copies of an unknown-order event racing each other: the second insert loses on the unique key.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return "duplicate";
    throw error;
  }
}

async function applyNotification(input: NotificationInput, now: Date): Promise<WebhookOutcome> {
  const db = getDb();

  return db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<LockedTransaction[]>`
      SELECT id, wedding_id, status, amount, provider, kind, plan_id, addon_id, item_name
      FROM payment_transactions WHERE order_id = ${input.orderId} FOR UPDATE
    `;
    const transaction = rows[0];

    const existing = await tx.paymentWebhookEvent.findUnique({ where: { eventKey: input.eventKey }, select: { id: true } });
    if (existing) return "duplicate" as const;

    const record = (outcome: WebhookOutcome) =>
      tx.paymentWebhookEvent.create({
        data: {
          provider: input.provider,
          eventKey: input.eventKey,
          orderId: input.orderId,
          transactionId: transaction?.id ?? null,
          reportedStatus: input.reportedStatus.slice(0, 30),
          outcome,
          payload: jsonSafe(input.payload),
        },
      });

    if (!transaction) {
      await record("unknown_order");
      return "unknown_order" as const;
    }
    if (transaction.provider !== input.provider) {
      await record("provider_mismatch");
      return "provider_mismatch" as const;
    }
    if (input.amount !== null && (input.status === "PAID" || input.status === "REFUNDED") && input.amount !== transaction.amount) {
      await record("amount_mismatch");
      logger.warn("billing.amount_mismatch", { orderId: input.orderId, reported: input.amount.toString() });
      return "amount_mismatch" as const;
    }

    const decision = decideTransition(transaction.status, input.status);
    if (decision !== "apply") {
      const outcome = decision === "unchanged" ? "unchanged" : "ignored_transition";
      await record(outcome);
      return outcome;
    }

    await tx.paymentTransaction.update({
      where: { id: transaction.id },
      data: {
        status: input.status,
        providerReference: input.reference ?? undefined,
        ...(input.status === "PAID" ? { paidAt: now } : {}),
        ...(input.status === "FAILED" ? { failedAt: now } : {}),
        ...(input.status === "REFUNDED" ? { refundedAt: now } : {}),
      },
    });

    if (input.status === "PAID") {
      if (transaction.kind === "PLAN" && transaction.plan_id) {
        const plan = await tx.plan.findUniqueOrThrow({ where: { id: transaction.plan_id }, select: { durationDays: true } });
        await grantPlanToWedding(tx, {
          weddingId: transaction.wedding_id,
          planId: transaction.plan_id,
          durationDays: plan.durationDays,
          source: "PURCHASE",
          transactionId: transaction.id,
          now,
        });
      } else if (transaction.kind === "ADDON" && transaction.addon_id) {
        const addon = await tx.addon.findUniqueOrThrow({ where: { id: transaction.addon_id }, select: { quotaAmount: true } });
        await tx.addonPurchase.create({
          data: { weddingId: transaction.wedding_id, addonId: transaction.addon_id, transactionId: transaction.id, quota: addon.quotaAmount },
        });
      }
    }

    if (input.status === "REFUNDED") {
      await tx.weddingEntitlement.updateMany({ where: { transactionId: transaction.id, revokedAt: null }, data: { revokedAt: now } });
      await tx.addonPurchase.updateMany({ where: { transactionId: transaction.id, revokedAt: null }, data: { revokedAt: now } });
    }

    if (input.status === "PAID" || input.status === "REFUNDED") {
      await recordActivity(tx, {
        weddingId: transaction.wedding_id,
        userId: null,
        actorName: "Sistem pembayaran",
        action: input.status === "PAID" ? "billing.payment_paid" : "billing.payment_refunded",
        entityType: "payment_transaction",
        entityId: transaction.id,
        metadata: { name: transaction.item_name, amount: transaction.amount.toString() },
      });
    }

    await record("applied");
    return "applied" as const;
  });
}
