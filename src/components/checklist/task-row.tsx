import Link from "next/link";
import { TASK_PRIORITY_LABEL, TASK_STATUS_LABEL, type TaskPriorityValue, type TaskStatusValue } from "@/lib/checklist";
import { cn } from "@/lib/cn";
import { dbDateToIso } from "@/lib/dates";
import { toggleTaskAction } from "@/server/actions/task-actions";
import { DueBadge } from "./due-badge";

export type TaskRowData = {
  id: string;
  title: string;
  status: TaskStatusValue;
  priority: TaskPriorityValue;
  dueDate: Date | null;
  category: { name: string };
  assignee: { displayName: string } | null;
};

export function TaskRow({ task, todayIso }: { task: TaskRowData; todayIso: string }) {
  const completed = task.status === "COMPLETED";
  const cancelled = task.status === "CANCELLED";

  return (
    <li className="flex items-start gap-2 py-3">
      <form action={toggleTaskAction}>
        <input type="hidden" name="taskId" value={task.id} />
        <input type="hidden" name="completed" value={completed ? "false" : "true"} />
        <button
          type="submit"
          aria-label={completed ? `Tandai belum selesai: ${task.title}` : `Tandai selesai: ${task.title}`}
          className="flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-cream-100 focus-visible:outline-2 focus-visible:outline-clay-600"
        >
          <span
            aria-hidden="true"
            className={cn(
              "flex size-6 items-center justify-center rounded-full border-2",
              completed ? "border-clay-600 bg-clay-600 text-white" : "border-cream-300 bg-white",
            )}
          >
            {completed ? (
              <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="m3.5 8.5 3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : null}
          </span>
        </button>
      </form>

      <div className="min-w-0 flex-1 pt-2.5">
        <Link
          href={`/checklist/${task.id}`}
          className={cn(
            "font-medium underline-offset-4 hover:underline",
            completed || cancelled ? "text-ink-500 line-through" : "text-ink-900",
          )}
        >
          {task.title}
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-500">
          <span>{task.category.name}</span>
          <DueBadge
            dueDateIso={task.dueDate ? dbDateToIso(task.dueDate) : null}
            status={task.status}
            todayIso={todayIso}
          />
          {task.priority === "HIGH" || task.priority === "URGENT" ? (
            <span className={cn("font-semibold", task.priority === "URGENT" ? "text-danger-600" : "text-clay-700")}>
              Prioritas {TASK_PRIORITY_LABEL[task.priority].toLowerCase()}
            </span>
          ) : null}
          {task.status === "IN_PROGRESS" || cancelled ? <span>{TASK_STATUS_LABEL[task.status]}</span> : null}
          {task.assignee ? <span>PJ: {task.assignee.displayName}</span> : null}
        </div>
      </div>
    </li>
  );
}
