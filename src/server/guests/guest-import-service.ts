import "server-only";
import { readSheet } from "read-excel-file/node";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import {
  buildImportRows,
  IMPORT_MAX_BYTES,
  IMPORT_MAX_NEW_GROUPS,
  IMPORT_MAX_ROWS,
  markDuplicates,
  parseCsv,
  sanitizeFileName,
  summarizeImport,
  type ImportField,
  type ImportRow,
  type RawCell,
} from "@/lib/guest-import";
import { normalizeGuestName } from "@/lib/guests";
import { recordActivity } from "@/server/activity/activity-service";
import { memberWeddingWhere, requireWeddingMember, WeddingAccessError } from "@/server/authz/wedding-access";
import { getDb } from "@/server/db";
import { generateInvitationToken } from "./guest-service";

type Tx = Prisma.TransactionClient;

/** A preview is only a staging area; it is worthless once the list has moved on. */
const IMPORT_TTL_MS = 60 * 60 * 1000;
const CREATE_CHUNK = 500;

const uuidSchema = z.uuid();
const isUuid = (value: string) => uuidSchema.safeParse(value).success;

// ─── File reading ────────────────────────────────────────────────────────────

export type UploadedFile = { name: string; type: string; bytes: Buffer };

export type ReadFileResult =
  | { ok: true; table: RawCell[][] }
  | { ok: false; reason: "too_large" | "unsupported_type" | "invalid_file" };

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
/** Browsers are inconsistent about spreadsheet MIME types, so generic binary types are accepted too. */
const XLSX_ALLOWED_MIME = new Set([XLSX_MIME, "application/zip", "application/octet-stream", "application/x-zip-compressed", ""]);
const CSV_ALLOWED_MIME = new Set(["text/csv", "application/csv", "text/plain", "application/vnd.ms-excel", "application/octet-stream", ""]);

/**
 * Reads an uploaded CSV/XLSX into a raw table. The extension decides the parser; the MIME type and
 * the file's own bytes only have to agree with it, so a renamed binary is rejected instead of parsed.
 */
export async function readGuestFile(file: UploadedFile): Promise<ReadFileResult> {
  if (file.bytes.byteLength === 0) return { ok: false, reason: "invalid_file" };
  if (file.bytes.byteLength > IMPORT_MAX_BYTES) return { ok: false, reason: "too_large" };
  const name = file.name.toLowerCase();
  const type = file.type.split(";")[0]?.trim().toLowerCase() ?? "";

  if (name.endsWith(".xlsx")) {
    if (!XLSX_ALLOWED_MIME.has(type)) return { ok: false, reason: "unsupported_type" };
    // XLSX is a ZIP container: "PK\x03\x04".
    if (file.bytes[0] !== 0x50 || file.bytes[1] !== 0x4b) return { ok: false, reason: "invalid_file" };
    try {
      // First worksheet only. The library types a date cell as `typeof Date` although it yields a Date.
      const rows = (await readSheet(file.bytes)) as unknown as RawCell[][];
      return { ok: true, table: rows };
    } catch {
      return { ok: false, reason: "invalid_file" };
    }
  }

  if (!name.endsWith(".csv")) return { ok: false, reason: "unsupported_type" };
  if (!CSV_ALLOWED_MIME.has(type) && !type.startsWith("text/")) return { ok: false, reason: "unsupported_type" };
  // A text file never contains NUL bytes; a renamed .xlsx/.pdf does.
  if (file.bytes.includes(0)) return { ok: false, reason: "invalid_file" };
  return { ok: true, table: parseCsv(file.bytes.toString("utf8")) };
}

// ─── Stored rows ─────────────────────────────────────────────────────────────

const storedRowsSchema = z
  .array(
    z.object({
      line: z.number().int(),
      guestName: z.string(),
      invitationName: z.string(),
      phone: z.string().nullable(),
      phoneNormalized: z.string().nullable(),
      groupName: z.string().nullable(),
      seatCount: z.number().int(),
      errors: z.array(z.string()),
      duplicate: z.enum(["file", "existing"]).nullable(),
    }),
  )
  .max(IMPORT_MAX_ROWS);

function parseStoredRows(value: unknown): ImportRow[] {
  const parsed = storedRowsSchema.safeParse(value);
  return parsed.success ? parsed.data : [];
}

async function existingKeys(tx: Tx | ReturnType<typeof getDb>, weddingId: string) {
  const guests = await tx.guest.findMany({ where: { weddingId }, select: { phoneNormalized: true, invitationName: true } });
  return {
    phones: new Set(guests.map((guest) => guest.phoneNormalized).filter((phone): phone is string => phone !== null)),
    invitationNames: new Set(guests.map((guest) => normalizeGuestName(guest.invitationName))),
  };
}

/** Group names in the file that do not exist yet, in first-seen order and deduplicated case-insensitively. */
function pendingGroupNames(rows: readonly ImportRow[], existing: ReadonlyMap<string, string>): string[] {
  const names = new Map<string, string>();
  for (const row of rows) {
    if (row.errors.length > 0 || !row.groupName) continue;
    const key = normalizeGuestName(row.groupName);
    if (!existing.has(key) && !names.has(key)) names.set(key, row.groupName);
  }
  return [...names.values()];
}

async function groupsByName(tx: Tx, weddingId: string): Promise<Map<string, string>> {
  const groups = await tx.guestGroup.findMany({ where: { weddingId }, select: { id: true, name: true } });
  return new Map(groups.map((group) => [normalizeGuestName(group.name), group.id]));
}

// ─── Preview ─────────────────────────────────────────────────────────────────

export type PreviewImportResult =
  | { ok: true; batchId: string }
  | { ok: false; reason: "too_large" | "unsupported_type" | "invalid_file" | "empty" }
  | { ok: false; reason: "missing_columns"; missing: ImportField[] }
  | { ok: false; reason: "too_many_rows"; max: number };

/** Parses and analyzes the file, then stores the result for confirmation. Creates no guests. */
export async function previewGuestImport(
  userId: string,
  weddingId: string,
  file: UploadedFile,
  now: Date = new Date(),
): Promise<PreviewImportResult> {
  const membership = await requireWeddingMember(userId, weddingId);

  const read = await readGuestFile(file);
  if (!read.ok) return read;
  const built = buildImportRows(read.table);
  if (!built.ok) return built;

  const db = getDb();
  const rows = markDuplicates(built.rows, await existingKeys(db, membership.weddingId));
  const batch = await db.guestImportBatch.create({
    data: {
      weddingId: membership.weddingId,
      fileName: sanitizeFileName(file.name),
      rowCount: rows.length,
      rows,
      expiresAt: new Date(now.getTime() + IMPORT_TTL_MS),
      createdById: userId,
    },
    select: { id: true },
  });
  return { ok: true, batchId: batch.id };
}

export type GuestImportPreview = {
  id: string;
  weddingId: string;
  fileName: string;
  rows: ImportRow[];
  newGroupNames: string[];
  committedAt: Date | null;
  importedCount: number | null;
  skippedCount: number | null;
  expired: boolean;
};

export async function getGuestImportBatchForUser(
  userId: string,
  batchId: string,
  now: Date = new Date(),
): Promise<GuestImportPreview | null> {
  if (!isUuid(batchId)) return null;
  const db = getDb();
  const batch = await db.guestImportBatch.findFirst({
    where: { id: batchId, wedding: memberWeddingWhere(userId) },
    select: {
      id: true,
      weddingId: true,
      fileName: true,
      rows: true,
      committedAt: true,
      importedCount: true,
      skippedCount: true,
      expiresAt: true,
    },
  });
  if (!batch) return null;

  const rows = parseStoredRows(batch.rows);
  const groups = await db.guestGroup.findMany({ where: { weddingId: batch.weddingId }, select: { name: true } });
  const existing = new Map(groups.map((group) => [normalizeGuestName(group.name), group.name]));
  return {
    id: batch.id,
    weddingId: batch.weddingId,
    fileName: batch.fileName,
    rows,
    newGroupNames: pendingGroupNames(rows, existing),
    committedAt: batch.committedAt,
    importedCount: batch.importedCount,
    skippedCount: batch.skippedCount,
    expired: batch.committedAt === null && batch.expiresAt.getTime() <= now.getTime(),
  };
}

// ─── Commit ──────────────────────────────────────────────────────────────────

export type CommitImportResult =
  | { ok: true; imported: number; skipped: number; createdGroups: number }
  | { ok: false; reason: "already_committed" | "expired" | "nothing_to_import" }
  | { ok: false; reason: "too_many_new_groups"; max: number };

/**
 * Creates the guests from a stored preview. Duplicates are re-checked against the current data,
 * and the batch row is locked so a double submit imports the rows exactly once.
 */
export async function commitGuestImport(
  userId: string,
  batchId: string,
  options: { includeDuplicates: boolean },
  now: Date = new Date(),
): Promise<CommitImportResult> {
  if (!isUuid(batchId)) throw new WeddingAccessError();
  const db = getDb();
  const batch = await db.guestImportBatch.findFirst({
    where: { id: batchId, wedding: memberWeddingWhere(userId) },
    select: { id: true, weddingId: true },
  });
  if (!batch) throw new WeddingAccessError();
  const membership = await requireWeddingMember(userId, batch.weddingId);

  return db.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<Array<{ rows: unknown; committed_at: Date | null; expires_at: Date }>>`
      SELECT rows, committed_at, expires_at FROM guest_import_batches WHERE id = ${batch.id}::uuid FOR UPDATE
    `;
    const row = locked[0];
    if (!row) throw new WeddingAccessError();
    if (row.committed_at !== null) return { ok: false, reason: "already_committed" } as const;
    if (row.expires_at.getTime() <= now.getTime()) return { ok: false, reason: "expired" } as const;

    const stored = parseStoredRows(row.rows);
    const rows = markDuplicates(stored, await existingKeys(tx, batch.weddingId));
    const selected = rows.filter((item) => item.errors.length === 0 && (options.includeDuplicates || item.duplicate === null));
    if (selected.length === 0) return { ok: false, reason: "nothing_to_import" } as const;

    const groupIds = await groupsByName(tx, batch.weddingId);
    const newNames = pendingGroupNames(selected, groupIds);
    if (newNames.length > IMPORT_MAX_NEW_GROUPS) {
      return { ok: false, reason: "too_many_new_groups", max: IMPORT_MAX_NEW_GROUPS } as const;
    }
    if (newNames.length > 0) {
      const last = await tx.guestGroup.aggregate({ where: { weddingId: batch.weddingId }, _max: { sortOrder: true } });
      let sortOrder = last._max.sortOrder ?? 0;
      for (const name of newNames) {
        sortOrder += 10;
        const created = await tx.guestGroup.create({
          data: { weddingId: batch.weddingId, name, sortOrder },
          select: { id: true },
        });
        groupIds.set(normalizeGuestName(name), created.id);
      }
    }

    const data = selected.map((item) => ({
      weddingId: batch.weddingId,
      groupId: item.groupName ? (groupIds.get(normalizeGuestName(item.groupName)) ?? null) : null,
      guestName: item.guestName,
      invitationName: item.invitationName,
      phone: item.phone,
      phoneNormalized: item.phoneNormalized,
      seatCount: item.seatCount,
      invitationToken: generateInvitationToken(),
      importBatchId: batch.id,
      createdById: userId,
    }));
    for (let index = 0; index < data.length; index += CREATE_CHUNK) {
      await tx.guest.createMany({ data: data.slice(index, index + CREATE_CHUNK) });
    }

    const skipped = rows.length - selected.length;
    await tx.guestImportBatch.update({
      where: { id: batch.id },
      data: { rows, committedAt: now, importedCount: selected.length, skippedCount: skipped },
    });
    await recordActivity(tx, {
      weddingId: batch.weddingId,
      userId,
      actorName: membership.displayName,
      action: "guests.imported",
      entityType: "guest_import",
      entityId: batch.id,
      metadata: { count: selected.length, seats: summarizeImport(selected, true).seats },
    });
    return { ok: true, imported: selected.length, skipped, createdGroups: newNames.length } as const;
  });
}
