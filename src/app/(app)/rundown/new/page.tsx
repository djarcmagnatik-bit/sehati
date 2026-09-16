import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { RundownItemForm } from "@/components/planning/forms";
import { Card } from "@/components/ui/card";
import { requireSession } from "@/server/auth/session-cookie";
import { getActiveWeddingForUser } from "@/server/wedding/wedding-service";

export const metadata: Metadata = { title: "Tambah kegiatan rundown" };

export default async function NewRundownItemPage() {
  const session = await requireSession();
  const membership = await getActiveWeddingForUser(session.user.id);
  if (!membership) redirect("/onboarding");

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href="/rundown" className="text-sm font-medium text-clay-700 underline-offset-4 hover:underline">
        ← Kembali ke rundown
      </Link>
      <Card>
        <h1 className="font-display text-3xl font-semibold">Tambah kegiatan</h1>
        <div className="mt-6">
          <RundownItemForm
            mode="create"
            weddingId={membership.wedding.id}
            defaults={{
              title: "",
              itemDate: "",
              startTime: "",
              endTime: "",
              description: "",
              pic: "",
              location: "",
              category: "",
              notes: "",
            }}
          />
        </div>
      </Card>
    </div>
  );
}
