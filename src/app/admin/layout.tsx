import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { AdminNav } from "@/components/admin/admin-nav";
import { Brand } from "@/components/brand";
import { buttonClassName } from "@/components/ui/button";
import { logoutAction } from "@/server/actions/auth-actions";
import { requireAdminPage } from "@/server/admin/admin-access";

export const metadata: Metadata = {
  title: { template: "%s · Admin", default: "Admin" },
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: { children: ReactNode }) {
  // Not a security boundary on its own: every admin page and service re-checks the role.
  const admin = await requireAdminPage();

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-cream-200 bg-cream-50/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
          <div className="flex items-center gap-3">
            <Brand href="/admin" />
            <span className="rounded-full bg-ink-900 px-2 py-0.5 text-xs font-semibold text-white">Admin</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden text-sm text-ink-700 md:inline">{admin.email}</span>
            <Link href="/dashboard" className={buttonClassName("ghost", "min-h-10 px-3")}>
              Aplikasi
            </Link>
            <form action={logoutAction}>
              <button type="submit" className={buttonClassName("ghost", "min-h-10 px-3")}>
                Keluar
              </button>
            </form>
          </div>
        </div>
        <div className="mx-auto max-w-6xl px-4 pb-2">
          <AdminNav />
        </div>
      </header>
      <main id="main" className="mx-auto max-w-6xl space-y-6 px-4 pt-6 pb-16">
        {children}
      </main>
    </div>
  );
}
