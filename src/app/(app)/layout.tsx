import type { Metadata } from "next";
import type { ReactNode } from "react";
import { DesktopNav, MobileNav } from "@/components/app/nav-links";
import { Brand } from "@/components/brand";
import { buttonClassName } from "@/components/ui/button";
import { logoutAction } from "@/server/actions/auth-actions";
import { requireSession } from "@/server/auth/session-cookie";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function AppLayout({ children }: { children: ReactNode }) {
  // Layouts are not a security boundary (they don't re-run on every navigation);
  // each page and action re-checks the session itself.
  const session = await requireSession();

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-cream-200 bg-cream-50/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4">
          <Brand href="/dashboard" />
          <DesktopNav />
          <div className="flex items-center gap-2">
            <span className="hidden text-sm text-ink-700 md:inline">{session.user.name}</span>
            <form action={logoutAction}>
              <button type="submit" className={buttonClassName("ghost", "min-h-10 px-3")}>
                Keluar
              </button>
            </form>
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-5xl px-4 pb-28 pt-6 sm:pb-12">
        {children}
      </main>
      <MobileNav />
    </div>
  );
}
