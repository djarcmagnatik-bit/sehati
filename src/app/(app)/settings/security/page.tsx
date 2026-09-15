import type { Metadata } from "next";
import { SettingsNav } from "@/components/app/settings-nav";
import { buttonClassName } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatDateTime } from "@/lib/dates";
import { describeUserAgent } from "@/lib/user-agent";
import { revokeOtherSessionsAction, revokeSessionAction } from "@/server/actions/session-actions";
import { requireSession } from "@/server/auth/session-cookie";
import { listUserSessions } from "@/server/auth/session-service";

export const metadata: Metadata = { title: "Akun & keamanan" };

export default async function SecurityPage() {
  const session = await requireSession();
  const sessions = await listUserSessions(session.user.id);
  const hasOtherSessions = sessions.some((item) => item.id !== session.sessionId);

  return (
    <div className="space-y-6">
      <header className="space-y-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">Akun &amp; keamanan</h1>
          <p className="mt-1 text-ink-700">Masuk sebagai {session.user.email}</p>
        </div>
        <SettingsNav />
      </header>

      <Card
        title="Sesi aktif"
        description="Perangkat yang sedang masuk ke akun kamu. Keluarkan perangkat yang tidak kamu kenali."
      >
        <ul className="divide-y divide-cream-200">
          {sessions.map((item) => {
            const isCurrent = item.id === session.sessionId;
            return (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                <div>
                  <p className="font-medium">
                    {describeUserAgent(item.userAgent)}
                    {isCurrent ? (
                      <span className="ml-2 rounded-full bg-sage-100 px-2 py-0.5 text-xs font-semibold text-sage-700">
                        Perangkat ini
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 text-sm text-ink-500">
                    Terakhir aktif {formatDateTime(item.lastSeenAt)} · Masuk {formatDateTime(item.createdAt)}
                    {item.ipAddress ? ` · IP ${item.ipAddress}` : ""}
                  </p>
                </div>
                {!isCurrent ? (
                  <form action={revokeSessionAction}>
                    <input type="hidden" name="sessionId" value={item.id} />
                    <button type="submit" className={buttonClassName("danger", "min-h-10 px-4")}>
                      Keluarkan
                    </button>
                  </form>
                ) : null}
              </li>
            );
          })}
        </ul>
        {hasOtherSessions ? (
          <form action={revokeOtherSessionsAction} className="mt-4">
            <button type="submit" className={buttonClassName("secondary")}>
              Keluar dari semua perangkat lain
            </button>
          </form>
        ) : null}
      </Card>
    </div>
  );
}
