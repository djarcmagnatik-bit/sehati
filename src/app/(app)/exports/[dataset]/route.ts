import { redirect } from "next/navigation";
import { todayIsoInTimeZone } from "@/lib/dates";
import { toCsv } from "@/lib/export/table";
import { logger } from "@/lib/logger";
import {
  EXPORT_CONTENT_TYPE,
  EXPORT_DATASET_FEATURE,
  exportFilename,
  isExportDataset,
  parseExportFormat,
} from "@/lib/reports";
import { consumeRateLimit, RATE_LIMITS } from "@/server/auth/rate-limit";
import { requireSession } from "@/server/auth/session-cookie";
import { WeddingAccessError } from "@/server/authz/wedding-access";
import { FeatureLockedError } from "@/server/billing/access";
import { buildExport, toXlsxBuffer } from "@/server/reports/export-service";
import { getActiveWeddingForUser } from "@/server/wedding/wedding-service";

export const dynamic = "force-dynamic";

const PRIVATE_HEADERS = { "Cache-Control": "private, no-store" };

/** Downloads one dataset of the member's own wedding as CSV or XLSX. */
export async function GET(request: Request, { params }: { params: Promise<{ dataset: string }> }): Promise<Response> {
  const { dataset } = await params;
  const format = parseExportFormat(new URL(request.url).searchParams.get("format"));
  if (!isExportDataset(dataset) || !format) return new Response("Not Found", { status: 404, headers: PRIVATE_HEADERS });

  const session = await requireSession();
  const membership = await getActiveWeddingForUser(session.user.id);
  if (!membership) redirect("/onboarding");

  const limit = await consumeRateLimit(`export:${session.user.id}`, RATE_LIMITS.exportPerUser);
  if (!limit.allowed) {
    return new Response("Terlalu banyak unduhan. Coba lagi nanti.", { status: 429, headers: { ...PRIVATE_HEADERS, "Retry-After": "3600" } });
  }

  let body: string | Buffer;
  try {
    const table = await buildExport(session.user.id, membership.wedding.id, dataset, format);
    body = format === "csv" ? toCsv(table) : await toXlsxBuffer(table);
  } catch (error) {
    if (error instanceof FeatureLockedError) redirect(`/billing?feature=${EXPORT_DATASET_FEATURE[dataset]}`);
    if (error instanceof WeddingAccessError) return new Response("Not Found", { status: 404, headers: PRIVATE_HEADERS });
    logger.error("export.failed", { error, dataset, format });
    return new Response("Export gagal. Silakan coba lagi.", { status: 500, headers: PRIVATE_HEADERS });
  }

  const filename = exportFilename(dataset, format, todayIsoInTimeZone(new Date(), membership.wedding.timeZone));
  return new Response(typeof body === "string" ? body : new Uint8Array(body), {
    headers: {
      ...PRIVATE_HEADERS,
      "Content-Type": EXPORT_CONTENT_TYPE[format],
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
