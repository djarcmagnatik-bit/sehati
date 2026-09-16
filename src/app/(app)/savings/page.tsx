import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { MoneyStat } from "@/components/budget/money-stat";
import { SavingsSettingsForm } from "@/components/planning/forms";
import { Alert } from "@/components/ui/alert";
import { buttonClassName } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress-bar";
import { dbDateToIso, formatIsoDateLong } from "@/lib/dates";
import { formatRupiah, formatRupiahDigits } from "@/lib/money";
import { requireSession } from "@/server/auth/session-cookie";
import { getSavingsSummary, listSavingsEntries } from "@/server/planning/savings-service";
import { getActiveWeddingForUser } from "@/server/wedding/wedding-service";

export const metadata: Metadata = { title: "Tabungan pernikahan" };

const NOTICES: Record<string, string> = {
  created: "Tabungan dicatat.",
  updated: "Catatan tabungan diperbarui.",
  deleted: "Catatan tabungan dihapus.",
};

export default async function SavingsPage({ searchParams }: { searchParams: Promise<{ notice?: string | string[] }> }) {
  const session = await requireSession();
  const membership = await getActiveWeddingForUser(session.user.id);
  if (!membership) redirect("/onboarding");

  const { wedding } = membership;
  const [summary, entries, params] = await Promise.all([
    getSavingsSummary(session.user.id, wedding.id),
    listSavingsEntries(session.user.id, wedding.id),
    searchParams,
  ]);
  const notice = typeof params.notice === "string" ? NOTICES[params.notice] : undefined;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">Tabungan pernikahan</h1>
          <p className="mt-1 text-ink-700">Catat setiap setoran dana pernikahan dan lihat seberapa dekat dengan target.</p>
        </div>
        <Link href="/savings/new" className={buttonClassName("primary")}>
          + Catat setoran
        </Link>
      </header>

      {notice ? <Alert tone="success">{notice}</Alert> : null}

      <section aria-label="Ringkasan tabungan" className="rounded-3xl border border-cream-200 bg-white p-5 sm:p-6">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4">
          <MoneyStat label="Target dana" amount={summary.target} testId="savings-target" />
          <MoneyStat label="Sudah terkumpul" amount={summary.saved} testId="savings-saved" />
          <MoneyStat label="Kekurangan" amount={summary.remaining} testId="savings-remaining" emptyLabel="—" />
          <MoneyStat
            label="Perlu ditabung per bulan"
            amount={summary.requiredMonthly}
            testId="savings-required-monthly"
            emptyLabel="—"
          />
        </dl>
        {summary.percent !== null ? (
          <div className="mt-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
              <span className="font-semibold text-clay-700" data-testid="savings-percent">
                {summary.percent}%
              </span>
              <span className="text-ink-500">dari target</span>
            </div>
            <ProgressBar percent={summary.percent} label="Progres tabungan" className="mt-2" />
          </div>
        ) : (
          <p className="mt-4 text-sm text-ink-700">Atur target dana di bawah untuk melihat progres.</p>
        )}
        {summary.monthlyTarget !== null && summary.requiredMonthly !== null && summary.requiredMonthly > summary.monthlyTarget ? (
          <p className="mt-3 text-sm font-medium text-danger-600">
            ⚠ Target bulanan {formatRupiah(summary.monthlyTarget)} belum cukup untuk mengejar target sebelum hari pernikahan.
          </p>
        ) : null}
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
        <Card title="Riwayat setoran">
          {entries.length === 0 ? (
            <p className="text-sm text-ink-700">Belum ada setoran. Mulai dari nominal kecil pun tidak apa-apa.</p>
          ) : (
            <ul className="divide-y divide-cream-200">
              {entries.map((entry) => (
                <li key={entry.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <Link href={`/savings/${entry.id}`} className="font-medium text-ink-900 underline-offset-4 hover:underline">
                      {entry.contributor}
                    </Link>
                    <p className="text-xs text-ink-500">
                      <time dateTime={dbDateToIso(entry.entryDate)}>{formatIsoDateLong(dbDateToIso(entry.entryDate))}</time>
                      {entry.account ? ` · ${entry.account}` : ""}
                    </p>
                    {entry.notes ? <p className="mt-1 text-sm text-ink-700">{entry.notes}</p> : null}
                  </div>
                  <span className="shrink-0 font-semibold text-ink-900">{formatRupiah(entry.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Target" description={`${summary.contributors} penyetor tercatat.`}>
          <SavingsSettingsForm
            weddingId={wedding.id}
            defaults={{
              savingsTarget: wedding.savingsTarget === null ? "" : formatRupiahDigits(wedding.savingsTarget),
              savingsMonthlyTarget: wedding.savingsMonthlyTarget === null ? "" : formatRupiahDigits(wedding.savingsMonthlyTarget),
            }}
          />
        </Card>
      </div>
    </div>
  );
}
