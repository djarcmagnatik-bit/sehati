"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/submit-button";
import { TextField } from "@/components/ui/text-field";
import { TextareaField } from "@/components/ui/textarea-field";
import { initialFormState } from "@/lib/form-state";
import type { InvitationSectionTypeValue } from "@/lib/invitation";
import { SECTION_FIELDS } from "@/lib/invitation-fields";
import { updateSectionAction } from "@/server/actions/invitation-actions";

export function SectionForm({
  sectionId,
  type,
  enabled,
  content,
  note,
}: {
  sectionId: string;
  type: InvitationSectionTypeValue;
  enabled: boolean;
  content: Record<string, string | null>;
  note?: string;
}) {
  const [state, formAction] = useActionState(updateSectionAction, initialFormState);
  const fields = SECTION_FIELDS[type];
  const value = (name: string) => state.values?.[name] ?? content[name] ?? "";

  return (
    <form key={state.values ? JSON.stringify(state.values) : "initial"} action={formAction} noValidate className="space-y-5">
      {state.message ? <Alert tone={state.status === "error" ? "error" : "success"}>{state.message}</Alert> : null}
      <input type="hidden" name="sectionId" value={sectionId} />
      <input type="hidden" name="type" value={type} />

      <label className="flex min-h-11 items-center gap-2 text-sm font-medium">
        <input type="checkbox" name="enabled" defaultChecked={enabled} className="size-4 accent-clay-600" />
        Tampilkan bagian ini di undangan
      </label>
      {note ? <p className="-mt-3 text-xs text-ink-500">{note}</p> : null}

      {fields.map((field) =>
        field.type === "textarea" ? (
          <TextareaField
            key={field.name}
            label={field.label}
            name={field.name}
            rows={field.rows ?? 3}
            maxLength={field.maxLength}
            placeholder={field.placeholder}
            hint={field.hint}
            defaultValue={value(field.name)}
            errors={state.fieldErrors?.[field.name]}
          />
        ) : (
          <TextField
            key={field.name}
            label={field.label}
            name={field.name}
            maxLength={field.maxLength}
            placeholder={field.placeholder}
            hint={field.hint}
            defaultValue={value(field.name)}
            errors={state.fieldErrors?.[field.name]}
          />
        ),
      )}

      <SubmitButton pendingLabel="Menyimpan…">Simpan bagian</SubmitButton>
    </form>
  );
}
