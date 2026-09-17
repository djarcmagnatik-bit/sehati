import type { Metadata } from "next";
import Link from "next/link";
import { requireSession } from "@/server/auth/session-cookie";

export const metadata: Metadata = { title: "Lainnya" };

const SECTIONS = [
  {
    title: "Perencanaan",
    links: [
      { href: "/calendar", label: "Kalender", description: "Tenggat, pembayaran, janji vendor, dan acara dalam satu tampilan." },
      { href: "/invitation", label: "Undangan digital", description: "Isi, tema, dan tautan undangan publik." },
      { href: "/rundown", label: "Rundown", description: "Susunan acara hari-H per jam." },
      { href: "/seserahan", label: "Seserahan", description: "Daftar hantaran, pembeli, dan statusnya." },
      { href: "/savings", label: "Tabungan", description: "Setoran dana pernikahan dan targetnya." },
      { href: "/vendors", label: "Vendor", description: "Vendor dibooking, kontrak, dan pembayarannya." },
      { href: "/vendors/research", label: "Riset vendor", description: "Kandidat vendor dan perbandingan." },
      { href: "/activity", label: "Aktivitas", description: "Riwayat perubahan di workspace berdua." },
    ],
  },
  {
    title: "Pengaturan",
    links: [
      { href: "/settings/wedding", label: "Pernikahan", description: "Tanggal pernikahan dan tenggat checklist." },
      { href: "/settings/partner", label: "Pasangan", description: "Undang atau kelola pasangan." },
      { href: "/settings/security", label: "Keamanan akun", description: "Perangkat yang sedang masuk." },
      { href: "/billing", label: "Akses & pembayaran", description: "Status Akses Penuh, pembelian, dan riwayat pembayaran." },
    ],
  },
] as const;

export default async function MorePage() {
  const session = await requireSession();
  // Role is read with the session on every request, so a demoted admin loses this link at once.
  const sections =
    session.user.role === "ADMIN"
      ? [...SECTIONS, { title: "Admin", links: [{ href: "/admin", label: "Panel admin", description: "Pengguna, paket, promo, template, dan audit log." }] }]
      : SECTIONS;

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl font-semibold">Lainnya</h1>
      {sections.map((section) => (
        <section key={section.title} aria-labelledby={`more-${section.title}`} className="space-y-2">
          <h2 id={`more-${section.title}`} className="text-sm font-semibold uppercase tracking-wider text-ink-500">
            {section.title}
          </h2>
          <ul className="divide-y divide-cream-200 rounded-3xl border border-cream-200 bg-white">
            {section.links.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="flex min-h-16 items-center justify-between gap-3 px-5 py-3 hover:bg-cream-50">
                  <span>
                    <span className="block font-medium text-ink-900">{link.label}</span>
                    <span className="block text-sm text-ink-500">{link.description}</span>
                  </span>
                  <span aria-hidden="true" className="text-ink-500">
                    →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
