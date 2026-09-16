import "server-only";
import { z } from "zod";
import { isGiftItemDone, type GiftItemStatusValue } from "@/lib/planning";
import type { GiftItemInput } from "@/lib/validation/planning";
import { recordActivity } from "@/server/activity/activity-service";
import { memberWeddingWhere, requireWeddingMember, WeddingAccessError } from "@/server/authz/wedding-access";
import { getDb } from "@/server/db";

const uuidSchema = z.uuid();
const isUuid = (value: string) => uuidSchema.safeParse(value).success;

export function getGiftCategoryOptions(includeCategoryId?: string) {
  return getDb().giftCategory.findMany({
    where: includeCategoryId ? { OR: [{ isActive: true }, { id: includeCategoryId }] } : { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true },
  });
}

async function categoryUsable(categoryId: string, currentCategoryId?: string): Promise<boolean> {
  const category = await getDb().giftCategory.findFirst({
    where: { id: categoryId, ...(categoryId === currentCategoryId ? {} : { isActive: true }) },
    select: { id: true },
  });
  return category !== null;
}

export async function listGiftItems(userId: string, weddingId: string, status: GiftItemStatusValue | "all" = "all") {
  const membership = await requireWeddingMember(userId, weddingId);
  return getDb().giftItem.findMany({
    where: { weddingId: membership.weddingId, ...(status === "all" ? {} : { status }) },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      name: true,
      quantity: true,
      estimatedPrice: true,
      actualPrice: true,
      responsible: true,
      status: true,
      notes: true,
      photoId: true,
      category: { select: { id: true, name: true } },
    },
  });
}

export async function getGiftItemForUser(userId: string, itemId: string) {
  if (!isUuid(itemId)) return null;
  return getDb().giftItem.findFirst({
    where: { id: itemId, wedding: memberWeddingWhere(userId) },
    select: {
      id: true,
      weddingId: true,
      categoryId: true,
      name: true,
      quantity: true,
      estimatedPrice: true,
      actualPrice: true,
      responsible: true,
      status: true,
      notes: true,
      photoId: true,
    },
  });
}

export type SeserahanSummary = {
  items: number;
  pieces: number;
  estimated: bigint;
  actual: bigint;
  done: number;
  byStatus: Record<GiftItemStatusValue, number>;
};

/** Totals for the seserahan page: estimated vs actual money, and how many items are ready. */
export async function getSeserahanSummary(userId: string, weddingId: string): Promise<SeserahanSummary> {
  const membership = await requireWeddingMember(userId, weddingId);
  const rows = await getDb().giftItem.groupBy({
    by: ["status"],
    where: { weddingId: membership.weddingId },
    _count: { _all: true },
    _sum: { estimatedPrice: true, actualPrice: true, quantity: true },
  });

  const byStatus: Record<GiftItemStatusValue, number> = { PLANNED: 0, PURCHASED: 0, PACKED: 0, READY: 0 };
  let items = 0;
  let pieces = 0;
  let estimated = 0n;
  let actual = 0n;
  let done = 0;
  for (const row of rows) {
    const status = row.status as GiftItemStatusValue;
    byStatus[status] = row._count._all;
    items += row._count._all;
    pieces += row._sum.quantity ?? 0;
    estimated += row._sum.estimatedPrice ?? 0n;
    actual += row._sum.actualPrice ?? 0n;
    if (isGiftItemDone(status)) done += row._count._all;
  }
  return { items, pieces, estimated, actual, done, byStatus };
}

export type GiftItemResult = { ok: true; itemId: string } | { ok: false; reason: "invalid_category" };

function itemData(input: GiftItemInput) {
  return {
    name: input.name,
    categoryId: input.categoryId,
    quantity: input.quantity,
    estimatedPrice: input.estimatedPrice,
    actualPrice: input.actualPrice,
    responsible: input.responsible,
    status: input.status,
    notes: input.notes,
  };
}

export async function createGiftItem(userId: string, weddingId: string, input: GiftItemInput): Promise<GiftItemResult> {
  const membership = await requireWeddingMember(userId, weddingId);
  if (input.categoryId && !(await categoryUsable(input.categoryId))) return { ok: false, reason: "invalid_category" };

  return getDb().$transaction(async (tx) => {
    const last = await tx.giftItem.aggregate({ where: { weddingId: membership.weddingId }, _max: { sortOrder: true } });
    const item = await tx.giftItem.create({
      data: { ...itemData(input), weddingId: membership.weddingId, sortOrder: (last._max.sortOrder ?? 0) + 10, createdById: userId },
      select: { id: true },
    });
    await recordActivity(tx, {
      weddingId: membership.weddingId,
      userId,
      actorName: membership.displayName,
      action: "seserahan.item_created",
      entityType: "gift_item",
      entityId: item.id,
      metadata: { name: input.name, count: input.quantity },
    });
    return { ok: true, itemId: item.id } as const;
  });
}

async function findItemScope(userId: string, itemId: string) {
  if (!isUuid(itemId)) throw new WeddingAccessError();
  const item = await getDb().giftItem.findFirst({
    where: { id: itemId, wedding: memberWeddingWhere(userId) },
    select: { id: true, weddingId: true, name: true, categoryId: true, status: true, photoId: true },
  });
  if (!item) throw new WeddingAccessError();
  const membership = await requireWeddingMember(userId, item.weddingId);
  return { item, membership };
}

export async function updateGiftItem(userId: string, itemId: string, input: GiftItemInput): Promise<GiftItemResult> {
  const { item, membership } = await findItemScope(userId, itemId);
  if (input.categoryId && !(await categoryUsable(input.categoryId, item.categoryId ?? undefined))) {
    return { ok: false, reason: "invalid_category" };
  }

  await getDb().$transaction(async (tx) => {
    await tx.giftItem.update({ where: { id: item.id }, data: itemData(input) });
    await recordActivity(tx, {
      weddingId: item.weddingId,
      userId,
      actorName: membership.displayName,
      action: "seserahan.item_updated",
      entityType: "gift_item",
      entityId: item.id,
      metadata: { name: input.name, status: input.status },
    });
  });
  return { ok: true, itemId: item.id };
}

/** Quick status change from the list, without opening the item. */
export async function setGiftItemStatus(userId: string, itemId: string, status: GiftItemStatusValue): Promise<void> {
  const { item, membership } = await findItemScope(userId, itemId);
  if (item.status === status) return;
  await getDb().$transaction(async (tx) => {
    await tx.giftItem.update({ where: { id: item.id }, data: { status } });
    await recordActivity(tx, {
      weddingId: item.weddingId,
      userId,
      actorName: membership.displayName,
      action: "seserahan.item_updated",
      entityType: "gift_item",
      entityId: item.id,
      metadata: { name: item.name, status },
    });
  });
}

export async function deleteGiftItem(userId: string, itemId: string): Promise<{ photoId: string | null }> {
  const { item, membership } = await findItemScope(userId, itemId);
  await getDb().$transaction(async (tx) => {
    await tx.giftItem.delete({ where: { id: item.id } });
    await recordActivity(tx, {
      weddingId: item.weddingId,
      userId,
      actorName: membership.displayName,
      action: "seserahan.item_deleted",
      entityType: "gift_item",
      entityId: item.id,
      metadata: { name: item.name },
    });
  });
  return { photoId: item.photoId };
}

/** Attaches an already-uploaded image from the same wedding. */
export async function setGiftItemPhoto(userId: string, itemId: string, assetId: string | null): Promise<void> {
  const { item } = await findItemScope(userId, itemId);
  if (assetId) {
    const asset = await getDb().mediaAsset.findFirst({
      where: { id: assetId, weddingId: item.weddingId, kind: "IMAGE" },
      select: { id: true },
    });
    if (!asset) throw new WeddingAccessError();
  }
  await getDb().giftItem.update({ where: { id: item.id }, data: { photoId: assetId } });
}
