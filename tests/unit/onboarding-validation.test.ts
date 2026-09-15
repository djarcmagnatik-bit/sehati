import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { fieldErrorsFromZod } from "@/lib/validation/errors";
import { makeOnboardingSchema, makeOnboardingStepSchemas } from "@/lib/validation/onboarding";

const TODAY = "2027-01-01";
const schema = makeOnboardingSchema(TODAY);

const valid = {
  displayName: "Fajar",
  partnerName: "Putri",
  brideName: "Putri",
  groomName: "Fajar",
  coupleDisplayFormat: "BRIDE_GROOM",
  customDisplayName: "",
  weddingDate: "2027-12-20",
  engagementDate: "",
  receptionDate: "",
  eventTypeId: randomUUID(),
  marriageProcessId: randomUUID(),
  targetBudget: "100.000.000",
  currency: "IDR",
};

function errorsFor(input: Record<string, unknown>) {
  const result = schema.safeParse(input);
  if (result.success) throw new Error("expected validation failure");
  return fieldErrorsFromZod(result.error);
}

describe("makeOnboardingSchema", () => {
  it("parses a complete payload into typed values", () => {
    const data = schema.parse(valid);
    expect(data.targetBudget).toBe(100_000_000n);
    expect(data.engagementDate).toBeNull();
    expect(data.receptionDate).toBeNull();
    expect(data.customDisplayName).toBeNull();
    expect(data.currency).toBe("IDR");
  });

  it("treats an empty budget as not set", () => {
    expect(schema.parse({ ...valid, targetBudget: "" }).targetBudget).toBeNull();
  });

  it("allows the wedding to be today", () => {
    expect(schema.safeParse({ ...valid, weddingDate: TODAY }).success).toBe(true);
  });

  it("rejects a wedding date in the past", () => {
    expect(errorsFor({ ...valid, weddingDate: "2026-12-31" }).weddingDate).toEqual([
      "Tanggal pernikahan tidak boleh di masa lalu",
    ]);
  });

  it("rejects impossible calendar dates", () => {
    expect(errorsFor({ ...valid, weddingDate: "2027-02-30" }).weddingDate).toEqual(["Tanggal pernikahan tidak valid"]);
  });

  it("requires engagement on/before and reception on/after the wedding date", () => {
    expect(errorsFor({ ...valid, engagementDate: "2027-12-21" }).engagementDate).toBeDefined();
    expect(errorsFor({ ...valid, receptionDate: "2027-12-19" }).receptionDate).toBeDefined();
    expect(schema.safeParse({ ...valid, engagementDate: "2027-06-01", receptionDate: "2027-12-21" }).success).toBe(true);
  });

  it("requires a custom display name for the CUSTOM format", () => {
    expect(errorsFor({ ...valid, coupleDisplayFormat: "CUSTOM" }).customDisplayName).toEqual([
      "Tulis nama tampilan pasangan",
    ]);
    const data = schema.parse({ ...valid, coupleDisplayFormat: "CUSTOM", customDisplayName: " Putri & Fajar " });
    expect(data.customDisplayName).toBe("Putri & Fajar");
  });

  it("rejects invalid budget input instead of guessing", () => {
    expect(errorsFor({ ...valid, targetBudget: "100,5 juta" }).targetBudget).toBeDefined();
    expect(errorsFor({ ...valid, targetBudget: "-5000" }).targetBudget).toBeDefined();
  });

  it("requires selections and names", () => {
    const errors = errorsFor({ ...valid, eventTypeId: "", marriageProcessId: "abc", brideName: " ", groomName: "" });
    expect(errors.eventTypeId).toEqual(["Pilih jenis acara"]);
    expect(errors.marriageProcessId).toEqual(["Pilih jalur pernikahan"]);
    expect(errors.brideName).toEqual(["Nama mempelai wanita wajib diisi"]);
    expect(errors.groomName).toEqual(["Nama mempelai pria wajib diisi"]);
  });

  it("only accepts IDR for now", () => {
    expect(errorsFor({ ...valid, currency: "USD" }).currency).toBeDefined();
  });
});

describe("makeOnboardingStepSchemas", () => {
  it("validates each wizard step independently", () => {
    const steps = makeOnboardingStepSchemas(TODAY);
    expect(steps.couple.safeParse(valid).success).toBe(true);
    expect(steps.dates.safeParse({ ...valid, weddingDate: "" }).success).toBe(false);
    expect(steps.eventType.safeParse({ eventTypeId: "" }).success).toBe(false);
    expect(steps.budget.safeParse({ targetBudget: "" }).success).toBe(true);
  });
});
