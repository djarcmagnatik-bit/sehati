import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ActivityList } from "@/components/activity/activity-list";
import { MoneyStat } from "@/components/budget/money-stat";
import { DueBadge } from "@/components/checklist/due-badge";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress-bar";
import { formatCoupleName } from "@/lib/couple";
import {
  dbDateToIso,
  describeCountdown,
  formatDateTime,
  formatIsoDateLong,
  getWeddingCountdown,
  todayIsoInTimeZone,
} from "@/lib/dates";
import { formatRupiah } from "@/lib/money";
import { getRecentActivity } from "@/server/activity/activity-service";
import { requireSession } from "@/server/auth/session-cookie";
import { getBudgetOverview, getUpcomingPayments } from "@/server/budget/budget-service";
import { getChecklistSummary, getUpcomingTasks } from "@/server/checklist/task-service";
import { getGuestSummary } from "@/server/guests/guest-service";
import { getSavingsSummary } from "@/server/planning/savings-service";
import { getSeserahanSummary } from "@/server/planning/seserahan-service";
import { getVendorSummary } from "@/server/vendors/vendor-service";
import { getActiveWeddingForUser } from "@/server/wedding/wedding-service";
import { CoupleNoteForm } from "./couple-note-form";

export const metadata: Metadata = { title: "Beranda" };

const STATUS_LABEL = {
  PLANNING: "Tahap perencanaan",
  COMPLETED: "Selesai",
  ARCHIVED: "Diarsipkan",
} as const;

const ROLE_LABEL = {
  OWNER: "Pemilik workspace",
  PARTNER: "Pasangan",
} as const;

const NOTICES: Record<string, string> = {
  partner_joined: "Kamu sudah bergabung ke workspace ini. Selamat merencanakan bersama!",
};

const LINK_CLASS = "text-sm font-semibold text-clay-700 underline-offset-4 hover:underline";

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 py-3">
      <dt className="text-sm text-ink-500">{label}</dt>
      <dd className="text-sm font-medium text-ink-900">{value}</dd>
    </div>
  );
}

function CountStat({ label, value, testId }: { label: string; value: number; testId: string }) {
  return (
    <div>
      <dt className="text-xs text-ink-500">{label}</dt>
      <dd data-testid={testId} className="mt-0.5 font-semibold text-ink-900">
        {value.toLocaleString("id-ID")}
      </dd>
    </div>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string | string[] }>;
}) {
  const session = await requireSession();
  const membership = await getActiveWeddingForUser(session.user.id);
  if (!membership) redirect("/onboarding");

  const { wedding } = membership;
  const params = await searchParams;
  const notice = typeof params.notice === "string" ? NOTICES[params.notice] : undefined;
  const now = new Date();
  const weddingDateIso = dbDateToIso(wedding.weddingDate);
  const todayIso = todayIsoInTimeZone(now, wedding.timeZone);
  const countdown = getWeddingCountdown(weddingDateIso, now, wedding.timeZone);
  const coupleName = formatCoupleName({
    brideName: wedding.brideName,
    groomName: wedding.groomName,
    format: wedding.coupleDisplayFormat,
    customDisplayName: wedding.customDisplayName,
  });
  const partnerJoined = wedding.members.some((member) => member.role === "PARTNER");

  const [summary, upcomingTasks, recentActivity, budget, upcomingPayments, vendors, guests, savings, seserahan] = await Promise.all([
    getChecklistSummary(session.user.id, wedding.id, todayIso),
    getUpcomingTasks(session.user.id, wedding.id, 5),
    getRecentActivity(session.user.id, wedding.id, 5),
    getBudgetOverview(session.user.id, wedding.id),
    getUpcomingPayments(session.user.id, wedding.id, 5),
    getVendorSummary(session.user.id, wedding.id),
    getGuestSummary(session.user.id, wedding.id),
    getSavingsSummary(session.user.id, wedding.id, now),
    getSeserahanSummary(session.user.id, wedding.id),
  ]);
  const budgetTotals = budget.totals;

  return (
    <div className="space-y-6">
      {notice ? <Alert tone="success">{notice}</Alert> : null}

      <section
        aria-labelledby="couple-heading"
        className="rounded-3xl bg-gradient-to-br from-clay-50 via-cream-100 to-sage-50 p-6 ring-1 ring-cream-200 sm:p-8"
      >
        <p className="text-sm font-medium text-clay-700">Halo, {membership.displayName}</p>
        <h1 id="couple-heading" className="mt-2 font-display text-3xl font-semibold text-balance sm:text-4xl">
          {coupleName}
        </h1>
        <p className="mt-1 text-ink-700">
          <time dateTime={weddingDateIso}>{formatIsoDateLong(weddingDateIso)}</time>
        </p>
        <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
          {countdown.state === "upcoming" ? (
            <p>
              <span className="block font-display text-5xl font-semibold text-clay-700 sm:text-6xl">{countdown.days}</span>
              <span className="text-ink-700">hari menuju hari bahagia</span>
            </p>
          ) : (
            <p className="font-display text-2xl font-semibold text-clay-700">{describeCountdown(countdown)}</p>
          )}
          <span className="rounded-full bg-white/80 px-3 py-1 text-sm font-medium text-sage-700 ring-1 ring-sage-100">
            {STATUS_LABEL[wedding.status]}
          </span>
        </div>
      </section>

      {/* grid-cols-1 keeps the single-column track at minmax(0,1fr): without it a long,
          truncated task title would widen the column past the viewport on a phone. */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card title="Progres persiapan">
          {summary.total === 0 ? (
            <p className="text-sm text-ink-700">Belum ada tugas di checklist.</p>
          ) : (
            <>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-display text-4xl font-semibold text-clay-700">{summary.percent}%</p>
                <p className="text-sm text-ink-700">
                  {summary.completed} dari {summary.total} tugas selesai
                </p>
              </div>
              <ProgressBar percent={summary.percent} label="Progres persiapan" className="mt-3" />
              {summary.overdue > 0 ? (
                <p className="mt-3 text-sm font-medium text-danger-600">
                  <span aria-hidden="true">⚠ </span>
                  {summary.overdue} tugas terlambat
                </p>
              ) : null}
            </>
          )}
          <Link href="/checklist" className={`mt-4 inline-block ${LINK_CLASS}`}>
            Buka checklist
          </Link>
        </Card>

        <Card title="Tugas terdekat">
          {upcomingTasks.length === 0 ? (
            <p className="text-sm text-ink-700">Tidak ada tugas aktif dengan tenggat.</p>
          ) : (
            <ul className="divide-y divide-cream-200">
              {upcomingTasks.map((task) => (
                <li key={task.id} className="flex items-center justify-between gap-3 py-2.5">
                  <Link
                    href={`/checklist/${task.id}`}
                    className="min-w-0 truncate text-sm font-medium text-ink-900 underline-offset-4 hover:underline"
                  >
                    {task.title}
                  </Link>
                  <span className="shrink-0">
                    <DueBadge
                      dueDateIso={task.dueDate ? dbDateToIso(task.dueDate) : null}
                      status={task.status}
                      todayIso={todayIso}
                    />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Ringkasan budget">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            <MoneyStat label="Target" amount={budgetTotals.target} testId="budget-target" />
            <MoneyStat label="Dialokasikan" amount={budgetTotals.allocated} testId="budget-allocated" />
            <MoneyStat label="Komitmen" amount={budgetTotals.committed} testId="budget-committed" />
            <MoneyStat label="Sudah dibayar" amount={budgetTotals.paid} testId="budget-paid" />
            <MoneyStat label="Belum dibayar" amount={budgetTotals.unpaid} testId="budget-unpaid" />
            <MoneyStat label="Sisa budget" amount={budgetTotals.remaining} testId="budget-remaining" emptyLabel="—" />
          </dl>
          {budgetTotals.warning === "over" ? (
            <p className="mt-3 text-sm font-medium text-danger-600">⚠ Komitmen melebihi target budget</p>
          ) : budgetTotals.warning === "near" ? (
            <p className="mt-3 text-sm font-medium text-clay-700">⚠ Komitmen mendekati target budget</p>
          ) : null}
          <Link href="/budget" className={`mt-4 inline-block ${LINK_CLASS}`}>
            Buka budget
          </Link>
        </Card>

        <Card title="Pembayaran mendatang">
          {upcomingPayments.length === 0 ? (
            <p className="text-sm text-ink-700">Tidak ada tagihan yang belum lunas.</p>
          ) : (
            <ul className="divide-y divide-cream-200">
              {upcomingPayments.map((expense) => (
                <li key={expense.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <Link
                      href={`/budget/expenses/${expense.id}`}
                      className="block truncate text-sm font-medium text-ink-900 underline-offset-4 hover:underline"
                    >
                      {expense.title}
                    </Link>
                    <p className="text-xs text-ink-500">
                      {expense.vendor ? `${expense.vendor.name} · ` : ""}Sisa {formatRupiah(expense.outstanding)}
                    </p>
                  </div>
                  <span className="shrink-0">
                    {expense.dueDateIso ? (
                      <DueBadge dueDateIso={expense.dueDateIso} status="TODO" todayIso={todayIso} />
                    ) : (
                      <span className="text-xs text-ink-500">Tanpa jatuh tempo</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Tamu">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            <CountStat label="Undangan" value={guests.invitations} testId="dashboard-guests-invitations" />
            <CountStat label="Estimasi kursi" value={guests.seats} testId="dashboard-guests-seats" />
            <CountStat label="Orang yang hadir" value={guests.attendingSeats} testId="dashboard-guests-attending-seats" />
            <CountStat label="Belum merespons" value={guests.pendingInvitations} testId="dashboard-guests-pending" />
          </dl>
          <Link href="/guests" className={`mt-4 inline-block ${LINK_CLASS}`}>
            Buka daftar tamu
          </Link>
        </Card>

        <Card title="Vendor">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            <CountStat label="Dibooking" value={vendors.booked} testId="dashboard-vendors-booked" />
            <CountStat label="Kandidat dalam riset" value={vendors.researching} testId="dashboard-vendors-researching" />
            <CountStat label="Menunggu DP" value={vendors.needingDp} testId="dashboard-vendors-needing-dp" />
            <MoneyStat label="Sisa pembayaran vendor" amount={vendors.outstanding} testId="dashboard-vendors-outstanding" />
          </dl>
          <Link href="/vendors" className={`mt-4 inline-block ${LINK_CLASS}`}>
            Buka vendor
          </Link>
        </Card>

        <Card title="Tabungan & seserahan">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            <MoneyStat label="Tabungan terkumpul" amount={savings.saved} testId="dashboard-savings-saved" />
            <MoneyStat label="Kekurangan dana" amount={savings.remaining} testId="dashboard-savings-remaining" emptyLabel="—" />
            <CountStat label="Seserahan siap" value={seserahan.done} testId="dashboard-seserahan-done" />
            <CountStat label="Total barang seserahan" value={seserahan.items} testId="dashboard-seserahan-items" />
          </dl>
          {savings.percent !== null ? <ProgressBar percent={savings.percent} label="Progres tabungan" className="mt-4" /> : null}
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2">
            <Link href="/savings" className={LINK_CLASS}>
              Buka tabungan
            </Link>
            <Link href="/seserahan" className={LINK_CLASS}>
              Buka seserahan
            </Link>
            <Link href="/calendar" className={LINK_CLASS}>
              Lihat kalender
            </Link>
          </div>
        </Card>

        <Card title="Workspace berdua">
          <ul className="space-y-3">
            {wedding.members.map((member) => (
              <li key={member.id} className="flex items-center justify-between gap-3">
                <span className="font-medium">{member.displayName}</span>
                <span className="text-sm text-ink-500">{ROLE_LABEL[member.role]}</span>
              </li>
            ))}
          </ul>
          {!partnerJoined ? (
            <div className="mt-4 rounded-2xl bg-cream-100 px-4 py-3 text-sm text-ink-700">
              <p>{wedding.partnerName ?? "Pasangan kamu"} belum bergabung ke workspace ini.</p>
              {membership.role === "OWNER" ? (
                <Link href="/settings/partner" className={`mt-2 inline-block ${LINK_CLASS}`}>
                  Undang pasangan
                </Link>
              ) : null}
            </div>
          ) : null}
        </Card>

        <Card title="Detail pernikahan">
          <dl className="divide-y divide-cream-200">
            <DetailRow label="Jenis acara" value={wedding.eventType?.name ?? "Belum dipilih"} />
            <DetailRow label="Jalur pernikahan" value={wedding.marriageProcess?.name ?? "Belum dipilih"} />
            {wedding.engagementDate ? (
              <DetailRow label="Tanggal lamaran" value={formatIsoDateLong(dbDateToIso(wedding.engagementDate))} />
            ) : null}
            {wedding.receptionDate ? (
              <DetailRow label="Tanggal resepsi" value={formatIsoDateLong(dbDateToIso(wedding.receptionDate))} />
            ) : null}
          </dl>
          <Link href="/settings/wedding" className={`mt-3 inline-block ${LINK_CLASS}`}>
            Ubah tanggal pernikahan
          </Link>
        </Card>
      </div>

      <Card title="Catatan untuk berdua" description="Pesan singkat yang bisa dilihat dan diubah kalian berdua.">
        <CoupleNoteForm weddingId={wedding.id} note={wedding.coupleNote} />
        {wedding.coupleNoteUpdatedAt ? (
          <p className="mt-3 text-xs text-ink-500">
            Terakhir diperbarui {formatDateTime(wedding.coupleNoteUpdatedAt, wedding.timeZone)}
          </p>
        ) : null}
      </Card>

      <Card title="Aktivitas terbaru">
        {recentActivity.length === 0 ? (
          <p className="text-sm text-ink-700">Belum ada aktivitas.</p>
        ) : (
          <ActivityList entries={recentActivity} now={now} timeZone={wedding.timeZone} />
        )}
        <Link href="/activity" className={`mt-3 inline-block ${LINK_CLASS}`}>
          Lihat semua aktivitas
        </Link>
      </Card>
    </div>
  );
}
