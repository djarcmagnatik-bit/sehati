/**
 * Guest import pipeline (pure): CSV parsing, header mapping, row validation and duplicate detection.
 * XLSX files are read on the server into the same `RawCell[][]` shape.
 */
import { estimatedSeats, MAX_SEATS_PER_INVITATION, normalizeGuestName, normalizePhone } from "@/lib/guests";

export const IMPORT_MAX_BYTES = 900 * 1024;
export const IMPORT_MAX_ROWS = 5000;
export const IMPORT_MAX_NEW_GROUPS = 30;

export type RawCell = string | number | boolean | Date | null | undefined;

export const IMPORT_FIELDS = ["guestName", "invitationName", "phone", "groupName", "seatCount"] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];

export const IMPORT_FIELD_LABEL: Record<ImportField, string> = {
  guestName: "Nama",
  invitationName: "Nama Undangan",
  phone: "Telepon",
  groupName: "Grup",
  seatCount: "Kursi",
};

const HEADER_ALIASES: Record<ImportField, string[]> = {
  guestName: ["nama", "name", "namatamu", "guestname", "namalengkap", "tamu", "guest"],
  invitationName: ["namaundangan", "invitationname", "undangan", "undanganuntuk", "ditujukan", "kepada", "invitation"],
  phone: ["telepon", "telp", "phone", "nohp", "nomorhp", "hp", "whatsapp", "wa", "notelepon", "nomortelepon", "nowa", "phonenumber"],
  groupName: ["grup", "group", "kelompok", "kategori", "guestgroup"],
  seatCount: ["kursi", "seats", "seat", "jumlahkursi", "jumlah", "pax", "jumlahorang", "seatcount", "orang"],
};

function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// ─── CSV ─────────────────────────────────────────────────────────────────────

/** Picks the most frequent of , ; or TAB outside quotes on the first line (Excel in id-ID often uses ;). */
export function detectDelimiter(text: string): "," | ";" | "\t" {
  const counts = { ",": 0, ";": 0, "\t": 0 };
  let inQuotes = false;
  for (const char of text) {
    if (char === '"') inQuotes = !inQuotes;
    else if (!inQuotes && (char === "\n" || char === "\r")) break;
    else if (!inQuotes && char in counts) counts[char as keyof typeof counts] += 1;
  }
  if (counts[";"] > counts[","] && counts[";"] >= counts["\t"]) return ";";
  if (counts["\t"] > counts[","]) return "\t";
  return ",";
}

/** RFC 4180-style parser: quoted fields, escaped quotes (""), CRLF/LF, BOM. */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^\uFEFF/, "");
  const delimiter = detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"' && field === "") {
      inQuotes = true;
    } else if (char === delimiter) {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// ─── Rows ────────────────────────────────────────────────────────────────────

export function cellToString(cell: RawCell): string {
  if (cell === null || cell === undefined) return "";
  if (cell instanceof Date) return Number.isNaN(cell.getTime()) ? "" : cell.toISOString().slice(0, 10);
  if (typeof cell === "number") return Number.isFinite(cell) ? String(Math.trunc(cell) === cell ? cell : cell) : "";
  if (typeof cell === "boolean") return "";
  return String(cell).trim();
}

const isEmptyRow = (row: RawCell[]) => row.every((cell) => cellToString(cell) === "");

export type ImportRow = {
  /** 1-based line number in the source file (header = the first non-empty line). */
  line: number;
  guestName: string;
  invitationName: string;
  phone: string | null;
  phoneNormalized: string | null;
  groupName: string | null;
  /** Null when the cell was empty: the seat count is optional. */
  seatCount: number | null;
  errors: string[];
  duplicate: null | "file" | "existing";
};

export type BuildImportResult =
  | { ok: true; rows: ImportRow[]; columns: Partial<Record<ImportField, number>> }
  | { ok: false; reason: "empty" }
  | { ok: false; reason: "missing_columns"; missing: ImportField[] }
  | { ok: false; reason: "too_many_rows"; max: number };

export function mapColumns(header: RawCell[]): { columns: Partial<Record<ImportField, number>>; missing: ImportField[] } {
  const columns: Partial<Record<ImportField, number>> = {};
  header.forEach((cell, index) => {
    const key = normalizeHeader(cellToString(cell));
    for (const field of IMPORT_FIELDS) {
      if (columns[field] === undefined && HEADER_ALIASES[field].includes(key)) {
        columns[field] = index;
        break;
      }
    }
  });
  const missing = columns.guestName === undefined ? (["guestName"] as ImportField[]) : [];
  return { columns, missing };
}

const PHONE_PATTERN = /^\+?\d[\d\s-]{6,20}$/;

export function buildImportRows(table: RawCell[][]): BuildImportResult {
  const headerIndex = table.findIndex((row) => !isEmptyRow(row));
  if (headerIndex === -1) return { ok: false, reason: "empty" };

  const { columns, missing } = mapColumns(table[headerIndex] ?? []);
  if (missing.length > 0) return { ok: false, reason: "missing_columns", missing };

  const dataRows = table
    .map((row, index) => ({ row, line: index + 1 }))
    .slice(headerIndex + 1)
    .filter(({ row }) => !isEmptyRow(row));
  if (dataRows.length === 0) return { ok: false, reason: "empty" };
  if (dataRows.length > IMPORT_MAX_ROWS) return { ok: false, reason: "too_many_rows", max: IMPORT_MAX_ROWS };

  const read = (row: RawCell[], field: ImportField) => {
    const index = columns[field];
    return index === undefined ? "" : cellToString(row[index]);
  };

  const rows = dataRows.map(({ row, line }): ImportRow => {
    const errors: string[] = [];
    const guestName = read(row, "guestName").replace(/\s+/g, " ");
    const invitationName = read(row, "invitationName").replace(/\s+/g, " ") || guestName;
    const phoneRaw = read(row, "phone");
    const groupName = read(row, "groupName").replace(/\s+/g, " ") || null;
    const seatsRaw = read(row, "seatCount");

    if (!guestName) errors.push("Nama wajib diisi");
    else if (guestName.length > 120) errors.push("Nama maksimal 120 karakter");
    if (invitationName.length > 160) errors.push("Nama undangan maksimal 160 karakter");
    if (groupName && groupName.length > 80) errors.push("Nama grup maksimal 80 karakter");

    let phone: string | null = null;
    let phoneNormalized: string | null = null;
    if (phoneRaw) {
      if (PHONE_PATTERN.test(phoneRaw) && normalizePhone(phoneRaw)) {
        phone = phoneRaw;
        phoneNormalized = normalizePhone(phoneRaw);
      } else {
        errors.push("Nomor telepon tidak valid");
      }
    }

    let seatCount: number | null = null;
    if (seatsRaw) {
      if (/^\d{1,3}$/.test(seatsRaw) && Number(seatsRaw) >= 1 && Number(seatsRaw) <= MAX_SEATS_PER_INVITATION) {
        seatCount = Number(seatsRaw);
      } else {
        errors.push(`Jumlah kursi harus angka 1–${MAX_SEATS_PER_INVITATION}`);
      }
    }

    return { line, guestName, invitationName, phone, phoneNormalized, groupName, seatCount, errors, duplicate: null };
  });

  return { ok: true, rows, columns };
}

/**
 * Flags valid rows that match an existing guest ("existing") or an earlier row in the file ("file").
 * A row matches on normalized phone when it has one, otherwise on normalized invitation name.
 */
export function markDuplicates(
  rows: ImportRow[],
  existing: { phones: ReadonlySet<string>; invitationNames: ReadonlySet<string> },
): ImportRow[] {
  const seenPhones = new Set<string>();
  const seenNames = new Set<string>();
  return rows.map((row) => {
    if (row.errors.length > 0) return { ...row, duplicate: null };
    const name = normalizeGuestName(row.invitationName);
    let duplicate: ImportRow["duplicate"] = null;
    if (row.phoneNormalized) {
      if (existing.phones.has(row.phoneNormalized)) duplicate = "existing";
      else if (seenPhones.has(row.phoneNormalized)) duplicate = "file";
    } else if (existing.invitationNames.has(name)) {
      duplicate = "existing";
    } else if (seenNames.has(name)) {
      duplicate = "file";
    }
    if (row.phoneNormalized) seenPhones.add(row.phoneNormalized);
    seenNames.add(name);
    return { ...row, duplicate };
  });
}

export type ImportSummary = { total: number; valid: number; invalid: number; duplicates: number; seats: number };

export function summarizeImport(rows: readonly ImportRow[], includeDuplicates = false): ImportSummary {
  let valid = 0;
  let invalid = 0;
  let duplicates = 0;
  let seats = 0;
  for (const row of rows) {
    if (row.errors.length > 0) invalid += 1;
    else if (row.duplicate) {
      duplicates += 1;
      if (includeDuplicates) {
        valid += 1;
        seats += estimatedSeats(row.seatCount);
      }
    } else {
      valid += 1;
      seats += estimatedSeats(row.seatCount);
    }
  }
  return { total: rows.length, valid, invalid, duplicates, seats };
}

/** Display-only file name: base name, no control characters, bounded length. Never used for storage. */
export function sanitizeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return (cleaned || "file").slice(0, 120);
}

export const IMPORT_TEMPLATE_CSV =
  "Nama,Nama Undangan,Telepon,Grup,Kursi\r\n" +
  "Ahmad Fauzi,Keluarga Bapak Ahmad,0812-3456-7890,Keluarga Mempelai Pria,5\r\n" +
  "Siti Rahma,Siti Rahma & Pasangan,0813-1111-2222,Teman,2\r\n";
