import "server-only";
import { z } from "zod";
import { dbDateToIso, isoToDbDate, isValidIsoDate } from "@/lib/dates";
import { formatRupiah } from "@/lib/money";
import { formatTimeRange, type CalendarEntry } from "@/lib/planning";
import type { CalendarEventInput } from "@/lib/validation/planning";
import { recordActivity } from "@/server/activity/activity-service";
import { memberWeddingWhere, requireWeddingMember, WeddingAccessError } from "@/server/authz/wedding-access";
import { getWeddingFeatures } from "@/server/billing/access";
import { getDb } from "@/server/db";

const uuidSchema = z.uuid();
const isUuid = (value: string) => uuidSchema.safeParse(value).success;

/** A range longer than this is a caller bug, not a calendar view. */
const MAX_RANGE_DAYS = 62;

/**
 * Everything with a date in [fromIso, toIso], from every planning module, in one list. Each entry
 * links back to the record it came from; nothing here is stored twice.
 */
export async function listCalendarEntries(
  userId: string,
  weddingId: string,
  fromIso: string,
  toIso: string,
): Promise<CalendarEntry[]> {
  const membership = await requireWeddingMember(userId, weddingId);
  if (!isValidIsoDate(fromIso) || !isValidIsoDate(toIso) || toIso < fromIso) return [];
  const days = (Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86_400_000;
  if (days > MAX_RANGE_DAYS) throw new RangeError("Calendar range too long");

  const range = { gte: isoToDbDate(fromIso), lte: isoToDbDate(toIso) };
  const scope = { weddingId: membership.weddingId };
  const db = getDb();
  const features = await getWeddingFeatures(membership.weddingId);
  const none = Promise.resolve([] as never[]);

  const [tasks, expenses, events, meetings, custom] = await Promise.all([
    db.task.findMany({
      where: { ...scope, dueDate: range, status: { not: "CANCELLED" } },
      select: { id: true, title: true, dueDate: true, status: true, category: { select: { name: true } } },
    }),
    features.has("budget") ? db.expense.findMany({
      where: { ...scope, dueDate: range },
      select: {
        id: true,
        title: true,
        dueDate: true,
        totalAmount: true,
        payments: { select: { amount: true } },
        vendor: { select: { name: true } },
      },
    }) : none,
    features.has("invitation") ? db.weddingEvent.findMany({
      where: { ...scope, eventDate: range },
      select: { id: true, name: true, eventDate: true, startTime: true, endTime: true, venueName: true },
    }) : none,
    features.has("vendors") ? db.vendorResearch.findMany({
      where: { ...scope, meetingDate: range },
      select: { id: true, name: true, meetingDate: true, meetingTime: true, status: true, category: { select: { name: true } } },
    }) : none,
    db.calendarEvent.findMany({
      where: { ...scope, eventDate: range },
      select: { id: true, title: true, eventDate: true, startTime: true, endTime: true, location: true },
    }),
  ]);

  const entries: CalendarEntry[] = [];

  for (const task of tasks) {
    entries.push({
      id: `task-${task.id}`,
      source: "task",
      title: task.title,
      dateIso: dbDateToIso(task.dueDate!),
      time: null,
      href: `/checklist/${task.id}`,
      detail: `Tenggat tugas · ${task.category.name}`,
      done: task.status === "COMPLETED",
    });
  }

  for (const expense of expenses) {
    const paid = expense.payments.reduce((sum, payment) => sum + payment.amount, 0n);
    const outstanding = expense.totalAmount > paid ? expense.totalAmount - paid : 0n;
    entries.push({
      id: `payment-${expense.id}`,
      source: "payment",
      title: expense.title,
      dateIso: dbDateToIso(expense.dueDate!),
      time: null,
      href: `/budget/expenses/${expense.id}`,
      detail:
        outstanding > 0n
          ? `Jatuh tempo · sisa ${formatRupiah(outstanding)}${expense.vendor ? ` · ${expense.vendor.name}` : ""}`
          : `Lunas${expense.vendor ? ` · ${expense.vendor.name}` : ""}`,
      done: outstanding === 0n,
    });
  }

  for (const event of events) {
    entries.push({
      id: `event-${event.id}`,
      source: "wedding_event",
      title: event.name,
      dateIso: dbDateToIso(event.eventDate),
      time: event.startTime,
      href: `/invitation/events/${event.id}`,
      detail: [event.startTime ? formatTimeRange(event.startTime, event.endTime) : null, event.venueName].filter(Boolean).join(" · ") || null,
      done: false,
    });
  }

  for (const meeting of meetings) {
    entries.push({
      id: `meeting-${meeting.id}`,
      source: "vendor_meeting",
      title: `Janji dengan ${meeting.name}`,
      dateIso: dbDateToIso(meeting.meetingDate!),
      time: meeting.meetingTime,
      href: `/vendors/research/${meeting.id}`,
      detail: [meeting.meetingTime, meeting.category.name].filter(Boolean).join(" · "),
      done: false,
    });
  }

  for (const event of custom) {
    entries.push({
      id: `custom-${event.id}`,
      source: "custom",
      title: event.title,
      dateIso: dbDateToIso(event.eventDate),
      time: event.startTime,
      href: `/calendar/events/${event.id}`,
      detail: [event.startTime ? formatTimeRange(event.startTime, event.endTime) : null, event.location].filter(Boolean).join(" · ") || null,
      done: false,
    });
  }

  return entries.sort(
    (a, b) => a.dateIso.localeCompare(b.dateIso) || (a.time ?? "99:99").localeCompare(b.time ?? "99:99") || a.title.localeCompare(b.title),
  );
}

// ─── Custom events ───────────────────────────────────────────────────────────

export async function getCalendarEventForUser(userId: string, eventId: string) {
  if (!isUuid(eventId)) return null;
  return getDb().calendarEvent.findFirst({
    where: { id: eventId, wedding: memberWeddingWhere(userId) },
    select: { id: true, weddingId: true, title: true, eventDate: true, startTime: true, endTime: true, location: true, notes: true },
  });
}

function eventData(input: CalendarEventInput) {
  return {
    title: input.title,
    eventDate: isoToDbDate(input.eventDate),
    startTime: input.startTime,
    endTime: input.endTime,
    location: input.location,
    notes: input.notes,
  };
}

export async function createCalendarEvent(userId: string, weddingId: string, input: CalendarEventInput): Promise<string> {
  const membership = await requireWeddingMember(userId, weddingId);
  return getDb().$transaction(async (tx) => {
    const event = await tx.calendarEvent.create({
      data: { ...eventData(input), weddingId: membership.weddingId, createdById: userId },
      select: { id: true },
    });
    await recordActivity(tx, {
      weddingId: membership.weddingId,
      userId,
      actorName: membership.displayName,
      action: "calendar.event_created",
      entityType: "calendar_event",
      entityId: event.id,
      metadata: { title: input.title, date: input.eventDate },
    });
    return event.id;
  });
}

async function findEventScope(userId: string, eventId: string) {
  if (!isUuid(eventId)) throw new WeddingAccessError();
  const event = await getDb().calendarEvent.findFirst({
    where: { id: eventId, wedding: memberWeddingWhere(userId) },
    select: { id: true, weddingId: true, title: true },
  });
  if (!event) throw new WeddingAccessError();
  const membership = await requireWeddingMember(userId, event.weddingId);
  return { event, membership };
}

export async function updateCalendarEvent(userId: string, eventId: string, input: CalendarEventInput): Promise<void> {
  const { event, membership } = await findEventScope(userId, eventId);
  await getDb().$transaction(async (tx) => {
    await tx.calendarEvent.update({ where: { id: event.id }, data: eventData(input) });
    await recordActivity(tx, {
      weddingId: event.weddingId,
      userId,
      actorName: membership.displayName,
      action: "calendar.event_updated",
      entityType: "calendar_event",
      entityId: event.id,
      metadata: { title: input.title, date: input.eventDate },
    });
  });
}

export async function deleteCalendarEvent(userId: string, eventId: string): Promise<void> {
  const { event, membership } = await findEventScope(userId, eventId);
  await getDb().$transaction(async (tx) => {
    await tx.calendarEvent.delete({ where: { id: event.id } });
    await recordActivity(tx, {
      weddingId: event.weddingId,
      userId,
      actorName: membership.displayName,
      action: "calendar.event_deleted",
      entityType: "calendar_event",
      entityId: event.id,
      metadata: { title: event.title },
    });
  });
}
