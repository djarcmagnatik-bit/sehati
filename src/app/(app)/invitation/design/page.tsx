import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { invitationFontsClassName } from "@/components/invitation/invitation-fonts";
import { CoverUploadForm, ThemePicker } from "@/components/invitation/invitation-forms";
import { Card } from "@/components/ui/card";
import { ConfirmActionButton } from "@/components/ui/confirm-action-button";
import { themeLook } from "@/lib/invitation-themes";
import { mediaPath } from "@/lib/media";
import { removeCoverImageAction } from "@/server/actions/invitation-actions";
import { requireSession } from "@/server/auth/session-cookie";
import { weddingHasFeature } from "@/server/billing/access";
import { getThemeCatalog } from "@/server/invitation/theme-catalog";
import { coverLayoutOf, getInvitationForUser, openingCoverOf } from "@/server/invitation/invitation-service";
import { getActiveWeddingForUser } from "@/server/wedding/wedding-service";

export const metadata: Metadata = { title: "Tema & sampul undangan" };

export default async function InvitationDesignPage() {
  const session = await requireSession();
  const membership = await getActiveWeddingForUser(session.user.id);
  if (!membership) redirect("/onboarding");

  const invitation = await getInvitationForUser(session.user.id, membership.wedding.id);
  if (!invitation) redirect("/invitation");
  const [catalog, hasPremium] = await Promise.all([getThemeCatalog(), weddingHasFeature(membership.wedding.id, "premium_themes")]);
  // Disabled themes disappear from the picker, except the one this invitation already uses.
  const themes = catalog
    .filter((entry) => entry.isEnabled || entry.code === invitation.themeCode)
    .map((entry) => ({
      code: entry.code,
      name: entry.name,
      description: entry.description,
      swatches: [entry.theme.tokens.background, entry.theme.tokens.surface, entry.theme.tokens.accent, entry.theme.tokens.ink],
      isPremium: entry.isPremium,
      locked: entry.isPremium && !hasPremium && entry.code !== invitation.themeCode,
      preview: (() => {
        const look = themeLook(entry.theme);
        return {
          background: entry.theme.tokens.background,
          ink: entry.theme.tokens.ink,
          accent: entry.theme.tokens.accent,
          ornament: entry.theme.tokens.ornament,
          displayFont: entry.theme.tokens.displayFont,
          headingWeight: look.headingWeight,
          headingStyle: look.headingStyle,
          motif: look.motif,
        };
      })(),
    }));

  return (
    <div className={`mx-auto max-w-3xl space-y-4 ${invitationFontsClassName}`}>
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
              src={mediaPath(invitation.coverImageId, 960)}
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
          openingCover={openingCoverOf(invitation.themeOptions)}
          themes={themes}
        />
      </Card>
    </div>
  );
}
