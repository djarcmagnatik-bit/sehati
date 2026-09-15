"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getEnv } from "@/lib/env";
import type { FormState } from "@/lib/form-state";
import { logger } from "@/lib/logger";
import { emailSchema } from "@/lib/validation/auth";
import { consumeRateLimit, RATE_LIMITS } from "@/server/auth/rate-limit";
import { requireSession } from "@/server/auth/session-cookie";
import { WeddingAccessError } from "@/server/authz/wedding-access";
import {
  acceptPartnerInvitation,
  createPartnerInvitation,
  declinePartnerInvitation,
  removePartner,
  revokePartnerInvitation,
} from "@/server/collaboration/partner-invitation-service";
import { getMailer } from "@/server/mail/mailer";
import { readString } from "./form-data";

const TOO_MANY_ATTEMPTS = "Terlalu banyak percobaan. Silakan coba lagi nanti.";
const NOT_OWNER = "Hanya pemilik workspace yang bisa mengelola undangan pasangan.";
const NO_ACCESS = "Kamu tidak memiliki akses ke workspace ini.";

function revalidateCollaboration() {
  revalidatePath("/settings/partner");
  revalidatePath("/dashboard");
}

export async function invitePartnerAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const weddingId = readString(formData, "weddingId");
  const rawEmail = readString(formData, "email");
  const values = { email: rawEmail };

  const parsed = emailSchema.safeParse(rawEmail);
  if (!parsed.success) {
    return {
      status: "error",
      message: "Periksa kembali email pasangan.",
      fieldErrors: { email: [parsed.error.issues[0]?.message ?? "Format email tidak valid"] },
      values,
    };
  }

  let result: Awaited<ReturnType<typeof createPartnerInvitation>>;
  try {
    const limit = await consumeRateLimit(`partner-invite:user:${session.user.id}`, RATE_LIMITS.partnerInvitePerUser);
    if (!limit.allowed) return { status: "error", message: TOO_MANY_ATTEMPTS, values };

    result = await createPartnerInvitation(session.user.id, weddingId, parsed.data, {
      mailer: getMailer(),
      appUrl: getEnv().APP_URL,
    });
  } catch (error) {
    if (error instanceof WeddingAccessError) return { status: "error", message: NO_ACCESS, values };
    logger.error("partner_invitation.create_failed", { error });
    return { status: "error", message: "Undangan belum berhasil dibuat. Silakan coba lagi.", values };
  }

  if (!result.ok) {
    if (result.reason === "not_owner") return { status: "error", message: NOT_OWNER, values };
    if (result.reason === "own_email") {
      return {
        status: "error",
        message: "Periksa kembali email pasangan.",
        fieldErrors: { email: ["Ini email akunmu sendiri. Masukkan email pasanganmu."] },
        values,
      };
    }
    return { status: "error", message: "Pasanganmu sudah bergabung ke workspace ini.", values };
  }

  revalidateCollaboration();
  return {
    status: "success",
    message: result.emailSent
      ? `Undangan dikirim ke ${parsed.data}. Kamu juga bisa membagikan tautan di bawah secara langsung.`
      : "Undangan dibuat, tetapi email belum terkirim. Bagikan tautan di bawah ke pasanganmu.",
    values: { email: parsed.data, inviteUrl: result.inviteUrl },
  };
}

export async function revokeInvitationAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  try {
    const result = await revokePartnerInvitation(session.user.id, readString(formData, "weddingId"));
    if (!result.ok) return;
  } catch (error) {
    if (error instanceof WeddingAccessError) return;
    throw error;
  }
  revalidateCollaboration();
  redirect("/settings/partner?notice=invitation_revoked");
}

export async function removePartnerAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  try {
    const result = await removePartner(session.user.id, readString(formData, "weddingId"));
    if (!result.ok) return;
  } catch (error) {
    if (error instanceof WeddingAccessError) return;
    throw error;
  }
  revalidateCollaboration();
  redirect("/settings/partner?notice=partner_removed");
}

export async function respondToInvitationAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const token = readString(formData, "token");
  const intent = readString(formData, "intent");

  try {
    const limit = await consumeRateLimit(`invite-response:user:${session.user.id}`, RATE_LIMITS.invitationResponsePerUser);
    if (!limit.allowed) return { status: "error", message: TOO_MANY_ATTEMPTS };

    if (intent === "decline") {
      const declined = await declinePartnerInvitation(session.user.id, token);
      if (declined.ok) return { status: "success", message: "Undangan ditolak. Kamu tidak bergabung ke workspace ini." };
      return {
        status: "error",
        message:
          declined.reason === "email_mismatch"
            ? "Undangan ini ditujukan untuk email lain."
            : "Undangan ini sudah tidak berlaku.",
      };
    }

    const accepted = await acceptPartnerInvitation(session.user.id, token);
    if (!accepted.ok) {
      switch (accepted.reason) {
        case "already_member":
          break;
        case "email_mismatch":
          return {
            status: "error",
            message: "Undangan ini ditujukan untuk email lain. Keluar, lalu masuk atau daftar dengan email yang diundang.",
          };
        case "has_other_wedding":
          return {
            status: "error",
            message: "Akun ini sudah memiliki workspace pernikahan sendiri, jadi tidak bisa bergabung ke workspace lain.",
          };
        case "workspace_full":
          return { status: "error", message: "Workspace ini sudah memiliki dua anggota." };
        case "invalid":
          return {
            status: "error",
            message: "Undangan ini sudah tidak berlaku. Minta pasanganmu mengirim undangan baru.",
          };
      }
    }
  } catch (error) {
    logger.error("partner_invitation.respond_failed", { error });
    return { status: "error", message: "Undangan belum berhasil diproses. Silakan coba lagi." };
  }

  revalidatePath("/dashboard");
  redirect("/dashboard?notice=partner_joined");
}
