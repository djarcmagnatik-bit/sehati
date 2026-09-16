"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/ui/submit-button";
import { TextField } from "@/components/ui/text-field";
import { cn } from "@/lib/cn";
import { initialFormState } from "@/lib/form-state";
import { createGuestGroupAction, updateGuestGroupAction } from "@/server/actions/guest-actions";

type Props = { mode: "create"; weddingId: string } | { mode: "edit"; groupId: string; name: string };

export function GuestGroupForm(props: Props) {
  const [state, formAction] = useActionState(
    props.mode === "create" ? createGuestGroupAction : updateGuestGroupAction,
    initialFormState,
  );
  const failed = state.status === "error";

  return (
    <form
      key={failed ? JSON.stringify(state.values) : (state.message ?? "initial")}
      action={formAction}
      noValidate
      className="flex flex-wrap items-start gap-2"
    >
      {props.mode === "create" ? (
        <input type="hidden" name="weddingId" value={props.weddingId} />
      ) : (
        <input type="hidden" name="groupId" value={props.groupId} />
      )}
      <TextField
        label={props.mode === "create" ? "Nama grup baru" : `Ubah nama grup ${props.name}`}
        name="name"
        required
        maxLength={80}
        defaultValue={failed ? state.values?.name : props.mode === "edit" ? props.name : ""}
        errors={state.fieldErrors?.name}
        className="min-w-48 flex-1"
      />
      <div className="pt-7">
        <SubmitButton variant="secondary" pendingLabel="Menyimpan…">
          {props.mode === "create" ? "Tambah grup" : "Simpan"}
        </SubmitButton>
      </div>
      {state.message ? (
        <p role="status" className={cn("w-full text-sm", failed ? "text-danger-600" : "text-success-700")}>
          {failed ? "⚠ " : "✓ "}
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
