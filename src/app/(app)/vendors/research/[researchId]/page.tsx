import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BookVendorForm } from "@/components/vendors/book-vendor-form";
import { ResearchStatusBadge } from "@/components/vendors/research-status-badge";
import { VendorContactLinks } from "@/components/vendors/vendor-contact-links";
import { VendorResearchForm } from "@/components/vendors/vendor-research-form";
import { Alert, type AlertTone } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { ConfirmActionButton } from "@/components/ui/confirm-action-button";
import { todayIsoInTimeZone } from "@/lib/dates";
import { formatRupiah, formatRupiahDigits } from "@/lib/money";
import { ratingLabel } from "@/lib/vendors";
import { deleteVendorResearchAction } from "@/server/actions/vendor-actions";
import { requireSession } from "@/server/auth/session-cookie";
import { getBudgetCategoryOptions } from "@/server/budget/budget-service";
import { getVendorCategoryOptions, getVendorResearchForUser } from "@/server/vendors/vendor-service";

export const metadata: Metadata = { title: "Kandidat vendor" };

const NOTICES: Record<string, { tone: AlertTone; message: string }> = {
  updated: { tone: "success", message: "Perubahan kandidat disimpan." },
  is_selected: { tone: "error", message: "Kandidat yang sudah dipilih sebagai vendor tidak bisa dihapus." },
};

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-ink-500">{label}</dt>
      <dd className="whitespace-pre-line font-medium text-ink-900">{children}</dd>
    </div>
  );
}

export default async function VendorResearchDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ researchId: string }>;
  searchParams: Promise<{ notice?: string | string[] }>;
}) {
  const session = await requireSession();
  const { researchId } = await params;
  const research = await getVendorResearchForUser(session.user.id, researchId);
  if (!research) notFound();

  const { notice: noticeKey } = await searchParams;
  const notice = typeof noticeKey === "string" ? NOTICES[noticeKey] : undefined;
  const [categories, budgetCategories] = await Promise.all([
    getVendorCategoryOptions(research.categoryId),
    getBudgetCategoryOptions(session.user.id, research.weddingId),
  ]);
  const suggestedBudgetCategoryId =
    budgetCategories.find((category) => category.name === research.category.budgetCategoryName)?.id ?? "";

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href="/vendors/research" className="text-sm font-medium text-clay-700 underline-offset-4 hover:underline">
        ← Kembali ke riset vendor
      </Link>
      {notice ? <Alert tone={notice.tone}>{notice.message}</Alert> : null}

      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-3xl font-semibold">{research.name}</h1>
          <ResearchStatusBadge status={research.status} />
        </div>
        <p className="mt-1 text-sm text-ink-500">{[research.category.name, research.location].filter(Boolean).join(" · ")}</p>
        <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-3">
          <Detail label="Estimasi harga">{research.estimatedPrice !== null ? formatRupiah(research.estimatedPrice) : "—"}</Detail>
          <Detail label="Paket">{research.packageName ?? "—"}</Detail>
          <Detail label="Rating">{ratingLabel(research.rating)}</Detail>
          {research.pros ? <Detail label="Kelebihan">{research.pros}</Detail> : null}
          {research.cons ? <Detail label="Kekurangan">{research.cons}</Detail> : null}
          {research.notes ? <Detail label="Catatan">{research.notes}</Detail> : null}
        </dl>
        <div className="mt-5">
          <VendorContactLinks contact={research} />
        </div>
      </Card>

      {research.bookedVendor ? (
        <Alert tone="success">
          Kandidat ini sudah dipilih sebagai vendor.{" "}
          <Link href={`/vendors/${research.bookedVendor.id}`} className="font-semibold underline underline-offset-4">
            Lihat vendor {research.bookedVendor.name}
          </Link>
        </Alert>
      ) : (
        <section id="booking" className="scroll-mt-24">
          <Card
            title="Pilih vendor ini"
            description="Kandidat dipindahkan ke vendor dibooking. Semua catatan riset tetap tersimpan."
          >
            <BookVendorForm
              researchId={research.id}
              budgetCategories={budgetCategories}
              suggestedBudgetCategoryId={suggestedBudgetCategoryId}
              defaultPackage={research.packageName ?? ""}
              todayIso={todayIsoInTimeZone(new Date())}
            />
          </Card>
        </section>
      )}

      <Card title="Ubah kandidat">
        <VendorResearchForm
          mode="edit"
          researchId={research.id}
          categories={categories}
          statusLocked={research.bookedVendor !== null}
          defaults={{
            name: research.name,
            categoryId: research.categoryId,
            status: research.status,
            estimatedPrice: research.estimatedPrice !== null ? formatRupiahDigits(research.estimatedPrice) : "",
            packageName: research.packageName ?? "",
            location: research.location ?? "",
            rating: research.rating !== null ? String(research.rating) : "",
            contactPerson: research.contactPerson ?? "",
            whatsapp: research.whatsapp ?? "",
            phone: research.phone ?? "",
            instagram: research.instagram ?? "",
            website: research.website ?? "",
            pros: research.pros ?? "",
            cons: research.cons ?? "",
            notes: research.notes ?? "",
          }}
        />
      </Card>

      <Card title="Hapus kandidat">
        {research.bookedVendor ? (
          <p className="text-sm text-ink-700">Kandidat yang sudah dipilih menjadi bagian dari riwayat vendor dan tidak bisa dihapus.</p>
        ) : (
          <ConfirmActionButton
            action={deleteVendorResearchAction}
            fields={{ researchId: research.id }}
            triggerLabel="Hapus kandidat"
            confirmLabel="Ya, hapus"
            message={`Hapus kandidat “${research.name}” beserta catatannya?`}
          />
        )}
      </Card>
    </div>
  );
}
