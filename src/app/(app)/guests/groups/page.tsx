import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { GuestGroupForm } from "@/components/guests/guest-group-form";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { ConfirmActionButton } from "@/components/ui/confirm-action-button";
import { deleteGuestGroupAction } from "@/server/actions/guest-actions";
import { requireSession } from "@/server/auth/session-cookie";
import { listGuestGroupsWithCounts } from "@/server/guests/guest-service";
import { getActiveWeddingForUser } from "@/server/wedding/wedding-service";

export const metadata: Metadata = { title: "Grup tamu" };

export default async function GuestGroupsPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string | string[] }>;
}) {
  const session = await requireSession();
  const membership = await getActiveWeddingForUser(session.user.id);
  if (!membership) redirect("/onboarding");

  const [{ groups, ungrouped }, { notice }] = await Promise.all([
    listGuestGroupsWithCounts(session.user.id, membership.wedding.id),
    searchParams,
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href="/guests" className="text-sm font-medium text-clay-700 underline-offset-4 hover:underline">
        ← Kembali ke daftar tamu
      </Link>
      <header>
        <h1 className="font-display text-3xl font-semibold">Grup tamu</h1>
        <p className="mt-1 text-ink-700">Kelompokkan tamu supaya mudah dihitung dan dibagi tugas penerima tamu.</p>
      </header>
      {notice === "deleted" ? <Alert tone="success">Grup dihapus. Tamu di dalamnya kini tanpa grup.</Alert> : null}

      <Card title="Tambah grup">
        <GuestGroupForm mode="create" weddingId={membership.wedding.id} />
      </Card>

      <Card title="Daftar grup">
        <ul className="divide-y divide-cream-200">
          {groups.map((group) => (
            <li key={group.id} className="space-y-3 py-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Link
                  href={`/guests?group=${group.id}`}
                  className="font-medium text-ink-900 underline-offset-4 hover:underline"
                >
                  {group.name}
                </Link>
                <span className="text-sm text-ink-500">
                  {group.invitations} undangan · {group.seats} kursi
                </span>
              </div>
              <GuestGroupForm mode="edit" groupId={group.id} name={group.name} />
              <ConfirmActionButton
                action={deleteGuestGroupAction}
                fields={{ groupId: group.id }}
                triggerLabel={`Hapus grup ${group.name}`}
                confirmLabel="Ya, hapus grup"
                message={
                  group.invitations > 0
                    ? `${group.invitations} undangan di grup ini tidak ikut terhapus, hanya menjadi tanpa grup.`
                    : "Hapus grup kosong ini?"
                }
              />
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-ink-500">
          Tanpa grup: {ungrouped.invitations} undangan · {ungrouped.seats} kursi
        </p>
      </Card>
    </div>
  );
}
