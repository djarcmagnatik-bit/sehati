import "server-only";
import { formatCoupleName } from "@/lib/couple";
import { dbDateToIso, describeCountdown, formatIsoDateLong, formatIsoDateShort, getWeddingCountdown, todayIsoInTimeZone } from "@/lib/dates";
import { formatRupiah } from "@/lib/money";
import { percent, type ProgressCardOptions } from "@/lib/reports";
import { requireWeddingMember } from "@/server/authz/wedding-access";
import { getWeddingFeatures } from "@/server/billing/access";
import { getBudgetOverview } from "@/server/budget/budget-service";
import { getChecklistSummary, getUpcomingTasks } from "@/server/checklist/task-service";
import { getDb } from "@/server/db";
import { getGuestSummary } from "@/server/guests/guest-service";

export type ProgressCard = {
  coupleName: string;
  weddingDateLabel: string;
  countdownLabel: string;
  countdownDays: number | null;
  checklist: { completed: number; total: number; percent: number } | null;
  nextTasks: Array<{ title: string; dueLabel: string }> | null;
  guests: { attendingSeats: number; invitations: number; respondedPercent: number } | null;
  budget: { usedPercent: number | null; paidPercent: number | null; committed: string | null; target: string | null; paid: string | null } | null;
  /** Options that were asked for but are not part of this wedding's access. */
  unavailable: Array<"guests" | "budget">;
};

/**
 * Everything a shareable card may show, limited to what the member chose. The countdown and names
 * are always included; money only appears when `budget` (percentages) or `budgetAmounts` is chosen.
 */
export async function getProgressCard(userId: string, weddingId: string, options: ProgressCardOptions, now: Date = new Date()): Promise<ProgressCard> {
  const membership = await requireWeddingMember(userId, weddingId);
  const id = membership.weddingId;
  const wedding = await getDb().wedding.findUniqueOrThrow({
    where: { id },
    select: { brideName: true, groomName: true, coupleDisplayFormat: true, customDisplayName: true, weddingDate: true, timeZone: true },
  });
  const weddingDateIso = dbDateToIso(wedding.weddingDate);
  const todayIso = todayIsoInTimeZone(now, wedding.timeZone);
  const countdown = getWeddingCountdown(weddingDateIso, now, wedding.timeZone);
  const features = await getWeddingFeatures(id, now);
  const unavailable: ProgressCard["unavailable"] = [];
  if (options.guests && !features.has("guests")) unavailable.push("guests");
  if (options.budget && !features.has("budget")) unavailable.push("budget");

  const [checklist, upcoming, guests, budget] = await Promise.all([
    options.checklist ? getChecklistSummary(userId, id, todayIso) : null,
    options.nextTasks ? getUpcomingTasks(userId, id, 3) : null,
    options.guests && features.has("guests") ? getGuestSummary(userId, id) : null,
    options.budget && features.has("budget") ? getBudgetOverview(userId, id) : null,
  ]);

  const totals = budget?.totals;
  const target = totals?.target ?? null;
  return {
    coupleName: formatCoupleName({
      brideName: wedding.brideName,
      groomName: wedding.groomName,
      format: wedding.coupleDisplayFormat,
      customDisplayName: wedding.customDisplayName,
    }),
    weddingDateLabel: formatIsoDateLong(weddingDateIso),
    countdownLabel: describeCountdown(countdown),
    countdownDays: countdown.state === "upcoming" ? countdown.days : null,
    checklist: checklist ? { completed: checklist.completed, total: checklist.total, percent: checklist.percent } : null,
    nextTasks: upcoming
      ? upcoming.map((task) => ({ title: task.title, dueLabel: task.dueDate ? formatIsoDateShort(dbDateToIso(task.dueDate)) : "" }))
      : null,
    guests: guests
      ? {
          attendingSeats: guests.attendingSeats,
          invitations: guests.invitations,
          respondedPercent: percent(guests.invitations - guests.pendingInvitations, guests.invitations),
        }
      : null,
    budget: totals
      ? {
          usedPercent: target && target > 0n ? Number((totals.committed * 100n) / target) : null,
          paidPercent: totals.committed > 0n ? Number((totals.paid * 100n) / totals.committed) : null,
          committed: options.budgetAmounts ? formatRupiah(totals.committed) : null,
          target: options.budgetAmounts && target !== null ? formatRupiah(target) : null,
          paid: options.budgetAmounts ? formatRupiah(totals.paid) : null,
        }
      : null,
    unavailable,
  };
}
