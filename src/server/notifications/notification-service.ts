import "server-only";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { isSafeInternalLink, NOTIFICATION_PAGE_SIZE, type NotificationContent, type NotificationTypeValue } from "@/lib/notifications";
import { getDb } from "@/server/db";

type Tx = Prisma.TransactionClient;

const isUuid = (value: string) => z.uuid().safeParse(value).success;

export type Delivery = {
  weddingId: string | null;
  type: NotificationTypeValue;
  /** Identifies the event; each recipient gets it at most once. */
  dedupeKey: string;
  content: NotificationContent;
};

/** Returns how many notifications were actually new. Unsafe links are dropped rather than stored. */
export async function deliverNotification(db: Tx, recipients: readonly string[], delivery: Delivery, now: Date = new Date()): Promise<number> {
  return deliverNotifications(db, [{ recipients, delivery }], now);
}

const INSERT_BATCH = 1000;

/** Many deliveries in as few statements as possible (periodic scans across all weddings). */
export async function deliverNotifications(
  db: Tx,
  deliveries: ReadonlyArray<{ recipients: readonly string[]; delivery: Delivery }>,
  now: Date = new Date(),
): Promise<number> {
  const rows = deliveries.flatMap(({ recipients, delivery }) => {
    const link = isSafeInternalLink(delivery.content.link) ? delivery.content.link : null;
    return [...new Set(recipients)].map((userId) => ({
      userId,
      weddingId: delivery.weddingId,
      type: delivery.type,
      title: delivery.content.title.slice(0, 120),
      body: delivery.content.body.slice(0, 300),
      link,
      dedupeKey: delivery.dedupeKey.slice(0, 160),
      createdAt: now,
    }));
  });
  let created = 0;
  for (let index = 0; index < rows.length; index += INSERT_BATCH) {
    const { count } = await db.notification.createMany({ data: rows.slice(index, index + INSERT_BATCH), skipDuplicates: true });
    created += count;
  }
  return created;
}

export async function countUnreadNotifications(userId: string): Promise<number> {
  return getDb().notification.count({ where: { userId, readAt: null } });
}

export async function listNotifications(userId: string, page = 1) {
  const current = Number.isInteger(page) && page >= 1 ? Math.min(page, 1000) : 1;
  const db = getDb();
  const [total, unread, items] = await db.$transaction([
    db.notification.count({ where: { userId } }),
    db.notification.count({ where: { userId, readAt: null } }),
    db.notification.findMany({
      where: { userId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (current - 1) * NOTIFICATION_PAGE_SIZE,
      take: NOTIFICATION_PAGE_SIZE,
      select: { id: true, type: true, title: true, body: true, link: true, readAt: true, createdAt: true },
    }),
  ]);
  return { items, total, unread, page: current, pageSize: NOTIFICATION_PAGE_SIZE };
}

/**
 * Marks one of the user's own notifications as read and returns where it points. Someone else's id
 * behaves exactly like an unknown id.
 */
export async function openNotification(userId: string, notificationId: string, now: Date = new Date()): Promise<{ link: string | null } | null> {
  if (!isUuid(notificationId)) return null;
  const db = getDb();
  const notification = await db.notification.findFirst({ where: { id: notificationId, userId }, select: { link: true, readAt: true } });
  if (!notification) return null;
  if (!notification.readAt) {
    await db.notification.updateMany({ where: { id: notificationId, userId, readAt: null }, data: { readAt: now } });
  }
  return { link: isSafeInternalLink(notification.link) ? notification.link : null };
}

export async function markAllNotificationsRead(userId: string, now: Date = new Date()): Promise<number> {
  const { count } = await getDb().notification.updateMany({ where: { userId, readAt: null }, data: { readAt: now } });
  return count;
}

/** Read notifications are kept 90 days, unread ones 180. */
export async function purgeOldNotifications(now: Date = new Date()): Promise<number> {
  const day = 24 * 60 * 60 * 1000;
  const { count } = await getDb().notification.deleteMany({
    where: {
      OR: [
        { readAt: { not: null }, createdAt: { lt: new Date(now.getTime() - 90 * day) } },
        { createdAt: { lt: new Date(now.getTime() - 180 * day) } },
      ],
    },
  });
  return count;
}
