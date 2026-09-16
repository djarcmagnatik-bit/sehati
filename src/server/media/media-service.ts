import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { audioRejection, imageRejection, readAudioType, readImageInfo, type AudioRejection, type ImageRejection } from "@/lib/media";
import { requireWeddingMember, WeddingAccessError } from "@/server/authz/wedding-access";
import { weddingHasFeature } from "@/server/billing/access";
import { getDb } from "@/server/db";
import { getMediaStore, MIME_EXTENSION } from "./media-store";

const uuidSchema = z.uuid();
const isUuid = (value: string) => uuidSchema.safeParse(value).success;

export type UploadedImage = { name: string; type: string; bytes: Buffer };

export type UploadResult = { ok: true; assetId: string; reused: boolean } | { ok: false; reason: ImageRejection };

/**
 * Validates the bytes, stores them under a generated key and records the metadata. Re-uploading the
 * same image inside one wedding reuses the existing asset instead of storing it twice.
 */
export async function uploadImage(userId: string, weddingId: string, file: UploadedImage): Promise<UploadResult> {
  const membership = await requireWeddingMember(userId, weddingId);
  const rejection = imageRejection(file.bytes, file.type);
  if (rejection) return { ok: false, reason: rejection };

  const info = readImageInfo(file.bytes);
  if (!info) return { ok: false, reason: "unsupported_type" };

  const db = getDb();
  const checksum = createHash("sha256").update(file.bytes).digest("hex");
  const existing = await db.mediaAsset.findUnique({
    where: { weddingId_checksum: { weddingId: membership.weddingId, checksum } },
    select: { id: true },
  });
  if (existing) return { ok: true, assetId: existing.id, reused: true };

  const assetId = randomUUID();
  const storageKey = `${membership.weddingId}/${assetId}.${MIME_EXTENSION[info.mimeType]}`;
  await getMediaStore().put(storageKey, file.bytes);

  const asset = await db.mediaAsset.create({
    data: {
      id: assetId,
      weddingId: membership.weddingId,
      storageKey,
      fileName: file.name.split(/[\\/]/).pop()?.slice(0, 120) || "gambar",
      mimeType: info.mimeType,
      byteSize: file.bytes.byteLength,
      width: info.width,
      height: info.height,
      checksum,
      createdById: userId,
    },
    select: { id: true },
  });
  return { ok: true, assetId: asset.id, reused: false };
}

export type AudioUploadResult = { ok: true; assetId: string; reused: boolean } | { ok: false; reason: AudioRejection };

/** Same pipeline as images: validate from the bytes, store under a generated key, dedupe per wedding. */
export async function uploadAudio(userId: string, weddingId: string, file: UploadedImage): Promise<AudioUploadResult> {
  const membership = await requireWeddingMember(userId, weddingId);
  const rejection = audioRejection(file.bytes, file.type);
  if (rejection) return { ok: false, reason: rejection };
  const mimeType = readAudioType(file.bytes);
  if (!mimeType) return { ok: false, reason: "unsupported_type" };

  const db = getDb();
  const checksum = createHash("sha256").update(file.bytes).digest("hex");
  const existing = await db.mediaAsset.findUnique({
    where: { weddingId_checksum: { weddingId: membership.weddingId, checksum } },
    select: { id: true, kind: true },
  });
  if (existing?.kind === "AUDIO") return { ok: true, assetId: existing.id, reused: true };
  if (existing) return { ok: false, reason: "unsupported_type" };

  const assetId = randomUUID();
  const storageKey = `${membership.weddingId}/${assetId}.${MIME_EXTENSION[mimeType]}`;
  await getMediaStore().put(storageKey, file.bytes);
  await db.mediaAsset.create({
    data: {
      id: assetId,
      weddingId: membership.weddingId,
      storageKey,
      fileName: file.name.split(/[\\/]/).pop()?.slice(0, 120) || "musik",
      mimeType,
      kind: "AUDIO",
      byteSize: file.bytes.byteLength,
      checksum,
      createdById: userId,
    },
  });
  return { ok: true, assetId, reused: false };
}

export type AssetDelivery = { bytes: Buffer; mimeType: string; byteSize: number; checksum: string };

/**
 * Public delivery rule: an image is served to anyone only while it is part of a published
 * invitation. Otherwise the viewer must be a member of the wedding that owns it.
 */
export async function getAssetForDelivery(assetId: string, viewerUserId: string | null): Promise<AssetDelivery | null> {
  if (!isUuid(assetId)) return null;
  const asset = await getDb().mediaAsset.findUnique({
    where: { id: assetId },
    select: {
      id: true,
      weddingId: true,
      storageKey: true,
      mimeType: true,
      byteSize: true,
      checksum: true,
      wedding: {
        select: {
          members: { select: { userId: true } },
          invitation: { select: { status: true, coverImageId: true, musicAssetId: true, musicEnabled: true } },
        },
      },
    },
  });
  if (!asset) return null;

  const invitation = asset.wedding.invitation;
  let allowed = false;
  if (invitation?.status === "PUBLISHED" && (await weddingHasFeature(asset.weddingId, "invitation"))) {
    if (invitation.coverImageId === asset.id) allowed = true;
    else if (invitation.musicEnabled && invitation.musicAssetId === asset.id) allowed = true;
    else {
      const [inGallery, inStory] = await Promise.all([
        getDb().galleryImage.count({ where: { assetId: asset.id } }),
        getDb().loveStoryEntry.count({ where: { imageId: asset.id } }),
      ]);
      allowed = inGallery > 0 || inStory > 0;
    }
  }
  if (!allowed) {
    allowed = viewerUserId !== null && asset.wedding.members.some((member) => member.userId === viewerUserId);
  }
  if (!allowed) return null;

  const bytes = await getMediaStore().get(asset.storageKey);
  if (!bytes) return null;
  return { bytes, mimeType: asset.mimeType, byteSize: asset.byteSize, checksum: asset.checksum };
}

export async function listWeddingImages(userId: string, weddingId: string) {
  const membership = await requireWeddingMember(userId, weddingId);
  return getDb().mediaAsset.findMany({
    where: { weddingId: membership.weddingId },
    orderBy: { createdAt: "desc" },
    select: { id: true, fileName: true, width: true, height: true, byteSize: true, createdAt: true },
  });
}

/** Deletes the row and the stored bytes, but only when nothing references the asset any more. */
export async function deleteAssetIfUnused(userId: string, assetId: string): Promise<boolean> {
  if (!isUuid(assetId)) throw new WeddingAccessError();
  const db = getDb();
  const asset = await db.mediaAsset.findFirst({
    where: { id: assetId, wedding: { members: { some: { userId } } } },
    select: { id: true, storageKey: true },
  });
  if (!asset) throw new WeddingAccessError();

  const [gallery, story, cover, music, giftItems] = await Promise.all([
    db.galleryImage.count({ where: { assetId: asset.id } }),
    db.loveStoryEntry.count({ where: { imageId: asset.id } }),
    db.invitation.count({ where: { coverImageId: asset.id } }),
    db.invitation.count({ where: { musicAssetId: asset.id } }),
    db.giftItem.count({ where: { photoId: asset.id } }),
  ]);
  if (gallery + story + cover + music + giftItems > 0) return false;

  await db.mediaAsset.delete({ where: { id: asset.id } });
  await getMediaStore().delete(asset.storageKey);
  return true;
}
