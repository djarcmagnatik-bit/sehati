import "server-only";
import { z } from "zod";
import { dbDateToIso, isoToDbDate, todayIsoInTimeZone } from "@/lib/dates";
import { monthsUntil, savingsProgress, type SavingsSummary } from "@/lib/planning";
import type { SavingsEntryInput, SavingsSettingsInput } from "@/lib/validation/planning";
import { recordActivity } from "@/server/activity/activity-service";
import { memberWeddingWhere, requireWeddingMember, WeddingAccessError } from "@/server/authz/wedding-access";
import { getDb } from "@/server/db";

const uuidSchema = z.uuid();
const isUuid = (value: string) => uuidSchema.safeParse(value).success;

export async function listSavingsEntries(userId: string, weddingId: string) {
  const membership = await requireWeddingMember(userId, weddingId);
  return getDb().savingsEntry.findMany({
    where: { weddingId: membership.weddingId },
    orderBy: [{ entryDate: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      contributor: true,
      amount: true,
      entryDate: true,
      account: true,
      notes: true,
      createdBy: { select: { name: true } },
    },
  });
}

export async function getSavingsEntryForUser(userId: string, entryId: string) {
  if (!isUuid(entryId)) return null;
  return getDb().savingsEntry.findFirst({
    where: { id: entryId, wedding: memberWeddingWhere(userId) },
    select: { id: true, weddingId: true, contributor: true, amount: true, entryDate: true, account: true, notes: true },
  });
}

/**
 * Wedding fund at a glance. The target falls back to the overall budget target, so a couple who
 * only set one number still sees progress.
 */
export async function getSavingsSummary(userId: string, weddingId: string, now: Date = new Date()): Promise<SavingsSummary> {
  const membership = await requireWeddingMember(userId, weddingId);
  const db = getDb();
  const [wedding, totals, contributors] = await Promise.all([
    db.wedding.findUniqueOrThrow({
      where: { id: membership.weddingId },
      select: { savingsTarget: true, savingsMonthlyTarget: true, targetBudget: true, weddingDate: true, timeZone: true },
    }),
    db.savingsEntry.aggregate({ where: { weddingId: membership.weddingId }, _sum: { amount: true } }),
    db.savingsEntry.groupBy({ by: ["contributor"], where: { weddingId: membership.weddingId }, _count: { _all: true } }),
  ]);

  const saved = totals._sum.amount ?? 0n;
  const target = wedding.savingsTarget ?? wedding.targetBudget ?? null;
  const monthsLeft = monthsUntil(todayIsoInTimeZone(now, wedding.timeZone), dbDateToIso(wedding.weddingDate));
  const progress = savingsProgress(saved, target, { monthlyTarget: wedding.savingsMonthlyTarget, monthsLeft });

  return {
    target,
    saved,
    monthlyTarget: wedding.savingsMonthlyTarget,
    contributors: contributors.length,
    ...progress,
  };
}

export async function createSavingsEntry(userId: string, weddingId: string, input: SavingsEntryInput): Promise<string> {
  const membership = await requireWeddingMember(userId, weddingId);
  return getDb().$transaction(async (tx) => {
    const entry = await tx.savingsEntry.create({
      data: {
        weddingId: membership.weddingId,
        contributor: input.contributor,
        amount: input.amount,
        entryDate: isoToDbDate(input.entryDate),
        account: input.account,
        notes: input.notes,
        createdById: userId,
      },
      select: { id: true },
    });
    await recordActivity(tx, {
      weddingId: membership.weddingId,
      userId,
      actorName: membership.displayName,
      action: "savings.recorded",
      entityType: "savings",
      entityId: entry.id,
      metadata: { name: input.contributor, amount: input.amount.toString() },
    });
    return entry.id;
  });
}

async function findEntryScope(userId: string, entryId: string) {
  if (!isUuid(entryId)) throw new WeddingAccessError();
  const entry = await getDb().savingsEntry.findFirst({
    where: { id: entryId, wedding: memberWeddingWhere(userId) },
    select: { id: true, weddingId: true, contributor: true, amount: true },
  });
  if (!entry) throw new WeddingAccessError();
  const membership = await requireWeddingMember(userId, entry.weddingId);
  return { entry, membership };
}

export async function updateSavingsEntry(userId: string, entryId: string, input: SavingsEntryInput): Promise<void> {
  const { entry, membership } = await findEntryScope(userId, entryId);
  await getDb().$transaction(async (tx) => {
    await tx.savingsEntry.update({
      where: { id: entry.id },
      data: {
        contributor: input.contributor,
        amount: input.amount,
        entryDate: isoToDbDate(input.entryDate),
        account: input.account,
        notes: input.notes,
      },
    });
    await recordActivity(tx, {
      weddingId: entry.weddingId,
      userId,
      actorName: membership.displayName,
      action: "savings.updated",
      entityType: "savings",
      entityId: entry.id,
      metadata: { name: input.contributor, amount: input.amount.toString() },
    });
  });
}

export async function deleteSavingsEntry(userId: string, entryId: string): Promise<void> {
  const { entry, membership } = await findEntryScope(userId, entryId);
  await getDb().$transaction(async (tx) => {
    await tx.savingsEntry.delete({ where: { id: entry.id } });
    await recordActivity(tx, {
      weddingId: entry.weddingId,
      userId,
      actorName: membership.displayName,
      action: "savings.deleted",
      entityType: "savings",
      entityId: entry.id,
      metadata: { name: entry.contributor, amount: entry.amount.toString() },
    });
  });
}

export async function updateSavingsSettings(userId: string, weddingId: string, input: SavingsSettingsInput): Promise<void> {
  const membership = await requireWeddingMember(userId, weddingId);
  await getDb().$transaction(async (tx) => {
    await tx.wedding.update({
      where: { id: membership.weddingId },
      data: { savingsTarget: input.savingsTarget, savingsMonthlyTarget: input.savingsMonthlyTarget },
    });
    await recordActivity(tx, {
      weddingId: membership.weddingId,
      userId,
      actorName: membership.displayName,
      action: "savings.target_updated",
      entityType: "savings",
      metadata: { amount: (input.savingsTarget ?? 0n).toString() },
    });
  });
}
