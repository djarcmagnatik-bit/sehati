"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/submit-button";
import { initialFormState } from "@/lib/form-state";
import { startCheckoutAction } from "@/server/actions/billing-actions";

export function CheckoutButton({
  weddingId,
  kind,
  code,
  label,
}: {
  weddingId: string;
  kind: "PLAN" | "ADDON";
  code: string;
  label: string;
}) {
  const [state, formAction] = useActionState(startCheckoutAction, initialFormState);
  return (
    <form action={formAction} className="space-y-3">
      {state.status === "error" && state.message ? <Alert tone="error">{state.message}</Alert> : null}
      <input type="hidden" name="weddingId" value={weddingId} />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="code" value={code} />
      <SubmitButton pendingLabel="Menyiapkan pembayaran…">{label}</SubmitButton>
    </form>
  );
}
