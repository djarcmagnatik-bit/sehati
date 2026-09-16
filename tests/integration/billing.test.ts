import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addDaysIso, todayIsoInTimeZone } from "@/lib/dates";
import { getRecentActivity } from "@/server/activity/activity-service";
import { WeddingAccessError } from "@/server/authz/wedding-access";
import { FeatureLockedError, getWeddingFeatures } from "@/server/billing/access";
import {
  adminGrantPlan,
  consumeAddonQuota,
  getBillingOverview,
  getTransactionForUser,
  processPaymentNotification,
  startCheckout,
  type NotificationInput,
} from "@/server/billing/billing-service";
import { getBudgetOverview } from "@/server/budget/budget-service";
import { createTask } from "@/server/checklist/task-service";
import { createPartnerInvitation } from "@/server/collaboration/partner-invitation-service";
import { getDb } from "@/server/db";
import { getGuestSummary } from "@/server/guests/guest-service";
import { createWeddingEvent } from "@/server/invitation/event-service";
import { ensureInvitation, getInvitationForUser, publishInvitation, updateSectionContent } from "@/server/invitation/invitation-service";
import { getPublishedInvitation } from "@/server/invitation/public-invitation-service";
import { createCalendarEvent, listCalendarEntries } from "@/server/planning/calendar-service";
import { createRundownItem } from "@/server/planning/rundown-service";
import { createSavingsEntry, getSavingsSummary } from "@/server/planning/savings-service";
import { getSeserahanSummary } from "@/server/planning/seserahan-service";
import { listVendors } from "@/server/vendors/vendor-service";
import { DEFAULT_VENDOR_FILTERS } from "@/lib/vendor-filters";
import { POST as webhookRoute } from "@/app/api/payments/webhook/[provider]/route";
import { signSandboxPayload, SANDBOX_SIGNATURE_HEADER } from "@/server/billing/providers/sandbox";
import { MemoryMailer, createTestUser, deleteUsers } from "../support/integration-helpers";
import { createOwnerWorkspace } from "../support/workspace-helpers";

const userIds: string[] = [];
const today = todayIsoInTimeZone(new Date());
const SECRET = process.env["PAYMENT_SANDBOX_SECRET"]!;

beforeAll(async () => {
  // A purchasable add-on for the quota tests; the seeded one stays inactive.
  await getDb().addon.upsert({
    where: { code: "TEST_QUOTA" },
    update: { isActive: true, price: 25_000n, quotaAmount: 5 },
    create: { code: "TEST_QUOTA", name: "Kuota uji", price: 25_000n, quotaAmount: 5, unit: "unit", isActive: true },
  });
});

afterAll(async () => {
  await deleteUsers(userIds);
  // Keep the test-only add-on out of the shared test database (and the E2E pages).
  await getDb().addon.deleteMany({ where: { code: "TEST_QUOTA" } });
});

function paid(orderId: string, amount: bigint, overrides: Partial<NotificationInput> = {}): NotificationInput {
  return {
    provider: "sandbox",
    orderId,
    status: "PAID",
    reportedStatus: "paid",
    amount,
    eventKey: `sandbox:${orderId}:PAID:${randomUUID()}`,
    reference: null,
    payload: { order_id: orderId },
    ...overrides,
  };
}

async function checkoutPlan(userId: string, weddingId: string) {
  const result = await startCheckout(userId, weddingId, { kind: "PLAN", code: "FULL_ACCESS" });
  if (!result.ok) throw new Error(`checkout failed: ${result.reason}`);
  const transaction = await getDb().paymentTransaction.findUniqueOrThrow({ where: { orderId: result.orderId } });
  return { ...result, transaction };
}

describe("free access", () => {
  it("locks paid features at the service layer while free ones keep working", async () => {
    const { owner, weddingId } = await createOwnerWorkspace(userIds, { access: "free" });
    expect((await getWeddingFeatures(weddingId, new Date())).size).toBe(0);

    await expect(getBudgetOverview(owner.userId, weddingId)).rejects.toBeInstanceOf(FeatureLockedError);
    await expect(getGuestSummary(owner.userId, weddingId)).rejects.toBeInstanceOf(FeatureLockedError);
    await expect(listVendors(owner.userId, weddingId, DEFAULT_VENDOR_FILTERS)).rejects.toBeInstanceOf(FeatureLockedError);
    await expect(ensureInvitation(owner.userId, weddingId)).rejects.toBeInstanceOf(FeatureLockedError);
    await expect(getSeserahanSummary(owner.userId, weddingId)).rejects.toBeInstanceOf(FeatureLockedError);
    await expect(
      createRundownItem(owner.userId, weddingId, {
        title: "Makeup",
        itemDate: null,
        startTime: "05:00",
        endTime: null,
        description: null,
        pic: null,
        location: null,
        category: null,
        notes: null,
      }),
    ).rejects.toBeInstanceOf(FeatureLockedError);
    await expect(
      createPartnerInvitation(owner.userId, weddingId, "partner@example.test", { mailer: new MemoryMailer(), appUrl: "http://localhost" }),
    ).rejects.toBeInstanceOf(FeatureLockedError);

    // Free: savings, checklist and the calendar (restricted to free sources).
    await createSavingsEntry(owner.userId, weddingId, { contributor: "Fajar", amount: 1_000_000n, entryDate: today, account: null, notes: null });
    expect(await getSavingsSummary(owner.userId, weddingId)).toMatchObject({ saved: 1_000_000n });
    await createCalendarEvent(owner.userId, weddingId, {
      title: "Fitting",
      eventDate: addDaysIso(today, 2),
      startTime: null,
      endTime: null,
      location: null,
      notes: null,
    });
    const entries = await listCalendarEntries(owner.userId, weddingId, today, addDaysIso(today, 30));
    expect(entries.some((entry) => entry.source === "custom")).toBe(true);
    expect(entries.every((entry) => entry.source === "task" || entry.source === "custom")).toBe(true);

    const category = await getDb().taskCategory.findFirstOrThrow();
    expect(
      await createTask(owner.userId, weddingId, {
        title: "Tugas gratis",
        description: null,
        categoryId: category.id,
        dueDate: null,
        priority: "MEDIUM",
        assigneeMemberId: null,
      }),
    ).toMatchObject({ ok: true });
  });

  it("still says 'not found' to outsiders instead of revealing what a wedding paid for", async () => {
    const { weddingId } = await createOwnerWorkspace(userIds, { access: "free" });
    const outsider = await createTestUser(userIds, "Outsider");
    await expect(getBudgetOverview(outsider.userId, weddingId)).rejects.toBeInstanceOf(WeddingAccessError);
  });
});

describe("checkout", () => {
  it("creates a pending order with the plan's current price and grants nothing yet", async () => {
    const { owner, weddingId } = await createOwnerWorkspace(userIds, { access: "free" });
    const { orderId, checkoutUrl, transaction } = await checkoutPlan(owner.userId, weddingId);

    expect(checkoutUrl).toBe(`http://localhost:3000/payments/sandbox/${orderId}`);
    expect(transaction).toMatchObject({ status: "PENDING", kind: "PLAN", amount: 149_000n, itemName: "Akses Penuh", provider: "sandbox" });
    expect((await getWeddingFeatures(weddingId, new Date())).size).toBe(0);
    expect(await getTransactionForUser(owner.userId, orderId)).toMatchObject({ status: "PENDING" });
  });

  it("reuses an open checkout instead of opening a second order", async () => {
    const { owner, weddingId } = await createOwnerWorkspace(userIds, { access: "free" });
    const first = await checkoutPlan(owner.userId, weddingId);
    const second = await startCheckout(owner.userId, weddingId, { kind: "PLAN", code: "FULL_ACCESS" });
    expect(second).toMatchObject({ ok: true, orderId: first.orderId, reused: true });
    expect(await getDb().paymentTransaction.count({ where: { weddingId } })).toBe(1);
  });

  it("refuses unknown items, inactive add-ons and a plan the wedding already has", async () => {
    const { owner, weddingId } = await createOwnerWorkspace(userIds);
    expect(await startCheckout(owner.userId, weddingId, { kind: "PLAN", code: "NOPE" })).toEqual({ ok: false, reason: "unknown_item" });
    expect(await startCheckout(owner.userId, weddingId, { kind: "ADDON", code: "VOICE_GREETING" })).toEqual({ ok: false, reason: "unknown_item" });
    expect(await startCheckout(owner.userId, weddingId, { kind: "PLAN", code: "FULL_ACCESS" })).toEqual({ ok: false, reason: "already_active" });
  });

  it("keeps orders private to the wedding", async () => {
    const { owner, weddingId } = await createOwnerWorkspace(userIds, { access: "free" });
    const outsider = await createTestUser(userIds, "Outsider");
    const { orderId } = await checkoutPlan(owner.userId, weddingId);
    expect(await getTransactionForUser(outsider.userId, orderId)).toBeNull();
    await expect(startCheckout(outsider.userId, weddingId, { kind: "PLAN", code: "FULL_ACCESS" })).rejects.toBeInstanceOf(WeddingAccessError);
  });
});

describe("payment webhooks", () => {
  it("unlocks every plan feature once the payment is confirmed", async () => {
    const { owner, weddingId } = await createOwnerWorkspace(userIds, { access: "free" });
    const { orderId, transaction } = await checkoutPlan(owner.userId, weddingId);

    expect(await processPaymentNotification(paid(orderId, transaction.amount))).toBe("applied");
    expect(await getTransactionForUser(owner.userId, orderId)).toMatchObject({ status: "PAID" });
    expect([...(await getWeddingFeatures(weddingId, new Date()))].sort()).toEqual(
      ["budget", "collaboration", "guests", "invitation", "rundown", "seserahan", "vendors"],
    );
    await expect(getBudgetOverview(owner.userId, weddingId)).resolves.toBeDefined();

    const overview = await getBillingOverview(owner.userId, weddingId);
    expect(overview.lockedFeatures).toEqual([]);
    expect(overview.activeEntitlements[0]).toMatchObject({ source: "PURCHASE", expiresAt: null });

    const activity = await getRecentActivity(owner.userId, weddingId, 3);
    expect(activity[0]).toMatchObject({ action: "billing.payment_paid", actorName: "Sistem pembayaran" });
  });

  it("is idempotent: replays and concurrent copies grant exactly once", async () => {
    const { owner, weddingId } = await createOwnerWorkspace(userIds, { access: "free" });
    const { orderId, transaction } = await checkoutPlan(owner.userId, weddingId);
    const event = paid(orderId, transaction.amount);

    const outcomes = await Promise.all([
      processPaymentNotification(event),
      processPaymentNotification(event),
      processPaymentNotification({ ...event, eventKey: `${event.eventKey}-other` }),
    ]);
    expect(outcomes.filter((outcome) => outcome === "applied")).toHaveLength(1);
    expect(outcomes.sort()).toEqual(["applied", "duplicate", "unchanged"].sort());
    expect(await getDb().weddingEntitlement.count({ where: { weddingId } })).toBe(1);
    expect(await processPaymentNotification(event)).toBe("duplicate");
  });

  it("does not grant when the reported amount differs from the order", async () => {
    const { owner, weddingId } = await createOwnerWorkspace(userIds, { access: "free" });
    const { orderId } = await checkoutPlan(owner.userId, weddingId);
    expect(await processPaymentNotification(paid(orderId, 1_000n))).toBe("amount_mismatch");
    expect(await getTransactionForUser(owner.userId, orderId)).toMatchObject({ status: "PENDING" });
    expect((await getWeddingFeatures(weddingId, new Date())).size).toBe(0);
  });

  it("ignores another provider's notification and unknown orders", async () => {
    const { owner, weddingId } = await createOwnerWorkspace(userIds, { access: "free" });
    const { orderId, transaction } = await checkoutPlan(owner.userId, weddingId);
    expect(await processPaymentNotification(paid(orderId, transaction.amount, { provider: "midtrans" }))).toBe("provider_mismatch");
    expect(await processPaymentNotification(paid("SHT-20260918-ZZZZZZZZZZ", 149_000n))).toBe("unknown_order");
    expect((await getWeddingFeatures(weddingId, new Date())).size).toBe(0);
  });

  it("never moves a paid order backwards, but accepts a late settlement after a failure", async () => {
    const { owner, weddingId } = await createOwnerWorkspace(userIds, { access: "free" });
    const { orderId, transaction } = await checkoutPlan(owner.userId, weddingId);

    expect(await processPaymentNotification(paid(orderId, transaction.amount, { status: "FAILED", reportedStatus: "deny" }))).toBe("applied");
    expect(await processPaymentNotification(paid(orderId, transaction.amount))).toBe("applied");
    expect(await processPaymentNotification(paid(orderId, transaction.amount, { status: "PENDING", reportedStatus: "pending" }))).toBe(
      "ignored_transition",
    );
    expect(await getTransactionForUser(owner.userId, orderId)).toMatchObject({ status: "PAID" });
  });

  it("revokes access on refund, taking the public invitation down with it", async () => {
    const { owner, weddingId } = await createOwnerWorkspace(userIds, { access: "free" });
    const { orderId, transaction } = await checkoutPlan(owner.userId, weddingId);
    await processPaymentNotification(paid(orderId, transaction.amount));

    await ensureInvitation(owner.userId, weddingId);
    await createWeddingEvent(owner.userId, weddingId, {
      name: "Resepsi",
      eventDate: addDaysIso(today, 200),
      startTime: null,
      endTime: null,
      venueName: null,
      address: null,
      latitude: null,
      longitude: null,
      mapsUrl: null,
      dressCode: null,
      notes: null,
    });
    const invitation = await getInvitationForUser(owner.userId, weddingId);
    const couple = invitation!.sections.find((section) => section.type === "COUPLE")!;
    await updateSectionContent(owner.userId, couple.id, { brideFullName: "Putri", groomFullName: "Fajar" }, true);
    const published = await publishInvitation(owner.userId, weddingId);
    if (!published.ok) throw new Error("publish failed");
    expect(await getPublishedInvitation(published.slug)).not.toBeNull();

    expect(await processPaymentNotification(paid(orderId, transaction.amount, { status: "REFUNDED", reportedStatus: "refund" }))).toBe("applied");
    expect((await getWeddingFeatures(weddingId, new Date())).size).toBe(0);
    expect(await getPublishedInvitation(published.slug)).toBeNull();
    await expect(getBudgetOverview(owner.userId, weddingId)).rejects.toBeInstanceOf(FeatureLockedError);
  });
});

describe("webhook endpoint", () => {
  async function post(provider: string, body: string, signature?: string) {
    const headers = new Headers({ "content-type": "application/json" });
    if (signature) headers.set(SANDBOX_SIGNATURE_HEADER, signature);
    const request = new Request(`http://localhost/api/payments/webhook/${provider}`, { method: "POST", headers, body });
    return webhookRoute(request as never, { params: Promise.resolve({ provider }) });
  }

  it("applies a signed call and refuses unsigned or unknown-provider calls", async () => {
    const { owner, weddingId } = await createOwnerWorkspace(userIds, { access: "free" });
    const { orderId } = await checkoutPlan(owner.userId, weddingId);
    const body = JSON.stringify({ order_id: orderId, status: "PAID", gross_amount: "149000", event_id: randomUUID() });

    expect((await post("sandbox", body)).status).toBe(401);
    expect((await post("sandbox", body, signSandboxPayload("wrong-secret-0123456789", body))).status).toBe(401);
    expect((await post("paypal", body, signSandboxPayload(SECRET, body))).status).toBe(404);
    expect((await getWeddingFeatures(weddingId, new Date())).size).toBe(0);

    const accepted = await post("sandbox", body, signSandboxPayload(SECRET, body));
    expect(accepted.status).toBe(200);
    expect(await accepted.json()).toEqual({ outcome: "applied" });
    const replay = await post("sandbox", body, signSandboxPayload(SECRET, body));
    expect(await replay.json()).toEqual({ outcome: "duplicate" });
    expect((await getWeddingFeatures(weddingId, new Date())).has("budget")).toBe(true);

    const events = await getDb().paymentWebhookEvent.findMany({ where: { orderId }, select: { outcome: true } });
    expect(events.map((event) => event.outcome)).toEqual(["applied"]);
  });

  it("rejects a malformed payload", async () => {
    const body = "{not json";
    expect((await post("sandbox", body, signSandboxPayload(SECRET, body))).status).toBe(400);
  });
});

describe("add-ons", () => {
  it("adds quota on payment, spends it atomically and removes it on refund", async () => {
    const { owner, weddingId } = await createOwnerWorkspace(userIds);
    const checkout = await startCheckout(owner.userId, weddingId, { kind: "ADDON", code: "TEST_QUOTA" });
    if (!checkout.ok) throw new Error(`addon checkout failed: ${checkout.reason}`);
    expect(await processPaymentNotification(paid(checkout.orderId, 25_000n))).toBe("applied");

    const results = await Promise.all(
      Array.from({ length: 8 }, (_, index) => consumeAddonQuota(owner.userId, weddingId, "TEST_QUOTA", 1, "uji", `ref-${index}`)),
    );
    expect(results.filter((result) => result.ok)).toHaveLength(5);
    expect(results.filter((result) => !result.ok)).toEqual(Array(3).fill({ ok: false, reason: "insufficient_quota" }));

    const overview = await getBillingOverview(owner.userId, weddingId);
    expect(overview.addons.find((addon) => addon.code === "TEST_QUOTA")).toMatchObject({ purchased: 5, used: 5, remaining: 0 });

    await processPaymentNotification(paid(checkout.orderId, 25_000n, { status: "REFUNDED", reportedStatus: "refund" }));
    expect((await getBillingOverview(owner.userId, weddingId)).addons.find((addon) => addon.code === "TEST_QUOTA")).toMatchObject({
      purchased: 0,
      remaining: 0,
    });
    await expect(consumeAddonQuota(owner.userId, weddingId, "TEST_QUOTA", 0, "uji")).rejects.toThrow(RangeError);
  });
});

describe("admin grants", () => {
  it("grants a plan without payment and reports unknown plans or weddings", async () => {
    const { owner, weddingId } = await createOwnerWorkspace(userIds, { access: "free" });
    expect(await adminGrantPlan(weddingId, "NOPE")).toEqual({ ok: false, reason: "unknown_plan" });
    expect(await adminGrantPlan(randomUUID(), "FULL_ACCESS")).toEqual({ ok: false, reason: "unknown_wedding" });

    expect(await adminGrantPlan(weddingId, "FULL_ACCESS", { grantedById: owner.userId, note: "Promo peluncuran" })).toMatchObject({ ok: true });
    expect((await getWeddingFeatures(weddingId, new Date())).has("guests")).toBe(true);
    expect(await getDb().weddingEntitlement.findFirstOrThrow({ where: { weddingId } })).toMatchObject({ source: "ADMIN_GRANT", transactionId: null });
  });
});
