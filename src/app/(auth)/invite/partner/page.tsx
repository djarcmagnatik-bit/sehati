import type { Metadata } from "next";
import Link from "next/link";
import { buttonClassName } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatDateTime } from "@/lib/dates";
import { SITE } from "@/lib/site";
import { getCurrentSession } from "@/server/auth/session-cookie";
import { getPartnerInvitationPreview } from "@/server/collaboration/partner-invitation-service";
import { RespondInvitationForm } from "./respond-invitation-form";

export const metadata: Metadata = {
  title: "Undangan workspace",
  robots: { index: false, follow: false },
  // The token is in the URL; never leak it through the Referer header.
  referrer: "no-referrer",
};

export default async function PartnerInvitationPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { token } = await searchParams;
  const value = typeof token === "string" ? token : "";
  const [preview, session] = await Promise.all([getPartnerInvitationPreview(value), getCurrentSession()]);

  if (preview.status === "invalid") {
    return (
      <Card>
        <h1 className="font-display text-3xl font-semibold">Undangan tidak berlaku</h1>
        <p className="mt-2 text-ink-700">
          Tautan undangan ini tidak valid, sudah dipakai, dibatalkan, atau sudah kedaluwarsa. Minta pasanganmu mengirim
          undangan baru.
        </p>
        <Link href="/" className={buttonClassName("secondary", "mt-6 w-full")}>
          Ke beranda
        </Link>
      </Card>
    );
  }

  const returnTo = `/invite/partner?token=${encodeURIComponent(value)}`;

  return (
    <Card>
      <p className="text-sm font-semibold uppercase tracking-widest text-clay-700">Undangan workspace</p>
      <h1 className="mt-2 font-display text-3xl font-semibold text-balance">{preview.coupleName}</h1>
      <p className="mt-2 text-ink-700">
        {preview.inviterName} mengundangmu merencanakan pernikahan bersama di {SITE.name}. Kalian akan melihat dan
        mengubah data yang sama.
      </p>
      <p className="mt-3 text-sm text-ink-500">
        Undangan untuk {preview.maskedEmail} · berlaku sampai {formatDateTime(preview.expiresAt)}
      </p>

      <div className="mt-6">
        {session ? (
          <RespondInvitationForm token={value} accountEmail={session.user.email} />
        ) : (
          <div className="space-y-3">
            <Link href={`/register?next=${encodeURIComponent(returnTo)}`} className={buttonClassName("primary", "w-full")}>
              Daftar untuk menerima
            </Link>
            <Link href={`/login?next=${encodeURIComponent(returnTo)}`} className={buttonClassName("secondary", "w-full")}>
              Saya sudah punya akun
            </Link>
            <p className="text-center text-sm text-ink-500">Gunakan email yang sama dengan undangan.</p>
          </div>
        )}
      </div>
    </Card>
  );
}
