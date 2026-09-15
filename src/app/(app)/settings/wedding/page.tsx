import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SettingsNav } from "@/components/app/settings-nav";
import { Card } from "@/components/ui/card";
import { dbDateToIso, formatIsoDateLong, todayIsoInTimeZone } from "@/lib/dates";
import { requireSession } from "@/server/auth/session-cookie";
import { countRecalculableTasks, getActiveWeddingForUser } from "@/server/wedding/wedding-service";
import { WeddingDateForm } from "./wedding-date-form";

export const metadata: Metadata = { title: "Pengaturan pernikahan" };

export default async function WeddingSettingsPage() {
  const session = await requireSession();
  const membership = await getActiveWeddingForUser(session.user.id);
  if (!membership) redirect("/onboarding");

  const { wedding } = membership;
  const weddingDateIso = dbDateToIso(wedding.weddingDate);
  const recalculableCount = await countRecalculableTasks(session.user.id, wedding.id);

  return (
    <div className="space-y-6">
      <header className="space-y-4">
        <h1 className="font-display text-3xl font-semibold">Pengaturan</h1>
        <SettingsNav />
      </header>

      <Card
        title="Tanggal pernikahan"
        description={`Saat ini: ${formatIsoDateLong(weddingDateIso)}. Countdown di dashboard langsung mengikuti tanggal baru.`}
      >
        <WeddingDateForm
          weddingId={wedding.id}
          currentDateIso={weddingDateIso}
          todayIso={todayIsoInTimeZone(new Date(), wedding.timeZone)}
          recalculableCount={recalculableCount}
        />
      </Card>
    </div>
  );
}
