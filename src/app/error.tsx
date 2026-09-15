"use client";

import { Button } from "@/components/ui/button";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="font-display text-3xl font-semibold">Ada yang tidak beres</h1>
      <p className="text-ink-700">Terjadi kesalahan saat memuat halaman ini. Silakan coba lagi.</p>
      <Button onClick={() => reset()}>Coba lagi</Button>
    </main>
  );
}
