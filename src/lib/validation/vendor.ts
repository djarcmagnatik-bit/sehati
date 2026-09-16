import { z } from "zod";
import { isValidIsoDate } from "@/lib/dates";
import { EDITABLE_RESEARCH_STATUSES, normalizeInstagram, normalizeWebsite } from "@/lib/vendors";
import { optionalMoney } from "./money";

const emptyToNull = (value: string | undefined) => (value ? value : null);

const optionalText = (label: string, max: number) =>
  z.string().trim().max(max, `${label} maksimal ${max} karakter`).optional().transform(emptyToNull);

const optionalPhone = (label: string) =>
  z
    .string()
    .trim()
    .max(25, `${label} terlalu panjang`)
    .optional()
    .transform(emptyToNull)
    .refine((value) => value === null || /^\+?\d[\d\s-]{6,20}$/.test(value), `${label} tidak valid. Contoh: 0812-3456-7890`);

const optionalIsoDate = (label: string) =>
  z
    .string()
    .trim()
    .optional()
    .transform(emptyToNull)
    .refine((value) => value === null || isValidIsoDate(value), `${label} tidak valid`);

const optionalUuid = (message: string) =>
  z
    .string()
    .trim()
    .optional()
    .transform(emptyToNull)
    .refine((value) => value === null || z.uuid().safeParse(value).success, message);

const contactShape = {
  contactPerson: optionalText("Nama kontak", 120),
  whatsapp: optionalPhone("Nomor WhatsApp"),
  phone: optionalPhone("Nomor telepon"),
  instagram: z
    .string()
    .trim()
    .max(100, "Instagram terlalu panjang")
    .optional()
    .transform((value, ctx): string | null => {
      if (!value) return null;
      const handle = normalizeInstagram(value);
      if (!/^[A-Za-z0-9._]{1,30}$/.test(handle)) {
        ctx.addIssue({ code: "custom", message: "Username Instagram tidak valid" });
        return z.NEVER;
      }
      return handle;
    }),
  website: z
    .string()
    .trim()
    .max(300, "Alamat website terlalu panjang")
    .optional()
    .transform((value, ctx): string | null => {
      if (!value) return null;
      const url = normalizeWebsite(value);
      if (!url) {
        ctx.addIssue({ code: "custom", message: "Alamat website tidak valid (gunakan http/https)" });
        return z.NEVER;
      }
      return url;
    }),
};

const identityShape = {
  name: z.string().trim().min(1, "Nama vendor wajib diisi").max(120, "Nama vendor maksimal 120 karakter"),
  categoryId: z.uuid("Pilih kategori vendor"),
};

export const vendorResearchSchema = z.object({
  ...identityShape,
  ...contactShape,
  estimatedPrice: optionalMoney("Estimasi harga"),
  packageName: optionalText("Paket", 160),
  location: optionalText("Lokasi", 160),
  rating: z
    .string()
    .trim()
    .optional()
    .transform(emptyToNull)
    .refine((value) => value === null || /^[1-5]$/.test(value), "Rating harus 1 sampai 5")
    .transform((value) => (value === null ? null : Number(value))),
  pros: optionalText("Kelebihan", 1000),
  cons: optionalText("Kekurangan", 1000),
  notes: optionalText("Catatan", 2000),
  status: z.enum(EDITABLE_RESEARCH_STATUSES, "Pilih status"),
  meetingDate: optionalIsoDate("Tanggal janji temu"),
  meetingTime: z
    .string()
    .trim()
    .optional()
    .transform(emptyToNull)
    .refine((value) => value === null || /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(value), "Jam janji temu harus format 24 jam, contoh 14:00"),
}).superRefine((data, ctx) => {
  if (data.meetingTime && !data.meetingDate) {
    ctx.addIssue({ code: "custom", path: ["meetingDate"], message: "Isi tanggal janji temu bila jamnya diisi" });
  }
});

/** Contract details captured when a vendor is booked; creates a linked expense when a value is given. */
const contractShape = {
  contractValue: optionalMoney("Nilai kontrak"),
  budgetCategoryId: optionalUuid("Kategori budget tidak valid"),
  paymentDueDate: optionalIsoDate("Jatuh tempo pembayaran"),
  bookingDate: optionalIsoDate("Tanggal booking"),
};

function requireBudgetCategory(
  data: { contractValue: bigint | null; budgetCategoryId: string | null },
  ctx: { addIssue: (issue: { code: "custom"; path: string[]; message: string }) => void },
) {
  if (data.contractValue !== null && data.contractValue > 0n && !data.budgetCategoryId) {
    ctx.addIssue({ code: "custom", path: ["budgetCategoryId"], message: "Pilih kategori budget untuk mencatat kontrak" });
  }
}

export const bookVendorSchema = z
  .object({ ...contractShape, packageName: optionalText("Paket", 160) })
  .superRefine(requireBudgetCategory);

export const vendorCreateSchema = z
  .object({
    ...identityShape,
    ...contactShape,
    ...contractShape,
    packageName: optionalText("Paket", 160),
    eventLabel: optionalText("Acara", 120),
    notes: optionalText("Catatan", 2000),
  })
  .superRefine(requireBudgetCategory);

export const vendorUpdateSchema = z.object({
  ...identityShape,
  ...contactShape,
  packageName: optionalText("Paket", 160),
  bookingDate: optionalIsoDate("Tanggal booking"),
  eventLabel: optionalText("Acara", 120),
  notes: optionalText("Catatan", 2000),
});

export type VendorResearchInput = z.output<typeof vendorResearchSchema>;
export type BookVendorInput = z.output<typeof bookVendorSchema>;
export type VendorCreateInput = z.output<typeof vendorCreateSchema>;
export type VendorUpdateInput = z.output<typeof vendorUpdateSchema>;
