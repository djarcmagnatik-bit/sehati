import Link from "next/link";
import { buttonClassName } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="font-display text-3xl font-semibold">Halaman tidak ditemukan</h1>
      <p className="text-ink-700">Halaman yang kamu cari tidak ada atau sudah dipindahkan.</p>
      <Link href="/" className={buttonClassName("primary")}>
        Kembali ke beranda
      </Link>
    </main>
  );
}
