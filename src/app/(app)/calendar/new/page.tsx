import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarEventForm } from "@/components/planning/forms";
import { Card } from "@/components/ui/card";
import { todayIsoInTimeZone } from "@/lib/dates";
import { requireSession } from "@/server/auth/session-cookie";
import { getActiveWeddingForUser } from "@/server/wedding/wedding-service";

export const metadata: Metadata = { title: "Tambah agenda" };

export default async function NewCalendarEventPage() {
  const session = await requireSession();
  const membership = await getActiveWeddingForUser(session.user.id);
  if (!membership) redirect("/onboarding");

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href="/calendar" className="text-sm font-medium text-clay-700 underline-offset-4 hover:underline">
        ← Kembali ke kalender
      </Link>
      <Card>
        <h1 className="font-display text-3xl font-semibold">Tambah agenda</h1>
        <p className="mt-1 text-ink-700">Untuk jadwal yang tidak tercatat di tempat lain, misalnya fitting baju atau bimbingan pranikah.</p>
        <div className="mt-6">
          <CalendarEventForm
            mode="create"
            weddingId={membership.wedding.id}
            defaults={{
              title: "",
              eventDate: todayIsoInTimeZone(new Date(), membership.wedding.timeZone),
              startTime: "",
              endTime: "",
              location: "",
              notes: "",
            }}
          />
        </div>
      </Card>
    </div>
  );
}
