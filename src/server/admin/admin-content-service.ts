import "server-only";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { isThemeCode } from "@/lib/invitation-themes";
import type { TaskTemplateInput, ThemeSettingInput } from "@/lib/validation/admin";
import { getDb } from "@/server/db";
import { getThemeCatalog } from "@/server/invitation/theme-catalog";
import { ADMIN_PAGE_SIZE, pageArgs, recordAdminAudit, requireAdmin } from "./admin-access";

const uuidSchema = z.uuid();
const isUuid = (value: string) => uuidSchema.safeParse(value).success;

// ─── Task templates ──────────────────────────────────────────────────────────

export type TemplateFilter = { q: string; categoryId: string | null; status: "all" | "active" | "inactive"; page: number };

export async function listTaskTemplates(adminId: string, filter: TemplateFilter) {
  await requireAdmin(adminId);
  const { page, skip, take } = pageArgs(filter.page);
  const where: Prisma.TaskTemplateWhereInput = {
    ...(filter.q ? { title: { contains: filter.q, mode: "insensitive" } } : {}),
    ...(filter.categoryId && isUuid(filter.categoryId) ? { categoryId: filter.categoryId } : {}),
    ...(filter.status === "active" ? { isActive: true } : filter.status === "inactive" ? { isActive: false } : {}),
  };
  const db = getDb();
  const [total, items] = await db.$transaction([
    db.taskTemplate.count({ where }),
    db.taskTemplate.findMany({
      where,
      orderBy: [{ deadlineOffsetDays: "asc" }, { sortOrder: "asc" }],
      skip,
      take,
      select: {
        id: true,
        code: true,
        title: true,
        priority: true,
        deadlineOffsetDays: true,
        isActive: true,
        category: { select: { name: true } },
        _count: { select: { eventTypes: true, marriageProcesses: true, tasks: true } },
      },
    }),
  ]);
  return { items, total, page, pageSize: ADMIN_PAGE_SIZE };
}

export async function getTemplateFormOptions(adminId: string) {
  await requireAdmin(adminId);
  const db = getDb();
  const [categories, eventTypes, marriageProcesses] = await Promise.all([
    db.taskCategory.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true, isActive: true } }),
    db.eventType.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
    db.marriageProcess.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
  ]);
  return { categories, eventTypes, marriageProcesses };
}

export async function getTaskTemplateForAdmin(adminId: string, templateId: string) {
  await requireAdmin(adminId);
  if (!isUuid(templateId)) return null;
  return getDb().taskTemplate.findUnique({
    where: { id: templateId },
    select: {
      id: true,
      code: true,
      title: true,
      description: true,
      categoryId: true,
      priority: true,
      deadlineOffsetDays: true,
      isActive: true,
      eventTypes: { select: { eventTypeId: true } },
      marriageProcesses: { select: { marriageProcessId: true } },
      _count: { select: { tasks: true } },
    },
  });
}

export type TemplateResult = { ok: true; id: string } | { ok: false; reason: "invalid_reference" | "not_found" };

async function referencesValid(input: TaskTemplateInput): Promise<boolean> {
  const db = getDb();
  const [category, eventTypes, processes] = await Promise.all([
    db.taskCategory.count({ where: { id: input.categoryId } }),
    db.eventType.count({ where: { id: { in: input.eventTypeIds } } }),
    db.marriageProcess.count({ where: { id: { in: input.marriageProcessIds } } }),
  ]);
  return category === 1 && eventTypes === new Set(input.eventTypeIds).size && processes === new Set(input.marriageProcessIds).size;
}

function templateSummary(input: TaskTemplateInput) {
  return {
    title: input.title,
    deadlineOffsetDays: input.deadlineOffsetDays,
    priority: input.priority,
    isActive: input.isActive,
    eventTypes: input.eventTypeIds.length,
    marriageProcesses: input.marriageProcessIds.length,
  };
}

/** New templates apply to checklists generated from now on; existing weddings are not touched. */
export async function createTaskTemplate(adminId: string, input: TaskTemplateInput): Promise<TemplateResult> {
  const actor = await requireAdmin(adminId);
  if (!(await referencesValid(input))) return { ok: false, reason: "invalid_reference" };
  return getDb().$transaction(async (tx) => {
    const last = await tx.taskTemplate.aggregate({ _max: { sortOrder: true } });
    const template = await tx.taskTemplate.create({
      data: {
        code: `ADMIN_${Date.now().toString(36).toUpperCase()}_${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
        title: input.title,
        description: input.description,
        categoryId: input.categoryId,
        priority: input.priority,
        deadlineOffsetDays: input.deadlineOffsetDays,
        isActive: input.isActive,
        sortOrder: (last._max.sortOrder ?? 0) + 1,
        eventTypes: { create: [...new Set(input.eventTypeIds)].map((eventTypeId) => ({ eventTypeId })) },
        marriageProcesses: { create: [...new Set(input.marriageProcessIds)].map((marriageProcessId) => ({ marriageProcessId })) },
      },
      select: { id: true },
    });
    await recordAdminAudit(tx, actor, {
      action: "task_template.created",
      targetType: "task_template",
      targetId: template.id,
      summary: templateSummary(input),
    });
    return { ok: true, id: template.id } as const;
  });
}

/**
 * Tasks already generated keep their own copy (title, deadline, offset), so editing a template never
 * silently changes a couple's checklist.
 */
export async function updateTaskTemplate(adminId: string, templateId: string, input: TaskTemplateInput): Promise<TemplateResult> {
  const actor = await requireAdmin(adminId);
  if (!isUuid(templateId)) return { ok: false, reason: "not_found" };
  if (!(await referencesValid(input))) return { ok: false, reason: "invalid_reference" };
  return getDb().$transaction(async (tx) => {
    const exists = await tx.taskTemplate.findUnique({ where: { id: templateId }, select: { id: true } });
    if (!exists) return { ok: false, reason: "not_found" } as const;
    await tx.taskTemplateEventType.deleteMany({ where: { templateId } });
    await tx.taskTemplateMarriageProcess.deleteMany({ where: { templateId } });
    await tx.taskTemplate.update({
      where: { id: templateId },
      data: {
        title: input.title,
        description: input.description,
        categoryId: input.categoryId,
        priority: input.priority,
        deadlineOffsetDays: input.deadlineOffsetDays,
        isActive: input.isActive,
        eventTypes: { create: [...new Set(input.eventTypeIds)].map((eventTypeId) => ({ eventTypeId })) },
        marriageProcesses: { create: [...new Set(input.marriageProcessIds)].map((marriageProcessId) => ({ marriageProcessId })) },
      },
    });
    await recordAdminAudit(tx, actor, {
      action: "task_template.updated",
      targetType: "task_template",
      targetId: templateId,
      summary: templateSummary(input),
    });
    return { ok: true, id: templateId } as const;
  });
}

// ─── Invitation themes ───────────────────────────────────────────────────────

export async function listThemesForAdmin(adminId: string) {
  await requireAdmin(adminId);
  const [catalog, usage] = await Promise.all([
    getThemeCatalog(),
    getDb().invitation.groupBy({ by: ["themeCode"], _count: { _all: true } }),
  ]);
  const inUse = new Map(usage.map((row) => [row.themeCode, row._count._all]));
  return catalog.map((entry) => ({ ...entry, invitations: inUse.get(entry.code) ?? 0 }));
}

/** Metadata only: theme code and styling stay developer-controlled (PRD §47). */
export async function updateThemeSetting(adminId: string, code: string, input: ThemeSettingInput): Promise<{ ok: boolean }> {
  const actor = await requireAdmin(adminId);
  if (!isThemeCode(code)) return { ok: false };
  await getDb().$transaction(async (tx) => {
    await tx.invitationThemeSetting.upsert({ where: { code }, update: input, create: { ...input, code } });
    await recordAdminAudit(tx, actor, {
      action: "theme.updated",
      targetType: "invitation_theme",
      targetId: code,
      summary: { isEnabled: input.isEnabled, isPremium: input.isPremium, displayName: input.displayName, sortOrder: input.sortOrder },
    });
  });
  return { ok: true };
}

// ─── Audit logs ──────────────────────────────────────────────────────────────

export type AuditFilter = { targetType: string | null; q: string; page: number };

export async function listAuditLogs(adminId: string, filter: AuditFilter) {
  await requireAdmin(adminId);
  const { page, skip, take } = pageArgs(filter.page);
  const where: Prisma.AdminAuditLogWhereInput = {
    ...(filter.targetType ? { targetType: filter.targetType } : {}),
    ...(filter.q
      ? {
          OR: [
            { action: { contains: filter.q, mode: "insensitive" } },
            { actorEmail: { contains: filter.q, mode: "insensitive" } },
            { targetId: { contains: filter.q } },
          ],
        }
      : {}),
  };
  const db = getDb();
  const [total, items, targetTypes] = await Promise.all([
    db.adminAuditLog.count({ where }),
    db.adminAuditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take,
      select: { id: true, actorEmail: true, action: true, targetType: true, targetId: true, summary: true, createdAt: true },
    }),
    db.adminAuditLog.findMany({ distinct: ["targetType"], select: { targetType: true }, orderBy: { targetType: "asc" } }),
  ]);
  return { items, total, page, pageSize: ADMIN_PAGE_SIZE, targetTypes: targetTypes.map((row) => row.targetType) };
}
