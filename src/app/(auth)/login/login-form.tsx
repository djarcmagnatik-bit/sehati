"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/submit-button";
import { TextField } from "@/components/ui/text-field";
import { initialFormState } from "@/lib/form-state";
import { loginAction } from "@/server/actions/auth-actions";

export function LoginForm({ next }: { next: string | null }) {
  const [state, formAction] = useActionState(loginAction, initialFormState);

  return (
    <form action={formAction} noValidate className="space-y-4">
      {state.status === "error" && state.message ? <Alert tone="error">{state.message}</Alert> : null}
      {next ? <input type="hidden" name="next" value={next} /> : null}
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
        autoComplete="current-password"
        required
        errors={state.fieldErrors?.password}
      />
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <label className="flex min-h-11 items-center gap-2 text-ink-700">
          <input
            type="checkbox"
            name="remember"
            defaultChecked={state.values?.remember === "on"}
            className="size-4 accent-clay-600"
          />
          Ingat saya (30 hari)
        </label>
        <Link href="/forgot-password" className="font-medium text-clay-700 underline-offset-4 hover:underline">
          Lupa password?
        </Link>
      </div>
      <SubmitButton className="w-full" pendingLabel="Memproses…">
        Masuk
      </SubmitButton>
    </form>
  );
}
