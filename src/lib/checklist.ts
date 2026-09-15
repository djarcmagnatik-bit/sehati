/**
 * Pure checklist rules shared by server and client: deadline generation, template applicability,
 * progress and due-date classification.
 */
import { addDaysIso, daysBetweenIsoDates } from "@/lib/dates";

export const TASK_STATUSES = ["TODO", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const;
export type TaskStatusValue = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
export type TaskPriorityValue = (typeof TASK_PRIORITIES)[number];

export const OPEN_TASK_STATUSES = ["TODO", "IN_PROGRESS"] as const satisfies readonly TaskStatusValue[];

export const TASK_STATUS_LABEL: Record<TaskStatusValue, string> = {
  TODO: "Belum dikerjakan",
  IN_PROGRESS: "Sedang dikerjakan",
  COMPLETED: "Selesai",
  CANCELLED: "Dibatalkan",
};

export const TASK_PRIORITY_LABEL: Record<TaskPriorityValue, string> = {
  LOW: "Rendah",
  MEDIUM: "Sedang",
  HIGH: "Tinggi",
  URGENT: "Mendesak",
};

export function isOpenStatus(status: TaskStatusValue): boolean {
  return status === "TODO" || status === "IN_PROGRESS";
}

/**
 * Deadline for a template task: wedding date + offset.
 * Preparation tasks (offset ≤ 0) whose computed deadline has already passed are due today instead,
 * so couples who start late get an actionable list rather than a wall of overdue tasks.
 */
export function computeTemplateDueDate(weddingDateIso: string, offsetDays: number, todayIso: string): string {
  const computed = addDaysIso(weddingDateIso, offsetDays);
  if (offsetDays <= 0 && computed < todayIso) {
    return todayIso <= weddingDateIso ? todayIso : weddingDateIso;
  }
  return computed;
}

export type TemplateApplicability = {
  eventTypeIds: readonly string[];
  marriageProcessIds: readonly string[];
};

/** An empty list means "applies to all". */
export function templateAppliesTo(
  template: TemplateApplicability,
  wedding: { eventTypeId: string | null; marriageProcessId: string | null },
): boolean {
  const eventTypeMatches =
    template.eventTypeIds.length === 0 ||
    (wedding.eventTypeId !== null && template.eventTypeIds.includes(wedding.eventTypeId));
  const marriageProcessMatches =
    template.marriageProcessIds.length === 0 ||
    (wedding.marriageProcessId !== null && template.marriageProcessIds.includes(wedding.marriageProcessId));
  return eventTypeMatches && marriageProcessMatches;
}

export type ChecklistProgress = { total: number; completed: number; percent: number };

/**
 * completed / total × 100. Cancelled tasks are no longer part of the plan, so they are excluded
 * from the total. Rounded down so 100% only appears when everything is done.
 */
export function computeChecklistProgress(counts: Partial<Record<TaskStatusValue, number>>): ChecklistProgress {
  const completed = counts.COMPLETED ?? 0;
  const total = (counts.TODO ?? 0) + (counts.IN_PROGRESS ?? 0) + completed;
  const percent = total === 0 ? 0 : Math.floor((completed / total) * 100);
  return { total, completed, percent };
}

export const DUE_SOON_DAYS = 7;

export type DueState =
  | { kind: "closed" }
  | { kind: "none" }
  | { kind: "overdue"; days: number }
  | { kind: "today" }
  | { kind: "soon"; days: number }
  | { kind: "later"; days: number };

export function classifyDue(dueDateIso: string | null, status: TaskStatusValue, todayIso: string): DueState {
  if (!isOpenStatus(status)) return { kind: "closed" };
  if (!dueDateIso) return { kind: "none" };
  const diff = daysBetweenIsoDates(todayIso, dueDateIso);
  if (diff < 0) return { kind: "overdue", days: -diff };
  if (diff === 0) return { kind: "today" };
  if (diff <= DUE_SOON_DAYS) return { kind: "soon", days: diff };
  return { kind: "later", days: diff };
}
