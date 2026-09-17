import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckoutButton } from "@/components/billing/checkout-button";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/dates";
import {
  FEATURE_LABEL,
  FEATURE_PATH,
  FEATURES,
  isFeature,
  PAYMENT_STATUS_LABEL,
  type PaymentStatusValue,
} from "@/lib/billing";
import { formatRupiah } from "@/lib/money";
import { requireSession } from "@/server/auth/session-cookie";
import { getBillingOverview } from "@/server/billing/billing-service";
import { getActiveWeddingForUser } from "@/server/wedding/wedding-service";

export const metadata: Metadata = { title: "Akses & pembayaran" };

const STATUS_CLASS: Record<PaymentStatusValue, string> = {
  PENDING: "bg-clay-50 text-clay-700",
  PAID: "bg-success-50 text-success-700",
  FAILED: "bg-danger-50 text-danger-600",
  EXPIRED: "bg-cream-100 text-ink-500",
  REFUNDED: "bg-cream-100 text-ink-700",
};

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ feature?: string | string[] }> }) {
  const session = await requireSession();
  const membership = await getActiveWeddingForUser(session.user.id);
  if (!membership) redirect("/onboarding");

  const { wedding } = membership;
  const [overview, params] = await Promise.all([getBillingOverview(session.user.id, wedding.id), searchParams]);
  const requested = typeof params.feature === "string" && isFeature(params.feature) ? params.feature : null;
  const fullAccess = overview.lockedFeatures.length === 0;
  const now = new Date();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="font-display text-3xl font-semibold">Akses & pembayaran</h1>
        <p className="mt-1 text-ink-700">Akses berlaku untuk satu pernikahan dan otomatis dipakai bersama pasangan.</p>
      </header>

      {requested && !overview.features.has(requested) ? (
        <Alert tone="info">
          <strong>{FEATURE_LABEL[requested]}</strong> termasuk dalam Akses Penuh. Checklist, beranda, tabungan, dan kalender tetap bisa dipakai gratis.
        </Alert>
      ) : null}

      <Card title="Status akses">
        <p className="text-lg font-semibold" data-testid="access-status">
          {fullAccess ? "Akses Penuh aktif" : overview.features.size > 0 ? "Sebagian fitur aktif" : "Akses Gratis"}
        </p>
        <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {FEATURES.map((feature) => {
            const unlocked = overview.features.has(feature);
            return (
              <li
                key={feature}
                data-testid={`feature-${feature}`}
                className={cn("flex items-center justify-between gap-2 rounded-2xl px-3 py-2 text-sm ring-1", unlocked ? "bg-success-50 ring-success-700/20" : "bg-cream-50 ring-cream-200")}
              >
                <span>
                  <span aria-hidden="true">{unlocked ? "✓ " : "🔒 "}</span>
                  {unlocked ? (
                    <Link href={FEATURE_PATH[feature]} className="font-medium underline-offset-4 hover:underline">
                      {FEATURE_LABEL[feature]}
                    </Link>
                  ) : (
                    FEATURE_LABEL[feature]
                  )}
                </span>
                <span className={cn("text-xs", unlocked ? "text-success-700" : "text-ink-500")}>{unlocked ? "Aktif" : "Terkunci"}</span>
              </li>
            );
          })}
        </ul>
        {overview.activeEntitlements.length > 0 ? (
          <ul className="mt-4 space-y-1 text-sm text-ink-700">
            {overview.activeEntitlements.map((entitlement) => (
              <li key={entitlement.id}>
                {entitlement.plan.name} · {entitlement.source === "PURCHASE" ? "dibeli" : "diberikan admin"} ·{" "}
                {entitlement.expiresAt ? `berlaku sampai ${formatDateTime(entitlement.expiresAt, wedding.timeZone)}` : "tanpa batas waktu"}
              </li>
            ))}
          </ul>
        ) : null}
      </Card>

      {!fullAccess
        ? overview.plans.map((plan) => (
            <Card key={plan.id} title={plan.name} description={plan.description ?? undefined}>
              <p className="font-display text-3xl font-semibold text-clay-700" data-testid={`plan-price-${plan.code}`}>
                {formatRupiah(plan.price)}
              </p>
              <p className="text-sm text-ink-500">
                {plan.durationDays ? `Berlaku ${plan.durationDays} hari` : "Sekali bayar, berlaku untuk pernikahan ini"}
              </p>
              <ul className="mt-4 space-y-1 text-sm">
                {plan.features.map((feature) => (
                  <li key={feature}>✓ {FEATURE_LABEL[feature]}</li>
                ))}
              </ul>
              <div className="mt-5">
                <CheckoutButton weddingId={wedding.id} kind="PLAN" code={plan.code} label={`Beli ${plan.name}`} allowPromo />
              </div>
            </Card>
          ))
        : null}

      {overview.addons.some((addon) => addon.isActive || addon.purchased > 0) ? (
        <Card title="Add-on">
          <ul className="divide-y divide-cream-200">
            {overview.addons
              .filter((addon) => addon.isActive || addon.purchased > 0)
              .map((addon) => (
                <li key={addon.id} className="space-y-2 py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-medium">{addon.name}</p>
                    <p className="text-sm text-ink-500">
                      Sisa {addon.remaining} {addon.unit}
                    </p>
                  </div>
                  {addon.description ? <p className="text-sm text-ink-700">{addon.description}</p> : null}
                  {addon.isActive ? (
                    <CheckoutButton
                      weddingId={wedding.id}
                      kind="ADDON"
                      code={addon.code}
                      label={`Beli ${addon.quotaAmount} ${addon.unit} · ${formatRupiah(addon.price)}`}
                    />
                  ) : null}
                </li>
              ))}
          </ul>
        </Card>
      ) : null}

      <Card title="Riwayat pembayaran">
        {overview.transactions.length === 0 ? (
          <p className="text-sm text-ink-700">Belum ada pembayaran.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] text-left text-sm">
              <caption className="sr-only">Riwayat pembayaran</caption>
              <thead>
                <tr className="border-b border-cream-200 text-ink-500">
                  <th scope="col" className="py-2 pr-3">Tanggal</th>
                  <th scope="col" className="py-2 pr-3">Item</th>
                  <th scope="col" className="py-2 pr-3">Jumlah</th>
                  <th scope="col" className="py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {overview.transactions.map((transaction) => (
                  <tr key={transaction.id} className="border-b border-cream-200 last:border-0">
                    <td className="py-2 pr-3 whitespace-nowrap">{formatDateTime(transaction.createdAt, wedding.timeZone)}</td>
                    <td className="py-2 pr-3">
                      <Link href={`/billing/return?order=${transaction.orderId}`} className="underline-offset-4 hover:underline">
                        {transaction.itemName}
                      </Link>
                      <span className="block text-xs text-ink-500">{transaction.orderId}</span>
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">{formatRupiah(transaction.amount)}</td>
                    <td className="py-2">
                      <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", STATUS_CLASS[transaction.status])}>
                        {PAYMENT_STATUS_LABEL[transaction.status]}
                      </span>
                      {transaction.status === "PENDING" && transaction.checkoutUrl && transaction.expiresAt > now ? (
                        <a href={transaction.checkoutUrl} className="ml-2 text-xs font-semibold text-clay-700 underline">
                          Lanjutkan
                        </a>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
