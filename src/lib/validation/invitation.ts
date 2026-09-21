import { z } from "zod";
import { isValidIsoDate } from "@/lib/dates";
import {
  GIFT_ACCOUNT_TYPES,
  INVITATION_SECTION_TYPES,
  slugError,
  slugify,
  type InvitationSectionTypeValue,
} from "@/lib/invitation";
import { COVER_LAYOUTS, isThemeCode } from "@/lib/invitation-themes";
import { normalizeInstagram, normalizeWebsite } from "@/lib/vendors";

const emptyToNull = (value: string | null | undefined) => (value ? value : null);

/**
 * Accepts null as well as undefined: the same schemas validate form input (missing keys) and the
 * JSON already stored for a section (explicit nulls).
 */
const optionalText = (label: string, max: number) =>
  z.string().trim().max(max, `${label} maksimal ${max} karakter`).nullish().transform(emptyToNull);

/** "@putri.ayu" or an instagram.com link → "putri.ayu". Shown as a public link, so only real handles pass. */
const instagramHandle = (label: string) =>
  z
    .string()
    .trim()
    .max(100, `${label} terlalu panjang`)
    .nullish()
    .transform((value, ctx): string | null => {
      if (!value) return null;
      const handle = normalizeInstagram(value);
      if (!/^[A-Za-z0-9._]{1,30}$/.test(handle)) {
        ctx.addIssue({ code: "custom", message: `${label}: username tidak valid` });
        return z.NEVER;
      }
      return handle;
    });

// ─── Sections ────────────────────────────────────────────────────────────────

/** Text shown above the entries a section renders from other tables. */
const introOnly = z.object({ intro: optionalText("Pengantar", 300) });

/** A ticked checkbox is stored as "on"; anything else as null. */
const checkboxFlag = z
  .string()
  .nullish()
  .transform((value) => (value === "on" ? "on" : null));

export const SECTION_CONTENT_SCHEMAS = {
  COVER: z.object({ prefix: optionalText("Teks pembuka", 60), note: optionalText("Catatan", 200) }),
  COUPLE: z.object({
    intro: optionalText("Pengantar", 300),
    brideFullName: optionalText("Nama lengkap mempelai wanita", 120),
    brideParents: optionalText("Orang tua mempelai wanita", 200),
    brideInstagram: instagramHandle("Instagram mempelai wanita"),
    groomFullName: optionalText("Nama lengkap mempelai pria", 120),
    groomParents: optionalText("Orang tua mempelai pria", 200),
    groomInstagram: instagramHandle("Instagram mempelai pria"),
  }),
  QUOTE: z.object({ text: optionalText("Kutipan", 600), source: optionalText("Sumber", 120) }),
  EVENTS: introOnly,
  COUNTDOWN: z.object({}),
  LOVE_STORY: introOnly,
  GALLERY: introOnly,
  LOCATION: introOnly,
  RSVP: z.object({
    intro: optionalText("Pengantar", 300),
    // "on": the guest is not asked how many people come; the server counts the invitation's seats.
    hideAttendingCount: checkboxFlag,
  }),
  WISHES: introOnly,
  GIFT: introOnly,
  CLOSING: z.object({ message: optionalText("Pesan penutup", 600), signature: optionalText("Tanda tangan", 120) }),
} satisfies Record<InvitationSectionTypeValue, z.ZodType>;

export type SectionContent<T extends InvitationSectionTypeValue> = z.output<(typeof SECTION_CONTENT_SCHEMAS)[T]>;
export type AnySectionContent = { [K in InvitationSectionTypeValue]: SectionContent<K> }[InvitationSectionTypeValue];

/** Stored JSON is untrusted input: unknown or malformed content falls back to empty fields. */
export function parseSectionContent<T extends InvitationSectionTypeValue>(type: T, raw: unknown): SectionContent<T> {
  const schema = SECTION_CONTENT_SCHEMAS[type];
  const parsed = schema.safeParse(raw ?? {});
  return (parsed.success ? parsed.data : schema.parse({})) as SectionContent<T>;
}

export function sectionContentFields(type: InvitationSectionTypeValue): string[] {
  const shape = (SECTION_CONTENT_SCHEMAS[type] as z.ZodObject).shape;
  return Object.keys(shape);
}

export const sectionOrderSchema = z.object({
  sectionIds: z.array(z.uuid()).min(1).max(INVITATION_SECTION_TYPES.length),
});

// ─── Invitation settings ─────────────────────────────────────────────────────

export const invitationSettingsSchema = z.object({
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "Alamat undangan wajib diisi")
    .transform((value) => slugify(value))
    .superRefine((value, ctx) => {
      const error = slugError(value);
      if (error) ctx.addIssue({ code: "custom", message: error });
    }),
  defaultGuestLabel: optionalText("Sapaan tamu", 120),
});

export const invitationThemeSchema = z.object({
  themeCode: z.string().trim().refine(isThemeCode, "Tema tidak dikenal"),
  coverLayout: z.enum(COVER_LAYOUTS, "Pilih tata letak sampul"),
  /** Full-screen "Buka Undangan" cover before the invitation (on unless the couple turns it off). */
  openingCover: z.boolean().optional(),
});

export type InvitationSettingsInput = z.output<typeof invitationSettingsSchema>;
export type InvitationThemeInput = z.output<typeof invitationThemeSchema>;

// ─── Wedding events ──────────────────────────────────────────────────────────

const timeField = (label: string) =>
  z
    .string()
    .trim()
    .optional()
    .transform(emptyToNull)
    .refine((value) => value === null || /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(value), `${label} harus dalam format 24 jam, contoh 09:00`);

const coordinate = (label: string, max: number) =>
  z
    .string()
    .trim()
    .optional()
    .transform(emptyToNull)
    .refine((value) => value === null || /^-?\d{1,3}(\.\d{1,6})?$/.test(value), `${label} tidak valid`)
    .transform((value) => (value === null ? null : Number(value)))
    .refine((value) => value === null || (value >= -max && value <= max), `${label} harus antara -${max} dan ${max}`);

export const weddingEventSchema = z
  .object({
    name: z.string().trim().min(1, "Nama acara wajib diisi").max(80, "Nama acara maksimal 80 karakter"),
    eventDate: z.string().trim().refine(isValidIsoDate, "Tanggal acara tidak valid"),
    startTime: timeField("Jam mulai"),
    endTime: timeField("Jam selesai"),
    venueName: optionalText("Nama tempat", 120),
    address: optionalText("Alamat", 500),
    latitude: coordinate("Latitude", 90),
    longitude: coordinate("Longitude", 180),
    mapsUrl: z
      .string()
      .trim()
      .max(500, "Tautan peta terlalu panjang")
      .optional()
      .transform((value, ctx): string | null => {
        if (!value) return null;
        const url = normalizeWebsite(value);
        if (!url) {
          ctx.addIssue({ code: "custom", message: "Tautan peta tidak valid (gunakan http/https)" });
          return z.NEVER;
        }
        return url;
      }),
    dressCode: optionalText("Dress code", 120),
    notes: optionalText("Catatan", 1000),
  })
  .superRefine((data, ctx) => {
    if ((data.latitude === null) !== (data.longitude === null)) {
      ctx.addIssue({ code: "custom", path: ["longitude"], message: "Isi latitude dan longitude bersamaan" });
    }
    if (data.startTime && data.endTime && data.endTime <= data.startTime) {
      ctx.addIssue({ code: "custom", path: ["endTime"], message: "Jam selesai harus setelah jam mulai" });
    }
  });

export type WeddingEventInput = z.output<typeof weddingEventSchema>;

// ─── Love story, gallery, gift ───────────────────────────────────────────────

export const loveStoryEntrySchema = z.object({
  title: z.string().trim().min(1, "Judul wajib diisi").max(120, "Judul maksimal 120 karakter"),
  timeLabel: optionalText("Waktu", 40),
  story: z.string().trim().min(1, "Cerita wajib diisi").max(1000, "Cerita maksimal 1000 karakter"),
});

export const galleryCaptionSchema = z.object({ caption: optionalText("Keterangan", 160) });

export const giftAccountSchema = z.object({
  type: z.enum(GIFT_ACCOUNT_TYPES, "Pilih jenis"),
  providerName: z.string().trim().min(1, "Nama bank / dompet digital wajib diisi").max(60, "Maksimal 60 karakter"),
  accountNumber: z
    .string()
    .trim()
    .min(1, "Nomor rekening wajib diisi")
    .max(40, "Nomor rekening maksimal 40 karakter")
    .refine((value) => /^[0-9 .-]+$/.test(value), "Nomor rekening hanya boleh angka, spasi, titik, dan tanda hubung"),
  accountHolder: z.string().trim().min(1, "Nama pemilik wajib diisi").max(80, "Nama pemilik maksimal 80 karakter"),
  notes: optionalText("Catatan", 200),
});

export const giftAddressSchema = z.object({ giftAddress: optionalText("Alamat kirim hadiah", 500) });

export type LoveStoryEntryInput = z.output<typeof loveStoryEntrySchema>;
export type GiftAccountInput = z.output<typeof giftAccountSchema>;
export type GalleryCaptionInput = z.output<typeof galleryCaptionSchema>;
export type GiftAddressInput = z.output<typeof giftAddressSchema>;
