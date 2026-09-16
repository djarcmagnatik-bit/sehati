import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { MusicSettingsForm, MusicUploadForm } from "@/components/planning/forms";
import { Card } from "@/components/ui/card";
import { ConfirmActionButton } from "@/components/ui/confirm-action-button";
import { mediaPath } from "@/lib/media";
import { removeInvitationMusicAction } from "@/server/actions/planning-actions";
import { requireSession } from "@/server/auth/session-cookie";
import { getInvitationForUser } from "@/server/invitation/invitation-service";
import { getActiveWeddingForUser } from "@/server/wedding/wedding-service";

export const metadata: Metadata = { title: "Musik latar undangan" };

export default async function InvitationMusicPage() {
  const session = await requireSession();
  const membership = await getActiveWeddingForUser(session.user.id);
  if (!membership) redirect("/onboarding");

  const invitation = await getInvitationForUser(session.user.id, membership.wedding.id);
  if (!invitation) redirect("/invitation");

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href="/invitation" className="text-sm font-medium text-clay-700 underline-offset-4 hover:underline">
        ← Kembali ke undangan
      </Link>
      <header>
        <h1 className="font-display text-3xl font-semibold">Musik latar</h1>
        <p className="mt-1 text-ink-700">Lagu yang diputar saat tamu membuka undangan. Tamu selalu bisa menjeda atau memutarnya sendiri.</p>
      </header>

      {invitation.musicAssetId ? (
        <Card title="Lagu saat ini">
          <audio controls preload="none" src={mediaPath(invitation.musicAssetId)} className="w-full">
            Browser ini tidak dapat memutar audio.
          </audio>
          <div className="mt-6">
            <MusicSettingsForm weddingId={membership.wedding.id} enabled={invitation.musicEnabled} volume={invitation.musicVolume} />
          </div>
          <div className="mt-6">
            <ConfirmActionButton
              action={removeInvitationMusicAction}
              fields={{ weddingId: membership.wedding.id, assetId: invitation.musicAssetId }}
              triggerLabel="Hapus musik"
              confirmLabel="Ya, hapus"
              message="Undangan akan tampil tanpa musik."
            />
          </div>
        </Card>
      ) : null}

      <Card title={invitation.musicAssetId ? "Ganti lagu" : "Unggah lagu"}>
        <MusicUploadForm weddingId={membership.wedding.id} />
      </Card>
    </div>
  );
}
