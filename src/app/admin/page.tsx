import type { Metadata } from "next";
import Link from "next/link";
import { AdminPageHeader } from "@/components/admin/admin-ui";
import { buttonClassName } from "@/components/ui/button";
import { formatDateTime } from "@/lib/dates";
import { formatRupiah } from "@/lib/money";
import { requireAdminPage } from "@/server/admin/admin-access";
import { getAdminStats } from "@/server/admin/admin-stats-service";

export const metadata: Metadata = { title: "Dashboard" };

function Stat({ label, value, hint, testId }: { label: string; value: string; hint?: string; testId: string }) {
  return (
    <div className="rounded-3xl border border-cream-200 bg-white p-5">
      <dt className="text-sm text-ink-500">{label}</dt>
      <dd className="mt-1 font-display text-3xl font-semibold tabular-nums" data-testid={testId}>
        {value}
      </dd>
      {hint ? <p className="mt-1 text-xs text-ink-500">{hint}</p> : null}
    </div>
  );
}

export default async function AdminDashboardPage({ searchParams }: { searchParams: Promise<{ fresh?: string }> }) {
  const admin = await requireAdminPage();
  const params = await searchParams;
  const stats = await getAdminStats(admin.id, { fresh: params.fresh === "1" });
  const number = (value: number) => value.toLocaleString("id-ID");

  return (
    <>
      <AdminPageHeader
        title="Dashboard admin"
        description={`Diperbarui ${formatDateTime(stats.generatedAt)} · angka disimpan sementara 5 menit.`}
        action={
          <Link href="/admin?fresh=1" className={buttonClassName("secondary", "min-h-10")} prefetch={false}>
            Muat ulang angka
          </Link>
        }
      />
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Pengguna" value={number(stats.totalUsers)} hint={`${number(stats.suspendedUsers)} disuspend`} testId="stat-users" />
        <Stat label="Pernikahan" value={number(stats.totalWeddings)} hint={`${number(stats.activeWeddings)} masih direncanakan`} testId="stat-weddings" />
        <Stat
          label="Pernikahan berbayar"
          value={number(stats.paidWeddings)}
          hint={stats.conversionRate === null ? "Belum ada pernikahan" : `Konversi ${stats.conversionRate.toLocaleString("id-ID")}%`}
          testId="stat-paid-weddings"
        />
        <Stat label="Pendapatan" value={formatRupiah(stats.revenue)} hint={`${number(stats.paidTransactions)} transaksi lunas`} testId="stat-revenue" />
        <Stat label="Undangan terbit" value={number(stats.invitationsPublished)} testId="stat-invitations" />
        <Stat label="RSVP masuk" value={number(stats.rsvpSubmissions)} testId="stat-rsvp" />
      </dl>
      <p className="text-xs text-ink-500">
        Pendapatan menjumlahkan transaksi berstatus lunas; transaksi yang dikembalikan tidak dihitung.
      </p>
    </>
  );
}
