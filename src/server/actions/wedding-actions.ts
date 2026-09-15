"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { formatIsoDateLong, todayIsoInTimeZone } from "@/lib/dates";
import type { FormState } from "@/lib/form-state";
import { logger } from "@/lib/logger";
import { fieldErrorsFromZod } from "@/lib/validation/errors";
import { makeWeddingDateChangeSchema } from "@/lib/validation/task";
import { requireSession } from "@/server/auth/session-cookie";
import { WeddingAccessError } from "@/server/authz/wedding-access";
import { changeWeddingDate, updateCoupleNote } from "@/server/wedding/wedding-service";
import { readString } from "./form-data";

const coupleNoteSchema = z.object({
  weddingId: z.uuid("Workspace tidak valid"),
  note: z.string().trim().max(280, "Catatan maksimal 280 karakter"),
});

export async function updateCoupleNoteAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const input = { weddingId: readString(formData, "weddingId"), note: readString(formData, "note") };
  const values = { note: input.note };

  const parsed = coupleNoteSchema.safeParse(input);
  if (!parsed.success) {
    return {
      status: "error",
      message: "Catatan belum bisa disimpan.",
      fieldErrors: fieldErrorsFromZod(parsed.error),
      values,
    };
  }

  try {
    await updateCoupleNote(session.user.id, parsed.data.weddingId, parsed.data.note || null);
  } catch (error) {
    if (error instanceof WeddingAccessError) {
      logger.warn("wedding.access_denied", { userId: session.user.id, action: "update_couple_note" });
      return { status: "error", message: "Kamu tidak memiliki akses ke workspace ini.", values };
    }
    logger.error("wedding.update_couple_note_failed", { error });
    return { status: "error", message: "Catatan belum bisa disimpan. Silakan coba lagi.", values };
  }

  revalidatePath("/dashboard");
  return { status: "success", message: "Catatan tersimpan.", values: { note: parsed.data.note } };
}

export async function changeWeddingDateAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const input = {
    weddingId: readString(formData, "weddingId"),
    weddingDate: readString(formData, "weddingDate"),
    recalculate: readString(formData, "recalculate"),
  };
  const values = { weddingDate: input.weddingDate, recalculate: input.recalculate };

  const parsed = makeWeddingDateChangeSchema(todayIsoInTimeZone(new Date())).safeParse(input);
  if (!parsed.success) {
    return {
      status: "error",
      message: "Periksa kembali data yang ditandai.",
      fieldErrors: fieldErrorsFromZod(parsed.error),
      values,
    };
  }

  const recalculate = parsed.data.recalculate === "yes";
  let recalculated = 0;
  try {
    const result = await changeWeddingDate(session.user.id, parsed.data.weddingId, parsed.data.weddingDate, recalculate);
    if (!result.ok) {
      const message =
        result.reason === "engagement_after_wedding"
          ? "Tanggal pernikahan tidak boleh sebelum tanggal lamaran."
          : "Tanggal pernikahan tidak boleh setelah tanggal resepsi.";
      return { status: "error", message, fieldErrors: { weddingDate: [message] }, values };
    }
    recalculated = result.recalculated;
  } catch (error) {
    if (error instanceof WeddingAccessError) {
      return { status: "error", message: "Kamu tidak memiliki akses ke workspace ini.", values };
    }
    logger.error("wedding.change_date_failed", { error });
    return { status: "error", message: "Tanggal belum berhasil diubah. Silakan coba lagi.", values };
  }

  revalidatePath("/dashboard");
  revalidatePath("/checklist", "layout");
  revalidatePath("/settings/wedding");

  const dateLabel = formatIsoDateLong(parsed.data.weddingDate);
  return {
    status: "success",
    message: recalculate
      ? `Tanggal pernikahan diperbarui menjadi ${dateLabel}. ${recalculated} tenggat tugas dihitung ulang.`
      : `Tanggal pernikahan diperbarui menjadi ${dateLabel}. Tenggat checklist tidak diubah.`,
  };
}
