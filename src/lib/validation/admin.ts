import { z } from "zod";
import { FEATURES } from "@/lib/billing";
import { isValidIsoDate } from "@/lib/dates";
import { PROMO_CODE_PATTERN, PROMO_DISCOUNT_TYPES } from "@/lib/promo";
import { optionalMoney, requiredMoney } from "@/lib/validation/money";

const emptyToNull = (value: string | null | undefined) => (value ? value : null);

const optionalText = (label: string, max: number) =>
  z.string().trim().max(max, `${label} maksimal ${max} karakter`).nullish().transform(emptyToNull);

const optionalPositiveInt = (label: string, max: number) =>
  z
    .string()
    .trim()
    .nullish()
    .transform(emptyToNull)
    .refine((value) => value === null || /^\d{1,6}$/.test(value), `${label} harus berupa angka`)
    .transform((value) => (value === null ? null : Number(value)))
    .refine((value) => value === null || (value >= 1 && value <= max), `${label} harus 1–${max}`);

const checkbox = z
  .string()
  .nullish()
  .transform((value) => value === "on" || value === "true");

const code = (label: string) =>
  z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9][A-Z0-9_]{1,39}$/, `${label} hanya huruf besar, angka, dan garis bawah`);

// ─── Plans & add-ons ─────────────────────────────────────────────────────────

export const planSchema = z.object({
  code: code("Kode paket"),
  name: z.string().trim().min(1, "Nama paket wajib diisi").max(80, "Nama paket maksimal 80 karakter"),
  description: optionalText("Deskripsi", 500),
  price: requiredMoney("Harga"),
  durationDays: optionalPositiveInt("Durasi (hari)", 3650),
  features: z.array(z.enum(FEATURES)).max(FEATURES.length),
  isActive: checkbox,
  sortOrder: z
    .string()
    .trim()
    .nullish()
    .transform((value) => value || "0")
    .refine((value) => /^-?\d{1,5}$/.test(value), "Urutan harus berupa angka")
    .transform(Number),
});

export const addonSchema = z.object({
  name: z.string().trim().min(1, "Nama add-on wajib diisi").max(80, "Nama maksimal 80 karakter"),
  description: optionalText("Deskripsi", 500),
  price: requiredMoney("Harga"),
  quotaAmount: z
    .string()
    .trim()
    .regex(/^\d{1,6}$/, "Kuota harus berupa angka")
    .transform(Number)
    .refine((value) => value >= 1, "Kuota minimal 1"),
  unit: z.string().trim().min(1, "Satuan wajib diisi").max(30, "Satuan maksimal 30 karakter"),
  isActive: checkbox,
});

// ─── Promo codes ─────────────────────────────────────────────────────────────

const optionalDate = (label: string) =>
  z
    .string()
    .trim()
    .nullish()
    .transform(emptyToNull)
    .refine((value) => value === null || isValidIsoDate(value), `${label} tidak valid`);

export const promoCodeSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .refine((value) => PROMO_CODE_PATTERN.test(value), "Kode 3–40 karakter: huruf, angka, - atau _"),
    description: optionalText("Deskripsi", 200),
    discountType: z.enum(PROMO_DISCOUNT_TYPES, "Pilih jenis diskon"),
    discountValue: z.string().trim().min(1, "Nilai diskon wajib diisi"),
    planId: z
      .string()
      .trim()
      .nullish()
      .transform(emptyToNull)
      .refine((value) => value === null || z.uuid().safeParse(value).success, "Paket tidak valid"),
    startsOn: optionalDate("Tanggal mulai"),
    endsOn: optionalDate("Tanggal berakhir"),
    usageLimit: optionalPositiveInt("Batas pemakaian", 1_000_000),
    perUserLimit: optionalPositiveInt("Batas per pengguna", 1000),
    isActive: checkbox,
  })
  .transform((data, ctx) => {
    let value: bigint | null = null;
    if (data.discountType === "PERCENT") {
      if (/^\d{1,2}$/.test(data.discountValue) && Number(data.discountValue) >= 1) value = BigInt(data.discountValue);
      else ctx.addIssue({ code: "custom", path: ["discountValue"], message: "Persen diskon harus 1–99" });
    } else {
      const parsed = optionalMoney("Nilai diskon").safeParse(data.discountValue);
      if (parsed.success && parsed.data !== null && parsed.data > 0n) value = parsed.data;
      else ctx.addIssue({ code: "custom", path: ["discountValue"], message: "Nilai diskon tidak valid. Contoh: 50.000" });
    }
    if (data.startsOn && data.endsOn && data.endsOn < data.startsOn) {
      ctx.addIssue({ code: "custom", path: ["endsOn"], message: "Tanggal berakhir harus setelah tanggal mulai" });
    }
    if (value === null) return z.NEVER;
    return { ...data, discountValue: value };
  });

// ─── Task templates ──────────────────────────────────────────────────────────

export const TASK_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;

export const taskTemplateSchema = z.object({
  title: z.string().trim().min(1, "Judul wajib diisi").max(160, "Judul maksimal 160 karakter"),
  description: optionalText("Deskripsi", 2000),
  categoryId: z.uuid("Pilih kategori"),
  priority: z.enum(TASK_PRIORITIES, "Pilih prioritas"),
  deadlineOffsetDays: z
    .string()
    .trim()
    .regex(/^-?\d{1,4}$/, "Offset harus berupa angka, contoh -180")
    .transform(Number)
    .refine((value) => value >= -1095 && value <= 365, "Offset harus antara -1095 dan 365 hari"),
  eventTypeIds: z.array(z.uuid()).min(1, "Pilih minimal satu jenis acara"),
  marriageProcessIds: z.array(z.uuid()).min(1, "Pilih minimal satu jalur pernikahan"),
  isActive: checkbox,
});

// ─── Themes, users, weddings ─────────────────────────────────────────────────

export const themeSettingSchema = z.object({
  displayName: optionalText("Nama tampilan", 60),
  description: optionalText("Deskripsi", 200),
  isEnabled: checkbox,
  isPremium: checkbox,
  sortOrder: z
    .string()
    .trim()
    .nullish()
    .transform((value) => value || "0")
    .refine((value) => /^-?\d{1,5}$/.test(value), "Urutan harus berupa angka")
    .transform(Number),
});

export const suspendUserSchema = z.object({
  reason: z.string().trim().min(3, "Tulis alasan singkat (minimal 3 karakter)").max(200, "Alasan maksimal 200 karakter"),
});

export const grantPlanSchema = z.object({
  planCode: code("Paket"),
  note: z.string().trim().min(3, "Tulis catatan singkat (minimal 3 karakter)").max(200, "Catatan maksimal 200 karakter"),
});

export type PlanInput = z.output<typeof planSchema>;
export type AddonInput = z.output<typeof addonSchema>;
export type PromoCodeInput = z.output<typeof promoCodeSchema>;
export type TaskTemplateInput = z.output<typeof taskTemplateSchema>;
export type ThemeSettingInput = z.output<typeof themeSettingSchema>;
