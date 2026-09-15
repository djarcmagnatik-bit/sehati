import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { MoneyStat } from "@/components/budget/money-stat";
import { Alert } from "@/components/ui/alert";
import { buttonClassName } from "@/components/ui/button";
import { dbDateToIso, formatIsoDateShort } from "@/lib/dates";
import { formatRupiah } from "@/lib/money";
import { parseVendorFilters, vendorsHref } from "@/lib/vendor-filters";
import { requireSession } from "@/server/auth/session-cookie";
import { getVendorCategoryOptions, getVendorSummary, listVendors, type VendorMoney } from "@/server/vendors/vendor-service";
import { getActiveWeddingForUser } from "@/server/wedding/wedding-service";

export const metadata: Metadata = { title: "Vendor" };

const INPUT_CLASS =
  "block min-h-11 w-full rounded-xl border border-cream-300 bg-white px-3 text-base text-ink-900 focus:outline-2 focus:outline-offset-1 focus:outline-clay-600";

function paymentLabel(money: VendorMoney): string {
  if (money.contract === 0n) return "Belum ada kontrak";
  if (money.outstanding === 0n) return "✓ Lunas";
  if (money.paid === 0n) return "Menunggu DP";
  return "Dibayar sebagian";
}

function CountStat({ label, value, testId }: { label: string; value: number; testId: string }) {
  return (
    <div>
      <dt className="text-xs text-ink-500">{label}</dt>
      <dd data-testid={testId} className="mt-0.5 font-semibold text-ink-900">
        {value}
      </dd>
    </div>
  );
}

export default async function VendorsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  const membership = await getActiveWeddingForUser(session.user.id);
  if (!membership) redirect("/onboarding");

  const { wedding } = membership;
  const params = await searchParams;
  const filters = parseVendorFilters(params);
  const [list, summary, categories] = await Promise.all([
    listVendors(session.user.id, wedding.id, filters),
    getVendorSummary(session.user.id, wedding.id),
    getVendorCategoryOptions(),
  ]);
  const lastPage = Math.max(1, Math.ceil(list.total / list.pageSize));

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">Vendor</h1>
          <p className="mt-1 text-ink-700">Vendor yang sudah dibooking beserta kontrak dan pembayarannya.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/vendors/research" className={buttonClassName("secondary")}>
            Riset vendor
          </Link>
          <Link href="/vendors/new" className={buttonClassName("primary")}>
            + Tambah vendor
          </Link>
        </div>
      </header>

      {params.notice === "deleted" ? <Alert tone="success">Vendor dihapus.</Alert> : null}

      <section aria-label="Ringkasan vendor" className="rounded-3xl border border-cream-200 bg-white p-5 sm:p-6">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3">
          <CountStat label="Vendor dibooking" value={summary.booked} testId="vendors-booked" />
          <CountStat label="Kandidat dalam riset" value={summary.researching} testId="vendors-researching" />
          <CountStat label="Menunggu DP" value={summary.needingDp} testId="vendors-needing-dp" />
          <MoneyStat label="Nilai kontrak" amount={summary.contract} testId="vendors-contract" />
          <MoneyStat label="Sudah dibayar" amount={summary.paid} testId="vendors-paid" />
          <MoneyStat label="Sisa pembayaran" amount={summary.outstanding} testId="vendors-outstanding" />
        </dl>
      </section>

      <form
        method="get"
        action="/vendors"
        role="search"
        className="grid gap-3 rounded-3xl border border-cream-200 bg-white p-4 sm:grid-cols-[1fr_14rem_auto] sm:items-end"
      >
        <div className="space-y-1.5">
          <label htmlFor="vendor-q" className="block text-sm font-medium">
            Cari vendor
          </label>
          <input id="vendor-q" type="search" name="q" defaultValue={filters.q} maxLength={100} className={INPUT_CLASS} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="vendor-category" className="block text-sm font-medium">
            Kategori
          </label>
          <select id="vendor-category" name="category" defaultValue={filters.categoryId ?? ""} className={INPUT_CLASS}>
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
        <div className="rounded-3xl border border-dashed border-cream-300 bg-white p-6 text-center">
          <p className="text-ink-700">
            {filters.q || filters.categoryId
              ? "Tidak ada vendor yang cocok."
              : "Belum ada vendor yang dibooking. Mulai dari riset vendor, bandingkan, lalu pilih yang terbaik."}
          </p>
          <Link href="/vendors/research" className={buttonClassName("secondary", "mt-4")}>
            Buka riset vendor
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-cream-200 rounded-3xl border border-cream-200 bg-white px-4">
          {list.items.map((vendor) => (
            <li key={vendor.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
              <div className="min-w-0">
                <Link href={`/vendors/${vendor.id}`} className="font-medium text-ink-900 underline-offset-4 hover:underline">
                  {vendor.name}
                </Link>
                <p className="mt-1 text-xs text-ink-500">
                  {[
                    vendor.category.name,
                    vendor.packageName,
                    vendor.eventLabel,
                    vendor.bookingDate ? `Booking ${formatIsoDateShort(dbDateToIso(vendor.bookingDate))}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <div className="text-right">
                <p className="font-semibold">{vendor.money.contract > 0n ? formatRupiah(vendor.money.contract) : "—"}</p>
                <p className="text-xs text-ink-500">
                  {paymentLabel(vendor.money)}
                  {vendor.money.outstanding > 0n ? ` · Sisa ${formatRupiah(vendor.money.outstanding)}` : ""}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {lastPage > 1 ? (
        <nav aria-label="Halaman" className="flex items-center justify-between gap-3">
          {list.page > 1 ? (
            <Link href={vendorsHref(filters, { page: list.page - 1 })} className={buttonClassName("secondary")}>
              ← Sebelumnya
            </Link>
          ) : (
            <span />
          )}
          <span className="text-sm text-ink-500">
            Halaman {list.page} dari {lastPage}
          </span>
          {list.page < lastPage ? (
            <Link href={vendorsHref(filters, { page: list.page + 1 })} className={buttonClassName("secondary")}>
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
