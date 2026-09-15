"use server";

import { redirect } from "next/navigation";
import { todayIsoInTimeZone } from "@/lib/dates";
import type { FieldErrors } from "@/lib/form-state";
import { logger } from "@/lib/logger";
import { fieldErrorsFromZod } from "@/lib/validation/errors";
import { makeOnboardingSchema } from "@/lib/validation/onboarding";
import { requireSession } from "@/server/auth/session-cookie";
import { createWeddingForUser, type CreateWeddingResult } from "@/server/wedding/wedding-service";

export type OnboardingActionResult = { ok: false; message: string; fieldErrors?: FieldErrors };

/** Validates the complete onboarding payload server-side and creates the wedding workspace. */
export async function createWeddingAction(input: unknown): Promise<OnboardingActionResult> {
  const session = await requireSession();

  const parsed = makeOnboardingSchema(todayIsoInTimeZone(new Date())).safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: "Periksa kembali data yang ditandai.",
      fieldErrors: fieldErrorsFromZod(parsed.error),
    };
  }

  let result: CreateWeddingResult;
  try {
    result = await createWeddingForUser(session.user.id, parsed.data);
  } catch (error) {
    logger.error("wedding.create_failed", { error, userId: session.user.id });
    return { ok: false, message: "Workspace belum berhasil dibuat. Silakan coba lagi." };
  }

  if (!result.ok) {
    if (result.reason === "already_has_wedding") redirect("/dashboard");
    if (result.reason === "invalid_event_type") {
      return {
        ok: false,
        message: "Jenis acara yang dipilih sudah tidak tersedia.",
        fieldErrors: { eventTypeId: ["Pilih jenis acara lain"] },
      };
    }
    return {
      ok: false,
      message: "Jalur pernikahan yang dipilih sudah tidak tersedia.",
      fieldErrors: { marriageProcessId: ["Pilih jalur pernikahan lain"] },
    };
  }

  logger.info("wedding.created", { weddingId: result.weddingId });
  redirect("/dashboard");
}
