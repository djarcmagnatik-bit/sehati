import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SavingsEntryForm } from "@/components/planning/forms";
import { Card } from "@/components/ui/card";
import { ConfirmActionButton } from "@/components/ui/confirm-action-button";
import { dbDateToIso } from "@/lib/dates";
import { formatRupiah, formatRupiahDigits } from "@/lib/money";
import { deleteSavingsEntryAction } from "@/server/actions/planning-actions";
import { requireSession } from "@/server/auth/session-cookie";
import { getSavingsEntryForUser } from "@/server/planning/savings-service";

export const metadata: Metadata = { title: "Ubah setoran" };

export default async function EditSavingsEntryPage({ params }: { params: Promise<{ entryId: string }> }) {
  const session = await requireSession();
  const { entryId } = await params;
  const entry = await getSavingsEntryForUser(session.user.id, entryId);
  if (!entry) notFound();

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href="/savings" className="text-sm font-medium text-clay-700 underline-offset-4 hover:underline">
        ← Kembali ke tabungan
      </Link>
      <Card>
        <h1 className="font-display text-3xl font-semibold">Ubah setoran</h1>
        <div className="mt-6">
          <SavingsEntryForm
            mode="edit"
            entryId={entry.id}
            defaults={{
              contributor: entry.contributor,
              amount: formatRupiahDigits(entry.amount),
              entryDate: dbDateToIso(entry.entryDate),
              account: entry.account ?? "",
              notes: entry.notes ?? "",
            }}
          />
        </div>
      </Card>
      <Card title="Hapus setoran">
        <ConfirmActionButton
          action={deleteSavingsEntryAction}
          fields={{ entryId: entry.id }}
          triggerLabel="Hapus setoran"
          confirmLabel="Ya, hapus"
          message={`Hapus setoran ${formatRupiah(entry.amount)} dari ${entry.contributor}?`}
        />
      </Card>
    </div>
  );
}
