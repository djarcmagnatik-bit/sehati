"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/submit-button";
import { TextField } from "@/components/ui/text-field";
import { initialFormState } from "@/lib/form-state";
import { startCheckoutAction } from "@/server/actions/billing-actions";

export function CheckoutButton({
  weddingId,
  kind,
  code,
  label,
  allowPromo = false,
}: {
  weddingId: string;
  kind: "PLAN" | "ADDON";
  code: string;
  label: string;
  allowPromo?: boolean;
}) {
  const [state, formAction] = useActionState(startCheckoutAction, initialFormState);
  return (
    <form action={formAction} className="space-y-3">
      {state.status === "error" && state.message ? <Alert tone="error">{state.message}</Alert> : null}
      <input type="hidden" name="weddingId" value={weddingId} />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="code" value={code} />
      {allowPromo ? (
        <TextField
          label="Kode promo (opsional)"
          name="promoCode"
          maxLength={40}
          autoComplete="off"
          hint="Kode promo gratis langsung mengaktifkan paket, tanpa pembayaran."
          className="max-w-xs"
          defaultValue={state.values?.promoCode ?? ""}
          errors={state.fieldErrors?.promoCode}
        />
      ) : null}
      <SubmitButton pendingLabel="Menyiapkan pembayaran…">{label}</SubmitButton>
    </form>
  );
}
