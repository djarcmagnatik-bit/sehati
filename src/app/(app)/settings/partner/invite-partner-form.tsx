"use client";

import { useActionState, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { TextField } from "@/components/ui/text-field";
import { initialFormState } from "@/lib/form-state";
import { invitePartnerAction } from "@/server/actions/collaboration-actions";

function InviteLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // Clipboard can be unavailable (permissions / insecure context): select for manual copy.
      inputRef.current?.select();
    }
  }

  return (
    <div className="space-y-2 rounded-2xl border border-cream-300 bg-cream-50 p-4">
      <label htmlFor="invite-link" className="block text-sm font-medium">
        Tautan undangan
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          ref={inputRef}
          id="invite-link"
          readOnly
          value={url}
          onFocus={(event) => event.currentTarget.select()}
          className="block min-h-11 w-full rounded-xl border border-cream-300 bg-white px-3 text-sm text-ink-900"
        />
        <Button variant="secondary" onClick={copy}>
          {copied ? "Tersalin ✓" : "Salin tautan"}
        </Button>
      </div>
      <p className="text-xs text-ink-500" role="status">
        {copied ? "Tautan disalin. Kirimkan hanya ke pasanganmu." : "Tautan ini hanya ditampilkan sekali. Jangan bagikan ke orang lain."}
      </p>
    </div>
  );
}

export function InvitePartnerForm({
  weddingId,
  defaultEmail,
  hasPending,
}: {
  weddingId: string;
  defaultEmail: string;
  hasPending: boolean;
}) {
  const [state, formAction] = useActionState(invitePartnerAction, initialFormState);
  const inviteUrl = state.status === "success" ? state.values?.inviteUrl : undefined;

  return (
    <div className="space-y-4">
      <form action={formAction} noValidate className="space-y-4">
        {state.message ? <Alert tone={state.status === "success" ? "success" : "error"}>{state.message}</Alert> : null}
        <input type="hidden" name="weddingId" value={weddingId} />
        <TextField
          label="Email pasangan"
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={state.values?.email ?? defaultEmail}
          errors={state.fieldErrors?.email}
        />
        <SubmitButton pendingLabel="Membuat undangan…">
          {hasPending || inviteUrl ? "Kirim ulang dengan tautan baru" : "Kirim undangan"}
        </SubmitButton>
      </form>
      {inviteUrl ? <InviteLink url={inviteUrl} /> : null}
    </div>
  );
}
