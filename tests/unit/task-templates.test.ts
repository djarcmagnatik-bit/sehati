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
