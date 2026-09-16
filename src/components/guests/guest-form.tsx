"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { buttonClassName } from "@/components/ui/button";
import { SelectField } from "@/components/ui/select-field";
import { SubmitButton } from "@/components/ui/submit-button";
import { TextField } from "@/components/ui/text-field";
import { TextareaField } from "@/components/ui/textarea-field";
import { initialFormState, type FormState } from "@/lib/form-state";
import {
  EDITABLE_INVITATION_STATUSES,
  GUEST_INVITATION_LABEL,
  GUEST_RSVP_LABEL,
  GUEST_RSVP_STATUSES,
  MAX_SEATS_PER_INVITATION,
} from "@/lib/guests";
import { createGuestAction, updateGuestAction } from "@/server/actions/guest-actions";

export type GuestDefaults = Record<
  | "guestName"
  | "invitationName"
  | "groupId"
  | "phone"
  | "email"
  | "address"
  | "seatCount"
  | "invitationStatus"
  | "rsvpStatus"
  | "attendingCount"
  | "notes",
  string
>;

type Props = { groups: Array<{ id: string; name: string }> } & (
  | { mode: "create"; weddingId: string; defaultGroupId?: string }
  | { mode: "edit"; guestId: string; defaults: GuestDefaults; invitationOpened: boolean }
);

export function GuestForm(props: Props) {
  const [state, formAction] = useActionState(props.mode === "create" ? createGuestAction : updateGuestAction, initialFormState);
  return <GuestFormBody key={state.values ? JSON.stringify(state.values) : "initial"} {...props} state={state} formAction={formAction} />;
}

function GuestFormBody(props: Props & { state: FormState; formAction: (formData: FormData) => void }) {
  const { state, formAction, groups } = props;
  const defaults: GuestDefaults =
    props.mode === "edit"
      ? props.defaults
      : {
          guestName: "",
          invitationName: "",
          groupId: props.defaultGroupId ?? "",
          phone: "",
          email: "",
          address: "",
          seatCount: "1",
          invitationStatus: "NOT_SENT",
          rsvpStatus: "PENDING",
          attendingCount: "0",
          notes: "",
        };
  const value = (key: keyof GuestDefaults) => state.values?.[key] ?? defaults[key];
  const errors = state.fieldErrors ?? {};
  const [rsvpStatus, setRsvpStatus] = useState(value("rsvpStatus"));
  const countsAttendance = rsvpStatus === "ATTENDING" || rsvpStatus === "MAYBE";
  const invitationOpened = props.mode === "edit" && props.invitationOpened;

  return (
    <form action={formAction} noValidate className="space-y-6">
      {state.status === "error" && state.message ? <Alert tone="error">{state.message}</Alert> : null}
      {props.mode === "create" ? (
        <input type="hidden" name="weddingId" value={props.weddingId} />
      ) : (
        <input type="hidden" name="guestId" value={props.guestId} />
      )}

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-ink-900">Undangan</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Nama tamu" name="guestName" required maxLength={120} defaultValue={value("guestName")} errors={errors.guestName} />
          <TextField
            label="Nama di undangan"
            name="invitationName"
            maxLength={160}
            placeholder="Keluarga Bapak Ahmad"
            hint="Kosongkan untuk memakai nama tamu."
            defaultValue={value("invitationName")}
            errors={errors.invitationName}
          />
          <SelectField
            label="Grup"
            name="groupId"
            defaultValue={value("groupId")}
            options={[{ value: "", label: "Tanpa grup" }, ...groups.map((group) => ({ value: group.id, label: group.name }))]}
            errors={errors.groupId}
          />
          <TextField
            label="Jumlah kursi"
            name="seatCount"
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_SEATS_PER_INVITATION}
            required
            hint="Berapa orang yang diundang lewat undangan ini."
            defaultValue={value("seatCount")}
            errors={errors.seatCount}
          />
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-ink-900">Status</legend>
        <div className="grid gap-4 sm:grid-cols-3">
          <SelectField
            label="Status undangan"
            name="invitationStatus"
            defaultValue={value("invitationStatus") === "OPENED" ? "SENT" : value("invitationStatus")}
            options={EDITABLE_INVITATION_STATUSES.map((status) => ({ value: status, label: GUEST_INVITATION_LABEL[status] }))}
            hint={invitationOpened ? "Undangan sudah dibuka tamu." : undefined}
            errors={errors.invitationStatus}
          />
          <SelectField
            label="Status RSVP"
            name="rsvpStatus"
            value={rsvpStatus}
            onChange={(event) => setRsvpStatus(event.target.value)}
            options={GUEST_RSVP_STATUSES.map((status) => ({ value: status, label: GUEST_RSVP_LABEL[status] }))}
            errors={errors.rsvpStatus}
          />
          <TextField
            label="Jumlah hadir"
            name="attendingCount"
            type="number"
            inputMode="numeric"
            min={0}
            max={MAX_SEATS_PER_INVITATION}
            disabled={!countsAttendance}
            hint={countsAttendance ? "Tidak boleh melebihi jumlah kursi." : "Hanya untuk status Hadir / Mungkin hadir."}
            defaultValue={countsAttendance ? value("attendingCount") : "0"}
            errors={errors.attendingCount}
          />
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-ink-900">Kontak (opsional)</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Telepon / WhatsApp" name="phone" inputMode="tel" placeholder="0812-3456-7890" defaultValue={value("phone")} errors={errors.phone} />
          <TextField label="Email" name="email" type="email" defaultValue={value("email")} errors={errors.email} />
        </div>
        <TextareaField label="Alamat" name="address" rows={2} maxLength={500} defaultValue={value("address")} errors={errors.address} />
      </fieldset>

      <TextareaField label="Catatan" name="notes" rows={2} maxLength={1000} defaultValue={value("notes")} errors={errors.notes} />

      <div className="flex flex-wrap items-center justify-end gap-3">
        <Link href="/guests" className={buttonClassName("ghost")}>
          Batal
        </Link>
        <SubmitButton pendingLabel="Menyimpan…">{props.mode === "create" ? "Simpan tamu" : "Simpan perubahan"}</SubmitButton>
      </div>
    </form>
  );
}
