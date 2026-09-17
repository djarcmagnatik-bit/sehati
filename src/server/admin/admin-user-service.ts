import "server-only";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { formatCoupleName } from "@/lib/couple";
import { isEntitlementActive, knownFeatures } from "@/lib/billing";
import { grantPlanToWedding } from "@/server/billing/billing-service";
import { getDb } from "@/server/db";
import { AdminAccessError, pageArgs, recordAdminAudit, requireAdmin, ADMIN_PAGE_SIZE } from "./admin-access";

const uuidSchema = z.uuid();
const isUuid = (value: string) => uuidSchema.safeParse(value).success;

// ─── Users ───────────────────────────────────────────────────────────────────

export type UserFilter = { q: string; role: "all" | "USER" | "ADMIN"; status: "all" | "active" | "suspended"; page: number };

export async function listUsers(adminId: string, filter: UserFilter) {
  await requireAdmin(adminId);
  const { page, skip, take } = pageArgs(filter.page);
  const where: Prisma.UserWhereInput = {
    ...(filter.q
      ? { OR: [{ email: { contains: filter.q, mode: "insensitive" } }, { name: { contains: filter.q, mode: "insensitive" } }] }
      : {}),
    ...(filter.role === "all" ? {} : { role: filter.role }),
    ...(filter.status === "suspended" ? { suspendedAt: { not: null } } : filter.status === "active" ? { suspendedAt: null } : {}),
  };
  const db = getDb();
  const [total, items] = await db.$transaction([
    db.user.count({ where }),
    db.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        suspendedAt: true,
        createdAt: true,
        _count: { select: { memberships: true, sessions: true } },
      },
    }),
  ]);
  return { items, total, page, pageSize: ADMIN_PAGE_SIZE };
}

export async function getUserDetail(adminId: string, userId: string) {
  await requireAdmin(adminId);
  if (!isUuid(userId)) return null;
  return getDb().user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      suspendedAt: true,
      suspendedReason: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { sessions: true } },
      memberships: {
        orderBy: { joinedAt: "desc" },
        select: {
          role: true,
          joinedAt: true,
          wedding: { select: { id: true, brideName: true, groomName: true, weddingDate: true, deletedAt: true } },
        },
      },
    },
  });
}

export type UserMutationResult = { ok: true } | { ok: false; reason: "not_found" | "self" | "last_admin" | "unchanged" };

/** Blocks sign-in and ends every session at once. Admins cannot suspend themselves. */
export async function suspendUser(adminId: string, userId: string, reason: string, now: Date = new Date()): Promise<UserMutationResult> {
  const actor = await requireAdmin(adminId);
  if (!isUuid(userId)) return { ok: false, reason: "not_found" };
  if (userId === actor.id) return { ok: false, reason: "self" };

  return getDb().$transaction(async (tx) => {
    await lockAdminRoles(tx, actor.id);
    const user = await tx.user.findUnique({ where: { id: userId }, select: { suspendedAt: true, email: true, role: true } });
    if (!user) return { ok: false, reason: "not_found" } as const;
    if (user.suspendedAt) return { ok: false, reason: "unchanged" } as const;
    if (user.role === "ADMIN" && (await activeAdminCount(tx)) <= 1) return { ok: false, reason: "last_admin" } as const;

    await tx.user.update({ where: { id: userId }, data: { suspendedAt: now, suspendedReason: reason } });
    const { count } = await tx.session.deleteMany({ where: { userId } });
    await recordAdminAudit(tx, actor, {
      action: "user.suspended",
      targetType: "user",
      targetId: userId,
      summary: { reason, sessionsRevoked: count },
    });
    return { ok: true } as const;
  });
}

export async function unsuspendUser(adminId: string, userId: string): Promise<UserMutationResult> {
  const actor = await requireAdmin(adminId);
  if (!isUuid(userId)) return { ok: false, reason: "not_found" };
  return getDb().$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId }, select: { suspendedAt: true } });
    if (!user) return { ok: false, reason: "not_found" } as const;
    if (!user.suspendedAt) return { ok: false, reason: "unchanged" } as const;
    await tx.user.update({ where: { id: userId }, data: { suspendedAt: null, suspendedReason: null } });
    await recordAdminAudit(tx, actor, { action: "user.unsuspended", targetType: "user", targetId: userId });
    return { ok: true } as const;
  });
}

async function activeAdminCount(tx: Prisma.TransactionClient): Promise<number> {
  return tx.user.count({ where: { role: "ADMIN", suspendedAt: null } });
}

/**
 * Serializes changes that can remove an admin, then re-checks the actor inside the lock: two admins
 * demoting or suspending each other at the same moment must not both succeed.
 */
async function lockAdminRoles(tx: Prisma.TransactionClient, actorId: string): Promise<void> {
  await tx.$executeRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext('admin-roles'))`;
  const actor = await tx.user.findUnique({ where: { id: actorId }, select: { role: true, suspendedAt: true } });
  if (!actor || actor.role !== "ADMIN" || actor.suspendedAt) throw new AdminAccessError();
}

/** The last active admin can never be demoted, and nobody demotes themselves. */
export async function setUserRole(adminId: string, userId: string, role: "USER" | "ADMIN"): Promise<UserMutationResult> {
  const actor = await requireAdmin(adminId);
  if (!isUuid(userId)) return { ok: false, reason: "not_found" };
  if (userId === actor.id) return { ok: false, reason: "self" };

  return getDb().$transaction(async (tx) => {
    await lockAdminRoles(tx, actor.id);
    const user = await tx.user.findUnique({ where: { id: userId }, select: { role: true } });
    if (!user) return { ok: false, reason: "not_found" } as const;
    if (user.role === role) return { ok: false, reason: "unchanged" } as const;
    if (role === "USER" && (await activeAdminCount(tx)) <= 1) return { ok: false, reason: "last_admin" } as const;

    await tx.user.update({ where: { id: userId }, data: { role } });
    await recordAdminAudit(tx, actor, {
      action: role === "ADMIN" ? "user.promoted" : "user.demoted",
      targetType: "user",
      targetId: userId,
      summary: { from: user.role, to: role },
    });
    return { ok: true } as const;
  });
}

// ─── Weddings ────────────────────────────────────────────────────────────────

export type WeddingFilter = { q: string; access: "all" | "paid" | "free"; page: number };

export async function listWeddings(adminId: string, filter: WeddingFilter, now: Date = new Date()) {
  await requireAdmin(adminId);
  const { page, skip, take } = pageArgs(filter.page);
  const activeEntitlement: Prisma.WeddingEntitlementWhereInput = {
    revokedAt: null,
    startsAt: { lte: now },
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
  };
  const where: Prisma.WeddingWhereInput = {
    deletedAt: null,
    ...(filter.q
      ? {
          OR: [
            { brideName: { contains: filter.q, mode: "insensitive" } },
            { groomName: { contains: filter.q, mode: "insensitive" } },
            { members: { some: { user: { email: { contains: filter.q, mode: "insensitive" } } } } },
          ],
        }
      : {}),
    ...(filter.access === "paid" ? { entitlements: { some: activeEntitlement } } : {}),
    ...(filter.access === "free" ? { entitlements: { none: activeEntitlement } } : {}),
  };
  const db = getDb();
  const [total, rows] = await db.$transaction([
    db.wedding.count({ where }),
    db.wedding.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take,
      select: {
        id: true,
        brideName: true,
        groomName: true,
        coupleDisplayFormat: true,
        customDisplayName: true,
        weddingDate: true,
        status: true,
        createdAt: true,
        _count: { select: { members: true, guests: true } },
        entitlements: { where: activeEntitlement, select: { id: true } },
      },
    }),
  ]);
  const items = rows.map((row) => ({
    id: row.id,
    coupleName: formatCoupleName({
      brideName: row.brideName,
      groomName: row.groomName,
      format: row.coupleDisplayFormat,
      customDisplayName: row.customDisplayName,
    }),
    weddingDate: row.weddingDate,
    status: row.status,
    createdAt: row.createdAt,
    members: row._count.members,
    guests: row._count.guests,
    paid: row.entitlements.length > 0,
  }));
  return { items, total, page, pageSize: ADMIN_PAGE_SIZE };
}

export async function getWeddingDetail(adminId: string, weddingId: string, now: Date = new Date()) {
  await requireAdmin(adminId);
  if (!isUuid(weddingId)) return null;
  const wedding = await getDb().wedding.findUnique({
    where: { id: weddingId },
    select: {
      id: true,
      brideName: true,
      groomName: true,
      coupleDisplayFormat: true,
      customDisplayName: true,
      weddingDate: true,
      status: true,
      deletedAt: true,
      createdAt: true,
      members: {
        orderBy: { joinedAt: "asc" },
        select: { role: true, displayName: true, joinedAt: true, user: { select: { id: true, email: true, suspendedAt: true } } },
      },
      entitlements: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          source: true,
          startsAt: true,
          expiresAt: true,
          revokedAt: true,
          note: true,
          plan: { select: { code: true, name: true, features: true } },
          transaction: { select: { orderId: true } },
        },
      },
      paymentTransactions: {
        orderBy: { createdAt: "desc" },
        take: 20,
        select: { orderId: true, itemName: true, amount: true, status: true, createdAt: true },
      },
      invitation: { select: { slug: true, status: true } },
      _count: { select: { tasks: true, guests: true, vendors: true, expenses: true } },
    },
  });
  if (!wedding) return null;
  return {
    ...wedding,
    coupleName: formatCoupleName({
      brideName: wedding.brideName,
      groomName: wedding.groomName,
      format: wedding.coupleDisplayFormat,
      customDisplayName: wedding.customDisplayName,
    }),
    entitlements: wedding.entitlements.map((entitlement) => ({
      ...entitlement,
      active: isEntitlementActive(entitlement, now),
      features: knownFeatures(entitlement.plan.features),
    })),
  };
}

export type GrantResult = { ok: true } | { ok: false; reason: "unknown_plan" | "unknown_wedding" };

export async function adminGrantPlanToWedding(
  adminId: string,
  weddingId: string,
  planCode: string,
  note: string,
  now: Date = new Date(),
): Promise<GrantResult> {
  const actor = await requireAdmin(adminId);
  if (!isUuid(weddingId)) return { ok: false, reason: "unknown_wedding" };
  const db = getDb();
  const [plan, wedding] = await Promise.all([
    db.plan.findUnique({ where: { code: planCode }, select: { id: true, durationDays: true, code: true } }),
    db.wedding.findFirst({ where: { id: weddingId, deletedAt: null }, select: { id: true } }),
  ]);
  if (!plan) return { ok: false, reason: "unknown_plan" };
  if (!wedding) return { ok: false, reason: "unknown_wedding" };

  await db.$transaction(async (tx) => {
    const entitlementId = await grantPlanToWedding(tx, {
      weddingId,
      planId: plan.id,
      durationDays: plan.durationDays,
      source: "ADMIN_GRANT",
      grantedById: actor.id,
      note,
      now,
    });
    await recordAdminAudit(tx, actor, {
      action: "entitlement.granted",
      targetType: "wedding",
      targetId: weddingId,
      summary: { plan: plan.code, entitlementId, note },
    });
  });
  return { ok: true };
}

/** Revoking keeps the row for history; purchases stay linked to their transaction. */
export async function adminRevokeEntitlement(
  adminId: string,
  entitlementId: string,
  note: string,
  now: Date = new Date(),
): Promise<{ ok: true; weddingId: string } | { ok: false; reason: "not_found" | "unchanged" }> {
  const actor = await requireAdmin(adminId);
  if (!isUuid(entitlementId)) return { ok: false, reason: "not_found" };
  return getDb().$transaction(async (tx) => {
    const entitlement = await tx.weddingEntitlement.findUnique({
      where: { id: entitlementId },
      select: { id: true, weddingId: true, revokedAt: true, source: true, plan: { select: { code: true } } },
    });
    if (!entitlement) return { ok: false, reason: "not_found" } as const;
    if (entitlement.revokedAt) return { ok: false, reason: "unchanged" } as const;
    await tx.weddingEntitlement.update({ where: { id: entitlement.id }, data: { revokedAt: now } });
    await recordAdminAudit(tx, actor, {
      action: "entitlement.revoked",
      targetType: "wedding",
      targetId: entitlement.weddingId,
      summary: { plan: entitlement.plan.code, source: entitlement.source, entitlementId, note },
    });
    return { ok: true, weddingId: entitlement.weddingId } as const;
  });
}
