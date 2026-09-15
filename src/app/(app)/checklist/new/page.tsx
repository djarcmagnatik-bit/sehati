import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { TaskForm } from "@/components/checklist/task-form";
import { Card } from "@/components/ui/card";
import { requireSession } from "@/server/auth/session-cookie";
import { getTaskFormOptions } from "@/server/checklist/task-service";
import { getActiveWeddingForUser } from "@/server/wedding/wedding-service";

export const metadata: Metadata = { title: "Tambah tugas" };

export default async function NewTaskPage() {
  const session = await requireSession();
  const membership = await getActiveWeddingForUser(session.user.id);
  if (!membership) redirect("/onboarding");

  const options = await getTaskFormOptions(session.user.id, membership.wedding.id);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href="/checklist" className="text-sm font-medium text-clay-700 underline-offset-4 hover:underline">
        ← Kembali ke checklist
      </Link>
      <Card>
        <h1 className="font-display text-3xl font-semibold">Tambah tugas</h1>
        <p className="mt-1 text-ink-700">Tugas baru langsung terlihat oleh kalian berdua.</p>
        <div className="mt-6">
          <TaskForm
            mode="create"
            weddingId={membership.wedding.id}
            categories={options.categories}
            members={options.members}
          />
        </div>
      </Card>
    </div>
  );
}
