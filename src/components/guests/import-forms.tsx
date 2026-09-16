"use client";

import { useActionState, useId, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/submit-button";
import { initialFormState } from "@/lib/form-state";
import { commitGuestImportAction, uploadGuestImportAction } from "@/server/actions/guest-actions";

export function ImportUploadForm({ weddingId }: { weddingId: string }) {
  const [state, formAction] = useActionState(uploadGuestImportAction, initialFormState);
  const inputId = useId();

  return (
    <form action={formAction} className="space-y-4">
      {state.status === "error" && state.message ? <Alert tone="error">{state.message}</Alert> : null}
      <input type="hidden" name="weddingId" value={weddingId} />
      <div className="space-y-1.5">
        <label htmlFor={inputId} className="block text-sm font-medium text-ink-900">
          File tamu (CSV atau XLSX)
        </label>
        <input
          id={inputId}
          type="file"
          name="file"
          required
          accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="block w-full rounded-xl border border-cream-300 bg-white p-2 text-sm file:mr-3 file:rounded-full file:border-0 file:bg-clay-50 file:px-4 file:py-2 file:font-semibold file:text-clay-700"
        />
        <p className="text-xs text-ink-500">Maksimal 900 KB dan 5.000 baris. Data belum disimpan sebelum kamu konfirmasi.</p>
      </div>
      <SubmitButton pendingLabel="Membaca file…">Pratinjau impor</SubmitButton>
    </form>
  );
}

export function ImportCommitForm({
  batchId,
  validCount,
  duplicateCount,
}: {
  batchId: string;
  validCount: number;
  duplicateCount: number;
}) {
  const [state, formAction] = useActionState(commitGuestImportAction, initialFormState);
  const [includeDuplicates, setIncludeDuplicates] = useState(false);
  const total = validCount + (includeDuplicates ? duplicateCount : 0);

  return (
    <form action={formAction} className="space-y-4">
      {state.status === "error" && state.message ? <Alert tone="error">{state.message}</Alert> : null}
      <input type="hidden" name="batchId" value={batchId} />
      {duplicateCount > 0 ? (
        <label className="flex min-h-11 items-center gap-2 text-sm text-ink-700">
          <input
            type="checkbox"
            name="includeDuplicates"
            checked={includeDuplicates}
            onChange={(event) => setIncludeDuplicates(event.target.checked)}
            className="size-4 accent-clay-600"
          />
          Tetap impor {duplicateCount} baris yang terdeteksi duplikat
        </label>
      ) : null}
      <SubmitButton pendingLabel="Mengimpor…">{`Impor ${total} undangan`}</SubmitButton>
    </form>
  );
}
