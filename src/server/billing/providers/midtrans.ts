import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import type { PaymentStatusValue } from "@/lib/billing";
import {
  parseWholeRupiah,
  PaymentProviderError,
  type CheckoutRequest,
  type CheckoutSession,
  type NotificationRejection,
  type PaymentNotification,
  type PaymentProvider,
} from "./types";

const SNAP_URL = {
  sandbox: "https://app.sandbox.midtrans.com/snap/v1/transactions",
  production: "https://app.midtrans.com/snap/v1/transactions",
} as const;

/** Midtrans notification signature: SHA-512 of order_id + status_code + gross_amount + server key. */
export function midtransSignature(orderId: string, statusCode: string, grossAmount: string, serverKey: string): string {
  return createHash("sha512").update(`${orderId}${statusCode}${grossAmount}${serverKey}`).digest("hex");
}

/**
 * Maps Midtrans' transaction_status (and fraud_status for card captures) onto our five states.
 * Returns null for statuses we deliberately do not act on (e.g. "authorize", or a challenged capture).
 */
export function mapMidtransStatus(transactionStatus: string, fraudStatus: string | null): PaymentStatusValue | null {
  switch (transactionStatus) {
    case "settlement":
      return "PAID";
    case "capture":
      return fraudStatus === null || fraudStatus === "accept" ? "PAID" : null;
    case "pending":
      return "PENDING";
    case "deny":
    case "cancel":
    case "failure":
      return "FAILED";
    case "expire":
      return "EXPIRED";
    case "refund":
    case "partial_refund":
      return "REFUNDED";
    default:
      return null;
  }
}

export class MidtransPaymentProvider implements PaymentProvider {
  readonly code = "midtrans" as const;

  constructor(
    private readonly options: { serverKey: string | undefined; isProduction: boolean; fetchImpl?: typeof fetch },
  ) {}

  private requireKey(): string {
    if (!this.options.serverKey) throw new PaymentProviderError("MIDTRANS_SERVER_KEY is not set", "not_configured");
    return this.options.serverKey;
  }

  async createCheckout(request: CheckoutRequest): Promise<CheckoutSession> {
    const serverKey = this.requireKey();
    const minutes = Math.max(1, Math.round((request.expiresAt.getTime() - Date.now()) / 60_000));
    const response = await (this.options.fetchImpl ?? fetch)(SNAP_URL[this.options.isProduction ? "production" : "sandbox"], {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Basic ${Buffer.from(`${serverKey}:`).toString("base64")}`,
      },
      body: JSON.stringify({
        transaction_details: { order_id: request.orderId, gross_amount: Number(request.amount) },
        item_details: [{ id: request.orderId, name: request.itemName.slice(0, 50), price: Number(request.amount), quantity: 1 }],
        customer_details: { first_name: request.customer.name.slice(0, 50), email: request.customer.email },
        callbacks: { finish: request.returnUrl },
        expiry: { unit: "minutes", duration: minutes },
      }),
    });
    if (!response.ok) {
      throw new PaymentProviderError(`Midtrans Snap responded ${response.status}`, "provider_error");
    }
    const data = (await response.json()) as { token?: string; redirect_url?: string };
    if (!data.redirect_url) throw new PaymentProviderError("Midtrans Snap returned no redirect_url", "provider_error");
    return { checkoutUrl: data.redirect_url, reference: data.token ?? null };
  }

  async parseNotification({ body }: { headers: Headers; body: string }): Promise<PaymentNotification | { error: NotificationRejection }> {
    if (!this.options.serverKey) return { error: "not_configured" };

    let data: Record<string, unknown>;
    try {
      data = JSON.parse(body) as Record<string, unknown>;
    } catch {
      return { error: "invalid_payload" };
    }
    const text = (key: string) => (typeof data[key] === "string" ? (data[key] as string) : "");
    const orderId = text("order_id");
    const statusCode = text("status_code");
    const grossAmount = text("gross_amount");
    const signature = text("signature_key");
    if (!orderId || !statusCode || !grossAmount || !signature) return { error: "invalid_payload" };

    const expected = midtransSignature(orderId, statusCode, grossAmount, this.options.serverKey);
    const valid = signature.length === expected.length && timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    if (!valid) return { error: "invalid_signature" };

    const reported = text("transaction_status");
    const status = mapMidtransStatus(reported, text("fraud_status") || null);
    if (!status) return { error: "invalid_payload" };

    const payload = Object.fromEntries(Object.entries(data).filter(([key]) => key !== "signature_key"));
    return {
      orderId,
      status,
      reportedStatus: reported,
      amount: parseWholeRupiah(grossAmount),
      eventId: text("transaction_id") ? `${text("transaction_id")}:${reported}` : null,
      reference: text("transaction_id") || null,
      payload,
    };
  }
}
