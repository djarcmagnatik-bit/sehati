import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { WeddingEventForm } from "@/components/invitation/event-form";
import { Card } from "@/components/ui/card";
import { dbDateToIso } from "@/lib/dates";
import { requireSession } from "@/server/auth/session-cookie";
import { getActiveWeddingForUser } from "@/server/wedding/wedding-service";

export const metadata: Metadata = { title: "Tambah acara" };

export default async function NewWeddingEventPage() {
  const session = await requireSession();
  const membership = await getActiveWeddingForUser(session.user.id);
  if (!membership) redirect("/onboarding");

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href="/invitation/events" className="text-sm font-medium text-clay-700 underline-offset-4 hover:underline">
        ← Kembali ke daftar acara
      </Link>
      <Card>
        <h1 className="font-display text-3xl font-semibold">Tambah acara</h1>
        <p className="mt-1 text-ink-700">Tanggal awal mengikuti tanggal pernikahan; ubah bila acaranya di hari lain.</p>
        <div className="mt-6">
          <WeddingEventForm
            mode="create"
            weddingId={membership.wedding.id}
            defaults={{
              name: "",
              eventDate: dbDateToIso(membership.wedding.weddingDate),
              startTime: "",
              endTime: "",
              venueName: "",
              address: "",
              latitude: "",
              longitude: "",
              mapsUrl: "",
              dressCode: "",
              notes: "",
            }}
          />
        </div>
      </Card>
    </div>
  );
}
