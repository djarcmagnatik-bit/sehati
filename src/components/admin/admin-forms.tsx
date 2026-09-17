"use client";

import Link from "next/link";
import { useActionState, useId, useState } from "react";
import { MoneyField } from "@/components/budget/money-field";
import { Alert } from "@/components/ui/alert";
import { buttonClassName } from "@/components/ui/button";
import { SelectField } from "@/components/ui/select-field";
import { SubmitButton } from "@/components/ui/submit-button";
import { TextField } from "@/components/ui/text-field";
import { TextareaField } from "@/components/ui/textarea-field";
import { FEATURE_LABEL, FEATURES } from "@/lib/billing";
import { initialFormState, type FormState } from "@/lib/form-state";
import { PROMO_DISCOUNT_TYPE_LABEL, PROMO_DISCOUNT_TYPES } from "@/lib/promo";
import {
  createPlanAction,
  createPromoCodeAction,
  createTaskTemplateAction,
  grantPlanAction,
  suspendUserAction,
  updateAddonAction,
  updatePlanAction,
  updatePromoCodeAction,
  updateTaskTemplateAction,
  updateThemeSettingAction,
} from "@/server/actions/admin-actions";

function Message({ state }: { state: FormState }) {
  if (!state.message) return null;
  return <Alert tone={state.status === "error" ? "error" : "success"}>{state.message}</Alert>;
}

function Checkbox({ name, label, defaultChecked }: { name: string; label: string; defaultChecked: boolean }) {
  return (
    <label className="flex min-h-11 items-center gap-2 text-sm font-medium">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="size-4 accent-clay-600" />
      {label}
    </label>
  );
}

function CheckboxGroup({
  legend,
  name,
  options,
  selected,
  errors,
}: {
  legend: string;
  name: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  selected: readonly string[];
  errors?: string[];
}) {
  return (
    <fieldset>
      <legend className="text-sm font-medium text-ink-900">{legend}</legend>
      <div className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
        {options.map((option) => (
          <label key={option.value} className="flex min-h-10 items-center gap-2 text-sm">
            <input type="checkbox" name={name} value={option.value} defaultChecked={selected.includes(option.value)} className="size-4 accent-clay-600" />
            {option.label}
          </label>
        ))}
      </div>
      {errors?.[0] ? <p className="mt-1 text-sm text-danger-600">{errors[0]}</p> : null}
    </fieldset>
  );
}

// ─── Users & weddings ────────────────────────────────────────────────────────

export function SuspendUserForm({ userId }: { userId: string }) {
  const [state, formAction] = useActionState(suspendUserAction, initialFormState);
  return (
    <form action={formAction} noValidate className="space-y-3">
      <Message state={state} />
      <input type="hidden" name="userId" value={userId} />
      <TextField label="Alasan suspend" name="reason" required maxLength={200} defaultValue={state.values?.reason ?? ""} errors={state.fieldErrors?.reason} />
      <SubmitButton variant="danger" pendingLabel="Memproses…">
        Suspend akun
      </SubmitButton>
    </form>
  );
}

export function GrantPlanForm({ weddingId, plans }: { weddingId: string; plans: Array<{ code: string; name: string }> }) {
  const [state, formAction] = useActionState(grantPlanAction, initialFormState);
  return (
    <form action={formAction} noValidate className="space-y-3">
      <Message state={state} />
      <input type="hidden" name="weddingId" value={weddingId} />
      <SelectField
        label="Paket"
        name="planCode"
        defaultValue={state.values?.planCode ?? plans[0]?.code ?? ""}
        options={plans.map((plan) => ({ value: plan.code, label: plan.name }))}
        errors={state.fieldErrors?.planCode}
      />
      <TextField label="Catatan (tercatat di audit log)" name="note" required maxLength={200} defaultValue={state.values?.note ?? ""} errors={state.fieldErrors?.note} />
      <SubmitButton pendingLabel="Memberikan…">Berikan akses</SubmitButton>
    </form>
  );
}

// ─── Plans & add-ons ─────────────────────────────────────────────────────────

export type PlanDefaults = { code: string; name: string; description: string; price: string; durationDays: string; features: string[]; isActive: boolean; sortOrder: string };

export function PlanForm(props: { defaults: PlanDefaults } & ({ mode: "create" } | { mode: "edit"; planId: string })) {
  const [state, formAction] = useActionState(props.mode === "create" ? createPlanAction : updatePlanAction, initialFormState);
  const value = (key: Exclude<keyof PlanDefaults, "features" | "isActive">) => state.values?.[key] ?? props.defaults[key];
  const features = state.values?.features !== undefined ? state.values.features.split(",").filter(Boolean) : props.defaults.features;
  const errors = state.fieldErrors ?? {};

  return (
    <form key={JSON.stringify(state.values ?? "initial")} action={formAction} noValidate className="space-y-5">
      {state.status === "error" && state.message ? <Alert tone="error">{state.message}</Alert> : null}
      {props.mode === "edit" ? <input type="hidden" name="planId" value={props.planId} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        {props.mode === "create" ? (
          <TextField label="Kode" name="code" required maxLength={40} placeholder="FULL_ACCESS_YEAR" defaultValue={value("code")} errors={errors.code} />
        ) : (
          <div>
            <input type="hidden" name="code" value={props.defaults.code} />
            <p className="text-sm font-medium text-ink-900">Kode</p>
            <p className="mt-2 font-mono text-sm">{props.defaults.code}</p>
          </div>
        )}
        <TextField label="Nama" name="name" required maxLength={80} defaultValue={value("name")} errors={errors.name} />
        <MoneyField label="Harga" name="price" required defaultValue={value("price")} errors={errors.price} />
        <TextField label="Durasi (hari)" name="durationDays" inputMode="numeric" hint="Kosong = berlaku seumur workspace." defaultValue={value("durationDays")} errors={errors.durationDays} />
        <TextField label="Urutan" name="sortOrder" inputMode="numeric" defaultValue={value("sortOrder")} errors={errors.sortOrder} />
      </div>
      <TextareaField label="Deskripsi" name="description" rows={3} maxLength={500} defaultValue={value("description")} errors={errors.description} />
      <CheckboxGroup
        legend="Fitur yang dibuka"
        name="features"
        options={FEATURES.map((feature) => ({ value: feature, label: FEATURE_LABEL[feature] }))}
        selected={features}
        errors={errors.features}
      />
      <Checkbox name="isActive" label="Aktif (bisa dibeli)" defaultChecked={state.values ? state.values.isActive === "on" : props.defaults.isActive} />
      <p className="text-xs text-ink-500">Perubahan harga hanya berlaku untuk checkout baru; pesanan yang sudah dibuat tetap memakai harga lamanya.</p>
      <div className="flex flex-wrap justify-end gap-3">
        <Link href="/admin/plans" className={buttonClassName("ghost")}>
          Batal
        </Link>
        <SubmitButton pendingLabel="Menyimpan…">{props.mode === "create" ? "Buat paket" : "Simpan paket"}</SubmitButton>
      </div>
    </form>
  );
}

export function AddonForm({
  addonId,
  defaults,
}: {
  addonId: string;
  defaults: { name: string; description: string; price: string; quotaAmount: string; unit: string; isActive: boolean };
}) {
  const [state, formAction] = useActionState(updateAddonAction, initialFormState);
  const failed = state.status === "error";
  const value = (key: "name" | "description" | "price" | "quotaAmount" | "unit") => (failed ? state.values?.[key] : undefined) ?? defaults[key];
  const errors = state.fieldErrors ?? {};
  return (
    <form action={formAction} noValidate className="space-y-4">
      <Message state={state} />
      <input type="hidden" name="addonId" value={addonId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Nama" name="name" required maxLength={80} defaultValue={value("name")} errors={errors.name} />
        <MoneyField label="Harga" name="price" required defaultValue={value("price")} errors={errors.price} />
        <TextField label="Kuota per pembelian" name="quotaAmount" inputMode="numeric" required defaultValue={value("quotaAmount")} errors={errors.quotaAmount} />
        <TextField label="Satuan" name="unit" required maxLength={30} defaultValue={value("unit")} errors={errors.unit} />
      </div>
      <TextareaField label="Deskripsi" name="description" rows={2} maxLength={500} defaultValue={value("description")} errors={errors.description} />
      <Checkbox name="isActive" label="Aktif (bisa dibeli)" defaultChecked={failed ? state.values?.isActive === "on" : defaults.isActive} />
      <SubmitButton variant="secondary" pendingLabel="Menyimpan…">
        Simpan add-on
      </SubmitButton>
    </form>
  );
}

// ─── Promo codes ─────────────────────────────────────────────────────────────

export type PromoDefaults = Record<
  "code" | "description" | "discountType" | "discountValue" | "planId" | "startsOn" | "endsOn" | "usageLimit" | "perUserLimit",
  string
> & { isActive: boolean };

export function PromoCodeForm(
  props: { defaults: PromoDefaults; plans: Array<{ id: string; name: string }> } & ({ mode: "create" } | { mode: "edit"; promoId: string }),
) {
  const [state, formAction] = useActionState(props.mode === "create" ? createPromoCodeAction : updatePromoCodeAction, initialFormState);
  const value = (key: Exclude<keyof PromoDefaults, "isActive">) => state.values?.[key] ?? props.defaults[key];
  const [type, setType] = useState(value("discountType"));
  const errors = state.fieldErrors ?? {};

  return (
    <form key={JSON.stringify(state.values ?? "initial")} action={formAction} noValidate className="space-y-5">
      {state.status === "error" && state.message ? <Alert tone="error">{state.message}</Alert> : null}
      {props.mode === "edit" ? <input type="hidden" name="promoId" value={props.promoId} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        {props.mode === "create" ? (
          <TextField label="Kode" name="code" required maxLength={40} placeholder="NIKAH2026" defaultValue={value("code")} errors={errors.code} />
        ) : (
          <div>
            <input type="hidden" name="code" value={props.defaults.code} />
            <p className="text-sm font-medium text-ink-900">Kode</p>
            <p className="mt-2 font-mono text-sm">{props.defaults.code}</p>
          </div>
        )}
        <SelectField
          label="Berlaku untuk"
          name="planId"
          defaultValue={value("planId")}
          options={[{ value: "", label: "Semua paket" }, ...props.plans.map((plan) => ({ value: plan.id, label: plan.name }))]}
          errors={errors.planId}
        />
        <SelectField
          label="Jenis diskon"
          name="discountType"
          value={type}
          onChange={(event) => setType(event.target.value)}
          options={PROMO_DISCOUNT_TYPES.map((option) => ({ value: option, label: PROMO_DISCOUNT_TYPE_LABEL[option] }))}
          errors={errors.discountType}
        />
        {type === "PERCENT" ? (
          <TextField label="Diskon (%)" name="discountValue" inputMode="numeric" required hint="1–99" defaultValue={value("discountValue")} errors={errors.discountValue} />
        ) : (
          <MoneyField label="Diskon (Rp)" name="discountValue" required defaultValue={value("discountValue")} errors={errors.discountValue} />
        )}
        <TextField label="Mulai berlaku" name="startsOn" type="date" defaultValue={value("startsOn")} errors={errors.startsOn} />
        <TextField label="Berlaku sampai (termasuk hari itu)" name="endsOn" type="date" defaultValue={value("endsOn")} errors={errors.endsOn} />
        <TextField label="Batas pemakaian total" name="usageLimit" inputMode="numeric" hint="Kosong = tanpa batas." defaultValue={value("usageLimit")} errors={errors.usageLimit} />
        <TextField label="Batas per pengguna" name="perUserLimit" inputMode="numeric" hint="Kosong = tanpa batas." defaultValue={value("perUserLimit")} errors={errors.perUserLimit} />
      </div>
      <TextField label="Deskripsi" name="description" maxLength={200} defaultValue={value("description")} errors={errors.description} />
      <Checkbox name="isActive" label="Aktif" defaultChecked={state.values ? state.values.isActive === "on" : props.defaults.isActive} />
      <p className="text-xs text-ink-500">
        Harga setelah diskon minimal Rp1.000. Pemakaian dihitung dari pembayaran lunas dan checkout yang masih terbuka.
      </p>
      <div className="flex flex-wrap justify-end gap-3">
        <Link href="/admin/promo-codes" className={buttonClassName("ghost")}>
          Batal
        </Link>
        <SubmitButton pendingLabel="Menyimpan…">{props.mode === "create" ? "Buat kode promo" : "Simpan kode promo"}</SubmitButton>
      </div>
    </form>
  );
}

// ─── Task templates ──────────────────────────────────────────────────────────

export type TemplateDefaults = {
  title: string;
  description: string;
  categoryId: string;
  priority: string;
  deadlineOffsetDays: string;
  isActive: boolean;
  eventTypeIds: string[];
  marriageProcessIds: string[];
};

const PRIORITY_LABEL = { LOW: "Rendah", MEDIUM: "Sedang", HIGH: "Tinggi", URGENT: "Mendesak" } as const;

export function TaskTemplateForm(
  props: {
    defaults: TemplateDefaults;
    options: {
      categories: Array<{ id: string; name: string }>;
      eventTypes: Array<{ id: string; name: string }>;
      marriageProcesses: Array<{ id: string; name: string }>;
    };
  } & ({ mode: "create" } | { mode: "edit"; templateId: string }),
) {
  const [state, formAction] = useActionState(props.mode === "create" ? createTaskTemplateAction : updateTaskTemplateAction, initialFormState);
  const value = (key: "title" | "description" | "categoryId" | "priority" | "deadlineOffsetDays") => state.values?.[key] ?? props.defaults[key];
  const list = (key: "eventTypeIds" | "marriageProcessIds") =>
    state.values?.[key] !== undefined ? state.values[key].split(",").filter(Boolean) : props.defaults[key];
  const errors = state.fieldErrors ?? {};
  const offsetId = useId();

  return (
    <form key={JSON.stringify(state.values ?? "initial")} action={formAction} noValidate className="space-y-5">
      {state.status === "error" && state.message ? <Alert tone="error">{state.message}</Alert> : null}
      {props.mode === "edit" ? <input type="hidden" name="templateId" value={props.templateId} /> : null}
      <TextField label="Judul" name="title" required maxLength={160} defaultValue={value("title")} errors={errors.title} />
      <TextareaField label="Deskripsi" name="description" rows={3} maxLength={2000} defaultValue={value("description")} errors={errors.description} />
      <div className="grid gap-4 sm:grid-cols-3">
        <SelectField
          label="Kategori"
          name="categoryId"
          defaultValue={value("categoryId")}
          options={props.options.categories.map((category) => ({ value: category.id, label: category.name }))}
          errors={errors.categoryId}
        />
        <SelectField
          label="Prioritas"
          name="priority"
          defaultValue={value("priority")}
          options={Object.entries(PRIORITY_LABEL).map(([key, label]) => ({ value: key, label }))}
          errors={errors.priority}
        />
        <TextField
          id={offsetId}
          label="Offset tenggat (hari)"
          name="deadlineOffsetDays"
          inputMode="numeric"
          required
          hint="-180 = 180 hari sebelum pernikahan"
          defaultValue={value("deadlineOffsetDays")}
          errors={errors.deadlineOffsetDays}
        />
      </div>
      <CheckboxGroup
        legend="Jenis acara"
        name="eventTypeIds"
        options={props.options.eventTypes.map((item) => ({ value: item.id, label: item.name }))}
        selected={list("eventTypeIds")}
        errors={errors.eventTypeIds}
      />
      <CheckboxGroup
        legend="Jalur pernikahan"
        name="marriageProcessIds"
        options={props.options.marriageProcesses.map((item) => ({ value: item.id, label: item.name }))}
        selected={list("marriageProcessIds")}
        errors={errors.marriageProcessIds}
      />
      <Checkbox name="isActive" label="Aktif (dipakai saat checklist dibuat)" defaultChecked={state.values ? state.values.isActive === "on" : props.defaults.isActive} />
      <p className="text-xs text-ink-500">Checklist pasangan yang sudah dibuat tidak berubah; template hanya dipakai untuk checklist baru.</p>
      <div className="flex flex-wrap justify-end gap-3">
        <Link href="/admin/task-templates" className={buttonClassName("ghost")}>
          Batal
        </Link>
        <SubmitButton pendingLabel="Menyimpan…">{props.mode === "create" ? "Buat template" : "Simpan template"}</SubmitButton>
      </div>
    </form>
  );
}

// ─── Themes ──────────────────────────────────────────────────────────────────

export function ThemeSettingForm({
  code,
  defaults,
}: {
  code: string;
  defaults: { displayName: string; description: string; isEnabled: boolean; isPremium: boolean; sortOrder: string };
}) {
  const [state, formAction] = useActionState(updateThemeSettingAction, initialFormState);
  const failed = state.status === "error";
  return (
    <form action={formAction} noValidate className="space-y-3">
      <Message state={state} />
      <input type="hidden" name="code" value={code} />
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField
          label={`Nama tampilan (${code})`}
          name="displayName"
          maxLength={60}
          defaultValue={(failed ? state.values?.displayName : undefined) ?? defaults.displayName}
          errors={state.fieldErrors?.displayName}
        />
        <TextField label="Urutan" name="sortOrder" inputMode="numeric" defaultValue={(failed ? state.values?.sortOrder : undefined) ?? defaults.sortOrder} errors={state.fieldErrors?.sortOrder} />
      </div>
      <TextField label="Deskripsi" name="description" maxLength={200} defaultValue={(failed ? state.values?.description : undefined) ?? defaults.description} errors={state.fieldErrors?.description} />
      <div className="flex flex-wrap gap-x-6">
        <Checkbox name="isEnabled" label="Tersedia untuk dipilih" defaultChecked={defaults.isEnabled} />
        <Checkbox name="isPremium" label="Premium" defaultChecked={defaults.isPremium} />
      </div>
      <SubmitButton variant="secondary" pendingLabel="Menyimpan…">
        Simpan tema
      </SubmitButton>
    </form>
  );
}
