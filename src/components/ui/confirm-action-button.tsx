"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "./button";
import { SubmitButton } from "./submit-button";

/** Two-step destructive action: the submit only appears after an explicit first click. */
export function ConfirmActionButton({
  action,
  fields,
  triggerLabel,
  confirmLabel,
  message,
  pendingLabel = "Memproses…",
}: {
  action: (formData: FormData) => Promise<void>;
  fields: Record<string, string>;
  triggerLabel: string;
  confirmLabel: string;
  message: string;
  pendingLabel?: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const groupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (confirming) groupRef.current?.querySelector<HTMLButtonElement>("button[type=submit]")?.focus();
  }, [confirming]);

  if (!confirming) {
    return (
      <Button variant="danger" className="min-h-10 px-4" onClick={() => setConfirming(true)}>
        {triggerLabel}
      </Button>
    );
  }

  return (
    <div ref={groupRef} role="group" aria-label={triggerLabel} className="space-y-3 rounded-2xl bg-danger-50 p-4">
      <p className="text-sm text-danger-600">{message}</p>
      <div className="flex flex-wrap gap-2">
        <form action={action}>
          {Object.entries(fields).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
          <SubmitButton variant="danger" pendingLabel={pendingLabel}>
            {confirmLabel}
          </SubmitButton>
        </form>
        <Button variant="ghost" onClick={() => setConfirming(false)}>
          Batal
        </Button>
      </div>
    </div>
  );
}
