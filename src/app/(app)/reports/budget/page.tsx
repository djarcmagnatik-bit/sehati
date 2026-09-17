import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BudgetWarningBadge } from "@/components/budget/badges";
import { MoneyStat } from "@/components/budget/money-stat";
import { ExportLinks } from "@/components/reports/export-links";
import { REPORT_TABLE_CLASS, REPORT_TD_CLASS, REPORT_TH_CLASS, ReportHeader } from "@/components/reports/report-header";
import { Card } from "@/components/ui/card";
import { formatCoupleName } from "@/lib/couple";
import { formatDateTime } from "@/lib/dates";
import { formatRupiah } from "@/lib/money";
import { requireSession } from "@/server/auth/session-cookie";
import { getBudgetOverview } from "@/server/budget/budget-service";
import { getActiveWeddingForUser } from "@/server/wedding/wedding-service";

export const metadata: Metadata = { title: "Laporan budget" };

export default async function BudgetReportPage() {
  const session = await requireSession();
  const membership = await getActiveWeddingForUser(session.user.id);
  if (!membership) redirect("/onboarding");
  const { wedding } = membership;
  const budget = await getBudgetOverview(session.user.id, wedding.id);
  const { totals } = budget;
  const coupleName = formatCoupleName({
    brideName: wedding.brideName,
    groomName: wedding.groomName,
    format: wedding.coupleDisplayFormat,
    customDisplayName: wedding.customDisplayName,
  });

  return (
    <div className="space-y-6">
      <ReportHeader
        title="Laporan budget"
        description="Target, alokasi, komitmen, dan pembayaran per kategori."
        printedFor={`${coupleName} · dicetak ${formatDateTime(new Date(), wedding.timeZone)}`}
      />

      <Card title="Ringkasan">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <MoneyStat label="Target budget" amount={totals.target} testId="budget-report-target" />
          <MoneyStat label="Dialokasikan" amount={totals.allocated} />
          <MoneyStat label="Komitmen (pengeluaran)" amount={totals.committed} testId="budget-report-committed" />
          <MoneyStat label="Dibayar" amount={totals.paid} testId="budget-report-paid" />
          <MoneyStat label="Belum dibayar" amount={totals.unpaid} testId="budget-report-unpaid" />
          <MoneyStat label="Sisa dari target" amount={totals.remaining} />
        </dl>
        {totals.overAllocated ? <p className="mt-4 text-sm text-danger-600">⚠ Alokasi kategori melebihi target budget.</p> : null}
      </Card>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-xl font-semibold">Per kategori</h2>
        </div>
        <div className="overflow-x-auto rounded-3xl border border-cream-200 bg-white p-4 print:border-0 print:p-0">
          <table className={REPORT_TABLE_CLASS} data-testid="budget-report-table">
            <caption className="sr-only">Budget per kategori</caption>
            <thead>
              <tr>
                <th scope="col" className={REPORT_TH_CLASS}>Kategori</th>
                <th scope="col" className={`${REPORT_TH_CLASS} text-right`}>Alokasi</th>
                <th scope="col" className={`${REPORT_TH_CLASS} text-right`}>Komitmen</th>
                <th scope="col" className={`${REPORT_TH_CLASS} text-right`}>Dibayar</th>
                <th scope="col" className={`${REPORT_TH_CLASS} text-right`}>Belum dibayar</th>
              </tr>
            </thead>
            <tbody>
              {budget.categories.map((category) => (
                <tr key={category.id}>
                  <th scope="row" className={`${REPORT_TD_CLASS} font-medium`}>
                    {category.name} <BudgetWarningBadge level={category.warning} />
                  </th>
                  <td className={`${REPORT_TD_CLASS} text-right tabular-nums whitespace-nowrap`}>{formatRupiah(category.allocated)}</td>
                  <td className={`${REPORT_TD_CLASS} text-right tabular-nums whitespace-nowrap`}>{formatRupiah(category.committed)}</td>
                  <td className={`${REPORT_TD_CLASS} text-right tabular-nums whitespace-nowrap`}>{formatRupiah(category.paid)}</td>
                  <td className={`${REPORT_TD_CLASS} text-right tabular-nums whitespace-nowrap`}>{formatRupiah(category.outstanding)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-semibold">
                <th scope="row" className="py-2 pr-3">Total</th>
                <td className="py-2 pr-3 text-right tabular-nums whitespace-nowrap">{formatRupiah(totals.allocated)}</td>
                <td className="py-2 pr-3 text-right tabular-nums whitespace-nowrap">{formatRupiah(totals.committed)}</td>
                <td className="py-2 pr-3 text-right tabular-nums whitespace-nowrap">{formatRupiah(totals.paid)}</td>
                <td className="py-2 pr-3 text-right tabular-nums whitespace-nowrap">{formatRupiah(totals.unpaid)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <Card title="Unduh" description="Semua pengeluaran dan riwayat pembayaran." className="print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 py-1">
          <span className="font-medium">Pengeluaran</span>
          <ExportLinks dataset="expenses" compact />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-cream-200 pt-3">
          <span className="font-medium">Pembayaran</span>
          <ExportLinks dataset="payments" compact />
        </div>
      </Card>
    </div>
  );
}
