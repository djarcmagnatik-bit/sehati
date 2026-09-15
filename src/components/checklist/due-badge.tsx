import { classifyDue, type TaskStatusValue } from "@/lib/checklist";
import { cn } from "@/lib/cn";
import { formatIsoDateShort } from "@/lib/dates";

const BASE = "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium";

/** Deadline state is always spelled out in text, never conveyed by color alone. */
export function DueBadge({
  dueDateIso,
  status,
  todayIso,
}: {
  dueDateIso: string | null;
  status: TaskStatusValue;
  todayIso: string;
}) {
  const state = classifyDue(dueDateIso, status, todayIso);

  switch (state.kind) {
    case "overdue":
      return (
        <span className={cn(BASE, "bg-danger-50 text-danger-600")}>
          <span aria-hidden="true">⚠</span> Terlambat {state.days} hari
        </span>
      );
    case "today":
      return <span className={cn(BASE, "bg-clay-100 text-clay-700")}>Tenggat hari ini</span>;
    case "soon":
      return <span className={cn(BASE, "bg-cream-100 text-ink-700")}>{state.days} hari lagi</span>;
    case "later":
      return dueDateIso ? <span className="text-xs text-ink-500">{formatIsoDateShort(dueDateIso)}</span> : null;
    case "none":
      return <span className="text-xs text-ink-500">Tanpa tenggat</span>;
    case "closed":
      return dueDateIso ? <span className="text-xs text-ink-500">{formatIsoDateShort(dueDateIso)}</span> : null;
  }
}
