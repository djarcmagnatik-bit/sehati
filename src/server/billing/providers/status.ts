import { PAYMENT_STATUSES, type PaymentStatusValue } from "@/lib/billing";

export function isPaymentStatus(value: string): value is PaymentStatusValue {
  return (PAYMENT_STATUSES as readonly string[]).includes(value);
}
