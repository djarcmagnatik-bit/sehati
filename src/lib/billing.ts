/**
 * Access and payment vocabulary (pure). Which features a plan unlocks lives in the database; this
 * file only knows the feature keys the application can actually enforce.
 */

/**
 * Paid features (PRD §41 "Full Access"). Checklist, dashboard, onboarding, account settings, savings
 * and the calendar stay free; the calendar only shows sources the wedding may use.
 */
export const FEATURES = [
  "vendors",
  "budget",
  "guests",
  "invitation",
  "premium_themes",
  "rundown",
  "seserahan",
  "collaboration",
] as const;
export type Feature = (typeof FEATURES)[number];

export const FEATURE_LABEL: Record<Feature, string> = {
  vendors: "Vendor & riset vendor",
  budget: "Budget & pembayaran",
  guests: "Tamu & RSVP",
  invitation: "Undangan digital",
  premium_themes: "Tema undangan premium",
  rundown: "Rundown",
  seserahan: "Seserahan",
  collaboration: "Kolaborasi pasangan",
};

export const FEATURE_PATH: Record<Feature, string> = {
  vendors: "/vendors",
  budget: "/budget",
  guests: "/guests",
  invitation: "/invitation",
  premium_themes: "/invitation/design",
  rundown: "/rundown",
  seserahan: "/seserahan",
  collaboration: "/settings/partner",
};

export function isFeature(value: string): value is Feature {
  return (FEATURES as readonly string[]).includes(value);
}

/** Plan rows are admin-editable, so unknown or misspelled keys are dropped instead of trusted. */
export function knownFeatures(keys: readonly string[]): Feature[] {
  return [...new Set(keys.filter(isFeature))];
}

export type EntitlementWindow = { startsAt: Date; expiresAt: Date | null; revokedAt: Date | null };

export function isEntitlementActive(entitlement: EntitlementWindow, now: Date): boolean {
  if (entitlement.revokedAt) return false;
  if (entitlement.startsAt.getTime() > now.getTime()) return false;
  return entitlement.expiresAt === null || entitlement.expiresAt.getTime() > now.getTime();
}

// ─── Payments ────────────────────────────────────────────────────────────────

export const PAYMENT_STATUSES = ["PENDING", "PAID", "FAILED", "EXPIRED", "REFUNDED"] as const;
export type PaymentStatusValue = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_STATUS_LABEL: Record<PaymentStatusValue, string> = {
  PENDING: "Menunggu pembayaran",
  PAID: "Lunas",
  FAILED: "Gagal",
  EXPIRED: "Kedaluwarsa",
  REFUNDED: "Dikembalikan",
};

/**
 * Which reported status may replace the current one. A late settlement after "failed"/"expired" is
 * still accepted — the money arrived — while nothing ever moves a paid order back to pending.
 */
const ALLOWED_TRANSITIONS: Record<PaymentStatusValue, readonly PaymentStatusValue[]> = {
  PENDING: ["PAID", "FAILED", "EXPIRED"],
  FAILED: ["PAID"],
  EXPIRED: ["PAID"],
  PAID: ["REFUNDED"],
  REFUNDED: [],
};

export type TransitionDecision = "apply" | "unchanged" | "ignored";

export function decideTransition(current: PaymentStatusValue, reported: PaymentStatusValue): TransitionDecision {
  if (current === reported) return "unchanged";
  return ALLOWED_TRANSITIONS[current].includes(reported) ? "apply" : "ignored";
}

/** Opaque, unguessable order id: "SHT-20260918-7K3M9Q2XWA". */
export function formatOrderId(now: Date, random: string): string {
  const date = now.toISOString().slice(0, 10).replaceAll("-", "");
  return `SHT-${date}-${random.toUpperCase()}`;
}

export const ORDER_ID_PATTERN = /^SHT-\d{8}-[A-Z0-9]{10}$/;

/** Checkout links stay valid for a day; after that the order is treated as expired. */
export const CHECKOUT_TTL_MS = 24 * 60 * 60 * 1000;
