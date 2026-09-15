import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { ActivityAction, ActivityMetadata } from "@/lib/activity";
import { requireWeddingMember } from "@/server/authz/wedding-access";
import { getDb } from "@/server/db";

export const ACTIVITY_PAGE_SIZE = 30;

export type ActivityEntryInput = {
  weddingId: string;
  userId: string | null;
  actorName: string;
  action: ActivityAction;
  entityType:
    | "wedding"
    | "task"
    | "checklist"
    | "partner_invitation"
    | "wedding_member"
    | "budget"
    | "budget_category"
    | "expense"
    | "payment"
    | "vendor_research"
    | "vendor";
  entityId?: string | null;
  metadata?: ActivityMetadata;
};

/** Pass the transaction client so the log is written atomically with the change it describes. */
export async function recordActivity(db: Prisma.TransactionClient, entry: ActivityEntryInput): Promise<void> {
  await db.activityLog.create({
    data: {
      weddingId: entry.weddingId,
      userId: entry.userId,
      actorName: entry.actorName.slice(0, 80),
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      ...(entry.metadata ? { metadata: entry.metadata } : {}),
    },
  });
}

const activitySelect = {
  id: true,
  action: true,
  actorName: true,
  entityType: true,
  entityId: true,
  metadata: true,
  createdAt: true,
} satisfies Prisma.ActivityLogSelect;

export async function getRecentActivity(userId: string, weddingId: string, limit = 5) {
  const membership = await requireWeddingMember(userId, weddingId);
  return getDb().activityLog.findMany({
    where: { weddingId: membership.weddingId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit,
    select: activitySelect,
  });
}

export async function listActivity(userId: string, weddingId: string, page: number) {
  const membership = await requireWeddingMember(userId, weddingId);
  const db = getDb();
  const where = { weddingId: membership.weddingId };
  const safePage = Number.isInteger(page) && page >= 1 ? page : 1;

  const [total, items] = await db.$transaction([
    db.activityLog.count({ where }),
    db.activityLog.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (safePage - 1) * ACTIVITY_PAGE_SIZE,
      take: ACTIVITY_PAGE_SIZE,
      select: activitySelect,
    }),
  ]);
  return { items, total, page: safePage, pageSize: ACTIVITY_PAGE_SIZE };
}
