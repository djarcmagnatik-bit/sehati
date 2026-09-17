import "server-only";
import { getDb } from "@/server/db";
import { requireAdmin } from "./admin-access";

export type AdminStats = {
  totalUsers: number;
  suspendedUsers: number;
  totalWeddings: number;
  /** Planning, not deleted, wedding date today or later. */
  activeWeddings: number;
  /** Weddings with a purchased entitlement that is not revoked. */
  paidWeddings: number;
  /** Paid minus refunded, whole rupiah. */
  revenue: bigint;
  paidTransactions: number;
  /** paid weddings / all weddings, in percent with one decimal. */
  conversionRate: number | null;
  rsvpSubmissions: number;
  invitationsPublished: number;
  generatedAt: Date;
};

const CACHE_TTL_MS = 5 * 60 * 1000;
let cached: AdminStats | null = null;

/** One round of aggregate counts. Kept cheap: every figure is a single indexed count or sum. */
async function computeStats(now: Date): Promise<AdminStats> {
  const rows = await getDb().$queryRaw<
    Array<{
      total_users: number;
      suspended_users: number;
      total_weddings: number;
      active_weddings: number;
      paid_weddings: number;
      revenue: bigint | null;
      paid_transactions: number;
      rsvp_submissions: number;
      invitations_published: number;
    }>
  >`
    SELECT
      (SELECT COUNT(*)::int FROM users) AS total_users,
      (SELECT COUNT(*)::int FROM users WHERE suspended_at IS NOT NULL) AS suspended_users,
      (SELECT COUNT(*)::int FROM weddings WHERE deleted_at IS NULL) AS total_weddings,
      (SELECT COUNT(*)::int FROM weddings WHERE deleted_at IS NULL AND status = 'PLANNING' AND wedding_date >= ${now}::date) AS active_weddings,
      (SELECT COUNT(DISTINCT wedding_id)::int FROM wedding_entitlements WHERE source = 'PURCHASE' AND revoked_at IS NULL) AS paid_weddings,
      (SELECT COALESCE(SUM(amount), 0) FROM payment_transactions WHERE status = 'PAID') AS revenue,
      (SELECT COUNT(*)::int FROM payment_transactions WHERE status = 'PAID') AS paid_transactions,
      (SELECT COUNT(*)::int FROM rsvp_submissions) AS rsvp_submissions,
      (SELECT COUNT(*)::int FROM invitations WHERE status = 'PUBLISHED') AS invitations_published
  `;
  const row = rows[0]!;
  return {
    totalUsers: row.total_users,
    suspendedUsers: row.suspended_users,
    totalWeddings: row.total_weddings,
    activeWeddings: row.active_weddings,
    paidWeddings: row.paid_weddings,
    revenue: BigInt(row.revenue ?? 0),
    paidTransactions: row.paid_transactions,
    conversionRate: row.total_weddings > 0 ? Math.round((row.paid_weddings / row.total_weddings) * 1000) / 10 : null,
    rsvpSubmissions: row.rsvp_submissions,
    invitationsPublished: row.invitations_published,
    generatedAt: now,
  };
}

/**
 * Dashboard figures, cached for five minutes per server instance (PRD §45: no expensive realtime
 * aggregation on every request). `fresh` bypasses the cache.
 */
export async function getAdminStats(userId: string, options: { fresh?: boolean; now?: Date } = {}): Promise<AdminStats> {
  await requireAdmin(userId);
  const now = options.now ?? new Date();
  if (!options.fresh && cached && now.getTime() - cached.generatedAt.getTime() < CACHE_TTL_MS) return cached;
  cached = await computeStats(now);
  return cached;
}
