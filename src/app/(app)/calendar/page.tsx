import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { buttonClassName } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { addDaysIso, formatIsoDateLong, formatIsoDateShort, isValidIsoDate, todayIsoInTimeZone } from "@/lib/dates";
import {
  CALENDAR_SOURCE_LABEL,
  CALENDAR_SOURCE_STYLE,
  CALENDAR_SOURCES,
  CALENDAR_VIEW_LABEL,
  CALENDAR_VIEWS,
  groupEntriesByDate,
  isValidMonth,
  monthGrid,
  monthLabel,
  monthOf,
  shiftMonth,
  WEEKDAY_LABELS,
  weekGrid,
  type CalendarEntry,
  type CalendarView,
} from "@/lib/planning";
import { requireSession } from "@/server/auth/session-cookie";
import { listCalendarEntries } from "@/server/planning/calendar-service";
import { getActiveWeddingForUser } from "@/server/wedding/wedding-service";

export const metadata: Metadata = { title: "Kalender" };

const NOTICES: Record<string, string> = {
  created: "Agenda ditambahkan.",
  updated: "Agenda diperbarui.",
  deleted: "Agenda dihapus.",
};

const AGENDA_DAYS = 60;

type SearchParams = { notice?: string | string[]; view?: string | string[]; month?: string | string[]; date?: string | string[] };

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

function EntryChip({ entry, compact = false }: { entry: CalendarEntry; compact?: boolean }) {
  const style = CALENDAR_SOURCE_STYLE[entry.source];
  return (
    <Link
      href={entry.href}
      className={cn(
        "flex items-start gap-1.5 rounded-lg px-2 py-1 ring-1 hover:underline",
        style.className,
        entry.done && "opacity-70",
        compact ? "text-xs" : "text-sm",
      )}
    >
      <span aria-hidden="true" className="shrink-0 font-semibold">
        {style.symbol}
      </span>
      <span className="min-w-0">
        <span className="sr-only">{CALENDAR_SOURCE_LABEL[entry.source]}: </span>
        {entry.time ? <span className="font-semibold">{entry.time} </span> : null}
        <span className={cn(compact && "line-clamp-2", entry.done && "line-through")}>{entry.title}</span>
        {entry.done ? <span className="sr-only"> (selesai)</span> : null}
      </span>
    </Link>
  );
}

function DayList({ dates, grouped, todayIso }: { dates: string[]; grouped: Map<string, CalendarEntry[]>; todayIso: string }) {
  const withEntries = dates.filter((date) => grouped.has(date));
  if (withEntries.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-cream-300 bg-white p-6 text-center">
        <p className="text-ink-700">Tidak ada jadwal pada periode ini.</p>
      </div>
    );
  }
  return (
    <ol className="space-y-4">
      {withEntries.map((date) => (
        <li key={date} className="rounded-2xl border border-cream-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-ink-900">
            <time dateTime={date}>{formatIsoDateLong(date)}</time>
            {date === todayIso ? <span className="ml-2 rounded-full bg-clay-50 px-2 py-0.5 text-xs text-clay-700">Hari ini</span> : null}
          </h3>
          <ul className="mt-2 space-y-2">
            {grouped.get(date)!.map((entry) => (
              <li key={entry.id}>
                <EntryChip entry={entry} />
                {entry.detail ? <p className="mt-0.5 pl-6 text-xs text-ink-500">{entry.detail}</p> : null}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}

export default async function CalendarPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const session = await requireSession();
  const membership = await getActiveWeddingForUser(session.user.id);
  if (!membership) redirect("/onboarding");

  const { wedding } = membership;
  const params = await searchParams;
  const todayIso = todayIsoInTimeZone(new Date(), wedding.timeZone);
  const view: CalendarView = (CALENDAR_VIEWS as readonly string[]).includes(first(params.view)) ? (first(params.view) as CalendarView) : "month";
  const month = isValidMonth(first(params.month)) ? first(params.month) : monthOf(todayIso);
  const anchorDate = isValidIsoDate(first(params.date)) ? first(params.date) : todayIso;
  const notice = NOTICES[first(params.notice)];

  let dates: string[];
  let title: string;
  let previousHref: string;
  let nextHref: string;
  if (view === "month") {
    dates = monthGrid(month);
    title = monthLabel(month);
    previousHref = `/calendar?month=${shiftMonth(month, -1)}`;
    nextHref = `/calendar?month=${shiftMonth(month, 1)}`;
  } else if (view === "week") {
    dates = weekGrid(anchorDate);
    title = `${formatIsoDateShort(dates[0]!)} – ${formatIsoDateShort(dates[6]!)}`;
    previousHref = `/calendar?view=week&date=${addDaysIso(dates[0]!, -7)}`;
    nextHref = `/calendar?view=week&date=${addDaysIso(dates[0]!, 7)}`;
  } else {
    dates = Array.from({ length: AGENDA_DAYS }, (_, day) => addDaysIso(anchorDate, day));
    title = `${formatIsoDateShort(dates[0]!)} – ${formatIsoDateShort(dates.at(-1)!)}`;
    previousHref = `/calendar?view=agenda&date=${addDaysIso(anchorDate, -AGENDA_DAYS)}`;
    nextHref = `/calendar?view=agenda&date=${addDaysIso(anchorDate, AGENDA_DAYS)}`;
  }

  const entries = await listCalendarEntries(session.user.id, wedding.id, dates[0]!, dates.at(-1)!);
  const grouped = groupEntriesByDate(entries);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">Kalender</h1>
          <p className="mt-1 text-ink-700">Tenggat tugas, jatuh tempo pembayaran, janji vendor, acara, dan agenda kalian dalam satu tempat.</p>
        </div>
        <Link href="/calendar/new" className={buttonClassName("primary")}>
          + Tambah agenda
        </Link>
      </header>

      {notice ? <Alert tone="success">{notice}</Alert> : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Tampilan kalender">
          <ul className="flex gap-2">
            {CALENDAR_VIEWS.map((option) => (
              <li key={option}>
                <Link
                  href={option === "month" ? `/calendar?month=${month}` : `/calendar?view=${option}&date=${option === "week" ? anchorDate : todayIso}`}
                  aria-current={view === option ? "page" : undefined}
                  className={cn(
                    "inline-flex min-h-10 items-center rounded-full px-4 text-sm font-medium",
                    view === option ? "bg-ink-900 text-white" : "bg-white text-ink-700 ring-1 ring-cream-300 hover:bg-cream-100",
                  )}
                >
                  {CALENDAR_VIEW_LABEL[option]}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex items-center gap-2">
          <Link href={previousHref} aria-label="Periode sebelumnya" className={buttonClassName("secondary", "min-h-10 px-3")}>
            ←
          </Link>
          <h2 className="min-w-40 text-center font-semibold" data-testid="calendar-title">
            {title}
          </h2>
          <Link href={nextHref} aria-label="Periode berikutnya" className={buttonClassName("secondary", "min-h-10 px-3")}>
            →
          </Link>
        </div>
      </div>

      <ul aria-label="Keterangan" className="flex flex-wrap gap-2 text-xs">
        {CALENDAR_SOURCES.map((source) => (
          <li key={source} className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 ring-1", CALENDAR_SOURCE_STYLE[source].className)}>
            <span aria-hidden="true" className="font-semibold">
              {CALENDAR_SOURCE_STYLE[source].symbol}
            </span>
            {CALENDAR_SOURCE_LABEL[source]}
          </li>
        ))}
      </ul>

      {view === "month" ? (
        <>
          {/* A 7-column grid only fits from tablet width; phones get the same days as a list. */}
          <div className="hidden overflow-hidden rounded-3xl border border-cream-200 bg-white sm:block">
            <div className="grid grid-cols-7 border-b border-cream-200 bg-cream-50 text-center text-xs font-medium text-ink-500">
              {WEEKDAY_LABELS.map((label) => (
                <div key={label} className="py-2">
                  {label}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {dates.map((date) => {
                const inMonth = monthOf(date) === month;
                const dayEntries = grouped.get(date) ?? [];
                return (
                  <div
                    key={date}
                    className={cn("min-h-28 min-w-0 border-r border-b border-cream-200 p-1.5 [&:nth-child(7n)]:border-r-0", !inMonth && "bg-cream-50/60")}
                  >
                    <p
                      className={cn(
                        "mb-1 text-xs",
                        inMonth ? "text-ink-700" : "text-ink-500/60",
                        date === todayIso && "inline-flex size-6 items-center justify-center rounded-full bg-clay-600 font-semibold text-white",
                      )}
                    >
                      <time dateTime={date}>{Number(date.slice(8))}</time>
                    </p>
                    <ul className="space-y-1">
                      {dayEntries.map((entry) => (
                        <li key={entry.id}>
                          <EntryChip entry={entry} compact />
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="sm:hidden">
            <DayList dates={dates.filter((date) => monthOf(date) === month)} grouped={grouped} todayIso={todayIso} />
          </div>
        </>
      ) : (
        <DayList dates={dates} grouped={grouped} todayIso={todayIso} />
      )}

      <p className="text-sm text-ink-500" data-testid="calendar-count">
        {entries.length} jadwal pada periode ini.
      </p>
    </div>
  );
}
