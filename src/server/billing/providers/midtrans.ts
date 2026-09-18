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
  type StatusLookup,
} from "./types";

const SNAP_URL = {
  sandbox: "https://app.sandbox.midtrans.com/snap/v1/transactions",
  production: "https://app.midtrans.com/snap/v1/transactions",
} as const;

const API_URL = {
  sandbox: "https://api.sandbox.midtrans.com/v2",
  production: "https://api.midtrans.com/v2",
} as const;

const REQUEST_TIMEOUT_MS = 15_000;

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

/** Reads a Midtrans transaction object (notification body or status response). No signature check. */
function readTransaction(data: Record<string, unknown>): PaymentNotification | { error: "invalid_payload"; reportedStatus: string } {
  const text = (key: string) => (typeof data[key] === "string" ? (data[key] as string) : "");
  const reported = text("transaction_status");
  const status = mapMidtransStatus(reported, text("fraud_status") || null);
  if (!status || !text("order_id")) return { error: "invalid_payload", reportedStatus: reported };

  const payload = Object.fromEntries(Object.entries(data).filter(([key]) => key !== "signature_key"));
  return {
    orderId: text("order_id"),
    status,
    reportedStatus: reported,
    amount: parseWholeRupiah(text("gross_amount")),
    eventId: text("transaction_id") ? `${text("transaction_id")}:${reported}` : null,
    reference: text("transaction_id") || null,
    payload,
  };
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

  private get environment() {
    return this.options.isProduction ? "production" : "sandbox";
  }

  private headers(serverKey: string): Record<string, string> {
    return {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Basic ${Buffer.from(`${serverKey}:`).toString("base64")}`,
    };
  }

  async createCheckout(request: CheckoutRequest): Promise<CheckoutSession> {
    const serverKey = this.requireKey();
    const minutes = Math.max(1, Math.round((request.expiresAt.getTime() - Date.now()) / 60_000));
    const response = await (this.options.fetchImpl ?? fetch)(SNAP_URL[this.environment], {
      method: "POST",
      headers: this.headers(serverKey),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      body: JSON.stringify({
        transaction_details: { order_id: request.orderId, gross_amount: Number(request.amount) },
        item_details: [{ id: request.orderId, name: request.itemName.slice(0, 50), price: Number(request.amount), quantity: 1 }],
        customer_details: { first_name: request.customer.name.slice(0, 50), email: request.customer.email },
        callbacks: { finish: request.returnUrl },
        expiry: { unit: "minutes", duration: minutes },
      }),
    });
    if (response.status === 401) throw new PaymentProviderError("Midtrans rejected the server key (401)", "not_configured");
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

    const reading = readTransaction(data);
    return "error" in reading ? { error: "invalid_payload" } : reading;
  }

  /** GET /v2/{order_id}/status — authoritative, since it is our own authenticated call over TLS. */
  async fetchStatus(orderId: string): Promise<StatusLookup> {
    const serverKey = this.requireKey();
    const response = await (this.options.fetchImpl ?? fetch)(`${API_URL[this.environment]}/${encodeURIComponent(orderId)}/status`, {
      method: "GET",
      headers: this.headers(serverKey),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    const statusCode = typeof data?.["status_code"] === "string" ? data["status_code"] : "";
    if (response.status === 404 || statusCode === "404") return { error: "not_found" };
    if (response.status === 401 || statusCode === "401") throw new PaymentProviderError("Midtrans rejected the server key (401)", "not_configured");
    if (!response.ok || !data) throw new PaymentProviderError(`Midtrans status API responded ${response.status}`, "provider_error");
    if (data["order_id"] !== orderId) throw new PaymentProviderError("Midtrans status API returned another order", "provider_error");

    const reading = readTransaction(data);
    return "error" in reading ? { error: "unhandled_status", reportedStatus: reading.reportedStatus } : reading;
  }
}
