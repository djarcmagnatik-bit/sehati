"use client";

import { useState } from "react";

/** Copy button used on the public invitation (account numbers, gift address). */
export function CopyValue({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 2500);
        } catch {
          setCopied(false);
        }
      }}
      className="inline-flex min-h-10 items-center rounded-full px-4 text-sm font-semibold"
      style={{ background: "var(--inv-accent)", color: "var(--inv-surface)" }}
    >
      {copied ? "Tersalin ✓" : label}
    </button>
  );
}
