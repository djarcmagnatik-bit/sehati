import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { MoneyStat } from "@/components/budget/money-stat";
import { ExportLinks } from "@/components/reports/export-links";
import { REPORT_TABLE_CLASS, REPORT_TD_CLASS, REPORT_TH_CLASS, ReportHeader } from "@/components/reports/report-header";
import { Card } from "@/components/ui/card";
import { formatCoupleName } from "@/lib/couple";
import { formatDateTime, formatIsoDateShort } from "@/lib/dates";
import { formatRupiah } from "@/lib/money";
import { requireSession } from "@/server/auth/session-cookie";
import { getVendorReport } from "@/server/reports/report-service";
import { getActiveWeddingForUser } from "@/server/wedding/wedding-service";

export const metadata: Metadata = { title: "Laporan vendor" };

export default async function VendorReportPage() {
  const session = await requireSession();
  const membership = await getActiveWeddingForUser(session.user.id);
  if (!membership) redirect("/onboarding");
  const { wedding } = membership;
  const report = await getVendorReport(session.user.id, wedding.id);
  const coupleName = formatCoupleName({
    brideName: wedding.brideName,
    groomName: wedding.groomName,
    format: wedding.coupleDisplayFormat,
    customDisplayName: wedding.customDisplayName,
  });

  return (
    <div className="space-y-6">
      <ReportHeader
        title="Laporan vendor"
        description="Nilai kontrak, yang sudah dibayar, dan sisa tagihan setiap vendor."
        printedFor={`${coupleName} · dicetak ${formatDateTime(new Date(), wedding.timeZone)}`}
        actions={<ExportLinks dataset="vendors" />}
      />

      <Card title="Ringkasan">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <dt className="text-xs text-ink-500">Vendor</dt>
            <dd className="mt-0.5 font-semibold tabular-nums">{report.rows.length}</dd>
          </div>
          <MoneyStat label="Nilai kontrak" amount={report.totals.contract} testId="vendor-report-contract" />
          <MoneyStat label="Dibayar" amount={report.totals.paid} testId="vendor-report-paid" />
          <MoneyStat label="Sisa" amount={report.totals.outstanding} testId="vendor-report-outstanding" />
        </dl>
      </Card>

      {report.rows.length === 0 ? (
        <p className="text-sm text-ink-700">
          Belum ada vendor yang dibooking.{" "}
          <Link href="/vendors" className="font-semibold text-clay-700 underline-offset-4 hover:underline print:hidden">
            Kelola vendor
          </Link>
        </p>
      ) : (
        <div className="overflow-x-auto rounded-3xl border border-cream-200 bg-white p-4 print:border-0 print:p-0">
          <table className={REPORT_TABLE_CLASS} data-testid="vendor-report-table">
            <caption className="sr-only">Keuangan per vendor</caption>
            <thead>
              <tr>
                <th scope="col" className={REPORT_TH_CLASS}>Vendor</th>
                <th scope="col" className={REPORT_TH_CLASS}>Kategori</th>
                <th scope="col" className={`${REPORT_TH_CLASS} text-right`}>Kontrak</th>
                <th scope="col" className={`${REPORT_TH_CLASS} text-right`}>Dibayar</th>
                <th scope="col" className={`${REPORT_TH_CLASS} text-right`}>Sisa</th>
                <th scope="col" className={REPORT_TH_CLASS}>Jatuh tempo berikutnya</th>
              </tr>
            </thead>
            <tbody>
              {report.rows.map((row) => (
                <tr key={row.id}>
                  <th scope="row" className={`${REPORT_TD_CLASS} font-medium`}>
                    <Link href={`/vendors/${row.id}`} className="underline-offset-4 hover:underline print:no-underline">
                      {row.name}
                    </Link>
                  </th>
                  <td className={REPORT_TD_CLASS}>{row.category}</td>
                  <td className={`${REPORT_TD_CLASS} text-right tabular-nums whitespace-nowrap`}>{formatRupiah(row.contract)}</td>
                  <td className={`${REPORT_TD_CLASS} text-right tabular-nums whitespace-nowrap`}>{formatRupiah(row.paid)}</td>
                  <td className={`${REPORT_TD_CLASS} text-right tabular-nums whitespace-nowrap`}>{formatRupiah(row.outstanding)}</td>
                  <td className={`${REPORT_TD_CLASS} whitespace-nowrap`}>{row.nextDueIso ? formatIsoDateShort(row.nextDueIso) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
