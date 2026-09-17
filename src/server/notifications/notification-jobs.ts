import "server-only";
import { formatCoupleName } from "@/lib/couple";
import { dbDateToIso, todayIsoInTimeZone } from "@/lib/dates";
import { formatRupiah } from "@/lib/money";
import {
  budgetExceededContent,
  DUE_SOON_DAYS,
  OVERDUE_WINDOW_DAYS,
  partnerInvitedContent,
  partnerJoinedContent,
  paymentDueContent,
  rsvpReceivedContent,
  taskDueContent,
  taskOverdueContent,
} from "@/lib/notifications";
import { getWeddingFeatures } from "@/server/billing/access";
import { loadBudgetFigures } from "@/server/budget/budget-service";
import { getDb } from "@/server/db";
import { purgeFinishedJobs, type JobPayload } from "@/server/jobs/queue";
import { deliverNotification, purgeOldNotifications } from "./notification-service";

/**
 * Handlers re-read everything from the database: the payload is only a pointer, so a job that runs
 * late (or twice) acts on the current state and never repeats a notification (dedupe keys).
 */

async function memberIds(weddingId: string): Promise<string[]> {
  const members = await getDb().weddingMember.findMany({ where: { weddingId, wedding: { deletedAt: null } }, select: { userId: true } });
  return members.map((member) => member.userId);
}

export async function handleRsvpReceived({ submissionId }: JobPayload<"notify.rsvp_received">, now: Date): Promise<number> {
  const db = getDb();
  const submission = await db.rsvpSubmission.findUnique({
    where: { id: submissionId },
    select: {
      id: true,
      weddingId: true,
      rsvpStatus: true,
      attendingCount: true,
      guest: { select: { id: true, invitationName: true } },
    },
  });
  // Deleted since, or the wedding lost guest access: nothing to tell.
  if (!submission) return 0;
  if (!(await getWeddingFeatures(submission.weddingId, now)).has("guests")) return 0;
  return deliverNotification(
    db,
    await memberIds(submission.weddingId),
    {
      weddingId: submission.weddingId,
      type: "RSVP_RECEIVED",
      dedupeKey: `rsvp:${submission.id}`,
      content: rsvpReceivedContent({
        guestId: submission.guest.id,
        guestName: submission.guest.invitationName,
        status: submission.rsvpStatus,
        count: submission.attendingCount,
      }),
    },
    now,
  );
}

export async function handlePartnerInvited({ invitationId }: JobPayload<"notify.partner_invited">, now: Date): Promise<number> {
  const db = getDb();
  const invitation = await db.partnerInvitation.findUnique({
    where: { id: invitationId },
    select: {
      id: true,
      email: true,
      status: true,
      expiresAt: true,
      invitedBy: { select: { name: true } },
      wedding: { select: { brideName: true, groomName: true, coupleDisplayFormat: true, customDisplayName: true, deletedAt: true } },
    },
  });
  if (!invitation || invitation.status !== "PENDING" || invitation.expiresAt <= now || invitation.wedding.deletedAt) return 0;
  // Only an account that already exists with exactly this email is told; nobody else learns anything.
  const invitee = await db.user.findUnique({ where: { email: invitation.email }, select: { id: true } });
  if (!invitee) return 0;
  return deliverNotification(
    db,
    [invitee.id],
    {
      weddingId: null,
      type: "PARTNER_INVITED",
      dedupeKey: `partner_invited:${invitation.id}`,
      content: partnerInvitedContent({
        inviterName: invitation.invitedBy?.name ?? "Pasanganmu",
        coupleName: formatCoupleName({
          brideName: invitation.wedding.brideName,
          groomName: invitation.wedding.groomName,
          format: invitation.wedding.coupleDisplayFormat,
          customDisplayName: invitation.wedding.customDisplayName,
        }),
        expiresIso: todayIsoInTimeZone(invitation.expiresAt),
      }),
    },
    now,
  );
}

export async function handlePartnerJoined({ memberId }: JobPayload<"notify.partner_joined">, now: Date): Promise<number> {
  const db = getDb();
  const member = await db.weddingMember.findUnique({ where: { id: memberId }, select: { id: true, weddingId: true, userId: true, displayName: true } });
  if (!member) return 0;
  const others = (await memberIds(member.weddingId)).filter((userId) => userId !== member.userId);
  return deliverNotification(
    db,
    others,
    { weddingId: member.weddingId, type: "PARTNER_JOINED", dedupeKey: `partner_joined:${member.id}`, content: partnerJoinedContent({ name: member.displayName }) },
    now,
  );
}

/**
 * Tells the couple once per crossing: the key includes the limit, so raising the target and going
 * over it again is a new event, while more spending above the same limit is not.
 */
export async function handleBudgetCheck({ weddingId }: JobPayload<"budget.check">, now: Date): Promise<number> {
  if (!(await getWeddingFeatures(weddingId, now)).has("budget")) return 0;
  const recipients = await memberIds(weddingId);
  if (recipients.length === 0) return 0;
  const figures = await loadBudgetFigures(weddingId);
  const db = getDb();
  let delivered = 0;

  const { target, committed } = figures.totals;
  if (target !== null && target > 0n && committed > target) {
    delivered += await deliverNotification(
      db,
      recipients,
      {
        weddingId,
        type: "BUDGET_EXCEEDED",
        dedupeKey: `budget_over:total:${target}`,
        content: budgetExceededContent({ scope: "total", committed: formatRupiah(committed), limit: formatRupiah(target) }),
      },
      now,
    );
  }
  for (const category of figures.categories) {
    // Categories without an allocation are shown on the budget page; they are not alarms.
    if (category.allocated <= 0n || category.committed <= category.allocated) continue;
    delivered += await deliverNotification(
      db,
      recipients,
      {
        weddingId,
        type: "BUDGET_EXCEEDED",
        dedupeKey: `budget_over:category:${category.id}:${category.allocated}`,
        content: budgetExceededContent({
          scope: "category",
          categoryId: category.id,
          name: category.name,
          committed: formatRupiah(category.committed),
          limit: formatRupiah(category.allocated),
        }),
      },
      now,
    );
  }
  return delivered;
}

type TaskGroupRow = { wedding_id: string; time_zone: string; due_date: Date; total: number; titles: string[] };
type PaymentRow = { id: string; wedding_id: string; time_zone: string; title: string; due_date: Date; outstanding: bigint };

/**
 * Periodic reminders. Tasks are grouped per due date (a generated checklist often puts several on
 * the same day); payments are per obligation. "Today" is each wedding's own time zone.
 */
export async function handleRemindersScan(_payload: JobPayload<"reminders.scan">, now: Date): Promise<number> {
  const db = getDb();
  const taskGroups = await db.$queryRaw<TaskGroupRow[]>`
    SELECT t.wedding_id::text AS wedding_id, w.time_zone, t.due_date, COUNT(*)::int AS total,
           (ARRAY_AGG(t.title ORDER BY t.title))[1:2] AS titles
    FROM tasks t
    JOIN weddings w ON w.id = t.wedding_id AND w.deleted_at IS NULL
    WHERE t.status IN ('TODO', 'IN_PROGRESS')
      AND t.due_date BETWEEN (${now}::timestamptz AT TIME ZONE w.time_zone)::date - ${OVERDUE_WINDOW_DAYS}::int
                         AND (${now}::timestamptz AT TIME ZONE w.time_zone)::date + ${DUE_SOON_DAYS - 1}::int
    GROUP BY t.wedding_id, w.time_zone, t.due_date
  `;
  const payments = await db.$queryRaw<PaymentRow[]>`
    SELECT e.id::text AS id, e.wedding_id::text AS wedding_id, w.time_zone, e.title, e.due_date,
           e.total_amount - COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.expense_id = e.id), 0) AS outstanding
    FROM expenses e
    JOIN weddings w ON w.id = e.wedding_id AND w.deleted_at IS NULL
    WHERE e.due_date BETWEEN (${now}::timestamptz AT TIME ZONE w.time_zone)::date
                         AND (${now}::timestamptz AT TIME ZONE w.time_zone)::date + ${DUE_SOON_DAYS - 1}::int
      AND e.total_amount > COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.expense_id = e.id), 0)
  `;

  const members = new Map<string, string[]>();
  const recipientsOf = async (weddingId: string) => {
    if (!members.has(weddingId)) members.set(weddingId, await memberIds(weddingId));
    return members.get(weddingId)!;
  };
  let delivered = 0;

  for (const group of taskGroups) {
    const todayIso = todayIsoInTimeZone(now, group.time_zone);
    const dueIso = dbDateToIso(group.due_date);
    const overdue = dueIso < todayIso;
    delivered += await deliverNotification(
      db,
      await recipientsOf(group.wedding_id),
      {
        weddingId: group.wedding_id,
        type: overdue ? "TASK_OVERDUE" : "TASK_DUE",
        dedupeKey: `${overdue ? "task_overdue" : "task_due"}:${group.wedding_id}:${dueIso}`,
        content: overdue
          ? taskOverdueContent({ dueIso, count: group.total, titles: group.titles })
          : taskDueContent({ dueIso, todayIso, count: group.total, titles: group.titles }),
      },
      now,
    );
  }

  const budgetAccess = new Map<string, boolean>();
  for (const payment of payments) {
    if (!budgetAccess.has(payment.wedding_id)) {
      budgetAccess.set(payment.wedding_id, (await getWeddingFeatures(payment.wedding_id, now)).has("budget"));
    }
    if (!budgetAccess.get(payment.wedding_id)) continue;
    const dueIso = dbDateToIso(payment.due_date);
    delivered += await deliverNotification(
      db,
      await recipientsOf(payment.wedding_id),
      {
        weddingId: payment.wedding_id,
        type: "PAYMENT_DUE",
        dedupeKey: `payment_due:${payment.id}:${dueIso}`,
        content: paymentDueContent({
          expenseId: payment.id,
          title: payment.title,
          dueIso,
          todayIso: todayIsoInTimeZone(now, payment.time_zone),
          outstanding: formatRupiah(BigInt(payment.outstanding)),
        }),
      },
      now,
    );
  }
  return delivered;
}

export async function handleMaintenanceCleanup(_payload: JobPayload<"maintenance.cleanup">, now: Date): Promise<number> {
  return (await purgeFinishedJobs(now)) + (await purgeOldNotifications(now));
}

