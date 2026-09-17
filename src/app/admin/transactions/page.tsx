import type { Metadata } from "next";
import Link from "next/link";
import { AdminPageHeader, AdminTable, adminHref, ADMIN_INPUT_CLASS, Badge, EmptyRow, PAYMENT_STATUS_TONE, first, pageParam, Pagination, Td, Th } from "@/components/admin/admin-ui";
import { buttonClassName } from "@/components/ui/button";
import { PAYMENT_STATUS_LABEL, PAYMENT_STATUSES, type PaymentStatusValue } from "@/lib/billing";
import { formatDateTime } from "@/lib/dates";
import { formatRupiah } from "@/lib/money";
import { requireAdminPage } from "@/server/admin/admin-access";
import { listTransactions, type TransactionFilter } from "@/server/admin/admin-billing-service";

export const metadata: Metadata = { title: "Transaksi" };

type Params = Record<string, string | string[] | undefined>;

export default async function AdminTransactionsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const admin = await requireAdminPage();
  const params = await searchParams;
  const status = first(params.status);
  const filter: TransactionFilter = {
    q: first(params.q).trim().slice(0, 100),
    status: (PAYMENT_STATUSES as readonly string[]).includes(status) ? (status as PaymentStatusValue) : "all",
    page: pageParam(params.page),
  };
  const result = await listTransactions(admin.id, filter);

  return (
    <>
      <AdminPageHeader title="Transaksi" description="Status hanya berubah lewat webhook penyedia pembayaran, bukan dari halaman ini." />
      <form method="get" className="grid gap-3 rounded-3xl border border-cream-200 bg-white p-4 sm:grid-cols-[1fr_auto_auto] sm:items-end">
        <label className="text-sm font-medium">
          Cari order ID atau email
          <input name="q" type="search" defaultValue={filter.q} className={`${ADMIN_INPUT_CLASS} mt-1`} />
        </label>
        <label className="text-sm font-medium">
          Status
          <select name="status" defaultValue={filter.status} className={`${ADMIN_INPUT_CLASS} mt-1`}>
            <option value="all">Semua</option>
            {PAYMENT_STATUSES.map((option) => (
              <option key={option} value={option}>
                {PAYMENT_STATUS_LABEL[option]}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className={buttonClassName("secondary")}>
          Terapkan
        </button>
      </form>

      <AdminTable caption="Daftar transaksi">
        <thead>
          <tr>
            <Th>Order</Th>
            <Th>Pengguna</Th>
            <Th>Item</Th>
            <Th>Jumlah</Th>
            <Th>Status</Th>
            <Th>Dibuat</Th>
          </tr>
        </thead>
        <tbody>
          {result.items.length === 0 ? (
            <EmptyRow colSpan={6}>Tidak ada transaksi yang cocok.</EmptyRow>
          ) : (
            result.items.map((transaction) => {
              const status = transaction.status as PaymentStatusValue;
              return (
                <tr key={transaction.orderId}>
                  <Td>
                    <Link href={`/admin/transactions/${transaction.orderId}`} className="font-mono text-xs underline-offset-4 hover:underline">
                      {transaction.orderId}
                    </Link>
                  </Td>
                  <Td className="break-all">{transaction.user?.email ?? "(akun dihapus)"}</Td>
                  <Td>{transaction.itemName}</Td>
                  <Td className="whitespace-nowrap tabular-nums">
                    {formatRupiah(transaction.amount)}
                    {transaction.promoCode ? <span className="block text-xs text-ink-500">Promo {transaction.promoCode.code}</span> : null}
                  </Td>
                  <Td>
                    <Badge tone={PAYMENT_STATUS_TONE[status]}>{PAYMENT_STATUS_LABEL[status]}</Badge>
                  </Td>
                  <Td className="whitespace-nowrap">{formatDateTime(transaction.createdAt)}</Td>
                </tr>
              );
            })
          )}
        </tbody>
      </AdminTable>
      <Pagination
        page={result.page}
        pageSize={result.pageSize}
        total={result.total}
        href={(page) => adminHref("/admin/transactions", { q: filter.q, status: filter.status, page })}
      />
    </>
  );
}
