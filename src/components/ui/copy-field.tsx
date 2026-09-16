"use client";

import { useId, useRef, useState } from "react";
import { cn } from "@/lib/cn";

/** Read-only value with a copy button. Falls back to selecting the text when the clipboard is blocked. */
export function CopyField({
  label,
  value,
  hint,
  className,
}: {
  label: string;
  value: string;
  hint?: string;
  className?: string;
}) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      inputRef.current?.select();
    }
  }

  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <div className="flex flex-wrap gap-2">
        <input
          ref={inputRef}
          id={id}
          readOnly
          value={value}
          onFocus={(event) => event.currentTarget.select()}
          className="min-h-11 min-w-0 flex-1 rounded-xl border border-cream-300 bg-white px-3 font-mono text-sm"
        />
        <button
          type="button"
          onClick={copy}
          className="inline-flex min-h-11 items-center rounded-full border border-cream-300 bg-white px-4 text-sm font-semibold hover:bg-cream-100"
        >
          {copied ? "Tersalin ✓" : "Salin"}
        </button>
      </div>
      {hint ? <p className="text-xs text-ink-500">{hint}</p> : null}
    </div>
  );
}
