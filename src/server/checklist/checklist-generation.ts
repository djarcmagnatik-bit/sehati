import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { computeTemplateDueDate, OPEN_TASK_STATUSES, templateAppliesTo } from "@/lib/checklist";
import { dbDateToIso, isoToDbDate } from "@/lib/dates";

type Tx = Prisma.TransactionClient;

export type WeddingForGeneration = {
  id: string;
  weddingDate: Date;
  eventTypeId: string | null;
  marriageProcessId: string | null;
};

/**
 * Creates one task per applicable active template. Safe to call inside the wedding-creation
 * transaction; the (wedding_id, template_id) unique constraint makes it idempotent.
 */
export async function generateTemplateTasks(
  tx: Tx,
  wedding: WeddingForGeneration,
  options: { todayIso: string; createdById: string | null },
): Promise<number> {
  const templates = await tx.taskTemplate.findMany({
    where: { isActive: true },
    orderBy: [{ deadlineOffsetDays: "asc" }, { sortOrder: "asc" }],
    select: {
      id: true,
      title: true,
      description: true,
      categoryId: true,
      priority: true,
      deadlineOffsetDays: true,
      eventTypes: { select: { eventTypeId: true } },
      marriageProcesses: { select: { marriageProcessId: true } },
    },
  });

  const weddingDateIso = dbDateToIso(wedding.weddingDate);
  const data = templates
    .filter((template) =>
      templateAppliesTo(
        {
          eventTypeIds: template.eventTypes.map((link) => link.eventTypeId),
          marriageProcessIds: template.marriageProcesses.map((link) => link.marriageProcessId),
        },
        wedding,
      ),
    )
    .map((template) => ({
      weddingId: wedding.id,
      title: template.title,
      description: template.description,
      categoryId: template.categoryId,
      priority: template.priority,
      status: "TODO" as const,
      source: "TEMPLATE" as const,
      templateId: template.id,
      templateOffsetDays: template.deadlineOffsetDays,
      dueDate: isoToDbDate(computeTemplateDueDate(weddingDateIso, template.deadlineOffsetDays, options.todayIso)),
      createdById: options.createdById,
    }));

  if (data.length === 0) return 0;
  const result = await tx.task.createMany({ data, skipDuplicates: true });
  return result.count;
}

/** Template tasks whose deadline still follows the wedding date. */
export function recalculableTasksWhere(weddingId: string): Prisma.TaskWhereInput {
  return {
    weddingId,
    source: "TEMPLATE",
    dueDateManuallySet: false,
    status: { in: [...OPEN_TASK_STATUSES] },
    templateOffsetDays: { not: null },
  };
}
