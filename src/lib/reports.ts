/** Reports, exports and progress cards: vocabulary and pure rules (client-safe). */
import type { Feature } from "@/lib/billing";

export const EXPORT_DATASETS = ["guests", "vendors", "expenses", "payments", "rundown"] as const;
export type ExportDataset = (typeof EXPORT_DATASETS)[number];

export const EXPORT_FORMATS = ["csv", "xlsx"] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export const EXPORT_DATASET_LABEL: Record<ExportDataset, string> = {
  guests: "Tamu",
  vendors: "Vendor",
  expenses: "Pengeluaran",
  payments: "Pembayaran",
  rundown: "Rundown",
};

/** Exports obey access exactly like the pages they come from. */
export const EXPORT_DATASET_FEATURE: Record<ExportDataset, Feature> = {
  guests: "guests",
  vendors: "vendors",
  expenses: "budget",
  payments: "budget",
  rundown: "rundown",
};

const FILE_SLUG: Record<ExportDataset, string> = {
  guests: "tamu",
  vendors: "vendor",
  expenses: "pengeluaran",
  payments: "pembayaran",
  rundown: "rundown",
};

export function isExportDataset(value: string): value is ExportDataset {
  return (EXPORT_DATASETS as readonly string[]).includes(value);
}

export function parseExportFormat(value: string | null | undefined): ExportFormat | null {
  return value === "csv" || value === "xlsx" ? value : null;
}

export function exportFilename(dataset: ExportDataset, format: ExportFormat, todayIso: string): string {
  return `sehati-${FILE_SLUG[dataset]}-${todayIso}.${format}`;
}

export const EXPORT_CONTENT_TYPE: Record<ExportFormat, string> = {
  csv: "text/csv; charset=utf-8",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

export function exportHref(dataset: ExportDataset, format: ExportFormat): string {
  return `/exports/${dataset}?format=${format}`;
}

/** Floor percentage; 0 when there is nothing to measure. */
export function percent(part: number, whole: number): number {
  return whole > 0 ? Math.floor((part / whole) * 100) : 0;
}

// ─── Progress card ───────────────────────────────────────────────────────────

/**
 * What a shared card shows. The countdown is always there; everything else is opt-in per share, and
 * money is off unless explicitly chosen (PRD §33).
 */
export type ProgressCardOptions = {
  checklist: boolean;
  nextTasks: boolean;
  guests: boolean;
  budget: boolean;
  /** Only meaningful with `budget`: show rupiah amounts instead of a percentage. */
  budgetAmounts: boolean;
};

export const DEFAULT_PROGRESS_CARD_OPTIONS: ProgressCardOptions = {
  checklist: true,
  nextTasks: false,
  guests: false,
  budget: false,
  budgetAmounts: false,
};

type Params = Record<string, string | string[] | undefined> | URLSearchParams;

function flag(params: Params, key: string): boolean | undefined {
  const raw = params instanceof URLSearchParams ? params.get(key) : params[key];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === undefined || value === null) return undefined;
  return value === "1" || value === "on" || value === "true";
}

/** Without any parameter the defaults apply; once the form was submitted, missing boxes mean "off". */
export function parseProgressCardOptions(params: Params): ProgressCardOptions {
  const submitted = flag(params, "set") === true;
  const read = (key: keyof ProgressCardOptions) => flag(params, key) ?? (submitted ? false : DEFAULT_PROGRESS_CARD_OPTIONS[key]);
  const budget = read("budget");
  return {
    checklist: read("checklist"),
    nextTasks: read("nextTasks"),
    guests: read("guests"),
    budget,
    budgetAmounts: budget && read("budgetAmounts"),
  };
}

export function progressCardQuery(options: ProgressCardOptions): string {
  const search = new URLSearchParams({ set: "1" });
  for (const [key, value] of Object.entries(options)) if (value) search.set(key, "1");
  return search.toString();
}
