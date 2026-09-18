import type { PaymentStatusValue } from "@/lib/billing";

export type ProviderCode = "sandbox" | "midtrans";

export type CheckoutRequest = {
  orderId: string;
  amount: bigint;
  itemName: string;
  customer: { name: string; email: string };
  expiresAt: Date;
  /** Where the provider sends the buyer afterwards. Never proof of payment. */
  returnUrl: string;
};

export type CheckoutSession = { checkoutUrl: string; reference: string | null };

/** A verified, provider-neutral reading of one webhook call. */
export type PaymentNotification = {
  orderId: string;
  status: PaymentStatusValue;
  /** The provider's own status word, kept for the audit log. */
  reportedStatus: string;
  /** Whole rupiah as reported, or null when the provider does not send it for this event. */
  amount: bigint | null;
  /** Unique id of this event when the provider has one; otherwise the payload hash is used. */
  eventId: string | null;
  reference: string | null;
  /** Payload with signatures removed. */
  payload: Record<string, unknown>;
};

export type NotificationRejection = "invalid_signature" | "invalid_payload" | "not_configured";

/**
 * A server-to-server status reading. "not_found": the provider has no such order yet (e.g. the buyer
 * never chose a payment method). "unhandled_status": a status we deliberately do not act on.
 */
export type StatusLookup = PaymentNotification | { error: "not_found" } | { error: "unhandled_status"; reportedStatus: string };

export interface PaymentProvider {
  readonly code: ProviderCode;
  createCheckout(request: CheckoutRequest): Promise<CheckoutSession>;
  parseNotification(input: { headers: Headers; body: string }): Promise<PaymentNotification | { error: NotificationRejection }>;
  /** Asks the provider directly; absent when it has no status API. Throws PaymentProviderError. */
  fetchStatus?(orderId: string): Promise<StatusLookup>;
}

export class PaymentProviderError extends Error {
  constructor(
    message: string,
    readonly reason: "not_configured" | "provider_error",
  ) {
    super(message);
    this.name = "PaymentProviderError";
  }
}

/** Parses "149000", "149000.00" or 149000 into whole rupiah; anything fractional is rejected. */
export function parseWholeRupiah(value: unknown): bigint | null {
  const text = typeof value === "number" ? String(value) : typeof value === "string" ? value.trim() : "";
  const match = /^(\d{1,15})(?:\.0{1,2})?$/.exec(text);
  return match ? BigInt(match[1]!) : null;
}
