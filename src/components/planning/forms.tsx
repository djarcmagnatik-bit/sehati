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
import { initialFormState, type FormState } from "@/lib/form-state";
import { AUDIO_MAX_BYTES, AUDIO_MIME_TYPES, IMAGE_MAX_BYTES, IMAGE_MIME_TYPES } from "@/lib/media";
import { GIFT_ITEM_STATUS_LABEL, GIFT_ITEM_STATUSES, MAX_GIFT_QUANTITY, RUNDOWN_CATEGORIES } from "@/lib/planning";
import {
  createCalendarEventAction,
  createGiftItemAction,
  createRundownItemAction,
  createSavingsEntryAction,
  updateCalendarEventAction,
  updateGiftItemAction,
  updateInvitationMusicAction,
  updateRundownItemAction,
  updateSavingsEntryAction,
  updateSavingsSettingsAction,
  uploadGiftItemPhotoAction,
  uploadInvitationMusicAction,
} from "@/server/actions/planning-actions";

type Defaults<K extends string> = Record<K, string>;

function useFormValues<K extends string>(state: FormState, defaults: Defaults<K>) {
  return (key: K) => state.values?.[key] ?? defaults[key];
}

function ErrorAlert({ state }: { state: FormState }) {
  return state.status === "error" && state.message ? <Alert tone="error">{state.message}</Alert> : null;
}

function FormMessage({ state }: { state: FormState }) {
  if (!state.message) return null;
  return <Alert tone={state.status === "error" ? "error" : "success"}>{state.message}</Alert>;
}

function Actions({ cancelHref, submitLabel }: { cancelHref: string; submitLabel: string }) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-3">
      <Link href={cancelHref} className={buttonClassName("ghost")}>
        Batal
      </Link>
      <SubmitButton pendingLabel="Menyimpan…">{submitLabel}</SubmitButton>
    </div>
  );
}

function HiddenId({ name, value }: { name: string; value: string }) {
  return <input type="hidden" name={name} value={value} />;
}

// ─── Savings ─────────────────────────────────────────────────────────────────

export type SavingsDefaults = Defaults<"contributor" | "amount" | "entryDate" | "account" | "notes">;

export function SavingsEntryForm(
  props: { defaults: SavingsDefaults } & ({ mode: "create"; weddingId: string } | { mode: "edit"; entryId: string }),
) {
  const [state, formAction] = useActionState(props.mode === "create" ? createSavingsEntryAction : updateSavingsEntryAction, initialFormState);
  const value = useFormValues(state, props.defaults);
  const errors = state.fieldErrors ?? {};

  return (
    <form key={JSON.stringify(state.values ?? "initial")} action={formAction} noValidate className="space-y-5">
      <ErrorAlert state={state} />
      {props.mode === "create" ? <HiddenId name="weddingId" value={props.weddingId} /> : <HiddenId name="entryId" value={props.entryId} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Dari siapa" name="contributor" required maxLength={80} placeholder="Fajar" defaultValue={value("contributor")} errors={errors.contributor} />
        <MoneyField label="Nominal" name="amount" required defaultValue={value("amount")} errors={errors.amount} />
        <TextField label="Tanggal" name="entryDate" type="date" required defaultValue={value("entryDate")} errors={errors.entryDate} />
        <TextField label="Disimpan di" name="account" maxLength={80} placeholder="BCA / celengan" defaultValue={value("account")} errors={errors.account} />
      </div>
      <TextareaField label="Catatan" name="notes" rows={2} maxLength={500} defaultValue={value("notes")} errors={errors.notes} />
      <Actions cancelHref="/savings" submitLabel={props.mode === "create" ? "Simpan tabungan" : "Simpan perubahan"} />
    </form>
  );
}

export function SavingsSettingsForm({ weddingId, defaults }: { weddingId: string; defaults: Defaults<"savingsTarget" | "savingsMonthlyTarget"> }) {
  const [state, formAction] = useActionState(updateSavingsSettingsAction, initialFormState);
  const value = useFormValues(state, defaults);
  return (
    <form action={formAction} noValidate className="space-y-4">
      <FormMessage state={state} />
      <HiddenId name="weddingId" value={weddingId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <MoneyField
          label="Target dana pernikahan"
          name="savingsTarget"
          hint="Kosongkan untuk memakai target budget."
          defaultValue={value("savingsTarget")}
          errors={state.fieldErrors?.savingsTarget}
        />
        <MoneyField
          label="Target menabung per bulan"
          name="savingsMonthlyTarget"
          hint="Opsional."
          defaultValue={value("savingsMonthlyTarget")}
          errors={state.fieldErrors?.savingsMonthlyTarget}
        />
      </div>
      <SubmitButton variant="secondary" pendingLabel="Menyimpan…">
        Simpan target
      </SubmitButton>
    </form>
  );
}

// ─── Seserahan ───────────────────────────────────────────────────────────────

export type GiftItemDefaults = Defaults<
  "name" | "categoryId" | "quantity" | "estimatedPrice" | "actualPrice" | "responsible" | "status" | "notes"
>;

export function GiftItemForm(
  props: { defaults: GiftItemDefaults; categories: Array<{ id: string; name: string }> } & (
    | { mode: "create"; weddingId: string }
    | { mode: "edit"; itemId: string }
  ),
) {
  const [state, formAction] = useActionState(props.mode === "create" ? createGiftItemAction : updateGiftItemAction, initialFormState);
  const value = useFormValues(state, props.defaults);
  const errors = state.fieldErrors ?? {};

  return (
    <form key={JSON.stringify(state.values ?? "initial")} action={formAction} noValidate className="space-y-5">
      <ErrorAlert state={state} />
      {props.mode === "create" ? <HiddenId name="weddingId" value={props.weddingId} /> : <HiddenId name="itemId" value={props.itemId} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Nama barang" name="name" required maxLength={120} placeholder="Set mukena" defaultValue={value("name")} errors={errors.name} />
        <SelectField
          label="Kategori"
          name="categoryId"
          defaultValue={value("categoryId")}
          options={[{ value: "", label: "Tanpa kategori" }, ...props.categories.map((category) => ({ value: category.id, label: category.name }))]}
          errors={errors.categoryId}
        />
        <TextField
          label="Jumlah"
          name="quantity"
          type="number"
          inputMode="numeric"
          min={1}
          max={MAX_GIFT_QUANTITY}
          defaultValue={value("quantity")}
          errors={errors.quantity}
        />
        <SelectField
          label="Status"
          name="status"
          defaultValue={value("status")}
          options={GIFT_ITEM_STATUSES.map((status) => ({ value: status, label: GIFT_ITEM_STATUS_LABEL[status] }))}
          errors={errors.status}
        />
        <MoneyField label="Perkiraan harga" name="estimatedPrice" hint="Total untuk semua jumlah." defaultValue={value("estimatedPrice")} errors={errors.estimatedPrice} />
        <MoneyField label="Harga sebenarnya" name="actualPrice" hint="Isi setelah dibeli." defaultValue={value("actualPrice")} errors={errors.actualPrice} />
        <TextField label="Penanggung jawab" name="responsible" maxLength={80} placeholder="Ibu Putri" defaultValue={value("responsible")} errors={errors.responsible} />
      </div>
      <TextareaField label="Catatan" name="notes" rows={3} maxLength={1000} defaultValue={value("notes")} errors={errors.notes} />
      <Actions cancelHref="/seserahan" submitLabel={props.mode === "create" ? "Simpan barang" : "Simpan perubahan"} />
    </form>
  );
}

export function GiftItemPhotoForm({ weddingId, itemId }: { weddingId: string; itemId: string }) {
  const [state, formAction] = useActionState(uploadGiftItemPhotoAction, initialFormState);
  const inputId = useId();
  return (
    <form action={formAction} className="space-y-3">
      <FormMessage state={state} />
      <HiddenId name="weddingId" value={weddingId} />
      <HiddenId name="itemId" value={itemId} />
      <div className="space-y-1.5">
        <label htmlFor={inputId} className="block text-sm font-medium text-ink-900">
          Foto barang
        </label>
        <input
          id={inputId}
          type="file"
          name="file"
          required
          accept={IMAGE_MIME_TYPES.join(",")}
          className="block w-full rounded-xl border border-cream-300 bg-white p-2 text-sm file:mr-3 file:rounded-full file:border-0 file:bg-clay-50 file:px-4 file:py-2 file:font-semibold file:text-clay-700"
        />
        <p className="text-xs text-ink-500">JPG, PNG, atau WebP, maksimal {Math.round(IMAGE_MAX_BYTES / (1024 * 1024))} MB. Hanya terlihat oleh kalian berdua.</p>
      </div>
      <SubmitButton variant="secondary" pendingLabel="Mengunggah…">
        Unggah foto
      </SubmitButton>
    </form>
  );
}

// ─── Rundown ─────────────────────────────────────────────────────────────────

export type RundownDefaults = Defaults<
  "title" | "itemDate" | "startTime" | "endTime" | "description" | "pic" | "location" | "category" | "notes"
>;

export function RundownItemForm(props: { defaults: RundownDefaults } & ({ mode: "create"; weddingId: string } | { mode: "edit"; itemId: string })) {
  const [state, formAction] = useActionState(props.mode === "create" ? createRundownItemAction : updateRundownItemAction, initialFormState);
  const value = useFormValues(state, props.defaults);
  const errors = state.fieldErrors ?? {};
  const listId = useId();

  return (
    <form key={JSON.stringify(state.values ?? "initial")} action={formAction} noValidate className="space-y-5">
      <ErrorAlert state={state} />
      {props.mode === "create" ? <HiddenId name="weddingId" value={props.weddingId} /> : <HiddenId name="itemId" value={props.itemId} />}
      <TextField label="Kegiatan" name="title" required maxLength={120} placeholder="Makeup pengantin" defaultValue={value("title")} errors={errors.title} />
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField label="Tanggal" name="itemDate" type="date" hint="Kosong = hari pernikahan." defaultValue={value("itemDate")} errors={errors.itemDate} />
        <TextField label="Jam mulai" name="startTime" type="time" required defaultValue={value("startTime")} errors={errors.startTime} />
        <TextField label="Jam selesai" name="endTime" type="time" defaultValue={value("endTime")} errors={errors.endTime} />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField label="Penanggung jawab" name="pic" maxLength={80} placeholder="MUA / WO" defaultValue={value("pic")} errors={errors.pic} />
        <TextField label="Lokasi" name="location" maxLength={120} defaultValue={value("location")} errors={errors.location} />
        <TextField label="Kategori" name="category" maxLength={60} list={listId} defaultValue={value("category")} errors={errors.category} />
        <datalist id={listId}>
          {RUNDOWN_CATEGORIES.map((category) => (
            <option key={category} value={category} />
          ))}
        </datalist>
      </div>
      <TextareaField label="Deskripsi" name="description" rows={2} maxLength={1000} defaultValue={value("description")} errors={errors.description} />
      <TextareaField label="Catatan" name="notes" rows={2} maxLength={500} defaultValue={value("notes")} errors={errors.notes} />
      <Actions cancelHref="/rundown" submitLabel={props.mode === "create" ? "Simpan ke rundown" : "Simpan perubahan"} />
    </form>
  );
}

// ─── Calendar ────────────────────────────────────────────────────────────────

export type CalendarEventDefaults = Defaults<"title" | "eventDate" | "startTime" | "endTime" | "location" | "notes">;

export function CalendarEventForm(
  props: { defaults: CalendarEventDefaults } & ({ mode: "create"; weddingId: string } | { mode: "edit"; eventId: string }),
) {
  const [state, formAction] = useActionState(props.mode === "create" ? createCalendarEventAction : updateCalendarEventAction, initialFormState);
  const value = useFormValues(state, props.defaults);
  const errors = state.fieldErrors ?? {};

  return (
    <form key={JSON.stringify(state.values ?? "initial")} action={formAction} noValidate className="space-y-5">
      <ErrorAlert state={state} />
      {props.mode === "create" ? <HiddenId name="weddingId" value={props.weddingId} /> : <HiddenId name="eventId" value={props.eventId} />}
      <TextField label="Judul agenda" name="title" required maxLength={120} placeholder="Fitting baju" defaultValue={value("title")} errors={errors.title} />
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField label="Tanggal" name="eventDate" type="date" required defaultValue={value("eventDate")} errors={errors.eventDate} />
        <TextField label="Jam mulai" name="startTime" type="time" defaultValue={value("startTime")} errors={errors.startTime} />
        <TextField label="Jam selesai" name="endTime" type="time" defaultValue={value("endTime")} errors={errors.endTime} />
      </div>
      <TextField label="Lokasi" name="location" maxLength={120} defaultValue={value("location")} errors={errors.location} />
      <TextareaField label="Catatan" name="notes" rows={2} maxLength={500} defaultValue={value("notes")} errors={errors.notes} />
      <Actions cancelHref="/calendar" submitLabel={props.mode === "create" ? "Simpan agenda" : "Simpan perubahan"} />
    </form>
  );
}

// ─── Invitation music ────────────────────────────────────────────────────────

export function MusicUploadForm({ weddingId }: { weddingId: string }) {
  const [state, formAction] = useActionState(uploadInvitationMusicAction, initialFormState);
  const inputId = useId();
  return (
    <form action={formAction} className="space-y-3">
      <FormMessage state={state} />
      <HiddenId name="weddingId" value={weddingId} />
      <div className="space-y-1.5">
        <label htmlFor={inputId} className="block text-sm font-medium text-ink-900">
          File musik
        </label>
        <input
          id={inputId}
          type="file"
          name="file"
          required
          accept={[...AUDIO_MIME_TYPES, ".mp3", ".m4a", ".ogg"].join(",")}
          className="block w-full rounded-xl border border-cream-300 bg-white p-2 text-sm file:mr-3 file:rounded-full file:border-0 file:bg-clay-50 file:px-4 file:py-2 file:font-semibold file:text-clay-700"
        />
        <p className="text-xs text-ink-500">
          MP3, M4A, atau OGG, maksimal {Math.round(AUDIO_MAX_BYTES / (1024 * 1024))} MB. Pastikan kalian berhak memakai lagunya.
        </p>
      </div>
      <SubmitButton pendingLabel="Mengunggah…">Unggah musik</SubmitButton>
    </form>
  );
}

export function MusicSettingsForm({ weddingId, enabled, volume }: { weddingId: string; enabled: boolean; volume: number }) {
  const [state, formAction] = useActionState(updateInvitationMusicAction, initialFormState);
  const [level, setLevel] = useState(state.values?.musicVolume ?? String(volume));
  const volumeId = useId();
  return (
    <form action={formAction} className="space-y-4">
      <FormMessage state={state} />
      <HiddenId name="weddingId" value={weddingId} />
      <label className="flex min-h-11 items-center gap-2 text-sm font-medium">
        <input type="checkbox" name="musicEnabled" defaultChecked={enabled} className="size-4 accent-clay-600" />
        Putar musik di undangan
      </label>
      <div className="space-y-1.5">
        <label htmlFor={volumeId} className="block text-sm font-medium">
          Volume: <span data-testid="music-volume">{level}</span>%
        </label>
        <input
          id={volumeId}
          type="range"
          name="musicVolume"
          min={0}
          max={100}
          step={5}
          value={level}
          onChange={(event) => setLevel(event.target.value)}
          className="w-full accent-clay-600"
        />
      </div>
      <p className="text-xs text-ink-500">
        Browser biasanya menahan suara sampai tamu menyentuh halaman. Tombol “Putar musik” selalu terlihat di pojok undangan.
      </p>
      <SubmitButton variant="secondary" pendingLabel="Menyimpan…">
        Simpan pengaturan musik
      </SubmitButton>
    </form>
  );
}
