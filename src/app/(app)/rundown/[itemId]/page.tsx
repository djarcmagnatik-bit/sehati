import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RundownItemForm } from "@/components/planning/forms";
import { Card } from "@/components/ui/card";
import { ConfirmActionButton } from "@/components/ui/confirm-action-button";
import { dbDateToIso } from "@/lib/dates";
import { deleteRundownItemAction } from "@/server/actions/planning-actions";
import { requireSession } from "@/server/auth/session-cookie";
import { getRundownItemForUser } from "@/server/planning/rundown-service";

export const metadata: Metadata = { title: "Ubah kegiatan rundown" };

export default async function EditRundownItemPage({ params }: { params: Promise<{ itemId: string }> }) {
  const session = await requireSession();
  const { itemId } = await params;
  const item = await getRundownItemForUser(session.user.id, itemId);
  if (!item) notFound();

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href="/rundown" className="text-sm font-medium text-clay-700 underline-offset-4 hover:underline">
        ← Kembali ke rundown
      </Link>
      <Card>
        <h1 className="font-display text-3xl font-semibold">Ubah kegiatan</h1>
        <div className="mt-6">
          <RundownItemForm
            mode="edit"
            itemId={item.id}
            defaults={{
              title: item.title,
              itemDate: item.itemDate ? dbDateToIso(item.itemDate) : "",
              startTime: item.startTime,
              endTime: item.endTime ?? "",
              description: item.description ?? "",
              pic: item.pic ?? "",
              location: item.location ?? "",
              category: item.category ?? "",
              notes: item.notes ?? "",
            }}
          />
        </div>
      </Card>
      <Card title="Hapus kegiatan">
        <ConfirmActionButton
          action={deleteRundownItemAction}
          fields={{ itemId: item.id }}
          triggerLabel="Hapus kegiatan"
          confirmLabel="Ya, hapus"
          message={`Hapus “${item.title}” dari rundown?`}
        />
      </Card>
    </div>
  );
}
