"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/submit-button";
import { TextField } from "@/components/ui/text-field";
import { initialFormState } from "@/lib/form-state";
import { createBudgetCategoryAction, updateBudgetCategoryAction } from "@/server/actions/budget-actions";
import { MoneyField } from "./money-field";

type Props =
  | { mode: "create"; weddingId: string }
  | { mode: "edit"; categoryId: string; name: string; allocatedAmount: string };

export function BudgetCategoryForm(props: Props) {
  const [state, formAction] = useActionState(
    props.mode === "create" ? createBudgetCategoryAction : updateBudgetCategoryAction,
    initialFormState,
  );
  const failed = state.status === "error";
  const defaults = props.mode === "edit" ? { name: props.name, allocatedAmount: props.allocatedAmount } : { name: "", allocatedAmount: "" };

  return (
    <form
      // Fresh (empty) form after a successful create; echoed values after an error.
      key={failed ? JSON.stringify(state.values) : (state.message ?? "initial")}
      action={formAction}
      noValidate
      className="space-y-4"
    >
      {state.message ? <Alert tone={failed ? "error" : "success"}>{state.message}</Alert> : null}
      {props.mode === "create" ? (
        <input type="hidden" name="weddingId" value={props.weddingId} />
      ) : (
        <input type="hidden" name="categoryId" value={props.categoryId} />
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Nama kategori"
          name="name"
          required
          maxLength={100}
          defaultValue={failed ? state.values?.name : defaults.name}
          errors={state.fieldErrors?.name}
        />
        <MoneyField
          label="Alokasi"
          name="allocatedAmount"
          defaultValue={failed ? state.values?.allocatedAmount : defaults.allocatedAmount}
          hint="Boleh dikosongkan (Rp 0)."
          errors={state.fieldErrors?.allocatedAmount}
        />
      </div>
      <SubmitButton variant={props.mode === "create" ? "secondary" : "primary"} pendingLabel="Menyimpan…">
        {props.mode === "create" ? "Tambah kategori" : "Simpan perubahan"}
      </SubmitButton>
    </form>
  );
}
