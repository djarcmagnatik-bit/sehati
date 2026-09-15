"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/submit-button";
import { TextField } from "@/components/ui/text-field";
import { initialFormState } from "@/lib/form-state";
import { PASSWORD_MIN_LENGTH } from "@/lib/validation/auth";
import { resetPasswordAction } from "@/server/actions/auth-actions";

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction] = useActionState(resetPasswordAction, initialFormState);

  return (
    <form action={formAction} noValidate className="space-y-4">
      {state.status === "error" && state.message ? <Alert tone="error">{state.message}</Alert> : null}
      <input type="hidden" name="token" value={token} />
      <TextField
        label="Password baru"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        hint={`Minimal ${PASSWORD_MIN_LENGTH} karakter.`}
        errors={state.fieldErrors?.password}
      />
      <TextField
        label="Konfirmasi password baru"
        name="passwordConfirmation"
        type="password"
        autoComplete="new-password"
        required
        errors={state.fieldErrors?.passwordConfirmation}
      />
      <SubmitButton className="w-full" pendingLabel="Menyimpan…">
        Simpan password baru
      </SubmitButton>
    </form>
  );
}
