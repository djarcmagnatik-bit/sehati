"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

type NavItem = { href: string; match: readonly string[]; label: string; icon: string };

const ICONS = {
  home: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-9.5Z",
  checklist: "M9 6h11M9 12h11M9 18h11M3.5 6l1.5 1.5L7.5 5M3.5 12l1.5 1.5 2.5-2.5M3.5 18l1.5 1.5 2.5-2.5",
  budget:
    "M3 7.5A2.5 2.5 0 0 1 5.5 5h13A2.5 2.5 0 0 1 21 7.5V9h-4.5a3 3 0 0 0 0 6H21v1.5a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 16.5v-9ZM16.5 12h.01",
  vendor: "M4 9.5 5.5 4h13L20 9.5M4 9.5h16M4 9.5v10h16v-10M9.5 19.5v-5h5v5",
  guests: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm-6 9a6 6 0 0 1 12 0M16 4.5a3.5 3.5 0 0 1 0 6.5M18 14.5a6 6 0 0 1 3 5.5",
  account: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-8 9a8 8 0 0 1 16 0",
  more: "M5 12h.01M12 12h.01M19 12h.01",
} as const;

const DESKTOP_ITEMS: NavItem[] = [
  { href: "/dashboard", match: ["/dashboard"], label: "Beranda", icon: ICONS.home },
  { href: "/checklist", match: ["/checklist"], label: "Checklist", icon: ICONS.checklist },
  { href: "/budget", match: ["/budget"], label: "Budget", icon: ICONS.budget },
  { href: "/vendors", match: ["/vendors"], label: "Vendor", icon: ICONS.vendor },
  { href: "/guests", match: ["/guests"], label: "Tamu", icon: ICONS.guests },
  { href: "/more", match: ["/more", "/settings", "/activity"], label: "Lainnya", icon: ICONS.more },
];

// PRD mobile navigation: Home, Checklist, Budget, Guests, More.
const MOBILE_ITEMS: NavItem[] = [
  { href: "/dashboard", match: ["/dashboard"], label: "Beranda", icon: ICONS.home },
  { href: "/checklist", match: ["/checklist"], label: "Checklist", icon: ICONS.checklist },
  { href: "/budget", match: ["/budget"], label: "Budget", icon: ICONS.budget },
  { href: "/guests", match: ["/guests"], label: "Tamu", icon: ICONS.guests },
  { href: "/more", match: ["/more", "/vendors", "/settings", "/activity"], label: "Lainnya", icon: ICONS.more },
];

function isActive(pathname: string, match: readonly string[]): boolean {
  return match.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function NavIcon({ path }: { path: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d={path} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function DesktopNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Navigasi utama" className="hidden sm:block">
      <ul className="flex items-center gap-0.5 lg:gap-1">
        {DESKTOP_ITEMS.map((item) => {
          const active = isActive(pathname, item.match);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded-full px-2.5 py-2 text-sm font-medium lg:px-4",
                  active ? "bg-clay-50 text-clay-700" : "text-ink-700 hover:bg-cream-100",
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function MobileNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Navigasi utama"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-cream-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden"
    >
      <ul className="mx-auto flex max-w-md items-stretch justify-around">
        {MOBILE_ITEMS.map((item) => {
          const active = isActive(pathname, item.match);
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-16 flex-col items-center justify-center gap-1 text-xs font-medium",
                  active ? "text-clay-700" : "text-ink-500",
                )}
              >
                <NavIcon path={item.icon} />
                <span className={active ? "font-semibold" : undefined}>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
