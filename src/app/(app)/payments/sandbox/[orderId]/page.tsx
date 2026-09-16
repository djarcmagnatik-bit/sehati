import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { buttonClassName } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PAYMENT_STATUS_LABEL } from "@/lib/billing";
import { formatRupiah } from "@/lib/money";
import { simulateSandboxPaymentAction } from "@/server/actions/billing-actions";
import { requireSession } from "@/server/auth/session-cookie";
import { getTransactionForUser } from "@/server/billing/billing-service";
import { sandboxAllowed } from "@/server/billing/providers";

export const metadata: Metadata = { title: "Pembayaran simulasi", robots: { index: false, follow: false } };

/** Stand-in for a hosted payment page. Only exists while the sandbox provider is allowed. */
export default async function SandboxPaymentPage({ params }: { params: Promise<{ orderId: string }> }) {
  const session = await requireSession();
  if (!sandboxAllowed()) notFound();
  const { orderId } = await params;
  const transaction = await getTransactionForUser(session.user.id, orderId);
  if (!transaction || transaction.provider !== "sandbox") notFound();

  return (
    <div className="mx-auto max-w-md space-y-4">
      <Alert tone="warning">Mode simulasi: tidak ada uang yang ditarik. Hasilnya dikirim lewat webhook bertanda tangan, sama seperti penyedia pembayaran sungguhan.</Alert>
      <Card>
        <h1 className="font-display text-2xl font-semibold">Pembayaran simulasi</h1>
        <p className="mt-1 text-sm text-ink-500">{transaction.orderId}</p>
        <p className="mt-4 font-medium">{transaction.itemName}</p>
        <p className="font-display text-3xl font-semibold text-clay-700">{formatRupiah(transaction.amount)}</p>
        <p className="mt-2 text-sm text-ink-700">Status: {PAYMENT_STATUS_LABEL[transaction.status]}</p>

        {transaction.status === "PENDING" ? (
          <div className="mt-6 flex flex-wrap gap-2">
            <form action={simulateSandboxPaymentAction}>
              <input type="hidden" name="orderId" value={transaction.orderId} />
              <input type="hidden" name="outcome" value="PAID" />
              <button type="submit" className={buttonClassName("primary")}>
                Bayar (simulasi)
              </button>
            </form>
            <form action={simulateSandboxPaymentAction}>
              <input type="hidden" name="orderId" value={transaction.orderId} />
              <input type="hidden" name="outcome" value="FAILED" />
              <button type="submit" className={buttonClassName("secondary")}>
                Gagalkan (simulasi)
              </button>
            </form>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
