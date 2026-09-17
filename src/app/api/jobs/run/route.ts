import { createHash, timingSafeEqual } from "node:crypto";
import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { runWorkerTick } from "@/server/jobs/runner";

export const dynamic = "force-dynamic";

function authorized(header: string | null, secret: string): boolean {
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  // Hash both sides so the comparison is constant-time regardless of length.
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return token.length > 0 && timingSafeEqual(digest(token), digest(secret));
}

/**
 * For hosts without a long-running worker: a scheduler calls this with
 * `Authorization: Bearer $JOBS_CRON_SECRET`. Without the secret configured the endpoint does not exist.
 */
export async function POST(request: Request): Promise<Response> {
  const secret = getEnv().JOBS_CRON_SECRET;
  if (!secret) return new Response("Not Found", { status: 404 });
  if (!authorized(request.headers.get("authorization"), secret)) return new Response("Unauthorized", { status: 401 });

  try {
    const summary = await runWorkerTick(`cron:${process.pid}`);
    return Response.json(summary, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    logger.error("jobs.cron_failed", { error });
    return Response.json({ error: "failed" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
