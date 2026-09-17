import Link from "next/link";
import { cn } from "@/lib/cn";

/** Server-rendered: the unread count comes with the page, no client polling. */
export function NotificationBell({ unread }: { unread: number }) {
  const label = unread > 0 ? `Notifikasi, ${unread} belum dibaca` : "Notifikasi";
  return (
    <Link
      href="/notifications"
      aria-label={label}
      data-testid="notification-bell"
      className="relative inline-flex size-10 items-center justify-center rounded-full text-ink-700 hover:bg-cream-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-clay-600"
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.75">
        <path
          d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16Zm4 4a2 2 0 0 0 4 0"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {unread > 0 ? (
        <span
          aria-hidden="true"
          data-testid="notification-count"
          className={cn(
            "absolute -top-0.5 -right-0.5 inline-flex min-w-5 items-center justify-center rounded-full bg-clay-600 px-1 text-[11px] font-semibold leading-5 text-white",
          )}
        >
          {unread > 99 ? "99+" : unread}
        </span>
      ) : null}
    </Link>
  );
}
