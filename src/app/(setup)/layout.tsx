import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Brand } from "@/components/brand";
import { buttonClassName } from "@/components/ui/button";
import { logoutAction } from "@/server/actions/auth-actions";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function SetupLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-2xl items-center justify-between gap-4 px-4 py-5">
        <Brand href="/onboarding" />
        <form action={logoutAction}>
          <button type="submit" className={buttonClassName("ghost", "min-h-10 px-3")}>
            Keluar
          </button>
        </form>
      </header>
      <main id="main" className="mx-auto max-w-2xl px-4 pb-16">
        {children}
      </main>
    </div>
  );
}
