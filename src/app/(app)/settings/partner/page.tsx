import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SettingsNav } from "@/components/app/settings-nav";
import { Alert } from "@/components/ui/alert";
import { buttonClassName } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatDateTime } from "@/lib/dates";
import { revokeInvitationAction } from "@/server/actions/collaboration-actions";
import { requireSession } from "@/server/auth/session-cookie";
import { getPartnerOverview } from "@/server/collaboration/partner-invitation-service";
import { getActiveWeddingForUser } from "@/server/wedding/wedding-service";
import { InvitePartnerForm } from "./invite-partner-form";
import { RemovePartnerButton } from "./remove-partner-button";

export const metadata: Metadata = { title: "Pasangan" };

const NOTICES: Record<string, string> = {
  invitation_revoked: "Undangan dibatalkan. Tautan lama tidak bisa dipakai lagi.",
  partner_removed: "Pasangan telah dikeluarkan dari workspace.",
};

const ROLE_LABEL = { OWNER: "Pemilik workspace", PARTNER: "Pasangan" } as const;

export default async function PartnerSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string | string[] }>;
}) {
  const session = await requireSession();
  const membership = await getActiveWeddingForUser(session.user.id);
  if (!membership) redirect("/onboarding");

  const { wedding } = membership;
  const params = await searchParams;
  const notice = typeof params.notice === "string" ? NOTICES[params.notice] : undefined;
  const overview = await getPartnerOverview(session.user.id, wedding.id);
  const partner = overview.members.find((member) => member.role === "PARTNER");
  const isOwner = overview.viewerRole === "OWNER";
  const pending = overview.pendingInvitation;

  return (
    <div className="space-y-6">
      <header className="space-y-4">
        <h1 className="font-display text-3xl font-semibold">Pengaturan</h1>
        <SettingsNav />
      </header>

      {notice ? <Alert tone="success">{notice}</Alert> : null}

      <Card title="Anggota workspace" description="Satu workspace dipakai berdua: kamu dan pasanganmu.">
        <ul className="divide-y divide-cream-200">
          {overview.members.map((member) => (
            <li key={member.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <span className="font-medium">
                {member.displayName}
                {member.id === overview.viewerMemberId ? <span className="ml-1 text-sm text-ink-500">(kamu)</span> : null}
              </span>
              <span className="text-sm text-ink-500">
                {ROLE_LABEL[member.role]} · bergabung {formatDateTime(member.joinedAt, wedding.timeZone)}
              </span>
            </li>
          ))}
        </ul>
      </Card>

      {partner && isOwner ? (
        <Card
          title="Keluarkan pasangan"
          description="Pasangan langsung kehilangan akses ke workspace ini. Data yang sudah dibuat tetap tersimpan."
        >
          <RemovePartnerButton weddingId={wedding.id} partnerName={partner.displayName} />
        </Card>
      ) : null}

      {!partner && isOwner ? (
        <Card
          title="Undang pasangan"
          description="Pasanganmu akan melihat dan mengubah data yang sama: checklist, tanggal, dan catatan. Undangan berlaku 7 hari."
        >
          {pending ? (
            <div className="mb-5 rounded-2xl bg-cream-100 p-4 text-sm">
              <p className="text-ink-900">
                Menunggu <strong>{pending.email}</strong> menerima undangan.
              </p>
              <p className="mt-1 text-ink-500">Berlaku sampai {formatDateTime(pending.expiresAt, wedding.timeZone)}</p>
              <form action={revokeInvitationAction} className="mt-3">
                <input type="hidden" name="weddingId" value={wedding.id} />
                <button type="submit" className={buttonClassName("secondary", "min-h-10")}>
                  Batalkan undangan
                </button>
              </form>
            </div>
          ) : null}
          <InvitePartnerForm weddingId={wedding.id} defaultEmail={pending?.email ?? ""} hasPending={Boolean(pending)} />
        </Card>
      ) : null}
    </div>
  );
}
