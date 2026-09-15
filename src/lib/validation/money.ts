import { z } from "zod";
import { parseRupiah } from "@/lib/money";

/** Required whole-rupiah amount > 0 (as bigint). */
export function requiredMoney(label: string) {
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

/** Optional whole-rupiah amount ≥ 0; empty → null. */
export function optionalMoney(label: string) {
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
