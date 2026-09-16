import { FEATURES } from "@/lib/billing";

/**
 * Starting catalogue. Created when missing and never overwritten afterwards: prices, durations and
 * feature lists belong to the admins once the rows exist.
 */
export const PLAN_SEEDS = [
  {
    code: "FULL_ACCESS",
    name: "Akses Penuh",
    description: "Semua fitur perencanaan untuk satu pernikahan: vendor, budget, tamu & RSVP, undangan digital, rundown, seserahan, dan kolaborasi pasangan.",
    price: 149_000n,
    durationDays: null,
    features: [...FEATURES],
    sortOrder: 10,
  },
];

export const ADDON_SEEDS = [
  {
    code: "VOICE_GREETING",
    name: "Salam suara personal",
    description: "Kuota salam suara untuk undangan per tamu.",
    price: 49_000n,
    quotaAmount: 100,
    unit: "salam",
    // Not for sale until the voice greeting feature itself exists.
    isActive: false,
    sortOrder: 10,
  },
];
