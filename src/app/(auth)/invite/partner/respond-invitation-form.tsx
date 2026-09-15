"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { initialFormState } from "@/lib/form-state";
import { respondToInvitationAction } from "@/server/actions/collaboration-actions";

export function RespondInvitationForm({ token, accountEmail }: { token: string; accountEmail: string }) {
  const [state, formAction, isPending] = useActionState(respondToInvitationAction, initialFormState);

  return (
    <form action={formAction} className="space-y-4">
      {state.message ? <Alert tone={state.status === "success" ? "success" : "error"}>{state.message}</Alert> : null}
      <input type="hidden" name="token" value={token} />
      <p className="text-sm text-ink-700">
        Masuk sebagai <strong>{accountEmail}</strong>
      </p>
      {state.status !== "success" ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="submit" name="intent" value="accept" disabled={isPending} className="sm:flex-1">
            {isPending ? "Memproses…" : "Terima undangan"}
          </Button>
          <Button type="submit" name="intent" value="decline" variant="ghost" disabled={isPending}>
            Tolak
          </Button>
        </div>
      ) : null}
    </form>
  );
}
