"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { FormState } from "@/lib/form-state";
import { logger } from "@/lib/logger";
import { AUDIO_MAX_BYTES, AUDIO_REJECTION_MESSAGE, IMAGE_MAX_BYTES, IMAGE_REJECTION_MESSAGE } from "@/lib/media";
import { GIFT_ITEM_STATUSES, type GiftItemStatusValue } from "@/lib/planning";
import { fieldErrorsFromZod } from "@/lib/validation/errors";
import {
  calendarEventSchema,
  giftItemSchema,
  invitationMusicSchema,
  rundownItemSchema,
  savingsEntrySchema,
  savingsSettingsSchema,
} from "@/lib/validation/planning";
import { consumeRateLimit, RATE_LIMITS } from "@/server/auth/rate-limit";
import { requireSession } from "@/server/auth/session-cookie";
import { WeddingAccessError } from "@/server/authz/wedding-access";
import { setInvitationMusic, updateInvitationMusic } from "@/server/invitation/invitation-service";
import { deleteAssetIfUnused, uploadAudio, uploadImage } from "@/server/media/media-service";
import { createCalendarEvent, deleteCalendarEvent, updateCalendarEvent } from "@/server/planning/calendar-service";
import { createRundownItem, deleteRundownItem, moveRundownItem, updateRundownItem } from "@/server/planning/rundown-service";
import {
  createSavingsEntry,
  deleteSavingsEntry,
  updateSavingsEntry,
  updateSavingsSettings,
} from "@/server/planning/savings-service";
import {
  createGiftItem,
  deleteGiftItem,
  setGiftItemPhoto,
  setGiftItemStatus,
  updateGiftItem,
} from "@/server/planning/seserahan-service";
import { readString } from "./form-data";

const INVALID_INPUT = "Periksa kembali data yang ditandai.";
const NO_ACCESS = "Data tidak ditemukan atau kamu tidak memiliki akses.";

function readFields(formData: FormData, keys: readonly string[]): Record<string, string> {
  return Object.fromEntries(keys.map((key) => [key, readString(formData, key)]));
}

function failure(error: unknown, event: string, values?: Record<string, string>): FormState {
  if (error instanceof WeddingAccessError) return { status: "error", message: NO_ACCESS, values };
  logger.error(event, { error });
  return { status: "error", message: "Data belum berhasil disimpan. Silakan coba lagi.", values };
}

async function runVoid(event: string, paths: string[], action: () => Promise<unknown>): Promise<void> {
  try {
    await action();
  } catch (error) {
    if (error instanceof WeddingAccessError) return;
    logger.error(event, { error });
    throw error;
  }
  for (const path of paths) revalidatePath(path);
}

function revalidatePlanning(section: string) {
  revalidatePath(section, "layout");
  revalidatePath("/dashboard");
  revalidatePath("/calendar");
}

// ─── Savings ─────────────────────────────────────────────────────────────────

const SAVINGS_FIELDS = ["contributor", "amount", "entryDate", "account", "notes"] as const;

export async function createSavingsEntryAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const values = readFields(formData, SAVINGS_FIELDS);
  const parsed = savingsEntrySchema.safeParse(values);
  if (!parsed.success) return { status: "error", message: INVALID_INPUT, fieldErrors: fieldErrorsFromZod(parsed.error), values };
  try {
    await createSavingsEntry(session.user.id, readString(formData, "weddingId"), parsed.data);
  } catch (error) {
    return failure(error, "savings.create_failed", values);
  }
  revalidatePlanning("/savings");
  redirect("/savings?notice=created");
}

export async function updateSavingsEntryAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const values = readFields(formData, SAVINGS_FIELDS);
  const parsed = savingsEntrySchema.safeParse(values);
  if (!parsed.success) return { status: "error", message: INVALID_INPUT, fieldErrors: fieldErrorsFromZod(parsed.error), values };
  try {
    await updateSavingsEntry(session.user.id, readString(formData, "entryId"), parsed.data);
  } catch (error) {
    return failure(error, "savings.update_failed", values);
  }
  revalidatePlanning("/savings");
  redirect("/savings?notice=updated");
}

export async function deleteSavingsEntryAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  await runVoid("savings.delete_failed", ["/savings", "/dashboard"], () =>
    deleteSavingsEntry(session.user.id, readString(formData, "entryId")),
  );
  redirect("/savings?notice=deleted");
}

export async function updateSavingsSettingsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const values = readFields(formData, ["savingsTarget", "savingsMonthlyTarget"]);
  const parsed = savingsSettingsSchema.safeParse(values);
  if (!parsed.success) return { status: "error", message: INVALID_INPUT, fieldErrors: fieldErrorsFromZod(parsed.error), values };
  try {
    await updateSavingsSettings(session.user.id, readString(formData, "weddingId"), parsed.data);
  } catch (error) {
    return failure(error, "savings.settings_failed", values);
  }
  revalidatePlanning("/savings");
  return { status: "success", message: "Target tabungan disimpan." };
}

// ─── Seserahan ───────────────────────────────────────────────────────────────

const GIFT_FIELDS = ["name", "categoryId", "quantity", "estimatedPrice", "actualPrice", "responsible", "status", "notes"] as const;
const INVALID_CATEGORY = { categoryId: ["Kategori tidak tersedia"] };

export async function createGiftItemAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const values = readFields(formData, GIFT_FIELDS);
  const parsed = giftItemSchema.safeParse(values);
  if (!parsed.success) return { status: "error", message: INVALID_INPUT, fieldErrors: fieldErrorsFromZod(parsed.error), values };
  let itemId: string;
  try {
    const result = await createGiftItem(session.user.id, readString(formData, "weddingId"), parsed.data);
    if (!result.ok) return { status: "error", message: INVALID_INPUT, fieldErrors: INVALID_CATEGORY, values };
    itemId = result.itemId;
  } catch (error) {
    return failure(error, "seserahan.create_failed", values);
  }
  revalidatePlanning("/seserahan");
  redirect(`/seserahan/${itemId}?notice=created`);
}

export async function updateGiftItemAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const itemId = readString(formData, "itemId");
  const values = readFields(formData, GIFT_FIELDS);
  const parsed = giftItemSchema.safeParse(values);
  if (!parsed.success) return { status: "error", message: INVALID_INPUT, fieldErrors: fieldErrorsFromZod(parsed.error), values };
  try {
    const result = await updateGiftItem(session.user.id, itemId, parsed.data);
    if (!result.ok) return { status: "error", message: INVALID_INPUT, fieldErrors: INVALID_CATEGORY, values };
  } catch (error) {
    return failure(error, "seserahan.update_failed", values);
  }
  revalidatePlanning("/seserahan");
  redirect(`/seserahan/${itemId}?notice=updated`);
}

export async function setGiftItemStatusAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const status = readString(formData, "status");
  if (!(GIFT_ITEM_STATUSES as readonly string[]).includes(status)) return;
  await runVoid("seserahan.status_failed", ["/seserahan", "/dashboard"], () =>
    setGiftItemStatus(session.user.id, readString(formData, "itemId"), status as GiftItemStatusValue),
  );
}

export async function deleteGiftItemAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  await runVoid("seserahan.delete_failed", ["/seserahan", "/dashboard"], async () => {
    const { photoId } = await deleteGiftItem(session.user.id, readString(formData, "itemId"));
    if (photoId) await deleteAssetIfUnused(session.user.id, photoId);
  });
  redirect("/seserahan?notice=deleted");
}

export async function uploadGiftItemPhotoAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { status: "error", message: "Pilih foto terlebih dahulu." };
  if (file.size > IMAGE_MAX_BYTES) return { status: "error", message: IMAGE_REJECTION_MESSAGE.too_large };
  try {
    const limit = await consumeRateLimit(`image-upload:user:${session.user.id}`, RATE_LIMITS.imageUploadPerUser);
    if (!limit.allowed) return { status: "error", message: "Terlalu banyak unggahan dalam waktu singkat. Coba lagi nanti." };
    const uploaded = await uploadImage(session.user.id, readString(formData, "weddingId"), {
      name: file.name,
      type: file.type,
      bytes: Buffer.from(await file.arrayBuffer()),
    });
    if (!uploaded.ok) return { status: "error", message: IMAGE_REJECTION_MESSAGE[uploaded.reason] };
    await setGiftItemPhoto(session.user.id, readString(formData, "itemId"), uploaded.assetId);
  } catch (error) {
    return failure(error, "seserahan.photo_failed");
  }
  revalidatePath("/seserahan", "layout");
  return { status: "success", message: "Foto barang disimpan." };
}

// ─── Rundown ─────────────────────────────────────────────────────────────────

const RUNDOWN_FIELDS = ["title", "itemDate", "startTime", "endTime", "description", "pic", "location", "category", "notes"] as const;

export async function createRundownItemAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const values = readFields(formData, RUNDOWN_FIELDS);
  const parsed = rundownItemSchema.safeParse(values);
  if (!parsed.success) return { status: "error", message: INVALID_INPUT, fieldErrors: fieldErrorsFromZod(parsed.error), values };
  try {
    await createRundownItem(session.user.id, readString(formData, "weddingId"), parsed.data);
  } catch (error) {
    return failure(error, "rundown.create_failed", values);
  }
  revalidatePlanning("/rundown");
  redirect("/rundown?notice=created");
}

export async function updateRundownItemAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const values = readFields(formData, RUNDOWN_FIELDS);
  const parsed = rundownItemSchema.safeParse(values);
  if (!parsed.success) return { status: "error", message: INVALID_INPUT, fieldErrors: fieldErrorsFromZod(parsed.error), values };
  try {
    await updateRundownItem(session.user.id, readString(formData, "itemId"), parsed.data);
  } catch (error) {
    return failure(error, "rundown.update_failed", values);
  }
  revalidatePlanning("/rundown");
  redirect("/rundown?notice=updated");
}

export async function deleteRundownItemAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  await runVoid("rundown.delete_failed", ["/rundown"], () => deleteRundownItem(session.user.id, readString(formData, "itemId")));
  redirect("/rundown?notice=deleted");
}

export async function moveRundownItemAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const direction = readString(formData, "direction") === "up" ? "up" : "down";
  await runVoid("rundown.move_failed", ["/rundown"], () =>
    moveRundownItem(session.user.id, readString(formData, "itemId"), direction),
  );
}

// ─── Calendar ────────────────────────────────────────────────────────────────

const CALENDAR_FIELDS = ["title", "eventDate", "startTime", "endTime", "location", "notes"] as const;

export async function createCalendarEventAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const values = readFields(formData, CALENDAR_FIELDS);
  const parsed = calendarEventSchema.safeParse(values);
  if (!parsed.success) return { status: "error", message: INVALID_INPUT, fieldErrors: fieldErrorsFromZod(parsed.error), values };
  try {
    await createCalendarEvent(session.user.id, readString(formData, "weddingId"), parsed.data);
  } catch (error) {
    return failure(error, "calendar.create_failed", values);
  }
  revalidatePath("/calendar", "layout");
  redirect(`/calendar?month=${parsed.data.eventDate.slice(0, 7)}&notice=created`);
}

export async function updateCalendarEventAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const values = readFields(formData, CALENDAR_FIELDS);
  const parsed = calendarEventSchema.safeParse(values);
  if (!parsed.success) return { status: "error", message: INVALID_INPUT, fieldErrors: fieldErrorsFromZod(parsed.error), values };
  try {
    await updateCalendarEvent(session.user.id, readString(formData, "eventId"), parsed.data);
  } catch (error) {
    return failure(error, "calendar.update_failed", values);
  }
  revalidatePath("/calendar", "layout");
  redirect(`/calendar?month=${parsed.data.eventDate.slice(0, 7)}&notice=updated`);
}

export async function deleteCalendarEventAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  await runVoid("calendar.delete_failed", ["/calendar"], () => deleteCalendarEvent(session.user.id, readString(formData, "eventId")));
  redirect("/calendar?notice=deleted");
}

// ─── Invitation music ────────────────────────────────────────────────────────

export async function uploadInvitationMusicAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const weddingId = readString(formData, "weddingId");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { status: "error", message: "Pilih file musik terlebih dahulu." };
  if (file.size > AUDIO_MAX_BYTES) return { status: "error", message: AUDIO_REJECTION_MESSAGE.too_large };
  try {
    const limit = await consumeRateLimit(`image-upload:user:${session.user.id}`, RATE_LIMITS.imageUploadPerUser);
    if (!limit.allowed) return { status: "error", message: "Terlalu banyak unggahan dalam waktu singkat. Coba lagi nanti." };
    const uploaded = await uploadAudio(session.user.id, weddingId, {
      name: file.name,
      type: file.type,
      bytes: Buffer.from(await file.arrayBuffer()),
    });
    if (!uploaded.ok) return { status: "error", message: AUDIO_REJECTION_MESSAGE[uploaded.reason] };
    await setInvitationMusic(session.user.id, weddingId, uploaded.assetId);
  } catch (error) {
    return failure(error, "invitation.music_upload_failed");
  }
  revalidatePath("/invitation", "layout");
  revalidatePath("/undangan", "layout");
  return { status: "success", message: "Musik latar diunggah dan dinyalakan." };
}

export async function updateInvitationMusicAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const values = { musicVolume: readString(formData, "musicVolume") };
  const parsed = invitationMusicSchema.safeParse({ musicEnabled: formData.get("musicEnabled") === "on", musicVolume: values.musicVolume });
  if (!parsed.success) return { status: "error", message: INVALID_INPUT, fieldErrors: fieldErrorsFromZod(parsed.error), values };
  try {
    const result = await updateInvitationMusic(session.user.id, readString(formData, "weddingId"), parsed.data);
    if (!result.ok) return { status: "error", message: "Unggah file musik dulu sebelum menyalakannya.", values };
  } catch (error) {
    return failure(error, "invitation.music_settings_failed", values);
  }
  revalidatePath("/invitation", "layout");
  revalidatePath("/undangan", "layout");
  return { status: "success", message: "Pengaturan musik disimpan." };
}

export async function removeInvitationMusicAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const assetId = readString(formData, "assetId");
  await runVoid("invitation.music_remove_failed", ["/invitation/music"], async () => {
    await setInvitationMusic(session.user.id, readString(formData, "weddingId"), null);
    if (assetId) await deleteAssetIfUnused(session.user.id, assetId);
  });
}
