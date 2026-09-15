import type { ReactNode } from "react";
import { Brand } from "@/components/brand";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="px-4 py-5">
        <div className="mx-auto max-w-md">
          <Brand />
        </div>
      </header>
      <main id="main" className="flex flex-1 justify-center px-4 pb-16 pt-2 sm:items-center">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}
