"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { getEnv } from "@/lib/env";
import type { FormState } from "@/lib/form-state";
import { logger } from "@/lib/logger";
import { consumeRateLimit, RATE_LIMITS } from "@/server/auth/rate-limit";
import { requireSession } from "@/server/auth/session-cookie";
import { WeddingAccessError } from "@/server/authz/wedding-access";
import { getTransactionForUser, startCheckout } from "@/server/billing/billing-service";
import { sandboxAllowed } from "@/server/billing/providers";
import { SANDBOX_SIGNATURE_HEADER, signSandboxPayload } from "@/server/billing/providers/sandbox";
import { readString } from "./form-data";

const CHECKOUT_ERRORS = {
  unknown_item: "Paket ini tidak tersedia lagi. Muat ulang halaman.",
  already_active: "Pernikahan ini sudah memiliki semua fitur dari paket tersebut.",
  provider_unavailable: "Pembayaran sedang tidak bisa diproses. Coba lagi beberapa saat lagi.",
  promo_invalid: "Kode promo tidak dikenal atau belum berlaku.",
  promo_expired: "Kode promo sudah kedaluwarsa.",
  promo_exhausted: "Kuota kode promo ini sudah habis.",
  promo_not_applicable: "Kode promo ini tidak berlaku untuk paket tersebut.",
  promo_too_large: "Kode promo ini tidak bisa dipakai untuk harga paket tersebut.",
} as const;

/** Starts a checkout and hands the buyer to the provider. Access only changes once the webhook arrives. */
export async function startCheckoutAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const kind = readString(formData, "kind") === "ADDON" ? "ADDON" : "PLAN";
  const code = readString(formData, "code");

  let checkoutUrl: string;
  try {
    const limit = await consumeRateLimit(`checkout:user:${session.user.id}`, RATE_LIMITS.checkoutPerUser);
    if (!limit.allowed) return { status: "error", message: "Terlalu banyak percobaan pembayaran. Coba lagi nanti." };

    const promoCode = readString(formData, "promoCode");
    const result = await startCheckout(session.user.id, readString(formData, "weddingId"), { kind, code }, new Date(), { promoCode });
    if (!result.ok) {
      return {
        status: "error",
        message: CHECKOUT_ERRORS[result.reason],
        values: { promoCode },
        fieldErrors: result.reason.startsWith("promo_") ? { promoCode: [CHECKOUT_ERRORS[result.reason]] } : undefined,
      };
    }
    checkoutUrl = result.checkoutUrl;
  } catch (error) {
    if (error instanceof WeddingAccessError) return { status: "error", message: "Data tidak ditemukan atau kamu tidak memiliki akses." };
    logger.error("billing.checkout_action_failed", { error });
    return { status: "error", message: CHECKOUT_ERRORS.provider_unavailable };
  }
  redirect(checkoutUrl);
}

/**
 * Sandbox only: plays the payment provider. It sends a signed webhook over HTTP to our own webhook
 * endpoint — exactly the path a real provider uses — instead of changing the order directly.
 */
export async function simulateSandboxPaymentAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const orderId = readString(formData, "orderId");
  const outcome = readString(formData, "outcome") === "FAILED" ? "FAILED" : "PAID";
  const env = getEnv();
  if (!sandboxAllowed() || !env.PAYMENT_SANDBOX_SECRET) redirect("/billing");

  const transaction = await getTransactionForUser(session.user.id, orderId);
  if (!transaction || transaction.provider !== "sandbox") redirect("/billing");

  const body = JSON.stringify({
    order_id: transaction.orderId,
    status: outcome,
    gross_amount: transaction.amount.toString(),
    event_id: randomUUID(),
  });
  const response = await fetch(`${env.APP_URL.replace(/\/+$/, "")}/api/payments/webhook/sandbox`, {
    method: "POST",
    headers: { "Content-Type": "application/json", [SANDBOX_SIGNATURE_HEADER]: signSandboxPayload(env.PAYMENT_SANDBOX_SECRET, body) },
    body,
    cache: "no-store",
  });
  if (!response.ok) logger.error("billing.sandbox_webhook_failed", { orderId, status: response.status });

  redirect(`/billing/return?order=${transaction.orderId}`);
}
