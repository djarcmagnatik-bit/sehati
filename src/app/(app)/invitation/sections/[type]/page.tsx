import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { SectionForm } from "@/components/invitation/section-form";
import { Card } from "@/components/ui/card";
import {
  INVITATION_SECTION_TYPES,
  SECTION_DESCRIPTION,
  SECTION_LABEL,
  SECTIONS_NOT_YET_INTERACTIVE,
  type InvitationSectionTypeValue,
} from "@/lib/invitation";
import { SECTION_FIELDS } from "@/lib/invitation-fields";
import { requireSession } from "@/server/auth/session-cookie";
import { getInvitationForUser } from "@/server/invitation/invitation-service";
import { getActiveWeddingForUser } from "@/server/wedding/wedding-service";

export const metadata: Metadata = { title: "Bagian undangan" };

const SOURCE_HINT: Partial<Record<InvitationSectionTypeValue, { href: string; label: string }>> = {
  EVENTS: { href: "/invitation/events", label: "Daftar acara diatur di halaman Acara." },
  LOCATION: { href: "/invitation/events", label: "Alamat dan peta diambil dari data acara." },
  LOVE_STORY: { href: "/invitation/love-story", label: "Momen cerita diatur di halaman Cerita cinta." },
  GALLERY: { href: "/invitation/gallery", label: "Foto diatur di halaman Galeri." },
  GIFT: { href: "/invitation/gift", label: "Rekening dan alamat diatur di halaman Hadiah digital." },
  COVER: { href: "/invitation/design", label: "Foto sampul dan tema diatur di halaman Tema & sampul." },
};

export default async function InvitationSectionPage({ params }: { params: Promise<{ type: string }> }) {
  const session = await requireSession();
  const membership = await getActiveWeddingForUser(session.user.id);
  if (!membership) redirect("/onboarding");

  const { type: raw } = await params;
  const type = raw.toUpperCase() as InvitationSectionTypeValue;
  if (!INVITATION_SECTION_TYPES.includes(type)) notFound();

  const invitation = await getInvitationForUser(session.user.id, membership.wedding.id);
  if (!invitation) redirect("/invitation");
  const section = invitation.sections.find((item) => item.type === type);
  if (!section) notFound();

  const hint = SOURCE_HINT[type];

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href="/invitation" className="text-sm font-medium text-clay-700 underline-offset-4 hover:underline">
        ← Kembali ke undangan
      </Link>
      <Card title={SECTION_LABEL[type]} description={SECTION_DESCRIPTION[type]}>
        {hint ? (
          <p className="mb-4 rounded-2xl bg-cream-100 px-4 py-3 text-sm text-ink-700">
            {hint.label}{" "}
            <Link href={hint.href} className="font-semibold text-clay-700 underline underline-offset-4">
              Buka halamannya
            </Link>
          </p>
        ) : null}
        {SECTION_FIELDS[type].length === 0 ? (
          <p className="mb-4 text-sm text-ink-700">Bagian ini tidak punya teks untuk diubah; cukup tampilkan atau sembunyikan.</p>
        ) : null}
        <SectionForm
          sectionId={section.id}
          type={type}
          enabled={section.enabled}
          content={section.content}
          disableToggleReason={
            SECTIONS_NOT_YET_INTERACTIVE.includes(type)
              ? "Formulir tamu belum aktif; untuk sekarang bagian ini hanya menampilkan teks pengantar."
              : undefined
          }
        />
      </Card>
    </div>
  );
}
