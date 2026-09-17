"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { buttonClassName } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { TextField } from "@/components/ui/text-field";
import { TextareaField } from "@/components/ui/textarea-field";
import { initialFormState } from "@/lib/form-state";
import { createWeddingEventAction, updateWeddingEventAction } from "@/server/actions/invitation-actions";

export type EventDefaults = Record<
  "name" | "eventDate" | "startTime" | "endTime" | "venueName" | "address" | "latitude" | "longitude" | "mapsUrl" | "dressCode" | "notes",
  string
>;

type Props =
  | { mode: "create"; weddingId: string; defaults: EventDefaults }
  | { mode: "edit"; eventId: string; defaults: EventDefaults };

export function WeddingEventForm(props: Props) {
  const [state, formAction] = useActionState(
    props.mode === "create" ? createWeddingEventAction : updateWeddingEventAction,
    initialFormState,
  );
  const value = (key: keyof EventDefaults) => state.values?.[key] ?? props.defaults[key];
  const errors = state.fieldErrors ?? {};

  return (
    <form key={state.values ? JSON.stringify(state.values) : "initial"} action={formAction} noValidate className="space-y-5">
      {state.status === "error" && state.message ? <Alert tone="error">{state.message}</Alert> : null}
      {props.mode === "create" ? (
        <input type="hidden" name="weddingId" value={props.weddingId} />
      ) : (
        <input type="hidden" name="eventId" value={props.eventId} />
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Nama acara" name="name" required maxLength={80} placeholder="Akad Nikah" defaultValue={value("name")} errors={errors.name} />
        <TextField label="Tanggal" name="eventDate" type="date" required defaultValue={value("eventDate")} errors={errors.eventDate} />
        <TextField label="Jam mulai" name="startTime" type="time" defaultValue={value("startTime")} errors={errors.startTime} />
        <TextField label="Jam selesai" name="endTime" type="time" defaultValue={value("endTime")} errors={errors.endTime} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Nama tempat" name="venueName" maxLength={120} placeholder="Gedung Serbaguna" defaultValue={value("venueName")} errors={errors.venueName} />
        <TextField label="Dress code" name="dressCode" maxLength={120} defaultValue={value("dressCode")} errors={errors.dressCode} />
      </div>
      <TextareaField label="Alamat" name="address" rows={2} maxLength={500} defaultValue={value("address")} errors={errors.address} />

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-ink-900">Peta (opsional)</legend>
        <TextField
          label="Tautan peta"
          name="mapsUrl"
          inputMode="url"
          maxLength={500}
          hint="Tempel tautan Google Maps. Bila kosong, peta dibuat dari koordinat atau alamat."
          defaultValue={value("mapsUrl")}
          errors={errors.mapsUrl}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Latitude" name="latitude" inputMode="decimal" placeholder="-6.914744" defaultValue={value("latitude")} errors={errors.latitude} />
          <TextField label="Longitude" name="longitude" inputMode="decimal" placeholder="107.609810" defaultValue={value("longitude")} errors={errors.longitude} />
        </div>
      </fieldset>

      <TextareaField
        label="Catatan untuk tamu"
        name="notes"
        rows={2}
        maxLength={1000}
        hint="Tampil di undangan publik, misalnya info parkir. Jangan isi catatan pribadi."
        defaultValue={value("notes")}
        errors={errors.notes}
      />

      <div className="flex flex-wrap items-center justify-end gap-3">
        <Link href="/invitation/events" className={buttonClassName("ghost")}>
          Batal
        </Link>
        <SubmitButton pendingLabel="Menyimpan…">{props.mode === "create" ? "Simpan acara" : "Simpan perubahan"}</SubmitButton>
      </div>
    </form>
  );
}
