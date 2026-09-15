"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { removePartnerAction } from "@/server/actions/collaboration-actions";

export function RemovePartnerButton({ weddingId, partnerName }: { weddingId: string; partnerName: string }) {
  const [confirming, setConfirming] = useState(false);
  const groupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (confirming) groupRef.current?.querySelector<HTMLButtonElement>("button[type=submit]")?.focus();
  }, [confirming]);

  if (!confirming) {
    return (
      <Button variant="danger" onClick={() => setConfirming(true)}>
        Keluarkan {partnerName}
      </Button>
    );
  }

  return (
    <div ref={groupRef} role="group" aria-label="Konfirmasi keluarkan pasangan" className="space-y-3 rounded-2xl bg-danger-50 p-4">
      <p className="text-sm text-danger-600">
        Keluarkan {partnerName} dari workspace? {partnerName} tidak bisa lagi melihat atau mengubah data pernikahan ini.
      </p>
      <div className="flex flex-wrap gap-2">
        <form action={removePartnerAction}>
          <input type="hidden" name="weddingId" value={weddingId} />
          <SubmitButton variant="danger" pendingLabel="Memproses…">
            Ya, keluarkan
          </SubmitButton>
        </form>
        <Button variant="ghost" onClick={() => setConfirming(false)}>
          Batal
        </Button>
      </div>
    </div>
  );
}
