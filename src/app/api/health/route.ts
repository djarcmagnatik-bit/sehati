import { logger } from "@/lib/logger";
import { getDb } from "@/server/db";

export const dynamic = "force-dynamic";

const HEADERS = { "Cache-Control": "no-store" };

/**
 * Liveness/readiness probe for the load balancer or uptime monitor. Reports only whether the app can
 * reach its database — no versions, counts or configuration.
 */
export async function GET(): Promise<Response> {
  try {
    await getDb().$queryRaw`SELECT 1`;
    return Response.json({ status: "ok" }, { headers: HEADERS });
  } catch (error) {
    logger.error("health.database_unreachable", { error });
    return Response.json({ status: "unavailable" }, { status: 503, headers: HEADERS });
  }
}
