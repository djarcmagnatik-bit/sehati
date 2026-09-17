import Link from "next/link";
import type { ReactNode } from "react";
import { PrintButton } from "@/components/ui/print-button";

/** On screen: title, description and actions. On paper: title plus who it is for and when it was printed. */
export function ReportHeader({
  title,
  description,
  printedFor,
  actions,
}: {
  title: string;
  description: string;
  printedFor: string;
  actions?: ReactNode;
}) {
  return (
    <header className="space-y-3">
      <Link href="/reports" className="text-sm font-medium text-clay-700 underline-offset-4 hover:underline print:hidden">
        ← Semua laporan
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">{title}</h1>
          <p className="mt-1 text-ink-700 print:hidden">{description}</p>
          <p className="mt-1 hidden text-sm text-ink-700 print:block">{printedFor}</p>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <PrintButton />
          {actions}
        </div>
      </div>
    </header>
  );
}

export const REPORT_TABLE_CLASS = "w-full min-w-[36rem] text-left text-sm";
export const REPORT_TH_CLASS = "border-b border-cream-200 py-2 pr-3 font-medium text-ink-500";
export const REPORT_TD_CLASS = "border-b border-cream-200 py-2 pr-3 align-top";
