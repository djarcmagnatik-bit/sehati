import "server-only";
import { computeChecklistProgress, OPEN_TASK_STATUSES, type TaskStatusValue } from "@/lib/checklist";
import { dbDateToIso, isoToDbDate } from "@/lib/dates";
import { requireWeddingMember } from "@/server/authz/wedding-access";
import { requireWeddingFeature } from "@/server/billing/access";
import { getDb } from "@/server/db";

// ─── Tasks ───────────────────────────────────────────────────────────────────

export type TaskCategoryRow = { id: string; name: string; total: number; completed: number; overdue: number; percent: number };

/** Task report (PRD §39): totals plus a breakdown per category. Free for every wedding. */
export async function getTaskReport(userId: string, weddingId: string, todayIso: string) {
  const membership = await requireWeddingMember(userId, weddingId);
  const db = getDb();
  const id = membership.weddingId;
  const today = isoToDbDate(todayIso);
  const [byStatus, overdueByCategory, categories] = await Promise.all([
    db.task.groupBy({ by: ["categoryId", "status"], where: { weddingId: id }, _count: { _all: true } }),
    db.task.groupBy({
      by: ["categoryId"],
      where: { weddingId: id, status: { in: [...OPEN_TASK_STATUSES] }, dueDate: { lt: today } },
      _count: { _all: true },
    }),
    db.taskCategory.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } }),
  ]);

  const countsByCategory = new Map<string, Partial<Record<TaskStatusValue, number>>>();
  const totals: Partial<Record<TaskStatusValue, number>> = {};
  for (const row of byStatus) {
    const counts = countsByCategory.get(row.categoryId) ?? {};
    counts[row.status] = row._count._all;
    countsByCategory.set(row.categoryId, counts);
    totals[row.status] = (totals[row.status] ?? 0) + row._count._all;
  }
  const overdue = new Map(overdueByCategory.map((row) => [row.categoryId, row._count._all]));

  const rows: TaskCategoryRow[] = categories
    .map((category) => {
      const progress = computeChecklistProgress(countsByCategory.get(category.id) ?? {});
      return { id: category.id, name: category.name, ...progress, overdue: overdue.get(category.id) ?? 0 };
    })
    .filter((row) => row.total > 0);

  return {
    ...computeChecklistProgress(totals),
    overdue: [...overdue.values()].reduce((sum, value) => sum + value, 0),
    cancelled: totals.CANCELLED ?? 0,
    categories: rows,
  };
}

// ─── Guests ──────────────────────────────────────────────────────────────────

export type GuestGroupRow = {
  name: string;
  invitations: number;
  seats: number;
  attendingSeats: number;
  declined: number;
  pending: number;
};

/** Guest report: per-group breakdown and the full list for printing. Requires guest access. */
export async function getGuestReport(userId: string, weddingId: string) {
  const membership = await requireWeddingFeature("guests", userId, weddingId);
  const db = getDb();
  const [groups, guests] = await Promise.all([
    db.$queryRaw<GuestGroupRow[]>`
      SELECT COALESCE(g.name, 'Tanpa grup') AS name,
             COUNT(*)::int AS invitations,
             COALESCE(SUM(t.seat_count), 0)::int AS seats,
             COALESCE(SUM(t.attending_count) FILTER (WHERE t.rsvp_status = 'ATTENDING'), 0)::int AS "attendingSeats",
             COUNT(*) FILTER (WHERE t.rsvp_status = 'DECLINED')::int AS declined,
             COUNT(*) FILTER (WHERE t.rsvp_status = 'PENDING')::int AS pending
      FROM guests t
      LEFT JOIN guest_groups g ON g.id = t.group_id
      WHERE t.wedding_id = ${membership.weddingId}::uuid
      GROUP BY g.id, g.name
      ORDER BY MIN(g.sort_order) NULLS LAST, name
    `,
    db.guest.findMany({
      where: { weddingId: membership.weddingId },
      orderBy: [{ group: { sortOrder: "asc" } }, { invitationName: "asc" }, { id: "asc" }],
      select: {
        id: true,
        invitationName: true,
        seatCount: true,
        rsvpStatus: true,
        attendingCount: true,
        phone: true,
        group: { select: { name: true } },
      },
    }),
  ]);
  return {
    groups,
    guests,
  };
}

// ─── Vendors ─────────────────────────────────────────────────────────────────

export type VendorReportRow = { id: string; name: string; category: string; contract: bigint; paid: bigint; outstanding: bigint; nextDueIso: string | null };

/** Vendor report (PRD §39): contract value, paid and outstanding for every booked vendor. */
export async function getVendorReport(userId: string, weddingId: string) {
  const membership = await requireWeddingFeature("vendors", userId, weddingId);
  const db = getDb();
  const [vendors, payments] = await Promise.all([
    db.vendor.findMany({
      where: { weddingId: membership.weddingId },
      orderBy: [{ category: { sortOrder: "asc" } }, { name: "asc" }, { id: "asc" }],
      select: {
        id: true,
        name: true,
        category: { select: { name: true } },
        expenses: { select: { id: true, totalAmount: true, dueDate: true } },
      },
    }),
    db.payment.groupBy({ by: ["expenseId"], where: { weddingId: membership.weddingId }, _sum: { amount: true } }),
  ]);
  const paidByExpense = new Map(payments.map((row) => [row.expenseId, row._sum.amount ?? 0n]));

  const rows: VendorReportRow[] = vendors.map((vendor) => {
    let contract = 0n;
    let paid = 0n;
    let nextDueIso: string | null = null;
    for (const expense of vendor.expenses) {
      const settled = paidByExpense.get(expense.id) ?? 0n;
      contract += expense.totalAmount;
      paid += settled;
      if (expense.dueDate && settled < expense.totalAmount) {
        const due = dbDateToIso(expense.dueDate);
        if (!nextDueIso || due < nextDueIso) nextDueIso = due;
      }
    }
    return { id: vendor.id, name: vendor.name, category: vendor.category.name, contract, paid, outstanding: contract - paid, nextDueIso };
  });

  const totals = rows.reduce(
    (sum, row) => ({ contract: sum.contract + row.contract, paid: sum.paid + row.paid, outstanding: sum.outstanding + row.outstanding }),
    { contract: 0n, paid: 0n, outstanding: 0n },
  );
  return { rows, totals };
}
