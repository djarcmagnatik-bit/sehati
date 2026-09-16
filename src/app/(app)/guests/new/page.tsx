import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { GuestForm } from "@/components/guests/guest-form";
import { Card } from "@/components/ui/card";
import { requireSession } from "@/server/auth/session-cookie";
import { getGuestGroupOptions } from "@/server/guests/guest-service";
import { getActiveWeddingForUser } from "@/server/wedding/wedding-service";

export const metadata: Metadata = { title: "Tambah tamu" };

export default async function NewGuestPage({
  searchParams,
}: {
  searchParams: Promise<{ group?: string | string[] }>;
}) {
  const session = await requireSession();
  const membership = await getActiveWeddingForUser(session.user.id);
  if (!membership) redirect("/onboarding");

  const [groups, params] = await Promise.all([getGuestGroupOptions(session.user.id, membership.wedding.id), searchParams]);
  const requested = typeof params.group === "string" ? params.group : undefined;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href="/guests" className="text-sm font-medium text-clay-700 underline-offset-4 hover:underline">
        ← Kembali ke daftar tamu
      </Link>
      <Card>
        <h1 className="font-display text-3xl font-semibold">Tambah tamu</h1>
        <p className="mt-1 text-ink-700">Satu data tamu = satu undangan. Isi jumlah kursi untuk undangan keluarga.</p>
        <div className="mt-6">
          <GuestForm
            mode="create"
            weddingId={membership.wedding.id}
            groups={groups}
            defaultGroupId={groups.find((group) => group.id === requested)?.id}
          />
        </div>
      </Card>
    </div>
  );
}
