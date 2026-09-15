import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PaymentStatusBadge } from "@/components/budget/badges";
import { MoneyStat } from "@/components/budget/money-stat";
import { VendorContactLinks } from "@/components/vendors/vendor-contact-links";
import { VendorForm } from "@/components/vendors/vendor-form";
import { Alert, type AlertTone } from "@/components/ui/alert";
import { buttonClassName } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmActionButton } from "@/components/ui/confirm-action-button";
import { ProgressBar } from "@/components/ui/progress-bar";
import { percentOf } from "@/lib/budget";
import { dbDateToIso, formatIsoDateLong } from "@/lib/dates";
import { formatRupiah } from "@/lib/money";
import { ratingLabel } from "@/lib/vendors";
import { deleteVendorAction } from "@/server/actions/vendor-actions";
import { requireSession } from "@/server/auth/session-cookie";
import { getBudgetCategoryOptions } from "@/server/budget/budget-service";
import { getVendorCategoryOptions, getVendorForUser } from "@/server/vendors/vendor-service";

export const metadata: Metadata = { title: "Detail vendor" };

const NOTICES: Record<string, { tone: AlertTone; message: string }> = {
  booked: { tone: "success", message: "Vendor dipilih. Catatan riset tetap tersimpan, dan kontraknya tercatat di Budget." },
  already_booked: { tone: "info", message: "Kandidat ini sudah dipilih sebelumnya." },
  created: { tone: "success", message: "Vendor ditambahkan." },
  updated: { tone: "success", message: "Perubahan vendor disimpan." },
  has_expenses: { tone: "error", message: "Vendor dengan pengeluaran tercatat tidak bisa dihapus. Hapus atau lepaskan pengeluarannya dulu." },
};

export default async function VendorDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ vendorId: string }>;
  searchParams: Promise<{ notice?: string | string[] }>;
}) {
  const session = await requireSession();
  const { vendorId } = await params;
  const vendor = await getVendorForUser(session.user.id, vendorId);
  if (!vendor) notFound();

  const { notice: noticeKey } = await searchParams;
  const notice = typeof noticeKey === "string" ? NOTICES[noticeKey] : undefined;
  const [categories, budgetCategories] = await Promise.all([
    getVendorCategoryOptions(vendor.categoryId),
    getBudgetCategoryOptions(session.user.id, vendor.weddingId),
  ]);
  const paidPercent = percentOf(vendor.money.paid, vendor.money.contract) ?? 0;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href="/vendors" className="text-sm font-medium text-clay-700 underline-offset-4 hover:underline">
        ← Kembali ke vendor
      </Link>
      {notice ? <Alert tone={notice.tone}>{notice.message}</Alert> : null}

      <Card>
        <h1 className="font-display text-3xl font-semibold">{vendor.name}</h1>
        <p className="mt-1 text-sm text-ink-500">
          {[
            vendor.category.name,
            vendor.packageName,
            vendor.eventLabel ? `Untuk ${vendor.eventLabel}` : null,
            vendor.bookingDate ? `Booking ${formatIsoDateLong(dbDateToIso(vendor.bookingDate))}` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <div className="mt-4">
          <VendorContactLinks contact={vendor} />
        </div>
        {vendor.notes ? <p className="mt-4 whitespace-pre-line text-sm text-ink-700">{vendor.notes}</p> : null}
      </Card>

      <Card title="Kontrak & pembayaran">
        <dl className="grid grid-cols-3 gap-4">
          <MoneyStat label="Nilai kontrak" amount={vendor.money.contract} testId="vendor-detail-contract" />
          <MoneyStat label="Dibayar" amount={vendor.money.paid} testId="vendor-detail-paid" />
          <MoneyStat label="Sisa" amount={vendor.money.outstanding} testId="vendor-detail-outstanding" />
        </dl>
        {vendor.money.contract > 0n ? <ProgressBar percent={paidPercent} label="Persentase terbayar" className="mt-4" /> : null}

        {vendor.expenses.length === 0 ? (
          <p className="mt-4 text-sm text-ink-700">Belum ada pengeluaran untuk vendor ini.</p>
        ) : (
          <ul className="mt-4 divide-y divide-cream-200">
            {vendor.expenses.map((expense) => (
              <li key={expense.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <Link
                    href={`/budget/expenses/${expense.id}`}
                    className="font-medium text-ink-900 underline-offset-4 hover:underline"
                  >
                    {expense.title}
                  </Link>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-500">
                    <PaymentStatusBadge status={expense.status} />
                    {expense.dueDate ? <span>Jatuh tempo {formatIsoDateLong(dbDateToIso(expense.dueDate))}</span> : null}
                  </div>
                </div>
                <div className="text-right text-sm">
                  <p className="font-semibold">{formatRupiah(expense.totalAmount)}</p>
                  {expense.outstanding > 0n ? <p className="text-xs text-ink-500">Sisa {formatRupiah(expense.outstanding)}</p> : null}
                </div>
              </li>
            ))}
          </ul>
        )}
        <Link href={`/budget/expenses/new?vendor=${vendor.id}`} className={buttonClassName("secondary", "mt-4")}>
          + Tambah pengeluaran untuk vendor ini
        </Link>
      </Card>

      {vendor.research ? (
        <Card title="Catatan riset" description="Disimpan dari tahap riset sebelum vendor dipilih.">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-ink-500">Estimasi harga saat riset</dt>
              <dd className="font-medium">
                {vendor.research.estimatedPrice !== null ? formatRupiah(vendor.research.estimatedPrice) : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-ink-500">Rating</dt>
              <dd className="font-medium">{ratingLabel(vendor.research.rating)}</dd>
            </div>
            {vendor.research.pros ? (
              <div>
                <dt className="text-ink-500">Kelebihan</dt>
                <dd className="whitespace-pre-line">{vendor.research.pros}</dd>
              </div>
            ) : null}
            {vendor.research.cons ? (
              <div>
                <dt className="text-ink-500">Kekurangan</dt>
                <dd className="whitespace-pre-line">{vendor.research.cons}</dd>
              </div>
            ) : null}
          </dl>
          <Link
            href={`/vendors/research/${vendor.research.id}`}
            className="mt-3 inline-block text-sm font-semibold text-clay-700 underline-offset-4 hover:underline"
          >
            Lihat catatan riset lengkap
          </Link>
        </Card>
      ) : null}

      <Card title="Ubah vendor">
        <VendorForm
          mode="edit"
          vendorId={vendor.id}
          categories={categories}
          budgetCategories={budgetCategories}
          defaults={{
            name: vendor.name,
            categoryId: vendor.categoryId,
            packageName: vendor.packageName ?? "",
            bookingDate: vendor.bookingDate ? dbDateToIso(vendor.bookingDate) : "",
            eventLabel: vendor.eventLabel ?? "",
            notes: vendor.notes ?? "",
            contactPerson: vendor.contactPerson ?? "",
            whatsapp: vendor.whatsapp ?? "",
            phone: vendor.phone ?? "",
            instagram: vendor.instagram ?? "",
            website: vendor.website ?? "",
          }}
        />
      </Card>

      <Card title="Hapus vendor">
        {vendor.expenses.length === 0 ? (
          <ConfirmActionButton
            action={deleteVendorAction}
            fields={{ vendorId: vendor.id }}
            triggerLabel="Hapus vendor"
            confirmLabel="Ya, hapus"
            message={
              vendor.research
                ? `Hapus “${vendor.name}” dari vendor dibooking? Catatan risetnya tetap ada sebagai kandidat kuat.`
                : `Hapus “${vendor.name}” secara permanen?`
            }
          />
        ) : (
          <p className="text-sm text-ink-700">Vendor ini punya pengeluaran tercatat, jadi tidak bisa dihapus.</p>
        )}
      </Card>
    </div>
  );
}
