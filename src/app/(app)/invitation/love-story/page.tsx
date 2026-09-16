import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LoveStoryForm } from "@/components/invitation/content-forms";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { ConfirmActionButton } from "@/components/ui/confirm-action-button";
import { deleteLoveStoryAction } from "@/server/actions/invitation-actions";
import { requireSession } from "@/server/auth/session-cookie";
import { listLoveStoryEntries } from "@/server/invitation/content-service";
import { getInvitationForUser } from "@/server/invitation/invitation-service";
import { getActiveWeddingForUser } from "@/server/wedding/wedding-service";

export const metadata: Metadata = { title: "Cerita cinta" };

export default async function LoveStoryPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string | string[] }>;
}) {
  const session = await requireSession();
  const membership = await getActiveWeddingForUser(session.user.id);
  if (!membership) redirect("/onboarding");

  const invitation = await getInvitationForUser(session.user.id, membership.wedding.id);
  if (!invitation) redirect("/invitation");

  const [entries, params] = await Promise.all([
    listLoveStoryEntries(session.user.id, membership.wedding.id),
    searchParams,
  ]);
  const storySection = invitation.sections.find((section) => section.type === "LOVE_STORY");

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href="/invitation" className="text-sm font-medium text-clay-700 underline-offset-4 hover:underline">
        ← Kembali ke undangan
      </Link>
      <header>
        <h1 className="font-display text-3xl font-semibold">Cerita cinta</h1>
        <p className="mt-1 text-ink-700">Beberapa momen penting perjalanan kalian, ditampilkan berurutan di undangan.</p>
      </header>

      {params.notice === "deleted" ? <Alert tone="success">Cerita dihapus.</Alert> : null}
      {entries.length > 0 && storySection && !storySection.enabled ? (
        <Alert tone="warning">
          Bagian cerita masih disembunyikan.{" "}
          <Link href="/invitation/sections/love_story" className="font-semibold underline underline-offset-4">
            Tampilkan bagiannya
          </Link>{" "}
          agar muncul di undangan.
        </Alert>
      ) : null}

      <Card title="Tambah cerita">
        <LoveStoryForm mode="create" weddingId={membership.wedding.id} />
      </Card>

      {entries.map((entry) => (
        <Card key={entry.id} title={entry.title} description={entry.timeLabel ?? undefined}>
          <LoveStoryForm
            mode="edit"
            entryId={entry.id}
            defaults={{ title: entry.title, timeLabel: entry.timeLabel ?? "", story: entry.story }}
          />
          <div className="mt-4">
            <ConfirmActionButton
              action={deleteLoveStoryAction}
              fields={{ entryId: entry.id }}
              triggerLabel={`Hapus cerita ${entry.title}`}
              confirmLabel="Ya, hapus"
              message={`Hapus cerita “${entry.title}” dari undangan?`}
            />
          </div>
        </Card>
      ))}
    </div>
  );
}
