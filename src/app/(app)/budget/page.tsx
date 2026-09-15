import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BudgetWarningBadge } from "@/components/budget/badges";
import { BudgetCategoryForm } from "@/components/budget/budget-category-form";
import { BudgetSettingsForm } from "@/components/budget/budget-settings-form";
import { MoneyStat } from "@/components/budget/money-stat";
import { Alert, type AlertTone } from "@/components/ui/alert";
import { buttonClassName } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress-bar";
import { formatRupiah, formatRupiahDigits } from "@/lib/money";
import { initializeBudgetAction } from "@/server/actions/budget-actions";
import { requireSession } from "@/server/auth/session-cookie";
import { getBudgetOverview } from "@/server/budget/budget-service";
import { getActiveWeddingForUser } from "@/server/wedding/wedding-service";

export const metadata: Metadata = { title: "Budget" };

const NOTICES: Record<string, { tone: AlertTone; message: string }> = {
  initialized: { tone: "success", message: "Kategori budget berhasil disiapkan." },
  category_updated: { tone: "success", message: "Kategori budget diperbarui." },
  category_deleted: { tone: "success", message: "Kategori budget dihapus." },
};

export default async function BudgetPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string | string[] }>;
}) {
  const session = await requireSession();
  const membership = await getActiveWeddingForUser(session.user.id);
  if (!membership) redirect("/onboarding");

  const params = await searchParams;
  const notice = typeof params.notice === "string" ? NOTICES[params.notice] : undefined;
  const overview = await getBudgetOverview(session.user.id, membership.wedding.id);
  const { totals } = overview;
  const committedPercentOfTarget =
    totals.target !== null && totals.target > 0n ? Number((totals.committed * 100n) / totals.target) : null;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">Budget</h1>
          <p className="mt-1 text-ink-700">Target, alokasi per kategori, dan semua komitmen pembayaran.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/budget/expenses" className={buttonClassName("secondary")}>
            Semua pengeluaran
          </Link>
          <Link href="/budget/expenses/new" className={buttonClassName("primary")}>
            + Tambah pengeluaran
          </Link>
        </div>
      </header>

      {notice ? <Alert tone={notice.tone}>{notice.message}</Alert> : null}

      {!overview.initialized ? (
        <Card title="Kategori budget belum disiapkan" description="Buat kategori standar (Venue, Catering, Dekorasi, ...) yang bisa kalian ubah kapan saja.">
          <form action={initializeBudgetAction}>
            <input type="hidden" name="weddingId" value={overview.weddingId} />
            <button type="submit" className={buttonClassName("primary")}>
              Siapkan kategori budget
            </button>
          </form>
        </Card>
      ) : null}

      <section aria-label="Ringkasan budget" className="rounded-3xl border border-cream-200 bg-white p-5 sm:p-6">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3">
          <MoneyStat label="Target budget" amount={totals.target} testId="budget-target" />
          <MoneyStat label="Dialokasikan" amount={totals.allocated} testId="budget-allocated" />
          <MoneyStat label="Komitmen (kontrak & tagihan)" amount={totals.committed} testId="budget-committed" />
          <MoneyStat label="Sudah dibayar" amount={totals.paid} testId="budget-paid" />
          <MoneyStat label="Belum dibayar" amount={totals.unpaid} testId="budget-unpaid" />
          <MoneyStat label="Sisa budget" amount={totals.remaining} testId="budget-remaining" emptyLabel="Atur target dulu" />
        </dl>
        {committedPercentOfTarget !== null ? (
          <ProgressBar
            percent={Math.min(committedPercentOfTarget, 100)}
            label="Komitmen terhadap target budget"
            className="mt-5"
          />
        ) : null}
      </section>

      {totals.warning === "over" && totals.target !== null ? (
        <Alert tone="error">
          Komitmen pengeluaran ({formatRupiah(totals.committed)}) melebihi target budget ({formatRupiah(totals.target)}).
        </Alert>
      ) : null}
      {totals.warning === "near" ? (
        <Alert tone="warning">Komitmen pengeluaran sudah mencapai {committedPercentOfTarget}% dari target budget.</Alert>
      ) : null}
      {totals.overAllocated && totals.target !== null ? (
        <Alert tone="warning">
          Total alokasi ({formatRupiah(totals.allocated)}) melebihi target budget ({formatRupiah(totals.target)}).
        </Alert>
      ) : null}

      <Card title="Target & peringatan">
        <BudgetSettingsForm
          weddingId={overview.weddingId}
          targetBudget={overview.targetBudget !== null ? formatRupiahDigits(overview.targetBudget) : ""}
          warningPercent={overview.warningPercent}
        />
      </Card>

      <Card
        title="Kategori"
        description={`Kategori ditandai saat komitmen mencapai ${overview.warningPercent}% dari alokasinya.`}
      >
        {overview.categories.length === 0 ? (
          <p className="text-sm text-ink-700">Belum ada kategori.</p>
        ) : (
          <ul className="divide-y divide-cream-200">
            {overview.categories.map((category) => (
              <li key={category.id} className="py-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">{category.name}</p>
                  <div className="flex items-center gap-3">
                    <BudgetWarningBadge level={category.warning} />
                    <Link
                      href={`/budget/categories/${category.id}`}
                      className="text-sm font-semibold text-clay-700 underline-offset-4 hover:underline"
                    >
                      Ubah<span className="sr-only"> {category.name}</span>
                    </Link>
                  </div>
                </div>
                <p className="mt-1 text-sm text-ink-500">
                  Alokasi {formatRupiah(category.allocated)} · Komitmen {formatRupiah(category.committed)} · Dibayar{" "}
                  {formatRupiah(category.paid)}
                </p>
                {category.allocated > 0n ? (
                  <ProgressBar
                    percent={Math.min(category.usagePercent ?? 0, 100)}
                    label={`Pemakaian alokasi ${category.name}`}
                    className="mt-2"
                  />
                ) : null}
                {category.committed > 0n || category.allocated > 0n ? (
                  <p className={`mt-1 text-xs ${category.remaining < 0n ? "text-danger-600" : "text-ink-500"}`}>
                    {category.remaining >= 0n
                      ? `Sisa alokasi ${formatRupiah(category.remaining)}`
                      : `Melebihi alokasi ${formatRupiah(-category.remaining)}`}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-6 border-t border-cream-200 pt-5">
          <h3 className="mb-3 text-sm font-semibold text-ink-900">Tambah kategori</h3>
          <BudgetCategoryForm mode="create" weddingId={overview.weddingId} />
        </div>
      </Card>
    </div>
  );
}
