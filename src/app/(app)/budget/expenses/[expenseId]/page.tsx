import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PaymentStatusBadge } from "@/components/budget/badges";
import { ExpenseForm } from "@/components/budget/expense-form";
import { MoneyStat } from "@/components/budget/money-stat";
import { PaymentForm } from "@/components/budget/payment-form";
import { Alert, type AlertTone } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { ConfirmActionButton } from "@/components/ui/confirm-action-button";
import { ProgressBar } from "@/components/ui/progress-bar";
import { PAYMENT_METHOD_LABEL, percentOf } from "@/lib/budget";
import { dbDateToIso, formatIsoDateLong, formatIsoDateShort, todayIsoInTimeZone } from "@/lib/dates";
import { formatRupiah, formatRupiahDigits } from "@/lib/money";
import { deleteExpenseAction, deletePaymentAction } from "@/server/actions/budget-actions";
import { requireSession } from "@/server/auth/session-cookie";
import { getBudgetCategoryOptions, getExpenseForUser } from "@/server/budget/budget-service";

export const metadata: Metadata = { title: "Detail pengeluaran" };

const NOTICES: Record<string, { tone: AlertTone; message: string }> = {
  expense_created: { tone: "success", message: "Pengeluaran ditambahkan. Catat pembayarannya di bawah." },
  expense_updated: { tone: "success", message: "Perubahan pengeluaran disimpan." },
  payment_deleted: { tone: "success", message: "Pembayaran dihapus. Total sudah diperbarui." },
  has_payments: { tone: "error", message: "Pengeluaran dengan riwayat pembayaran tidak bisa dihapus. Hapus pembayarannya dulu." },
};

export default async function ExpenseDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ expenseId: string }>;
  searchParams: Promise<{ notice?: string | string[] }>;
}) {
  const session = await requireSession();
  const { expenseId } = await params;
  const expense = await getExpenseForUser(session.user.id, expenseId);
  // Same response for missing expenses and expenses from other workspaces.
  if (!expense) notFound();

  const { notice: noticeKey } = await searchParams;
  const notice = typeof noticeKey === "string" ? NOTICES[noticeKey] : undefined;
  const categories = await getBudgetCategoryOptions(session.user.id, expense.weddingId);
  const todayIso = todayIsoInTimeZone(new Date());
  const paidPercent = percentOf(expense.paid, expense.totalAmount) ?? 0;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href="/budget/expenses" className="text-sm font-medium text-clay-700 underline-offset-4 hover:underline">
        ← Kembali ke pengeluaran
      </Link>
      {notice ? <Alert tone={notice.tone}>{notice.message}</Alert> : null}

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl font-semibold">{expense.title}</h1>
            <p className="mt-1 text-sm text-ink-500">
              {expense.category.name}
              {expense.dueDate ? ` · Jatuh tempo ${formatIsoDateLong(dbDateToIso(expense.dueDate))}` : ""}
            </p>
          </div>
          <PaymentStatusBadge status={expense.status} />
        </div>
        <dl className="mt-6 grid grid-cols-3 gap-4">
          <MoneyStat label="Total" amount={expense.totalAmount} testId="expense-total" />
          <MoneyStat label="Dibayar" amount={expense.paid} testId="expense-paid" />
          <MoneyStat label="Sisa tagihan" amount={expense.outstanding} testId="expense-outstanding" />
        </dl>
        <ProgressBar percent={paidPercent} label="Persentase terbayar" className="mt-4" />
        {expense.notes ? <p className="mt-4 whitespace-pre-line text-sm text-ink-700">{expense.notes}</p> : null}
      </Card>

      {expense.outstanding > 0n ? (
        <Card title="Catat pembayaran" description="DP, cicilan, atau pelunasan. Nominal tidak boleh melebihi sisa tagihan.">
          <PaymentForm expenseId={expense.id} outstandingLabel={formatRupiah(expense.outstanding)} todayIso={todayIso} />
        </Card>
      ) : (
        <Alert tone="success">Pengeluaran ini sudah lunas.</Alert>
      )}

      <Card title="Riwayat pembayaran">
        {expense.payments.length === 0 ? (
          <p className="text-sm text-ink-700">Belum ada pembayaran.</p>
        ) : (
          <ul className="divide-y divide-cream-200">
            {expense.payments.map((payment) => (
              <li key={payment.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                <div>
                  <p className="font-semibold">{formatRupiah(payment.amount)}</p>
                  <p className="text-sm text-ink-500">
                    {formatIsoDateShort(dbDateToIso(payment.paymentDate))} · {PAYMENT_METHOD_LABEL[payment.method]}
                    {payment.reference ? ` · Ref. ${payment.reference}` : ""}
                    {payment.createdBy ? ` · dicatat oleh ${payment.createdBy.name}` : ""}
                  </p>
                  {payment.notes ? <p className="mt-1 text-sm text-ink-700">{payment.notes}</p> : null}
                </div>
                <ConfirmActionButton
                  action={deletePaymentAction}
                  fields={{ paymentId: payment.id }}
                  triggerLabel={`Hapus pembayaran ${formatRupiah(payment.amount)}`}
                  confirmLabel="Ya, hapus"
                  message="Hapus pembayaran ini? Total dibayar dan sisa tagihan akan dihitung ulang."
                />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Ubah pengeluaran">
        <ExpenseForm
          mode="edit"
          expenseId={expense.id}
          categories={categories}
          defaults={{
            title: expense.title,
            categoryId: expense.categoryId,
            totalAmount: formatRupiahDigits(expense.totalAmount),
            dueDate: expense.dueDate ? dbDateToIso(expense.dueDate) : "",
            notes: expense.notes ?? "",
          }}
        />
      </Card>

      <Card title="Hapus pengeluaran">
        {expense.payments.length === 0 ? (
          <ConfirmActionButton
            action={deleteExpenseAction}
            fields={{ expenseId: expense.id }}
            triggerLabel="Hapus pengeluaran"
            confirmLabel="Ya, hapus"
            message={`Hapus “${expense.title}” secara permanen?`}
          />
        ) : (
          <p className="text-sm text-ink-700">Hapus semua pembayaran terlebih dahulu sebelum menghapus pengeluaran ini.</p>
        )}
      </Card>
    </div>
  );
}
