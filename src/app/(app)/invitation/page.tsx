import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { InvitationSettingsForm } from "@/components/invitation/invitation-forms";
import { Alert } from "@/components/ui/alert";
import { buttonClassName } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CopyField } from "@/components/ui/copy-field";
import { cn } from "@/lib/cn";
import { getEnv } from "@/lib/env";
import {
  absoluteUrl,
  INVITATION_STATUS_LABEL,
  invitationPath,
  SECTION_DESCRIPTION,
  SECTION_LABEL,
  SECTION_NOTE,
  type InvitationSectionTypeValue,
} from "@/lib/invitation";
import { getTheme } from "@/lib/invitation-themes";
import {
  createInvitationAction,
  moveSectionAction,
  publishInvitationAction,
  toggleSectionAction,
  unpublishInvitationAction,
} from "@/server/actions/invitation-actions";
import { requireSession } from "@/server/auth/session-cookie";
import { listWeddingEvents } from "@/server/invitation/event-service";
import { countWishes } from "@/server/rsvp/wish-service";
import { getInvitationForUser } from "@/server/invitation/invitation-service";
import { getActiveWeddingForUser } from "@/server/wedding/wedding-service";

export const metadata: Metadata = { title: "Undangan digital" };

const MISSING_LABEL: Record<string, string> = {
  events: "minimal satu acara (akad / resepsi)",
  couple: "nama lengkap kedua mempelai",
};

function noticeFor(notice: string | undefined): { tone: "success" | "error" | "info"; message: string } | null {
  if (!notice) return null;
  if (notice === "created") return { tone: "success", message: "Undangan digital dibuat. Lengkapi isinya, lalu terbitkan." };
  if (notice === "published") return { tone: "success", message: "Undangan terbit dan bisa dibuka siapa pun yang punya tautannya." };
  if (notice === "unpublished") return { tone: "info", message: "Undangan ditutup dari publik dan kembali menjadi draf." };
  if (notice.startsWith("incomplete_")) {
    const missing = notice
      .slice("incomplete_".length)
      .split("-")
      .map((key) => MISSING_LABEL[key])
      .filter(Boolean);
    return { tone: "error", message: `Belum bisa diterbitkan. Lengkapi dulu: ${missing.join(" dan ")}.` };
  }
  return null;
}

export default async function InvitationPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string | string[] }>;
}) {
  const session = await requireSession();
  const membership = await getActiveWeddingForUser(session.user.id);
  if (!membership) redirect("/onboarding");

  const { wedding } = membership;
  const [invitation, params] = await Promise.all([getInvitationForUser(session.user.id, wedding.id), searchParams]);
  const notice = noticeFor(typeof params.notice === "string" ? params.notice : undefined);

  if (!invitation) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <h1 className="font-display text-3xl font-semibold">Undangan digital</h1>
        <Card
          title="Belum ada undangan"
          description="Buat undangan digital untuk pernikahan kalian: sampul, acara, cerita, galeri, lokasi, dan info hadiah."
        >
          <form action={createInvitationAction}>
            <input type="hidden" name="weddingId" value={wedding.id} />
            <button type="submit" className={buttonClassName("primary")}>
              Buat undangan digital
            </button>
          </form>
        </Card>
      </div>
    );
  }

  const [events, wishes] = await Promise.all([
    listWeddingEvents(session.user.id, wedding.id),
    countWishes(session.user.id, wedding.id),
  ]);
  const publicUrl = absoluteUrl(getEnv().APP_URL, invitationPath(invitation.slug));
  const published = invitation.status === "PUBLISHED";
  const lastIndex = invitation.sections.length - 1;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">Undangan digital</h1>
          <p className="mt-1 text-ink-700">Susun isi undangan, pilih tema, lalu terbitkan tautannya untuk para tamu.</p>
        </div>
        <Link href={invitationPath(invitation.slug)} target="_blank" className={buttonClassName("secondary")}>
          Pratinjau undangan ↗
        </Link>
      </header>

      {notice ? <Alert tone={notice.tone}>{notice.message}</Alert> : null}

      <Card title="Status">
        <div className="flex flex-wrap items-center gap-3">
          <span
            data-testid="invitation-status"
            className={cn(
              "inline-flex items-center rounded-full px-3 py-1 text-sm font-medium",
              published ? "bg-success-50 text-success-700" : "bg-cream-100 text-ink-700",
            )}
          >
            {INVITATION_STATUS_LABEL[invitation.status]}
          </span>
          <span className="text-sm text-ink-500">Tema: {getTheme(invitation.themeCode).name}</span>
          <span className="text-sm text-ink-500">{events.length} acara</span>
        </div>

        <div className="mt-4">
          <CopyField
            label="Tautan undangan"
            value={publicUrl}
            hint={
              published
                ? "Bagikan tautan ini. Untuk tautan personal per tamu, buka halaman Tamu."
                : "Tautan baru aktif setelah undangan diterbitkan."
            }
          />
        </div>

        <form action={published ? unpublishInvitationAction : publishInvitationAction} className="mt-4">
          <input type="hidden" name="weddingId" value={wedding.id} />
          <button type="submit" className={buttonClassName(published ? "secondary" : "primary")}>
            {published ? "Tutup dari publik" : "Terbitkan undangan"}
          </button>
        </form>
      </Card>

      <Card title="Bagian undangan" description="Nyalakan bagian yang ingin ditampilkan dan atur urutannya.">
        <ul className="divide-y divide-cream-200">
          {invitation.sections.map((section, index) => {
            const type: InvitationSectionTypeValue = section.type;
            const note = SECTION_NOTE[type];
            return (
              <li key={section.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/invitation/sections/${type.toLowerCase()}`}
                    className="font-medium text-ink-900 underline-offset-4 hover:underline"
                  >
                    {SECTION_LABEL[type]}
                  </Link>
                  <p className="mt-0.5 text-xs text-ink-500">{SECTION_DESCRIPTION[type]}</p>
                  {note ? <p className="mt-0.5 text-xs text-clay-700">{note}</p> : null}
                </div>
                <span
                  data-testid={`section-state-${type.toLowerCase()}`}
                  className={cn(
                    "rounded-full px-2.5 py-0.5 text-xs font-medium",
                    section.enabled ? "bg-sage-50 text-sage-700" : "bg-cream-100 text-ink-500",
                  )}
                >
                  {section.enabled ? "Tampil" : "Disembunyikan"}
                </span>
                <div className="flex gap-1">
                  <form action={moveSectionAction}>
                    <input type="hidden" name="sectionId" value={section.id} />
                    <input type="hidden" name="direction" value="up" />
                    <button
                      type="submit"
                      disabled={index === 0}
                      aria-label={`Naikkan ${SECTION_LABEL[type]}`}
                      className="inline-flex size-10 items-center justify-center rounded-full border border-cream-300 bg-white disabled:opacity-40"
                    >
                      ↑
                    </button>
                  </form>
                  <form action={moveSectionAction}>
                    <input type="hidden" name="sectionId" value={section.id} />
                    <input type="hidden" name="direction" value="down" />
                    <button
                      type="submit"
                      disabled={index === lastIndex}
                      aria-label={`Turunkan ${SECTION_LABEL[type]}`}
                      className="inline-flex size-10 items-center justify-center rounded-full border border-cream-300 bg-white disabled:opacity-40"
                    >
                      ↓
                    </button>
                  </form>
                  <form action={toggleSectionAction}>
                    <input type="hidden" name="sectionId" value={section.id} />
                    <input type="hidden" name="enabled" value={section.enabled ? "false" : "true"} />
                    <button type="submit" className={buttonClassName("secondary", "min-h-10 px-3")}>
                      {section.enabled ? "Sembunyikan" : "Tampilkan"}
                    </button>
                  </form>
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card title="Isi undangan">
          <ul className="divide-y divide-cream-200">
            {[
              { href: "/invitation/design", label: "Tema & sampul", description: "Pilih tema, tata letak, dan foto sampul." },
              { href: "/invitation/events", label: "Acara", description: `${events.length} acara tersimpan.` },
              { href: "/invitation/love-story", label: "Cerita cinta", description: "Momen perjalanan kalian." },
              { href: "/invitation/gallery", label: "Galeri", description: "Foto prewedding atau momen pilihan." },
              {
                href: "/invitation/music",
                label: "Musik latar",
                description: invitation.musicEnabled ? "Menyala." : invitation.musicAssetId ? "Tersimpan, sedang mati." : "Belum ada lagu.",
              },
              { href: "/invitation/gift", label: "Hadiah digital", description: "Rekening dan alamat kirim hadiah." },
              { href: "/invitation/wishes", label: "Ucapan & doa", description: `${wishes.total} ucapan dari tamu.` },
            ].map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="flex min-h-14 items-center justify-between gap-3 py-3">
                  <span>
                    <span className="block font-medium text-ink-900">{item.label}</span>
                    <span className="block text-xs text-ink-500">{item.description}</span>
                  </span>
                  <span aria-hidden="true" className="text-ink-500">
                    →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Pengaturan">
          <InvitationSettingsForm
            weddingId={wedding.id}
            slug={invitation.slug}
            defaultGuestLabel={invitation.defaultGuestLabel ?? ""}
            publicOrigin={getEnv().APP_URL.replace(/\/+$/, "")}
          />
        </Card>
      </div>
    </div>
  );
}
