import type { Metadata } from "next";
import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { buttonClassName } from "@/components/ui/button";
import { formatRelativeTime } from "@/lib/activity";
import { cn } from "@/lib/cn";
import { NOTIFICATION_TYPE_LABEL } from "@/lib/notifications";
import { markAllNotificationsReadAction, openNotificationAction } from "@/server/actions/notification-actions";
import { requireSession } from "@/server/auth/session-cookie";
import { listNotifications } from "@/server/notifications/notification-service";

export const metadata: Metadata = { title: "Notifikasi" };

type PageProps = { searchParams: Promise<{ page?: string | string[]; notice?: string | string[] }> };

export default async function NotificationsPage({ searchParams }: PageProps) {
  // No workspace needed: an invitation to someone else's wedding arrives before joining one.
  const session = await requireSession();
  const params = await searchParams;
  const requested = Number.parseInt(typeof params.page === "string" ? params.page : "1", 10);
  const result = await listNotifications(session.user.id, requested || 1);
  const lastPage = Math.max(1, Math.ceil(result.total / result.pageSize));
  const now = new Date();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold">Notifikasi</h1>
          <p className="mt-1 text-ink-700" data-testid="unread-summary">
            {result.unread > 0 ? `${result.unread} belum dibaca` : "Semua sudah dibaca"}
          </p>
        </div>
        {result.unread > 0 ? (
          <form action={markAllNotificationsReadAction}>
            <button type="submit" className={buttonClassName("secondary", "min-h-10")}>
              Tandai semua dibaca
            </button>
          </form>
        ) : null}
      </header>

      {params.notice === "all_read" ? <Alert tone="success">Semua notifikasi ditandai sudah dibaca.</Alert> : null}

      {result.items.length === 0 ? (
        <p className="rounded-3xl border border-cream-200 bg-white p-6 text-sm text-ink-700">
          Belum ada notifikasi. Pengingat tugas, pembayaran, dan RSVP akan muncul di sini.
        </p>
      ) : (
        <ul className="divide-y divide-cream-200 overflow-hidden rounded-3xl border border-cream-200 bg-white" aria-label="Daftar notifikasi">
          {result.items.map((item) => {
            const unread = item.readAt === null;
            return (
              <li key={item.id}>
                <form action={openNotificationAction}>
                  <input type="hidden" name="notificationId" value={item.id} />
                  <button
                    type="submit"
                    className={cn(
                      "flex w-full items-start gap-3 px-5 py-4 text-left hover:bg-cream-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-clay-600",
                      unread && "bg-clay-50/40",
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn("mt-2 size-2 shrink-0 rounded-full", unread ? "bg-clay-600" : "bg-transparent")}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs text-ink-500">
                        {unread ? <span className="sr-only">Belum dibaca: </span> : null}
                        {NOTIFICATION_TYPE_LABEL[item.type]} · <time dateTime={item.createdAt.toISOString()}>{formatRelativeTime(item.createdAt, now)}</time>
                      </span>
                      <span className={cn("mt-0.5 block text-ink-900", unread ? "font-semibold" : "font-medium")}>{item.title}</span>
                      <span className="mt-0.5 block text-sm break-words text-ink-700">{item.body}</span>
                    </span>
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
      )}

      {lastPage > 1 ? (
        <nav aria-label="Halaman" className="flex items-center justify-between gap-3">
          {result.page > 1 ? (
            <Link href={`/notifications?page=${result.page - 1}`} className={buttonClassName("secondary")}>
              ← Lebih baru
            </Link>
          ) : (
            <span />
          )}
          <span className="text-sm text-ink-500">
            Halaman {result.page} dari {lastPage}
          </span>
          {result.page < lastPage ? (
            <Link href={`/notifications?page=${result.page + 1}`} className={buttonClassName("secondary")}>
              Lebih lama →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </div>
  );
}
