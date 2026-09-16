import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { WeddingEventForm } from "@/components/invitation/event-form";
import { Card } from "@/components/ui/card";
import { dbDateToIso } from "@/lib/dates";
import { requireSession } from "@/server/auth/session-cookie";
import { getWeddingEventForUser } from "@/server/invitation/event-service";

export const metadata: Metadata = { title: "Ubah acara" };

export default async function EditWeddingEventPage({ params }: { params: Promise<{ eventId: string }> }) {
  const session = await requireSession();
  const { eventId } = await params;
  const event = await getWeddingEventForUser(session.user.id, eventId);
  if (!event) notFound();

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href="/invitation/events" className="text-sm font-medium text-clay-700 underline-offset-4 hover:underline">
        ← Kembali ke daftar acara
      </Link>
      <Card>
        <h1 className="font-display text-3xl font-semibold">Ubah acara</h1>
        <div className="mt-6">
          <WeddingEventForm
            mode="edit"
            eventId={event.id}
            defaults={{
              name: event.name,
              eventDate: dbDateToIso(event.eventDate),
              startTime: event.startTime ?? "",
              endTime: event.endTime ?? "",
              venueName: event.venueName ?? "",
              address: event.address ?? "",
              latitude: event.latitude === null ? "" : String(event.latitude),
              longitude: event.longitude === null ? "" : String(event.longitude),
              mapsUrl: event.mapsUrl ?? "",
              dressCode: event.dressCode ?? "",
              notes: event.notes ?? "",
            }}
          />
        </div>
      </Card>
    </div>
  );
}
