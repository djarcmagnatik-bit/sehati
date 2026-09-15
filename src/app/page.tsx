import type { Metadata } from "next";
import Link from "next/link";
import { Brand } from "@/components/brand";
import { buttonClassName } from "@/components/ui/button";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

const FEATURES = [
  {
    title: "Satu workspace berdua",
    body: "Kamu dan pasangan bekerja di data yang sama. Perubahan satu orang langsung terlihat oleh yang lain.",
  },
  {
    title: "Hitung mundur yang jelas",
    body: "Tanggal pernikahan menjadi pusat semua persiapan, dari countdown hingga tenggat tugas.",
  },
  {
    title: "Rapi sampai hari H",
    body: "Checklist, budget, vendor, tamu, dan undangan digital disusun bertahap dalam satu tempat.",
  },
] as const;

export default function HomePage() {
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-5">
        <Brand />
        <nav aria-label="Akun" className="flex items-center gap-1 sm:gap-2">
          <Link href="/login" className={buttonClassName("ghost", "px-3 sm:px-5")}>
            Masuk
          </Link>
          <Link href="/register" className={buttonClassName("primary", "px-4 sm:px-5")}>
            Daftar
          </Link>
        </nav>
      </header>

      <main id="main" className="mx-auto max-w-5xl px-4 pb-20">
        <section className="grid items-center gap-10 py-8 md:grid-cols-2 md:py-16">
          <div>
            <p className="text-sm font-semibold uppercase tracking-widest text-clay-700">Wedding planner untuk berdua</p>
            <h1 className="mt-3 font-display text-4xl font-semibold leading-tight text-balance sm:text-5xl">
              Satu ruang kerja untuk menyiapkan hari bahagia kalian.
            </h1>
            <p className="mt-4 text-lg text-ink-700">{SITE.description}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/register" className={buttonClassName("primary", "px-6")}>
                Mulai rencanakan
              </Link>
              <Link href="/login" className={buttonClassName("secondary", "px-6")}>
                Saya sudah punya akun
              </Link>
            </div>
          </div>

          {/* Decorative illustration of the dashboard header. */}
          <div aria-hidden="true" className="rounded-[2rem] bg-gradient-to-br from-clay-100 via-cream-100 to-sage-100 p-6 ring-1 ring-cream-200">
            <div className="rounded-3xl bg-white/85 p-6 shadow-sm">
              <p className="text-sm font-medium text-clay-700">Halo, Fajar</p>
              <p className="mt-2 font-display text-3xl font-semibold">Putri &amp; Fajar</p>
              <p className="mt-1 text-sm text-ink-500">Senin, 20 Desember 2027</p>
              <p className="mt-6 font-display text-6xl font-semibold text-clay-700">120</p>
              <p className="text-ink-700">hari menuju hari bahagia</p>
            </div>
          </div>
        </section>

        <section aria-labelledby="features-heading" className="py-8">
          <h2 id="features-heading" className="font-display text-2xl font-semibold">
            Dirancang untuk dikerjakan bersama
          </h2>
          <ul className="mt-6 grid gap-4 sm:grid-cols-3">
            {FEATURES.map((feature) => (
              <li key={feature.title} className="rounded-3xl border border-cream-200 bg-white p-5">
                <h3 className="font-semibold text-ink-900">{feature.title}</h3>
                <p className="mt-2 text-sm text-ink-700">{feature.body}</p>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer className="border-t border-cream-200 px-4 py-6 text-center text-sm text-ink-500">{SITE.name}</footer>
    </div>
  );
}
