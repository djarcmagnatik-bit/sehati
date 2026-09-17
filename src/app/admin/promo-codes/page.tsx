import type { Metadata } from "next";
import Link from "next/link";
import { AdminPageHeader, AdminTable, Badge, EmptyRow, first, Notice, Td, Th } from "@/components/admin/admin-ui";
import { buttonClassName } from "@/components/ui/button";
import { formatDateTime } from "@/lib/dates";
import { formatRupiah } from "@/lib/money";
import { describeDiscount, promoWindowProblem, type PromoDiscountTypeValue } from "@/lib/promo";
import { requireAdminPage } from "@/server/admin/admin-access";
import { listPromoCodes } from "@/server/admin/admin-billing-service";

export const metadata: Metadata = { title: "Kode promo" };

const NOTICES = {
  created: { tone: "success", text: "Kode promo dibuat." },
  updated: { tone: "success", text: "Kode promo disimpan." },
} as const;

const WINDOW_BADGE = {
  inactive: <Badge>Nonaktif</Badge>,
  not_started: <Badge tone="warn">Belum mulai</Badge>,
  expired: <Badge tone="bad">Berakhir</Badge>,
} as const;

export default async function AdminPromoCodesPage({ searchParams }: { searchParams: Promise<{ notice?: string | string[] }> }) {
  const admin = await requireAdminPage();
  const now = new Date();
  const [promos, query] = await Promise.all([listPromoCodes(admin.id, now), searchParams]);

  return (
    <>
      <AdminPageHeader
        title="Kode promo"
        description="Pemakaian dihitung dari pembayaran lunas dan checkout yang belum kedaluwarsa."
        action={
          <Link href="/admin/promo-codes/new" className={buttonClassName("primary")}>
            Kode promo baru
          </Link>
        }
      />
      <Notice notice={first(query.notice)} messages={NOTICES} />
      <AdminTable caption="Daftar kode promo">
        <thead>
          <tr>
            <Th>Kode</Th>
            <Th>Diskon</Th>
            <Th>Paket</Th>
            <Th>Periode</Th>
            <Th>Dipakai</Th>
            <Th>Status</Th>
          </tr>
        </thead>
        <tbody>
          {promos.length === 0 ? (
            <EmptyRow colSpan={6}>Belum ada kode promo.</EmptyRow>
          ) : (
            promos.map((promo) => {
              const problem = promoWindowProblem(promo, now);
              const exhausted = promo.usageLimit !== null && promo.uses >= promo.usageLimit;
              return (
                <tr key={promo.id}>
                  <Td>
                    <Link href={`/admin/promo-codes/${promo.id}`} className="font-mono font-medium underline-offset-4 hover:underline">
                      {promo.code}
                    </Link>
                    {promo.description ? <span className="block text-xs text-ink-500">{promo.description}</span> : null}
                  </Td>
                  <Td className="whitespace-nowrap">{describeDiscount(promo.discountType as PromoDiscountTypeValue, promo.discountValue, formatRupiah)}</Td>
                  <Td>{promo.plan?.name ?? "Semua paket"}</Td>
                  <Td className="text-xs">
                    {promo.startsAt ? `Mulai ${formatDateTime(promo.startsAt)}` : "Sejak dibuat"}
                    <br />
                    {promo.expiresAt ? `Sampai ${formatDateTime(promo.expiresAt)}` : "Tanpa batas akhir"}
                  </Td>
                  <Td className="tabular-nums">
                    {promo.uses}
                    {promo.usageLimit !== null ? ` / ${promo.usageLimit}` : ""}
                  </Td>
                  <Td>{problem ? WINDOW_BADGE[problem] : exhausted ? <Badge tone="bad">Habis</Badge> : <Badge tone="good">Berlaku</Badge>}</Td>
                </tr>
              );
            })
          )}
        </tbody>
      </AdminTable>
    </>
  );
}
