import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { InvitationStatusBadge, RsvpBadge } from "@/components/guests/guest-badges";
import { Alert, type AlertTone } from "@/components/ui/alert";
import { buttonClassName } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { GUEST_SORTS, GUEST_SORT_LABEL, guestsHref, parseGuestFilters } from "@/lib/guest-filters";
import {
  EDITABLE_INVITATION_STATUSES,
  GUEST_INVITATION_LABEL,
  GUEST_INVITATION_STATUSES,
  GUEST_RSVP_LABEL,
  GUEST_RSVP_STATUSES,
  type GuestRsvpStatusValue,
  seatLabel,
} from "@/lib/guests";
import { bulkUpdateGuestStatusAction, initializeGuestGroupsAction } from "@/server/actions/guest-actions";
import { requireSession } from "@/server/auth/session-cookie";
import { getGuestGroupOptions, getGuestSummary, listGuests } from "@/server/guests/guest-service";
import { getRsvpOverview } from "@/server/rsvp/rsvp-service";
import { getActiveWeddingForUser } from "@/server/wedding/wedding-service";

export const metadata: Metadata = { title: "Tamu" };

const NOTICES: Record<string, (count: number) => { tone: AlertTone; message: string }> = {
  created: () => ({ tone: "success", message: "Tamu ditambahkan." }),
  deleted: () => ({ tone: "success", message: "Tamu dihapus." }),
  imported: (count) => ({ tone: "success", message: `${count} undangan tamu berhasil diimpor.` }),
  bulk_updated: (count) => ({ tone: "success", message: `Status ${count} undangan diperbarui.` }),
  bulk_none: () => ({ tone: "error", message: "Pilih minimal satu tamu untuk diubah statusnya." }),
  groups_initialized: () => ({ tone: "success", message: "Grup tamu disiapkan." }),
};

const INPUT_CLASS =
  "block min-h-11 w-full rounded-xl border border-cream-300 bg-white px-3 text-base text-ink-900 focus:outline-2 focus:outline-offset-1 focus:outline-clay-600";

function Stat({ label, value, sub, testId }: { label: string; value: number; sub?: string; testId: string }) {
  return (
    <div>
      <dt className="text-xs text-ink-500">{label}</dt>
      <dd className="mt-0.5">
        <span data-testid={testId} className="font-display text-2xl font-semibold text-ink-900">
          {value.toLocaleString("id-ID")}
        </span>
        {sub ? <span className="ml-1 text-xs text-ink-500">{sub}</span> : null}
      </dd>
    </div>
  );
}

export default async function GuestsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  const membership = await getActiveWeddingForUser(session.user.id);
  if (!membership) redirect("/onboarding");

  const { wedding } = membership;
  const params = await searchParams;
  const filters = parseGuestFilters(params);
  const count = Number.parseInt(typeof params.count === "string" ? params.count : "", 10) || 0;
  const notice = typeof params.notice === "string" ? NOTICES[params.notice]?.(count) : undefined;

  const [summary, list, groups, rsvp] = await Promise.all([
    getGuestSummary(session.user.id, wedding.id),
    listGuests(session.user.id, wedding.id, filters),
    getGuestGroupOptions(session.user.id, wedding.id),
    getRsvpOverview(session.user.id, wedding.id),
  ]);
  const lastPage = Math.max(1, Math.ceil(list.total / list.pageSize));
  const hasFilters = filters.rsvp !== "all" || filters.invitation !== "all" || filters.group !== null || filters.q !== "";

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">Tamu</h1>
          <p className="mt-1 text-ink-700">Satu undangan bisa untuk beberapa orang, jadi undangan dan kursi dihitung terpisah.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/reports/guests" className={buttonClassName("ghost")}>
            Laporan & unduh
          </Link>
          <Link href="/guests/groups" className={buttonClassName("ghost")}>
            Kelola grup
          </Link>
          <Link href="/guests/import" className={buttonClassName("secondary")}>
            Impor CSV/XLSX
          </Link>
          <Link href="/guests/new" className={buttonClassName("primary")}>
            + Tambah tamu
          </Link>
        </div>
      </header>

      {notice ? <Alert tone={notice.tone}>{notice.message}</Alert> : null}

      {!wedding.guestGroupsInitializedAt ? (
        <Card title="Grup tamu belum disiapkan" description="Buat grup standar seperti Keluarga Mempelai Wanita/Pria, Teman, dan Rekan Kerja.">
          <form action={initializeGuestGroupsAction}>
            <input type="hidden" name="weddingId" value={wedding.id} />
            <button type="submit" className={buttonClassName("primary")}>
              Siapkan grup tamu
            </button>
          </form>
        </Card>
      ) : null}

      <section aria-label="Ringkasan tamu" className="rounded-3xl border border-cream-200 bg-white p-5 sm:p-6">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4">
          <Stat label="Undangan" value={summary.invitations} testId="guests-invitations" />
          <Stat label="Estimasi kursi (orang)" value={summary.seats} testId="guests-seats" />
          <Stat label="Undangan terkirim" value={summary.invitedInvitations} sub={`${summary.invitedSeats} kursi`} testId="guests-invited" />
          <Stat label="Belum merespons" value={summary.pendingInvitations} sub={`${summary.pendingSeats} kursi`} testId="guests-pending" />
          <Stat label="Konfirmasi hadir (undangan)" value={summary.attendingInvitations} testId="guests-attending-invitations" />
          <Stat label="Orang yang hadir" value={summary.attendingSeats} testId="guests-attending-seats" />
          <Stat label="Mungkin hadir" value={summary.maybeInvitations} testId="guests-maybe" />
          <Stat label="Tidak hadir" value={summary.declinedInvitations} testId="guests-declined" />
        </dl>
        {summary.unsetSeatInvitations > 0 ? (
          <p className="mt-4 text-xs text-ink-500" data-testid="guests-unset-seats">
            {summary.unsetSeatInvitations.toLocaleString("id-ID")} undangan belum diisi jumlah kursinya; di estimasi masing-masing
            dihitung 1 orang.
          </p>
        ) : null}
      </section>

      {rsvp.latest.length > 0 ? (
        <section aria-labelledby="rsvp-latest" className="rounded-3xl border border-cream-200 bg-white p-5 sm:p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="rsvp-latest" className="font-display text-xl font-semibold">
              Konfirmasi terbaru
            </h2>
            <p className="text-sm text-ink-500">
              <span data-testid="guests-responded">{rsvp.responded}</span> dari {summary.invitations} undangan sudah menjawab
            </p>
          </div>
          <ul className="mt-3 divide-y divide-cream-200">
            {rsvp.latest.map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2.5">
                <div className="min-w-0">
                  <Link
                    href={`/guests/${entry.guestId}`}
                    className="font-medium text-ink-900 underline-offset-4 hover:underline"
                  >
                    {entry.invitationName}
                  </Link>
                  {entry.message ? <p className="truncate text-xs text-ink-500">“{entry.message}”</p> : null}
                </div>
                <RsvpBadge status={entry.rsvpStatus as GuestRsvpStatusValue} attendingCount={entry.attendingCount} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <nav aria-label="Filter RSVP">
        <ul className="flex gap-2 overflow-x-auto pb-1">
          {(["all", ...GUEST_RSVP_STATUSES] as const).map((rsvp) => {
            const active = filters.rsvp === rsvp;
            return (
              <li key={rsvp}>
                <Link
                  href={guestsHref(filters, { rsvp, page: 1 })}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex min-h-10 items-center whitespace-nowrap rounded-full px-4 text-sm font-medium",
                    active ? "bg-ink-900 text-white" : "bg-white text-ink-700 ring-1 ring-cream-300 hover:bg-cream-100",
                  )}
                >
                  {rsvp === "all" ? "Semua" : GUEST_RSVP_LABEL[rsvp]}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <form
        method="get"
        action="/guests"
        role="search"
        className="grid gap-3 rounded-3xl border border-cream-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-[1fr_12rem_12rem_12rem_auto] lg:items-end"
      >
        {filters.rsvp !== "all" ? <input type="hidden" name="rsvp" value={filters.rsvp} /> : null}
        <div className="space-y-1.5">
          <label htmlFor="guest-q" className="block text-sm font-medium">
            Cari tamu
          </label>
          <input id="guest-q" type="search" name="q" defaultValue={filters.q} maxLength={100} placeholder="Nama atau nomor HP" className={INPUT_CLASS} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="guest-group" className="block text-sm font-medium">
            Grup
          </label>
          <select id="guest-group" name="group" defaultValue={filters.group ?? ""} className={INPUT_CLASS}>
            <option value="">Semua grup</option>
            <option value="none">Tanpa grup</option>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="guest-invitation" className="block text-sm font-medium">
            Status undangan
          </label>
          <select id="guest-invitation" name="invitation" defaultValue={filters.invitation} className={INPUT_CLASS}>
            <option value="all">Semua status</option>
            {GUEST_INVITATION_STATUSES.map((status) => (
              <option key={status} value={status}>
                {GUEST_INVITATION_LABEL[status]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="guest-sort" className="block text-sm font-medium">
            Urutkan
          </label>
          <select id="guest-sort" name="sort" defaultValue={filters.sort} className={INPUT_CLASS}>
            {GUEST_SORTS.map((sort) => (
              <option key={sort} value={sort}>
                {GUEST_SORT_LABEL[sort]}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className={buttonClassName("secondary")}>
          Terapkan
        </button>
      </form>

      {list.items.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-cream-300 bg-white p-6 text-center">
          <p className="text-ink-700">{hasFilters ? "Tidak ada tamu yang cocok." : "Belum ada tamu. Tambahkan satu per satu atau impor dari file."}</p>
        </div>
      ) : (
        <form action={bulkUpdateGuestStatusAction} className="space-y-3">
          <input type="hidden" name="weddingId" value={wedding.id} />
          <input type="hidden" name="returnTo" value={guestsHref(filters)} />
          <div className="flex flex-wrap items-end justify-between gap-3 rounded-3xl bg-cream-100 p-3">
            <p className="text-sm text-ink-700">
              {list.total.toLocaleString("id-ID")} undangan{hasFilters ? " cocok dengan filter" : ""}
            </p>
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1">
                <label htmlFor="bulk-status" className="block text-xs font-medium text-ink-700">
                  Ubah status undangan terpilih
                </label>
                <select id="bulk-status" name="status" defaultValue="SENT" className={cn(INPUT_CLASS, "min-h-10")}>
                  {EDITABLE_INVITATION_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {GUEST_INVITATION_LABEL[status]}
                    </option>
                  ))}
                </select>
              </div>
              <button type="submit" className={buttonClassName("secondary", "min-h-10")}>
                Terapkan ke terpilih
              </button>
            </div>
          </div>
          <ul className="divide-y divide-cream-200 rounded-3xl border border-cream-200 bg-white px-4">
            {list.items.map((guest) => (
              <li key={guest.id} className="flex items-start gap-3 py-3">
                <div className="flex min-h-11 items-center">
                  <label htmlFor={`guest-${guest.id}`} className="sr-only">
                    Pilih {guest.invitationName}
                  </label>
                  <input id={`guest-${guest.id}`} type="checkbox" name="guestIds" value={guest.id} className="size-5 accent-clay-600" />
                </div>
                <div className="min-w-0 flex-1 pt-2">
                  <Link href={`/guests/${guest.id}`} className="font-medium text-ink-900 underline-offset-4 hover:underline">
                    {guest.invitationName}
                  </Link>
                  <p className="mt-0.5 text-xs text-ink-500">
                    {[guest.guestName !== guest.invitationName ? guest.guestName : null, guest.group?.name ?? "Tanpa grup", guest.phone]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    <RsvpBadge status={guest.rsvpStatus} attendingCount={guest.attendingCount} />
                    <InvitationStatusBadge status={guest.invitationStatus} />
                  </div>
                </div>
                <p className="shrink-0 pt-2 text-sm font-semibold text-ink-900">
                  {guest.seatCount === null ? (
                    <>
                      <span aria-hidden="true">– kursi</span>
                      <span className="sr-only">{seatLabel(null)}</span>
                    </>
                  ) : (
                    seatLabel(guest.seatCount)
                  )}
                </p>
              </li>
            ))}
          </ul>
        </form>
      )}

      {lastPage > 1 ? (
        <nav aria-label="Halaman" className="flex items-center justify-between gap-3">
          {list.page > 1 ? (
            <Link href={guestsHref(filters, { page: list.page - 1 })} className={buttonClassName("secondary")}>
              ← Sebelumnya
            </Link>
          ) : (
            <span />
          )}
          <span className="text-sm text-ink-500">
            Halaman {list.page} dari {lastPage}
          </span>
          {list.page < lastPage ? (
            <Link href={guestsHref(filters, { page: list.page + 1 })} className={buttonClassName("secondary")}>
              Berikutnya →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </div>
  );
}
