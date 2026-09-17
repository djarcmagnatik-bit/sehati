/** A format-neutral table that both the CSV and the XLSX writers understand (pure). */

export type ExportColumnKind = "text" | "integer" | "money" | "date";

export type ExportColumn = { header: string; kind: ExportColumnKind; width?: number };

/** text: string · integer: number · money: bigint (whole rupiah) · date: ISO "YYYY-MM-DD". */
export type ExportValue = string | number | bigint | null;

export type ExportTable = { title: string; columns: ExportColumn[]; rows: ExportValue[][] };

/**
 * Spreadsheet apps treat a cell starting with = + - @ (or tab / carriage return) as a formula.
 * Exported text comes from users and guests, so such cells are prefixed with an apostrophe.
 */
export function neutralizeFormula(text: string): string {
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

function csvField(value: ExportValue, kind: ExportColumnKind): string {
  if (value === null) return "";
  // Numbers are written plainly (no thousand separators) so they stay machine-readable.
  const text = kind === "text" ? neutralizeFormula(String(value)) : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** RFC 4180 CSV with CRLF line endings and a UTF-8 BOM so Excel reads Indonesian text correctly. */
export function toCsv(table: ExportTable): string {
  const lines = [table.columns.map((column) => csvField(column.header, "text")).join(",")];
  for (const row of table.rows) {
    lines.push(table.columns.map((column, index) => csvField(row[index] ?? null, column.kind)).join(","));
  }
  return `﻿${lines.join("\r\n")}\r\n`;
}
