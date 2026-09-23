import { describe, expect, it } from "vitest";
import { EVENT_TYPES, MARRIAGE_PROCESSES } from "@/server/seed/reference-data";
import { TASK_CATEGORIES, TASK_TEMPLATES } from "@/server/seed/task-templates";

describe("default checklist seed data", () => {
  it("ships a substantial default checklist (PRD: ~90+)", () => {
    expect(TASK_TEMPLATES.length).toBeGreaterThanOrEqual(90);
  });

  it("uses unique codes", () => {
    const codes = TASK_TEMPLATES.map((template) => template.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(new Set(TASK_CATEGORIES.map((c) => c.code)).size).toBe(TASK_CATEGORIES.length);
  });

  it("only references known categories, event types and marriage processes", () => {
    const categories = new Set(TASK_CATEGORIES.map((c) => c.code));
    const eventTypes = new Set(EVENT_TYPES.map((e) => e.code));
    const processes = new Set(MARRIAGE_PROCESSES.map((m) => m.code));
    for (const template of TASK_TEMPLATES) {
      expect(categories.has(template.categoryCode), template.code).toBe(true);
      for (const code of template.eventTypeCodes) expect(eventTypes.has(code), `${template.code}:${code}`).toBe(true);
      for (const code of template.marriageProcessCodes) expect(processes.has(code), `${template.code}:${code}`).toBe(true);
    }
  });

  it("fits database column limits and sensible offsets", () => {
    for (const template of TASK_TEMPLATES) {
      expect(template.title.length, template.code).toBeLessThanOrEqual(160);
      expect((template.description ?? "").length, template.code).toBeLessThanOrEqual(2000);
      expect(Number.isInteger(template.deadlineOffsetDays), template.code).toBe(true);
      expect(template.deadlineOffsetDays, template.code).toBeGreaterThanOrEqual(-400);
      expect(template.deadlineOffsetDays, template.code).toBeLessThanOrEqual(90);
    }
  });

  it("gives every wedding type a meaningful checklist", () => {
    for (const eventType of EVENT_TYPES) {
      for (const process of MARRIAGE_PROCESSES) {
        const applicable = TASK_TEMPLATES.filter(
          (t) =>
            (t.eventTypeCodes.length === 0 || t.eventTypeCodes.includes(eventType.code)) &&
            (t.marriageProcessCodes.length === 0 || t.marriageProcessCodes.includes(process.code)),
        );
        expect(applicable.length, `${eventType.code}/${process.code}`).toBeGreaterThanOrEqual(25);
      }
    }
  });
});

describe("checklist order and coverage", () => {
  const offsets = new Map(TASK_TEMPLATES.map((template) => [template.code, template.deadlineOffsetDays]));
  const before = (earlier: string, later: string) => {
    expect(offsets.has(earlier), earlier).toBe(true);
    expect(offsets.has(later), later).toBe(true);
    expect(offsets.get(earlier)!, `${earlier} sebelum ${later}`).toBeLessThan(offsets.get(later)!);
  };

  it("researches before booking, and books before paying the rest", () => {
    for (const [research, book] of [
      ["VENUE_RESEARCH", "VENUE_BOOK"],
      ["CATERING_RESEARCH", "CATERING_BOOK"],
      ["DECOR_RESEARCH", "DECOR_BOOK"],
      ["DOC_RESEARCH", "DOC_BOOK"],
      ["MUA_RESEARCH", "MUA_BOOK"],
      ["ENT_MUSIC_RESEARCH", "ENT_MUSIC_BOOK"],
    ] as const) {
      before(research, book);
    }
    for (const [book, payment] of [
      ["VENUE_BOOK", "VENUE_FINAL_PAYMENT"],
      ["CATERING_BOOK", "CATERING_FINAL_PAYMENT"],
      ["DECOR_BOOK", "DECOR_FINAL_PAYMENT"],
      ["DOC_BOOK", "DOC_FINAL_PAYMENT"],
    ] as const) {
      before(book, payment);
    }
  });

  it("keeps the Indonesian sequence: budget, guests, invitations, paperwork", () => {
    before("PLAN_CONCEPT", "FIN_SET_BUDGET");
    before("FIN_SET_BUDGET", "FIN_ALLOCATE");
    before("GUEST_LIST_DRAFT", "GUEST_LIST_FINAL");
    before("GUEST_LIST_FINAL", "INV_SEND");
    before("INV_DESIGN", "INV_DIGITAL");
    before("INV_DIGITAL", "INV_SEND");
    before("DOC_PREWEDDING_SHOOT", "INV_DIGITAL"); // the invitation uses those photos
    before("CLOTH_FIRST_FITTING", "CLOTH_FINAL_FITTING");
    before("SES_LIST", "SES_BUY");
    before("SES_BUY", "SES_PACK");
    // Paperwork: documents, then registration, well before the day.
    before("ADM_KUA_DOCUMENTS", "ADM_VILLAGE_LETTER");
    before("ADM_VILLAGE_LETTER", "ADM_KUA_REGISTER");
    before("ADM_CIVIL_DOCUMENTS", "ADM_CIVIL_PROCEDURE");
  });

  it("registers at the KUA at least ten working days before the akad", () => {
    // PMA 20/2019: a later registration needs a dispensation from the kecamatan.
    expect(offsets.get("ADM_KUA_REGISTER")!).toBeLessThanOrEqual(-14);
  });

  it("records the civil marriage after the ceremony, inside the 60-day window", () => {
    const civil = offsets.get("POST_CIVIL_RECORD")!;
    expect(civil).toBeGreaterThan(0);
    expect(civil).toBeLessThanOrEqual(60);
  });

  it("puts every post-wedding task after the wedding, and nothing else", () => {
    for (const template of TASK_TEMPLATES) {
      if (template.categoryCode === "POST_WEDDING") expect(template.deadlineOffsetDays, template.code).toBeGreaterThan(0);
      else expect(template.deadlineOffsetDays, template.code).toBeLessThanOrEqual(0);
    }
  });

  it("uses every category it ships", () => {
    const used = new Set(TASK_TEMPLATES.map((template) => template.categoryCode));
    for (const category of TASK_CATEGORIES) {
      if (category.code === "OTHER") continue; // kept for the couple's own tasks
      expect(used.has(category.code), category.code).toBe(true);
    }
  });
});
