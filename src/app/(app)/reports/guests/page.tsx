import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ExportLinks } from "@/components/reports/export-links";
import { REPORT_TABLE_CLASS, REPORT_TD_CLASS, REPORT_TH_CLASS, ReportHeader } from "@/components/reports/report-header";
import { Card } from "@/components/ui/card";
import { formatCoupleName } from "@/lib/couple";
import { formatDateTime } from "@/lib/dates";
import { GUEST_RSVP_LABEL } from "@/lib/guests";
import { requireSession } from "@/server/auth/session-cookie";
import { getGuestSummary } from "@/server/guests/guest-service";
import { getGuestReport } from "@/server/reports/report-service";
import { getActiveWeddingForUser } from "@/server/wedding/wedding-service";

export const metadata: Metadata = { title: "Laporan tamu" };

function Count({ label, value, testId }: { label: string; value: number; testId?: string }) {
  return (
    <div>
      <dt className="text-xs text-ink-500">{label}</dt>
      <dd data-testid={testId} className="mt-0.5 text-lg font-semibold tabular-nums">
        {value.toLocaleString("id-ID")}
      </dd>
    </div>
  );
}

export default async function GuestReportPage() {
  const session = await requireSession();
  const membership = await getActiveWeddingForUser(session.user.id);
  if (!membership) redirect("/onboarding");
  const { wedding } = membership;
  const [summary, report] = await Promise.all([getGuestSummary(session.user.id, wedding.id), getGuestReport(session.user.id, wedding.id)]);
  const coupleName = formatCoupleName({
    brideName: wedding.brideName,
    groomName: wedding.groomName,
    format: wedding.coupleDisplayFormat,
    customDisplayName: wedding.customDisplayName,
  });

  return (
    <div className="space-y-6">
      <ReportHeader
        title="Laporan tamu"
        description="Undangan, kursi, dan RSVP — lengkap dengan daftar tamu siap cetak."
        printedFor={`${coupleName} · dicetak ${formatDateTime(new Date(), wedding.timeZone)}`}
        actions={<ExportLinks dataset="guests" />}
      />

      <Card title="Ringkasan">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <Count label="Undangan" value={summary.invitations} testId="guest-report-invitations" />
          <Count label="Kursi" value={summary.seats} testId="guest-report-seats" />
          <Count label="Hadir (orang)" value={summary.attendingSeats} testId="guest-report-attending" />
          <Count label="Mungkin hadir" value={summary.maybeInvitations} />
          <Count label="Tidak hadir" value={summary.declinedInvitations} testId="guest-report-declined" />
          <Count label="Belum merespons" value={summary.pendingInvitations} testId="guest-report-pending" />
        </dl>
      </Card>

      {report.groups.length > 0 ? (
        <section className="space-y-3">
          <h2 className="font-display text-xl font-semibold">Per grup</h2>
          <div className="overflow-x-auto rounded-3xl border border-cream-200 bg-white p-4 print:border-0 print:p-0">
            <table className={REPORT_TABLE_CLASS}>
              <caption className="sr-only">Tamu per grup</caption>
              <thead>
                <tr>
                  <th scope="col" className={REPORT_TH_CLASS}>Grup</th>
                  <th scope="col" className={`${REPORT_TH_CLASS} text-right`}>Undangan</th>
                  <th scope="col" className={`${REPORT_TH_CLASS} text-right`}>Kursi</th>
                  <th scope="col" className={`${REPORT_TH_CLASS} text-right`}>Hadir</th>
                  <th scope="col" className={`${REPORT_TH_CLASS} text-right`}>Tidak hadir</th>
                  <th scope="col" className={`${REPORT_TH_CLASS} text-right`}>Belum merespons</th>
                </tr>
              </thead>
              <tbody>
                {report.groups.map((group) => (
                  <tr key={group.name}>
                    <th scope="row" className={`${REPORT_TD_CLASS} font-medium`}>{group.name}</th>
                    <td className={`${REPORT_TD_CLASS} text-right tabular-nums`}>{group.invitations}</td>
                    <td className={`${REPORT_TD_CLASS} text-right tabular-nums`}>{group.seats}</td>
                    <td className={`${REPORT_TD_CLASS} text-right tabular-nums`}>{group.attendingSeats}</td>
                    <td className={`${REPORT_TD_CLASS} text-right tabular-nums`}>{group.declined}</td>
                    <td className={`${REPORT_TD_CLASS} text-right tabular-nums`}>{group.pending}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="space-y-3 print:break-before-page">
        <h2 className="font-display text-xl font-semibold">Daftar tamu</h2>
        {report.guests.length === 0 ? (
          <p className="text-sm text-ink-700">Belum ada tamu.</p>
        ) : (
          <div className="overflow-x-auto rounded-3xl border border-cream-200 bg-white p-4 print:border-0 print:p-0">
            <table className={REPORT_TABLE_CLASS} data-testid="guest-report-list">
              <caption className="sr-only">Daftar tamu</caption>
              <thead>
                <tr>
                  <th scope="col" className={`${REPORT_TH_CLASS} w-10`}>No</th>
                  <th scope="col" className={REPORT_TH_CLASS}>Nama di undangan</th>
                  <th scope="col" className={REPORT_TH_CLASS}>Grup</th>
                  <th scope="col" className={`${REPORT_TH_CLASS} text-right`}>Kursi</th>
                  <th scope="col" className={REPORT_TH_CLASS}>RSVP</th>
                  <th scope="col" className={REPORT_TH_CLASS}>Telepon</th>
                </tr>
              </thead>
              <tbody>
                {report.guests.map((guest, index) => (
                  <tr key={guest.id} className="break-inside-avoid">
                    <td className={`${REPORT_TD_CLASS} tabular-nums text-ink-500`}>{index + 1}</td>
                    <th scope="row" className={`${REPORT_TD_CLASS} font-medium`}>{guest.invitationName}</th>
                    <td className={REPORT_TD_CLASS}>{guest.group?.name ?? "—"}</td>
                    <td className={`${REPORT_TD_CLASS} text-right tabular-nums`}>{guest.seatCount ?? "–"}</td>
                    <td className={REPORT_TD_CLASS}>
                      {GUEST_RSVP_LABEL[guest.rsvpStatus]}
                      {guest.rsvpStatus === "ATTENDING" ? ` (${guest.attendingCount})` : ""}
                    </td>
                    <td className={`${REPORT_TD_CLASS} whitespace-nowrap`}>{guest.phone ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
