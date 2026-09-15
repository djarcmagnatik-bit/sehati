import { z } from "zod";
import { PAYMENT_METHODS } from "@/lib/budget";
import { isValidIsoDate } from "@/lib/dates";
import { parseRupiah } from "@/lib/money";

const emptyToNull = (value: string | undefined) => (value ? value : null);

function requiredMoney(label: string) {
  return z
    .string()
    .trim()
    .max(30, `${label} terlalu panjang`)
    .transform((value, ctx): bigint => {
      if (!value) {
        ctx.addIssue({ code: "custom", message: `${label} wajib diisi` });
        return z.NEVER;
      }
      const amount = parseRupiah(value);
      if (amount === null) {
        ctx.addIssue({ code: "custom", message: `${label} tidak valid. Contoh: 10.000.000` });
        return z.NEVER;
      }
      if (amount === 0n) {
        ctx.addIssue({ code: "custom", message: `${label} harus lebih dari 0` });
        return z.NEVER;
      }
      return amount;
    });
}

function optionalMoney(label: string) {
  return z
    .string()
    .trim()
    .max(30, `${label} terlalu panjang`)
    .optional()
    .transform((value, ctx): bigint | null => {
      if (!value) return null;
      const amount = parseRupiah(value);
      if (amount === null) {
        ctx.addIssue({ code: "custom", message: `${label} tidak valid. Contoh: 10.000.000` });
        return z.NEVER;
      }
      return amount;
    });
}

export const budgetSettingsSchema = z.object({
  targetBudget: optionalMoney("Target budget"),
  warningPercent: z
    .string()
    .trim()
    .regex(/^\d{1,3}$/, "Persentase peringatan harus berupa angka 1–100")
    .transform(Number)
    .refine((value) => value >= 1 && value <= 100, "Persentase peringatan harus antara 1 dan 100"),
});

export const budgetCategorySchema = z.object({
  name: z.string().trim().min(1, "Nama kategori wajib diisi").max(100, "Nama kategori maksimal 100 karakter"),
  allocatedAmount: optionalMoney("Alokasi").transform((value) => value ?? 0n),
});

export const expenseInputSchema = z.object({
  title: z.string().trim().min(1, "Nama pengeluaran wajib diisi").max(160, "Nama pengeluaran maksimal 160 karakter"),
  categoryId: z.uuid("Pilih kategori"),
  totalAmount: requiredMoney("Total biaya"),
  dueDate: z
    .string()
    .trim()
    .optional()
    .transform(emptyToNull)
    .refine((value) => value === null || isValidIsoDate(value), "Tanggal jatuh tempo tidak valid"),
  notes: z.string().trim().max(2000, "Catatan maksimal 2.000 karakter").optional().transform(emptyToNull),
});

export function makePaymentInputSchema(todayIso: string) {
  return z.object({
    amount: requiredMoney("Nominal pembayaran"),
    paymentDate: z
      .string()
      .trim()
      .min(1, "Tanggal pembayaran wajib diisi")
      .refine(isValidIsoDate, "Tanggal pembayaran tidak valid")
      .refine((value) => !isValidIsoDate(value) || value <= todayIso, "Tanggal pembayaran tidak boleh di masa depan"),
    method: z.enum(PAYMENT_METHODS, "Pilih metode pembayaran"),
    reference: z.string().trim().max(120, "Referensi maksimal 120 karakter").optional().transform(emptyToNull),
    notes: z.string().trim().max(1000, "Catatan maksimal 1.000 karakter").optional().transform(emptyToNull),
  });
}

export type BudgetSettingsInput = z.output<typeof budgetSettingsSchema>;
export type BudgetCategoryInput = z.output<typeof budgetCategorySchema>;
export type ExpenseInput = z.output<typeof expenseInputSchema>;
export type PaymentInput = z.output<ReturnType<typeof makePaymentInputSchema>>;
