"use client";

import { buttonClassName } from "@/components/ui/button";

export function PrintButton({ label = "Cetak" }: { label?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className={buttonClassName("secondary", "print:hidden")}>
      {label}
    </button>
  );
}
