/** Promo code rules (pure). Enforcement happens server-side at checkout, under a row lock. */

export const PROMO_DISCOUNT_TYPES = ["PERCENT", "FIXED"] as const;
export type PromoDiscountTypeValue = (typeof PROMO_DISCOUNT_TYPES)[number];

export const PROMO_DISCOUNT_TYPE_LABEL: Record<PromoDiscountTypeValue, string> = {
  PERCENT: "Persen",
  FIXED: "Nominal tetap",
};

/**
 * Payment providers cannot charge tiny amounts, so a paid price may not fall below this. A promo
 * that takes the whole price is different: that checkout skips the provider (see FREE_PROVIDER).
 */
export const MIN_CHARGE_RUPIAH = 1_000n;

/** Provider code of a checkout a promo made free: recorded as paid Rp0, no payment provider involved. */
export const FREE_PROVIDER = "free";

export const PROMO_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{2,39}$/;

/** "  hemat-50 " → "HEMAT-50"; null when it can never be a valid code. */
export function normalizePromoCode(input: string): string | null {
  const code = input.trim().toUpperCase();
  return PROMO_CODE_PATTERN.test(code) ? code : null;
}

export type DiscountResult = { discount: bigint; final: bigint } | { error: "too_large" };

/**
 * Percent discounts round down, in the buyer's disfavour by at most one rupiah. 100%, or a fixed
 * amount at least the price, makes it free (final 0); anything leaving less than the minimum charge
 * but more than nothing cannot be paid and is refused.
 */
export function computeDiscount(price: bigint, type: PromoDiscountTypeValue, value: bigint): DiscountResult {
  const raw = type === "PERCENT" ? (price * value) / 100n : value;
  const discount = raw > price ? price : raw;
  const final = price - discount;
  if (discount <= 0n || (final > 0n && final < MIN_CHARGE_RUPIAH)) return { error: "too_large" };
  return { discount, final };
}

export type PromoWindow = { isActive: boolean; startsAt: Date | null; expiresAt: Date | null };

export function promoWindowProblem(promo: PromoWindow, now: Date): "inactive" | "not_started" | "expired" | null {
  if (!promo.isActive) return "inactive";
  if (promo.startsAt && promo.startsAt.getTime() > now.getTime()) return "not_started";
  if (promo.expiresAt && promo.expiresAt.getTime() <= now.getTime()) return "expired";
  return null;
}

export function describeDiscount(type: PromoDiscountTypeValue, value: bigint, formatRupiah: (amount: bigint) => string): string {
  return type === "PERCENT" ? `${value}%` : formatRupiah(value);
}
