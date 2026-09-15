"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/submit-button";
import { TextField } from "@/components/ui/text-field";
import { initialFormState } from "@/lib/form-state";
import { updateBudgetSettingsAction } from "@/server/actions/budget-actions";
import { MoneyField } from "./money-field";

export function BudgetSettingsForm({
  weddingId,
  targetBudget,
  warningPercent,
}: {
  weddingId: string;
  targetBudget: string;
  warningPercent: number;
}) {
  const [state, formAction] = useActionState(updateBudgetSettingsAction, initialFormState);
  const failed = state.status === "error";

  return (
    <form
      key={failed ? JSON.stringify(state.values) : `${state.message ?? "initial"}-${targetBudget}-${warningPercent}`}
      action={formAction}
      noValidate
      className="space-y-4"
    >
      {state.message ? <Alert tone={failed ? "error" : "success"}>{state.message}</Alert> : null}
      <input type="hidden" name="weddingId" value={weddingId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <MoneyField
          label="Target total budget"
          name="targetBudget"
          defaultValue={failed ? state.values?.targetBudget : targetBudget}
          hint="Kosongkan jika belum ditentukan."
          errors={state.fieldErrors?.targetBudget}
        />
        <TextField
          label="Peringatan saat terpakai (%)"
          name="warningPercent"
          inputMode="numeric"
          required
          defaultValue={failed ? state.values?.warningPercent : String(warningPercent)}
          hint="Kategori ditandai saat komitmen mencapai persentase ini dari alokasinya."
          errors={state.fieldErrors?.warningPercent}
        />
      </div>
      <SubmitButton variant="secondary" pendingLabel="Menyimpan…">
        Simpan pengaturan
      </SubmitButton>
    </form>
  );
}
