import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GrantPlanForm } from "@/components/admin/admin-forms";
import { AdminPageHeader, AdminTable, Badge, EmptyRow, first, Notice, Td, Th } from "@/components/admin/admin-ui";
import { buttonClassName } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FEATURE_LABEL, PAYMENT_STATUS_LABEL, type PaymentStatusValue } from "@/lib/billing";
import { dbDateToIso, formatDateTime, formatIsoDateShort } from "@/lib/dates";
import { formatRupiah } from "@/lib/money";
import { revokeEntitlementAction } from "@/server/actions/admin-actions";
import { requireAdminPage } from "@/server/admin/admin-access";
import { listPlansForAdmin } from "@/server/admin/admin-billing-service";
import { getWeddingDetail } from "@/server/admin/admin-user-service";

export const metadata: Metadata = { title: "Detail pernikahan" };

const NOTICES = {
  granted: { tone: "success", text: "Akses diberikan dan tercatat di audit log." },
  revoked: { tone: "success", text: "Akses dicabut." },
  unchanged: { tone: "error", text: "Akses itu sudah dicabut sebelumnya." },
  not_found: { tone: "error", text: "Akses tidak ditemukan." },
} as const;

const SOURCE_LABEL: Record<string, string> = { PURCHASE: "Pembelian", ADMIN_GRANT: "Diberikan admin" };

type PageProps = { params: Promise<{ weddingId: string }>; searchParams: Promise<{ notice?: string | string[] }> };

export default async function AdminWeddingDetailPage({ params, searchParams }: PageProps) {
  const admin = await requireAdminPage();
  const [{ weddingId }, query] = await Promise.all([params, searchParams]);
  const [wedding, plans] = await Promise.all([getWeddingDetail(admin.id, weddingId), listPlansForAdmin(admin.id)]);
  if (!wedding) notFound();

  return (
    <>
      <p>
        <Link href="/admin/weddings" className="text-sm text-ink-700 underline-offset-4 hover:underline">
          ← Semua pernikahan
        </Link>
      </p>
      <AdminPageHeader
        title={wedding.coupleName}
        description={`${formatIsoDateShort(dbDateToIso(wedding.weddingDate))} · ${wedding.deletedAt ? "dihapus" : wedding.status === "PLANNING" ? "direncanakan" : wedding.status.toLowerCase()}`}
      />
      <Notice notice={first(query.notice)} messages={NOTICES} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Anggota">
          <ul className="space-y-2 text-sm">
            {wedding.members.map((member) => (
              <li key={member.user.id} className="flex flex-wrap items-center justify-between gap-2">
                <Link href={`/admin/users/${member.user.id}`} className="break-all font-medium underline-offset-4 hover:underline">
                  {member.user.email}
                </Link>
                <span className="flex items-center gap-2 text-ink-500">
                  {member.role === "OWNER" ? "Pemilik" : "Pasangan"}
                  {member.user.suspendedAt ? <Badge tone="bad">Disuspend</Badge> : null}
                </span>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Ringkasan">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-ink-500">Tugas</dt>
            <dd className="tabular-nums">{wedding._count.tasks}</dd>
            <dt className="text-ink-500">Tamu</dt>
            <dd className="tabular-nums">{wedding._count.guests}</dd>
            <dt className="text-ink-500">Vendor</dt>
            <dd className="tabular-nums">{wedding._count.vendors}</dd>
            <dt className="text-ink-500">Pengeluaran</dt>
            <dd className="tabular-nums">{wedding._count.expenses}</dd>
            <dt className="text-ink-500">Undangan</dt>
            <dd>{wedding.invitation ? `${wedding.invitation.slug} (${wedding.invitation.status === "PUBLISHED" ? "terbit" : "draf"})` : "Belum dibuat"}</dd>
            <dt className="text-ink-500">Dibuat</dt>
            <dd>{formatDateTime(wedding.createdAt)}</dd>
          </dl>
        </Card>
      </div>

      <Card title="Akses" description="Mencabut akses menyimpan riwayatnya; pembelian tetap tertaut ke transaksinya.">
        {wedding.entitlements.length === 0 ? (
          <p className="text-sm text-ink-500">Belum ada akses berbayar.</p>
        ) : (
          <ul className="space-y-3" data-testid="entitlements">
            {wedding.entitlements.map((entitlement) => (
              <li key={entitlement.id} className="rounded-2xl border border-cream-200 p-4 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">
                    {entitlement.plan.name}{" "}
                    {entitlement.active ? <Badge tone="good">Aktif</Badge> : entitlement.revokedAt ? <Badge tone="bad">Dicabut</Badge> : <Badge>Tidak aktif</Badge>}
                  </p>
                  <span className="text-ink-500">{SOURCE_LABEL[entitlement.source] ?? entitlement.source}</span>
                </div>
                <p className="mt-1 text-ink-700">
                  Mulai {formatDateTime(entitlement.startsAt)}
                  {entitlement.expiresAt ? ` · sampai ${formatDateTime(entitlement.expiresAt)}` : " · tanpa batas waktu"}
                  {entitlement.revokedAt ? ` · dicabut ${formatDateTime(entitlement.revokedAt)}` : ""}
                </p>
                <p className="mt-1 text-ink-500">{entitlement.features.map((feature) => FEATURE_LABEL[feature]).join(", ")}</p>
                {entitlement.note ? <p className="mt-1 text-ink-500">Catatan: {entitlement.note}</p> : null}
                {entitlement.transaction ? (
                  <p className="mt-1">
                    <Link href={`/admin/transactions/${entitlement.transaction.orderId}`} className="font-mono text-xs underline-offset-4 hover:underline">
                      {entitlement.transaction.orderId}
                    </Link>
                  </p>
                ) : null}
                {entitlement.revokedAt ? null : (
                  <form action={revokeEntitlementAction} className="mt-3 flex flex-wrap items-end gap-2">
                    <input type="hidden" name="entitlementId" value={entitlement.id} />
                    <input type="hidden" name="weddingId" value={wedding.id} />
                    <label className="min-w-0 flex-1 text-xs font-medium">
                      Alasan pencabutan
                      <input
                        name="note"
                        maxLength={200}
                        className="mt-1 block min-h-10 w-full rounded-xl border border-cream-300 bg-white px-3 text-sm"
                      />
                    </label>
                    <button type="submit" className={buttonClassName("danger", "min-h-10")}>
                      Cabut akses
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {wedding.deletedAt ? null : (
        <Card title="Berikan akses manual" description="Untuk kompensasi, uji coba, atau pembayaran di luar aplikasi. Tercatat di audit log.">
          <GrantPlanForm weddingId={wedding.id} plans={plans.map((plan) => ({ code: plan.code, name: plan.name }))} />
        </Card>
      )}

      <section className="space-y-3">
        <h2 className="font-display text-xl font-semibold">Transaksi terbaru</h2>
        <AdminTable caption="Transaksi pernikahan ini">
          <thead>
            <tr>
              <Th>Order</Th>
              <Th>Item</Th>
              <Th>Jumlah</Th>
              <Th>Status</Th>
              <Th>Dibuat</Th>
            </tr>
          </thead>
          <tbody>
            {wedding.paymentTransactions.length === 0 ? (
              <EmptyRow colSpan={5}>Belum ada transaksi.</EmptyRow>
            ) : (
              wedding.paymentTransactions.map((transaction) => (
                <tr key={transaction.orderId}>
                  <Td>
                    <Link href={`/admin/transactions/${transaction.orderId}`} className="font-mono text-xs underline-offset-4 hover:underline">
                      {transaction.orderId}
                    </Link>
                  </Td>
                  <Td>{transaction.itemName}</Td>
                  <Td className="whitespace-nowrap tabular-nums">{formatRupiah(transaction.amount)}</Td>
                  <Td>{PAYMENT_STATUS_LABEL[transaction.status as PaymentStatusValue]}</Td>
                  <Td className="whitespace-nowrap">{formatDateTime(transaction.createdAt)}</Td>
                </tr>
              ))
            )}
          </tbody>
        </AdminTable>
      </section>
    </>
  );
}
