import { describeActivity, formatRelativeTime } from "@/lib/activity";
import { formatDateTime } from "@/lib/dates";

export type ActivityListEntry = {
  id: string;
  action: string;
  actorName: string;
  metadata: unknown;
  createdAt: Date;
};

export function ActivityList({
  entries,
  now,
  timeZone,
}: {
  entries: ActivityListEntry[];
  now: Date;
  timeZone: string;
}) {
  return (
    <ul className="divide-y divide-cream-200">
      {entries.map((entry) => (
        <li key={entry.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-3">
          <p className="text-sm text-ink-900">{describeActivity(entry)}</p>
          <time
            dateTime={entry.createdAt.toISOString()}
            title={formatDateTime(entry.createdAt, timeZone)}
            className="shrink-0 text-xs text-ink-500"
          >
            {formatRelativeTime(entry.createdAt, now, timeZone)}
          </time>
        </li>
      ))}
    </ul>
  );
}
