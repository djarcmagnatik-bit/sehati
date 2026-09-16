"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { SelectField } from "@/components/ui/select-field";
import { SubmitButton } from "@/components/ui/submit-button";
import { TextField } from "@/components/ui/text-field";
import { TextareaField } from "@/components/ui/textarea-field";
import { initialFormState, type FormState } from "@/lib/form-state";
import { GIFT_ACCOUNT_LABEL, GIFT_ACCOUNT_TYPES } from "@/lib/invitation";
import {
  createGiftAccountAction,
  createLoveStoryAction,
  updateGalleryCaptionAction,
  updateGiftAccountAction,
  updateLoveStoryAction,
} from "@/server/actions/invitation-actions";

function FormMessage({ state }: { state: FormState }) {
  if (!state.message) return null;
  return <Alert tone={state.status === "error" ? "error" : "success"}>{state.message}</Alert>;
}

export type LoveStoryDefaults = { title: string; timeLabel: string; story: string };

export function LoveStoryForm(
  props: { mode: "create"; weddingId: string } | { mode: "edit"; entryId: string; defaults: LoveStoryDefaults },
) {
  const [state, formAction] = useActionState(
    props.mode === "create" ? createLoveStoryAction : updateLoveStoryAction,
    initialFormState,
  );
  const defaults: LoveStoryDefaults = props.mode === "edit" ? props.defaults : { title: "", timeLabel: "", story: "" };
  const value = (key: keyof LoveStoryDefaults) => state.values?.[key] ?? defaults[key];
  const succeeded = state.status === "success";

  return (
    <form
      key={succeeded && props.mode === "create" ? `saved-${state.message}` : JSON.stringify(state.values ?? "initial")}
      action={formAction}
      noValidate
      className="space-y-4"
    >
      <FormMessage state={state} />
      {props.mode === "create" ? (
        <input type="hidden" name="weddingId" value={props.weddingId} />
      ) : (
        <input type="hidden" name="entryId" value={props.entryId} />
      )}
      <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
        <TextField
          label="Judul"
          name="title"
          required
          maxLength={120}
          placeholder="Pertemuan pertama"
          defaultValue={succeeded && props.mode === "create" ? "" : value("title")}
          errors={state.fieldErrors?.title}
        />
        <TextField
          label="Waktu"
          name="timeLabel"
          maxLength={40}
          placeholder="2019"
          defaultValue={succeeded && props.mode === "create" ? "" : value("timeLabel")}
          errors={state.fieldErrors?.timeLabel}
        />
      </div>
      <TextareaField
        label="Cerita"
        name="story"
        required
        rows={4}
        maxLength={1000}
        defaultValue={succeeded && props.mode === "create" ? "" : value("story")}
        errors={state.fieldErrors?.story}
      />
      <SubmitButton pendingLabel="Menyimpan…">{props.mode === "create" ? "Tambah cerita" : "Simpan cerita"}</SubmitButton>
    </form>
  );
}

export type GiftAccountDefaults = Record<"type" | "providerName" | "accountNumber" | "accountHolder" | "notes", string>;

export function GiftAccountForm(
  props: { mode: "create"; weddingId: string } | { mode: "edit"; accountId: string; defaults: GiftAccountDefaults },
) {
  const [state, formAction] = useActionState(
    props.mode === "create" ? createGiftAccountAction : updateGiftAccountAction,
    initialFormState,
  );
  const defaults: GiftAccountDefaults =
    props.mode === "edit" ? props.defaults : { type: "BANK", providerName: "", accountNumber: "", accountHolder: "", notes: "" };
  const succeeded = state.status === "success" && props.mode === "create";
  const value = (key: keyof GiftAccountDefaults) => (succeeded ? defaults[key] : (state.values?.[key] ?? defaults[key]));

  return (
    <form
      key={succeeded ? `saved-${state.message}` : JSON.stringify(state.values ?? "initial")}
      action={formAction}
      noValidate
      className="space-y-4"
    >
      <FormMessage state={state} />
      {props.mode === "create" ? (
        <input type="hidden" name="weddingId" value={props.weddingId} />
      ) : (
        <input type="hidden" name="accountId" value={props.accountId} />
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label="Jenis"
          name="type"
          defaultValue={value("type")}
          options={GIFT_ACCOUNT_TYPES.map((type) => ({ value: type, label: GIFT_ACCOUNT_LABEL[type] }))}
          errors={state.fieldErrors?.type}
        />
        <TextField
          label="Bank / dompet digital"
          name="providerName"
          required
          maxLength={60}
          placeholder="BCA"
          defaultValue={value("providerName")}
          errors={state.fieldErrors?.providerName}
        />
        <TextField
          label="Nomor rekening"
          name="accountNumber"
          required
          inputMode="numeric"
          maxLength={40}
          defaultValue={value("accountNumber")}
          errors={state.fieldErrors?.accountNumber}
        />
        <TextField
          label="Atas nama"
          name="accountHolder"
          required
          maxLength={80}
          defaultValue={value("accountHolder")}
          errors={state.fieldErrors?.accountHolder}
        />
      </div>
      <TextField label="Catatan" name="notes" maxLength={200} defaultValue={value("notes")} errors={state.fieldErrors?.notes} />
      <SubmitButton pendingLabel="Menyimpan…">{props.mode === "create" ? "Tambah info hadiah" : "Simpan"}</SubmitButton>
    </form>
  );
}

export function GalleryCaptionForm({ imageId, caption }: { imageId: string; caption: string }) {
  const [state, formAction] = useActionState(updateGalleryCaptionAction, initialFormState);
  return (
    <form action={formAction} noValidate className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="imageId" value={imageId} />
      <TextField
        label="Keterangan"
        name="caption"
        maxLength={160}
        defaultValue={state.values?.caption ?? caption}
        errors={state.fieldErrors?.caption}
        className="min-w-40 flex-1"
      />
      <div className="pt-7">
        <SubmitButton variant="secondary" pendingLabel="Menyimpan…">
          Simpan
        </SubmitButton>
      </div>
    </form>
  );
}
