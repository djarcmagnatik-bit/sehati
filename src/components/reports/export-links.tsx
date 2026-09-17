import { buttonClassName } from "@/components/ui/button";
import { EXPORT_DATASET_LABEL, exportHref, type ExportDataset } from "@/lib/reports";

/** Plain links: the response is an attachment, so the page stays where it is. */
export function ExportLinks({ dataset, compact = false }: { dataset: ExportDataset; compact?: boolean }) {
  const label = EXPORT_DATASET_LABEL[dataset].toLowerCase();
  return (
    <div className="flex flex-wrap gap-2 print:hidden">
      <a href={exportHref(dataset, "xlsx")} className={buttonClassName("secondary", compact ? "min-h-10 px-4" : undefined)} aria-label={`Unduh data ${label} (Excel)`}>
        Excel
      </a>
      <a href={exportHref(dataset, "csv")} className={buttonClassName("secondary", compact ? "min-h-10 px-4" : undefined)} aria-label={`Unduh data ${label} (CSV)`}>
        CSV
      </a>
    </div>
  );
}
