"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { buttonClassName } from "@/components/ui/button";
import { SelectField } from "@/components/ui/select-field";
import { SubmitButton } from "@/components/ui/submit-button";
import { TextField } from "@/components/ui/text-field";
import { TextareaField } from "@/components/ui/textarea-field";
import { initialFormState } from "@/lib/form-state";
import { createExpenseAction, updateExpenseAction } from "@/server/actions/budget-actions";
import { MoneyField } from "./money-field";

type ExpenseDefaults = {
  title: string;
  categoryId: string;
  vendorId: string;
  totalAmount: string;
  dueDate: string;
  notes: string;
};

type Props = {
  categories: Array<{ id: string; name: string }>;
  vendors: Array<{ id: string; name: string }>;
} & (
  | { mode: "create"; weddingId: string; defaultCategoryId?: string; defaultVendorId?: string }
  | { mode: "edit"; expenseId: string; defaults: ExpenseDefaults }
);

export function ExpenseForm(props: Props) {
  const [state, formAction] = useActionState(
    props.mode === "create" ? createExpenseAction : updateExpenseAction,
    initialFormState,
  );
  const defaults: ExpenseDefaults =
    props.mode === "edit"
      ? props.defaults
      : {
          title: "",
          categoryId: props.defaultCategoryId ?? "",
          vendorId: props.defaultVendorId ?? "",
          totalAmount: "",
          dueDate: "",
          notes: "",
        };
  const value = (key: keyof ExpenseDefaults) => state.values?.[key] ?? defaults[key];

  return (
    <form key={state.values ? JSON.stringify(state.values) : "initial"} action={formAction} noValidate className="space-y-5">
      {state.status === "error" && state.message ? <Alert tone="error">{state.message}</Alert> : null}
      {props.mode === "create" ? (
        <input type="hidden" name="weddingId" value={props.weddingId} />
      ) : (
        <input type="hidden" name="expenseId" value={props.expenseId} />
      )}

      <TextField
        label="Nama pengeluaran"
        name="title"
        required
        maxLength={160}
        placeholder="Contoh: Kontrak ABC Catering"
        defaultValue={value("title")}
        errors={state.fieldErrors?.title}
      />
      <div className="grid gap-5 sm:grid-cols-2">
        <SelectField
          label="Kategori"
          name="categoryId"
          required
          defaultValue={value("categoryId")}
          options={[{ value: "", label: "Pilih kategori" }, ...props.categories.map((c) => ({ value: c.id, label: c.name }))]}
          errors={state.fieldErrors?.categoryId}
        />
        <SelectField
          label="Vendor (opsional)"
          name="vendorId"
          defaultValue={value("vendorId")}
          options={[{ value: "", label: "Tanpa vendor" }, ...props.vendors.map((v) => ({ value: v.id, label: v.name }))]}
          errors={state.fieldErrors?.vendorId}
        />
        <MoneyField
          label="Total biaya"
          name="totalAmount"
          required
          defaultValue={value("totalAmount")}
          hint="Nilai kontrak / total yang harus dibayar."
          errors={state.fieldErrors?.totalAmount}
        />
        <TextField
          label="Jatuh tempo (opsional)"
          name="dueDate"
          type="date"
          defaultValue={value("dueDate")}
          errors={state.fieldErrors?.dueDate}
        />
      </div>
      <TextareaField
        label="Catatan (opsional)"
        name="notes"
        rows={3}
        maxLength={2000}
        defaultValue={value("notes")}
        errors={state.fieldErrors?.notes}
      />

      <div className="flex flex-wrap items-center justify-end gap-3">
        <Link href="/budget/expenses" className={buttonClassName("ghost")}>
          Batal
        </Link>
        <SubmitButton pendingLabel="Menyimpan…">{props.mode === "create" ? "Simpan pengeluaran" : "Simpan perubahan"}</SubmitButton>
      </div>
    </form>
  );
}
