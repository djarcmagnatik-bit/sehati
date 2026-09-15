import "server-only";
import { z } from "zod";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { computeChecklistProgress, OPEN_TASK_STATUSES, type TaskStatusValue } from "@/lib/checklist";
import { CHECKLIST_PAGE_SIZE, type ChecklistFilters, type ChecklistSort } from "@/lib/checklist-filters";
import { isoToDbDate, todayIsoInTimeZone } from "@/lib/dates";
import type { TaskInput, TaskUpdateInput } from "@/lib/validation/task";
import { requireWeddingMember, WeddingAccessError } from "@/server/authz/wedding-access";
import { getDb } from "@/server/db";
import { generateTemplateTasks } from "./checklist-generation";

const uuidSchema = z.uuid();
const openStatuses = [...OPEN_TASK_STATUSES];

/** Tasks are reachable only through a non-deleted wedding the user is a member of. */
function memberWedding(userId: string): Prisma.WeddingWhereInput {
  return { deletedAt: null, members: { some: { userId } } };
}

const taskListSelect = {
  id: true,
  title: true,
  status: true,
  priority: true,
  dueDate: true,
  source: true,
  category: { select: { id: true, name: true } },
  assignee: { select: { id: true, displayName: true } },
} satisfies Prisma.TaskSelect;

const ORDER_BY: Record<ChecklistSort, Prisma.TaskOrderByWithRelationInput[]> = {
  due: [{ dueDate: { sort: "asc", nulls: "last" } }, { priority: "desc" }, { title: "asc" }, { id: "asc" }],
  priority: [{ priority: "desc" }, { dueDate: { sort: "asc", nulls: "last" } }, { title: "asc" }, { id: "asc" }],
  title: [{ title: "asc" }, { id: "asc" }],
  recent: [{ updatedAt: "desc" }, { id: "asc" }],
};

export async function listTasks(userId: string, weddingId: string, filters: ChecklistFilters, todayIso: string) {
  const membership = await requireWeddingMember(userId, weddingId);
  const where: Prisma.TaskWhereInput = { weddingId: membership.weddingId };

  switch (filters.view) {
    case "open":
      where.status = { in: openStatuses };
      break;
    case "overdue":
      where.status = { in: openStatuses };
      where.dueDate = { lt: isoToDbDate(todayIso) };
      break;
    case "COMPLETED":
    case "CANCELLED":
      where.status = filters.view;
      break;
    case "all":
      break;
  }
  if (filters.categoryId) where.categoryId = filters.categoryId;
  if (filters.q) {
    where.OR = [
      { title: { contains: filters.q, mode: "insensitive" } },
      { description: { contains: filters.q, mode: "insensitive" } },
    ];
  }

  const db = getDb();
  const [total, items] = await db.$transaction([
    db.task.count({ where }),
    db.task.findMany({
      where,
      orderBy: ORDER_BY[filters.sort],
      skip: (filters.page - 1) * CHECKLIST_PAGE_SIZE,
      take: CHECKLIST_PAGE_SIZE,
      select: taskListSelect,
    }),
  ]);

  return { items, total, page: filters.page, pageSize: CHECKLIST_PAGE_SIZE };
}

export type ChecklistSummary = {
  total: number;
  completed: number;
  percent: number;
  overdue: number;
  dueToday: number;
  cancelled: number;
};

export async function getChecklistSummary(userId: string, weddingId: string, todayIso: string): Promise<ChecklistSummary> {
  const membership = await requireWeddingMember(userId, weddingId);
  const db = getDb();
  const today = isoToDbDate(todayIso);
  const id = membership.weddingId;

  const [grouped, overdue, dueToday] = await Promise.all([
    db.task.groupBy({ by: ["status"], where: { weddingId: id }, _count: { _all: true } }),
    db.task.count({ where: { weddingId: id, status: { in: openStatuses }, dueDate: { lt: today } } }),
    db.task.count({ where: { weddingId: id, status: { in: openStatuses }, dueDate: today } }),
  ]);

  const counts: Partial<Record<TaskStatusValue, number>> = {};
  for (const row of grouped) counts[row.status] = row._count._all;

  return { ...computeChecklistProgress(counts), overdue, dueToday, cancelled: counts.CANCELLED ?? 0 };
}

export async function getUpcomingTasks(userId: string, weddingId: string, limit = 5) {
  const membership = await requireWeddingMember(userId, weddingId);
  return getDb().task.findMany({
    where: { weddingId: membership.weddingId, status: { in: openStatuses }, dueDate: { not: null } },
    orderBy: [{ dueDate: "asc" }, { priority: "desc" }, { title: "asc" }],
    take: limit,
    select: taskListSelect,
  });
}

/** Returns null for unknown ids and for tasks outside the user's weddings (no existence leak). */
export async function getTaskForUser(userId: string, taskId: string) {
  if (!uuidSchema.safeParse(taskId).success) return null;
  return getDb().task.findFirst({
    where: { id: taskId, wedding: memberWedding(userId) },
    select: {
      id: true,
      weddingId: true,
      title: true,
      description: true,
      categoryId: true,
      dueDate: true,
      status: true,
      priority: true,
      assigneeMemberId: true,
      source: true,
      dueDateManuallySet: true,
      completedAt: true,
      createdAt: true,
      updatedAt: true,
      category: { select: { name: true } },
      createdBy: { select: { name: true } },
    },
  });
}

/** Categories (active, plus the task's current one) and workspace members for the task form. */
export async function getTaskFormOptions(userId: string, weddingId: string, includeCategoryId?: string) {
  const membership = await requireWeddingMember(userId, weddingId);
  const db = getDb();
  const [categories, members] = await Promise.all([
    db.taskCategory.findMany({
      where: includeCategoryId ? { OR: [{ isActive: true }, { id: includeCategoryId }] } : { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
    db.weddingMember.findMany({
      where: { weddingId: membership.weddingId },
      orderBy: { joinedAt: "asc" },
      select: { id: true, displayName: true },
    }),
  ]);
  return { categories, members };
}

type ReferenceError = "invalid_category" | "invalid_assignee";

async function validateTaskReferences(
  db: PrismaClient,
  weddingId: string,
  input: TaskInput,
  currentCategoryId?: string,
): Promise<ReferenceError | null> {
  const category = await db.taskCategory.findFirst({
    // Keeping an existing (since deactivated) category is allowed; choosing a new one is not.
    where: { id: input.categoryId, ...(input.categoryId === currentCategoryId ? {} : { isActive: true }) },
    select: { id: true },
  });
  if (!category) return "invalid_category";

  if (input.assigneeMemberId) {
    const member = await db.weddingMember.findFirst({
      where: { id: input.assigneeMemberId, weddingId },
      select: { id: true },
    });
    if (!member) return "invalid_assignee";
  }
  return null;
}

export type TaskMutationResult = { ok: true; taskId: string } | { ok: false; reason: ReferenceError };

export async function createTask(userId: string, weddingId: string, input: TaskInput): Promise<TaskMutationResult> {
  const membership = await requireWeddingMember(userId, weddingId);
  const db = getDb();
  const referenceError = await validateTaskReferences(db, membership.weddingId, input);
  if (referenceError) return { ok: false, reason: referenceError };

  const task = await db.task.create({
    data: {
      weddingId: membership.weddingId,
      title: input.title,
      description: input.description,
      categoryId: input.categoryId,
      dueDate: input.dueDate ? isoToDbDate(input.dueDate) : null,
      priority: input.priority,
      assigneeMemberId: input.assigneeMemberId,
      source: "CUSTOM",
      dueDateManuallySet: input.dueDate !== null,
      createdById: userId,
    },
    select: { id: true },
  });
  return { ok: true, taskId: task.id };
}

export async function updateTask(
  userId: string,
  taskId: string,
  input: TaskUpdateInput,
  now: Date = new Date(),
): Promise<TaskMutationResult> {
  if (!uuidSchema.safeParse(taskId).success) throw new WeddingAccessError();
  const db = getDb();
  const task = await db.task.findFirst({
    where: { id: taskId, wedding: memberWedding(userId) },
    select: { id: true, weddingId: true, categoryId: true, dueDate: true, status: true, dueDateManuallySet: true, completedAt: true },
  });
  if (!task) throw new WeddingAccessError();

  const referenceError = await validateTaskReferences(db, task.weddingId, input, task.categoryId);
  if (referenceError) return { ok: false, reason: referenceError };

  const newDueDate = input.dueDate ? isoToDbDate(input.dueDate) : null;
  const dueDateChanged = (task.dueDate?.getTime() ?? null) !== (newDueDate?.getTime() ?? null);
  const completedAt = input.status === "COMPLETED" ? (task.status === "COMPLETED" ? task.completedAt : now) : null;

  await db.task.update({
    where: { id: task.id },
    data: {
      title: input.title,
      description: input.description,
      categoryId: input.categoryId,
      dueDate: newDueDate,
      priority: input.priority,
      assigneeMemberId: input.assigneeMemberId,
      status: input.status,
      completedAt,
      dueDateManuallySet: task.dueDateManuallySet || dueDateChanged,
    },
  });
  return { ok: true, taskId: task.id };
}

export async function setTaskCompleted(userId: string, taskId: string, completed: boolean, now: Date = new Date()) {
  if (!uuidSchema.safeParse(taskId).success) throw new WeddingAccessError();
  const db = getDb();
  const scope = { id: taskId, wedding: memberWedding(userId) };

  const result = await db.task.updateMany({
    where: completed ? { ...scope, status: { not: "COMPLETED" } } : { ...scope, status: "COMPLETED" },
    data: completed ? { status: "COMPLETED", completedAt: now } : { status: "TODO", completedAt: null },
  });

  // Nothing changed: either already in the requested state, or not accessible.
  if (result.count === 0 && (await db.task.count({ where: scope })) === 0) {
    throw new WeddingAccessError();
  }
}

export type DeleteTaskResult = { ok: true } | { ok: false; reason: "template_task" };

/** Only custom tasks can be deleted; template tasks are cancelled instead. */
export async function deleteTask(userId: string, taskId: string): Promise<DeleteTaskResult> {
  if (!uuidSchema.safeParse(taskId).success) throw new WeddingAccessError();
  const db = getDb();
  const task = await db.task.findFirst({
    where: { id: taskId, wedding: memberWedding(userId) },
    select: { id: true, source: true },
  });
  if (!task) throw new WeddingAccessError();
  if (task.source === "TEMPLATE") return { ok: false, reason: "template_task" };

  await db.task.delete({ where: { id: task.id } });
  return { ok: true };
}

export type GenerateChecklistResult = { ok: true; created: number } | { ok: false; reason: "already_generated" };

/** For workspaces created before checklist generation existed. Runs at most once per wedding. */
export async function generateChecklistIfMissing(
  userId: string,
  weddingId: string,
  now: Date = new Date(),
): Promise<GenerateChecklistResult> {
  const membership = await requireWeddingMember(userId, weddingId);

  return getDb().$transaction(
    async (tx) => {
      const claimed = await tx.wedding.updateMany({
        where: { id: membership.weddingId, checklistGeneratedAt: null, deletedAt: null },
        data: { checklistGeneratedAt: now },
      });
      if (claimed.count === 0) return { ok: false, reason: "already_generated" } as const;

      const wedding = await tx.wedding.findUniqueOrThrow({
        where: { id: membership.weddingId },
        select: { id: true, weddingDate: true, eventTypeId: true, marriageProcessId: true, timeZone: true },
      });
      const created = await generateTemplateTasks(tx, wedding, {
        todayIso: todayIsoInTimeZone(now, wedding.timeZone),
        createdById: userId,
      });
      return { ok: true, created } as const;
    },
    { timeout: 15_000 },
  );
}
