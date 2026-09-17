import { describe, expect, it } from "vitest";
import { neutralizeFormula, toCsv, type ExportTable } from "@/lib/export/table";
import {
  DEFAULT_PROGRESS_CARD_OPTIONS,
  EXPORT_DATASET_FEATURE,
  EXPORT_DATASETS,
  exportFilename,
  exportHref,
  isExportDataset,
  parseExportFormat,
  parseProgressCardOptions,
  percent,
  progressCardQuery,
} from "@/lib/reports";

describe("CSV export", () => {
  const table: ExportTable = {
    title: "Uji",
    columns: [
      { header: "Nama", kind: "text" },
      { header: "Jumlah", kind: "integer" },
      { header: "Nominal", kind: "money" },
      { header: "Tanggal", kind: "date" },
    ],
    rows: [
      ["Keluarga Bapak Ahmad", 5, 30_000_000n, "2026-10-01"],
      ['Kata "kutipan", koma', 0, -1_500n, null],
      ["=HYPERLINK(\"http://evil\")", 1, 0n, "2026-10-02"],
      ["baris\nbaru", null, null, null],
    ],
  };

  it("starts with a BOM, uses CRLF and quotes only where needed", () => {
    const csv = toCsv(table);
    expect(csv.startsWith("﻿Nama,Jumlah,Nominal,Tanggal\r\n")).toBe(true);
    const lines = csv.slice(1).split("\r\n");
    expect(lines[1]).toBe("Keluarga Bapak Ahmad,5,30000000,2026-10-01");
    expect(lines[2]).toBe('"Kata ""kutipan"", koma",0,-1500,');
    expect(csv.endsWith("\r\n")).toBe(true);
    expect(csv).toContain('"baris\nbaru",,,');
  });

  it("neutralizes spreadsheet formulas in text but never touches numbers", () => {
    const lines = toCsv(table).slice(1).split("\r\n");
    expect(lines[3]).toBe(`"'=HYPERLINK(""http://evil"")",1,0,2026-10-02`);
    expect(lines[2]).toContain(",-1500,");
    for (const text of ["=1+1", "+62812", "-2", "@SUM(A1)", "\tx", "\rx"]) expect(neutralizeFormula(text)).toBe(`'${text}`);
    for (const text of ["Ahmad", "0812-3456", "a=b", " =x"]) expect(neutralizeFormula(text)).toBe(text);
  });
});

describe("export vocabulary", () => {
  it("validates datasets and formats", () => {
    expect(EXPORT_DATASETS.every(isExportDataset)).toBe(true);
    expect(isExportDataset("users")).toBe(false);
    expect(isExportDataset("__proto__")).toBe(false);
    expect(parseExportFormat("xlsx")).toBe("xlsx");
    expect(parseExportFormat("pdf")).toBeNull();
    expect(parseExportFormat(null)).toBeNull();
  });

  it("maps every dataset to the access it needs", () => {
    expect(EXPORT_DATASET_FEATURE).toEqual({ guests: "guests", vendors: "vendors", expenses: "budget", payments: "budget", rundown: "rundown" });
  });

  it("names files and links predictably", () => {
    expect(exportFilename("guests", "csv", "2026-09-17")).toBe("sehati-tamu-2026-09-17.csv");
    expect(exportFilename("payments", "xlsx", "2026-09-17")).toBe("sehati-pembayaran-2026-09-17.xlsx");
    expect(exportHref("vendors", "xlsx")).toBe("/exports/vendors?format=xlsx");
  });

  it("computes floor percentages", () => {
    expect(percent(1, 3)).toBe(33);
    expect(percent(5, 0)).toBe(0);
    expect(percent(3, 3)).toBe(100);
  });
});

describe("progress card options", () => {
  it("keeps money out unless it is explicitly chosen", () => {
    expect(parseProgressCardOptions({})).toEqual(DEFAULT_PROGRESS_CARD_OPTIONS);
    expect(DEFAULT_PROGRESS_CARD_OPTIONS.budget).toBe(false);
    expect(DEFAULT_PROGRESS_CARD_OPTIONS.budgetAmounts).toBe(false);
  });

  it("treats unchecked boxes as off once the form was submitted", () => {
    expect(parseProgressCardOptions({ set: "1", guests: "1" })).toEqual({
      checklist: false,
      nextTasks: false,
      guests: true,
      budget: false,
      budgetAmounts: false,
    });
  });

  it("ignores amounts without the budget section and round-trips through the query", () => {
    expect(parseProgressCardOptions({ set: "1", budgetAmounts: "1" }).budgetAmounts).toBe(false);
    const options = { checklist: true, nextTasks: true, guests: false, budget: true, budgetAmounts: true };
    expect(progressCardQuery(options)).toBe("set=1&checklist=1&nextTasks=1&budget=1&budgetAmounts=1");
    expect(parseProgressCardOptions(new URLSearchParams(progressCardQuery(options)))).toEqual(options);
  });
});
