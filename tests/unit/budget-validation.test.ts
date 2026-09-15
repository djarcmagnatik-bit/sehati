import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  budgetCategorySchema,
  budgetSettingsSchema,
  expenseInputSchema,
  makePaymentInputSchema,
} from "@/lib/validation/budget";
import { fieldErrorsFromZod } from "@/lib/validation/errors";

function errorsOf(result: { success: boolean; error?: Parameters<typeof fieldErrorsFromZod>[0] }) {
  if (result.success || !result.error) throw new Error("expected validation failure");
  return fieldErrorsFromZod(result.error);
}

describe("expenseInputSchema", () => {
  const valid = { title: "ABC Catering", categoryId: randomUUID(), totalAmount: "Rp 30.000.000", dueDate: "", notes: "" };

  it("parses rupiah into bigint and normalizes optional fields", () => {
    expect(expenseInputSchema.parse(valid)).toEqual({
      title: "ABC Catering",
      categoryId: valid.categoryId,
      totalAmount: 30_000_000n,
      dueDate: null,
      notes: null,
    });
  });

  it("requires a positive, well-formed total", () => {
    expect(errorsOf(expenseInputSchema.safeParse({ ...valid, totalAmount: "" })).totalAmount).toEqual(["Total biaya wajib diisi"]);
    expect(errorsOf(expenseInputSchema.safeParse({ ...valid, totalAmount: "0" })).totalAmount).toEqual([
      "Total biaya harus lebih dari 0",
    ]);
    expect(errorsOf(expenseInputSchema.safeParse({ ...valid, totalAmount: "30jt" })).totalAmount?.[0]).toContain("tidak valid");
    expect(errorsOf(expenseInputSchema.safeParse({ ...valid, totalAmount: "-5.000" })).totalAmount?.[0]).toContain("tidak valid");
  });
});

describe("makePaymentInputSchema", () => {
  const schema = makePaymentInputSchema("2027-06-01");
  const valid = { amount: "10.000.000", paymentDate: "2027-06-01", method: "BANK_TRANSFER", reference: "", notes: "" };

  it("accepts a payment made today", () => {
    expect(schema.parse(valid)).toMatchObject({ amount: 10_000_000n, method: "BANK_TRANSFER", reference: null });
  });

  it("rejects future dates, unknown methods and zero amounts", () => {
    const errors = errorsOf(schema.safeParse({ ...valid, paymentDate: "2027-06-02", method: "BITCOIN", amount: "0" }));
    expect(errors.paymentDate).toEqual(["Tanggal pembayaran tidak boleh di masa depan"]);
    expect(errors.method).toEqual(["Pilih metode pembayaran"]);
    expect(errors.amount).toEqual(["Nominal pembayaran harus lebih dari 0"]);
  });
});

describe("budget settings & categories", () => {
  it("allows clearing the target and validates the warning percentage", () => {
    expect(budgetSettingsSchema.parse({ targetBudget: "", warningPercent: "80" })).toEqual({ targetBudget: null, warningPercent: 80 });
    expect(errorsOf(budgetSettingsSchema.safeParse({ targetBudget: "", warningPercent: "0" })).warningPercent).toBeDefined();
    expect(errorsOf(budgetSettingsSchema.safeParse({ targetBudget: "", warningPercent: "150" })).warningPercent).toBeDefined();
    expect(errorsOf(budgetSettingsSchema.safeParse({ targetBudget: "", warningPercent: "8.5" })).warningPercent).toBeDefined();
  });

  it("defaults an empty allocation to zero", () => {
    expect(budgetCategorySchema.parse({ name: " Cincin ", allocatedAmount: "" })).toEqual({ name: "Cincin", allocatedAmount: 0n });
    expect(errorsOf(budgetCategorySchema.safeParse({ name: "", allocatedAmount: "abc" }))).toMatchObject({
      name: ["Nama kategori wajib diisi"],
    });
  });
});
