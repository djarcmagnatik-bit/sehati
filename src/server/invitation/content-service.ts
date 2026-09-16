import "server-only";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { GALLERY_MAX_IMAGES } from "@/lib/media";
import type { GalleryCaptionInput, GiftAccountInput, GiftAddressInput, LoveStoryEntryInput } from "@/lib/validation/invitation";
import { recordActivity } from "@/server/activity/activity-service";
import { memberWeddingWhere, requireWeddingMember, WeddingAccessError } from "@/server/authz/wedding-access";
import { getDb } from "@/server/db";

type Tx = Prisma.TransactionClient;

const uuidSchema = z.uuid();
const isUuid = (value: string) => uuidSchema.safeParse(value).success;

/** Every content row hangs off the wedding's single invitation; this resolves and authorizes it. */
async function requireInvitationScope(userId: string, weddingId: string) {
  const membership = await requireWeddingMember(userId, weddingId);
  const invitation = await getDb().invitation.findUnique({
    where: { weddingId: membership.weddingId },
    select: { id: true, weddingId: true },
  });
  if (!invitation) throw new WeddingAccessError();
  return { invitation, membership };
}

async function nextSortOrder(tx: Tx, table: "loveStoryEntry" | "galleryImage" | "giftAccount", invitationId: string): Promise<number> {
  const aggregate =
    table === "loveStoryEntry"
      ? await tx.loveStoryEntry.aggregate({ where: { invitationId }, _max: { sortOrder: true } })
      : table === "galleryImage"
        ? await tx.galleryImage.aggregate({ where: { invitationId }, _max: { sortOrder: true } })
        : await tx.giftAccount.aggregate({ where: { invitationId }, _max: { sortOrder: true } });
  return (aggregate._max.sortOrder ?? 0) + 10;
}

// ─── Love story ──────────────────────────────────────────────────────────────

export async function listLoveStoryEntries(userId: string, weddingId: string) {
  const membership = await requireWeddingMember(userId, weddingId);
  return getDb().loveStoryEntry.findMany({
    where: { weddingId: membership.weddingId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true, title: true, timeLabel: true, story: true, sortOrder: true },
  });
}

export async function getLoveStoryEntryForUser(userId: string, entryId: string) {
  if (!isUuid(entryId)) return null;
  return getDb().loveStoryEntry.findFirst({
    where: { id: entryId, wedding: memberWeddingWhere(userId) },
    select: { id: true, weddingId: true, title: true, timeLabel: true, story: true },
  });
}

export async function createLoveStoryEntry(userId: string, weddingId: string, input: LoveStoryEntryInput): Promise<string> {
  const { invitation, membership } = await requireInvitationScope(userId, weddingId);
  return getDb().$transaction(async (tx) => {
    const entry = await tx.loveStoryEntry.create({
      data: {
        ...input,
        invitationId: invitation.id,
        weddingId: invitation.weddingId,
        sortOrder: await nextSortOrder(tx, "loveStoryEntry", invitation.id),
      },
      select: { id: true },
    });
    await recordActivity(tx, {
      weddingId: invitation.weddingId,
      userId,
      actorName: membership.displayName,
      action: "love_story.created",
      entityType: "love_story",
      entityId: entry.id,
      metadata: { title: input.title },
    });
    return entry.id;
  });
}

async function findEntryScope(userId: string, entryId: string) {
  if (!isUuid(entryId)) throw new WeddingAccessError();
  const entry = await getDb().loveStoryEntry.findFirst({
    where: { id: entryId, wedding: memberWeddingWhere(userId) },
    select: { id: true, weddingId: true, title: true },
  });
  if (!entry) throw new WeddingAccessError();
  const membership = await requireWeddingMember(userId, entry.weddingId);
  return { entry, membership };
}

export async function updateLoveStoryEntry(userId: string, entryId: string, input: LoveStoryEntryInput): Promise<void> {
  const { entry, membership } = await findEntryScope(userId, entryId);
  await getDb().$transaction(async (tx) => {
    await tx.loveStoryEntry.update({ where: { id: entry.id }, data: input });
    await recordActivity(tx, {
      weddingId: entry.weddingId,
      userId,
      actorName: membership.displayName,
      action: "love_story.updated",
      entityType: "love_story",
      entityId: entry.id,
      metadata: { title: input.title },
    });
  });
}

export async function deleteLoveStoryEntry(userId: string, entryId: string): Promise<void> {
  const { entry, membership } = await findEntryScope(userId, entryId);
  await getDb().$transaction(async (tx) => {
    await tx.loveStoryEntry.delete({ where: { id: entry.id } });
    await recordActivity(tx, {
      weddingId: entry.weddingId,
      userId,
      actorName: membership.displayName,
      action: "love_story.deleted",
      entityType: "love_story",
      entityId: entry.id,
      metadata: { title: entry.title },
    });
  });
}

// ─── Gallery ─────────────────────────────────────────────────────────────────

export async function listGalleryImages(userId: string, weddingId: string) {
  const membership = await requireWeddingMember(userId, weddingId);
  return getDb().galleryImage.findMany({
    where: { weddingId: membership.weddingId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      caption: true,
      sortOrder: true,
      asset: { select: { id: true, width: true, height: true, fileName: true, byteSize: true } },
    },
  });
}

export type AddGalleryImageResult = { ok: true; imageId: string } | { ok: false; reason: "limit_reached" | "duplicate" };

/** The asset must already belong to this wedding (uploaded through the media service). */
export async function addGalleryImage(
  userId: string,
  weddingId: string,
  assetId: string,
  caption: string | null = null,
): Promise<AddGalleryImageResult> {
  const { invitation, membership } = await requireInvitationScope(userId, weddingId);
  const db = getDb();
  const asset = await db.mediaAsset.findFirst({ where: { id: assetId, weddingId: invitation.weddingId }, select: { id: true } });
  if (!asset) throw new WeddingAccessError();

  const count = await db.galleryImage.count({ where: { invitationId: invitation.id } });
  if (count >= GALLERY_MAX_IMAGES) return { ok: false, reason: "limit_reached" };

  try {
    return await db.$transaction(async (tx) => {
      const image = await tx.galleryImage.create({
        data: {
          invitationId: invitation.id,
          weddingId: invitation.weddingId,
          assetId,
          caption,
          sortOrder: await nextSortOrder(tx, "galleryImage", invitation.id),
        },
        select: { id: true },
      });
      await recordActivity(tx, {
        weddingId: invitation.weddingId,
        userId,
        actorName: membership.displayName,
        action: "gallery.image_added",
        entityType: "gallery",
        entityId: image.id,
      });
      return { ok: true, imageId: image.id } as const;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return { ok: false, reason: "duplicate" };
    throw error;
  }
}

async function findGalleryScope(userId: string, imageId: string) {
  if (!isUuid(imageId)) throw new WeddingAccessError();
  const image = await getDb().galleryImage.findFirst({
    where: { id: imageId, wedding: memberWeddingWhere(userId) },
    select: { id: true, weddingId: true, assetId: true },
  });
  if (!image) throw new WeddingAccessError();
  const membership = await requireWeddingMember(userId, image.weddingId);
  return { image, membership };
}

export async function updateGalleryCaption(userId: string, imageId: string, input: GalleryCaptionInput): Promise<void> {
  const { image } = await findGalleryScope(userId, imageId);
  await getDb().galleryImage.update({ where: { id: image.id }, data: { caption: input.caption } });
}

export async function removeGalleryImage(userId: string, imageId: string): Promise<{ assetId: string }> {
  const { image, membership } = await findGalleryScope(userId, imageId);
  await getDb().$transaction(async (tx) => {
    await tx.galleryImage.delete({ where: { id: image.id } });
    await recordActivity(tx, {
      weddingId: image.weddingId,
      userId,
      actorName: membership.displayName,
      action: "gallery.image_removed",
      entityType: "gallery",
      entityId: image.id,
    });
  });
  return { assetId: image.assetId };
}

export async function moveGalleryImage(userId: string, imageId: string, direction: "up" | "down"): Promise<void> {
  const { image } = await findGalleryScope(userId, imageId);
  const db = getDb();
  const images = await db.galleryImage.findMany({
    where: { weddingId: image.weddingId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true },
  });
  const index = images.findIndex((row) => row.id === image.id);
  const target = direction === "up" ? index - 1 : index + 1;
  if (index === -1 || target < 0 || target >= images.length) return;

  const reordered = [...images];
  const [moved] = reordered.splice(index, 1);
  reordered.splice(target, 0, moved!);
  await db.$transaction(
    reordered.map((row, position) => db.galleryImage.update({ where: { id: row.id }, data: { sortOrder: (position + 1) * 10 } })),
  );
}

// ─── Gift information ────────────────────────────────────────────────────────

export async function listGiftAccounts(userId: string, weddingId: string) {
  const membership = await requireWeddingMember(userId, weddingId);
  return getDb().giftAccount.findMany({
    where: { weddingId: membership.weddingId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true, type: true, providerName: true, accountNumber: true, accountHolder: true, notes: true },
  });
}

export async function getGiftAccountForUser(userId: string, accountId: string) {
  if (!isUuid(accountId)) return null;
  return getDb().giftAccount.findFirst({
    where: { id: accountId, wedding: memberWeddingWhere(userId) },
    select: { id: true, weddingId: true, type: true, providerName: true, accountNumber: true, accountHolder: true, notes: true },
  });
}

export async function createGiftAccount(userId: string, weddingId: string, input: GiftAccountInput): Promise<string> {
  const { invitation, membership } = await requireInvitationScope(userId, weddingId);
  return getDb().$transaction(async (tx) => {
    const account = await tx.giftAccount.create({
      data: {
        ...input,
        invitationId: invitation.id,
        weddingId: invitation.weddingId,
        sortOrder: await nextSortOrder(tx, "giftAccount", invitation.id),
      },
      select: { id: true },
    });
    await recordActivity(tx, {
      weddingId: invitation.weddingId,
      userId,
      actorName: membership.displayName,
      action: "gift_account.created",
      entityType: "gift_account",
      entityId: account.id,
      metadata: { name: input.providerName },
    });
    return account.id;
  });
}

async function findGiftScope(userId: string, accountId: string) {
  if (!isUuid(accountId)) throw new WeddingAccessError();
  const account = await getDb().giftAccount.findFirst({
    where: { id: accountId, wedding: memberWeddingWhere(userId) },
    select: { id: true, weddingId: true, providerName: true },
  });
  if (!account) throw new WeddingAccessError();
  const membership = await requireWeddingMember(userId, account.weddingId);
  return { account, membership };
}

export async function updateGiftAccount(userId: string, accountId: string, input: GiftAccountInput): Promise<void> {
  const { account, membership } = await findGiftScope(userId, accountId);
  await getDb().$transaction(async (tx) => {
    await tx.giftAccount.update({ where: { id: account.id }, data: input });
    await recordActivity(tx, {
      weddingId: account.weddingId,
      userId,
      actorName: membership.displayName,
      action: "gift_account.updated",
      entityType: "gift_account",
      entityId: account.id,
      metadata: { name: input.providerName },
    });
  });
}

export async function deleteGiftAccount(userId: string, accountId: string): Promise<void> {
  const { account, membership } = await findGiftScope(userId, accountId);
  await getDb().$transaction(async (tx) => {
    await tx.giftAccount.delete({ where: { id: account.id } });
    await recordActivity(tx, {
      weddingId: account.weddingId,
      userId,
      actorName: membership.displayName,
      action: "gift_account.deleted",
      entityType: "gift_account",
      entityId: account.id,
      metadata: { name: account.providerName },
    });
  });
}

export async function updateGiftAddress(userId: string, weddingId: string, input: GiftAddressInput): Promise<void> {
  const { invitation } = await requireInvitationScope(userId, weddingId);
  await getDb().invitation.update({ where: { id: invitation.id }, data: { giftAddress: input.giftAddress } });
}
