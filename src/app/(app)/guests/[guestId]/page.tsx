import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GuestForm } from "@/components/guests/guest-form";
import { InvitationStatusBadge, RsvpBadge } from "@/components/guests/guest-badges";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { ConfirmActionButton } from "@/components/ui/confirm-action-button";
import { formatDateTime } from "@/lib/dates";
import { deleteGuestAction } from "@/server/actions/guest-actions";
import { requireSession } from "@/server/auth/session-cookie";
import { getGuestForUser, getGuestGroupOptions } from "@/server/guests/guest-service";

export const metadata: Metadata = { title: "Detail tamu" };

export default async function GuestDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ guestId: string }>;
  searchParams: Promise<{ notice?: string | string[] }>;
}) {
  const session = await requireSession();
  const { guestId } = await params;
  const guest = await getGuestForUser(session.user.id, guestId);
  // Same response for missing guests and guests from other workspaces.
  if (!guest) notFound();

  const { notice } = await searchParams;
  const groups = await getGuestGroupOptions(session.user.id, guest.weddingId);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href="/guests" className="text-sm font-medium text-clay-700 underline-offset-4 hover:underline">
        ← Kembali ke daftar tamu
      </Link>
      {notice === "updated" ? <Alert tone="success">Perubahan data tamu disimpan.</Alert> : null}

      <Card>
        <h1 className="font-display text-3xl font-semibold">{guest.invitationName}</h1>
        <p className="mt-1 text-sm text-ink-500">
          {[guest.guestName !== guest.invitationName ? guest.guestName : null, guest.group?.name ?? "Tanpa grup", `${guest.seatCount} kursi`]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <RsvpBadge status={guest.rsvpStatus} attendingCount={guest.attendingCount} />
          <InvitationStatusBadge status={guest.invitationStatus} />
        </div>
        <p className="mt-3 text-xs text-ink-500">
          Ditambahkan {guest.createdBy ? `oleh ${guest.createdBy.name} ` : ""}· {formatDateTime(guest.createdAt)}
        </p>
      </Card>

      <Card title="Ubah data tamu">
        <GuestForm
          mode="edit"
          guestId={guest.id}
          groups={groups}
          invitationOpened={guest.invitationStatus === "OPENED"}
          defaults={{
            guestName: guest.guestName,
            invitationName: guest.invitationName,
            groupId: guest.groupId ?? "",
            phone: guest.phone ?? "",
            email: guest.email ?? "",
            address: guest.address ?? "",
            seatCount: String(guest.seatCount),
            invitationStatus: guest.invitationStatus,
            rsvpStatus: guest.rsvpStatus,
            attendingCount: String(guest.attendingCount),
            notes: guest.notes ?? "",
          }}
        />
      </Card>

      <Card title="Hapus tamu">
        <ConfirmActionButton
          action={deleteGuestAction}
          fields={{ guestId: guest.id }}
          triggerLabel="Hapus tamu"
          confirmLabel="Ya, hapus"
          message={`Hapus “${guest.invitationName}” (${guest.seatCount} kursi) dari daftar tamu?`}
        />
      </Card>
    </div>
  );
}
