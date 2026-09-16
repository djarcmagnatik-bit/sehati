import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { isPaymentStatus } from "./status";
import {
  parseWholeRupiah,
  PaymentProviderError,
  type CheckoutRequest,
  type CheckoutSession,
  type NotificationRejection,
  type PaymentNotification,
  type PaymentProvider,
} from "./types";

export const SANDBOX_SIGNATURE_HEADER = "x-sandbox-signature";

export function signSandboxPayload(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

/**
 * Development/test stand-in for a hosted payment page. It follows the real contract: the buyer is
 * sent to a checkout URL, and the result only arrives as a signed webhook POST.
 */
export class SandboxPaymentProvider implements PaymentProvider {
  readonly code = "sandbox" as const;

  constructor(
    private readonly options: { appUrl: string; secret: string | undefined },
  ) {}

  async createCheckout(request: CheckoutRequest): Promise<CheckoutSession> {
    if (!this.options.secret) {
      throw new PaymentProviderError("PAYMENT_SANDBOX_SECRET is not set", "not_configured");
    }
    return {
      checkoutUrl: `${this.options.appUrl.replace(/\/+$/, "")}/payments/sandbox/${request.orderId}`,
      reference: `SBX-${request.orderId}`,
    };
  }

  async parseNotification({ headers, body }: { headers: Headers; body: string }): Promise<PaymentNotification | { error: NotificationRejection }> {
    const secret = this.options.secret;
    if (!secret) return { error: "not_configured" };

    const provided = headers.get(SANDBOX_SIGNATURE_HEADER) ?? "";
    const expected = signSandboxPayload(secret, body);
    const valid =
      provided.length === expected.length && timingSafeEqual(Buffer.from(provided, "utf8"), Buffer.from(expected, "utf8"));
    if (!valid) return { error: "invalid_signature" };

    let data: Record<string, unknown>;
    try {
      data = JSON.parse(body) as Record<string, unknown>;
    } catch {
      return { error: "invalid_payload" };
    }
    const orderId = typeof data.order_id === "string" ? data.order_id : "";
    const status = typeof data.status === "string" ? data.status.toUpperCase() : "";
    const amount = parseWholeRupiah(data.gross_amount);
    if (!orderId || !isPaymentStatus(status) || amount === null) return { error: "invalid_payload" };

    return {
      orderId,
      status,
      reportedStatus: status.toLowerCase(),
      amount,
      eventId: typeof data.event_id === "string" ? data.event_id : null,
      reference: `SBX-${orderId}`,
      payload: data,
    };
  }
}
