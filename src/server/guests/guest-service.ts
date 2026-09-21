import "server-only";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { GUEST_PAGE_SIZE, type GuestFilters, type GuestSort } from "@/lib/guest-filters";
import { nextInvitationStatus, normalizePhone, type EditableInvitationStatus } from "@/lib/guests";
import type { GuestGroupInput, GuestInput } from "@/lib/validation/guests";
import { recordActivity } from "@/server/activity/activity-service";
import { memberWeddingWhere, WeddingAccessError } from "@/server/authz/wedding-access";
import { requireWeddingFeature } from "@/server/billing/access";
import { getDb } from "@/server/db";

type Tx = Prisma.TransactionClient;

const uuidSchema = z.uuid();
const isUuid = (value: string) => uuidSchema.safeParse(value).success;

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/** 128-bit URL-safe token for the personalized invitation link. Never derived from ids. */
export function generateInvitationToken(): string {
  return randomBytes(16).toString("base64url");
}

// ─── Groups ──────────────────────────────────────────────────────────────────

export async function createGuestGroupsFromTemplates(tx: Tx, weddingId: string): Promise<number> {
  const templates = await tx.guestGroupTemplate.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { name: true, sortOrder: true },
  });
  if (templates.length === 0) return 0;
  const result = await tx.guestGroup.createMany({
    data: templates.map((template) => ({ weddingId, name: template.name, sortOrder: template.sortOrder })),
    skipDuplicates: true,
  });
  return result.count;
}

/** For workspaces created before guest groups existed. Runs at most once per wedding. */
export async function initializeGuestGroupsIfMissing(
  userId: string,
  weddingId: string,
  now: Date = new Date(),
): Promise<{ ok: true; created: number } | { ok: false; reason: "already_initialized" }> {
  const membership = await requireWeddingFeature("guests", userId, weddingId);
  return getDb().$transaction(async (tx) => {
    const claimed = await tx.wedding.updateMany({
      where: { id: membership.weddingId, guestGroupsInitializedAt: null, deletedAt: null },
      data: { guestGroupsInitializedAt: now },
    });
    if (claimed.count === 0) return { ok: false, reason: "already_initialized" } as const;
    const created = await createGuestGroupsFromTemplates(tx, membership.weddingId);
    await recordActivity(tx, {
      weddingId: membership.weddingId,
      userId,
      actorName: membership.displayName,
      action: "guests.groups_initialized",
      entityType: "guest_group",
      metadata: { count: created },
    });
    return { ok: true, created } as const;
  });
}

export async function getGuestGroupOptions(userId: string, weddingId: string) {
  const membership = await requireWeddingFeature("guests", userId, weddingId);
  return getDb().guestGroup.findMany({
    where: { weddingId: membership.weddingId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true },
  });
}

export async function listGuestGroupsWithCounts(userId: string, weddingId: string) {
  const membership = await requireWeddingFeature("guests", userId, weddingId);
  const db = getDb();
  const [groups, counts] = await Promise.all([
    db.guestGroup.findMany({
      where: { weddingId: membership.weddingId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
    db.guest.groupBy({
      by: ["groupId"],
      where: { weddingId: membership.weddingId },
      _count: { _all: true, seatCount: true },
      _sum: { seatCount: true },
    }),
  ]);
  // Estimated seats: an invitation without a seat count (not counted by _count.seatCount) is one person.
  const byGroup = new Map(
    counts.map((row) => [
      row.groupId,
      { invitations: row._count._all, seats: (row._sum.seatCount ?? 0) + (row._count._all - row._count.seatCount) },
    ]),
  );
  return {
    groups: groups.map((group) => ({ ...group, ...(byGroup.get(group.id) ?? { invitations: 0, seats: 0 }) })),
    ungrouped: byGroup.get(null) ?? { invitations: 0, seats: 0 },
  };
}

async function groupNameTaken(tx: Tx, weddingId: string, name: string, excludeId?: string): Promise<boolean> {
  const existing = await tx.guestGroup.findFirst({
    where: { weddingId, name: { equals: name, mode: "insensitive" }, ...(excludeId ? { NOT: { id: excludeId } } : {}) },
    select: { id: true },
  });
  return existing !== null;
}

export type GuestGroupResult = { ok: true; groupId: string } | { ok: false; reason: "duplicate_name" };

export async function createGuestGroup(userId: string, weddingId: string, input: GuestGroupInput): Promise<GuestGroupResult> {
  const membership = await requireWeddingFeature("guests", userId, weddingId);
  try {
    return await getDb().$transaction(async (tx) => {
      if (await groupNameTaken(tx, membership.weddingId, input.name)) return { ok: false, reason: "duplicate_name" } as const;
      const last = await tx.guestGroup.aggregate({ where: { weddingId: membership.weddingId }, _max: { sortOrder: true } });
      const group = await tx.guestGroup.create({
        data: { weddingId: membership.weddingId, name: input.name, sortOrder: (last._max.sortOrder ?? 0) + 10 },
        select: { id: true },
      });
      await recordActivity(tx, {
        weddingId: membership.weddingId,
        userId,
        actorName: membership.displayName,
        action: "guest_group.created",
        entityType: "guest_group",
        entityId: group.id,
        metadata: { name: input.name },
      });
      return { ok: true, groupId: group.id } as const;
    });
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, reason: "duplicate_name" };
    throw error;
  }
}

async function findGroupScope(userId: string, groupId: string) {
  if (!isUuid(groupId)) throw new WeddingAccessError();
  const group = await getDb().guestGroup.findFirst({
    where: { id: groupId, wedding: memberWeddingWhere(userId) },
    select: { id: true, weddingId: true, name: true },
  });
  if (!group) throw new WeddingAccessError();
  const membership = await requireWeddingFeature("guests", userId, group.weddingId);
  return { group, membership };
}

export async function updateGuestGroup(userId: string, groupId: string, input: GuestGroupInput): Promise<GuestGroupResult> {
  const { group, membership } = await findGroupScope(userId, groupId);
  try {
    return await getDb().$transaction(async (tx) => {
      if (await groupNameTaken(tx, group.weddingId, input.name, group.id)) return { ok: false, reason: "duplicate_name" } as const;
      await tx.guestGroup.update({ where: { id: group.id }, data: { name: input.name } });
      await recordActivity(tx, {
        weddingId: group.weddingId,
        userId,
        actorName: membership.displayName,
        action: "guest_group.updated",
        entityType: "guest_group",
        entityId: group.id,
        metadata: { name: input.name },
      });
      return { ok: true, groupId: group.id } as const;
    });
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, reason: "duplicate_name" };
    throw error;
  }
}

/** Guests in a deleted group are kept and become ungrouped. */
export async function deleteGuestGroup(userId: string, groupId: string): Promise<{ ungrouped: number }> {
  const { group, membership } = await findGroupScope(userId, groupId);
  return getDb().$transaction(async (tx) => {
    const { count } = await tx.guest.updateMany({ where: { groupId: group.id, weddingId: group.weddingId }, data: { groupId: null } });
    await tx.guestGroup.delete({ where: { id: group.id } });
    await recordActivity(tx, {
      weddingId: group.weddingId,
      userId,
      actorName: membership.displayName,
      action: "guest_group.deleted",
      entityType: "guest_group",
      entityId: group.id,
      metadata: { name: group.name, count },
    });
    return { ungrouped: count };
  });
}

async function groupInWedding(groupId: string, weddingId: string): Promise<boolean> {
  const group = await getDb().guestGroup.findFirst({ where: { id: groupId, weddingId }, select: { id: true } });
  return group !== null;
}

// ─── Summary & listing ───────────────────────────────────────────────────────

export type GuestSummary = {
  invitations: number;
  /** Estimated people: an invitation without a seat count counts as one (see `unsetSeatInvitations`). */
  seats: number;
  /** Invitations whose seat count was left empty. */
  unsetSeatInvitations: number;
  invitedInvitations: number;
  invitedSeats: number;
  attendingInvitations: number;
  attendingSeats: number;
  maybeInvitations: number;
  declinedInvitations: number;
  pendingInvitations: number;
  pendingSeats: number;
};

/**
 * Invitations (rows) and seats (people) are always counted separately. One aggregate query. Seat
 * totals are estimates: an invitation without a seat count counts as one person.
 */
export async function getGuestSummary(userId: string, weddingId: string): Promise<GuestSummary> {
  const membership = await requireWeddingFeature("guests", userId, weddingId);
  const rows = await getDb().$queryRaw<Array<Record<keyof GuestSummary, number>>>`
    SELECT
      COUNT(*)::int AS "invitations",
      COALESCE(SUM(COALESCE(seat_count, 1)), 0)::int AS "seats",
      COUNT(*) FILTER (WHERE seat_count IS NULL)::int AS "unsetSeatInvitations",
      COUNT(*) FILTER (WHERE invitation_status <> 'NOT_SENT')::int AS "invitedInvitations",
      COALESCE(SUM(COALESCE(seat_count, 1)) FILTER (WHERE invitation_status <> 'NOT_SENT'), 0)::int AS "invitedSeats",
      COUNT(*) FILTER (WHERE rsvp_status = 'ATTENDING')::int AS "attendingInvitations",
      COALESCE(SUM(attending_count) FILTER (WHERE rsvp_status = 'ATTENDING'), 0)::int AS "attendingSeats",
      COUNT(*) FILTER (WHERE rsvp_status = 'MAYBE')::int AS "maybeInvitations",
      COUNT(*) FILTER (WHERE rsvp_status = 'DECLINED')::int AS "declinedInvitations",
      COUNT(*) FILTER (WHERE rsvp_status = 'PENDING')::int AS "pendingInvitations",
      COALESCE(SUM(COALESCE(seat_count, 1)) FILTER (WHERE rsvp_status = 'PENDING'), 0)::int AS "pendingSeats"
    FROM guests
    WHERE wedding_id = ${membership.weddingId}::uuid
  `;
  const row = rows[0];
  return {
    invitations: row?.invitations ?? 0,
    seats: row?.seats ?? 0,
    unsetSeatInvitations: row?.unsetSeatInvitations ?? 0,
    invitedInvitations: row?.invitedInvitations ?? 0,
    invitedSeats: row?.invitedSeats ?? 0,
    attendingInvitations: row?.attendingInvitations ?? 0,
    attendingSeats: row?.attendingSeats ?? 0,
    maybeInvitations: row?.maybeInvitations ?? 0,
    declinedInvitations: row?.declinedInvitations ?? 0,
    pendingInvitations: row?.pendingInvitations ?? 0,
    pendingSeats: row?.pendingSeats ?? 0,
  };
}

const GUEST_ORDER: Record<GuestSort, Prisma.GuestOrderByWithRelationInput[]> = {
  name: [{ invitationName: "asc" }, { id: "asc" }],
  group: [{ group: { sortOrder: "asc" } }, { invitationName: "asc" }, { id: "asc" }],
  recent: [{ createdAt: "desc" }, { id: "asc" }],
  seats: [{ seatCount: { sort: "desc", nulls: "last" } }, { invitationName: "asc" }, { id: "asc" }],
};

export async function listGuests(userId: string, weddingId: string, filters: GuestFilters) {
  const membership = await requireWeddingFeature("guests", userId, weddingId);
  const where: Prisma.GuestWhereInput = { weddingId: membership.weddingId };
  if (filters.rsvp !== "all") where.rsvpStatus = filters.rsvp;
  if (filters.invitation !== "all") where.invitationStatus = filters.invitation;
  if (filters.group === "none") where.groupId = null;
  else if (filters.group) where.groupId = filters.group;
  if (filters.q) {
    const digits = filters.q.replace(/\D/g, "").replace(/^0/, "");
    where.OR = [
      { invitationName: { contains: filters.q, mode: "insensitive" } },
      { guestName: { contains: filters.q, mode: "insensitive" } },
      ...(digits.length >= 4 ? [{ phoneNormalized: { contains: digits } }] : []),
    ];
  }

  const db = getDb();
  const [total, items] = await db.$transaction([
    db.guest.count({ where }),
    db.guest.findMany({
      where,
      orderBy: GUEST_ORDER[filters.sort],
      skip: (filters.page - 1) * GUEST_PAGE_SIZE,
      take: GUEST_PAGE_SIZE,
      select: {
        id: true,
        guestName: true,
        invitationName: true,
        phone: true,
        seatCount: true,
        invitationStatus: true,
        rsvpStatus: true,
        attendingCount: true,
        group: { select: { id: true, name: true } },
      },
    }),
  ]);
  return { items, total, page: filters.page, pageSize: GUEST_PAGE_SIZE };
}

export async function getGuestForUser(userId: string, guestId: string) {
  if (!isUuid(guestId)) return null;
  return getDb().guest.findFirst({
    where: { id: guestId, wedding: memberWeddingWhere(userId) },
    select: {
      id: true,
      weddingId: true,
      groupId: true,
      guestName: true,
      invitationName: true,
      phone: true,
      email: true,
      address: true,
      seatCount: true,
      invitationStatus: true,
      rsvpStatus: true,
      attendingCount: true,
      notes: true,
      invitationToken: true,
      invitationOpenedAt: true,
      createdAt: true,
      updatedAt: true,
      group: { select: { name: true } },
      createdBy: { select: { name: true } },
    },
  });
}

// ─── Mutations ───────────────────────────────────────────────────────────────

export type GuestMutationResult = { ok: true; guestId: string } | { ok: false; reason: "invalid_group" };

function guestData(input: GuestInput) {
  return {
    groupId: input.groupId,
    guestName: input.guestName,
    invitationName: input.invitationName,
    phone: input.phone,
    phoneNormalized: normalizePhone(input.phone),
    email: input.email,
    address: input.address,
    seatCount: input.seatCount,
    rsvpStatus: input.rsvpStatus,
    attendingCount: input.attendingCount,
    notes: input.notes,
  };
}

export async function createGuest(userId: string, weddingId: string, input: GuestInput): Promise<GuestMutationResult> {
  const membership = await requireWeddingFeature("guests", userId, weddingId);
  if (input.groupId && !(await groupInWedding(input.groupId, membership.weddingId))) return { ok: false, reason: "invalid_group" };

  return getDb().$transaction(async (tx) => {
    const guest = await tx.guest.create({
      data: {
        ...guestData(input),
        weddingId: membership.weddingId,
        invitationStatus: input.invitationStatus,
        invitationToken: generateInvitationToken(),
        createdById: userId,
      },
      select: { id: true },
    });
    await recordActivity(tx, {
      weddingId: membership.weddingId,
      userId,
      actorName: membership.displayName,
      action: "guest.created",
      entityType: "guest",
      entityId: guest.id,
      metadata: { name: input.invitationName, seats: input.seatCount },
    });
    return { ok: true, guestId: guest.id } as const;
  });
}

async function findGuestScope(userId: string, guestId: string) {
  if (!isUuid(guestId)) throw new WeddingAccessError();
  const guest = await getDb().guest.findFirst({
    where: { id: guestId, wedding: memberWeddingWhere(userId) },
    select: { id: true, weddingId: true, invitationName: true, invitationStatus: true },
  });
  if (!guest) throw new WeddingAccessError();
  const membership = await requireWeddingFeature("guests", userId, guest.weddingId);
  return { guest, membership };
}

export async function updateGuest(userId: string, guestId: string, input: GuestInput): Promise<GuestMutationResult> {
  const { guest, membership } = await findGuestScope(userId, guestId);
  if (input.groupId && !(await groupInWedding(input.groupId, guest.weddingId))) return { ok: false, reason: "invalid_group" };

  await getDb().$transaction(async (tx) => {
    await tx.guest.update({
      where: { id: guest.id },
      data: { ...guestData(input), invitationStatus: nextInvitationStatus(guest.invitationStatus, input.invitationStatus) },
    });
    await recordActivity(tx, {
      weddingId: guest.weddingId,
      userId,
      actorName: membership.displayName,
      action: "guest.updated",
      entityType: "guest",
      entityId: guest.id,
      metadata: { name: input.invitationName, seats: input.seatCount },
    });
  });
  return { ok: true, guestId: guest.id };
}

export async function deleteGuest(userId: string, guestId: string): Promise<void> {
  const { guest, membership } = await findGuestScope(userId, guestId);
  await getDb().$transaction(async (tx) => {
    // Wishes are public content and stay; only the link to the guest is removed.
    await tx.wish.updateMany({ where: { guestId: guest.id }, data: { guestId: null } });
    await tx.guest.delete({ where: { id: guest.id } });
    await recordActivity(tx, {
      weddingId: guest.weddingId,
      userId,
      actorName: membership.displayName,
      action: "guest.deleted",
      entityType: "guest",
      entityId: guest.id,
      metadata: { name: guest.invitationName },
    });
  });
}

/** Ids outside the wedding are ignored. "Terkirim" never downgrades an invitation that was opened. */
export async function bulkUpdateInvitationStatus(
  userId: string,
  weddingId: string,
  guestIds: string[],
  status: EditableInvitationStatus,
): Promise<number> {
  const membership = await requireWeddingFeature("guests", userId, weddingId);
  const ids = [...new Set(guestIds.filter(isUuid))];
  if (ids.length === 0) return 0;

  return getDb().$transaction(async (tx) => {
    const where: Prisma.GuestWhereInput = { id: { in: ids }, weddingId: membership.weddingId };
    if (status === "SENT") where.invitationStatus = { not: "OPENED" };
    const { count } = await tx.guest.updateMany({ where, data: { invitationStatus: status } });
    if (count > 0) {
      await recordActivity(tx, {
        weddingId: membership.weddingId,
        userId,
        actorName: membership.displayName,
        action: "guests.bulk_status_updated",
        entityType: "guest",
        metadata: { count, status },
      });
    }
    return count;
  });
}
