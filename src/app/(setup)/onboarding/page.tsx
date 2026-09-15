import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { DEFAULT_TIME_ZONE, todayIsoInTimeZone } from "@/lib/dates";
import { logger } from "@/lib/logger";
import { requireSession } from "@/server/auth/session-cookie";
import { getActiveEventTypes, getActiveMarriageProcesses } from "@/server/wedding/reference-service";
import { userHasWedding } from "@/server/wedding/wedding-service";
import { OnboardingWizard } from "./onboarding-wizard";

export const metadata: Metadata = { title: "Siapkan workspace" };

export default async function OnboardingPage() {
  const session = await requireSession();
  if (await userHasWedding(session.user.id)) redirect("/dashboard");

  const [eventTypes, marriageProcesses] = await Promise.all([getActiveEventTypes(), getActiveMarriageProcesses()]);

  if (eventTypes.length === 0 || marriageProcesses.length === 0) {
    logger.error("onboarding.reference_data_missing", {
      eventTypes: eventTypes.length,
      marriageProcesses: marriageProcesses.length,
    });
    return (
      <Alert tone="error">
        Pilihan jenis acara belum tersedia sehingga workspace belum bisa dibuat. Silakan coba lagi nanti.
      </Alert>
    );
  }

  return (
    <OnboardingWizard
      eventTypes={eventTypes}
      marriageProcesses={marriageProcesses}
      todayIso={todayIsoInTimeZone(new Date(), DEFAULT_TIME_ZONE)}
      defaultDisplayName={session.user.name}
    />
  );
}
