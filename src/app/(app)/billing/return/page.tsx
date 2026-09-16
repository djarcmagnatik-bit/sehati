import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { buttonClassName } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PAYMENT_STATUS_LABEL } from "@/lib/billing";
import { formatRupiah } from "@/lib/money";
import { requireSession } from "@/server/auth/session-cookie";
import { getTransactionForUser } from "@/server/billing/billing-service";

export const metadata: Metadata = { title: "Status pembayaran" };

/**
 * Where the provider sends the buyer back. Arriving here proves nothing: the page only reports what
 * the webhook has already written to the database.
 */
export default async function BillingReturnPage({ searchParams }: { searchParams: Promise<{ order?: string | string[] }> }) {
  const session = await requireSession();
  const { order } = await searchParams;
  const transaction = typeof order === "string" ? await getTransactionForUser(session.user.id, order) : null;
  if (!transaction) notFound();

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <Card>
        <h1 className="font-display text-3xl font-semibold">Status pembayaran</h1>
        <p className="mt-1 text-sm text-ink-500">{transaction.orderId}</p>
        <dl className="mt-4 space-y-1 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-ink-500">Item</dt>
            <dd className="font-medium">{transaction.itemName}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-ink-500">Jumlah</dt>
            <dd className="font-medium">{formatRupiah(transaction.amount)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-ink-500">Status</dt>
            <dd className="font-semibold" data-testid="payment-status">
              {PAYMENT_STATUS_LABEL[transaction.status]}
            </dd>
          </div>
        </dl>

        <div className="mt-5">
          {transaction.status === "PAID" ? (
            <Alert tone="success">Pembayaran diterima. Semua fitur dalam paket sudah aktif untuk kalian berdua.</Alert>
          ) : transaction.status === "PENDING" ? (
            <Alert tone="info">
              Menunggu konfirmasi dari penyedia pembayaran. Akses aktif otomatis begitu pembayaran dikonfirmasi — halaman ini tidak perlu tetap terbuka.
            </Alert>
          ) : (
            <Alert tone="error">Pembayaran tidak selesai. Kamu bisa mencoba lagi dari halaman Akses & pembayaran.</Alert>
          )}
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {transaction.status === "PENDING" ? (
            <Link href={`/billing/return?order=${transaction.orderId}`} className={buttonClassName("secondary")}>
              Periksa lagi
            </Link>
          ) : null}
          <Link href="/billing" className={buttonClassName(transaction.status === "PAID" ? "secondary" : "primary")}>
            Akses & pembayaran
          </Link>
          {transaction.status === "PAID" ? (
            <Link href="/dashboard" className={buttonClassName("primary")}>
              Ke beranda
            </Link>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
