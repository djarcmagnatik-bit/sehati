import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminPageHeader, Badge, PAYMENT_STATUS_TONE } from "@/components/admin/admin-ui";
import { Card } from "@/components/ui/card";
import { PAYMENT_STATUS_LABEL, type PaymentStatusValue } from "@/lib/billing";
import { formatDateTime } from "@/lib/dates";
import { formatRupiah } from "@/lib/money";
import { requireAdminPage } from "@/server/admin/admin-access";
import { getTransactionDetail } from "@/server/admin/admin-billing-service";

export const metadata: Metadata = { title: "Detail transaksi" };

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-ink-500">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </>
  );
}

export default async function AdminTransactionDetailPage({ params }: { params: Promise<{ orderId: string }> }) {
  const admin = await requireAdminPage();
  const { orderId } = await params;
  const transaction = await getTransactionDetail(admin.id, orderId);
  if (!transaction) notFound();
  const status = transaction.status as PaymentStatusValue;

  return (
    <>
      <p>
        <Link href="/admin/transactions" className="text-sm text-ink-700 underline-offset-4 hover:underline">
          ← Semua transaksi
        </Link>
      </p>
      <AdminPageHeader title={transaction.orderId} description={transaction.itemName} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Pembayaran">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <Row label="Status">
              <Badge tone={PAYMENT_STATUS_TONE[status]}>{PAYMENT_STATUS_LABEL[status]}</Badge>
            </Row>
            <Row label="Jumlah dibayar">{formatRupiah(transaction.amount)}</Row>
            {transaction.discountAmount > 0n ? (
              <>
                <Row label="Harga awal">{formatRupiah(transaction.originalAmount ?? transaction.amount)}</Row>
                <Row label="Diskon">
                  {formatRupiah(transaction.discountAmount)}
                  {transaction.promoCode ? (
                    <>
                      {" · "}
                      <Link href={`/admin/promo-codes/${transaction.promoCode.id}`} className="font-mono underline-offset-4 hover:underline">
                        {transaction.promoCode.code}
                      </Link>
                    </>
                  ) : null}
                </Row>
              </>
            ) : null}
            <Row label="Penyedia">{transaction.provider}</Row>
            <Row label="Referensi">{transaction.providerReference ?? "—"}</Row>
            <Row label="Dibuat">{formatDateTime(transaction.createdAt)}</Row>
            <Row label="Kedaluwarsa">{transaction.expiresAt ? formatDateTime(transaction.expiresAt) : "—"}</Row>
            {transaction.paidAt ? <Row label="Lunas">{formatDateTime(transaction.paidAt)}</Row> : null}
            {transaction.failedAt ? <Row label="Gagal">{formatDateTime(transaction.failedAt)}</Row> : null}
            {transaction.refundedAt ? <Row label="Dikembalikan">{formatDateTime(transaction.refundedAt)}</Row> : null}
          </dl>
        </Card>
        <Card title="Pemilik">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <Row label="Pengguna">
              {transaction.user ? (
                <Link href={`/admin/users/${transaction.user.id}`} className="underline-offset-4 hover:underline">
                  {transaction.user.email}
                </Link>
              ) : (
                "(akun dihapus)"
              )}
            </Row>
            <Row label="Pernikahan">
              <Link href={`/admin/weddings/${transaction.weddingId}`} className="underline-offset-4 hover:underline">
                Lihat pernikahan
              </Link>
            </Row>
            <Row label="Hasil">
              {transaction.entitlement
                ? transaction.entitlement.revokedAt
                  ? "Akses dicabut"
                  : "Akses aktif"
                : transaction.addonPurchase
                  ? `Add-on +${transaction.addonPurchase.quota}${transaction.addonPurchase.revokedAt ? " (dicabut)" : ""}`
                  : "Belum ada"}
            </Row>
          </dl>
        </Card>
      </div>

      <Card title="Riwayat webhook" description="Isi payload tidak ditampilkan; hanya status yang dilaporkan dan keputusannya.">
        {transaction.webhookEvents.length === 0 ? (
          <p className="text-sm text-ink-500">Belum ada notifikasi dari penyedia.</p>
        ) : (
          <ol className="space-y-2 text-sm">
            {transaction.webhookEvents.map((event) => (
              <li key={event.id} className="flex flex-wrap justify-between gap-2 border-b border-cream-200 pb-2 last:border-0">
                <span>
                  {event.reportedStatus} → <span className="font-medium">{event.outcome}</span>
                </span>
                <span className="text-ink-500">{formatDateTime(event.createdAt)}</span>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </>
  );
}
