import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CoverUploadForm, ThemePicker } from "@/components/invitation/invitation-forms";
import { Card } from "@/components/ui/card";
import { ConfirmActionButton } from "@/components/ui/confirm-action-button";
import { mediaPath } from "@/lib/media";
import { removeCoverImageAction } from "@/server/actions/invitation-actions";
import { requireSession } from "@/server/auth/session-cookie";
import { coverLayoutOf, getInvitationForUser } from "@/server/invitation/invitation-service";
import { getActiveWeddingForUser } from "@/server/wedding/wedding-service";

export const metadata: Metadata = { title: "Tema & sampul undangan" };

export default async function InvitationDesignPage() {
  const session = await requireSession();
  const membership = await getActiveWeddingForUser(session.user.id);
  if (!membership) redirect("/onboarding");

  const invitation = await getInvitationForUser(session.user.id, membership.wedding.id);
  if (!invitation) redirect("/invitation");

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href="/invitation" className="text-sm font-medium text-clay-700 underline-offset-4 hover:underline">
        ← Kembali ke undangan
      </Link>
      <header>
        <h1 className="font-display text-3xl font-semibold">Tema & sampul</h1>
        <p className="mt-1 text-ink-700">Tema hanya mengubah tampilan. Isi undangan tetap aman saat kamu berganti tema.</p>
      </header>

      <Card title="Foto sampul">
        {invitation.coverImageId ? (
          <div className="space-y-4">
            {/* Served from our own /media route; no external image optimizer is configured. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={mediaPath(invitation.coverImageId)}
              alt="Foto sampul undangan"
              className="aspect-3/4 w-full max-w-xs rounded-2xl object-cover"
            />
            <ConfirmActionButton
              action={removeCoverImageAction}
              fields={{ weddingId: membership.wedding.id, assetId: invitation.coverImageId }}
              triggerLabel="Hapus foto sampul"
              confirmLabel="Ya, hapus"
              message="Undangan akan kembali memakai latar polos sesuai tema."
            />
          </div>
        ) : (
          <p className="mb-4 text-sm text-ink-700">Belum ada foto sampul. Tanpa foto, sampul memakai warna tema.</p>
        )}
        <div className="mt-4">
          <CoverUploadForm weddingId={membership.wedding.id} />
        </div>
      </Card>

      <Card title="Tema">
        <ThemePicker
          weddingId={membership.wedding.id}
          themeCode={invitation.themeCode}
          coverLayout={coverLayoutOf(invitation.themeOptions, invitation.themeCode)}
        />
      </Card>
    </div>
  );
}
