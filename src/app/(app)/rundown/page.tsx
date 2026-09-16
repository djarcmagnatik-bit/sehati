import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { buttonClassName } from "@/components/ui/button";
import { PrintButton } from "@/components/ui/print-button";
import { cn } from "@/lib/cn";
import { formatIsoDateLong } from "@/lib/dates";
import { describeDuration, formatTimeRange } from "@/lib/planning";
import { moveRundownItemAction } from "@/server/actions/planning-actions";
import { requireSession } from "@/server/auth/session-cookie";
import { listRundown, type RundownRow } from "@/server/planning/rundown-service";
import { getActiveWeddingForUser } from "@/server/wedding/wedding-service";

export const metadata: Metadata = { title: "Rundown" };

const NOTICES: Record<string, string> = {
  created: "Kegiatan ditambahkan ke rundown.",
  updated: "Rundown diperbarui.",
  deleted: "Kegiatan dihapus dari rundown.",
};

type View = "timeline" | "table";

function Detail({ row }: { row: RundownRow }) {
  const meta = [row.pic ? `PJ: ${row.pic}` : null, row.location, row.category].filter(Boolean).join(" · ");
  return (
    <>
      {meta ? <p className="text-xs text-ink-500">{meta}</p> : null}
      {row.description ? <p className="mt-1 text-sm text-ink-700 whitespace-pre-line">{row.description}</p> : null}
      {row.notes ? <p className="mt-1 text-xs text-ink-500">Catatan: {row.notes}</p> : null}
    </>
  );
}

function MoveButtons({ row, previous, next }: { row: RundownRow; previous?: RundownRow; next?: RundownRow }) {
  const canUp = previous?.startTime === row.startTime;
  const canDown = next?.startTime === row.startTime;
  if (!canUp && !canDown) return null;
  return (
    <div className="flex gap-1 print:hidden">
      {canUp ? (
        <form action={moveRundownItemAction}>
          <input type="hidden" name="itemId" value={row.id} />
          <input type="hidden" name="direction" value="up" />
          <button type="submit" aria-label={`Naikkan ${row.title}`} className="inline-flex size-9 items-center justify-center rounded-full border border-cream-300 bg-white">
            ↑
          </button>
        </form>
      ) : null}
      {canDown ? (
        <form action={moveRundownItemAction}>
          <input type="hidden" name="itemId" value={row.id} />
          <input type="hidden" name="direction" value="down" />
          <button type="submit" aria-label={`Turunkan ${row.title}`} className="inline-flex size-9 items-center justify-center rounded-full border border-cream-300 bg-white">
            ↓
          </button>
        </form>
      ) : null}
    </div>
  );
}

export default async function RundownPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string | string[]; view?: string | string[] }>;
}) {
  const session = await requireSession();
  const membership = await getActiveWeddingForUser(session.user.id);
  if (!membership) redirect("/onboarding");

  const [days, params] = await Promise.all([listRundown(session.user.id, membership.wedding.id), searchParams]);
  const view: View = params.view === "table" ? "table" : "timeline";
  const notice = typeof params.notice === "string" ? NOTICES[params.notice] : undefined;
  const total = days.reduce((sum, day) => sum + day.items.length, 0);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">Rundown</h1>
          <p className="mt-1 text-ink-700 print:hidden">Susunan acara hari-H, dari persiapan sampai selesai.</p>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          {total > 0 ? <PrintButton label="Cetak rundown" /> : null}
          <Link href="/rundown/new" className={buttonClassName("primary")}>
            + Tambah kegiatan
          </Link>
        </div>
      </header>

      {notice ? (
        <div className="print:hidden">
          <Alert tone="success">{notice}</Alert>
        </div>
      ) : null}

      <nav aria-label="Tampilan rundown" className="print:hidden">
        <ul className="flex gap-2">
          {(
            [
              ["timeline", "Timeline"],
              ["table", "Tabel"],
            ] as const
          ).map(([value, label]) => (
            <li key={value}>
              <Link
                href={value === "timeline" ? "/rundown" : "/rundown?view=table"}
                aria-current={view === value ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-10 items-center rounded-full px-4 text-sm font-medium",
                  view === value ? "bg-ink-900 text-white" : "bg-white text-ink-700 ring-1 ring-cream-300 hover:bg-cream-100",
                )}
              >
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {total === 0 ? (
        <div className="rounded-3xl border border-dashed border-cream-300 bg-white p-6 text-center">
          <p className="text-ink-700">Belum ada kegiatan. Mulai dari jam makeup pengantin, misalnya.</p>
        </div>
      ) : null}

      {days.map((day) => (
        <section key={day.dateIso} aria-labelledby={`day-${day.dateIso}`} className="space-y-3">
          <h2 id={`day-${day.dateIso}`} className="font-display text-xl font-semibold">
            <time dateTime={day.dateIso}>{formatIsoDateLong(day.dateIso)}</time>
          </h2>

          {view === "timeline" ? (
            <ol className="relative space-y-4 border-l-2 border-clay-300 pl-5">
              {day.items.map((row, index) => {
                const duration = describeDuration(row.startTime, row.endTime);
                return (
                  <li key={row.id} className="relative">
                    <span aria-hidden="true" className="absolute top-1.5 -left-[27px] size-3 rounded-full bg-clay-600 ring-4 ring-cream-50" />
                    <div className="flex flex-wrap items-start justify-between gap-2 rounded-2xl border border-cream-200 bg-white p-4">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-clay-700">
                          {formatTimeRange(row.startTime, row.endTime)}
                          {duration ? <span className="font-normal text-ink-500"> · {duration}</span> : null}
                        </p>
                        <Link href={`/rundown/${row.id}`} className="font-medium text-ink-900 underline-offset-4 hover:underline">
                          {row.title}
                        </Link>
                        <Detail row={row} />
                      </div>
                      <MoveButtons row={row} previous={day.items[index - 1]} next={day.items[index + 1]} />
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-cream-200 bg-white">
              <table className="w-full min-w-[40rem] text-left text-sm">
                <caption className="sr-only">Rundown {formatIsoDateLong(day.dateIso)}</caption>
                <thead>
                  <tr className="border-b border-cream-200 text-ink-500">
                    <th scope="col" className="p-3">Waktu</th>
                    <th scope="col" className="p-3">Kegiatan</th>
                    <th scope="col" className="p-3">Penanggung jawab</th>
                    <th scope="col" className="p-3">Lokasi</th>
                    <th scope="col" className="p-3">Catatan</th>
                  </tr>
                </thead>
                <tbody>
                  {day.items.map((row) => (
                    <tr key={row.id} className="border-b border-cream-200 align-top last:border-0">
                      <td className="p-3 font-medium whitespace-nowrap">{formatTimeRange(row.startTime, row.endTime)}</td>
                      <td className="p-3">
                        <Link href={`/rundown/${row.id}`} className="font-medium underline-offset-4 hover:underline print:no-underline">
                          {row.title}
                        </Link>
                        {row.description ? <p className="mt-1 text-xs text-ink-500">{row.description}</p> : null}
                      </td>
                      <td className="p-3">{row.pic ?? "—"}</td>
                      <td className="p-3">{row.location ?? "—"}</td>
                      <td className="p-3 text-ink-700">{row.notes ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
