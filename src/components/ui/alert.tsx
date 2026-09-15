import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

const TONES = {
  error: { className: "border-danger-600/30 bg-danger-50 text-danger-600", icon: "⚠", label: "Gagal" },
  warning: { className: "border-clay-300 bg-clay-50 text-clay-700", icon: "⚠", label: "Peringatan" },
  success: { className: "border-success-700/30 bg-success-50 text-success-700", icon: "✓", label: "Berhasil" },
  info: { className: "border-cream-300 bg-cream-100 text-ink-700", icon: "ℹ", label: "Info" },
} as const;

export type AlertTone = keyof typeof TONES;

/** Tone is conveyed by icon + visually hidden label as well as color. */
export function Alert({ tone = "info", children }: { tone?: AlertTone; children: ReactNode }) {
  const config = TONES[tone];
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn("flex items-start gap-2 rounded-2xl border px-4 py-3 text-sm", config.className)}
    >
      <span aria-hidden="true" className="font-semibold">
        {config.icon}
      </span>
      <p>
        <span className="sr-only">{config.label}: </span>
        {children}
      </p>
    </div>
  );
}
