import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ImportUploadForm } from "@/components/guests/import-forms";
import { Card } from "@/components/ui/card";
import { MAX_SEATS_PER_INVITATION } from "@/lib/guests";
import { requireSession } from "@/server/auth/session-cookie";
import { getActiveWeddingForUser } from "@/server/wedding/wedding-service";

export const metadata: Metadata = { title: "Impor tamu" };

const COLUMNS = [
  { name: "Nama", required: true, description: "Nama tamu." },
  { name: "Nama Undangan", required: false, description: "Contoh: Keluarga Bapak Ahmad. Kosong = sama dengan Nama." },
  { name: "Telepon", required: false, description: "Dipakai untuk mendeteksi duplikat." },
  { name: "Grup", required: false, description: "Grup yang belum ada akan dibuat otomatis." },
  { name: "Kursi", required: false, description: `Angka 1–${MAX_SEATS_PER_INVITATION}. Boleh kosong: jumlah kursinya tidak ditentukan.` },
];

export default async function GuestImportPage() {
  const session = await requireSession();
  const membership = await getActiveWeddingForUser(session.user.id);
  if (!membership) redirect("/onboarding");

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href="/guests" className="text-sm font-medium text-clay-700 underline-offset-4 hover:underline">
        ← Kembali ke daftar tamu
      </Link>
      <header>
        <h1 className="font-display text-3xl font-semibold">Impor tamu</h1>
        <p className="mt-1 text-ink-700">Unggah file, periksa pratinjaunya, lalu konfirmasi. Tidak ada data yang disimpan sebelum konfirmasi.</p>
      </header>

      <Card title="1. Siapkan file">
        <p className="text-sm text-ink-700">
          Baris pertama berisi judul kolom. Urutan kolom bebas; nama kolom dalam bahasa Indonesia atau Inggris dikenali.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[32rem] text-left text-sm">
            <caption className="sr-only">Kolom yang dikenali</caption>
            <thead>
              <tr className="border-b border-cream-200 text-ink-500">
                <th scope="col" className="py-2 pr-4">
                  Kolom
                </th>
                <th scope="col" className="py-2 pr-4">
                  Wajib
                </th>
                <th scope="col" className="py-2">
                  Keterangan
                </th>
              </tr>
            </thead>
            <tbody>
              {COLUMNS.map((column) => (
                <tr key={column.name} className="border-b border-cream-200">
                  <th scope="row" className="py-2 pr-4 font-medium text-ink-900">
                    {column.name}
                  </th>
                  <td className="py-2 pr-4">{column.required ? "Ya" : "Tidak"}</td>
                  <td className="py-2 text-ink-700">{column.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <a
          href="/guests/import/template"
          download
          className="mt-4 inline-block text-sm font-semibold text-clay-700 underline-offset-4 hover:underline"
        >
          Unduh template CSV
        </a>
      </Card>

      <Card title="2. Unggah file">
        <ImportUploadForm weddingId={membership.wedding.id} />
      </Card>
    </div>
  );
}
