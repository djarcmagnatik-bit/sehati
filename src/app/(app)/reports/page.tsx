import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { MoneyStat } from "@/components/budget/money-stat";
import { ExportLinks } from "@/components/reports/export-links";
import { buttonClassName } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PrintButton } from "@/components/ui/print-button";
import { ProgressBar } from "@/components/ui/progress-bar";
import { FEATURE_LABEL, type Feature } from "@/lib/billing";
import { formatCoupleName } from "@/lib/couple";
import { formatDateTime, todayIsoInTimeZone } from "@/lib/dates";
import { EXPORT_DATASET_FEATURE, EXPORT_DATASET_LABEL, EXPORT_DATASETS } from "@/lib/reports";
import { requireSession } from "@/server/auth/session-cookie";
import { getWeddingFeatures } from "@/server/billing/access";
import { getBudgetOverview } from "@/server/budget/budget-service";
import { getGuestSummary } from "@/server/guests/guest-service";
import { getTaskReport } from "@/server/reports/report-service";
import { getVendorSummary } from "@/server/vendors/vendor-service";
import { getActiveWeddingForUser } from "@/server/wedding/wedding-service";

export const metadata: Metadata = { title: "Laporan" };

const LINK_CLASS = "text-sm font-semibold text-clay-700 underline-offset-4 hover:underline print:hidden";

function Count({ label, value, testId }: { label: string; value: number | string; testId?: string }) {
  return (
    <div>
      <dt className="text-xs text-ink-500">{label}</dt>
      <dd data-testid={testId} className="mt-0.5 font-semibold text-ink-900 tabular-nums">
        {typeof value === "number" ? value.toLocaleString("id-ID") : value}
      </dd>
    </div>
  );
}

function Locked({ title, feature }: { title: string; feature: Feature }) {
  return (
    <Card title={title} className="print:hidden">
      <p className="text-sm text-ink-700">
        <span aria-hidden="true">🔒 </span>
        {FEATURE_LABEL[feature]} tersedia di Akses Penuh.
      </p>
      <Link href={`/billing?feature=${feature}`} className={`mt-3 inline-block ${LINK_CLASS}`}>
        Lihat Akses Penuh
      </Link>
    </Card>
  );
}

export default async function ReportsPage() {
  const session = await requireSession();
  const membership = await getActiveWeddingForUser(session.user.id);
  if (!membership) redirect("/onboarding");
  const { wedding } = membership;
  const now = new Date();
  const todayIso = todayIsoInTimeZone(now, wedding.timeZone);

  const features = await getWeddingFeatures(wedding.id);
  const when = <T,>(feature: Feature, load: () => Promise<T>) => (features.has(feature) ? load() : Promise.resolve(null));
  const [tasks, budget, guests, vendors] = await Promise.all([
    getTaskReport(session.user.id, wedding.id, todayIso),
    when("budget", () => getBudgetOverview(session.user.id, wedding.id)),
    when("guests", () => getGuestSummary(session.user.id, wedding.id)),
    when("vendors", () => getVendorSummary(session.user.id, wedding.id)),
  ]);
  const coupleName = formatCoupleName({
    brideName: wedding.brideName,
    groomName: wedding.groomName,
    format: wedding.coupleDisplayFormat,
    customDisplayName: wedding.customDisplayName,
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">Laporan</h1>
          <p className="mt-1 text-ink-700">
            <span className="print:hidden">Ringkasan persiapan pernikahan, siap dicetak atau diunduh.</span>
            <span className="hidden print:inline">
              {coupleName} · dicetak {formatDateTime(now, wedding.timeZone)}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <PrintButton label="Cetak ringkasan" />
          <Link href="/reports/share" className={buttonClassName("primary")}>
            Kartu progres
          </Link>
        </div>
      </header>

      <Card title="Tugas">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Count label="Total tugas" value={tasks.total} testId="report-tasks-total" />
          <Count label="Selesai" value={tasks.completed} testId="report-tasks-completed" />
          <Count label="Terlambat" value={tasks.overdue} testId="report-tasks-overdue" />
          <Count label="Progres" value={`${tasks.percent}%`} testId="report-tasks-percent" />
        </dl>
        <ProgressBar percent={tasks.percent} label="Progres checklist" className="mt-4" />
        {tasks.categories.length > 0 ? (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[28rem] text-left text-sm">
              <caption className="sr-only">Progres per kategori tugas</caption>
              <thead>
                <tr className="border-b border-cream-200 text-ink-500">
                  <th scope="col" className="py-2 pr-3 font-medium">Kategori</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">Selesai</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">Terlambat</th>
                  <th scope="col" className="py-2 text-right font-medium">Progres</th>
                </tr>
              </thead>
              <tbody>
                {tasks.categories.map((row) => (
                  <tr key={row.id} className="border-b border-cream-200 last:border-0">
                    <th scope="row" className="py-2 pr-3 font-medium">{row.name}</th>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {row.completed}/{row.total}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">{row.overdue}</td>
                    <td className="py-2 text-right tabular-nums">{row.percent}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Card>

      {budget ? (
        <Card title="Budget">
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <MoneyStat label="Target" amount={budget.totals.target} />
            <MoneyStat label="Dialokasikan" amount={budget.totals.allocated} />
            <MoneyStat label="Komitmen" amount={budget.totals.committed} testId="report-budget-committed" />
            <MoneyStat label="Dibayar" amount={budget.totals.paid} />
            <MoneyStat label="Belum dibayar" amount={budget.totals.unpaid} />
            <MoneyStat label="Sisa target" amount={budget.totals.remaining} />
          </dl>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
            <Link href="/reports/budget" className={LINK_CLASS}>
              Laporan budget lengkap
            </Link>
          </div>
        </Card>
      ) : (
        <Locked title="Budget" feature="budget" />
      )}

      {guests ? (
        <Card title="Tamu">
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            <Count label="Undangan" value={guests.invitations} testId="report-guests-invitations" />
            <Count label="Kursi" value={guests.seats} />
            <Count label="Hadir (orang)" value={guests.attendingSeats} testId="report-guests-attending" />
            <Count label="Tidak hadir" value={guests.declinedInvitations} />
            <Count label="Belum merespons" value={guests.pendingInvitations} />
          </dl>
          <Link href="/reports/guests" className={`mt-4 inline-block ${LINK_CLASS}`}>
            Laporan & daftar tamu
          </Link>
        </Card>
      ) : (
        <Locked title="Tamu" feature="guests" />
      )}

      {vendors ? (
        <Card title="Vendor">
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Count label="Vendor dibooking" value={vendors.booked} />
            <MoneyStat label="Nilai kontrak" amount={vendors.contract} />
            <MoneyStat label="Dibayar" amount={vendors.paid} />
            <MoneyStat label="Sisa" amount={vendors.outstanding} testId="report-vendors-outstanding" />
          </dl>
          <Link href="/reports/vendors" className={`mt-4 inline-block ${LINK_CLASS}`}>
            Laporan vendor lengkap
          </Link>
        </Card>
      ) : (
        <Locked title="Vendor" feature="vendors" />
      )}

      <Card title="Unduh data" description="Excel atau CSV, untuk arsip atau dikirim ke keluarga dan WO." className="print:hidden">
        <ul className="divide-y divide-cream-200">
          {EXPORT_DATASETS.map((dataset) => {
            const feature = EXPORT_DATASET_FEATURE[dataset];
            return (
              <li key={dataset} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <span className="font-medium">{EXPORT_DATASET_LABEL[dataset]}</span>
                {features.has(feature) ? (
                  <ExportLinks dataset={dataset} compact />
                ) : (
                  <span className="text-sm text-ink-500">
                    <span aria-hidden="true">🔒 </span>Akses Penuh
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
