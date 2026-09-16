import "server-only";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { isoToDbDate } from "@/lib/dates";
import type { WeddingEventInput } from "@/lib/validation/invitation";
import { recordActivity } from "@/server/activity/activity-service";
import { memberWeddingWhere, WeddingAccessError } from "@/server/authz/wedding-access";
import { requireWeddingFeature } from "@/server/billing/access";
import { getDb } from "@/server/db";

const uuidSchema = z.uuid();
const isUuid = (value: string) => uuidSchema.safeParse(value).success;

const eventSelect = {
  id: true,
  name: true,
  eventDate: true,
  startTime: true,
  endTime: true,
  venueName: true,
  address: true,
  latitude: true,
  longitude: true,
  mapsUrl: true,
  dressCode: true,
  notes: true,
  sortOrder: true,
} satisfies Prisma.WeddingEventSelect;

export type WeddingEventRow = {
  id: string;
  name: string;
  eventDate: Date;
  startTime: string | null;
  endTime: string | null;
  venueName: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  mapsUrl: string | null;
  dressCode: string | null;
  notes: string | null;
  sortOrder: number;
};

/** Prisma returns Decimal for coordinates; the app works with plain numbers. */
function toRow(event: Prisma.WeddingEventGetPayload<{ select: typeof eventSelect }>): WeddingEventRow {
  return {
    ...event,
    latitude: event.latitude === null ? null : Number(event.latitude),
    longitude: event.longitude === null ? null : Number(event.longitude),
  };
}

function eventData(input: WeddingEventInput) {
  return {
    name: input.name,
    eventDate: isoToDbDate(input.eventDate),
    startTime: input.startTime,
    endTime: input.endTime,
    venueName: input.venueName,
    address: input.address,
    latitude: input.latitude === null ? null : new Prisma.Decimal(input.latitude),
    longitude: input.longitude === null ? null : new Prisma.Decimal(input.longitude),
    mapsUrl: input.mapsUrl,
    dressCode: input.dressCode,
    notes: input.notes,
  };
}

export async function listWeddingEvents(userId: string, weddingId: string): Promise<WeddingEventRow[]> {
  const membership = await requireWeddingFeature("invitation", userId, weddingId);
  const events = await getDb().weddingEvent.findMany({
    where: { weddingId: membership.weddingId },
    orderBy: [{ sortOrder: "asc" }, { eventDate: "asc" }],
    select: eventSelect,
  });
  return events.map(toRow);
}

export async function getWeddingEventForUser(userId: string, eventId: string): Promise<WeddingEventRow | null> {
  if (!isUuid(eventId)) return null;
  const event = await getDb().weddingEvent.findFirst({
    where: { id: eventId, wedding: memberWeddingWhere(userId) },
    select: eventSelect,
  });
  return event ? toRow(event) : null;
}

export async function createWeddingEvent(userId: string, weddingId: string, input: WeddingEventInput): Promise<string> {
  const membership = await requireWeddingFeature("invitation", userId, weddingId);
  return getDb().$transaction(async (tx) => {
    const last = await tx.weddingEvent.aggregate({ where: { weddingId: membership.weddingId }, _max: { sortOrder: true } });
    const event = await tx.weddingEvent.create({
      data: { ...eventData(input), weddingId: membership.weddingId, sortOrder: (last._max.sortOrder ?? 0) + 10 },
      select: { id: true },
    });
    await recordActivity(tx, {
      weddingId: membership.weddingId,
      userId,
      actorName: membership.displayName,
      action: "wedding_event.created",
      entityType: "wedding_event",
      entityId: event.id,
      metadata: { name: input.name },
    });
    return event.id;
  });
}

async function findEventScope(userId: string, eventId: string) {
  if (!isUuid(eventId)) throw new WeddingAccessError();
  const event = await getDb().weddingEvent.findFirst({
    where: { id: eventId, wedding: memberWeddingWhere(userId) },
    select: { id: true, weddingId: true, name: true },
  });
  if (!event) throw new WeddingAccessError();
  const membership = await requireWeddingFeature("invitation", userId, event.weddingId);
  return { event, membership };
}

export async function updateWeddingEvent(userId: string, eventId: string, input: WeddingEventInput): Promise<void> {
  const { event, membership } = await findEventScope(userId, eventId);
  await getDb().$transaction(async (tx) => {
    await tx.weddingEvent.update({ where: { id: event.id }, data: eventData(input) });
    await recordActivity(tx, {
      weddingId: event.weddingId,
      userId,
      actorName: membership.displayName,
      action: "wedding_event.updated",
      entityType: "wedding_event",
      entityId: event.id,
      metadata: { name: input.name },
    });
  });
}

export async function deleteWeddingEvent(userId: string, eventId: string): Promise<void> {
  const { event, membership } = await findEventScope(userId, eventId);
  await getDb().$transaction(async (tx) => {
    await tx.weddingEvent.delete({ where: { id: event.id } });
    await recordActivity(tx, {
      weddingId: event.weddingId,
      userId,
      actorName: membership.displayName,
      action: "wedding_event.deleted",
      entityType: "wedding_event",
      entityId: event.id,
      metadata: { name: event.name },
    });
  });
}
