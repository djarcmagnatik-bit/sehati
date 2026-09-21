import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { FREE_PROVIDER } from "@/lib/promo";
import type { PromoCodeInput } from "@/lib/validation/admin";
import { getRecentActivity } from "@/server/activity/activity-service";
import { createPromoCode } from "@/server/admin/admin-billing-service";
import { getWeddingFeatures } from "@/server/billing/access";
import { startCheckout } from "@/server/billing/billing-service";
import { getDb } from "@/server/db";
import { createTestUser, deleteUsers } from "../support/integration-helpers";
import { createOwnerWorkspace } from "../support/workspace-helpers";

// Production today: no payment provider is configured, so every paid checkout is refused. A promo
// that takes the whole price must still work. `payments.on` switches a recording stand-in on.
const { payments } = vi.hoisted(() => ({ payments: { on: false, checkouts: [] as string[] } }));

vi.mock("@/server/billing/providers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/billing/providers")>();
  return {
    ...actual,
    getActivePaymentProvider: () => {
      if (!payments.on) throw new actual.PaymentProviderError("Payments are switched off", "not_configured");
      return {
        code: "sandbox",
        createCheckout: async (request: { orderId: string }) => {
          payments.checkouts.push(request.orderId);
          return { checkoutUrl: `https://pay.example/${request.orderId}`, reference: null };
        },
        parseNotification: async () => ({ error: "invalid_signature" as const }),
      };
    },
  };
});

const userIds: string[] = [];
const promoIds: string[] = [];

afterAll(async () => {
  const db = getDb();
  await deleteUsers(userIds);
  await db.promoRedemption.deleteMany({ where: { promoCodeId: { in: promoIds } } });
  await db.promoCode.deleteMany({ where: { id: { in: promoIds } } });
});

beforeEach(() => {
  payments.on = false;
  payments.checkouts.length = 0;
});

async function newPromo(overrides: Partial<PromoCodeInput> = {}) {
  const admin = await createTestUser(userIds, "Admin");
  await getDb().user.update({ where: { id: admin.userId }, data: { role: "ADMIN" } });
  const input: PromoCodeInput = {
    code: `GRATIS_${randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase()}`,
    description: null,
    discountType: "PERCENT",
    discountValue: 100n,
    planId: null,
    startsOn: null,
    endsOn: null,
    usageLimit: null,
    perUserLimit: null,
    isActive: true,
    ...overrides,
  };
  const result = await createPromoCode(admin.userId, input);
  if (!result.ok) throw new Error(`promo creation failed: ${result.reason}`);
  promoIds.push(result.id);
  return { id: result.id, code: input.code };
}

async function fullAccessPrice(): Promise<bigint> {
  return (await getDb().plan.findUniqueOrThrow({ where: { code: "FULL_ACCESS" }, select: { price: true } })).price;
}

const FULL_ACCESS = { kind: "PLAN" as const, code: "FULL_ACCESS" };

describe("free promo codes", () => {
  it("activates Full Access at once, with payments switched off", async () => {
    const promo = await newPromo();
    const { owner, weddingId } = await createOwnerWorkspace(userIds, { access: "free" });
    const price = await fullAccessPrice();
    expect((await getWeddingFeatures(weddingId)).has("guests")).toBe(false);

    const result = await startCheckout(owner.userId, weddingId, FULL_ACCESS, new Date(), { promoCode: promo.code.toLowerCase() });
    expect(result).toMatchObject({ ok: true, free: true, reused: false });
    if (!result.ok) return;
    expect(result.checkoutUrl).toBe(`/billing/return?order=${result.orderId}`);
    expect(payments.checkouts).toEqual([]);

    const transaction = await getDb().paymentTransaction.findUniqueOrThrow({ where: { orderId: result.orderId } });
    expect(transaction).toMatchObject({
      status: "PAID",
      provider: FREE_PROVIDER,
      amount: 0n,
      originalAmount: price,
      discountAmount: price,
      promoCodeId: promo.id,
      checkoutUrl: null,
    });
    expect(transaction.paidAt).not.toBeNull();
    expect(await getDb().promoRedemption.count({ where: { promoCodeId: promo.id, transactionId: transaction.id } })).toBe(1);
    expect(await getDb().weddingEntitlement.findFirst({ where: { transactionId: transaction.id } })).toMatchObject({
      weddingId,
      source: "PURCHASE",
      revokedAt: null,
    });
    expect((await getWeddingFeatures(weddingId)).has("guests")).toBe(true);

    const activity = await getRecentActivity(owner.userId, weddingId, 1);
    expect(activity[0]).toMatchObject({ action: "billing.promo_redeemed", metadata: { code: promo.code } });

    // Nothing left to buy for this wedding afterwards.
    expect(await startCheckout(owner.userId, weddingId, FULL_ACCESS, new Date(), { promoCode: promo.code })).toEqual({
      ok: false,
      reason: "already_active",
    });
  });

  it("makes a fixed discount of at least the price free too", async () => {
    const promo = await newPromo({ discountType: "FIXED", discountValue: (await fullAccessPrice()) + 100_000n });
    const { owner, weddingId } = await createOwnerWorkspace(userIds, { access: "free" });
    const result = await startCheckout(owner.userId, weddingId, FULL_ACCESS, new Date(), { promoCode: promo.code });
    expect(result).toMatchObject({ ok: true, free: true });
    const transaction = await getDb().paymentTransaction.findFirstOrThrow({ where: { weddingId } });
    expect(transaction).toMatchObject({ amount: 0n, discountAmount: await fullAccessPrice() });
  });

  it("still needs a payment provider for anything short of free", async () => {
    const partial = await newPromo({ discountValue: 50n });
    const { owner, weddingId } = await createOwnerWorkspace(userIds, { access: "free" });
    expect(await startCheckout(owner.userId, weddingId, FULL_ACCESS, new Date(), { promoCode: partial.code })).toEqual({
      ok: false,
      reason: "provider_unavailable",
    });
    expect(await startCheckout(owner.userId, weddingId, FULL_ACCESS)).toEqual({ ok: false, reason: "provider_unavailable" });
    // The refused attempt used nothing up.
    expect(await getDb().paymentTransaction.count({ where: { weddingId } })).toBe(0);
    expect(await getDb().promoRedemption.count({ where: { promoCodeId: partial.id } })).toBe(0);
  });

  it("skips the provider for a free promo even when payments are on", async () => {
    payments.on = true;
    const promo = await newPromo();
    const { owner, weddingId } = await createOwnerWorkspace(userIds, { access: "free" });
    expect(await startCheckout(owner.userId, weddingId, FULL_ACCESS, new Date(), { promoCode: promo.code })).toMatchObject({ ok: true, free: true });
    expect(payments.checkouts).toEqual([]);

    // A paid checkout still goes to the provider.
    const other = await createOwnerWorkspace(userIds, { access: "free" });
    const paid = await startCheckout(other.owner.userId, other.weddingId, FULL_ACCESS);
    expect(paid).toMatchObject({ ok: true, free: false });
    expect(payments.checkouts).toHaveLength(1);
  });

  it("respects the usage limits of a free promo", async () => {
    const promo = await newPromo({ usageLimit: 1 });
    const first = await createOwnerWorkspace(userIds, { access: "free" });
    const second = await createOwnerWorkspace(userIds, { access: "free" });
    expect(await startCheckout(first.owner.userId, first.weddingId, FULL_ACCESS, new Date(), { promoCode: promo.code })).toMatchObject({ ok: true });
    expect(await startCheckout(second.owner.userId, second.weddingId, FULL_ACCESS, new Date(), { promoCode: promo.code })).toEqual({
      ok: false,
      reason: "promo_exhausted",
    });
    expect((await getWeddingFeatures(second.weddingId)).has("guests")).toBe(false);
  });

  it("allows a Rp0 order only as a paid free checkout, at the database level", async () => {
    const { owner, weddingId } = await createOwnerWorkspace(userIds, { access: "free" });
    const plan = await getDb().plan.findUniqueOrThrow({ where: { code: "FULL_ACCESS" }, select: { id: true } });
    const order = (provider: string, status: "PENDING" | "PAID") =>
      getDb().paymentTransaction.create({
        data: {
          orderId: `SHT-TEST-${randomUUID().slice(0, 8)}`,
          weddingId,
          userId: owner.userId,
          kind: "PLAN",
          planId: plan.id,
          itemName: "Full Access",
          amount: 0n,
          provider,
          status,
          paidAt: status === "PAID" ? new Date() : null,
          expiresAt: new Date(Date.now() + 3_600_000),
        },
      });
    await expect(order("sandbox", "PAID")).rejects.toThrow(/payment_transactions_amount_positive/);
    await expect(order(FREE_PROVIDER, "PENDING")).rejects.toThrow(/payment_transactions_amount_positive/);
  });
});
