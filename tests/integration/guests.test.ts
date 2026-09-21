import { randomUUID } from "node:crypto";
import writeXlsxFile from "write-excel-file/node";
import { afterAll, describe, expect, it } from "vitest";
import { DEFAULT_GUEST_FILTERS } from "@/lib/guest-filters";
import { IMPORT_MAX_BYTES, summarizeImport } from "@/lib/guest-import";
import type { GuestInput } from "@/lib/validation/guests";
import { getRecentActivity } from "@/server/activity/activity-service";
import { WeddingAccessError } from "@/server/authz/wedding-access";
import { getDb } from "@/server/db";
import {
  commitGuestImport,
  getGuestImportBatchForUser,
  previewGuestImport,
  readGuestFile,
  type UploadedFile,
} from "@/server/guests/guest-import-service";
import {
  bulkUpdateInvitationStatus,
  createGuest,
  createGuestGroup,
  deleteGuest,
  deleteGuestGroup,
  getGuestForUser,
  getGuestGroupOptions,
  getGuestSummary,
  listGuestGroupsWithCounts,
  listGuests,
  updateGuest,
} from "@/server/guests/guest-service";
import { createTestUser, deleteUsers } from "../support/integration-helpers";
import { createOwnerWorkspace } from "../support/workspace-helpers";

const userIds: string[] = [];

afterAll(async () => {
  await deleteUsers(userIds);
});

function guestInput(overrides: Partial<GuestInput> = {}): GuestInput {
  return {
    guestName: "Ahmad Fauzi",
    invitationName: "Ahmad Fauzi",
    groupId: null,
    phone: null,
    email: null,
    address: null,
    seatCount: 1,
    invitationStatus: "NOT_SENT",
    rsvpStatus: "PENDING",
    attendingCount: 0,
    notes: null,
    ...overrides,
  };
}

async function newGuest(userId: string, weddingId: string, overrides: Partial<GuestInput> = {}): Promise<string> {
  const result = await createGuest(userId, weddingId, guestInput(overrides));
  if (!result.ok) throw new Error(`createGuest failed: ${result.reason}`);
  return result.guestId;
}

async function groupId(userId: string, weddingId: string, name: string): Promise<string> {
  const groups = await getGuestGroupOptions(userId, weddingId);
  const group = groups.find((item) => item.name === name);
  if (!group) throw new Error(`missing group ${name}`);
  return group.id;
}

function csvFile(body: string, name = "tamu.csv"): UploadedFile {
  return { name, type: "text/csv", bytes: Buffer.from(body, "utf8") };
}

async function xlsxFile(rows: string[][], name = "tamu.xlsx"): Promise<UploadedFile> {
  const buffer = await writeXlsxFile(rows).toBuffer();
  return { name, type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", bytes: buffer };
}

describe("guest groups", () => {
  it("creates the standard groups with every new workspace", async () => {
    const { owner, weddingId } = await createOwnerWorkspace(userIds);
    const groups = await getGuestGroupOptions(owner.userId, weddingId);
    expect(groups.length).toBeGreaterThanOrEqual(8);
    expect(groups.map((group) => group.name)).toContain("Keluarga Mempelai Wanita");
    expect((await getDb().wedding.findUniqueOrThrow({ where: { id: weddingId } })).guestGroupsInitializedAt).not.toBeNull();
  });

  it("rejects a duplicate group name regardless of case", async () => {
    const { owner, weddingId } = await createOwnerWorkspace(userIds);
    expect(await createGuestGroup(owner.userId, weddingId, { name: "teman kantor" })).toMatchObject({ ok: true });
    expect(await createGuestGroup(owner.userId, weddingId, { name: "Teman Kantor" })).toEqual({ ok: false, reason: "duplicate_name" });
  });

  it("keeps guests when their group is deleted", async () => {
    const { owner, weddingId } = await createOwnerWorkspace(userIds);
    const teman = await groupId(owner.userId, weddingId, "Teman");
    const guestId = await newGuest(owner.userId, weddingId, { groupId: teman, seatCount: 2 });

    expect(await deleteGuestGroup(owner.userId, teman)).toEqual({ ungrouped: 1 });
    const guest = await getGuestForUser(owner.userId, guestId);
    expect(guest).toMatchObject({ groupId: null, seatCount: 2 });
    const { ungrouped } = await listGuestGroupsWithCounts(owner.userId, weddingId);
    expect(ungrouped).toEqual({ invitations: 1, seats: 2 });
  });

  it("counts invitations and seats per group", async () => {
    const { owner, weddingId } = await createOwnerWorkspace(userIds);
    const keluarga = await groupId(owner.userId, weddingId, "Keluarga Mempelai Pria");
    await newGuest(owner.userId, weddingId, { invitationName: "Keluarga Bapak Ahmad", groupId: keluarga, seatCount: 5 });
    await newGuest(owner.userId, weddingId, { invitationName: "Keluarga Ibu Sari", groupId: keluarga, seatCount: 3 });

    const { groups } = await listGuestGroupsWithCounts(owner.userId, weddingId);
    expect(groups.find((group) => group.id === keluarga)).toMatchObject({ invitations: 2, seats: 8 });
  });
});

describe("PRD flow: one invitation can cover several people", () => {
  it("counts invitations and seats separately across the RSVP lifecycle", async () => {
    const { owner, weddingId } = await createOwnerWorkspace(userIds);
    const keluarga = await groupId(owner.userId, weddingId, "Keluarga Mempelai Pria");

    const ahmad = await newGuest(owner.userId, weddingId, {
      guestName: "Ahmad Fauzi",
      invitationName: "Keluarga Bapak Ahmad",
      groupId: keluarga,
      phone: "0812-3456-7890",
      seatCount: 5,
    });
    const siti = await newGuest(owner.userId, weddingId, { guestName: "Siti Rahma", invitationName: "Siti Rahma", seatCount: 2 });

    expect(await getGuestSummary(owner.userId, weddingId)).toMatchObject({
      invitations: 2,
      seats: 7,
      invitedInvitations: 0,
      pendingInvitations: 2,
      pendingSeats: 7,
    });

    // Undangan dikirim, lalu keluarga Ahmad konfirmasi 4 dari 5 kursi.
    expect(await bulkUpdateInvitationStatus(owner.userId, weddingId, [ahmad, siti], "SENT")).toBe(2);
    await updateGuest(
      owner.userId,
      ahmad,
      guestInput({
        guestName: "Ahmad Fauzi",
        invitationName: "Keluarga Bapak Ahmad",
        groupId: keluarga,
        phone: "0812-3456-7890",
        seatCount: 5,
        invitationStatus: "SENT",
        rsvpStatus: "ATTENDING",
        attendingCount: 4,
      }),
    );
    await updateGuest(
      owner.userId,
      siti,
      guestInput({ guestName: "Siti Rahma", invitationName: "Siti Rahma", seatCount: 2, invitationStatus: "SENT", rsvpStatus: "DECLINED" }),
    );

    expect(await getGuestSummary(owner.userId, weddingId)).toEqual({
      invitations: 2,
      seats: 7,
      unsetSeatInvitations: 0,
      invitedInvitations: 2,
      invitedSeats: 7,
      attendingInvitations: 1,
      attendingSeats: 4,
      maybeInvitations: 0,
      declinedInvitations: 1,
      pendingInvitations: 0,
      pendingSeats: 0,
    });

    const guest = await getGuestForUser(owner.userId, ahmad);
    expect(guest).toMatchObject({ attendingCount: 4, seatCount: 5, invitationStatus: "SENT", group: { name: "Keluarga Mempelai Pria" } });
    expect(await getDb().guest.findUniqueOrThrow({ where: { id: ahmad } })).toMatchObject({ phoneNormalized: "6281234567890" });
  });

  it("stores a unique invitation token per guest", async () => {
    const { owner, weddingId } = await createOwnerWorkspace(userIds);
    const first = await newGuest(owner.userId, weddingId);
    const second = await newGuest(owner.userId, weddingId, { guestName: "Budi" });
    const tokens = await getDb().guest.findMany({ where: { id: { in: [first, second] } }, select: { invitationToken: true } });
    expect(new Set(tokens.map((row) => row.invitationToken)).size).toBe(2);
    expect(tokens[0]?.invitationToken).toMatch(/^[\w-]{20,}$/);
  });
});

describe("optional seat count", () => {
  it("stores an empty seat count as empty and estimates it as one person", async () => {
    const { owner, weddingId } = await createOwnerWorkspace(userIds);
    const keluarga = await groupId(owner.userId, weddingId, "Keluarga Mempelai Pria");
    const open = await newGuest(owner.userId, weddingId, { invitationName: "Keluarga Pak Harun", groupId: keluarga, seatCount: null });
    await newGuest(owner.userId, weddingId, { invitationName: "Rombongan Kantor", groupId: keluarga, seatCount: 4 });

    expect(await getGuestForUser(owner.userId, open)).toMatchObject({ seatCount: null });
    expect(await getGuestSummary(owner.userId, weddingId)).toMatchObject({
      invitations: 2,
      seats: 5,
      unsetSeatInvitations: 1,
      pendingSeats: 5,
    });
    const { groups } = await listGuestGroupsWithCounts(owner.userId, weddingId);
    expect(groups.find((group) => group.name === "Keluarga Mempelai Pria")).toMatchObject({ invitations: 2, seats: 5 });

    // Sorting by seats keeps invitations without a seat count at the end.
    const bySeats = await listGuests(owner.userId, weddingId, { ...DEFAULT_GUEST_FILTERS, sort: "seats" });
    expect(bySeats.items.map((item) => item.invitationName)).toEqual(["Rombongan Kantor", "Keluarga Pak Harun"]);

    // A seat count can be set later, and cleared again.
    await updateGuest(owner.userId, open, guestInput({ invitationName: "Keluarga Pak Harun", groupId: keluarga, seatCount: 3 }));
    expect(await getGuestSummary(owner.userId, weddingId)).toMatchObject({ seats: 7, unsetSeatInvitations: 0 });
    await updateGuest(owner.userId, open, guestInput({ invitationName: "Keluarga Pak Harun", groupId: keluarga, seatCount: null }));
    expect(await getGuestForUser(owner.userId, open)).toMatchObject({ seatCount: null });
  });
});

describe("attendance integrity", () => {
  it("rejects an attending count above the seat count at the database level", async () => {
    const { owner, weddingId } = await createOwnerWorkspace(userIds);
    const guestId = await newGuest(owner.userId, weddingId, { seatCount: 2, rsvpStatus: "ATTENDING", attendingCount: 2 });
    await expect(
      getDb().$executeRaw`UPDATE guests SET attending_count = 5 WHERE id = ${guestId}::uuid`,
    ).rejects.toThrow(/guests_attending_count_range/);
  });

  it("rejects attendance on a declined invitation at the database level", async () => {
    const { owner, weddingId } = await createOwnerWorkspace(userIds);
    const guestId = await newGuest(owner.userId, weddingId, { seatCount: 4, rsvpStatus: "ATTENDING", attendingCount: 3 });
    await expect(
      getDb().$executeRaw`UPDATE guests SET rsvp_status = 'DECLINED' WHERE id = ${guestId}::uuid`,
    ).rejects.toThrow(/guests_attending_matches_rsvp/);
  });

  it("bounds an invitation without a seat count by the maximum at the database level", async () => {
    const { owner, weddingId } = await createOwnerWorkspace(userIds);
    const guestId = await newGuest(owner.userId, weddingId, { seatCount: null, rsvpStatus: "ATTENDING", attendingCount: 8 });
    expect(await getDb().guest.findUniqueOrThrow({ where: { id: guestId } })).toMatchObject({ seatCount: null, attendingCount: 8 });
    await getDb().$executeRaw`UPDATE guests SET attending_count = 50 WHERE id = ${guestId}::uuid`;
    await expect(
      getDb().$executeRaw`UPDATE guests SET attending_count = 51 WHERE id = ${guestId}::uuid`,
    ).rejects.toThrow(/guests_attending_count_range/);
    // Empty is allowed; zero is not a seat count.
    const pending = await newGuest(owner.userId, weddingId, { seatCount: null });
    await expect(getDb().$executeRaw`UPDATE guests SET seat_count = 0 WHERE id = ${pending}::uuid`).rejects.toThrow(
      /guests_seat_count_range/,
    );
  });

  it("rejects a seat count above the maximum at the database level", async () => {
    const { owner, weddingId } = await createOwnerWorkspace(userIds);
    const guestId = await newGuest(owner.userId, weddingId);
    await expect(getDb().$executeRaw`UPDATE guests SET seat_count = 51 WHERE id = ${guestId}::uuid`).rejects.toThrow(
      /guests_seat_count_range/,
    );
  });
});

describe("invitation status", () => {
  it("does not downgrade an opened invitation to sent", async () => {
    const { owner, weddingId } = await createOwnerWorkspace(userIds);
    const opened = await newGuest(owner.userId, weddingId, { guestName: "Dibuka" });
    const notSent = await newGuest(owner.userId, weddingId, { guestName: "Belum" });
    await getDb().$executeRaw`UPDATE guests SET invitation_status = 'OPENED' WHERE id = ${opened}::uuid`;

    expect(await bulkUpdateInvitationStatus(owner.userId, weddingId, [opened, notSent], "SENT")).toBe(1);
    expect((await getGuestForUser(owner.userId, opened))?.invitationStatus).toBe("OPENED");
    expect((await getGuestForUser(owner.userId, notSent))?.invitationStatus).toBe("SENT");

    // Follow-up is an explicit choice, so it does apply to an opened invitation.
    expect(await bulkUpdateInvitationStatus(owner.userId, weddingId, [opened], "FOLLOW_UP")).toBe(1);
    expect((await getGuestForUser(owner.userId, opened))?.invitationStatus).toBe("FOLLOW_UP");
  });

  it("keeps OPENED when the guest is edited and marked as sent", async () => {
    const { owner, weddingId } = await createOwnerWorkspace(userIds);
    const guestId = await newGuest(owner.userId, weddingId);
    await getDb().$executeRaw`UPDATE guests SET invitation_status = 'OPENED' WHERE id = ${guestId}::uuid`;
    await updateGuest(owner.userId, guestId, guestInput({ invitationStatus: "SENT" }));
    expect((await getGuestForUser(owner.userId, guestId))?.invitationStatus).toBe("OPENED");
  });

  it("ignores guest ids from another workspace", async () => {
    const mine = await createOwnerWorkspace(userIds);
    const theirs = await createOwnerWorkspace(userIds, { name: "Rina" });
    const foreign = await newGuest(theirs.owner.userId, theirs.weddingId);
    const own = await newGuest(mine.owner.userId, mine.weddingId);

    expect(await bulkUpdateInvitationStatus(mine.owner.userId, mine.weddingId, [own, foreign], "SENT")).toBe(1);
    expect((await getGuestForUser(theirs.owner.userId, foreign))?.invitationStatus).toBe("NOT_SENT");
  });
});

describe("guest list filters", () => {
  it("filters by RSVP, group, search and pagination", async () => {
    const { owner, weddingId } = await createOwnerWorkspace(userIds);
    const teman = await groupId(owner.userId, weddingId, "Teman");
    await newGuest(owner.userId, weddingId, {
      guestName: "Ahmad Fauzi",
      invitationName: "Keluarga Bapak Ahmad",
      groupId: teman,
      phone: "0812-3456-7890",
      seatCount: 5,
      rsvpStatus: "ATTENDING",
      attendingCount: 5,
    });
    await newGuest(owner.userId, weddingId, { guestName: "Siti Rahma", invitationName: "Siti Rahma", seatCount: 2 });

    const attending = await listGuests(owner.userId, weddingId, { ...DEFAULT_GUEST_FILTERS, rsvp: "ATTENDING" });
    expect(attending.items.map((item) => item.invitationName)).toEqual(["Keluarga Bapak Ahmad"]);

    const ungrouped = await listGuests(owner.userId, weddingId, { ...DEFAULT_GUEST_FILTERS, group: "none" });
    expect(ungrouped.items.map((item) => item.invitationName)).toEqual(["Siti Rahma"]);

    const byGroup = await listGuests(owner.userId, weddingId, { ...DEFAULT_GUEST_FILTERS, group: teman });
    expect(byGroup.total).toBe(1);

    const byName = await listGuests(owner.userId, weddingId, { ...DEFAULT_GUEST_FILTERS, q: "rahma" });
    expect(byName.items.map((item) => item.invitationName)).toEqual(["Siti Rahma"]);

    const byPhone = await listGuests(owner.userId, weddingId, { ...DEFAULT_GUEST_FILTERS, q: "0812-3456" });
    expect(byPhone.items.map((item) => item.invitationName)).toEqual(["Keluarga Bapak Ahmad"]);

    const bySeats = await listGuests(owner.userId, weddingId, { ...DEFAULT_GUEST_FILTERS, sort: "seats" });
    expect(bySeats.items.map((item) => item.seatCount)).toEqual([5, 2]);

    const secondPage = await listGuests(owner.userId, weddingId, { ...DEFAULT_GUEST_FILTERS, page: 2 });
    expect(secondPage).toMatchObject({ total: 2, page: 2, items: [] });
  });
});

describe("guest authorization", () => {
  it("hides guests, groups and import batches from other users", async () => {
    const mine = await createOwnerWorkspace(userIds);
    const outsider = await createTestUser(userIds, "Outsider");
    const guestId = await newGuest(mine.owner.userId, mine.weddingId);
    const teman = await groupId(mine.owner.userId, mine.weddingId, "Teman");
    const preview = await previewGuestImport(mine.owner.userId, mine.weddingId, csvFile("Nama\nBudi\n"));
    if (!preview.ok) throw new Error("preview failed");

    expect(await getGuestForUser(outsider.userId, guestId)).toBeNull();
    expect(await getGuestImportBatchForUser(outsider.userId, preview.batchId)).toBeNull();
    await expect(updateGuest(outsider.userId, guestId, guestInput())).rejects.toBeInstanceOf(WeddingAccessError);
    await expect(deleteGuest(outsider.userId, guestId)).rejects.toBeInstanceOf(WeddingAccessError);
    await expect(deleteGuestGroup(outsider.userId, teman)).rejects.toBeInstanceOf(WeddingAccessError);
    await expect(listGuests(outsider.userId, mine.weddingId, DEFAULT_GUEST_FILTERS)).rejects.toBeInstanceOf(WeddingAccessError);
    await expect(commitGuestImport(outsider.userId, preview.batchId, { includeDuplicates: false })).rejects.toBeInstanceOf(
      WeddingAccessError,
    );
    expect(await getGuestForUser(outsider.userId, randomUUID())).toBeNull();
  });
});

describe("guest import file validation", () => {
  it("accepts a CSV and reads its rows", async () => {
    const result = await readGuestFile(csvFile("Nama;Kursi\nAhmad;3\n"));
    expect(result).toEqual({ ok: true, table: [["Nama", "Kursi"], ["Ahmad", "3"]] });
  });

  it("rejects a file above the size limit", async () => {
    const big = { name: "besar.csv", type: "text/csv", bytes: Buffer.alloc(IMPORT_MAX_BYTES + 1, 0x41) };
    expect(await readGuestFile(big)).toEqual({ ok: false, reason: "too_large" });
  });

  it("rejects an unsupported extension and an empty file", async () => {
    expect(await readGuestFile({ name: "tamu.pdf", type: "application/pdf", bytes: Buffer.from("x") })).toEqual({
      ok: false,
      reason: "unsupported_type",
    });
    expect(await readGuestFile(csvFile(""))).toEqual({ ok: false, reason: "invalid_file" });
  });

  it("rejects a binary file renamed to .csv or .xlsx", async () => {
    const binary = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x01, 0x02]);
    expect(await readGuestFile({ name: "tamu.csv", type: "text/csv", bytes: binary })).toEqual({ ok: false, reason: "invalid_file" });
    expect(
      await readGuestFile({ name: "tamu.xlsx", type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", bytes: Buffer.from("Nama,Kursi") }),
    ).toEqual({ ok: false, reason: "invalid_file" });
  });

  it("reads an XLSX workbook", async () => {
    const file = await xlsxFile([
      ["Nama", "Nama Undangan", "Kursi"],
      ["Ahmad Fauzi", "Keluarga Bapak Ahmad", "5"],
    ]);
    const result = await readGuestFile(file);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.table[1]?.[1]).toBe("Keluarga Bapak Ahmad");
  });
});

describe("guest import", () => {
  const csv =
    "Nama,Nama Undangan,Telepon,Grup,Kursi\n" +
    "Ahmad Fauzi,Keluarga Bapak Ahmad,0812-3456-7890,Keluarga Mempelai Pria,5\n" +
    "Siti Rahma,Siti Rahma,0813-1111-2222,Kantor Lama,2\n" +
    ",,0814-0000-0000,Teman,1\n";

  it("imports a row with an empty seat count without a seat count", async () => {
    const { owner, weddingId } = await createOwnerWorkspace(userIds);
    const file = "Nama,Nama Undangan,Telepon,Grup,Kursi\nDewi Lestari,Keluarga Dewi,,,\nBudi,Budi,,,3\n";
    const preview = await previewGuestImport(owner.userId, weddingId, csvFile(file, "tanpa kursi.csv"));
    if (!preview.ok) throw new Error(`preview failed: ${preview.reason}`);
    const batch = await getGuestImportBatchForUser(owner.userId, preview.batchId);
    expect(summarizeImport(batch?.rows ?? [])).toMatchObject({ valid: 2, invalid: 0, seats: 4 });

    expect(await commitGuestImport(owner.userId, preview.batchId, { includeDuplicates: false })).toMatchObject({ ok: true, imported: 2 });
    const imported = await listGuests(owner.userId, weddingId, DEFAULT_GUEST_FILTERS);
    expect(imported.items.map((item) => [item.invitationName, item.seatCount])).toEqual([
      ["Budi", 3],
      ["Keluarga Dewi", null],
    ]);
    expect(await getGuestSummary(owner.userId, weddingId)).toMatchObject({ seats: 4, unsetSeatInvitations: 1 });
  });

  it("previews without writing guests, then imports on confirmation", async () => {
    const { owner, weddingId } = await createOwnerWorkspace(userIds);
    const preview = await previewGuestImport(owner.userId, weddingId, csvFile(csv, "daftar tamu.csv"));
    if (!preview.ok) throw new Error(`preview failed: ${preview.reason}`);

    const batch = await getGuestImportBatchForUser(owner.userId, preview.batchId);
    expect(batch).toMatchObject({ fileName: "daftar tamu.csv", committedAt: null, expired: false, newGroupNames: ["Kantor Lama"] });
    expect(summarizeImport(batch?.rows ?? [])).toEqual({ total: 3, valid: 2, invalid: 1, duplicates: 0, seats: 7 });
    expect(await getGuestSummary(owner.userId, weddingId)).toMatchObject({ invitations: 0, seats: 0 });

    const committed = await commitGuestImport(owner.userId, preview.batchId, { includeDuplicates: false });
    expect(committed).toEqual({ ok: true, imported: 2, skipped: 1, createdGroups: 1 });
    expect(await getGuestSummary(owner.userId, weddingId)).toMatchObject({ invitations: 2, seats: 7 });

    const groups = await getGuestGroupOptions(owner.userId, weddingId);
    expect(groups.map((group) => group.name)).toContain("Kantor Lama");
    const imported = await listGuests(owner.userId, weddingId, DEFAULT_GUEST_FILTERS);
    expect(imported.items.map((item) => [item.invitationName, item.seatCount, item.group?.name])).toEqual([
      ["Keluarga Bapak Ahmad", 5, "Keluarga Mempelai Pria"],
      ["Siti Rahma", 2, "Kantor Lama"],
    ]);
    const tokens = await getDb().guest.findMany({ where: { weddingId }, select: { invitationToken: true, importBatchId: true } });
    expect(new Set(tokens.map((row) => row.invitationToken)).size).toBe(2);
    expect(tokens.every((row) => row.importBatchId === preview.batchId)).toBe(true);

    const activity = await getRecentActivity(owner.userId, weddingId, 5);
    expect(activity[0]).toMatchObject({ action: "guests.imported", metadata: { count: 2, seats: 7 } });
  });

  it("marks duplicates and only imports them when asked", async () => {
    const { owner, weddingId } = await createOwnerWorkspace(userIds);
    await newGuest(owner.userId, weddingId, { guestName: "Ahmad Fauzi", invitationName: "Keluarga Bapak Ahmad", phone: "0812-3456-7890" });

    const first = await previewGuestImport(owner.userId, weddingId, csvFile(csv));
    if (!first.ok) throw new Error("preview failed");
    const batch = await getGuestImportBatchForUser(owner.userId, first.batchId);
    expect(summarizeImport(batch?.rows ?? [])).toMatchObject({ valid: 1, duplicates: 1, invalid: 1 });

    expect(await commitGuestImport(owner.userId, first.batchId, { includeDuplicates: false })).toMatchObject({ ok: true, imported: 1 });
    expect(await getGuestSummary(owner.userId, weddingId)).toMatchObject({ invitations: 2 });

    const second = await previewGuestImport(owner.userId, weddingId, csvFile(csv));
    if (!second.ok) throw new Error("preview failed");
    expect(await commitGuestImport(owner.userId, second.batchId, { includeDuplicates: true })).toMatchObject({ ok: true, imported: 2 });
    // 1 seat (tamu yang sudah ada) + 2 (impor pertama) + 5 + 2 (impor duplikat).
    expect(await getGuestSummary(owner.userId, weddingId)).toMatchObject({ invitations: 4, seats: 10 });
  });

  it("imports an XLSX file", async () => {
    const { owner, weddingId } = await createOwnerWorkspace(userIds);
    const file = await xlsxFile([
      ["Nama", "Nama Undangan", "Kursi", "Grup"],
      ["Ahmad Fauzi", "Keluarga Bapak Ahmad", "5", "Teman"],
      ["Siti Rahma", "", "2", ""],
    ]);
    const preview = await previewGuestImport(owner.userId, weddingId, file);
    if (!preview.ok) throw new Error(`preview failed: ${preview.reason}`);
    expect(await commitGuestImport(owner.userId, preview.batchId, { includeDuplicates: false })).toMatchObject({ ok: true, imported: 2 });
    expect(await getGuestSummary(owner.userId, weddingId)).toMatchObject({ invitations: 2, seats: 7 });
  });

  it("imports each batch only once, even when confirmed twice at the same time", async () => {
    const { owner, weddingId } = await createOwnerWorkspace(userIds);
    const preview = await previewGuestImport(owner.userId, weddingId, csvFile(csv));
    if (!preview.ok) throw new Error("preview failed");

    const [first, second] = await Promise.all([
      commitGuestImport(owner.userId, preview.batchId, { includeDuplicates: false }),
      commitGuestImport(owner.userId, preview.batchId, { includeDuplicates: false }),
    ]);
    expect([first.ok, second.ok].sort()).toEqual([false, true]);
    expect([first, second].find((result) => !result.ok)).toMatchObject({ reason: "already_committed" });
    expect(await getGuestSummary(owner.userId, weddingId)).toMatchObject({ invitations: 2 });
  });

  it("refuses an expired preview", async () => {
    const { owner, weddingId } = await createOwnerWorkspace(userIds);
    const past = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const preview = await previewGuestImport(owner.userId, weddingId, csvFile(csv), past);
    if (!preview.ok) throw new Error("preview failed");

    expect(await getGuestImportBatchForUser(owner.userId, preview.batchId)).toMatchObject({ expired: true });
    expect(await commitGuestImport(owner.userId, preview.batchId, { includeDuplicates: false })).toEqual({ ok: false, reason: "expired" });
    expect(await getGuestSummary(owner.userId, weddingId)).toMatchObject({ invitations: 0 });
  });

  it("reports files that cannot be used", async () => {
    const { owner, weddingId } = await createOwnerWorkspace(userIds);
    expect(await previewGuestImport(owner.userId, weddingId, csvFile("Telepon,Grup\n0812,Teman\n"))).toEqual({
      ok: false,
      reason: "missing_columns",
      missing: ["guestName"],
    });
    expect(await previewGuestImport(owner.userId, weddingId, csvFile("Nama,Kursi\n"))).toEqual({ ok: false, reason: "empty" });
    expect(await previewGuestImport(owner.userId, weddingId, { name: "tamu.txt", type: "text/plain", bytes: Buffer.from("Nama") })).toEqual(
      { ok: false, reason: "unsupported_type" },
    );
  });

  it("refuses a file with more new groups than allowed", async () => {
    const { owner, weddingId } = await createOwnerWorkspace(userIds);
    const rows = Array.from({ length: 31 }, (_, index) => `Tamu ${index},,,Grup Baru ${index},1`).join("\n");
    const preview = await previewGuestImport(owner.userId, weddingId, csvFile(`Nama,Nama Undangan,Telepon,Grup,Kursi\n${rows}\n`));
    if (!preview.ok) throw new Error("preview failed");
    expect(await commitGuestImport(owner.userId, preview.batchId, { includeDuplicates: false })).toEqual({
      ok: false,
      reason: "too_many_new_groups",
      max: 30,
    });
    expect(await getGuestSummary(owner.userId, weddingId)).toMatchObject({ invitations: 0 });
  });
});

describe("guest activity log", () => {
  it("records guest changes for both partners to see", async () => {
    const { owner, weddingId } = await createOwnerWorkspace(userIds);
    const guestId = await newGuest(owner.userId, weddingId, { invitationName: "Keluarga Bapak Ahmad", seatCount: 5 });
    await updateGuest(owner.userId, guestId, guestInput({ invitationName: "Keluarga Bapak Ahmad", seatCount: 6 }));
    await deleteGuest(owner.userId, guestId);

    const activity = await getRecentActivity(owner.userId, weddingId, 5);
    expect(activity.map((entry) => entry.action)).toEqual(["guest.deleted", "guest.updated", "guest.created", "wedding.created"]);
    expect(activity[1]).toMatchObject({ metadata: { name: "Keluarga Bapak Ahmad", seats: 6 } });
  });
});
