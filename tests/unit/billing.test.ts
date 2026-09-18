import { createHash, createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  decideTransition,
  FEATURES,
  formatOrderId,
  isEntitlementActive,
  knownFeatures,
  ORDER_ID_PATTERN,
  PAYMENT_STATUSES,
} from "@/lib/billing";
import { mapMidtransStatus, midtransSignature, MidtransPaymentProvider } from "@/server/billing/providers/midtrans";
import { SANDBOX_SIGNATURE_HEADER, SandboxPaymentProvider, signSandboxPayload } from "@/server/billing/providers/sandbox";
import { parseWholeRupiah } from "@/server/billing/providers/types";

const DAY = 86_400_000;
const now = new Date("2026-09-18T10:00:00Z");

describe("features and entitlements", () => {
  it("keeps only feature keys the app can enforce", () => {
    expect(knownFeatures(["budget", "guests", "budget", "reports", "BUDGET", ""])).toEqual(["budget", "guests"]);
    expect(FEATURES).toContain("collaboration");
  });

  it("treats an entitlement as active only inside its window and unrevoked", () => {
    const base = { startsAt: new Date(now.getTime() - DAY), expiresAt: null, revokedAt: null };
    expect(isEntitlementActive(base, now)).toBe(true);
    expect(isEntitlementActive({ ...base, expiresAt: new Date(now.getTime() + DAY) }, now)).toBe(true);
    expect(isEntitlementActive({ ...base, expiresAt: now }, now)).toBe(false);
    expect(isEntitlementActive({ ...base, startsAt: new Date(now.getTime() + DAY) }, now)).toBe(false);
    expect(isEntitlementActive({ ...base, revokedAt: now }, now)).toBe(false);
  });
});

describe("payment status transitions", () => {
  it("allows only forward moves, a late settlement, and refunds of paid orders", () => {
    const table = Object.fromEntries(
      PAYMENT_STATUSES.map((from) => [from, PAYMENT_STATUSES.filter((to) => decideTransition(from, to) === "apply")]),
    );
    expect(table).toEqual({
      PENDING: ["PAID", "FAILED", "EXPIRED"],
      PAID: ["REFUNDED"],
      FAILED: ["PAID"],
      EXPIRED: ["PAID"],
      REFUNDED: [],
    });
  });

  it("reports repeats as unchanged and regressions as ignored", () => {
    expect(decideTransition("PAID", "PAID")).toBe("unchanged");
    expect(decideTransition("PAID", "PENDING")).toBe("ignored");
    expect(decideTransition("REFUNDED", "PAID")).toBe("ignored");
  });
});

describe("order ids", () => {
  it("are dated, opaque and match the accepted pattern", () => {
    const id = formatOrderId(now, "7k3m9q2xwa");
    expect(id).toBe("SHT-20260918-7K3M9Q2XWA");
    expect(ORDER_ID_PATTERN.test(id)).toBe(true);
    expect(ORDER_ID_PATTERN.test("SHT-20260918-short")).toBe(false);
    expect(ORDER_ID_PATTERN.test("'; DROP TABLE--")).toBe(false);
  });
});

describe("parseWholeRupiah", () => {
  it("accepts whole amounts in the forms providers send", () => {
    expect(parseWholeRupiah("149000")).toBe(149_000n);
    expect(parseWholeRupiah("149000.00")).toBe(149_000n);
    expect(parseWholeRupiah(149000)).toBe(149_000n);
  });

  it("rejects fractions and junk", () => {
    expect(parseWholeRupiah("149000.50")).toBeNull();
    expect(parseWholeRupiah("-1")).toBeNull();
    expect(parseWholeRupiah("1e5")).toBeNull();
    expect(parseWholeRupiah(null)).toBeNull();
  });
});

describe("sandbox provider", () => {
  const secret = "unit-test-sandbox-secret-012345";
  const provider = new SandboxPaymentProvider({ appUrl: "http://localhost:3000/", secret });
  const body = JSON.stringify({ order_id: "SHT-20260918-AAAAAAAAAA", status: "PAID", gross_amount: "149000", event_id: "evt-1" });

  it("sends the buyer to the local simulated payment page", async () => {
    const session = await provider.createCheckout({
      orderId: "SHT-20260918-AAAAAAAAAA",
      amount: 149_000n,
      itemName: "Akses Penuh",
      customer: { name: "Fajar", email: "f@example.test" },
      expiresAt: now,
      returnUrl: "http://localhost:3000/billing/return",
    });
    expect(session.checkoutUrl).toBe("http://localhost:3000/payments/sandbox/SHT-20260918-AAAAAAAAAA");
  });

  it("accepts a correctly signed notification", async () => {
    const headers = new Headers({ [SANDBOX_SIGNATURE_HEADER]: signSandboxPayload(secret, body) });
    expect(await provider.parseNotification({ headers, body })).toMatchObject({
      orderId: "SHT-20260918-AAAAAAAAAA",
      status: "PAID",
      amount: 149_000n,
      eventId: "evt-1",
    });
    expect(signSandboxPayload(secret, body)).toBe(createHmac("sha256", secret).update(body).digest("hex"));
  });

  it("rejects a missing, wrong or re-used signature over a changed body", async () => {
    expect(await provider.parseNotification({ headers: new Headers(), body })).toEqual({ error: "invalid_signature" });
    const signature = signSandboxPayload(secret, body);
    const tampered = body.replace("149000", "1");
    expect(await provider.parseNotification({ headers: new Headers({ [SANDBOX_SIGNATURE_HEADER]: signature }), body: tampered })).toEqual({
      error: "invalid_signature",
    });
  });

  it("refuses to run without a secret", async () => {
    const unconfigured = new SandboxPaymentProvider({ appUrl: "http://localhost:3000", secret: undefined });
    expect(await unconfigured.parseNotification({ headers: new Headers(), body })).toEqual({ error: "not_configured" });
  });
});

describe("midtrans provider", () => {
  const serverKey = "SB-Mid-server-unit-test";
  const provider = new MidtransPaymentProvider({ serverKey, isProduction: false });

  function notification(overrides: Record<string, string> = {}) {
    const data = {
      order_id: "SHT-20260918-BBBBBBBBBB",
      status_code: "200",
      gross_amount: "149000.00",
      transaction_status: "settlement",
      transaction_id: "tx-123",
      ...overrides,
    };
    const signature = createHash("sha512").update(`${data.order_id}${data.status_code}${data.gross_amount}${serverKey}`).digest("hex");
    return { ...data, signature_key: overrides.signature_key ?? signature };
  }

  it("computes the documented signature", () => {
    expect(midtransSignature("A", "200", "10.00", "key")).toBe(createHash("sha512").update("A20010.00key").digest("hex"));
  });

  it("maps transaction statuses conservatively", () => {
    expect(mapMidtransStatus("settlement", null)).toBe("PAID");
    expect(mapMidtransStatus("capture", "accept")).toBe("PAID");
    expect(mapMidtransStatus("capture", "challenge")).toBeNull();
    expect(mapMidtransStatus("pending", null)).toBe("PENDING");
    expect(mapMidtransStatus("deny", null)).toBe("FAILED");
    expect(mapMidtransStatus("cancel", null)).toBe("FAILED");
    expect(mapMidtransStatus("expire", null)).toBe("EXPIRED");
    expect(mapMidtransStatus("refund", null)).toBe("REFUNDED");
    expect(mapMidtransStatus("authorize", null)).toBeNull();
  });

  it("verifies a notification and strips the signature from the stored payload", async () => {
    const parsed = await provider.parseNotification({ headers: new Headers(), body: JSON.stringify(notification()) });
    expect(parsed).toMatchObject({ orderId: "SHT-20260918-BBBBBBBBBB", status: "PAID", amount: 149_000n, eventId: "tx-123:settlement" });
    expect("payload" in parsed && "signature_key" in parsed.payload).toBe(false);
  });

  it("rejects a forged signature", async () => {
    const forged = notification({ signature_key: "0".repeat(128) });
    expect(await provider.parseNotification({ headers: new Headers(), body: JSON.stringify(forged) })).toEqual({ error: "invalid_signature" });
  });

  describe("status API", () => {
    const ORDER = "SHT-20260918-BBBBBBBBBB";
    const withAnswer = (status: number, body: unknown, isProduction = false) => {
      const fetchImpl = vi.fn(async () => new Response(JSON.stringify(body), { status }));
      return { fetchImpl, provider: new MidtransPaymentProvider({ serverKey, isProduction, fetchImpl: fetchImpl as unknown as typeof fetch }) };
    };

    it("reads a settlement with our own authenticated GET", async () => {
      const { fetchImpl, provider } = withAnswer(200, { ...notification(), signature_key: "ignored" });
      const reading = await provider.fetchStatus(ORDER);
      expect(reading).toMatchObject({ orderId: ORDER, status: "PAID", amount: 149_000n, eventId: "tx-123:settlement", reference: "tx-123" });
      expect("payload" in reading && "signature_key" in reading.payload).toBe(false);
      const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe(`https://api.sandbox.midtrans.com/v2/${ORDER}/status`);
      expect(init.method).toBe("GET");
      expect((init.headers as Record<string, string>)["Authorization"]).toBe(`Basic ${Buffer.from(`${serverKey}:`).toString("base64")}`);
      expect(init.signal).toBeInstanceOf(AbortSignal);
    });

    it("uses the production API when asked", async () => {
      const { fetchImpl, provider } = withAnswer(200, notification(), true);
      await provider.fetchStatus(ORDER);
      expect((fetchImpl.mock.calls[0] as unknown as [string])[0]).toBe(`https://api.midtrans.com/v2/${ORDER}/status`);
    });

    it("reports unknown orders and unmapped statuses without acting", async () => {
      expect(await withAnswer(404, { status_code: "404", status_message: "Transaction doesn't exist." }).provider.fetchStatus(ORDER)).toEqual({ error: "not_found" });
      expect(await withAnswer(200, { status_code: "404" }).provider.fetchStatus(ORDER)).toEqual({ error: "not_found" });
      expect(await withAnswer(200, notification({ transaction_status: "authorize" })).provider.fetchStatus(ORDER)).toEqual({
        error: "unhandled_status",
        reportedStatus: "authorize",
      });
    });

    it("throws on a rejected key, a server error or another order's answer", async () => {
      await expect(withAnswer(401, { status_code: "401" }).provider.fetchStatus(ORDER)).rejects.toMatchObject({ reason: "not_configured" });
      await expect(withAnswer(500, {}).provider.fetchStatus(ORDER)).rejects.toMatchObject({ reason: "provider_error" });
      await expect(withAnswer(200, notification({ order_id: "SHT-20260918-CCCCCCCCCC" })).provider.fetchStatus(ORDER)).rejects.toMatchObject({
        reason: "provider_error",
      });
      await expect(new MidtransPaymentProvider({ serverKey: undefined, isProduction: false }).fetchStatus(ORDER)).rejects.toMatchObject({
        reason: "not_configured",
      });
    });
  });

  it("creates a Snap checkout with basic auth and the order details", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ token: "snap-token", redirect_url: "https://app.sandbox.midtrans.com/snap/v4/redirection/x" }));
    const withFetch = new MidtransPaymentProvider({ serverKey, isProduction: false, fetchImpl: fetchImpl as unknown as typeof fetch });
    const session = await withFetch.createCheckout({
      orderId: "SHT-20260918-BBBBBBBBBB",
      amount: 149_000n,
      itemName: "Akses Penuh",
      customer: { name: "Fajar", email: "f@example.test" },
      expiresAt: new Date(Date.now() + DAY),
      returnUrl: "http://localhost:3000/billing/return?order=SHT-20260918-BBBBBBBBBB",
    });
    expect(session).toEqual({ checkoutUrl: "https://app.sandbox.midtrans.com/snap/v4/redirection/x", reference: "snap-token" });

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://app.sandbox.midtrans.com/snap/v1/transactions");
    expect((init.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from(`${serverKey}:`).toString("base64")}`);
    expect(JSON.parse(init.body as string)).toMatchObject({ transaction_details: { order_id: "SHT-20260918-BBBBBBBBBB", gross_amount: 149000 } });
  });

  it("reports an unconfigured key instead of calling Midtrans", async () => {
    const unconfigured = new MidtransPaymentProvider({ serverKey: undefined, isProduction: false });
    await expect(
      unconfigured.createCheckout({
        orderId: "SHT-20260918-BBBBBBBBBB",
        amount: 1n,
        itemName: "x",
        customer: { name: "x", email: "x@example.test" },
        expiresAt: now,
        returnUrl: "http://localhost",
      }),
    ).rejects.toMatchObject({ reason: "not_configured" });
  });
});
