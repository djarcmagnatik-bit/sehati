"use client";

import Link from "next/link";
import { useActionState } from "react";
import { MoneyField } from "@/components/budget/money-field";
import { Alert } from "@/components/ui/alert";
import { buttonClassName } from "@/components/ui/button";
import { SelectField } from "@/components/ui/select-field";
import { SubmitButton } from "@/components/ui/submit-button";
import { TextField } from "@/components/ui/text-field";
import { TextareaField } from "@/components/ui/textarea-field";
import { initialFormState } from "@/lib/form-state";
import { EDITABLE_RESEARCH_STATUSES, VENDOR_RESEARCH_STATUS_LABEL } from "@/lib/vendors";
import { createVendorResearchAction, updateVendorResearchAction } from "@/server/actions/vendor-actions";

export type ResearchDefaults = Record<
  | "name"
  | "categoryId"
  | "status"
  | "estimatedPrice"
  | "packageName"
  | "location"
  | "rating"
  | "contactPerson"
  | "whatsapp"
  | "phone"
  | "instagram"
  | "website"
  | "pros"
  | "cons"
  | "notes"
  | "meetingDate"
  | "meetingTime",
  string
>;

const EMPTY: ResearchDefaults = {
  name: "",
  categoryId: "",
  status: "RESEARCHING",
  estimatedPrice: "",
  packageName: "",
  location: "",
  rating: "",
  contactPerson: "",
  whatsapp: "",
  phone: "",
  instagram: "",
  website: "",
  pros: "",
  cons: "",
  notes: "",
  meetingDate: "",
  meetingTime: "",
};

type Props = { categories: Array<{ id: string; name: string }> } & (
  | { mode: "create"; weddingId: string; defaultCategoryId?: string }
  | { mode: "edit"; researchId: string; defaults: ResearchDefaults; statusLocked: boolean }
);

export function VendorResearchForm(props: Props) {
  const [state, formAction] = useActionState(
    props.mode === "create" ? createVendorResearchAction : updateVendorResearchAction,
    initialFormState,
  );
  const defaults = props.mode === "edit" ? props.defaults : { ...EMPTY, categoryId: props.defaultCategoryId ?? "" };
  const value = (key: keyof ResearchDefaults) => state.values?.[key] ?? defaults[key];
  const errors = state.fieldErrors ?? {};
  const statusLocked = props.mode === "edit" && props.statusLocked;

  return (
    <form key={state.values ? JSON.stringify(state.values) : "initial"} action={formAction} noValidate className="space-y-6">
      {state.status === "error" && state.message ? <Alert tone="error">{state.message}</Alert> : null}
      {props.mode === "create" ? (
        <input type="hidden" name="weddingId" value={props.weddingId} />
      ) : (
        <input type="hidden" name="researchId" value={props.researchId} />
      )}

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-ink-900">Informasi vendor</legend>
        <TextField label="Nama vendor" name="name" required maxLength={120} defaultValue={value("name")} errors={errors.name} />
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label="Kategori"
            name="categoryId"
            required
            defaultValue={value("categoryId")}
            options={[{ value: "", label: "Pilih kategori" }, ...props.categories.map((c) => ({ value: c.id, label: c.name }))]}
            errors={errors.categoryId}
          />
          {statusLocked ? (
            <div className="space-y-1.5">
              <p className="text-sm font-medium text-ink-900">Status</p>
              <p className="flex min-h-11 items-center text-sm text-success-700">✓ Dipilih sebagai vendor (terkunci)</p>
              <input type="hidden" name="status" value="SHORTLISTED" />
            </div>
          ) : (
            <SelectField
              label="Status"
              name="status"
              required
              defaultValue={value("status")}
              options={EDITABLE_RESEARCH_STATUSES.map((s) => ({ value: s, label: VENDOR_RESEARCH_STATUS_LABEL[s] }))}
              errors={errors.status}
            />
          )}
          <MoneyField label="Estimasi harga" name="estimatedPrice" defaultValue={value("estimatedPrice")} errors={errors.estimatedPrice} />
          <SelectField
            label="Rating"
            name="rating"
            defaultValue={value("rating")}
            options={[
              { value: "", label: "Belum dinilai" },
              ...[5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: `${n} – ${"★".repeat(n)}` })),
            ]}
            errors={errors.rating}
          />
          <TextField label="Paket" name="packageName" maxLength={160} defaultValue={value("packageName")} errors={errors.packageName} />
          <TextField label="Lokasi" name="location" maxLength={160} defaultValue={value("location")} errors={errors.location} />
        </div>
      </fieldset>

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

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-ink-900">Janji temu (opsional)</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Tanggal janji temu"
            name="meetingDate"
            type="date"
            hint="Muncul di kalender."
            defaultValue={value("meetingDate")}
            errors={errors.meetingDate}
          />
          <TextField label="Jam janji temu" name="meetingTime" type="time" defaultValue={value("meetingTime")} errors={errors.meetingTime} />
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-ink-900">Penilaian</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextareaField label="Kelebihan" name="pros" rows={3} maxLength={1000} defaultValue={value("pros")} errors={errors.pros} />
          <TextareaField label="Kekurangan" name="cons" rows={3} maxLength={1000} defaultValue={value("cons")} errors={errors.cons} />
        </div>
        <TextareaField label="Catatan" name="notes" rows={3} maxLength={2000} defaultValue={value("notes")} errors={errors.notes} />
      </fieldset>

      <div className="flex flex-wrap items-center justify-end gap-3">
        <Link href="/vendors/research" className={buttonClassName("ghost")}>
          Batal
        </Link>
        <SubmitButton pendingLabel="Menyimpan…">{props.mode === "create" ? "Simpan kandidat" : "Simpan perubahan"}</SubmitButton>
      </div>
    </form>
  );
}
