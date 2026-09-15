"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { deleteTaskAction } from "@/server/actions/task-actions";

/** Two-step delete: the destructive submit only appears after an explicit first click. */
export function DeleteTaskButton({ taskId, title }: { taskId: string; title: string }) {
  const [confirming, setConfirming] = useState(false);
  const confirmRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (confirming) confirmRef.current?.querySelector<HTMLButtonElement>("button[type=submit]")?.focus();
  }, [confirming]);

  if (!confirming) {
    return (
      <Button variant="danger" onClick={() => setConfirming(true)}>
        Hapus tugas
      </Button>
    );
  }

  return (
    <div ref={confirmRef} role="group" aria-label="Konfirmasi hapus tugas" className="space-y-3 rounded-2xl bg-danger-50 p-4">
      <p className="text-sm text-danger-600">
        Hapus &ldquo;{title}&rdquo; secara permanen? Tindakan ini tidak bisa dibatalkan.
      </p>
      <div className="flex flex-wrap gap-2">
        <form action={deleteTaskAction}>
          <input type="hidden" name="taskId" value={taskId} />
          <SubmitButton variant="danger" pendingLabel="Menghapus…">
            Ya, hapus
          </SubmitButton>
        </form>
        <Button variant="ghost" onClick={() => setConfirming(false)}>
          Batal
        </Button>
      </div>
    </div>
  );
}
