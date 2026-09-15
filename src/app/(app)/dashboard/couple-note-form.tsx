"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/ui/submit-button";
import { cn } from "@/lib/cn";
import { initialFormState } from "@/lib/form-state";
import { updateCoupleNoteAction } from "@/server/actions/wedding-actions";

export function CoupleNoteForm({ weddingId, note }: { weddingId: string; note: string | null }) {
  const [state, formAction] = useActionState(updateCoupleNoteAction, initialFormState);
  const value = state.values?.note ?? note ?? "";
  const hasError = state.status === "error";

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="weddingId" value={weddingId} />
      <label htmlFor="couple-note" className="sr-only">
        Catatan untuk berdua
      </label>
      <textarea
        // Remount after each submit so the saved value becomes the new default.
        key={value}
        id="couple-note"
        name="note"
        defaultValue={value}
        maxLength={280}
        rows={3}
        placeholder="Contoh: Jangan lupa meeting WO malam ini ❤️"
        aria-describedby="couple-note-status"
        aria-invalid={hasError ? true : undefined}
        className={cn(
          "block w-full rounded-2xl border bg-cream-50 px-4 py-3 text-base text-ink-900 placeholder:text-ink-500/70",
          "focus:outline-2 focus:outline-offset-1 focus:outline-clay-600",
          hasError ? "border-danger-600" : "border-cream-300",
        )}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p
          id="couple-note-status"
          role="status"
          className={cn("text-sm", hasError ? "text-danger-600" : "text-success-700")}
        >
          {state.message ? `${hasError ? "⚠ " : "✓ "}${state.message}` : null}
        </p>
        <SubmitButton variant="secondary" pendingLabel="Menyimpan…">
          Simpan catatan
        </SubmitButton>
      </div>
    </form>
  );
}
