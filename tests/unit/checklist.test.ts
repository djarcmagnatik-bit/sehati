import { describe, expect, it } from "vitest";
import {
  classifyDue,
  computeChecklistProgress,
  computeTemplateDueDate,
  templateAppliesTo,
} from "@/lib/checklist";
import { checklistHref, DEFAULT_CHECKLIST_FILTERS, parseChecklistFilters } from "@/lib/checklist-filters";
import { addDaysIso } from "@/lib/dates";

describe("addDaysIso", () => {
  it("adds and subtracts calendar days across months and leap years", () => {
    expect(addDaysIso("2027-12-20", -180)).toBe("2027-06-23");
    expect(addDaysIso("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDaysIso("2027-12-31", 1)).toBe("2028-01-01");
  });
});

describe("computeTemplateDueDate", () => {
  const wedding = "2027-12-20";

  it("uses wedding date + offset when that is still ahead", () => {
    expect(computeTemplateDueDate(wedding, -180, "2027-01-01")).toBe("2027-06-23");
    expect(computeTemplateDueDate(wedding, 0, "2027-01-01")).toBe(wedding);
  });

  it("clamps already-passed preparation deadlines to today", () => {
    expect(computeTemplateDueDate(wedding, -180, "2027-11-01")).toBe("2027-11-01");
    expect(computeTemplateDueDate(wedding, -7, "2027-11-01")).toBe("2027-12-13");
  });

  it("never clamps after-wedding tasks", () => {
    expect(computeTemplateDueDate(wedding, 7, "2027-12-25")).toBe("2027-12-27");
  });

  it("does not clamp past the wedding date when the wedding itself has passed", () => {
    expect(computeTemplateDueDate(wedding, -30, "2027-12-25")).toBe(wedding);
  });
});

describe("templateAppliesTo", () => {
  const wedding = { eventTypeId: "event-a", marriageProcessId: "process-kua" };

  it("treats empty links as applying to everything", () => {
    expect(templateAppliesTo({ eventTypeIds: [], marriageProcessIds: [] }, wedding)).toBe(true);
    expect(templateAppliesTo({ eventTypeIds: [], marriageProcessIds: [] }, { eventTypeId: null, marriageProcessId: null })).toBe(true);
  });

  it("requires both dimensions to match when restricted", () => {
    expect(templateAppliesTo({ eventTypeIds: ["event-a"], marriageProcessIds: ["process-kua"] }, wedding)).toBe(true);
    expect(templateAppliesTo({ eventTypeIds: ["event-b"], marriageProcessIds: [] }, wedding)).toBe(false);
    expect(templateAppliesTo({ eventTypeIds: [], marriageProcessIds: ["process-civil"] }, wedding)).toBe(false);
    expect(templateAppliesTo({ eventTypeIds: ["event-a"], marriageProcessIds: [] }, { eventTypeId: null, marriageProcessId: null })).toBe(false);
  });
});

describe("computeChecklistProgress", () => {
  it("returns 0% for an empty checklist", () => {
    expect(computeChecklistProgress({})).toEqual({ total: 0, completed: 0, percent: 0 });
  });

  it("excludes cancelled tasks from the total", () => {
    expect(computeChecklistProgress({ TODO: 1, IN_PROGRESS: 1, COMPLETED: 1, CANCELLED: 5 })).toEqual({
      total: 3,
      completed: 1,
      percent: 33,
    });
  });

  it("rounds down so 100% means everything is done", () => {
    expect(computeChecklistProgress({ TODO: 1, COMPLETED: 199 }).percent).toBe(99);
    expect(computeChecklistProgress({ COMPLETED: 12 }).percent).toBe(100);
  });
});

describe("classifyDue", () => {
  const today = "2027-06-01";

  it("classifies open tasks by deadline", () => {
    expect(classifyDue("2027-05-29", "TODO", today)).toEqual({ kind: "overdue", days: 3 });
    expect(classifyDue(today, "IN_PROGRESS", today)).toEqual({ kind: "today" });
    expect(classifyDue("2027-06-08", "TODO", today)).toEqual({ kind: "soon", days: 7 });
    expect(classifyDue("2027-06-09", "TODO", today)).toEqual({ kind: "later", days: 8 });
    expect(classifyDue(null, "TODO", today)).toEqual({ kind: "none" });
  });

  it("never marks completed or cancelled tasks as overdue", () => {
    expect(classifyDue("2020-01-01", "COMPLETED", today)).toEqual({ kind: "closed" });
    expect(classifyDue("2020-01-01", "CANCELLED", today)).toEqual({ kind: "closed" });
  });
});

describe("checklist filters", () => {
  it("falls back to defaults for missing or invalid params", () => {
    expect(parseChecklistFilters({})).toEqual(DEFAULT_CHECKLIST_FILTERS);
    expect(parseChecklistFilters({ view: "DROP TABLE", sort: "x", category: "nope", page: "-3", q: "  " })).toEqual(
      DEFAULT_CHECKLIST_FILTERS,
    );
  });

  it("parses valid params and caps the search length", () => {
    const category = "0f8fad5b-d9cb-469f-a165-70867728950e";
    const filters = parseChecklistFilters({ view: "overdue", sort: "priority", category, page: "2", q: "a".repeat(150) });
    expect(filters).toMatchObject({ view: "overdue", sort: "priority", categoryId: category, page: 2 });
    expect(filters.q).toHaveLength(100);
  });

  it("builds links that omit defaults and round-trip through the parser", () => {
    expect(checklistHref(DEFAULT_CHECKLIST_FILTERS)).toBe("/checklist");
    const href = checklistHref(DEFAULT_CHECKLIST_FILTERS, { view: "COMPLETED", q: "KUA & venue", page: 3 });
    const params = Object.fromEntries(new URL(href, "http://x").searchParams);
    expect(parseChecklistFilters(params)).toMatchObject({ view: "COMPLETED", q: "KUA & venue", page: 3 });
  });
});
