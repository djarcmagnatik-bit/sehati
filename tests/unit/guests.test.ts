import { describe, expect, it } from "vitest";
import { DEFAULT_GUEST_FILTERS, guestsHref, parseGuestFilters } from "@/lib/guest-filters";
import {
  buildImportRows,
  detectDelimiter,
  IMPORT_MAX_ROWS,
  markDuplicates,
  parseCsv,
  sanitizeFileName,
  summarizeImport,
  type ImportRow,
} from "@/lib/guest-import";
import { attendanceError, nextInvitationStatus, normalizeAttendance, normalizePhone } from "@/lib/guests";
import { bulkInvitationStatusSchema, guestInputSchema } from "@/lib/validation/guests";

const GROUP_ID = "6f3ec2f1-5b1e-4f1a-9b0a-1f2b3c4d5e6f";

function guestForm(overrides: Record<string, string> = {}) {
  return {
    guestName: "Ahmad Fauzi",
    invitationName: "",
    groupId: "",
    phone: "",
    email: "",
    address: "",
    seatCount: "1",
    invitationStatus: "NOT_SENT",
    rsvpStatus: "PENDING",
    attendingCount: "0",
    notes: "",
    ...overrides,
  };
}

describe("normalizePhone", () => {
  it("converts Indonesian formats to a 62 prefix", () => {
    expect(normalizePhone("0812-3456-7890")).toBe("6281234567890");
    expect(normalizePhone("+62 812 3456 7890")).toBe("6281234567890");
    expect(normalizePhone("81234567890")).toBe("6281234567890");
  });

  it("returns null for empty or out-of-range input", () => {
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone("0812")).toBeNull();
    expect(normalizePhone("0812345678901234567")).toBeNull();
  });
});

describe("attendance rules", () => {
  it("only counts attendance for hadir and mungkin hadir", () => {
    expect(normalizeAttendance("ATTENDING", 3)).toBe(3);
    expect(normalizeAttendance("MAYBE", 2)).toBe(2);
    expect(normalizeAttendance("DECLINED", 4)).toBe(0);
    expect(normalizeAttendance("PENDING", 4)).toBe(0);
  });

  it("rejects an attending count above the seat count", () => {
    expect(attendanceError("ATTENDING", 6, 5)).toMatch(/melebihi 5 kursi/);
    expect(attendanceError("ATTENDING", 5, 5)).toBeNull();
  });

  it("requires at least one person when attending", () => {
    expect(attendanceError("ATTENDING", 0, 5)).toMatch(/minimal 1/);
    expect(attendanceError("MAYBE", 0, 5)).toBeNull();
  });
});

describe("nextInvitationStatus", () => {
  it("keeps an opened invitation when it is re-marked as sent", () => {
    expect(nextInvitationStatus("OPENED", "SENT")).toBe("OPENED");
  });

  it("allows other transitions", () => {
    expect(nextInvitationStatus("OPENED", "FOLLOW_UP")).toBe("FOLLOW_UP");
    expect(nextInvitationStatus("NOT_SENT", "SENT")).toBe("SENT");
  });
});

describe("guestInputSchema", () => {
  it("defaults the invitation name to the guest name", () => {
    const parsed = guestInputSchema.parse(guestForm());
    expect(parsed.invitationName).toBe("Ahmad Fauzi");
    expect(parsed.groupId).toBeNull();
    expect(parsed.seatCount).toBe(1);
  });

  it("keeps a family invitation name and seat count", () => {
    const parsed = guestInputSchema.parse(
      guestForm({ invitationName: "Keluarga Bapak Ahmad", seatCount: "5", groupId: GROUP_ID, rsvpStatus: "ATTENDING", attendingCount: "4" }),
    );
    expect(parsed.invitationName).toBe("Keluarga Bapak Ahmad");
    expect(parsed.seatCount).toBe(5);
    expect(parsed.attendingCount).toBe(4);
    expect(parsed.groupId).toBe(GROUP_ID);
  });

  it("zeroes the attending count when the guest declines", () => {
    const parsed = guestInputSchema.parse(guestForm({ seatCount: "3", rsvpStatus: "DECLINED", attendingCount: "2" }));
    expect(parsed.attendingCount).toBe(0);
  });

  it("rejects attendance above the seat count", () => {
    const result = guestInputSchema.safeParse(guestForm({ seatCount: "2", rsvpStatus: "ATTENDING", attendingCount: "3" }));
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["attendingCount"]);
  });

  it("rejects seat counts outside 1-50 and invalid phones", () => {
    expect(guestInputSchema.safeParse(guestForm({ seatCount: "0" })).success).toBe(false);
    expect(guestInputSchema.safeParse(guestForm({ seatCount: "51" })).success).toBe(false);
    expect(guestInputSchema.safeParse(guestForm({ phone: "bukan-nomor" })).success).toBe(false);
  });

  it("does not accept OPENED as a manual invitation status", () => {
    expect(guestInputSchema.safeParse(guestForm({ invitationStatus: "OPENED" })).success).toBe(false);
  });
});

describe("bulkInvitationStatusSchema", () => {
  it("requires at least one valid id", () => {
    expect(bulkInvitationStatusSchema.safeParse({ status: "SENT", guestIds: [] }).success).toBe(false);
    expect(bulkInvitationStatusSchema.safeParse({ status: "SENT", guestIds: ["nope"] }).success).toBe(false);
    expect(bulkInvitationStatusSchema.safeParse({ status: "SENT", guestIds: [GROUP_ID] }).success).toBe(true);
  });
});

describe("parseCsv", () => {
  it("handles quoted fields, escaped quotes and CRLF", () => {
    const csv = 'Nama,Grup\r\n"Ahmad, Fauzi","Teman ""lama"""\r\nSiti,Keluarga\r\n';
    expect(parseCsv(csv)).toEqual([
      ["Nama", "Grup"],
      ["Ahmad, Fauzi", 'Teman "lama"'],
      ["Siti", "Keluarga"],
    ]);
  });

  it("strips a BOM and detects a semicolon delimiter", () => {
    const bom = String.fromCharCode(0xfeff);
    expect(detectDelimiter("Nama;Grup")).toBe(";");
    expect(parseCsv(`${bom}Nama;Grup\nAhmad;Teman`)).toEqual([
      ["Nama", "Grup"],
      ["Ahmad", "Teman"],
    ]);
  });

  it("ignores delimiters inside quotes when detecting", () => {
    expect(detectDelimiter('"Nama;Lengkap",Grup')).toBe(",");
  });
});

describe("buildImportRows", () => {
  const header = ["Nama", "Nama Undangan", "Telepon", "Grup", "Kursi"];

  it("maps Indonesian and English headers in any order", () => {
    const result = buildImportRows([
      ["Seats", "Guest Name", "WhatsApp"],
      ["5", "Ahmad Fauzi", "0812-3456-7890"],
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows[0]).toMatchObject({ guestName: "Ahmad Fauzi", seatCount: 5, phoneNormalized: "6281234567890" });
  });

  it("defaults the invitation name and seat count", () => {
    const result = buildImportRows([header, ["Siti Rahma", "", "", "", ""]]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows[0]).toMatchObject({ invitationName: "Siti Rahma", seatCount: 1, groupName: null, phone: null });
  });

  it("reports the source line number and skips blank rows", () => {
    const result = buildImportRows([header, ["", "", "", "", ""], ["Ahmad", "Keluarga Bapak Ahmad", "", "Teman", "5"]]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.line).toBe(3);
  });

  it("collects per-row errors instead of failing the whole file", () => {
    const result = buildImportRows([header, ["Ahmad", "", "08", "", "99"]]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows[0]?.errors).toEqual(["Nomor telepon tidak valid", "Jumlah kursi harus angka 1–50"]);
  });

  it("requires a name column", () => {
    expect(buildImportRows([["Telepon", "Grup"], ["0812", "Teman"]])).toEqual({
      ok: false,
      reason: "missing_columns",
      missing: ["guestName"],
    });
  });

  it("rejects an empty file and one above the row limit", () => {
    expect(buildImportRows([])).toEqual({ ok: false, reason: "empty" });
    expect(buildImportRows([header])).toEqual({ ok: false, reason: "empty" });
    const many = [header, ...Array.from({ length: IMPORT_MAX_ROWS + 1 }, (_, index) => [`Tamu ${index}`])];
    expect(buildImportRows(many)).toEqual({ ok: false, reason: "too_many_rows", max: IMPORT_MAX_ROWS });
  });

  it("reads numeric and date cells from a spreadsheet", () => {
    const result = buildImportRows([header, ["Ahmad", "Keluarga Ahmad", 81234567890, "Teman", 3]]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows[0]).toMatchObject({ seatCount: 3, phoneNormalized: "6281234567890" });
  });
});

describe("markDuplicates", () => {
  function rows(...input: Array<Partial<ImportRow>>): ImportRow[] {
    return input.map((row, index) => ({
      line: index + 2,
      guestName: "Tamu",
      invitationName: "Tamu",
      phone: null,
      phoneNormalized: null,
      groupName: null,
      seatCount: 1,
      errors: [],
      duplicate: null,
      ...row,
    }));
  }

  const empty = { phones: new Set<string>(), invitationNames: new Set<string>() };

  it("flags a phone already in the guest list as existing", () => {
    const marked = markDuplicates(rows({ phoneNormalized: "6281234567890" }), {
      phones: new Set(["6281234567890"]),
      invitationNames: new Set<string>(),
    });
    expect(marked[0]?.duplicate).toBe("existing");
  });

  it("flags a repeated phone inside the file", () => {
    const marked = markDuplicates(rows({ phoneNormalized: "628111" }, { phoneNormalized: "628111" }), empty);
    expect(marked[0]?.duplicate).toBeNull();
    expect(marked[1]?.duplicate).toBe("file");
  });

  it("falls back to the invitation name when there is no phone", () => {
    const marked = markDuplicates(rows({ invitationName: "Keluarga Bapak Ahmad" }, { invitationName: "keluarga  bapak ahmad" }), empty);
    expect(marked[1]?.duplicate).toBe("file");
  });

  it("does not flag invalid rows", () => {
    const marked = markDuplicates(rows({ phoneNormalized: "628111", errors: ["Nama wajib diisi"] }), {
      phones: new Set(["628111"]),
      invitationNames: new Set<string>(),
    });
    expect(marked[0]?.duplicate).toBeNull();
  });

  it("counts invitations and seats separately in the summary", () => {
    const marked = markDuplicates(
      rows({ seatCount: 5 }, { invitationName: "Lain", seatCount: 2, errors: ["Nama wajib diisi"] }, { seatCount: 3 }),
      empty,
    );
    expect(summarizeImport(marked)).toEqual({ total: 3, valid: 1, invalid: 1, duplicates: 1, seats: 5 });
    expect(summarizeImport(marked, true)).toEqual({ total: 3, valid: 2, invalid: 1, duplicates: 1, seats: 8 });
  });
});

describe("sanitizeFileName", () => {
  it("keeps only the base name", () => {
    expect(sanitizeFileName("C:/Users/tamu/daftar tamu.xlsx")).toBe("daftar tamu.xlsx");
    expect(sanitizeFileName("../../etc/passwd")).toBe("passwd");
  });

  it("removes control characters and falls back to a default", () => {
    expect(sanitizeFileName(`tamu${String.fromCharCode(10)}.csv`)).toBe("tamu.csv");
    expect(sanitizeFileName("")).toBe("file");
    expect(sanitizeFileName("a".repeat(200))).toHaveLength(120);
  });
});

describe("guest filters", () => {
  it("falls back to defaults for unknown values", () => {
    expect(parseGuestFilters({ rsvp: "NOPE", invitation: "NOPE", group: "abc", sort: "x", page: "0" })).toEqual(DEFAULT_GUEST_FILTERS);
  });

  it("parses known values", () => {
    expect(parseGuestFilters({ rsvp: "ATTENDING", invitation: "SENT", group: GROUP_ID, q: "  ahmad ", sort: "seats", page: "3" })).toEqual({
      rsvp: "ATTENDING",
      invitation: "SENT",
      group: GROUP_ID,
      q: "ahmad",
      sort: "seats",
      page: 3,
    });
    expect(parseGuestFilters({ group: "none" }).group).toBe("none");
  });

  it("builds hrefs that omit defaults", () => {
    expect(guestsHref(DEFAULT_GUEST_FILTERS)).toBe("/guests");
    expect(guestsHref(DEFAULT_GUEST_FILTERS, { rsvp: "ATTENDING", page: 2 })).toBe("/guests?rsvp=ATTENDING&page=2");
    expect(guestsHref({ ...DEFAULT_GUEST_FILTERS, page: 4 }, { rsvp: "PENDING" })).toBe("/guests?rsvp=PENDING&page=4");
  });
});
