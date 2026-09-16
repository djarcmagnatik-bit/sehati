import "server-only";
import { getDb } from "@/server/db";

export type RateLimitRule = { limit: number; windowSeconds: number };

export const RATE_LIMITS = {
  loginPerIp: { limit: 30, windowSeconds: 15 * 60 },
  loginPerEmail: { limit: 8, windowSeconds: 15 * 60 },
  registerPerIp: { limit: 20, windowSeconds: 60 * 60 },
  forgotPasswordPerIp: { limit: 20, windowSeconds: 60 * 60 },
  forgotPasswordPerEmail: { limit: 5, windowSeconds: 60 * 60 },
  resetPasswordPerIp: { limit: 20, windowSeconds: 60 * 60 },
  partnerInvitePerUser: { limit: 10, windowSeconds: 60 * 60 },
  invitationResponsePerUser: { limit: 20, windowSeconds: 60 * 60 },
  guestImportPerUser: { limit: 30, windowSeconds: 60 * 60 },
} as const satisfies Record<string, RateLimitRule>;

/**
 * Atomic fixed-window counter in PostgreSQL. A single upsert increments the bucket, or restarts it
 * when the window has elapsed, so concurrent requests cannot bypass the limit.
 */
export async function consumeRateLimit(
  key: string,
  rule: RateLimitRule,
): Promise<{ allowed: boolean; count: number }> {
  const rows = await getDb().$queryRaw<Array<{ count: number }>>`
    INSERT INTO rate_limit_buckets (key, count, window_started_at)
    VALUES (${key}, 1, now())
    ON CONFLICT (key) DO UPDATE SET
      count = CASE
        WHEN rate_limit_buckets.window_started_at <= now() - make_interval(secs => ${rule.windowSeconds}::double precision)
        THEN 1
        ELSE rate_limit_buckets.count + 1
      END,
      window_started_at = CASE
        WHEN rate_limit_buckets.window_started_at <= now() - make_interval(secs => ${rule.windowSeconds}::double precision)
        THEN now()
        ELSE rate_limit_buckets.window_started_at
      END
    RETURNING count
  `;
  const count = Number(rows[0]?.count ?? 0);
  return { allowed: count <= rule.limit, count };
}
