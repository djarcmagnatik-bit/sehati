import "server-only";
import { headers } from "next/headers";
import { clientIpFromHeaders } from "@/lib/client-ip";
import { getEnv } from "@/lib/env";

/**
 * Client IP / user agent for rate limiting and the session list. The IP only comes from proxy
 * headers written by the TRUSTED_PROXY_COUNT reverse proxies in front of the app; values a client
 * could set itself are ignored, so per-IP limits cannot be bypassed by rotating a header.
 */
export async function getRequestContext(): Promise<{ ipAddress: string | null; userAgent: string | null }> {
  const h = await headers();
  return {
    ipAddress: clientIpFromHeaders(h, getEnv().TRUSTED_PROXY_COUNT),
    userAgent: h.get("user-agent")?.slice(0, 512) ?? null,
  };
}
