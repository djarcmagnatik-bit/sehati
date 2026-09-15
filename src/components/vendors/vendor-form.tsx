"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { MoneyField } from "@/components/budget/money-field";
import { Alert } from "@/components/ui/alert";
import { buttonClassName } from "@/components/ui/button";
import { SelectField } from "@/components/ui/select-field";
import { SubmitButton } from "@/components/ui/submit-button";
import { TextField } from "@/components/ui/text-field";
import { TextareaField } from "@/components/ui/textarea-field";
import { initialFormState } from "@/lib/form-state";
import { createVendorAction, updateVendorAction } from "@/server/actions/vendor-actions";

export type VendorDefaults = Record<
  | "name"
  | "categoryId"
  | "packageName"
  | "bookingDate"
  | "eventLabel"
  | "notes"
  | "contactPerson"
  | "whatsapp"
  | "phone"
  | "instagram"
  | "website",
  string
>;

type Props = {
  categories: Array<{ id: string; name: string; budgetCategoryName: string | null }>;
  budgetCategories: Array<{ id: string; name: string }>;
} & ({ mode: "create"; weddingId: string; todayIso: string } | { mode: "edit"; vendorId: string; defaults: VendorDefaults });

export function VendorForm(props: Props) {
  const [state, formAction] = useActionState(
    props.mode === "create" ? createVendorAction : updateVendorAction,
    initialFormState,
  );
  return (
    <VendorFormBody
      key={state.values ? JSON.stringify(state.values) : "initial"}
      {...props}
      state={state}
      formAction={formAction}
    />
  );
}

function VendorFormBody(
  props: Props & { state: typeof initialFormState; formAction: (formData: FormData) => void },
) {
  const { state, formAction, categories, budgetCategories } = props;
  const defaults: VendorDefaults =
    props.mode === "edit"
      ? props.defaults
      : {
          name: "",
          categoryId: "",
          packageName: "",
          bookingDate: props.todayIso,
          eventLabel: "",
          notes: "",
          contactPerson: "",
          whatsapp: "",
          phone: "",
          instagram: "",
          website: "",
        };
  const value = (key: keyof VendorDefaults) => state.values?.[key] ?? defaults[key];
  const errors = state.fieldErrors ?? {};

  // Create mode: suggest the budget category that matches the vendor category until the user picks one.
  const suggest = (categoryId: string) => {
    const name = categories.find((c) => c.id === categoryId)?.budgetCategoryName;
    return budgetCategories.find((b) => b.name === name)?.id ?? "";
  };
  const [categoryId, setCategoryId] = useState(value("categoryId"));
  const [budgetCategoryId, setBudgetCategoryId] = useState(state.values?.budgetCategoryId ?? suggest(value("categoryId")));
  const [budgetTouched, setBudgetTouched] = useState(Boolean(state.values?.budgetCategoryId));

  return (
    <form action={formAction} noValidate className="space-y-6">
      {state.status === "error" && state.message ? <Alert tone="error">{state.message}</Alert> : null}
      {props.mode === "create" ? (
        <input type="hidden" name="weddingId" value={props.weddingId} />
      ) : (
        <input type="hidden" name="vendorId" value={props.vendorId} />
      )}

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-ink-900">Informasi vendor</legend>
        <TextField label="Nama vendor" name="name" required maxLength={120} defaultValue={value("name")} errors={errors.name} />
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label="Kategori"
            name="categoryId"
            required
            value={categoryId}
            onChange={(event) => {
              setCategoryId(event.target.value);
              if (!budgetTouched) setBudgetCategoryId(suggest(event.target.value));
            }}
            options={[{ value: "", label: "Pilih kategori" }, ...categories.map((c) => ({ value: c.id, label: c.name }))]}
            errors={errors.categoryId}
          />
          <TextField label="Paket" name="packageName" maxLength={160} defaultValue={value("packageName")} errors={errors.packageName} />
          <TextField label="Tanggal booking" name="bookingDate" type="date" defaultValue={value("bookingDate")} errors={errors.bookingDate} />
          <TextField
            label="Untuk acara"
            name="eventLabel"
            maxLength={120}
            placeholder="Contoh: Resepsi"
            defaultValue={value("eventLabel")}
            errors={errors.eventLabel}
          />
        </div>
      </fieldset>

      {props.mode === "create" ? (
        <fieldset className="space-y-4">
          <legend className="text-sm font-semibold text-ink-900">Kontrak (opsional)</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <MoneyField
              label="Nilai kontrak"
              name="contractValue"
              defaultValue={state.values?.contractValue ?? ""}
              hint="Jika diisi, pengeluaran kontrak otomatis tercatat di Budget."
              errors={errors.contractValue}
            />
            <SelectField
              label="Kategori budget"
              name="budgetCategoryId"
              value={budgetCategoryId}
              onChange={(event) => {
                setBudgetTouched(true);
                setBudgetCategoryId(event.target.value);
              }}
              options={[{ value: "", label: "Pilih kategori budget" }, ...budgetCategories.map((c) => ({ value: c.id, label: c.name }))]}
              errors={errors.budgetCategoryId}
            />
            <TextField
              label="Jatuh tempo pembayaran"
              name="paymentDueDate"
              type="date"
              defaultValue={state.values?.paymentDueDate ?? ""}
              errors={errors.paymentDueDate}
            />
          </div>
        </fieldset>
      ) : null}

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-ink-900">Kontak</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Nama kontak" name="contactPerson" maxLength={120} defaultValue={value("contactPerson")} errors={errors.contactPerson} />
          <TextField label="WhatsApp" name="whatsapp" inputMode="tel" placeholder="0812-3456-7890" defaultValue={value("whatsapp")} errors={errors.whatsapp} />
          <TextField label="Telepon" name="phone" inputMode="tel" defaultValue={value("phone")} errors={errors.phone} />
          <TextField label="Instagram" name="instagram" placeholder="@namavendor" defaultValue={value("instagram")} errors={errors.instagram} />
          <TextField label="Website" name="website" inputMode="url" placeholder="namavendor.com" defaultValue={value("website")} errors={errors.website} className="sm:col-span-2" />
        </div>
      </fieldset>

      <TextareaField label="Catatan" name="notes" rows={3} maxLength={2000} defaultValue={value("notes")} errors={errors.notes} />

      <div className="flex flex-wrap items-center justify-end gap-3">
        <Link href="/vendors" className={buttonClassName("ghost")}>
          Batal
        </Link>
        <SubmitButton pendingLabel="Menyimpan…">{props.mode === "create" ? "Simpan vendor" : "Simpan perubahan"}</SubmitButton>
      </div>
    </form>
  );
}
