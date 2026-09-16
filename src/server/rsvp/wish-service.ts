import "server-only";
import { z } from "zod";
import { PUBLIC_WISHES_LIMIT, WISHES_PAGE_SIZE, type WishStatusValue } from "@/lib/rsvp";
import type { WishInput } from "@/lib/validation/rsvp";
import { recordActivity } from "@/server/activity/activity-service";
import { memberWeddingWhere, WeddingAccessError } from "@/server/authz/wedding-access";
import { requireWeddingFeature, weddingHasFeature } from "@/server/billing/access";
import { getDb } from "@/server/db";
import { hashIp } from "./rsvp-service";

const uuidSchema = z.uuid();
const isUuid = (value: string) => uuidSchema.safeParse(value).success;
const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,32}$/;

export type PublicWish = { id: string; name: string; message: string; createdAt: Date };

/** Only visible wishes, newest first — the guestbook as the public sees it. */
export async function listPublicWishes(weddingId: string, limit = PUBLIC_WISHES_LIMIT): Promise<PublicWish[]> {
  return getDb().wish.findMany({
    where: { weddingId, status: "VISIBLE" },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { id: true, name: true, message: true, createdAt: true },
  });
}

export type SubmitWishResult = { ok: true; wishId: string } | { ok: false; reason: "not_found" };

/**
 * Accepts a wish from the public invitation. The wedding is resolved from the published invitation
 * slug or a guest token; a caller can never name the wedding directly.
 */
export async function submitWish(
  source: { slug: string } | { token: string },
  input: WishInput,
  options: { ipAddress?: string | null } = {},
): Promise<SubmitWishResult> {
  const db = getDb();
  let weddingId: string | null = null;
  let guestId: string | null = null;

  if ("token" in source) {
    if (!TOKEN_PATTERN.test(source.token)) return { ok: false, reason: "not_found" };
    const guest = await db.guest.findUnique({
      where: { invitationToken: source.token },
      select: { id: true, weddingId: true, wedding: { select: { invitation: { select: { status: true } } } } },
    });
    if (guest && guest.wedding.invitation?.status === "PUBLISHED") {
      weddingId = guest.weddingId;
      guestId = guest.id;
    }
  } else {
    if (!SLUG_PATTERN.test(source.slug) || source.slug.length > 60) return { ok: false, reason: "not_found" };
    const invitation = await db.invitation.findFirst({
      where: { slug: source.slug, status: "PUBLISHED", wedding: { deletedAt: null } },
      select: { weddingId: true },
    });
    weddingId = invitation?.weddingId ?? null;
  }
  if (!weddingId) return { ok: false, reason: "not_found" };
  if (!(await weddingHasFeature(weddingId, "invitation"))) return { ok: false, reason: "not_found" };

  const scopedWeddingId = weddingId;
  return db.$transaction(async (tx) => {
    const wish = await tx.wish.create({
      data: { weddingId: scopedWeddingId, guestId, name: input.name, message: input.message, ipHash: hashIp(options.ipAddress ?? null) },
      select: { id: true },
    });
    await recordActivity(tx, {
      weddingId: scopedWeddingId,
      userId: null,
      actorName: input.name,
      action: "wish.received",
      entityType: "wish",
      entityId: wish.id,
      metadata: { name: input.name },
    });
    return { ok: true, wishId: wish.id } as const;
  });
}

/** Guestbook for a published invitation, addressed by its public slug. */
export async function listPublicWishesBySlug(slug: string, limit = PUBLIC_WISHES_LIMIT): Promise<PublicWish[]> {
  if (!SLUG_PATTERN.test(slug) || slug.length > 60) return [];
  const invitation = await getDb().invitation.findFirst({
    where: { slug, status: "PUBLISHED", wedding: { deletedAt: null } },
    select: { weddingId: true },
  });
  return invitation ? listPublicWishes(invitation.weddingId, limit) : [];
}

export type WishFilter = "all" | WishStatusValue;

/** Moderation list: every wish, including hidden ones, with who sent it. */
export async function listWishesForUser(userId: string, weddingId: string, filter: WishFilter = "all", page = 1) {
  const membership = await requireWeddingFeature("invitation", userId, weddingId);
  const where = { weddingId: membership.weddingId, ...(filter === "all" ? {} : { status: filter }) };
  const db = getDb();
  const [total, items, visible] = await db.$transaction([
    db.wish.count({ where }),
    db.wish.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (Math.max(1, page) - 1) * WISHES_PAGE_SIZE,
      take: WISHES_PAGE_SIZE,
      select: {
        id: true,
        name: true,
        message: true,
        status: true,
        createdAt: true,
        hiddenAt: true,
        guest: { select: { id: true, invitationName: true } },
      },
    }),
    db.wish.count({ where: { weddingId: membership.weddingId, status: "VISIBLE" } }),
  ]);
  return { items, total, visible, page: Math.max(1, page), pageSize: WISHES_PAGE_SIZE };
}

async function findWishScope(userId: string, wishId: string) {
  if (!isUuid(wishId)) throw new WeddingAccessError();
  const wish = await getDb().wish.findFirst({
    where: { id: wishId, wedding: memberWeddingWhere(userId) },
    select: { id: true, weddingId: true, name: true, status: true },
  });
  if (!wish) throw new WeddingAccessError();
  const membership = await requireWeddingFeature("invitation", userId, wish.weddingId);
  return { wish, membership };
}

/** Hiding keeps the wish for the couple but removes it from the public page. */
export async function setWishStatus(userId: string, wishId: string, status: WishStatusValue, now: Date = new Date()): Promise<void> {
  const { wish, membership } = await findWishScope(userId, wishId);
  if (wish.status === status) return;

  await getDb().$transaction(async (tx) => {
    await tx.wish.update({
      where: { id: wish.id },
      data:
        status === "HIDDEN"
          ? { status, hiddenAt: now, hiddenById: userId }
          : { status, hiddenAt: null, hiddenById: null },
    });
    await recordActivity(tx, {
      weddingId: wish.weddingId,
      userId,
      actorName: membership.displayName,
      action: status === "HIDDEN" ? "wish.hidden" : "wish.restored",
      entityType: "wish",
      entityId: wish.id,
      metadata: { name: wish.name },
    });
  });
}

export async function deleteWish(userId: string, wishId: string): Promise<void> {
  const { wish, membership } = await findWishScope(userId, wishId);
  await getDb().$transaction(async (tx) => {
    await tx.wish.delete({ where: { id: wish.id } });
    await recordActivity(tx, {
      weddingId: wish.weddingId,
      userId,
      actorName: membership.displayName,
      action: "wish.deleted",
      entityType: "wish",
      entityId: wish.id,
      metadata: { name: wish.name },
    });
  });
}

export async function countWishes(userId: string, weddingId: string): Promise<{ total: number; hidden: number }> {
  const membership = await requireWeddingFeature("invitation", userId, weddingId);
  const db = getDb();
  const [total, hidden] = await Promise.all([
    db.wish.count({ where: { weddingId: membership.weddingId } }),
    db.wish.count({ where: { weddingId: membership.weddingId, status: "HIDDEN" } }),
  ]);
  return { total, hidden };
}
