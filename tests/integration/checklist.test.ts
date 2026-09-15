import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeTemplateDueDate, templateAppliesTo } from "@/lib/checklist";
import { DEFAULT_CHECKLIST_FILTERS } from "@/lib/checklist-filters";
import { addDaysIso, dbDateToIso, todayIsoInTimeZone } from "@/lib/dates";
import { makeOnboardingSchema } from "@/lib/validation/onboarding";
import type { TaskInput, TaskUpdateInput } from "@/lib/validation/task";
import { WeddingAccessError } from "@/server/authz/wedding-access";
import {
  createTask,
  deleteTask,
  generateChecklistIfMissing,
  getChecklistSummary,
  getTaskForUser,
  getUpcomingTasks,
  listTasks,
  setTaskCompleted,
  updateTask,
} from "@/server/checklist/task-service";
import { getDb } from "@/server/db";
import { changeWeddingDate, countRecalculableTasks, createWeddingForUser } from "@/server/wedding/wedding-service";
import { createTestUser, deleteUsers, ensureReferenceData } from "../support/integration-helpers";

const userIds: string[] = [];
const testTemplateIds: string[] = [];
const testCategoryIds: string[] = [];
const today = todayIsoInTimeZone(new Date());

type CodeMap = Map<string, string>;
let eventTypes: CodeMap;
let marriageProcesses: CodeMap;
let categories: CodeMap;

function idOf(map: CodeMap, code: string): string {
  const id = map.get(code);
  if (!id) throw new Error(`missing reference code ${code}`);
  return id;
}

beforeAll(async () => {
  await ensureReferenceData();
  const db = getDb();
  const [e, m, c] = await Promise.all([
    db.eventType.findMany({ select: { id: true, code: true } }),
    db.marriageProcess.findMany({ select: { id: true, code: true } }),
    db.taskCategory.findMany({ select: { id: true, code: true } }),
  ]);
  eventTypes = new Map(e.map((row) => [row.code, row.id]));
  marriageProcesses = new Map(m.map((row) => [row.code, row.id]));
  categories = new Map(c.map((row) => [row.code, row.id]));
});

afterAll(async () => {
  await deleteUsers(userIds);
  const db = getDb();
  await db.taskTemplate.deleteMany({ where: { id: { in: testTemplateIds } } });
  await db.taskCategory.deleteMany({ where: { id: { in: testCategoryIds } } });
});

async function createWorkspace(
  options: { eventType?: string; marriageProcess?: string; weddingInDays?: number; name?: string } = {},
) {
  const owner = await createTestUser(userIds, options.name ?? "Owner");
  const weddingDate = addDaysIso(today, options.weddingInDays ?? 460);
  const eventTypeId = idOf(eventTypes, options.eventType ?? "AKAD_RECEPTION");
  const marriageProcessId = idOf(marriageProcesses, options.marriageProcess ?? "KUA");
  const data = makeOnboardingSchema(today).parse({
    displayName: "Fajar",
    partnerName: "Putri",
    brideName: "Putri",
    groomName: "Fajar",
    coupleDisplayFormat: "BRIDE_GROOM",
    weddingDate,
    eventTypeId,
    marriageProcessId,
    targetBudget: "",
    currency: "IDR",
  });
  const result = await createWeddingForUser(owner.userId, data);
  if (!result.ok) throw new Error(`workspace creation failed: ${result.reason}`);
  const member = await getDb().weddingMember.findFirstOrThrow({
    where: { weddingId: result.weddingId, userId: owner.userId },
    select: { id: true },
  });
  return { owner, weddingId: result.weddingId, weddingDate, eventTypeId, marriageProcessId, ownerMemberId: member.id };
}

async function tasksByTemplateCode(weddingId: string) {
  const tasks = await getDb().task.findMany({
    where: { weddingId },
    select: {
      id: true,
      title: true,
      dueDate: true,
      status: true,
      source: true,
      templateOffsetDays: true,
      dueDateManuallySet: true,
      template: { select: { code: true } },
    },
  });
  return new Map(tasks.filter((t) => t.template).map((t) => [t.template!.code, t]));
}

function customInput(overrides: Partial<TaskInput> = {}): TaskInput {
  return {
    title: "Tugas custom",
    description: null,
    categoryId: idOf(categories, "OTHER"),
    dueDate: null,
    priority: "MEDIUM",
    assigneeMemberId: null,
    ...overrides,
  };
}

function updateInput(overrides: Partial<TaskUpdateInput> = {}): TaskUpdateInput {
  return { ...customInput(), status: "TODO", ...overrides };
}

describe("checklist generation", () => {
  it("generates exactly the applicable active templates with computed deadlines", async () => {
    const { weddingId, weddingDate, eventTypeId, marriageProcessId } = await createWorkspace();
    const db = getDb();

    const templates = await db.taskTemplate.findMany({
      where: { isActive: true },
      select: {
        id: true,
        deadlineOffsetDays: true,
        eventTypes: { select: { eventTypeId: true } },
        marriageProcesses: { select: { marriageProcessId: true } },
      },
    });
    const applicable = templates.filter((t) =>
      templateAppliesTo(
        {
          eventTypeIds: t.eventTypes.map((l) => l.eventTypeId),
          marriageProcessIds: t.marriageProcesses.map((l) => l.marriageProcessId),
        },
        { eventTypeId, marriageProcessId },
      ),
    );
    const offsetByTemplate = new Map(applicable.map((t) => [t.id, t.deadlineOffsetDays]));

    const tasks = await db.task.findMany({ where: { weddingId } });
    expect(applicable.length).toBeGreaterThan(50);
    expect(tasks).toHaveLength(applicable.length);

    for (const task of tasks) {
      const offset = offsetByTemplate.get(task.templateId ?? "");
      expect(offset).toBeDefined();
      expect(task.source).toBe("TEMPLATE");
      expect(task.status).toBe("TODO");
      expect(task.dueDateManuallySet).toBe(false);
      expect(task.templateOffsetDays).toBe(offset);
      expect(dbDateToIso(task.dueDate!)).toBe(computeTemplateDueDate(weddingDate, offset!, today));
    }

    const wedding = await db.wedding.findUniqueOrThrow({ where: { id: weddingId } });
    expect(wedding.checklistGeneratedAt).toBeInstanceOf(Date);
  });

  it("tailors the checklist to event type and marriage process", async () => {
    const kua = await tasksByTemplateCode((await createWorkspace({ eventType: "AKAD_RECEPTION", marriageProcess: "KUA" })).weddingId);
    expect(kua.has("ADM_KUA_REGISTER")).toBe(true);
    expect(kua.has("VENUE_BOOK")).toBe(true);
    expect(kua.has("CER_RELIGIOUS_SCHEDULE")).toBe(false);
    expect(kua.has("ADM_CIVIL_REGISTER")).toBe(false);
    expect(kua.has("CER_ADAT_CONSULT")).toBe(false);
    expect(kua.has("CER_ENGAGEMENT_VISIT")).toBe(false);

    const civil = await tasksByTemplateCode((await createWorkspace({ eventType: "RECEPTION_ONLY", marriageProcess: "CIVIL" })).weddingId);
    expect(civil.has("ADM_CIVIL_REGISTER")).toBe(true);
    expect(civil.has("VENUE_BOOK")).toBe(true);
    expect(civil.has("ADM_KUA_REGISTER")).toBe(false);
    expect(civil.has("CER_LOCATION")).toBe(false);
    expect(civil.has("DECOR_CEREMONY_AREA")).toBe(false);
  });

  it("skips inactive templates and honours template links", async () => {
    const db = getDb();
    const inactive = await db.taskTemplate.create({
      data: {
        code: `TEST_INACTIVE_${randomUUID()}`,
        title: "Template nonaktif (test)",
        categoryId: idOf(categories, "OTHER"),
        deadlineOffsetDays: -10,
        isActive: false,
      },
    });
    const civilOnly = await db.taskTemplate.create({
      data: {
        code: `TEST_CIVIL_${randomUUID()}`,
        title: "Khusus pencatatan sipil (test)",
        categoryId: idOf(categories, "OTHER"),
        deadlineOffsetDays: -10,
        marriageProcesses: { create: [{ marriageProcessId: idOf(marriageProcesses, "CIVIL") }] },
      },
    });
    testTemplateIds.push(inactive.id, civilOnly.id);

    const templateIdsOf = async (weddingId: string) =>
      new Set((await db.task.findMany({ where: { weddingId }, select: { templateId: true } })).map((t) => t.templateId));

    const kua = await templateIdsOf((await createWorkspace({ marriageProcess: "KUA" })).weddingId);
    const civil = await templateIdsOf((await createWorkspace({ marriageProcess: "CIVIL" })).weddingId);

    expect(kua.has(inactive.id)).toBe(false);
    expect(kua.has(civilOnly.id)).toBe(false);
    expect(civil.has(inactive.id)).toBe(false);
    expect(civil.has(civilOnly.id)).toBe(true);
  });

  it("puts already-passed preparation deadlines on today when starting late", async () => {
    const { owner, weddingId, weddingDate } = await createWorkspace({ weddingInDays: 30 });
    const tasks = await tasksByTemplateCode(weddingId);

    expect(dbDateToIso(tasks.get("VENUE_BOOK")!.dueDate!)).toBe(today);
    expect(dbDateToIso(tasks.get("PLAN_VENDOR_CONFIRM")!.dueDate!)).toBe(addDaysIso(weddingDate, -7));
    expect(dbDateToIso(tasks.get("POST_THANK_YOU")!.dueDate!)).toBe(addDaysIso(weddingDate, 7));

    const summary = await getChecklistSummary(owner.userId, weddingId, today);
    expect(summary.overdue).toBe(0);
    expect(summary.dueToday).toBeGreaterThan(0);
  });

  it("generates a missing checklist exactly once, even with concurrent requests", async () => {
    const { owner, weddingId } = await createWorkspace();
    const db = getDb();
    const expected = await db.task.count({ where: { weddingId } });

    // Simulate a workspace created before checklist generation existed.
    await db.task.deleteMany({ where: { weddingId } });
    await db.wedding.update({ where: { id: weddingId }, data: { checklistGeneratedAt: null } });

    const results = await Promise.all([
      generateChecklistIfMissing(owner.userId, weddingId),
      generateChecklistIfMissing(owner.userId, weddingId),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => r.ok)).toEqual({ ok: true, created: expected });
    expect(await db.task.count({ where: { weddingId } })).toBe(expected);

    expect(await generateChecklistIfMissing(owner.userId, weddingId)).toEqual({ ok: false, reason: "already_generated" });
  });
});

describe("task authorization", () => {
  it("blocks outsiders from every task operation (IDOR)", async () => {
    const { weddingId } = await createWorkspace({ name: "Owner" });
    const outsider = await createTestUser(userIds, "Outsider");
    const db = getDb();
    const task = await db.task.findFirstOrThrow({ where: { weddingId } });

    expect(await getTaskForUser(outsider.userId, task.id)).toBeNull();
    expect(await getTaskForUser(outsider.userId, "not-a-uuid")).toBeNull();
    await expect(listTasks(outsider.userId, weddingId, DEFAULT_CHECKLIST_FILTERS, today)).rejects.toBeInstanceOf(WeddingAccessError);
    await expect(getChecklistSummary(outsider.userId, weddingId, today)).rejects.toBeInstanceOf(WeddingAccessError);
    await expect(getUpcomingTasks(outsider.userId, weddingId)).rejects.toBeInstanceOf(WeddingAccessError);
    await expect(createTask(outsider.userId, weddingId, customInput())).rejects.toBeInstanceOf(WeddingAccessError);
    await expect(updateTask(outsider.userId, task.id, updateInput({ title: "diretas" }))).rejects.toBeInstanceOf(WeddingAccessError);
    await expect(setTaskCompleted(outsider.userId, task.id, true)).rejects.toBeInstanceOf(WeddingAccessError);
    await expect(deleteTask(outsider.userId, task.id)).rejects.toBeInstanceOf(WeddingAccessError);
    await expect(generateChecklistIfMissing(outsider.userId, weddingId)).rejects.toBeInstanceOf(WeddingAccessError);
    await expect(changeWeddingDate(outsider.userId, weddingId, addDaysIso(today, 100), true)).rejects.toBeInstanceOf(WeddingAccessError);

    const unchanged = await db.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(unchanged.title).toBe(task.title);
    expect(unchanged.status).toBe("TODO");
  });

  it("rejects assignees from another workspace and inactive categories", async () => {
    const a = await createWorkspace({ name: "Alice" });
    const b = await createWorkspace({ name: "Bob" });
    const db = getDb();
    const inactiveCategory = await db.taskCategory.create({
      data: { code: `TEST_INACTIVE_${randomUUID()}`, name: "Nonaktif (test)", isActive: false },
    });
    testCategoryIds.push(inactiveCategory.id);

    expect(await createTask(a.owner.userId, a.weddingId, customInput({ assigneeMemberId: b.ownerMemberId }))).toEqual({
      ok: false,
      reason: "invalid_assignee",
    });
    expect(await createTask(a.owner.userId, a.weddingId, customInput({ categoryId: inactiveCategory.id }))).toEqual({
      ok: false,
      reason: "invalid_category",
    });
    expect(await createTask(a.owner.userId, a.weddingId, customInput({ categoryId: randomUUID() }))).toEqual({
      ok: false,
      reason: "invalid_category",
    });

    const created = await createTask(a.owner.userId, a.weddingId, customInput({ assigneeMemberId: a.ownerMemberId }));
    expect(created.ok).toBe(true);
  });

  it("lets a partner member work on the same checklist", async () => {
    const { owner, weddingId } = await createWorkspace({ name: "Owner" });
    const partner = await createTestUser(userIds, "Partner");
    const db = getDb();
    await db.weddingMember.create({ data: { weddingId, userId: partner.userId, role: "PARTNER", displayName: "Putri" } });

    const task = await db.task.findFirstOrThrow({ where: { weddingId } });
    await setTaskCompleted(partner.userId, task.id, true);

    const ownerSummary = await getChecklistSummary(owner.userId, weddingId, today);
    expect(ownerSummary.completed).toBe(1);
    const partnerList = await listTasks(partner.userId, weddingId, { ...DEFAULT_CHECKLIST_FILTERS, view: "all" }, today);
    expect(partnerList.total).toBe(ownerSummary.total);
  });
});

describe("task lifecycle", () => {
  it("creates, completes, reopens, updates and deletes a custom task", async () => {
    const { owner, weddingId, ownerMemberId } = await createWorkspace();
    const db = getDb();
    const dueDate = addDaysIso(today, 20);

    const created = await createTask(
      owner.userId,
      weddingId,
      customInput({ title: "Survei cincin", dueDate, priority: "HIGH", assigneeMemberId: ownerMemberId }),
    );
    if (!created.ok) throw new Error("create failed");

    let task = await db.task.findUniqueOrThrow({ where: { id: created.taskId } });
    expect(task).toMatchObject({ source: "CUSTOM", status: "TODO", priority: "HIGH", dueDateManuallySet: true, createdById: owner.userId });
    expect(dbDateToIso(task.dueDate!)).toBe(dueDate);

    const completedAt = new Date("2027-01-02T03:04:05Z");
    await setTaskCompleted(owner.userId, task.id, true, completedAt);
    task = await db.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(task.status).toBe("COMPLETED");
    expect(task.completedAt?.toISOString()).toBe(completedAt.toISOString());

    // Completing again keeps the original completion time.
    await setTaskCompleted(owner.userId, task.id, true, new Date());
    expect((await db.task.findUniqueOrThrow({ where: { id: task.id } })).completedAt?.toISOString()).toBe(completedAt.toISOString());

    await setTaskCompleted(owner.userId, task.id, false);
    task = await db.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(task.status).toBe("TODO");
    expect(task.completedAt).toBeNull();

    const updated = await updateTask(
      owner.userId,
      task.id,
      updateInput({ title: "Pesan cincin", categoryId: idOf(categories, "CLOTHING"), status: "COMPLETED", dueDate }),
    );
    expect(updated.ok).toBe(true);
    task = await db.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(task).toMatchObject({ title: "Pesan cincin", status: "COMPLETED", assigneeMemberId: null });
    expect(task.completedAt).toBeInstanceOf(Date);

    expect(await deleteTask(owner.userId, task.id)).toEqual({ ok: true });
    expect(await db.task.findUnique({ where: { id: task.id } })).toBeNull();
  });

  it("does not allow deleting template tasks", async () => {
    const { owner, weddingId } = await createWorkspace();
    const task = await getDb().task.findFirstOrThrow({ where: { weddingId, source: "TEMPLATE" } });
    expect(await deleteTask(owner.userId, task.id)).toEqual({ ok: false, reason: "template_task" });
    expect(await getDb().task.findUnique({ where: { id: task.id } })).not.toBeNull();
  });

  it("marks a template deadline as manual only when the deadline actually changes", async () => {
    const { owner, weddingId } = await createWorkspace();
    const db = getDb();
    const task = await db.task.findFirstOrThrow({ where: { weddingId, source: "TEMPLATE" } });
    const base = updateInput({
      title: `${task.title} (catatan)`,
      categoryId: task.categoryId,
      priority: task.priority,
      dueDate: dbDateToIso(task.dueDate!),
    });

    await updateTask(owner.userId, task.id, base);
    expect((await db.task.findUniqueOrThrow({ where: { id: task.id } })).dueDateManuallySet).toBe(false);

    await updateTask(owner.userId, task.id, { ...base, dueDate: addDaysIso(dbDateToIso(task.dueDate!), 3) });
    expect((await db.task.findUniqueOrThrow({ where: { id: task.id } })).dueDateManuallySet).toBe(true);
  });
});

describe("summary and listing", () => {
  it("computes progress, overdue and filtered, paginated lists", async () => {
    const { owner, weddingId } = await createWorkspace();
    const db = getDb();
    const generated = await db.task.count({ where: { weddingId } });
    const [first, second, third] = await db.task.findMany({ where: { weddingId }, take: 3, orderBy: { title: "asc" } });

    await setTaskCompleted(owner.userId, first!.id, true);
    await setTaskCompleted(owner.userId, second!.id, true);
    await db.task.update({ where: { id: third!.id }, data: { status: "CANCELLED" } });
    const overdueTask = await createTask(owner.userId, weddingId, customInput({ title: "Tugas terlambat unik", dueDate: addDaysIso(today, -2) }));
    if (!overdueTask.ok) throw new Error("create failed");

    const summary = await getChecklistSummary(owner.userId, weddingId, today);
    expect(summary).toMatchObject({ total: generated - 1 + 1, completed: 2, cancelled: 1, overdue: 1 });
    expect(summary.percent).toBe(Math.floor((2 / generated) * 100));

    const overdue = await listTasks(owner.userId, weddingId, { ...DEFAULT_CHECKLIST_FILTERS, view: "overdue" }, today);
    expect(overdue.items.map((t) => t.id)).toEqual([overdueTask.taskId]);

    const completed = await listTasks(owner.userId, weddingId, { ...DEFAULT_CHECKLIST_FILTERS, view: "COMPLETED" }, today);
    expect(completed.total).toBe(2);

    const open = await listTasks(owner.userId, weddingId, DEFAULT_CHECKLIST_FILTERS, today);
    expect(open.total).toBe(generated - 3 + 1);

    const search = await listTasks(owner.userId, weddingId, { ...DEFAULT_CHECKLIST_FILTERS, view: "all", q: "kua" }, today);
    expect(search.total).toBeGreaterThan(0);
    const searchIds = search.items.map((t) => t.id);
    const matching = await db.task.findMany({ where: { id: { in: searchIds } }, select: { title: true, description: true } });
    for (const t of matching) expect(`${t.title} ${t.description ?? ""}`.toLowerCase()).toContain("kua");

    const categoryId = idOf(categories, "VENUE");
    const byCategory = await listTasks(owner.userId, weddingId, { ...DEFAULT_CHECKLIST_FILTERS, view: "all", categoryId }, today);
    expect(byCategory.total).toBeGreaterThan(0);
    expect(byCategory.items.every((t) => t.category.id === categoryId)).toBe(true);

    const all = { ...DEFAULT_CHECKLIST_FILTERS, view: "all" as const };
    const page1 = await listTasks(owner.userId, weddingId, all, today);
    const page2 = await listTasks(owner.userId, weddingId, { ...all, page: 2 }, today);
    expect(page1.total).toBe(generated + 1);
    expect(page1.items).toHaveLength(50);
    expect(page2.items).toHaveLength(generated + 1 - 50);
    const ids = [...page1.items, ...page2.items].map((t) => t.id);
    expect(new Set(ids).size).toBe(generated + 1);

    const upcoming = await getUpcomingTasks(owner.userId, weddingId, 5);
    expect(upcoming).toHaveLength(5);
    const dates = upcoming.map((t) => dbDateToIso(t.dueDate!));
    expect([...dates].sort()).toEqual(dates);
    expect(upcoming[0]!.id).toBe(overdueTask.taskId);
  });
});

describe("changing the wedding date", () => {
  it("recalculates only open template tasks whose deadline was never edited", async () => {
    const { owner, weddingId } = await createWorkspace({ weddingInDays: 400 });
    const db = getDb();
    const byCode = await tasksByTemplateCode(weddingId);

    const manual = byCode.get("VENUE_BOOK")!;
    const manualDate = addDaysIso(today, 45);
    await updateTask(owner.userId, manual.id, {
      ...updateInput({ title: manual.title, categoryId: idOf(categories, "VENUE"), priority: "URGENT" }),
      dueDate: manualDate,
    });
    const completed = byCode.get("CATERING_BOOK")!;
    await setTaskCompleted(owner.userId, completed.id, true);
    const untouched = byCode.get("DOC_BOOK")!;
    const custom = await createTask(owner.userId, weddingId, customInput({ dueDate: addDaysIso(today, 10) }));
    if (!custom.ok) throw new Error("create failed");

    const eligibleBefore = await countRecalculableTasks(owner.userId, weddingId);
    const newWeddingDate = addDaysIso(today, 300);
    const result = await changeWeddingDate(owner.userId, weddingId, newWeddingDate, true);
    expect(result).toEqual({ ok: true, recalculated: eligibleBefore });

    const after = await tasksByTemplateCode(weddingId);
    expect(dbDateToIso(after.get("VENUE_BOOK")!.dueDate!)).toBe(manualDate);
    expect(after.get("CATERING_BOOK")!.dueDate!.getTime()).toBe(completed.dueDate!.getTime());
    expect(dbDateToIso(after.get("DOC_BOOK")!.dueDate!)).toBe(
      computeTemplateDueDate(newWeddingDate, untouched.templateOffsetDays!, today),
    );
    const customAfter = await db.task.findUniqueOrThrow({ where: { id: custom.taskId } });
    expect(dbDateToIso(customAfter.dueDate!)).toBe(addDaysIso(today, 10));
    expect(dbDateToIso((await db.wedding.findUniqueOrThrow({ where: { id: weddingId } })).weddingDate)).toBe(newWeddingDate);
  });

  it("changes only the date when recalculation is declined", async () => {
    const { owner, weddingId } = await createWorkspace();
    const db = getDb();
    const before = await db.task.findMany({ where: { weddingId }, select: { id: true, dueDate: true }, orderBy: { id: "asc" } });

    const newWeddingDate = addDaysIso(today, 200);
    expect(await changeWeddingDate(owner.userId, weddingId, newWeddingDate, false)).toEqual({ ok: true, recalculated: 0 });

    const after = await db.task.findMany({ where: { weddingId }, select: { id: true, dueDate: true }, orderBy: { id: "asc" } });
    expect(after).toEqual(before);
    expect(dbDateToIso((await db.wedding.findUniqueOrThrow({ where: { id: weddingId } })).weddingDate)).toBe(newWeddingDate);
  });

  it("keeps engagement and reception dates consistent", async () => {
    const { owner, weddingId, weddingDate } = await createWorkspace({ weddingInDays: 200 });
    const db = getDb();
    await db.wedding.update({
      where: { id: weddingId },
      data: {
        engagementDate: new Date(`${addDaysIso(today, 100)}T00:00:00Z`),
        receptionDate: new Date(`${addDaysIso(today, 210)}T00:00:00Z`),
      },
    });

    expect(await changeWeddingDate(owner.userId, weddingId, addDaysIso(today, 50), true)).toEqual({
      ok: false,
      reason: "engagement_after_wedding",
    });
    expect(await changeWeddingDate(owner.userId, weddingId, addDaysIso(today, 250), true)).toEqual({
      ok: false,
      reason: "reception_before_wedding",
    });
    expect(dbDateToIso((await db.wedding.findUniqueOrThrow({ where: { id: weddingId } })).weddingDate)).toBe(weddingDate);
  });
});
