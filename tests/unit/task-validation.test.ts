import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { fieldErrorsFromZod } from "@/lib/validation/errors";
import { makeWeddingDateChangeSchema, taskInputSchema, taskUpdateSchema } from "@/lib/validation/task";

const valid = {
  title: "Survei toko cincin",
  description: "",
  categoryId: randomUUID(),
  dueDate: "",
  priority: "HIGH",
  assigneeMemberId: "",
};

function errorsOf(result: { success: boolean; error?: Parameters<typeof fieldErrorsFromZod>[0] }) {
  if (result.success || !result.error) throw new Error("expected validation failure");
  return fieldErrorsFromZod(result.error);
}

describe("taskInputSchema", () => {
  it("normalizes optional fields to null", () => {
    expect(taskInputSchema.parse({ ...valid, title: "  Survei toko cincin " })).toEqual({
      title: "Survei toko cincin",
      description: null,
      categoryId: valid.categoryId,
      dueDate: null,
      priority: "HIGH",
      assigneeMemberId: null,
    });
  });

  it("validates each field", () => {
    const errors = errorsOf(
      taskInputSchema.safeParse({
        title: " ",
        categoryId: "",
        dueDate: "2027-02-30",
        priority: "SUPER",
        assigneeMemberId: "someone",
      }),
    );
    expect(errors.title).toEqual(["Judul tugas wajib diisi"]);
    expect(errors.categoryId).toEqual(["Pilih kategori"]);
    expect(errors.dueDate).toEqual(["Tanggal tenggat tidak valid"]);
    expect(errors.priority).toEqual(["Pilih prioritas"]);
    expect(errors.assigneeMemberId).toEqual(["Penanggung jawab tidak valid"]);
  });

  it("allows past deadlines (they simply show as overdue)", () => {
    expect(taskInputSchema.safeParse({ ...valid, dueDate: "2020-01-01" }).success).toBe(true);
  });
});

describe("taskUpdateSchema", () => {
  it("requires a known status", () => {
    expect(taskUpdateSchema.safeParse({ ...valid, status: "CANCELLED" }).success).toBe(true);
    expect(errorsOf(taskUpdateSchema.safeParse({ ...valid, status: "DONE" })).status).toEqual(["Pilih status"]);
  });
});

describe("makeWeddingDateChangeSchema", () => {
  const schema = makeWeddingDateChangeSchema("2027-01-01");
  const weddingId = randomUUID();

  it("requires an explicit recalculation choice", () => {
    expect(errorsOf(schema.safeParse({ weddingId, weddingDate: "2027-12-20", recalculate: "" })).recalculate).toEqual([
      "Pilih apakah tenggat checklist dihitung ulang",
    ]);
    expect(schema.safeParse({ weddingId, weddingDate: "2027-12-20", recalculate: "no" }).success).toBe(true);
  });

  it("rejects past or invalid dates", () => {
    expect(errorsOf(schema.safeParse({ weddingId, weddingDate: "2026-12-31", recalculate: "yes" })).weddingDate).toEqual([
      "Tanggal pernikahan tidak boleh di masa lalu",
    ]);
    expect(errorsOf(schema.safeParse({ weddingId, weddingDate: "", recalculate: "yes" })).weddingDate?.[0]).toBe(
      "Tanggal pernikahan wajib diisi",
    );
  });
});
