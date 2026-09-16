import { IMPORT_TEMPLATE_CSV } from "@/lib/guest-import";

/** Static CSV template. The BOM makes Excel open it as UTF-8. */
export function GET() {
  return new Response(`\uFEFF${IMPORT_TEMPLATE_CSV}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="template-tamu.csv"',
      "Cache-Control": "no-store",
    },
  });
}
