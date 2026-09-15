import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { ResearchStatusBadge } from "@/components/vendors/research-status-badge";
import { buttonClassName } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatRupiah } from "@/lib/money";
import { parseCompareIds } from "@/lib/vendor-filters";
import { MAX_COMPARE_VENDORS, ratingLabel } from "@/lib/vendors";
import { requireSession } from "@/server/auth/session-cookie";
import { getResearchForComparison } from "@/server/vendors/vendor-service";
import { getActiveWeddingForUser } from "@/server/wedding/wedding-service";

export const metadata: Metadata = { title: "Bandingkan vendor" };

export default async function CompareVendorsPage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string | string[] }>;
}) {
  const session = await requireSession();
  const membership = await getActiveWeddingForUser(session.user.id);
  if (!membership) redirect("/onboarding");

  const { ids } = await searchParams;
  const requested = parseCompareIds(ids, MAX_COMPARE_VENDORS);
  const rows = requested.length >= 2 ? await getResearchForComparison(session.user.id, membership.wedding.id, requested) : [];

  if (rows.length < 2) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <Card title="Pilih kandidat untuk dibandingkan">
          <p className="text-sm text-ink-700">Centang 2 sampai {MAX_COMPARE_VENDORS} kandidat di halaman riset vendor.</p>
          <Link href="/vendors/research" className={buttonClassName("secondary", "mt-4")}>
            Kembali ke riset vendor
          </Link>
        </Card>
      </div>
    );
  }

  const prices = rows.map((row) => row.estimatedPrice).filter((price): price is bigint => price !== null);
  const lowest = prices.length > 1 ? prices.reduce((min, price) => (price < min ? price : min)) : null;

  const comparisonRows: Array<{ label: string; render: (row: (typeof rows)[number]) => ReactNode }> = [
    { label: "Kategori", render: (row) => row.category.name },
    {
      label: "Estimasi harga",
      render: (row) =>
        row.estimatedPrice !== null ? (
          <>
            {formatRupiah(row.estimatedPrice)}
            {lowest !== null && row.estimatedPrice === lowest ? (
              <span className="ml-2 rounded-full bg-success-50 px-2 py-0.5 text-xs font-medium text-success-700">Termurah</span>
            ) : null}
          </>
        ) : (
          "—"
        ),
    },
    { label: "Paket", render: (row) => row.packageName ?? "—" },
    { label: "Lokasi", render: (row) => row.location ?? "—" },
    { label: "Rating", render: (row) => ratingLabel(row.rating) },
    { label: "Kelebihan", render: (row) => row.pros ?? "—" },
    { label: "Kekurangan", render: (row) => row.cons ?? "—" },
  ];

  return (
    <div className="space-y-6">
      <header>
        <Link href="/vendors/research" className="text-sm font-medium text-clay-700 underline-offset-4 hover:underline">
          ← Kembali ke riset vendor
        </Link>
        <h1 className="mt-2 font-display text-3xl font-semibold">Bandingkan vendor</h1>
        <p className="mt-1 text-ink-700">Geser tabel ke samping di layar kecil.</p>
      </header>

      <div className="overflow-x-auto rounded-3xl border border-cream-200 bg-white">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <caption className="sr-only">Perbandingan kandidat vendor</caption>
          <thead>
            <tr className="border-b border-cream-200 align-top">
              <th scope="col" className="w-36 p-4 text-ink-500">
                Vendor
              </th>
              {rows.map((row) => (
                <th key={row.id} scope="col" className="p-4">
                  <span className="block font-display text-lg font-semibold text-ink-900">{row.name}</span>
                  <span className="mt-1 block">
                    <ResearchStatusBadge status={row.status} />
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {comparisonRows.map((item) => (
              <tr key={item.label} className="border-b border-cream-200 align-top">
                <th scope="row" className="p-4 font-medium text-ink-500">
                  {item.label}
                </th>
                {rows.map((row) => (
                  <td key={row.id} className="whitespace-pre-line p-4 text-ink-900">
                    {item.render(row)}
                  </td>
                ))}
              </tr>
            ))}
            <tr className="align-top">
              <th scope="row" className="p-4 font-medium text-ink-500">
                Aksi
              </th>
              {rows.map((row) => (
                <td key={row.id} className="p-4">
                  {row.bookedVendor ? (
                    <Link href={`/vendors/${row.bookedVendor.id}`} className={buttonClassName("secondary")}>
                      Lihat vendor<span className="sr-only"> {row.name}</span>
                    </Link>
                  ) : (
                    <Link href={`/vendors/research/${row.id}#booking`} className={buttonClassName("primary")}>
                      Pilih vendor ini<span className="sr-only"> {row.name}</span>
                    </Link>
                  )}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
