import { describe, expect, it } from "vitest";
import { formatRupiah } from "@/lib/money";
import { computeDiscount, describeDiscount, MIN_CHARGE_RUPIAH, normalizePromoCode, promoWindowProblem } from "@/lib/promo";
import { grantPlanSchema, planSchema, promoCodeSchema, suspendUserSchema, taskTemplateSchema, themeSettingSchema } from "@/lib/validation/admin";

const UUID = "3f1b6f9e-8a53-4c1e-9d7b-2f7c1a0e5b11";

describe("promo codes", () => {
  it("normalizes codes and rejects impossible ones", () => {
    expect(normalizePromoCode("  hemat-50 ")).toBe("HEMAT-50");
    expect(normalizePromoCode("NIKAH_2026")).toBe("NIKAH_2026");
    expect(normalizePromoCode("ab")).toBeNull();
    expect(normalizePromoCode("-ABC")).toBeNull();
    expect(normalizePromoCode("HEMAT 50")).toBeNull();
    expect(normalizePromoCode("A".repeat(41))).toBeNull();
  });

  it("computes percent and fixed discounts, rounding percent down", () => {
    expect(computeDiscount(149_000n, "PERCENT", 20n)).toEqual({ discount: 29_800n, final: 119_200n });
    expect(computeDiscount(149_999n, "PERCENT", 33n)).toEqual({ discount: 49_499n, final: 100_500n });
    expect(computeDiscount(149_000n, "FIXED", 50_000n)).toEqual({ discount: 50_000n, final: 99_000n });
  });

  it("keeps the minimum charge and refuses empty discounts", () => {
    expect(computeDiscount(149_000n, "FIXED", 149_000n - MIN_CHARGE_RUPIAH)).toEqual({ discount: 148_000n, final: 1_000n });
    expect(computeDiscount(149_000n, "FIXED", 148_001n)).toEqual({ error: "too_large" });
    expect(computeDiscount(1_000n, "PERCENT", 10n)).toEqual({ error: "too_large" });
    expect(computeDiscount(5n, "PERCENT", 10n)).toEqual({ error: "too_large" });
  });

  it("checks the validity window with an exclusive end", () => {
    const now = new Date("2026-10-10T00:00:00Z");
    const base = { isActive: true, startsAt: null, expiresAt: null };
    expect(promoWindowProblem(base, now)).toBeNull();
    expect(promoWindowProblem({ ...base, isActive: false }, now)).toBe("inactive");
    expect(promoWindowProblem({ ...base, startsAt: new Date("2026-10-11T00:00:00Z") }, now)).toBe("not_started");
    expect(promoWindowProblem({ ...base, expiresAt: now }, now)).toBe("expired");
    expect(promoWindowProblem({ ...base, startsAt: now, expiresAt: new Date("2026-10-10T00:00:01Z") }, now)).toBeNull();
  });

  it("describes a discount for admins", () => {
    expect(describeDiscount("PERCENT", 15n, formatRupiah)).toBe("15%");
    expect(describeDiscount("FIXED", 50_000n, formatRupiah)).toBe(formatRupiah(50_000n));
  });
});

describe("admin validation", () => {
  const promoBase = {
    code: "hemat-20",
    description: "",
    discountType: "PERCENT",
    discountValue: "20",
    planId: "",
    startsOn: "",
    endsOn: "",
    usageLimit: "",
    perUserLimit: "1",
    isActive: "on",
  };

  it("parses a promo form into typed values", () => {
    const parsed = promoCodeSchema.parse(promoBase);
    expect(parsed).toMatchObject({
      code: "HEMAT-20",
      description: null,
      discountValue: 20n,
      planId: null,
      startsOn: null,
      usageLimit: null,
      perUserLimit: 1,
      isActive: true,
    });
    expect(promoCodeSchema.parse({ ...promoBase, discountType: "FIXED", discountValue: "50.000" }).discountValue).toBe(50_000n);
  });

  it("rejects invalid promo values and date ranges", () => {
    const issues = (input: Record<string, string>) =>
      promoCodeSchema.safeParse({ ...promoBase, ...input }).error?.issues.map((issue) => issue.path.join("."));
    expect(issues({ discountValue: "0" })).toContain("discountValue");
    expect(issues({ discountValue: "100" })).toContain("discountValue");
    expect(issues({ discountType: "FIXED", discountValue: "abc" })).toContain("discountValue");
    expect(issues({ startsOn: "2026-10-10", endsOn: "2026-10-09" })).toContain("endsOn");
    expect(issues({ startsOn: "2026-02-30" })).toContain("startsOn");
    expect(issues({ code: "a b" })).toContain("code");
    expect(issues({ planId: "bukan-uuid" })).toContain("planId");
    expect(issues({ usageLimit: "0" })).toContain("usageLimit");
    expect(issues({ discountType: "GRATIS" })).toContain("discountType");
    expect(promoCodeSchema.safeParse({ ...promoBase, startsOn: "2026-10-10", endsOn: "2026-10-10" }).success).toBe(true);
  });

  it("parses plans and drops nothing but unknown features", () => {
    const base = { code: "full_year", name: "Setahun", description: "", price: "199.000", durationDays: "365", features: ["budget", "guests"], isActive: "", sortOrder: "" };
    expect(planSchema.parse(base)).toMatchObject({ code: "FULL_YEAR", price: 199_000n, durationDays: 365, isActive: false, sortOrder: 0 });
    expect(planSchema.parse({ ...base, durationDays: "" }).durationDays).toBeNull();
    expect(planSchema.safeParse({ ...base, features: ["budget", "teleport"] }).success).toBe(false);
    expect(planSchema.safeParse({ ...base, code: "FULL-YEAR" }).success).toBe(false);
    expect(planSchema.safeParse({ ...base, price: "-5" }).success).toBe(false);
  });

  it("parses task templates", () => {
    const base = {
      title: " Pesan gedung ",
      description: "",
      categoryId: UUID,
      priority: "HIGH",
      deadlineOffsetDays: "-180",
      eventTypeIds: [UUID],
      marriageProcessIds: [UUID],
      isActive: "on",
    };
    expect(taskTemplateSchema.parse(base)).toMatchObject({ title: "Pesan gedung", deadlineOffsetDays: -180, isActive: true });
    expect(taskTemplateSchema.safeParse({ ...base, deadlineOffsetDays: "-2000" }).success).toBe(false);
    expect(taskTemplateSchema.safeParse({ ...base, eventTypeIds: [] }).success).toBe(false);
    expect(taskTemplateSchema.safeParse({ ...base, priority: "NOW" }).success).toBe(false);
  });

  it("parses theme metadata, suspension reasons and grants", () => {
    expect(themeSettingSchema.parse({ displayName: "", description: "", isEnabled: "on", isPremium: "", sortOrder: "20" })).toEqual({
      displayName: null,
      description: null,
      isEnabled: true,
      isPremium: false,
      sortOrder: 20,
    });
    expect(suspendUserSchema.safeParse({ reason: "ok" }).success).toBe(false);
    expect(suspendUserSchema.parse({ reason: "  Penipuan  " }).reason).toBe("Penipuan");
    expect(grantPlanSchema.parse({ planCode: "full_access", note: "Kompensasi" })).toEqual({ planCode: "FULL_ACCESS", note: "Kompensasi" });
  });
});
