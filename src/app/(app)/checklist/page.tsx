import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { TaskRow } from "@/components/checklist/task-row";
import { Alert } from "@/components/ui/alert";
import { buttonClassName } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress-bar";
import {
  CHECKLIST_SORTS,
  CHECKLIST_SORT_LABEL,
  CHECKLIST_VIEWS,
  CHECKLIST_VIEW_LABEL,
  checklistHref,
  parseChecklistFilters,
} from "@/lib/checklist-filters";
import { cn } from "@/lib/cn";
import { todayIsoInTimeZone } from "@/lib/dates";
import { generateChecklistAction } from "@/server/actions/task-actions";
import { requireSession } from "@/server/auth/session-cookie";
import { getChecklistSummary, getTaskFormOptions, listTasks } from "@/server/checklist/task-service";
import { getActiveWeddingForUser } from "@/server/wedding/wedding-service";

export const metadata: Metadata = { title: "Checklist" };

const NOTICES: Record<string, string> = {
  created: "Tugas ditambahkan.",
  updated: "Perubahan tugas disimpan.",
  deleted: "Tugas dihapus.",
  generated: "Checklist otomatis berhasil dibuat.",
};

const INPUT_CLASS =
  "block min-h-11 w-full rounded-xl border border-cream-300 bg-white px-3 text-base text-ink-900 focus:outline-2 focus:outline-offset-1 focus:outline-clay-600";

export default async function ChecklistPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  const membership = await getActiveWeddingForUser(session.user.id);
  if (!membership) redirect("/onboarding");

  const { wedding } = membership;
  const params = await searchParams;
  const filters = parseChecklistFilters(params);
  const notice = typeof params.notice === "string" ? NOTICES[params.notice] : undefined;
  const todayIso = todayIsoInTimeZone(new Date(), wedding.timeZone);

  const [summary, list, options] = await Promise.all([
    getChecklistSummary(session.user.id, wedding.id, todayIso),
    listTasks(session.user.id, wedding.id, filters, todayIso),
    getTaskFormOptions(session.user.id, wedding.id),
  ]);

  const from = list.total === 0 ? 0 : (list.page - 1) * list.pageSize + 1;
  const to = Math.min(list.page * list.pageSize, list.total);
  const lastPage = Math.max(1, Math.ceil(list.total / list.pageSize));
  const hasRefinements = Boolean(filters.q || filters.categoryId || filters.sort !== "due");

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">Checklist</h1>
          <p className="mt-1 text-ink-700">Daftar persiapan pernikahan kalian berdua.</p>
        </div>
        <Link href="/checklist/new" className={buttonClassName("primary")}>
          + Tambah tugas
        </Link>
      </header>

      {notice ? <Alert tone="success">{notice}</Alert> : null}

      {!wedding.checklistGeneratedAt ? (
        <Card
          title="Checklist otomatis belum dibuat"
          description="Buat daftar tugas persiapan sesuai tanggal, jenis acara, dan jalur pernikahan kalian."
        >
          <form action={generateChecklistAction}>
            <input type="hidden" name="weddingId" value={wedding.id} />
            <button type="submit" className={buttonClassName("primary")}>
              Buat checklist otomatis
            </button>
          </form>
        </Card>
      ) : null}

      <section aria-label="Progres checklist" className="rounded-3xl border border-cream-200 bg-white p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="font-medium">
            {summary.completed} dari {summary.total} tugas selesai
          </p>
          <p className="font-display text-2xl font-semibold text-clay-700">{summary.percent}%</p>
        </div>
        <ProgressBar percent={summary.percent} label="Progres checklist" className="mt-3" />
        {summary.overdue > 0 || summary.dueToday > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2 text-sm">
            {summary.overdue > 0 ? (
              <Link
                href={checklistHref(filters, { view: "overdue", page: 1 })}
                className="rounded-full bg-danger-50 px-3 py-1 font-medium text-danger-600 underline-offset-4 hover:underline"
              >
                <span aria-hidden="true">⚠ </span>
                {summary.overdue} tugas terlambat
              </Link>
            ) : null}
            {summary.dueToday > 0 ? (
              <span className="rounded-full bg-clay-100 px-3 py-1 font-medium text-clay-700">
                {summary.dueToday} tenggat hari ini
              </span>
            ) : null}
          </div>
        ) : null}
      </section>

      <nav aria-label="Filter status">
        <ul className="flex gap-2 overflow-x-auto pb-1">
          {CHECKLIST_VIEWS.map((view) => {
            const active = filters.view === view;
            return (
              <li key={view}>
                <Link
                  href={checklistHref(filters, { view, page: 1 })}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex min-h-10 items-center whitespace-nowrap rounded-full px-4 text-sm font-medium",
                    active ? "bg-ink-900 text-white" : "bg-white text-ink-700 ring-1 ring-cream-300 hover:bg-cream-100",
                  )}
                >
                  {CHECKLIST_VIEW_LABEL[view]}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <form
        method="get"
        action="/checklist"
        role="search"
        className="grid gap-3 rounded-3xl border border-cream-200 bg-white p-4 sm:grid-cols-[1fr_12rem_12rem_auto] sm:items-end"
      >
        {filters.view !== "open" ? <input type="hidden" name="view" value={filters.view} /> : null}
        <div className="space-y-1.5">
          <label htmlFor="checklist-q" className="block text-sm font-medium">
            Cari tugas
          </label>
          <input id="checklist-q" type="search" name="q" defaultValue={filters.q} maxLength={100} className={INPUT_CLASS} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="checklist-category" className="block text-sm font-medium">
            Kategori
          </label>
          <select id="checklist-category" name="category" defaultValue={filters.categoryId ?? ""} className={INPUT_CLASS}>
            <option value="">Semua kategori</option>
            {options.categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="checklist-sort" className="block text-sm font-medium">
            Urutkan
          </label>
          <select id="checklist-sort" name="sort" defaultValue={filters.sort} className={INPUT_CLASS}>
            {CHECKLIST_SORTS.map((sort) => (
              <option key={sort} value={sort}>
                {CHECKLIST_SORT_LABEL[sort]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-2">
          <button type="submit" className={buttonClassName("secondary")}>
            Terapkan
          </button>
          {hasRefinements ? (
            <Link href={checklistHref(filters, { q: "", categoryId: null, sort: "due", page: 1 })} className={buttonClassName("ghost")}>
              Reset
            </Link>
          ) : null}
        </div>
      </form>

      <section aria-labelledby="task-list-heading">
        <h2 id="task-list-heading" className="sr-only">
          Daftar tugas
        </h2>
        <p className="text-sm text-ink-500">
          {list.total === 0 ? "Tidak ada tugas yang cocok." : `Menampilkan ${from}–${to} dari ${list.total} tugas`}
        </p>
        {list.items.length > 0 ? (
          <ul className="mt-2 divide-y divide-cream-200 rounded-3xl border border-cream-200 bg-white px-3 sm:px-4">
            {list.items.map((task) => (
              <TaskRow key={task.id} task={task} todayIso={todayIso} />
            ))}
          </ul>
        ) : null}

        {lastPage > 1 ? (
          <nav aria-label="Halaman" className="mt-4 flex items-center justify-between gap-3">
            {list.page > 1 ? (
              <Link href={checklistHref(filters, { page: list.page - 1 })} className={buttonClassName("secondary")}>
                ← Sebelumnya
              </Link>
            ) : (
              <span />
            )}
            <span className="text-sm text-ink-500">
              Halaman {list.page} dari {lastPage}
            </span>
            {list.page < lastPage ? (
              <Link href={checklistHref(filters, { page: list.page + 1 })} className={buttonClassName("secondary")}>
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
