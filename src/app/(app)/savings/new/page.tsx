import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SavingsEntryForm } from "@/components/planning/forms";
import { Card } from "@/components/ui/card";
import { todayIsoInTimeZone } from "@/lib/dates";
import { requireSession } from "@/server/auth/session-cookie";
import { getActiveWeddingForUser } from "@/server/wedding/wedding-service";

export const metadata: Metadata = { title: "Catat setoran" };

export default async function NewSavingsEntryPage() {
  const session = await requireSession();
  const membership = await getActiveWeddingForUser(session.user.id);
  if (!membership) redirect("/onboarding");

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href="/savings" className="text-sm font-medium text-clay-700 underline-offset-4 hover:underline">
        ← Kembali ke tabungan
      </Link>
      <Card>
        <h1 className="font-display text-3xl font-semibold">Catat setoran</h1>
        <div className="mt-6">
          <SavingsEntryForm
            mode="create"
            weddingId={membership.wedding.id}
            defaults={{
              contributor: membership.displayName,
              amount: "",
              entryDate: todayIsoInTimeZone(new Date(), membership.wedding.timeZone),
              account: "",
              notes: "",
            }}
          />
        </div>
      </Card>
    </div>
  );
}
