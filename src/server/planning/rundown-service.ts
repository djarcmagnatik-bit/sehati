import "server-only";
import { z } from "zod";
import { dbDateToIso, isoToDbDate } from "@/lib/dates";
import type { RundownItemInput } from "@/lib/validation/planning";
import { recordActivity } from "@/server/activity/activity-service";
import { memberWeddingWhere, requireWeddingMember, WeddingAccessError } from "@/server/authz/wedding-access";
import { getDb } from "@/server/db";

const uuidSchema = z.uuid();
const isUuid = (value: string) => uuidSchema.safeParse(value).success;

export type RundownRow = {
  id: string;
  dateIso: string;
  startTime: string;
  endTime: string | null;
  title: string;
  description: string | null;
  pic: string | null;
  location: string | null;
  category: string | null;
  notes: string | null;
  sortOrder: number;
};

export type RundownDay = { dateIso: string; items: RundownRow[] };

/**
 * The whole rundown grouped by day, each day in time order. Items without a date belong to the
 * wedding date. Equal start times keep the order the couple arranged.
 */
export async function listRundown(userId: string, weddingId: string): Promise<RundownDay[]> {
  const membership = await requireWeddingMember(userId, weddingId);
  const db = getDb();
  const [wedding, items] = await Promise.all([
    db.wedding.findUniqueOrThrow({ where: { id: membership.weddingId }, select: { weddingDate: true } }),
    db.rundownItem.findMany({
      where: { weddingId: membership.weddingId },
      select: {
        id: true,
        itemDate: true,
        startTime: true,
        endTime: true,
        title: true,
        description: true,
        pic: true,
        location: true,
        category: true,
        notes: true,
        sortOrder: true,
      },
    }),
  ]);

  const weddingDateIso = dbDateToIso(wedding.weddingDate);
  const rows: RundownRow[] = items.map((item) => ({
    ...item,
    dateIso: item.itemDate ? dbDateToIso(item.itemDate) : weddingDateIso,
  }));
  rows.sort(
    (a, b) =>
      a.dateIso.localeCompare(b.dateIso) || a.startTime.localeCompare(b.startTime) || a.sortOrder - b.sortOrder,
  );

  const days: RundownDay[] = [];
  for (const row of rows) {
    const last = days.at(-1);
    if (last && last.dateIso === row.dateIso) last.items.push(row);
    else days.push({ dateIso: row.dateIso, items: [row] });
  }
  return days;
}

export async function getRundownItemForUser(userId: string, itemId: string) {
  if (!isUuid(itemId)) return null;
  return getDb().rundownItem.findFirst({
    where: { id: itemId, wedding: memberWeddingWhere(userId) },
    select: {
      id: true,
      weddingId: true,
      itemDate: true,
      startTime: true,
      endTime: true,
      title: true,
      description: true,
      pic: true,
      location: true,
      category: true,
      notes: true,
    },
  });
}

function itemData(input: RundownItemInput) {
  return {
    itemDate: input.itemDate ? isoToDbDate(input.itemDate) : null,
    startTime: input.startTime,
    endTime: input.endTime,
    title: input.title,
    description: input.description,
    pic: input.pic,
    location: input.location,
    category: input.category,
    notes: input.notes,
  };
}

export async function createRundownItem(userId: string, weddingId: string, input: RundownItemInput): Promise<string> {
  const membership = await requireWeddingMember(userId, weddingId);
  return getDb().$transaction(async (tx) => {
    const last = await tx.rundownItem.aggregate({ where: { weddingId: membership.weddingId }, _max: { sortOrder: true } });
    const item = await tx.rundownItem.create({
      data: { ...itemData(input), weddingId: membership.weddingId, sortOrder: (last._max.sortOrder ?? 0) + 10 },
      select: { id: true },
    });
    await recordActivity(tx, {
      weddingId: membership.weddingId,
      userId,
      actorName: membership.displayName,
      action: "rundown.item_created",
      entityType: "rundown_item",
      entityId: item.id,
      metadata: { title: input.title },
    });
    return item.id;
  });
}

async function findItemScope(userId: string, itemId: string) {
  if (!isUuid(itemId)) throw new WeddingAccessError();
  const item = await getDb().rundownItem.findFirst({
    where: { id: itemId, wedding: memberWeddingWhere(userId) },
    select: { id: true, weddingId: true, title: true },
  });
  if (!item) throw new WeddingAccessError();
  const membership = await requireWeddingMember(userId, item.weddingId);
  return { item, membership };
}

export async function updateRundownItem(userId: string, itemId: string, input: RundownItemInput): Promise<void> {
  const { item, membership } = await findItemScope(userId, itemId);
  await getDb().$transaction(async (tx) => {
    await tx.rundownItem.update({ where: { id: item.id }, data: itemData(input) });
    await recordActivity(tx, {
      weddingId: item.weddingId,
      userId,
      actorName: membership.displayName,
      action: "rundown.item_updated",
      entityType: "rundown_item",
      entityId: item.id,
      metadata: { title: input.title },
    });
  });
}

export async function deleteRundownItem(userId: string, itemId: string): Promise<void> {
  const { item, membership } = await findItemScope(userId, itemId);
  await getDb().$transaction(async (tx) => {
    await tx.rundownItem.delete({ where: { id: item.id } });
    await recordActivity(tx, {
      weddingId: item.weddingId,
      userId,
      actorName: membership.displayName,
      action: "rundown.item_deleted",
      entityType: "rundown_item",
      entityId: item.id,
      metadata: { title: item.title },
    });
  });
}

/**
 * Swaps an item with its neighbour among items that share the same day and start time — the only
 * order a rundown lets people choose, since time already decides everything else.
 */
export async function moveRundownItem(userId: string, itemId: string, direction: "up" | "down"): Promise<boolean> {
  const { item } = await findItemScope(userId, itemId);
  const days = await listRundown(userId, item.weddingId);
  const day = days.find((entry) => entry.items.some((row) => row.id === item.id));
  if (!day) return false;

  const index = day.items.findIndex((row) => row.id === item.id);
  const current = day.items[index]!;
  const neighbour = day.items[direction === "up" ? index - 1 : index + 1];
  if (!neighbour || neighbour.startTime !== current.startTime) return false;

  const db = getDb();
  await db.$transaction([
    db.rundownItem.update({ where: { id: current.id }, data: { sortOrder: neighbour.sortOrder } }),
    db.rundownItem.update({ where: { id: neighbour.id }, data: { sortOrder: current.sortOrder } }),
  ]);
  return true;
}
