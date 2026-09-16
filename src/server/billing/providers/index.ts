import "server-only";
import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { MidtransPaymentProvider } from "./midtrans";
import { SandboxPaymentProvider } from "./sandbox";
import { PaymentProviderError, type PaymentProvider, type ProviderCode } from "./types";

export function sandboxAllowed(): boolean {
  const env = getEnv();
  return env.NODE_ENV !== "production" || env.ALLOW_SANDBOX_PAYMENTS === "true";
}

/** A provider by code, for webhooks: each provider only accepts its own signed notifications. */
export function getPaymentProviderByCode(code: string): PaymentProvider | null {
  const env = getEnv();
  if (code === "midtrans") {
    return new MidtransPaymentProvider({ serverKey: env.MIDTRANS_SERVER_KEY, isProduction: env.MIDTRANS_IS_PRODUCTION === "true" });
  }
  if (code === "sandbox") {
    if (!sandboxAllowed()) return null;
    return new SandboxPaymentProvider({ appUrl: env.APP_URL, secret: env.PAYMENT_SANDBOX_SECRET });
  }
  return null;
}

/** The provider new checkouts use. */
export function getActivePaymentProvider(): PaymentProvider {
  const env = getEnv();
  const code: ProviderCode = env.PAYMENT_PROVIDER;
  if (code === "sandbox" && env.NODE_ENV === "production") {
    if (!sandboxAllowed()) throw new PaymentProviderError("Sandbox payments are disabled in production", "not_configured");
    logger.warn("payments.sandbox_in_production", {});
  }
  const provider = getPaymentProviderByCode(code);
  if (!provider) throw new PaymentProviderError(`Payment provider ${code} is unavailable`, "not_configured");
  return provider;
}

export { PaymentProviderError } from "./types";
export type { PaymentProvider } from "./types";
