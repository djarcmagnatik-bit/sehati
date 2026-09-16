import { z } from "zod";
import {
  attendanceError,
  EDITABLE_INVITATION_STATUSES,
  GUEST_RSVP_STATUSES,
  MAX_SEATS_PER_INVITATION,
  normalizeAttendance,
} from "@/lib/guests";

const emptyToNull = (value: string | undefined) => (value ? value : null);

const optionalText = (label: string, max: number) =>
  z.string().trim().max(max, `${label} maksimal ${max} karakter`).optional().transform(emptyToNull);

export const guestInputSchema = z
  .object({
    guestName: z.string().trim().min(1, "Nama tamu wajib diisi").max(120, "Nama tamu maksimal 120 karakter"),
    invitationName: optionalText("Nama undangan", 160),
    groupId: z
      .string()
      .trim()
      .optional()
      .transform(emptyToNull)
      .refine((value) => value === null || z.uuid().safeParse(value).success, "Grup tidak valid"),
    phone: z
      .string()
      .trim()
      .max(25, "Nomor telepon terlalu panjang")
      .optional()
      .transform(emptyToNull)
      .refine((value) => value === null || /^\+?\d[\d\s-]{6,20}$/.test(value), "Nomor telepon tidak valid. Contoh: 0812-3456-7890"),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .max(254, "Email terlalu panjang")
      .optional()
      .transform(emptyToNull)
      .refine((value) => value === null || z.email().safeParse(value).success, "Format email tidak valid"),
    address: optionalText("Alamat", 500),
    seatCount: z
      .string()
      .trim()
      .regex(/^\d{1,3}$/, "Jumlah kursi harus berupa angka")
      .transform(Number)
      .refine(
        (value) => value >= 1 && value <= MAX_SEATS_PER_INVITATION,
        `Jumlah kursi harus 1–${MAX_SEATS_PER_INVITATION}`,
      ),
    invitationStatus: z.enum(EDITABLE_INVITATION_STATUSES, "Pilih status undangan"),
    rsvpStatus: z.enum(GUEST_RSVP_STATUSES, "Pilih status RSVP"),
    attendingCount: z
      .string()
      .trim()
      .optional()
      .transform((value) => value || "0")
      .refine((value) => /^\d{1,3}$/.test(value), "Jumlah hadir harus berupa angka")
      .transform(Number),
    notes: optionalText("Catatan", 1000),
  })
  .superRefine((data, ctx) => {
    const error = attendanceError(data.rsvpStatus, data.attendingCount, data.seatCount);
    if (error) ctx.addIssue({ code: "custom", path: ["attendingCount"], message: error });
  })
  .transform((data) => ({
    ...data,
    invitationName: data.invitationName ?? data.guestName,
    attendingCount: normalizeAttendance(data.rsvpStatus, data.attendingCount),
  }));

export const guestGroupSchema = z.object({
  name: z.string().trim().min(1, "Nama grup wajib diisi").max(80, "Nama grup maksimal 80 karakter"),
});

export const bulkInvitationStatusSchema = z.object({
  status: z.enum(EDITABLE_INVITATION_STATUSES, "Pilih status undangan"),
  guestIds: z.array(z.uuid()).min(1, "Pilih minimal satu tamu").max(500, "Maksimal 500 tamu sekaligus"),
});

export type GuestInput = z.output<typeof guestInputSchema>;
export type GuestGroupInput = z.output<typeof guestGroupSchema>;
