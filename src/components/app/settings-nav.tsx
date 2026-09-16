"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const ITEMS = [
  { href: "/settings/security", label: "Keamanan akun" },
  { href: "/settings/wedding", label: "Pernikahan" },
  { href: "/settings/partner", label: "Pasangan" },
  { href: "/billing", label: "Akses & pembayaran" },
] as const;

export function SettingsNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Pengaturan">
      <ul className="flex gap-2 overflow-x-auto">
        {ITEMS.map((item) => {
          const active = pathname === item.href;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-10 items-center whitespace-nowrap rounded-full px-4 text-sm font-medium",
                  active ? "bg-ink-900 text-white" : "bg-white text-ink-700 ring-1 ring-cream-300 hover:bg-cream-100",
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
