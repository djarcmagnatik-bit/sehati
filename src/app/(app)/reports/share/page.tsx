import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ShareCardActions } from "@/components/reports/share-card-actions";
import { buttonClassName } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { parseProgressCardOptions, progressCardQuery, type ProgressCardOptions } from "@/lib/reports";
import { requireSession } from "@/server/auth/session-cookie";
import { getWeddingFeatures } from "@/server/billing/access";
import { getActiveWeddingForUser } from "@/server/wedding/wedding-service";

export const metadata: Metadata = { title: "Kartu progres" };

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const CHOICES: Array<{ key: keyof ProgressCardOptions; label: string; hint: string; feature?: "guests" | "budget" }> = [
  { key: "checklist", label: "Progres checklist", hint: "Persentase dan jumlah tugas selesai." },
  { key: "nextTasks", label: "Tugas berikutnya", hint: "Tiga tugas dengan tenggat terdekat." },
  { key: "guests", label: "RSVP tamu", hint: "Jumlah orang yang akan hadir.", feature: "guests" },
  { key: "budget", label: "Status budget", hint: "Persentase budget terpakai dan dibayar, tanpa nominal.", feature: "budget" },
  { key: "budgetAmounts", label: "Tampilkan nominal rupiah", hint: "Hanya jika kamu yakin ingin membagikan angka keuangan.", feature: "budget" },
];

export default async function ShareProgressPage({ searchParams }: PageProps) {
  const session = await requireSession();
  const membership = await getActiveWeddingForUser(session.user.id);
  if (!membership) redirect("/onboarding");
  const [params, features] = await Promise.all([searchParams, getWeddingFeatures(membership.wedding.id)]);
  const options = parseProgressCardOptions(params);
  const imageUrl = `/reports/share/image?${progressCardQuery(options)}`;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <Link href="/reports" className="text-sm font-medium text-clay-700 underline-offset-4 hover:underline">
          ← Semua laporan
        </Link>
        <h1 className="mt-2 font-display text-3xl font-semibold">Kartu progres</h1>
        <p className="mt-1 text-ink-700">Gambar ringkas untuk dibagikan ke keluarga atau media sosial. Kamu yang memilih isinya.</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_minmax(0,22rem)]">
        <Card title="Isi kartu" description="Nama, tanggal, dan hitung mundur selalu tampil. Nominal uang tidak pernah tampil kecuali dipilih.">
          <form method="get" className="space-y-3">
            <input type="hidden" name="set" value="1" />
            {CHOICES.map((choice) => {
              const locked = choice.feature !== undefined && !features.has(choice.feature);
              return (
                <label key={choice.key} className="flex items-start gap-3 rounded-2xl border border-cream-200 px-4 py-3">
                  <input
                    type="checkbox"
                    name={choice.key}
                    value="1"
                    defaultChecked={options[choice.key] && !locked}
                    disabled={locked}
                    className="mt-1 size-4 accent-clay-600"
                  />
                  <span>
                    <span className="block font-medium">{choice.label}</span>
                    <span className="block text-sm text-ink-500">{locked ? "🔒 Butuh Akses Penuh." : choice.hint}</span>
                  </span>
                </label>
              );
            })}
            <button type="submit" className={buttonClassName("secondary")}>
              Perbarui pratinjau
            </button>
          </form>
        </Card>

        <div className="space-y-4">
          {/* Rendered on the server for this account only; never cached or public. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt="Pratinjau kartu progres persiapan pernikahan"
            width={1080}
            height={1350}
            data-testid="progress-card-preview"
            className="h-auto w-full rounded-3xl border border-cream-200 bg-white shadow-sm"
          />
          <ShareCardActions imageUrl={imageUrl} />
        </div>
      </div>
    </div>
  );
}
