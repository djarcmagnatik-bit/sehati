"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { FormState } from "@/lib/form-state";
import { IMPORT_FIELD_LABEL, IMPORT_MAX_BYTES } from "@/lib/guest-import";
import { logger } from "@/lib/logger";
import { safeRedirectPath } from "@/lib/redirect";
import { fieldErrorsFromZod } from "@/lib/validation/errors";
import { bulkInvitationStatusSchema, guestGroupSchema, guestInputSchema } from "@/lib/validation/guests";
import { consumeRateLimit, RATE_LIMITS } from "@/server/auth/rate-limit";
import { requireSession } from "@/server/auth/session-cookie";
import { WeddingAccessError } from "@/server/authz/wedding-access";
import { FeatureLockedError, lockedState, upgradePath } from "@/server/billing/locked";
import {
  commitGuestImport,
  previewGuestImport,
  type CommitImportResult,
  type PreviewImportResult,
} from "@/server/guests/guest-import-service";
import {
  bulkUpdateInvitationStatus,
  createGuest,
  createGuestGroup,
  deleteGuest,
  deleteGuestGroup,
  initializeGuestGroupsIfMissing,
  updateGuest,
  updateGuestGroup,
} from "@/server/guests/guest-service";
import { readString } from "./form-data";

const INVALID_INPUT = "Periksa kembali data yang ditandai.";
const NO_ACCESS = "Data tidak ditemukan atau kamu tidak memiliki akses.";
const GUEST_FIELDS = [
  "guestName",
  "invitationName",
  "groupId",
  "phone",
  "email",
  "address",
  "seatCount",
  "invitationStatus",
  "rsvpStatus",
  "attendingCount",
  "notes",
] as const;

function readFields(formData: FormData, keys: readonly string[]): Record<string, string> {
  return Object.fromEntries(keys.map((key) => [key, readString(formData, key)]));
}

function revalidateGuests() {
  revalidatePath("/guests", "layout");
  revalidatePath("/dashboard");
}

function failure(error: unknown, event: string, values?: Record<string, string>): FormState {
  if (error instanceof FeatureLockedError) return lockedState(error, values);
  if (error instanceof WeddingAccessError) return { status: "error", message: NO_ACCESS, values };
  logger.error(event, { error });
  return { status: "error", message: "Data belum berhasil disimpan. Silakan coba lagi.", values };
}

/** Keeps the user on the same filtered guest list after a bulk action. */
function guestListUrl(returnTo: string, notice: string, count?: number): string {
  const safe = safeRedirectPath(returnTo, "/guests");
  const url = new URL(safe.startsWith("/guests") ? safe : "/guests", "http://internal.invalid");
  url.searchParams.set("notice", notice);
  if (count !== undefined) url.searchParams.set("count", String(count));
  url.searchParams.delete("page");
  return `${url.pathname}${url.search}`;
}

// ─── Guests ──────────────────────────────────────────────────────────────────

export async function createGuestAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const values = readFields(formData, GUEST_FIELDS);
  const parsed = guestInputSchema.safeParse(values);
  if (!parsed.success) return { status: "error", message: INVALID_INPUT, fieldErrors: fieldErrorsFromZod(parsed.error), values };
  try {
    const result = await createGuest(session.user.id, readString(formData, "weddingId"), parsed.data);
    if (!result.ok) return { status: "error", message: INVALID_INPUT, fieldErrors: { groupId: ["Grup tidak tersedia"] }, values };
  } catch (error) {
    return failure(error, "guest.create_failed", values);
  }
  revalidateGuests();
  redirect("/guests?notice=created");
}

export async function updateGuestAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const guestId = readString(formData, "guestId");
  const values = readFields(formData, GUEST_FIELDS);
  const parsed = guestInputSchema.safeParse(values);
  if (!parsed.success) return { status: "error", message: INVALID_INPUT, fieldErrors: fieldErrorsFromZod(parsed.error), values };
  try {
    const result = await updateGuest(session.user.id, guestId, parsed.data);
    if (!result.ok) return { status: "error", message: INVALID_INPUT, fieldErrors: { groupId: ["Grup tidak tersedia"] }, values };
  } catch (error) {
    return failure(error, "guest.update_failed", values);
  }
  revalidateGuests();
  redirect(`/guests/${guestId}?notice=updated`);
}

export async function deleteGuestAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  try {
    await deleteGuest(session.user.id, readString(formData, "guestId"));
  } catch (error) {
    if (error instanceof FeatureLockedError) redirect(upgradePath(error));
    if (error instanceof WeddingAccessError) return;
    throw error;
  }
  revalidateGuests();
  redirect("/guests?notice=deleted");
}

export async function bulkUpdateGuestStatusAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const returnTo = readString(formData, "returnTo");
  const parsed = bulkInvitationStatusSchema.safeParse({
    status: readString(formData, "status"),
    guestIds: formData.getAll("guestIds").filter((value): value is string => typeof value === "string"),
  });
  if (!parsed.success) redirect(guestListUrl(returnTo, "bulk_none"));

  let count = 0;
  try {
    count = await bulkUpdateInvitationStatus(session.user.id, readString(formData, "weddingId"), parsed.data.guestIds, parsed.data.status);
  } catch (error) {
    if (error instanceof FeatureLockedError) redirect(upgradePath(error));
    if (error instanceof WeddingAccessError) return;
    throw error;
  }
  revalidateGuests();
  redirect(guestListUrl(returnTo, "bulk_updated", count));
}

// ─── Groups ──────────────────────────────────────────────────────────────────

const DUPLICATE_GROUP = { name: ["Nama grup sudah dipakai"] };

export async function createGuestGroupAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const values = readFields(formData, ["name"]);
  const parsed = guestGroupSchema.safeParse(values);
  if (!parsed.success) return { status: "error", message: INVALID_INPUT, fieldErrors: fieldErrorsFromZod(parsed.error), values };
  try {
    const result = await createGuestGroup(session.user.id, readString(formData, "weddingId"), parsed.data);
    if (!result.ok) return { status: "error", message: INVALID_INPUT, fieldErrors: DUPLICATE_GROUP, values };
  } catch (error) {
    return failure(error, "guest_group.create_failed", values);
  }
  revalidateGuests();
  return { status: "success", message: `Grup “${parsed.data.name}” ditambahkan.` };
}

export async function updateGuestGroupAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const values = readFields(formData, ["name"]);
  const parsed = guestGroupSchema.safeParse(values);
  if (!parsed.success) return { status: "error", message: INVALID_INPUT, fieldErrors: fieldErrorsFromZod(parsed.error), values };
  try {
    const result = await updateGuestGroup(session.user.id, readString(formData, "groupId"), parsed.data);
    if (!result.ok) return { status: "error", message: INVALID_INPUT, fieldErrors: DUPLICATE_GROUP, values };
  } catch (error) {
    return failure(error, "guest_group.update_failed", values);
  }
  revalidateGuests();
  return { status: "success", message: "Nama grup disimpan." };
}

export async function deleteGuestGroupAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  try {
    await deleteGuestGroup(session.user.id, readString(formData, "groupId"));
  } catch (error) {
    if (error instanceof FeatureLockedError) redirect(upgradePath(error));
    if (error instanceof WeddingAccessError) return;
    throw error;
  }
  revalidateGuests();
  redirect("/guests/groups?notice=deleted");
}

export async function initializeGuestGroupsAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  try {
    await initializeGuestGroupsIfMissing(session.user.id, readString(formData, "weddingId"));
  } catch (error) {
    if (error instanceof FeatureLockedError) redirect(upgradePath(error));
    if (error instanceof WeddingAccessError) return;
    throw error;
  }
  revalidateGuests();
  redirect("/guests?notice=groups_initialized");
}

// ─── Import ──────────────────────────────────────────────────────────────────

function previewErrorMessage(result: Extract<PreviewImportResult, { ok: false }>): string {
  switch (result.reason) {
    case "too_large":
      return "Ukuran file maksimal 900 KB.";
    case "unsupported_type":
      return "Format file harus .csv atau .xlsx.";
    case "invalid_file":
      return "File tidak bisa dibaca. Pastikan file CSV/XLSX yang valid (bukan file yang diganti ekstensinya).";
    case "empty":
      return "File tidak berisi data tamu.";
    case "missing_columns":
      return `Kolom wajib tidak ditemukan: ${result.missing.map((field) => IMPORT_FIELD_LABEL[field]).join(", ")}. Gunakan template yang disediakan.`;
    case "too_many_rows":
      return `Maksimal ${result.max.toLocaleString("id-ID")} baris per impor. Bagi file menjadi beberapa bagian.`;
  }
}

export async function uploadGuestImportAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { status: "error", message: "Pilih file CSV atau XLSX terlebih dahulu." };
  if (file.size > IMPORT_MAX_BYTES) return { status: "error", message: "Ukuran file maksimal 900 KB." };

  let batchId: string;
  try {
    const limit = await consumeRateLimit(`guest-import:user:${session.user.id}`, RATE_LIMITS.guestImportPerUser);
    if (!limit.allowed) return { status: "error", message: "Terlalu banyak impor dalam waktu singkat. Coba lagi nanti." };

    const result = await previewGuestImport(session.user.id, readString(formData, "weddingId"), {
      name: file.name,
      type: file.type,
      bytes: Buffer.from(await file.arrayBuffer()),
    });
    if (!result.ok) return { status: "error", message: previewErrorMessage(result) };
    batchId = result.batchId;
  } catch (error) {
    return failure(error, "guest_import.preview_failed");
  }
  redirect(`/guests/import/${batchId}`);
}

function commitErrorMessage(result: Extract<CommitImportResult, { ok: false }>): string {
  switch (result.reason) {
    case "already_committed":
      return "Impor ini sudah diproses sebelumnya.";
    case "expired":
      return "Pratinjau sudah kedaluwarsa. Unggah ulang file kamu.";
    case "too_many_new_groups":
      return `File berisi terlalu banyak grup baru (maksimal ${result.max}). Samakan nama grup dengan grup yang ada.`;
    case "nothing_to_import":
      return "Tidak ada baris yang bisa diimpor.";
  }
}

export async function commitGuestImportAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  let imported = 0;
  try {
    const result = await commitGuestImport(session.user.id, readString(formData, "batchId"), {
      includeDuplicates: formData.get("includeDuplicates") === "on",
    });
    if (!result.ok) return { status: "error", message: commitErrorMessage(result) };
    imported = result.imported;
  } catch (error) {
    return failure(error, "guest_import.commit_failed");
  }
  revalidateGuests();
  redirect(`/guests?notice=imported&count=${imported}`);
}
