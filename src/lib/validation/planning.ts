import { z } from "zod";
import { isValidIsoDate } from "@/lib/dates";
import { GIFT_ITEM_STATUSES, isValidTime, MAX_GIFT_QUANTITY } from "@/lib/planning";
import { optionalMoney, requiredMoney } from "@/lib/validation/money";

const emptyToNull = (value: string | null | undefined) => (value ? value : null);

const optionalText = (label: string, max: number) =>
  z.string().trim().max(max, `${label} maksimal ${max} karakter`).nullish().transform(emptyToNull);

const requiredDate = (label: string) => z.string().trim().refine(isValidIsoDate, `${label} tidak valid`);

const optionalDate = (label: string) =>
  z
    .string()
    .trim()
    .nullish()
    .transform(emptyToNull)
    .refine((value) => value === null || isValidIsoDate(value), `${label} tidak valid`);

const optionalTime = (label: string) =>
  z
    .string()
    .trim()
    .nullish()
    .transform(emptyToNull)
    .refine((value) => value === null || isValidTime(value), `${label} harus dalam format 24 jam, contoh 09:00`);

// ─── Savings ─────────────────────────────────────────────────────────────────

export const savingsEntrySchema = z.object({
  contributor: z.string().trim().min(1, "Nama penyetor wajib diisi").max(80, "Nama penyetor maksimal 80 karakter"),
  amount: requiredMoney("Nominal"),
  entryDate: requiredDate("Tanggal"),
  account: optionalText("Rekening / dompet", 80),
  notes: optionalText("Catatan", 500),
});

export const savingsSettingsSchema = z.object({
  savingsTarget: optionalMoney("Target dana"),
  savingsMonthlyTarget: optionalMoney("Target bulanan"),
});

export type SavingsEntryInput = z.output<typeof savingsEntrySchema>;
export type SavingsSettingsInput = z.output<typeof savingsSettingsSchema>;

// ─── Seserahan ───────────────────────────────────────────────────────────────

export const giftItemSchema = z.object({
  name: z.string().trim().min(1, "Nama barang wajib diisi").max(120, "Nama barang maksimal 120 karakter"),
  categoryId: z
    .string()
    .trim()
    .nullish()
    .transform(emptyToNull)
    .refine((value) => value === null || z.uuid().safeParse(value).success, "Kategori tidak valid"),
  quantity: z
    .string()
    .trim()
    .nullish()
    .transform((value) => value || "1")
    .refine((value) => /^\d{1,3}$/.test(value), "Jumlah harus berupa angka")
    .transform(Number)
    .refine((value) => value >= 1 && value <= MAX_GIFT_QUANTITY, `Jumlah harus 1–${MAX_GIFT_QUANTITY}`),
  estimatedPrice: optionalMoney("Perkiraan harga"),
  actualPrice: optionalMoney("Harga sebenarnya"),
  responsible: optionalText("Penanggung jawab", 80),
  status: z.enum(GIFT_ITEM_STATUSES, "Pilih status"),
  notes: optionalText("Catatan", 1000),
});

export type GiftItemInput = z.output<typeof giftItemSchema>;

// ─── Rundown ─────────────────────────────────────────────────────────────────

export const rundownItemSchema = z
  .object({
    title: z.string().trim().min(1, "Judul wajib diisi").max(120, "Judul maksimal 120 karakter"),
    itemDate: optionalDate("Tanggal"),
    startTime: z.string().trim().refine(isValidTime, "Jam mulai harus dalam format 24 jam, contoh 09:00"),
    endTime: optionalTime("Jam selesai"),
    description: optionalText("Deskripsi", 1000),
    pic: optionalText("Penanggung jawab", 80),
    location: optionalText("Lokasi", 120),
    category: optionalText("Kategori", 60),
    notes: optionalText("Catatan", 500),
  })
  .superRefine((data, ctx) => {
    if (data.endTime && data.endTime < data.startTime) {
      ctx.addIssue({ code: "custom", path: ["endTime"], message: "Jam selesai harus setelah jam mulai" });
    }
  });

export type RundownItemInput = z.output<typeof rundownItemSchema>;

// ─── Calendar ────────────────────────────────────────────────────────────────

export const calendarEventSchema = z
  .object({
    title: z.string().trim().min(1, "Judul wajib diisi").max(120, "Judul maksimal 120 karakter"),
    eventDate: requiredDate("Tanggal"),
    startTime: optionalTime("Jam mulai"),
    endTime: optionalTime("Jam selesai"),
    location: optionalText("Lokasi", 120),
    notes: optionalText("Catatan", 500),
  })
  .superRefine((data, ctx) => {
    if (data.endTime && !data.startTime) {
      ctx.addIssue({ code: "custom", path: ["startTime"], message: "Isi jam mulai bila jam selesai diisi" });
    }
    if (data.endTime && data.startTime && data.endTime < data.startTime) {
      ctx.addIssue({ code: "custom", path: ["endTime"], message: "Jam selesai harus setelah jam mulai" });
    }
  });

export type CalendarEventInput = z.output<typeof calendarEventSchema>;

// ─── Invitation music ────────────────────────────────────────────────────────

export const invitationMusicSchema = z.object({
  musicEnabled: z.boolean(),
  musicVolume: z
    .string()
    .trim()
    .nullish()
    .transform((value) => value || "60")
    .refine((value) => /^\d{1,3}$/.test(value), "Volume harus berupa angka")
    .transform(Number)
    .refine((value) => value >= 0 && value <= 100, "Volume harus 0–100"),
});

export type InvitationMusicInput = z.output<typeof invitationMusicSchema>;
