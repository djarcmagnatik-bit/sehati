import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GuestForm } from "@/components/guests/guest-form";
import { InvitationStatusBadge, RsvpBadge } from "@/components/guests/guest-badges";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { ConfirmActionButton } from "@/components/ui/confirm-action-button";
import { CopyField } from "@/components/ui/copy-field";
import { formatDateTime } from "@/lib/dates";
import { getEnv } from "@/lib/env";
import { absoluteUrl, guestInvitationPath, whatsappShareUrl } from "@/lib/invitation";
import { seatLabel } from "@/lib/guests";
import { deleteGuestAction } from "@/server/actions/guest-actions";
import { requireSession } from "@/server/auth/session-cookie";
import { getGuestForUser, getGuestGroupOptions } from "@/server/guests/guest-service";
import { getInvitationForUser } from "@/server/invitation/invitation-service";
import { listRsvpSubmissions } from "@/server/rsvp/rsvp-service";

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
  const [groups, invitation, rsvpHistory] = await Promise.all([
    getGuestGroupOptions(session.user.id, guest.weddingId),
    getInvitationForUser(session.user.id, guest.weddingId),
    listRsvpSubmissions(session.user.id, guest.id),
  ]);
  const personalLink =
    invitation?.status === "PUBLISHED" ? absoluteUrl(getEnv().APP_URL, guestInvitationPath(guest.invitationToken)) : null;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href="/guests" className="text-sm font-medium text-clay-700 underline-offset-4 hover:underline">
        ← Kembali ke daftar tamu
      </Link>
      {notice === "updated" ? <Alert tone="success">Perubahan data tamu disimpan.</Alert> : null}

      <Card>
        <h1 className="font-display text-3xl font-semibold">{guest.invitationName}</h1>
        <p className="mt-1 text-sm text-ink-500">
          {[guest.guestName !== guest.invitationName ? guest.guestName : null, guest.group?.name ?? "Tanpa grup", seatLabel(guest.seatCount)]
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

      <Card title="Tautan undangan personal">
        {personalLink ? (
          <div className="space-y-3">
            <CopyField
              label={`Tautan khusus ${guest.invitationName}`}
              value={personalLink}
              hint="Nama tamu diambil dari tautan ini, bukan dari alamat URL. Membuka tautan menandai undangan sebagai “Dibuka”."
            />
            <a
              href={whatsappShareUrl(
                `Kepada Yth. ${guest.invitationName},\n\nDengan penuh sukacita kami mengundang Anda. Detail acara ada di tautan berikut:\n${personalLink}`,
              )}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center rounded-full border border-cream-300 bg-white px-5 text-sm font-semibold hover:bg-cream-100"
            >
              Kirim lewat WhatsApp ↗
            </a>
            {guest.invitationOpenedAt ? (
              <p className="text-xs text-ink-500">Pertama dibuka {formatDateTime(guest.invitationOpenedAt)}.</p>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-ink-700">
            Tautan personal aktif setelah undangan digital diterbitkan.{" "}
            <Link href="/invitation" className="font-semibold text-clay-700 underline underline-offset-4">
              Buka undangan digital
            </Link>
          </p>
        )}
      </Card>

      {rsvpHistory.length > 0 ? (
        <Card title="Riwayat konfirmasi" description="Setiap jawaban tamu disimpan, jawaban terbaru ada di paling atas.">
          <ol className="divide-y divide-cream-200">
            {rsvpHistory.map((entry) => (
              <li key={entry.id} className="py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <RsvpBadge status={entry.rsvpStatus} attendingCount={entry.attendingCount} />
                  <time dateTime={entry.createdAt.toISOString()} className="text-xs text-ink-500">
                    {formatDateTime(entry.createdAt)}
                  </time>
                </div>
                {entry.attendeeNames ? (
                  <p className="mt-2 text-sm text-ink-700">Yang hadir: {entry.attendeeNames}</p>
                ) : null}
                {entry.message ? <p className="mt-1 text-sm whitespace-pre-line text-ink-700">“{entry.message}”</p> : null}
              </li>
            ))}
          </ol>
        </Card>
      ) : null}

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
            seatCount: guest.seatCount === null ? "" : String(guest.seatCount),
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
          message={`Hapus “${guest.invitationName}” (${seatLabel(guest.seatCount).toLowerCase()}) dari daftar tamu?`}
        />
      </Card>
    </div>
  );
}
