import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ResearchStatusBadge } from "@/components/vendors/research-status-badge";
import { Alert } from "@/components/ui/alert";
import { buttonClassName } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { formatRupiah } from "@/lib/money";
import { parseResearchFilters, RESEARCH_VIEWS, researchHref, type ResearchView } from "@/lib/vendor-filters";
import { MAX_COMPARE_VENDORS, ratingLabel, VENDOR_RESEARCH_STATUS_LABEL } from "@/lib/vendors";
import { requireSession } from "@/server/auth/session-cookie";
import { getVendorCategoryOptions, listVendorResearch } from "@/server/vendors/vendor-service";
import { getActiveWeddingForUser } from "@/server/wedding/wedding-service";

export const metadata: Metadata = { title: "Riset vendor" };

const NOTICES: Record<string, string> = {
  created: "Kandidat vendor ditambahkan.",
  deleted: "Kandidat vendor dihapus.",
};

const INPUT_CLASS =
  "block min-h-11 w-full rounded-xl border border-cream-300 bg-white px-3 text-base text-ink-900 focus:outline-2 focus:outline-offset-1 focus:outline-clay-600";

function viewLabel(view: ResearchView): string {
  if (view === "active") return "Aktif";
  if (view === "all") return "Semua";
  return VENDOR_RESEARCH_STATUS_LABEL[view];
}

export default async function VendorResearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  const membership = await getActiveWeddingForUser(session.user.id);
  if (!membership) redirect("/onboarding");

  const params = await searchParams;
  const filters = parseResearchFilters(params);
  const notice = typeof params.notice === "string" ? NOTICES[params.notice] : undefined;
  const [list, categories] = await Promise.all([
    listVendorResearch(session.user.id, membership.wedding.id, filters),
    getVendorCategoryOptions(),
  ]);
  const lastPage = Math.max(1, Math.ceil(list.total / list.pageSize));

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/vendors" className="text-sm font-medium text-clay-700 underline-offset-4 hover:underline">
            ← Vendor dibooking
          </Link>
          <h1 className="mt-2 font-display text-3xl font-semibold">Riset vendor</h1>
          <p className="mt-1 text-ink-700">Catat kandidat, bandingkan, lalu pilih yang paling cocok.</p>
        </div>
        <Link
          href={filters.categoryId ? `/vendors/research/new?category=${filters.categoryId}` : "/vendors/research/new"}
          className={buttonClassName("primary")}
        >
          + Tambah kandidat
        </Link>
      </header>

      {notice ? <Alert tone="success">{notice}</Alert> : null}

      <nav aria-label="Filter status kandidat">
        <ul className="flex gap-2 overflow-x-auto pb-1">
          {RESEARCH_VIEWS.map((view) => {
            const active = filters.view === view;
            return (
              <li key={view}>
                <Link
                  href={researchHref(filters, { view, page: 1 })}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex min-h-10 items-center whitespace-nowrap rounded-full px-4 text-sm font-medium",
                    active ? "bg-ink-900 text-white" : "bg-white text-ink-700 ring-1 ring-cream-300 hover:bg-cream-100",
                  )}
                >
                  {viewLabel(view)}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <form
        method="get"
        action="/vendors/research"
        role="search"
        className="grid gap-3 rounded-3xl border border-cream-200 bg-white p-4 sm:grid-cols-[1fr_14rem_auto] sm:items-end"
      >
        {filters.view !== "active" ? <input type="hidden" name="view" value={filters.view} /> : null}
        <div className="space-y-1.5">
          <label htmlFor="research-q" className="block text-sm font-medium">
            Cari kandidat
          </label>
          <input id="research-q" type="search" name="q" defaultValue={filters.q} maxLength={100} className={INPUT_CLASS} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="research-category" className="block text-sm font-medium">
            Kategori
          </label>
          <select id="research-category" name="category" defaultValue={filters.categoryId ?? ""} className={INPUT_CLASS}>
            <option value="">Semua kategori</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className={buttonClassName("secondary")}>
          Terapkan
        </button>
      </form>

      {list.items.length === 0 ? (
        <p className="rounded-3xl border border-dashed border-cream-300 bg-white p-6 text-center text-ink-700">
          Belum ada kandidat yang cocok.
        </p>
      ) : (
        <form method="get" action="/vendors/research/compare" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-ink-500">
              {list.total} kandidat · centang 2–{MAX_COMPARE_VENDORS} untuk dibandingkan
            </p>
            <button type="submit" className={buttonClassName("secondary")}>
              Bandingkan terpilih
            </button>
          </div>
          <ul className="divide-y divide-cream-200 rounded-3xl border border-cream-200 bg-white px-4">
            {list.items.map((item) => (
              <li key={item.id} className="flex items-start gap-3 py-4">
                <div className="flex min-h-11 items-center">
                  <label htmlFor={`compare-${item.id}`} className="sr-only">
                    Bandingkan {item.name}
                  </label>
                  <input id={`compare-${item.id}`} type="checkbox" name="ids" value={item.id} className="size-5 accent-clay-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/vendors/research/${item.id}`}
                      className="font-medium text-ink-900 underline-offset-4 hover:underline"
                    >
                      {item.name}
                    </Link>
                    <ResearchStatusBadge status={item.status} />
                  </div>
                  <p className="mt-1 text-xs text-ink-500">
                    {[item.category.name, item.packageName, item.location].filter(Boolean).join(" · ")}
                  </p>
                  <p className="mt-1 text-sm text-ink-700">
                    {item.estimatedPrice !== null ? formatRupiah(item.estimatedPrice) : "Harga belum diketahui"}
                    {" · "}
                    <span className="text-ink-500">{ratingLabel(item.rating)}</span>
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </form>
      )}

      {lastPage > 1 ? (
        <nav aria-label="Halaman" className="flex items-center justify-between gap-3">
          {list.page > 1 ? (
            <Link href={researchHref(filters, { page: list.page - 1 })} className={buttonClassName("secondary")}>
              ← Sebelumnya
            </Link>
          ) : (
            <span />
          )}
          <span className="text-sm text-ink-500">
            Halaman {list.page} dari {lastPage}
          </span>
          {list.page < lastPage ? (
            <Link href={researchHref(filters, { page: list.page + 1 })} className={buttonClassName("secondary")}>
              Berikutnya →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </div>
  );
}
