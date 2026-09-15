import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DeleteTaskButton } from "@/components/checklist/delete-task-button";
import { TaskForm } from "@/components/checklist/task-form";
import { Card } from "@/components/ui/card";
import { dbDateToIso, formatDateTime } from "@/lib/dates";
import { requireSession } from "@/server/auth/session-cookie";
import { getTaskForUser, getTaskFormOptions } from "@/server/checklist/task-service";

export const metadata: Metadata = { title: "Ubah tugas" };

export default async function TaskDetailPage({ params }: { params: Promise<{ taskId: string }> }) {
  const session = await requireSession();
  const { taskId } = await params;
  const task = await getTaskForUser(session.user.id, taskId);
  // Same response for missing tasks and tasks from other workspaces.
  if (!task) notFound();

  const options = await getTaskFormOptions(session.user.id, task.weddingId, task.categoryId);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href="/checklist" className="text-sm font-medium text-clay-700 underline-offset-4 hover:underline">
        ← Kembali ke checklist
      </Link>
      <Card>
        <h1 className="font-display text-3xl font-semibold">Ubah tugas</h1>
        <p className="mt-1 text-sm text-ink-500">
          {task.source === "TEMPLATE" ? "Dari checklist otomatis" : `Dibuat oleh ${task.createdBy?.name ?? "anggota workspace"}`}
          {" · "}Terakhir diubah {formatDateTime(task.updatedAt)}
          {task.completedAt ? ` · Selesai ${formatDateTime(task.completedAt)}` : ""}
        </p>
        <div className="mt-6">
          <TaskForm
            mode="edit"
            taskId={task.id}
            categories={options.categories}
            members={options.members}
            defaults={{
              title: task.title,
              description: task.description,
              categoryId: task.categoryId,
              dueDate: task.dueDate ? dbDateToIso(task.dueDate) : null,
              priority: task.priority,
              status: task.status,
              assigneeMemberId: task.assigneeMemberId,
            }}
          />
        </div>
      </Card>

      <Card title="Hapus tugas">
        {task.source === "CUSTOM" ? (
          <DeleteTaskButton taskId={task.id} title={task.title} />
        ) : (
          <p className="text-sm text-ink-700">
            Tugas dari template tidak bisa dihapus. Jika tidak relevan, ubah statusnya menjadi <strong>Dibatalkan</strong>.
          </p>
        )}
      </Card>
    </div>
  );
}
