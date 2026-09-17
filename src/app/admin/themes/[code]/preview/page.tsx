import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { InvitationView } from "@/components/invitation/public/invitation-view";
import { addDaysIso, isoToDbDate, todayIsoInTimeZone } from "@/lib/dates";
import { getTheme, isThemeCode } from "@/lib/invitation-themes";
import { requireAdminPage } from "@/server/admin/admin-access";
import type { PublicInvitation } from "@/server/invitation/public-invitation-service";

export const metadata: Metadata = { title: "Pratinjau tema" };

/** Fictional content only: previews never read a real couple's invitation. */
function sampleInvitation(themeCode: string, now: Date): PublicInvitation {
  const theme = getTheme(themeCode);
  const weddingDateIso = addDaysIso(todayIsoInTimeZone(now), 120);
  const eventDate = isoToDbDate(weddingDateIso);
  return {
    slug: "pratinjau-tema",
    themeCode: theme.code,
    coverLayout: theme.defaultCoverLayout,
    coupleName: "Sekar & Bima",
    brideName: "Sekar",
    groomName: "Bima",
    weddingDateIso,
    timeZone: "Asia/Jakarta",
    defaultGuestLabel: "Tamu Undangan",
    coverImageId: null,
    music: null,
    giftAddress: null,
    sections: [
      { id: "cover", type: "COVER", content: { prefix: "Undangan Pernikahan", note: "Kami mengundang Anda untuk hadir" } },
      {
        id: "couple",
        type: "COUPLE",
        content: {
          intro: "Dengan memohon rahmat Tuhan, kami bermaksud menyelenggarakan pernikahan kami.",
          brideFullName: "Sekar Ayu Lestari",
          brideParents: "Putri dari Bapak Hadi & Ibu Ratna",
          groomFullName: "Bima Pratama",
          groomParents: "Putra dari Bapak Joko & Ibu Sari",
        },
      },
      { id: "quote", type: "QUOTE", content: { text: "Dua jiwa, satu perjalanan, dan banyak cerita yang menanti.", source: "Contoh kutipan" } },
      { id: "events", type: "EVENTS", content: {} },
      { id: "countdown", type: "COUNTDOWN", content: {} },
      { id: "closing", type: "CLOSING", content: { message: "Kehadiran dan doa restu Anda adalah kebahagiaan bagi kami.", signature: "Kami yang berbahagia" } },
    ],
    events: [
      {
        id: "akad",
        name: "Akad Nikah",
        eventDate,
        startTime: "08:00",
        endTime: "10:00",
        venueName: "Gedung Contoh",
        address: "Jl. Contoh No. 1, Yogyakarta",
        latitude: null,
        longitude: null,
        mapsUrl: null,
        dressCode: null,
        notes: null,
        sortOrder: 1,
      },
      {
        id: "resepsi",
        name: "Resepsi",
        eventDate,
        startTime: "11:00",
        endTime: "14:00",
        venueName: "Gedung Contoh",
        address: "Jl. Contoh No. 1, Yogyakarta",
        latitude: null,
        longitude: null,
        mapsUrl: null,
        dressCode: "Batik",
        notes: null,
        sortOrder: 2,
      },
    ],
    loveStory: [],
    gallery: [],
    giftAccounts: [],
  };
}

export default async function ThemePreviewPage({ params }: { params: Promise<{ code: string }> }) {
  await requireAdminPage();
  const { code } = await params;
  if (!isThemeCode(code)) notFound();
  const now = new Date();

  return (
    <>
      <p className="flex flex-wrap items-center justify-between gap-2">
        <Link href="/admin/themes" className="text-sm text-ink-700 underline-offset-4 hover:underline">
          ← Semua tema
        </Link>
        <span className="text-sm text-ink-500">Pratinjau {getTheme(code).name} dengan data contoh</span>
      </p>
      <div className="overflow-hidden rounded-3xl border border-cream-200" data-testid="theme-preview">
        <InvitationView invitation={sampleInvitation(code, now)} now={now} />
      </div>
    </>
  );
}
