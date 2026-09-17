import type { Metadata } from "next";
import Link from "next/link";
import { AdminPageHeader, AdminTable, Badge, EmptyRow, first, Notice, Td, Th } from "@/components/admin/admin-ui";
import { buttonClassName } from "@/components/ui/button";
import { FEATURE_LABEL, knownFeatures } from "@/lib/billing";
import { formatRupiah } from "@/lib/money";
import { requireAdminPage } from "@/server/admin/admin-access";
import { listPlansForAdmin } from "@/server/admin/admin-billing-service";

export const metadata: Metadata = { title: "Paket" };

const NOTICES = {
  created: { tone: "success", text: "Paket dibuat." },
  updated: { tone: "success", text: "Paket disimpan." },
} as const;

export default async function AdminPlansPage({ searchParams }: { searchParams: Promise<{ notice?: string | string[] }> }) {
  const admin = await requireAdminPage();
  const [plans, query] = await Promise.all([listPlansForAdmin(admin.id), searchParams]);

  return (
    <>
      <AdminPageHeader
        title="Paket"
        description="Harga dan fitur yang bisa dibeli pasangan. Paket nonaktif tidak tampil di halaman pembayaran."
        action={
          <Link href="/admin/plans/new" className={buttonClassName("primary")}>
            Paket baru
          </Link>
        }
      />
      <Notice notice={first(query.notice)} messages={NOTICES} />
      <AdminTable caption="Daftar paket">
        <thead>
          <tr>
            <Th>Paket</Th>
            <Th>Harga</Th>
            <Th>Durasi</Th>
            <Th>Fitur</Th>
            <Th>Status</Th>
            <Th>Terjual</Th>
          </tr>
        </thead>
        <tbody>
          {plans.length === 0 ? (
            <EmptyRow colSpan={6}>Belum ada paket.</EmptyRow>
          ) : (
            plans.map((plan) => (
              <tr key={plan.id}>
                <Td>
                  <Link href={`/admin/plans/${plan.id}`} className="font-medium underline-offset-4 hover:underline">
                    {plan.name}
                  </Link>
                  <span className="block font-mono text-xs text-ink-500">{plan.code}</span>
                </Td>
                <Td className="whitespace-nowrap tabular-nums">{formatRupiah(plan.price)}</Td>
                <Td className="whitespace-nowrap">{plan.durationDays ? `${plan.durationDays} hari` : "Tanpa batas"}</Td>
                <Td className="text-xs">{knownFeatures(plan.features).map((feature) => FEATURE_LABEL[feature]).join(", ") || "—"}</Td>
                <Td>{plan.isActive ? <Badge tone="good">Aktif</Badge> : <Badge>Nonaktif</Badge>}</Td>
                <Td className="tabular-nums">{plan._count.entitlements}</Td>
              </tr>
            ))
          )}
        </tbody>
      </AdminTable>
    </>
  );
}
