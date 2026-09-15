import "server-only";
import { headers } from "next/headers";

/**
 * Client IP / user agent for rate limiting and the session list.
 * NOTE: X-Forwarded-For is only trustworthy behind a proxy that overwrites it; configure the
 * production reverse proxy accordingly.
 */
export async function getRequestContext(): Promise<{ ipAddress: string | null; userAgent: string | null }> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || h.get("x-real-ip")?.trim() || null;
  return {
    ipAddress: ip ? ip.slice(0, 64) : null,
    userAgent: h.get("user-agent")?.slice(0, 512) ?? null,
  };
}
