import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PaymentStatusBadge } from "@/components/budget/badges";
import { DueBadge } from "@/components/checklist/due-badge";
import { Alert } from "@/components/ui/alert";
import { buttonClassName } from "@/components/ui/button";
import {
  EXPENSE_SORTS,
  EXPENSE_SORT_LABEL,
  EXPENSE_STATUS_FILTERS,
  EXPENSE_STATUS_FILTER_LABEL,
  expensesHref,
  parseExpenseFilters,
} from "@/lib/budget-filters";
import { cn } from "@/lib/cn";
import { todayIsoInTimeZone } from "@/lib/dates";
import { formatRupiah } from "@/lib/money";
import { requireSession } from "@/server/auth/session-cookie";
import { getBudgetCategoryOptions, listExpenses } from "@/server/budget/budget-service";
import { getActiveWeddingForUser } from "@/server/wedding/wedding-service";

export const metadata: Metadata = { title: "Pengeluaran" };

const INPUT_CLASS =
  "block min-h-11 w-full rounded-xl border border-cream-300 bg-white px-3 text-base text-ink-900 focus:outline-2 focus:outline-offset-1 focus:outline-clay-600";

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  const membership = await getActiveWeddingForUser(session.user.id);
  if (!membership) redirect("/onboarding");

  const { wedding } = membership;
  const params = await searchParams;
  const filters = parseExpenseFilters(params);
  const todayIso = todayIsoInTimeZone(new Date(), wedding.timeZone);
  const [list, categories] = await Promise.all([
    listExpenses(session.user.id, wedding.id, filters),
    getBudgetCategoryOptions(session.user.id, wedding.id),
  ]);
  const lastPage = Math.max(1, Math.ceil(list.total / list.pageSize));
  const from = list.total === 0 ? 0 : (list.page - 1) * list.pageSize + 1;
  const to = Math.min(list.page * list.pageSize, list.total);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/budget" className="text-sm font-medium text-clay-700 underline-offset-4 hover:underline">
            ← Kembali ke budget
          </Link>
          <h1 className="mt-2 font-display text-3xl font-semibold">Pengeluaran</h1>
          <p className="mt-1 text-ink-700">Kontrak, tagihan, dan status pembayarannya.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/reports/budget" className={buttonClassName("ghost")}>
            Laporan & unduh
          </Link>
          <Link
            href={filters.categoryId ? `/budget/expenses/new?category=${filters.categoryId}` : "/budget/expenses/new"}
            className={buttonClassName("primary")}
          >
            + Tambah pengeluaran
          </Link>
        </div>
      </header>

      {params.notice === "expense_deleted" ? <Alert tone="success">Pengeluaran dihapus.</Alert> : null}

      <nav aria-label="Filter status pembayaran">
        <ul className="flex gap-2 overflow-x-auto pb-1">
          {EXPENSE_STATUS_FILTERS.map((status) => {
            const active = filters.status === status;
            return (
              <li key={status}>
                <Link
                  href={expensesHref(filters, { status, page: 1 })}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex min-h-10 items-center whitespace-nowrap rounded-full px-4 text-sm font-medium",
                    active ? "bg-ink-900 text-white" : "bg-white text-ink-700 ring-1 ring-cream-300 hover:bg-cream-100",
                  )}
                >
                  {EXPENSE_STATUS_FILTER_LABEL[status]}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <form
        method="get"
        action="/budget/expenses"
        role="search"
        className="grid gap-3 rounded-3xl border border-cream-200 bg-white p-4 sm:grid-cols-[1fr_12rem_12rem_auto] sm:items-end"
      >
        {filters.status !== "all" ? <input type="hidden" name="status" value={filters.status} /> : null}
        <div className="space-y-1.5">
          <label htmlFor="expense-q" className="block text-sm font-medium">
            Cari pengeluaran
          </label>
          <input id="expense-q" type="search" name="q" defaultValue={filters.q} maxLength={100} className={INPUT_CLASS} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="expense-category" className="block text-sm font-medium">
            Kategori
          </label>
          <select id="expense-category" name="category" defaultValue={filters.categoryId ?? ""} className={INPUT_CLASS}>
            <option value="">Semua kategori</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="expense-sort" className="block text-sm font-medium">
            Urutkan
          </label>
          <select id="expense-sort" name="sort" defaultValue={filters.sort} className={INPUT_CLASS}>
            {EXPENSE_SORTS.map((sort) => (
              <option key={sort} value={sort}>
                {EXPENSE_SORT_LABEL[sort]}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className={buttonClassName("secondary")}>
          Terapkan
        </button>
      </form>

      <section aria-labelledby="expense-list-heading">
        <h2 id="expense-list-heading" className="sr-only">
          Daftar pengeluaran
        </h2>
        <p className="text-sm text-ink-500">
          {list.total === 0 ? "Belum ada pengeluaran yang cocok." : `Menampilkan ${from}–${to} dari ${list.total} pengeluaran`}
        </p>
        {list.items.length > 0 ? (
          <ul className="mt-2 divide-y divide-cream-200 rounded-3xl border border-cream-200 bg-white px-4">
            {list.items.map((expense) => (
              <li key={expense.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <Link
                    href={`/budget/expenses/${expense.id}`}
                    className="font-medium text-ink-900 underline-offset-4 hover:underline"
                  >
                    {expense.title}
                  </Link>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-500">
                    <span>{expense.category.name}</span>
                    <PaymentStatusBadge status={expense.status} />
                    {expense.dueDateIso && expense.status !== "paid" ? (
                      <DueBadge dueDateIso={expense.dueDateIso} status="TODO" todayIso={todayIso} />
                    ) : null}
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-semibold">{formatRupiah(expense.totalAmount)}</p>
                  {expense.outstanding > 0n ? (
                    <p className="text-xs text-ink-500">Sisa {formatRupiah(expense.outstanding)}</p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : null}

        {lastPage > 1 ? (
          <nav aria-label="Halaman" className="mt-4 flex items-center justify-between gap-3">
            {list.page > 1 ? (
              <Link href={expensesHref(filters, { page: list.page - 1 })} className={buttonClassName("secondary")}>
                ← Sebelumnya
              </Link>
            ) : (
              <span />
            )}
            <span className="text-sm text-ink-500">
              Halaman {list.page} dari {lastPage}
            </span>
            {list.page < lastPage ? (
              <Link href={expensesHref(filters, { page: list.page + 1 })} className={buttonClassName("secondary")}>
                Berikutnya →
              </Link>
            ) : (
              <span />
            )}
          </nav>
        ) : null}
      </section>
    </div>
  );
}
