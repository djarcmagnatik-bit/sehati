"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { SelectField } from "@/components/ui/select-field";
import { SubmitButton } from "@/components/ui/submit-button";
import { TextField } from "@/components/ui/text-field";
import { TextareaField } from "@/components/ui/textarea-field";
import { PAYMENT_METHOD_LABEL, PAYMENT_METHODS } from "@/lib/budget";
import { initialFormState } from "@/lib/form-state";
import { recordPaymentAction } from "@/server/actions/budget-actions";
import { MoneyField } from "./money-field";

export function PaymentForm({
  expenseId,
  outstandingLabel,
  todayIso,
}: {
  expenseId: string;
  outstandingLabel: string;
  todayIso: string;
}) {
  const [state, formAction] = useActionState(recordPaymentAction, initialFormState);
  const failed = state.status === "error";
  const value = (key: string, fallback: string) => (failed ? (state.values?.[key] ?? fallback) : fallback);

  return (
    <form
      // Reset to an empty form after each recorded payment; keep input after an error.
      key={failed ? JSON.stringify(state.values) : (state.message ?? "initial")}
      action={formAction}
      noValidate
      className="space-y-4"
    >
      {state.message ? <Alert tone={failed ? "error" : "success"}>{state.message}</Alert> : null}
      <input type="hidden" name="expenseId" value={expenseId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <MoneyField
          label="Nominal pembayaran"
          name="amount"
          required
          defaultValue={value("amount", "")}
          hint={`Sisa tagihan: ${outstandingLabel}`}
          errors={state.fieldErrors?.amount}
        />
        <TextField
          label="Tanggal pembayaran"
          name="paymentDate"
          type="date"
          required
          max={todayIso}
          defaultValue={value("paymentDate", todayIso)}
          errors={state.fieldErrors?.paymentDate}
        />
        <SelectField
          label="Metode"
          name="method"
          required
          defaultValue={value("method", "BANK_TRANSFER")}
          options={PAYMENT_METHODS.map((method) => ({ value: method, label: PAYMENT_METHOD_LABEL[method] }))}
          errors={state.fieldErrors?.method}
        />
        <TextField
          label="Referensi (opsional)"
          name="reference"
          maxLength={120}
          placeholder="No. transaksi / kuitansi"
          defaultValue={value("reference", "")}
          errors={state.fieldErrors?.reference}
        />
      </div>
      <TextareaField
        label="Catatan pembayaran (opsional)"
        name="notes"
        rows={2}
        maxLength={1000}
        defaultValue={value("notes", "")}
        errors={state.fieldErrors?.notes}
      />
      <SubmitButton pendingLabel="Mencatat…">Catat pembayaran</SubmitButton>
    </form>
  );
}
