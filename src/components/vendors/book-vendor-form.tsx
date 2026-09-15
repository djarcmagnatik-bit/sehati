"use client";

import { useActionState } from "react";
import { MoneyField } from "@/components/budget/money-field";
import { Alert } from "@/components/ui/alert";
import { SelectField } from "@/components/ui/select-field";
import { SubmitButton } from "@/components/ui/submit-button";
import { TextField } from "@/components/ui/text-field";
import { initialFormState } from "@/lib/form-state";
import { bookVendorAction } from "@/server/actions/vendor-actions";

export function BookVendorForm({
  researchId,
  budgetCategories,
  suggestedBudgetCategoryId,
  defaultPackage,
  todayIso,
}: {
  researchId: string;
  budgetCategories: Array<{ id: string; name: string }>;
  suggestedBudgetCategoryId: string;
  defaultPackage: string;
  todayIso: string;
}) {
  const [state, formAction] = useActionState(bookVendorAction, initialFormState);
  const failed = state.status === "error";
  const value = (key: string, fallback: string) => (failed ? (state.values?.[key] ?? fallback) : fallback);

  return (
    <form key={failed ? JSON.stringify(state.values) : "initial"} action={formAction} noValidate className="space-y-4">
      {failed && state.message ? <Alert tone="error">{state.message}</Alert> : null}
      <input type="hidden" name="researchId" value={researchId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <MoneyField
          label="Nilai kontrak"
          name="contractValue"
          defaultValue={value("contractValue", "")}
          hint="Opsional. Jika diisi, pengeluaran kontrak otomatis tercatat di Budget."
          errors={state.fieldErrors?.contractValue}
        />
        <SelectField
          label="Kategori budget"
          name="budgetCategoryId"
          defaultValue={value("budgetCategoryId", suggestedBudgetCategoryId)}
          options={[{ value: "", label: "Pilih kategori budget" }, ...budgetCategories.map((c) => ({ value: c.id, label: c.name }))]}
          errors={state.fieldErrors?.budgetCategoryId}
        />
        <TextField
          label="Jatuh tempo pembayaran"
          name="paymentDueDate"
          type="date"
          defaultValue={value("paymentDueDate", "")}
          hint="Opsional, misalnya tenggat DP."
          errors={state.fieldErrors?.paymentDueDate}
        />
        <TextField
          label="Tanggal booking"
          name="bookingDate"
          type="date"
          defaultValue={value("bookingDate", todayIso)}
          errors={state.fieldErrors?.bookingDate}
        />
        <TextField
          label="Paket yang dipesan"
          name="packageName"
          maxLength={160}
          defaultValue={value("packageName", defaultPackage)}
          errors={state.fieldErrors?.packageName}
          className="sm:col-span-2"
        />
      </div>
      <SubmitButton pendingLabel="Memproses…">Pilih &amp; booking vendor ini</SubmitButton>
    </form>
  );
}
