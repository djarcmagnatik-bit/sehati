import type { Metadata } from "next";
import { Brand } from "@/components/brand";
import { buttonClassName } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Sedang offline",
  robots: { index: false, follow: false },
};

/** Cached by the service worker and shown when a page cannot load. Contains no personal data. */
export default function OfflinePage() {
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-5 px-4 text-center">
      <Brand />
      <h1 className="font-display text-3xl font-semibold">Kamu sedang offline</h1>
      <p className="text-ink-700">
        Halaman ini butuh koneksi internet supaya data rencana pernikahan kalian selalu yang terbaru. Periksa koneksi, lalu coba lagi.
      </p>
      {/*
        Works without JavaScript: offline, this page is served from the cache for whatever URL was
        requested, and its client scripts may not be cached. A GET form without an action reloads
        that same URL.
      */}
      <form method="get">
        <button type="submit" className={buttonClassName("primary")}>
          Coba lagi
        </button>
      </form>
    </main>
  );
}
