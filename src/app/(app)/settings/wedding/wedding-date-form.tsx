"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { FieldError } from "@/components/ui/field-error";
import { SubmitButton } from "@/components/ui/submit-button";
import { TextField } from "@/components/ui/text-field";
import { initialFormState } from "@/lib/form-state";
import { changeWeddingDateAction } from "@/server/actions/wedding-actions";

const RECALCULATE_OPTIONS = [
  { value: "yes", label: "Ya, hitung ulang tenggat", description: "Tenggat mengikuti tanggal pernikahan yang baru." },
  { value: "no", label: "Tidak, biarkan tenggat seperti sekarang", description: "Hanya tanggal pernikahan yang berubah." },
] as const;

export function WeddingDateForm({
  weddingId,
  currentDateIso,
  todayIso,
  recalculableCount,
}: {
  weddingId: string;
  currentDateIso: string;
  todayIso: string;
  recalculableCount: number;
}) {
  const [state, formAction] = useActionState(changeWeddingDateAction, initialFormState);
  const recalculateError = state.fieldErrors?.recalculate?.[0];

  return (
    <form
      // Fresh form after a successful change; keep typed values after an error.
      key={state.status === "success" ? state.message : "form"}
      action={formAction}
      noValidate
      className="space-y-5"
    >
      {state.message ? <Alert tone={state.status === "success" ? "success" : "error"}>{state.message}</Alert> : null}
      <input type="hidden" name="weddingId" value={weddingId} />

      <TextField
        label="Tanggal pernikahan baru"
        name="weddingDate"
        type="date"
        required
        min={todayIso}
        defaultValue={state.status === "error" ? state.values?.weddingDate : currentDateIso}
        errors={state.fieldErrors?.weddingDate}
      />

      <fieldset aria-describedby={recalculateError ? "recalculate-error" : "recalculate-hint"}>
        <legend className="text-sm font-medium text-ink-900">
          Hitung ulang tenggat checklist?<span aria-hidden="true" className="text-clay-600"> *</span>
        </legend>
        <p id="recalculate-hint" className="mt-1 text-sm text-ink-500">
          {recalculableCount} tugas dari checklist otomatis bisa disesuaikan. Tugas yang tenggatnya pernah kamu ubah
          sendiri, sudah selesai, atau dibatalkan tidak akan diubah.
        </p>
        <div className="mt-3 grid gap-2">
          {RECALCULATE_OPTIONS.map((option) => (
            <label
              key={option.value}
              className="flex cursor-pointer items-start gap-3 rounded-2xl border border-cream-300 bg-white p-4 has-[:checked]:border-clay-600 has-[:checked]:bg-clay-50"
            >
              <input
                type="radio"
                name="recalculate"
                value={option.value}
                defaultChecked={state.status === "error" && state.values?.recalculate === option.value}
                className="mt-1 size-4 shrink-0 accent-clay-600"
              />
              <span>
                <span className="block font-medium">{option.label}</span>
                <span className="mt-0.5 block text-sm text-ink-500">{option.description}</span>
              </span>
            </label>
          ))}
        </div>
        <FieldError id="recalculate-error" message={recalculateError} />
      </fieldset>

      <div className="flex justify-end">
        <SubmitButton pendingLabel="Menyimpan…">Simpan tanggal</SubmitButton>
      </div>
    </form>
  );
}
