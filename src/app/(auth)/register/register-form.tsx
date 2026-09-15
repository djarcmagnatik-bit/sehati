"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/submit-button";
import { TextField } from "@/components/ui/text-field";
import { initialFormState } from "@/lib/form-state";
import { PASSWORD_MIN_LENGTH } from "@/lib/validation/auth";
import { registerAction } from "@/server/actions/auth-actions";

export function RegisterForm({ next }: { next: string | null }) {
  const [state, formAction] = useActionState(registerAction, initialFormState);

  return (
    <form action={formAction} noValidate className="space-y-4">
      {state.status === "error" && state.message ? <Alert tone="error">{state.message}</Alert> : null}
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <TextField
        label="Nama"
        name="name"
        autoComplete="name"
        required
        maxLength={80}
        defaultValue={state.values?.name}
        errors={state.fieldErrors?.name}
      />
      <TextField
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
        defaultValue={state.values?.email}
        errors={state.fieldErrors?.email}
      />
      <TextField
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        hint={`Minimal ${PASSWORD_MIN_LENGTH} karakter.`}
        errors={state.fieldErrors?.password}
      />
      <TextField
        label="Konfirmasi password"
        name="passwordConfirmation"
        type="password"
        autoComplete="new-password"
        required
        errors={state.fieldErrors?.passwordConfirmation}
      />
      <SubmitButton className="w-full" pendingLabel="Mendaftarkan…">
        Daftar
      </SubmitButton>
    </form>
  );
}
