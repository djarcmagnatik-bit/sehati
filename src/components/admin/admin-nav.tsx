"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const ITEMS = [
  { href: "/admin", label: "Dashboard", exact: true },
  { href: "/admin/users", label: "Pengguna" },
  { href: "/admin/weddings", label: "Pernikahan" },
  { href: "/admin/transactions", label: "Transaksi" },
  { href: "/admin/plans", label: "Paket" },
  { href: "/admin/addons", label: "Add-on" },
  { href: "/admin/promo-codes", label: "Kode promo" },
  { href: "/admin/task-templates", label: "Template tugas" },
  { href: "/admin/themes", label: "Tema undangan" },
  { href: "/admin/audit-logs", label: "Audit log" },
] as const;

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Navigasi admin" className="-mx-4 overflow-x-auto px-4">
      <ul className="flex gap-1 pb-1">
        {ITEMS.map((item) => {
          const active = "exact" in item ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-10 items-center whitespace-nowrap rounded-full px-3 text-sm font-medium",
                  active ? "bg-ink-900 text-white" : "text-ink-700 hover:bg-cream-100",
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
