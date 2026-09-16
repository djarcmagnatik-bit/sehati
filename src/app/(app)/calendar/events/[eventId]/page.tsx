import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarEventForm } from "@/components/planning/forms";
import { Card } from "@/components/ui/card";
import { ConfirmActionButton } from "@/components/ui/confirm-action-button";
import { dbDateToIso } from "@/lib/dates";
import { deleteCalendarEventAction } from "@/server/actions/planning-actions";
import { requireSession } from "@/server/auth/session-cookie";
import { getCalendarEventForUser } from "@/server/planning/calendar-service";

export const metadata: Metadata = { title: "Ubah agenda" };

export default async function EditCalendarEventPage({ params }: { params: Promise<{ eventId: string }> }) {
  const session = await requireSession();
  const { eventId } = await params;
  const event = await getCalendarEventForUser(session.user.id, eventId);
  if (!event) notFound();
  const dateIso = dbDateToIso(event.eventDate);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href={`/calendar?month=${dateIso.slice(0, 7)}`} className="text-sm font-medium text-clay-700 underline-offset-4 hover:underline">
        ← Kembali ke kalender
      </Link>
      <Card>
        <h1 className="font-display text-3xl font-semibold">Ubah agenda</h1>
        <div className="mt-6">
          <CalendarEventForm
            mode="edit"
            eventId={event.id}
            defaults={{
              title: event.title,
              eventDate: dateIso,
              startTime: event.startTime ?? "",
              endTime: event.endTime ?? "",
              location: event.location ?? "",
              notes: event.notes ?? "",
            }}
          />
        </div>
      </Card>
      <Card title="Hapus agenda">
        <ConfirmActionButton
          action={deleteCalendarEventAction}
          fields={{ eventId: event.id }}
          triggerLabel="Hapus agenda"
          confirmLabel="Ya, hapus"
          message={`Hapus agenda “${event.title}”?`}
        />
      </Card>
    </div>
  );
}
