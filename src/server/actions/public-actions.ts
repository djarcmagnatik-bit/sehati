"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/lib/form-state";
import { MAX_SEATS_PER_INVITATION } from "@/lib/guests";
import { logger } from "@/lib/logger";
import { fieldErrorsFromZod } from "@/lib/validation/errors";
import { makeRsvpSchema, wishSchema } from "@/lib/validation/rsvp";
import { consumeRateLimit, RATE_LIMITS } from "@/server/auth/rate-limit";
import { getRequestContext } from "@/server/auth/request-context";
import { getRsvpGuestByToken, submitRsvp } from "@/server/rsvp/rsvp-service";
import { submitWish } from "@/server/rsvp/wish-service";
import { readString } from "./form-data";

/**
 * Actions for the public invitation. Nothing here trusts a wedding id from the form: the wedding is
 * always resolved from the guest token or the published slug, and every submission is rate limited.
 */

const GENERIC_ERROR = "Ucapan belum terkirim. Coba lagi sebentar lagi.";
const LINK_ERROR = "Tautan undangan ini sudah tidak berlaku.";
const TOO_MANY = "Terlalu banyak kiriman dari perangkat ini. Coba lagi nanti.";

function ipKey(ipAddress: string | null): string {
  return ipAddress ?? "unknown";
}

export async function submitRsvpAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const token = readString(formData, "token");
  const values = {
    rsvpStatus: readString(formData, "rsvpStatus"),
    attendingCount: readString(formData, "attendingCount"),
    attendeeNames: readString(formData, "attendeeNames"),
    message: readString(formData, "message"),
  };

  try {
    const guest = await getRsvpGuestByToken(token);
    if (!guest) return { status: "error", message: LINK_ERROR, values };

    const context = await getRequestContext();
    const [byGuest, byIp] = await Promise.all([
      consumeRateLimit(`rsvp:guest:${guest.id}`, RATE_LIMITS.rsvpPerGuest),
      consumeRateLimit(`rsvp:ip:${ipKey(context.ipAddress)}`, RATE_LIMITS.rsvpPerIp),
    ]);
    if (!byGuest.allowed || !byIp.allowed) return { status: "error", message: TOO_MANY, values };

    const parsed = makeRsvpSchema(guest.seatCount).safeParse(values);
    if (!parsed.success) {
      return { status: "error", message: "Periksa kembali jawabanmu.", fieldErrors: fieldErrorsFromZod(parsed.error), values };
    }

    const result = await submitRsvp(token, parsed.data, { ipAddress: context.ipAddress });
    if (!result.ok) {
      return {
        status: "error",
        message:
          result.reason === "seats_exceeded"
            ? guest.seatCount === null
              ? `Jumlah yang hadir maksimal ${MAX_SEATS_PER_INVITATION} orang.`
              : `Undangan ini berlaku untuk ${guest.seatCount} orang.`
            : LINK_ERROR,
        values,
      };
    }
    revalidatePath(`/i/${token}`);
    return {
      status: "success",
      message:
        result.rsvpStatus === "DECLINED"
          ? "Terima kasih sudah mengabari. Doa kalian tetap kami nantikan."
          : "Terima kasih! Konfirmasi kehadiranmu sudah kami terima.",
    };
  } catch (error) {
    logger.error("rsvp.submit_failed", { error });
    return { status: "error", message: "Konfirmasi belum terkirim. Coba lagi sebentar lagi.", values };
  }
}

export async function submitWishAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const token = readString(formData, "token");
  const slug = readString(formData, "slug");
  const values = { name: readString(formData, "name"), message: readString(formData, "message") };

  try {
    const context = await getRequestContext();
    const limit = await consumeRateLimit(`wish:ip:${ipKey(context.ipAddress)}`, RATE_LIMITS.wishPerIp);
    if (!limit.allowed) return { status: "error", message: TOO_MANY, values };

    const parsed = wishSchema.safeParse(values);
    if (!parsed.success) {
      return { status: "error", message: "Periksa kembali ucapanmu.", fieldErrors: fieldErrorsFromZod(parsed.error), values };
    }

    const result = await submitWish(token ? { token } : { slug }, parsed.data, { ipAddress: context.ipAddress });
    if (!result.ok) return { status: "error", message: LINK_ERROR, values };

    revalidatePath(token ? `/i/${token}` : `/undangan/${slug}`);
    return { status: "success", message: "Terima kasih atas ucapan dan doanya." };
  } catch (error) {
    logger.error("wish.submit_failed", { error });
    return { status: "error", message: GENERIC_ERROR, values };
  }
}
