import { z } from "zod";
import { attendanceError, MAX_SEATS_PER_INVITATION } from "@/lib/guests";
import { RSVP_CHOICES, WISH_MESSAGE_MAX, WISH_NAME_MAX } from "@/lib/rsvp";

const emptyToNull = (value: string | null | undefined) => (value ? value : null);

const optionalText = (label: string, max: number) =>
  z.string().trim().max(max, `${label} maksimal ${max} karakter`).nullish().transform(emptyToNull);

/**
 * The seat count of the guest's own invitation bounds the answer, so the schema is built per guest;
 * without one (null), only the per-invitation maximum applies. The same rule is enforced again by a
 * CHECK constraint on the row.
 */
export function makeRsvpSchema(seatCount: number | null) {
  return z
    .object({
      rsvpStatus: z.enum(RSVP_CHOICES, "Pilih salah satu jawaban"),
      attendingCount: z
        .string()
        .trim()
        .nullish()
        .transform((value) => value || "0")
        .refine((value) => /^\d{1,3}$/.test(value), "Jumlah yang hadir harus berupa angka")
        .transform(Number)
        .refine((value) => value <= MAX_SEATS_PER_INVITATION, `Maksimal ${MAX_SEATS_PER_INVITATION} orang`),
      attendeeNames: optionalText("Nama yang hadir", 500),
      message: optionalText("Pesan", 1000),
    })
    .superRefine((data, ctx) => {
      const error = attendanceError(data.rsvpStatus, data.attendingCount, seatCount);
      if (error) ctx.addIssue({ code: "custom", path: ["attendingCount"], message: error });
    })
    .transform((data) => ({
      ...data,
      attendingCount: data.rsvpStatus === "DECLINED" ? 0 : data.attendingCount,
    }));
}

export type RsvpInput = z.output<ReturnType<typeof makeRsvpSchema>>;

export const wishSchema = z.object({
  name: z.string().trim().min(1, "Nama wajib diisi").max(WISH_NAME_MAX, `Nama maksimal ${WISH_NAME_MAX} karakter`),
  message: z
    .string()
    .trim()
    .min(1, "Ucapan wajib diisi")
    .max(WISH_MESSAGE_MAX, `Ucapan maksimal ${WISH_MESSAGE_MAX} karakter`),
});

export type WishInput = z.output<typeof wishSchema>;
