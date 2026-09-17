import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { logger } from "@/lib/logger";
import { processPaymentNotification } from "@/server/billing/billing-service";
import { getPaymentProviderByCode } from "@/server/billing/providers";

const MAX_BODY_BYTES = 64 * 1024;

/**
 * The only way a payment becomes "paid". The provider signs every call; anything unsigned or
 * malformed is refused before it touches the database, and replays are recognised by event key.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ provider: string }> }) {
  const { provider: code } = await context.params;
  const provider = getPaymentProviderByCode(code);
  if (!provider) return Response.json({ error: "unknown_provider" }, { status: 404 });

  // Refuse oversized calls before reading them into memory; the second check covers chunked bodies.
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) return Response.json({ error: "payload_too_large" }, { status: 413 });
  const body = await request.text();
  if (Buffer.byteLength(body) > MAX_BODY_BYTES) return Response.json({ error: "payload_too_large" }, { status: 413 });

  const notification = await provider.parseNotification({ headers: request.headers, body });
  if ("error" in notification) {
    const status = notification.error === "invalid_signature" ? 401 : notification.error === "not_configured" ? 503 : 400;
    logger.warn("billing.webhook_rejected", { provider: code, reason: notification.error });
    return Response.json({ error: notification.error }, { status });
  }

  const fingerprint = notification.eventId ?? createHash("sha256").update(body).digest("hex").slice(0, 40);
  const outcome = await processPaymentNotification({
    provider: provider.code,
    orderId: notification.orderId,
    status: notification.status,
    reportedStatus: notification.reportedStatus,
    amount: notification.amount,
    eventKey: `${provider.code}:${notification.orderId}:${notification.status}:${fingerprint}`.slice(0, 200),
    reference: notification.reference,
    payload: notification.payload,
  });

  logger.info("billing.webhook_processed", { provider: code, orderId: notification.orderId, outcome });
  // 200 for every verified call, including duplicates and unknown orders, so the provider stops retrying.
  return Response.json({ outcome });
}
