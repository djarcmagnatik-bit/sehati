import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as webhookRoute } from "@/app/api/payments/webhook/[provider]/route";
import { getWeddingFeatures } from "@/server/billing/access";
import { reconcilePendingPayments, startCheckout, syncPaymentForUser } from "@/server/billing/billing-service";
import { midtransSignature } from "@/server/billing/providers/midtrans";
import { getDb } from "@/server/db";
import { createTestUser, deleteUsers } from "../support/integration-helpers";
import { createOwnerWorkspace } from "../support/workspace-helpers";

// Midtrans is the real provider class; only its HTTP calls are answered locally.
const { statusAnswers, fetchCalls, KEY } = vi.hoisted(() => ({
  statusAnswers: new Map<string, { status: number; body: unknown } | "network_error">(),
  fetchCalls: [] as string[],
  KEY: "SB-Mid-server-integration-test-key",
}));

vi.mock("@/server/billing/providers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/billing/providers")>();
  const { MidtransPaymentProvider } = await import("@/server/billing/providers/midtrans");
  const fetchImpl = (async (input: string | URL | Request) => {
    const url = String(input);
    fetchCalls.push(url);
    const orderId = decodeURIComponent(/\/v2\/([^/]+)\/status$/.exec(url)?.[1] ?? "");
    const answer = statusAnswers.get(orderId) ?? { status: 404, body: { status_code: "404", status_message: "Transaction doesn't exist." } };
    if (answer === "network_error") throw new TypeError("fetch failed");
    return new Response(JSON.stringify(answer.body), { status: answer.status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return {
    ...actual,
    getPaymentProviderByCode: (code: string) =>
      code === "midtrans" ? new MidtransPaymentProvider({ serverKey: KEY, isProduction: false, fetchImpl }) : actual.getPaymentProviderByCode(code),
  };
});

const userIds: string[] = [];

afterAll(async () => {
  await deleteUsers(userIds);
});

beforeEach(() => {
  statusAnswers.clear();
  fetchCalls.length = 0;
});

/** A pending Full Access order that belongs to Midtrans. */
async function midtransOrder() {
  const { owner, weddingId } = await createOwnerWorkspace(userIds, { access: "free" });
  const result = await startCheckout(owner.userId, weddingId, { kind: "PLAN", code: "FULL_ACCESS" });
  if (!result.ok) throw new Error(result.reason);
  const transaction = await getDb().paymentTransaction.update({ where: { orderId: result.orderId }, data: { provider: "midtrans" } });
  return { owner, weddingId, orderId: result.orderId, amount: transaction.amount };
}

function statusBody(orderId: string, transactionStatus: string, grossAmount: string, transactionId = `tx-${orderId}`) {
  return {
    status_code: transactionStatus === "settlement" ? "200" : "201",
    transaction_status: transactionStatus,
    fraud_status: "accept",
    order_id: orderId,
    gross_amount: grossAmount,
    transaction_id: transactionId,
    payment_type: "bank_transfer",
    signature_key: "not-used-for-status-responses",
  };
}

async function notify(orderId: string, transactionStatus: string, grossAmount: string, serverKey = KEY) {
  const statusCode = transactionStatus === "settlement" ? "200" : "201";
  const body = JSON.stringify({
    order_id: orderId,
    status_code: statusCode,
    gross_amount: grossAmount,
    transaction_status: transactionStatus,
    transaction_id: `tx-${orderId}`,
    signature_key: midtransSignature(orderId, statusCode, grossAmount, serverKey),
  });
  const request = new Request("http://localhost/api/payments/webhook/midtrans", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
  return webhookRoute(request as never, { params: Promise.resolve({ provider: "midtrans" }) });
}

const status = (orderId: string) => getDb().paymentTransaction.findUniqueOrThrow({ where: { orderId }, select: { status: true } }).then((row) => row.status);

describe("Midtrans webhook confirmed by the status API", () => {
  it("does not trust a signed notification the status API does not confirm", async () => {
    const { orderId, amount, weddingId } = await midtransOrder();
    statusAnswers.set(orderId, { status: 200, body: statusBody(orderId, "pending", `${amount}.00`) });

    const response = await notify(orderId, "settlement", `${amount}.00`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ outcome: "unchanged" });
    expect(await status(orderId)).toBe("PENDING");
    expect((await getWeddingFeatures(weddingId, new Date())).size).toBe(0);
    expect(fetchCalls).toEqual([`https://api.sandbox.midtrans.com/v2/${orderId}/status`]);
  });

  it("applies a confirmed settlement once and grants the plan", async () => {
    const { orderId, amount, weddingId } = await midtransOrder();
    statusAnswers.set(orderId, { status: 200, body: statusBody(orderId, "settlement", `${amount}.00`) });

    expect(await (await notify(orderId, "settlement", `${amount}.00`)).json()).toEqual({ outcome: "applied" });
    expect(await status(orderId)).toBe("PAID");
    expect((await getWeddingFeatures(weddingId, new Date())).size).toBeGreaterThan(0);
    // Midtrans retries: the same event is recognised.
    expect(await (await notify(orderId, "settlement", `${amount}.00`)).json()).toEqual({ outcome: "duplicate" });
    const events = await getDb().paymentWebhookEvent.findMany({ where: { orderId }, select: { outcome: true, payload: true } });
    expect(events.map((event) => event.outcome)).toEqual(["applied"]);
    expect(JSON.stringify(events[0]!.payload)).not.toContain("signature_key");
  });

  it("refuses a confirmed amount that differs from the order", async () => {
    const { orderId } = await midtransOrder();
    statusAnswers.set(orderId, { status: 200, body: statusBody(orderId, "settlement", "1000.00") });
    expect(await (await notify(orderId, "settlement", "1000.00")).json()).toEqual({ outcome: "amount_mismatch" });
    expect(await status(orderId)).toBe("PENDING");
  });

  it("asks Midtrans to retry when the status API is unreachable, and rejects bad signatures without asking", async () => {
    const { orderId, amount } = await midtransOrder();
    statusAnswers.set(orderId, "network_error");
    expect((await notify(orderId, "settlement", `${amount}.00`)).status).toBe(503);
    statusAnswers.set(orderId, { status: 500, body: { status_code: "500" } });
    expect((await notify(orderId, "settlement", `${amount}.00`)).status).toBe(503);
    expect(await status(orderId)).toBe("PENDING");

    fetchCalls.length = 0;
    expect((await notify(orderId, "settlement", `${amount}.00`, "SB-Mid-server-wrong-key")).status).toBe(401);
    expect(fetchCalls).toEqual([]);
  });
});

describe("status sync from the return page", () => {
  it("applies the provider's answer for a member and skips everyone else", async () => {
    const { owner, orderId, amount } = await midtransOrder();
    const stranger = await createTestUser(userIds, "Asing");
    statusAnswers.set(orderId, { status: 200, body: statusBody(orderId, "settlement", `${amount}.00`) });

    expect(await syncPaymentForUser(stranger.userId, orderId)).toBe("skipped");
    expect(fetchCalls).toEqual([]);
    expect(await syncPaymentForUser(owner.userId, orderId)).toBe("applied");
    expect(await status(orderId)).toBe("PAID");
    // Once paid there is nothing left to ask.
    expect(await syncPaymentForUser(owner.userId, orderId)).toBe("skipped");
    expect(fetchCalls).toHaveLength(1);
  });

  it("leaves an order Midtrans has not seen yet pending", async () => {
    const { owner, orderId } = await midtransOrder();
    expect(await syncPaymentForUser(owner.userId, orderId)).toBe("not_found");
    expect(await status(orderId)).toBe("PENDING");
  });

  it("does not act on statuses outside the mapping", async () => {
    const { owner, orderId, amount } = await midtransOrder();
    statusAnswers.set(orderId, { status: 200, body: statusBody(orderId, "authorize", `${amount}.00`) });
    expect(await syncPaymentForUser(owner.userId, orderId)).toBe("unhandled_status");
    expect(await status(orderId)).toBe("PENDING");
  });
});

describe("reconciling pending payments (worker job)", () => {
  it("re-checks pending orders older than five minutes and applies what Midtrans reports", async () => {
    const now = new Date();
    const expired = await midtransOrder();
    const paid = await midtransOrder();
    const unseen = await midtransOrder();
    const fresh = await midtransOrder();
    const old = new Date(now.getTime() - 10 * 60_000);
    await getDb().paymentTransaction.updateMany({
      where: { orderId: { in: [expired.orderId, paid.orderId, unseen.orderId] } },
      data: { createdAt: old },
    });
    statusAnswers.set(expired.orderId, { status: 200, body: statusBody(expired.orderId, "expire", `${expired.amount}.00`) });
    statusAnswers.set(paid.orderId, { status: 200, body: statusBody(paid.orderId, "settlement", `${paid.amount}.00`) });
    statusAnswers.set(fresh.orderId, { status: 200, body: statusBody(fresh.orderId, "settlement", `${fresh.amount}.00`) });

    const summary = await reconcilePendingPayments(now);
    expect(summary.applied).toBeGreaterThanOrEqual(2);
    expect(await status(expired.orderId)).toBe("EXPIRED");
    expect(await status(paid.orderId)).toBe("PAID");
    expect(await status(unseen.orderId)).toBe("PENDING");
    // Younger than five minutes: the webhook still has time.
    expect(await status(fresh.orderId)).toBe("PENDING");
    expect(fetchCalls.some((url) => url.includes(fresh.orderId))).toBe(false);
  });

  it("stops at the first order when the server key is rejected", async () => {
    const first = await midtransOrder();
    const second = await midtransOrder();
    const old = new Date(Date.now() - 10 * 60_000);
    await getDb().paymentTransaction.updateMany({ where: { orderId: { in: [first.orderId, second.orderId] } }, data: { createdAt: old } });
    for (const { orderId } of [first, second]) statusAnswers.set(orderId, { status: 401, body: { status_code: "401" } });

    const summary = await reconcilePendingPayments(new Date(), { limit: 2 });
    expect(summary).toEqual({ checked: 1, applied: 0, failed: 1 });
  });
});
