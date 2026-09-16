import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { buttonClassName } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmActionButton } from "@/components/ui/confirm-action-button";
import { dbDateToIso, formatIsoDateLong } from "@/lib/dates";
import { mapsLink } from "@/lib/maps";
import { deleteWeddingEventAction } from "@/server/actions/invitation-actions";
import { requireSession } from "@/server/auth/session-cookie";
import { listWeddingEvents } from "@/server/invitation/event-service";
import { getActiveWeddingForUser } from "@/server/wedding/wedding-service";

export const metadata: Metadata = { title: "Acara pernikahan" };

const NOTICES: Record<string, string> = {
  created: "Acara ditambahkan.",
  updated: "Perubahan acara disimpan.",
  deleted: "Acara dihapus.",
};

export default async function WeddingEventsPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string | string[] }>;
}) {
  const session = await requireSession();
  const membership = await getActiveWeddingForUser(session.user.id);
  if (!membership) redirect("/onboarding");

  const [events, params] = await Promise.all([listWeddingEvents(session.user.id, membership.wedding.id), searchParams]);
  const notice = typeof params.notice === "string" ? NOTICES[params.notice] : undefined;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href="/invitation" className="text-sm font-medium text-clay-700 underline-offset-4 hover:underline">
        ← Kembali ke undangan
      </Link>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold">Acara</h1>
          <p className="mt-1 text-ink-700">Akad, resepsi, ngunduh mantu — lengkap dengan waktu, tempat, dan peta.</p>
        </div>
        <Link href="/invitation/events/new" className={buttonClassName("primary")}>
          + Tambah acara
        </Link>
      </header>

      {notice ? <Alert tone="success">{notice}</Alert> : null}

      {events.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-cream-300 bg-white p-6 text-center">
          <p className="text-ink-700">Belum ada acara. Undangan bisa diterbitkan setelah minimal satu acara terisi.</p>
        </div>
      ) : (
        <ul className="space-y-4">
          {events.map((event) => {
            const link = mapsLink(event);
            const time = [event.startTime, event.endTime].filter(Boolean).join(" – ");
            return (
              <li key={event.id}>
                <Card>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="font-display text-xl font-semibold">{event.name}</h2>
                      <p className="mt-1 text-sm text-ink-700">
                        <time dateTime={dbDateToIso(event.eventDate)}>{formatIsoDateLong(dbDateToIso(event.eventDate))}</time>
                        {time ? ` · ${time}` : ""}
                      </p>
                      {event.venueName ? <p className="mt-2 font-medium">{event.venueName}</p> : null}
                      {event.address ? <p className="text-sm text-ink-500">{event.address}</p> : null}
                      {event.dressCode ? <p className="mt-2 text-sm text-ink-500">Dress code: {event.dressCode}</p> : null}
                      {link ? (
                        <a
                          href={link}
                          target="_blank"
                          rel="noopener noreferrer nofollow"
                          className="mt-2 inline-block text-sm font-semibold text-clay-700 underline-offset-4 hover:underline"
                        >
                          Lihat peta ↗
                        </a>
                      ) : null}
                    </div>
                    <Link href={`/invitation/events/${event.id}`} className={buttonClassName("secondary", "min-h-10")}>
                      Ubah
                    </Link>
                  </div>
                  <div className="mt-4">
                    <ConfirmActionButton
                      action={deleteWeddingEventAction}
                      fields={{ eventId: event.id }}
                      triggerLabel={`Hapus ${event.name}`}
                      confirmLabel="Ya, hapus acara"
                      message={`Hapus acara “${event.name}” dari undangan?`}
                    />
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
