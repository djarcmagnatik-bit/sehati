"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { FormState } from "@/lib/form-state";
import { SECTION_LABEL, type InvitationSectionTypeValue } from "@/lib/invitation";
import { logger } from "@/lib/logger";
import { IMAGE_MAX_BYTES, IMAGE_REJECTION_MESSAGE } from "@/lib/media";
import { fieldErrorsFromZod } from "@/lib/validation/errors";
import {
  galleryCaptionSchema,
  giftAccountSchema,
  giftAddressSchema,
  invitationSettingsSchema,
  invitationThemeSchema,
  loveStoryEntrySchema,
  SECTION_CONTENT_SCHEMAS,
  sectionContentFields,
  weddingEventSchema,
} from "@/lib/validation/invitation";
import { consumeRateLimit, RATE_LIMITS } from "@/server/auth/rate-limit";
import { requireSession } from "@/server/auth/session-cookie";
import { WeddingAccessError } from "@/server/authz/wedding-access";
import {
  addGalleryImage,
  createGiftAccount,
  createLoveStoryEntry,
  deleteGiftAccount,
  deleteLoveStoryEntry,
  moveGalleryImage,
  removeGalleryImage,
  updateGalleryCaption,
  updateGiftAccount,
  updateGiftAddress,
  updateLoveStoryEntry,
} from "@/server/invitation/content-service";
import { createWeddingEvent, deleteWeddingEvent, updateWeddingEvent } from "@/server/invitation/event-service";
import {
  ensureInvitation,
  moveSection,
  publishInvitation,
  setCoverImage,
  setSectionEnabled,
  unpublishInvitation,
  updateInvitationSettings,
  updateInvitationTheme,
  updateSectionContent,
} from "@/server/invitation/invitation-service";
import { deleteAssetIfUnused, uploadImage } from "@/server/media/media-service";
import { readString } from "./form-data";

const INVALID_INPUT = "Periksa kembali data yang ditandai.";
const NO_ACCESS = "Data tidak ditemukan atau kamu tidak memiliki akses.";

function readFields(formData: FormData, keys: readonly string[]): Record<string, string> {
  return Object.fromEntries(keys.map((key) => [key, readString(formData, key)]));
}

function revalidateInvitation() {
  revalidatePath("/invitation", "layout");
  revalidatePath("/undangan", "layout");
}

function failure(error: unknown, event: string, values?: Record<string, string>): FormState {
  if (error instanceof WeddingAccessError) return { status: "error", message: NO_ACCESS, values };
  logger.error(event, { error });
  return { status: "error", message: "Perubahan belum tersimpan. Silakan coba lagi.", values };
}

/** Void actions never leak another workspace's data through an error page. */
async function runVoid(event: string, action: () => Promise<void>): Promise<void> {
  try {
    await action();
  } catch (error) {
    if (error instanceof WeddingAccessError) return;
    logger.error(event, { error });
    throw error;
  }
  revalidateInvitation();
}

// ─── Invitation ──────────────────────────────────────────────────────────────

export async function createInvitationAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  await runVoid("invitation.create_failed", async () => {
    await ensureInvitation(session.user.id, readString(formData, "weddingId"));
  });
  redirect("/invitation?notice=created");
}

export async function updateInvitationSettingsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const values = readFields(formData, ["slug", "defaultGuestLabel"]);
  const parsed = invitationSettingsSchema.safeParse(values);
  if (!parsed.success) return { status: "error", message: INVALID_INPUT, fieldErrors: fieldErrorsFromZod(parsed.error), values };
  try {
    const result = await updateInvitationSettings(session.user.id, readString(formData, "weddingId"), parsed.data);
    if (!result.ok) {
      return { status: "error", message: INVALID_INPUT, fieldErrors: { slug: ["Alamat undangan sudah dipakai pasangan lain"] }, values };
    }
  } catch (error) {
    return failure(error, "invitation.settings_failed", values);
  }
  revalidateInvitation();
  return { status: "success", message: "Pengaturan undangan disimpan." };
}

export async function updateInvitationThemeAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const values = readFields(formData, ["themeCode", "coverLayout"]);
  const parsed = invitationThemeSchema.safeParse(values);
  if (!parsed.success) return { status: "error", message: INVALID_INPUT, fieldErrors: fieldErrorsFromZod(parsed.error), values };
  try {
    await updateInvitationTheme(session.user.id, readString(formData, "weddingId"), parsed.data);
  } catch (error) {
    return failure(error, "invitation.theme_failed", values);
  }
  revalidateInvitation();
  return { status: "success", message: "Tema undangan diperbarui." };
}

export async function updateSectionAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const type = readString(formData, "type") as InvitationSectionTypeValue;
  const schema = SECTION_CONTENT_SCHEMAS[type];
  if (!schema) return { status: "error", message: NO_ACCESS };

  const values = readFields(formData, sectionContentFields(type));
  const parsed = schema.safeParse(values);
  if (!parsed.success) return { status: "error", message: INVALID_INPUT, fieldErrors: fieldErrorsFromZod(parsed.error), values };
  try {
    await updateSectionContent(
      session.user.id,
      readString(formData, "sectionId"),
      parsed.data as Record<string, string | null>,
      formData.get("enabled") === "on",
    );
  } catch (error) {
    return failure(error, "invitation.section_failed", values);
  }
  revalidateInvitation();
  return { status: "success", message: `Bagian ${SECTION_LABEL[type]} disimpan.` };
}

export async function toggleSectionAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  await runVoid("invitation.section_toggle_failed", () =>
    setSectionEnabled(session.user.id, readString(formData, "sectionId"), readString(formData, "enabled") === "true"),
  );
}

export async function moveSectionAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const direction = readString(formData, "direction") === "up" ? "up" : "down";
  await runVoid("invitation.section_move_failed", () => moveSection(session.user.id, readString(formData, "sectionId"), direction));
}

export async function publishInvitationAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  let notice = "published";
  try {
    const result = await publishInvitation(session.user.id, readString(formData, "weddingId"));
    if (!result.ok) notice = `incomplete_${result.missing.join("-")}`;
  } catch (error) {
    if (error instanceof WeddingAccessError) return;
    throw error;
  }
  revalidateInvitation();
  redirect(`/invitation?notice=${notice}`);
}

export async function unpublishInvitationAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  await runVoid("invitation.unpublish_failed", () => unpublishInvitation(session.user.id, readString(formData, "weddingId")));
  redirect("/invitation?notice=unpublished");
}

// ─── Events ──────────────────────────────────────────────────────────────────

const EVENT_FIELDS = [
  "name",
  "eventDate",
  "startTime",
  "endTime",
  "venueName",
  "address",
  "latitude",
  "longitude",
  "mapsUrl",
  "dressCode",
  "notes",
] as const;

export async function createWeddingEventAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const values = readFields(formData, EVENT_FIELDS);
  const parsed = weddingEventSchema.safeParse(values);
  if (!parsed.success) return { status: "error", message: INVALID_INPUT, fieldErrors: fieldErrorsFromZod(parsed.error), values };
  try {
    await createWeddingEvent(session.user.id, readString(formData, "weddingId"), parsed.data);
  } catch (error) {
    return failure(error, "wedding_event.create_failed", values);
  }
  revalidateInvitation();
  redirect("/invitation/events?notice=created");
}

export async function updateWeddingEventAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const values = readFields(formData, EVENT_FIELDS);
  const parsed = weddingEventSchema.safeParse(values);
  if (!parsed.success) return { status: "error", message: INVALID_INPUT, fieldErrors: fieldErrorsFromZod(parsed.error), values };
  try {
    await updateWeddingEvent(session.user.id, readString(formData, "eventId"), parsed.data);
  } catch (error) {
    return failure(error, "wedding_event.update_failed", values);
  }
  revalidateInvitation();
  redirect("/invitation/events?notice=updated");
}

export async function deleteWeddingEventAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  await runVoid("wedding_event.delete_failed", () => deleteWeddingEvent(session.user.id, readString(formData, "eventId")));
  redirect("/invitation/events?notice=deleted");
}

// ─── Love story ──────────────────────────────────────────────────────────────

const STORY_FIELDS = ["title", "timeLabel", "story"] as const;

export async function createLoveStoryAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const values = readFields(formData, STORY_FIELDS);
  const parsed = loveStoryEntrySchema.safeParse(values);
  if (!parsed.success) return { status: "error", message: INVALID_INPUT, fieldErrors: fieldErrorsFromZod(parsed.error), values };
  try {
    await createLoveStoryEntry(session.user.id, readString(formData, "weddingId"), parsed.data);
  } catch (error) {
    return failure(error, "love_story.create_failed", values);
  }
  revalidateInvitation();
  return { status: "success", message: "Cerita ditambahkan." };
}

export async function updateLoveStoryAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const values = readFields(formData, STORY_FIELDS);
  const parsed = loveStoryEntrySchema.safeParse(values);
  if (!parsed.success) return { status: "error", message: INVALID_INPUT, fieldErrors: fieldErrorsFromZod(parsed.error), values };
  try {
    await updateLoveStoryEntry(session.user.id, readString(formData, "entryId"), parsed.data);
  } catch (error) {
    return failure(error, "love_story.update_failed", values);
  }
  revalidateInvitation();
  return { status: "success", message: "Cerita disimpan." };
}

export async function deleteLoveStoryAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  await runVoid("love_story.delete_failed", () => deleteLoveStoryEntry(session.user.id, readString(formData, "entryId")));
  redirect("/invitation/love-story?notice=deleted");
}

// ─── Gallery & cover ─────────────────────────────────────────────────────────

async function uploadFromForm(userId: string, weddingId: string, file: unknown): Promise<{ ok: true; assetId: string } | FormState> {
  if (!(file instanceof File) || file.size === 0) return { status: "error", message: "Pilih gambar terlebih dahulu." };
  if (file.size > IMAGE_MAX_BYTES) return { status: "error", message: IMAGE_REJECTION_MESSAGE.too_large };

  const limit = await consumeRateLimit(`image-upload:user:${userId}`, RATE_LIMITS.imageUploadPerUser);
  if (!limit.allowed) return { status: "error", message: "Terlalu banyak unggahan dalam waktu singkat. Coba lagi nanti." };

  const result = await uploadImage(userId, weddingId, {
    name: file.name,
    type: file.type,
    bytes: Buffer.from(await file.arrayBuffer()),
  });
  if (!result.ok) return { status: "error", message: IMAGE_REJECTION_MESSAGE[result.reason] };
  return { ok: true, assetId: result.assetId };
}

export async function uploadGalleryImageAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const weddingId = readString(formData, "weddingId");
  try {
    const uploaded = await uploadFromForm(session.user.id, weddingId, formData.get("file"));
    if (!("ok" in uploaded)) return uploaded;
    const added = await addGalleryImage(session.user.id, weddingId, uploaded.assetId);
    if (!added.ok) {
      return {
        status: "error",
        message: added.reason === "limit_reached" ? "Galeri sudah mencapai batas maksimal foto." : "Foto ini sudah ada di galeri.",
      };
    }
  } catch (error) {
    return failure(error, "gallery.upload_failed");
  }
  revalidateInvitation();
  return { status: "success", message: "Foto ditambahkan ke galeri." };
}

export async function uploadCoverImageAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const weddingId = readString(formData, "weddingId");
  try {
    const uploaded = await uploadFromForm(session.user.id, weddingId, formData.get("file"));
    if (!("ok" in uploaded)) return uploaded;
    await setCoverImage(session.user.id, weddingId, uploaded.assetId);
  } catch (error) {
    return failure(error, "invitation.cover_failed");
  }
  revalidateInvitation();
  return { status: "success", message: "Foto sampul diperbarui." };
}

export async function removeCoverImageAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const weddingId = readString(formData, "weddingId");
  const assetId = readString(formData, "assetId");
  await runVoid("invitation.cover_remove_failed", async () => {
    await setCoverImage(session.user.id, weddingId, null);
    if (assetId) await deleteAssetIfUnused(session.user.id, assetId);
  });
}

export async function updateGalleryCaptionAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const values = readFields(formData, ["caption"]);
  const parsed = galleryCaptionSchema.safeParse(values);
  if (!parsed.success) return { status: "error", message: INVALID_INPUT, fieldErrors: fieldErrorsFromZod(parsed.error), values };
  try {
    await updateGalleryCaption(session.user.id, readString(formData, "imageId"), parsed.data);
  } catch (error) {
    return failure(error, "gallery.caption_failed", values);
  }
  revalidateInvitation();
  return { status: "success", message: "Keterangan foto disimpan." };
}

export async function removeGalleryImageAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  await runVoid("gallery.remove_failed", async () => {
    const { assetId } = await removeGalleryImage(session.user.id, readString(formData, "imageId"));
    await deleteAssetIfUnused(session.user.id, assetId);
  });
}

export async function moveGalleryImageAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const direction = readString(formData, "direction") === "up" ? "up" : "down";
  await runVoid("gallery.move_failed", () => moveGalleryImage(session.user.id, readString(formData, "imageId"), direction));
}

// ─── Gift information ────────────────────────────────────────────────────────

const GIFT_FIELDS = ["type", "providerName", "accountNumber", "accountHolder", "notes"] as const;

export async function createGiftAccountAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const values = readFields(formData, GIFT_FIELDS);
  const parsed = giftAccountSchema.safeParse(values);
  if (!parsed.success) return { status: "error", message: INVALID_INPUT, fieldErrors: fieldErrorsFromZod(parsed.error), values };
  try {
    await createGiftAccount(session.user.id, readString(formData, "weddingId"), parsed.data);
  } catch (error) {
    return failure(error, "gift_account.create_failed", values);
  }
  revalidateInvitation();
  return { status: "success", message: "Info hadiah ditambahkan." };
}

export async function updateGiftAccountAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const values = readFields(formData, GIFT_FIELDS);
  const parsed = giftAccountSchema.safeParse(values);
  if (!parsed.success) return { status: "error", message: INVALID_INPUT, fieldErrors: fieldErrorsFromZod(parsed.error), values };
  try {
    await updateGiftAccount(session.user.id, readString(formData, "accountId"), parsed.data);
  } catch (error) {
    return failure(error, "gift_account.update_failed", values);
  }
  revalidateInvitation();
  return { status: "success", message: "Info hadiah disimpan." };
}

export async function deleteGiftAccountAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  await runVoid("gift_account.delete_failed", () => deleteGiftAccount(session.user.id, readString(formData, "accountId")));
  redirect("/invitation/gift?notice=deleted");
}

export async function updateGiftAddressAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const values = readFields(formData, ["giftAddress"]);
  const parsed = giftAddressSchema.safeParse(values);
  if (!parsed.success) return { status: "error", message: INVALID_INPUT, fieldErrors: fieldErrorsFromZod(parsed.error), values };
  try {
    await updateGiftAddress(session.user.id, readString(formData, "weddingId"), parsed.data);
  } catch (error) {
    return failure(error, "gift_address.update_failed", values);
  }
  revalidateInvitation();
  return { status: "success", message: "Alamat kirim hadiah disimpan." };
}
