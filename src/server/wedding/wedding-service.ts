import "server-only";
import { computeTemplateDueDate } from "@/lib/checklist";
import { dbDateToIso, isoToDbDate, todayIsoInTimeZone } from "@/lib/dates";
import type { OnboardingData } from "@/lib/validation/onboarding";
import { requireWeddingMember } from "@/server/authz/wedding-access";
import { generateTemplateTasks, recalculableTasksWhere } from "@/server/checklist/checklist-generation";
import { getDb } from "@/server/db";

export type CreateWeddingResult =
  | { ok: true; weddingId: string }
  | { ok: false; reason: "already_has_wedding" | "invalid_event_type" | "invalid_marriage_process" };

/** Creates the workspace, the OWNER membership and the template checklist in one transaction. */
export async function createWeddingForUser(
  userId: string,
  data: OnboardingData,
  now: Date = new Date(),
): Promise<CreateWeddingResult> {
  return getDb().$transaction(
    async (tx) => {
      // Serialize workspace creation per user so double-submits cannot create two weddings.
      await tx.$executeRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext(${userId}::text))`;

      const existing = await tx.weddingMember.findFirst({
        where: { userId, wedding: { deletedAt: null } },
        select: { id: true },
      });
      if (existing) return { ok: false, reason: "already_has_wedding" } as const;

      const eventType = await tx.eventType.findFirst({
        where: { id: data.eventTypeId, isActive: true },
        select: { id: true },
      });
      if (!eventType) return { ok: false, reason: "invalid_event_type" } as const;

      const marriageProcess = await tx.marriageProcess.findFirst({
        where: { id: data.marriageProcessId, isActive: true },
        select: { id: true },
      });
      if (!marriageProcess) return { ok: false, reason: "invalid_marriage_process" } as const;

      const wedding = await tx.wedding.create({
        data: {
          brideName: data.brideName,
          groomName: data.groomName,
          partnerName: data.partnerName,
          coupleDisplayFormat: data.coupleDisplayFormat,
          customDisplayName: data.coupleDisplayFormat === "CUSTOM" ? data.customDisplayName : null,
          weddingDate: isoToDbDate(data.weddingDate),
          engagementDate: data.engagementDate ? isoToDbDate(data.engagementDate) : null,
          receptionDate: data.receptionDate ? isoToDbDate(data.receptionDate) : null,
          eventTypeId: eventType.id,
          marriageProcessId: marriageProcess.id,
          targetBudget: data.targetBudget,
          currency: data.currency,
          checklistGeneratedAt: now,
          createdById: userId,
          members: {
            create: { userId, role: "OWNER", displayName: data.displayName },
          },
        },
        select: { id: true, weddingDate: true, eventTypeId: true, marriageProcessId: true, timeZone: true },
      });

      await generateTemplateTasks(tx, wedding, {
        todayIso: todayIsoInTimeZone(now, wedding.timeZone),
        createdById: userId,
      });

      return { ok: true, weddingId: wedding.id } as const;
    },
    { timeout: 15_000 },
  );
}

export async function userHasWedding(userId: string): Promise<boolean> {
  const membership = await getDb().weddingMember.findFirst({
    where: { userId, wedding: { deletedAt: null } },
    select: { id: true },
  });
  return membership !== null;
}

/** The wedding workspace the user currently works in, scoped through membership. */
export function getActiveWeddingForUser(userId: string) {
  return getDb().weddingMember.findFirst({
    where: { userId, wedding: { deletedAt: null } },
    orderBy: { joinedAt: "desc" },
    select: {
      role: true,
      displayName: true,
      wedding: {
        select: {
          id: true,
          brideName: true,
          groomName: true,
          partnerName: true,
          coupleDisplayFormat: true,
          customDisplayName: true,
          weddingDate: true,
          engagementDate: true,
          receptionDate: true,
          timeZone: true,
          targetBudget: true,
          currency: true,
          status: true,
          coupleNote: true,
          coupleNoteUpdatedAt: true,
          checklistGeneratedAt: true,
          eventType: { select: { name: true } },
          marriageProcess: { select: { name: true } },
          members: {
            orderBy: { joinedAt: "asc" },
            select: { id: true, role: true, displayName: true },
          },
        },
      },
    },
  });
}

export async function updateCoupleNote(userId: string, weddingId: string, note: string | null): Promise<void> {
  const membership = await requireWeddingMember(userId, weddingId);
  await getDb().wedding.update({
    where: { id: membership.weddingId },
    data: { coupleNote: note, coupleNoteUpdatedAt: new Date() },
  });
}

/** Number of template tasks whose deadline would move if the wedding date changes. */
export async function countRecalculableTasks(userId: string, weddingId: string): Promise<number> {
  const membership = await requireWeddingMember(userId, weddingId);
  return getDb().task.count({ where: recalculableTasksWhere(membership.weddingId) });
}

export type ChangeWeddingDateResult =
  | { ok: true; recalculated: number }
  | { ok: false; reason: "engagement_after_wedding" | "reception_before_wedding" };

/**
 * Changes the wedding date. Deadlines are only recalculated when the couple explicitly asks, and
 * never for tasks whose deadline was edited manually, or that are completed/cancelled.
 */
export async function changeWeddingDate(
  userId: string,
  weddingId: string,
  newWeddingDateIso: string,
  recalculate: boolean,
  now: Date = new Date(),
): Promise<ChangeWeddingDateResult> {
  const membership = await requireWeddingMember(userId, weddingId);

  return getDb().$transaction(
    async (tx) => {
      const wedding = await tx.wedding.findUniqueOrThrow({
        where: { id: membership.weddingId },
        select: { engagementDate: true, receptionDate: true, timeZone: true },
      });
      if (wedding.engagementDate && dbDateToIso(wedding.engagementDate) > newWeddingDateIso) {
        return { ok: false, reason: "engagement_after_wedding" } as const;
      }
      if (wedding.receptionDate && dbDateToIso(wedding.receptionDate) < newWeddingDateIso) {
        return { ok: false, reason: "reception_before_wedding" } as const;
      }

      await tx.wedding.update({
        where: { id: membership.weddingId },
        data: { weddingDate: isoToDbDate(newWeddingDateIso) },
      });
      if (!recalculate) return { ok: true, recalculated: 0 } as const;

      const todayIso = todayIsoInTimeZone(now, wedding.timeZone);
      const where = recalculableTasksWhere(membership.weddingId);
      const offsets = await tx.task.findMany({ where, distinct: ["templateOffsetDays"], select: { templateOffsetDays: true } });

      let recalculated = 0;
      for (const { templateOffsetDays } of offsets) {
        if (templateOffsetDays === null) continue;
        const result = await tx.task.updateMany({
          where: { ...where, templateOffsetDays },
          data: { dueDate: isoToDbDate(computeTemplateDueDate(newWeddingDateIso, templateOffsetDays, todayIso)) },
        });
        recalculated += result.count;
      }
      return { ok: true, recalculated } as const;
    },
    { timeout: 15_000 },
  );
}
