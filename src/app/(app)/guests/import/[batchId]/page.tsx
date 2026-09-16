import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ImportCommitForm } from "@/components/guests/import-forms";
import { Alert } from "@/components/ui/alert";
import { buttonClassName } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { summarizeImport, type ImportRow } from "@/lib/guest-import";
import { requireSession } from "@/server/auth/session-cookie";
import { getGuestImportBatchForUser } from "@/server/guests/guest-import-service";

export const metadata: Metadata = { title: "Pratinjau impor tamu" };

const PREVIEW_LIMIT = 300;

function RowStatus({ row }: { row: ImportRow }) {
  if (row.errors.length > 0) return <span className="text-danger-600">⚠ {row.errors.join("; ")}</span>;
  if (row.duplicate === "existing") return <span className="text-clay-700">Duplikat (sudah ada di daftar)</span>;
  if (row.duplicate === "file") return <span className="text-clay-700">Duplikat (baris sebelumnya di file)</span>;
  return <span className="text-success-700">✓ Siap diimpor</span>;
}

function Count({ label, value, testId }: { label: string; value: number; testId: string }) {
  return (
    <div>
      <dt className="text-xs text-ink-500">{label}</dt>
      <dd data-testid={testId} className="font-display text-2xl font-semibold">
        {value.toLocaleString("id-ID")}
      </dd>
    </div>
  );
}

export default async function GuestImportPreviewPage({ params }: { params: Promise<{ batchId: string }> }) {
  const session = await requireSession();
  const { batchId } = await params;
  const batch = await getGuestImportBatchForUser(session.user.id, batchId);
  if (!batch) notFound();

  const summary = summarizeImport(batch.rows);

  return (
    <div className="space-y-4">
      <Link href="/guests/import" className="text-sm font-medium text-clay-700 underline-offset-4 hover:underline">
        ← Unggah file lain
      </Link>
      <header>
        <h1 className="font-display text-3xl font-semibold">Pratinjau impor</h1>
        <p className="mt-1 text-ink-700">File: {batch.fileName}</p>
      </header>

      {batch.committedAt ? (
        <Alert tone="success">
          Impor sudah diproses: {batch.importedCount ?? 0} undangan diimpor, {batch.skippedCount ?? 0} baris dilewati.{" "}
          <Link href="/guests" className="font-semibold underline underline-offset-4">
            Lihat daftar tamu
          </Link>
        </Alert>
      ) : batch.expired ? (
        <Alert tone="error">
          Pratinjau ini sudah kedaluwarsa.{" "}
          <Link href="/guests/import" className="font-semibold underline underline-offset-4">
            Unggah ulang file
          </Link>
        </Alert>
      ) : null}

      <section aria-label="Ringkasan pratinjau" className="rounded-3xl border border-cream-200 bg-white p-5">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          <Count label="Total baris" value={summary.total} testId="import-total" />
          <Count label="Siap diimpor" value={summary.valid} testId="import-valid" />
          <Count label="Kursi" value={summary.seats} testId="import-seats" />
          <Count label="Duplikat" value={summary.duplicates} testId="import-duplicates" />
          <Count label="Tidak valid" value={summary.invalid} testId="import-invalid" />
        </dl>
        {batch.newGroupNames.length > 0 ? (
          <p className="mt-4 text-sm text-ink-700">Grup baru yang akan dibuat: {batch.newGroupNames.join(", ")}</p>
        ) : null}
      </section>

      {!batch.committedAt && !batch.expired ? (
        <Card title="Konfirmasi">
          {summary.invalid > 0 ? (
            <p className="mb-3 text-sm text-ink-700">Baris yang tidak valid dilewati. Perbaiki di file lalu unggah ulang jika perlu.</p>
          ) : null}
          <ImportCommitForm batchId={batch.id} validCount={summary.valid} duplicateCount={summary.duplicates} />
        </Card>
      ) : null}

      <div className="overflow-x-auto rounded-3xl border border-cream-200 bg-white">
        <table className="w-full min-w-[48rem] text-left text-sm">
          <caption className="sr-only">Baris dari file impor</caption>
          <thead>
            <tr className="border-b border-cream-200 text-ink-500">
              <th scope="col" className="p-3">
                Baris
              </th>
              <th scope="col" className="p-3">
                Nama
              </th>
              <th scope="col" className="p-3">
                Nama undangan
              </th>
              <th scope="col" className="p-3">
                Telepon
              </th>
              <th scope="col" className="p-3">
                Grup
              </th>
              <th scope="col" className="p-3">
                Kursi
              </th>
              <th scope="col" className="p-3">
                Keterangan
              </th>
            </tr>
          </thead>
          <tbody>
            {batch.rows.slice(0, PREVIEW_LIMIT).map((row) => (
              <tr key={row.line} className="border-b border-cream-200 align-top">
                <td className="p-3 text-ink-500">{row.line}</td>
                <td className="p-3">{row.guestName || "—"}</td>
                <td className="p-3">{row.invitationName || "—"}</td>
                <td className="p-3">{row.phone ?? "—"}</td>
                <td className="p-3">{row.groupName ?? "—"}</td>
                <td className="p-3">{row.seatCount}</td>
                <td className="p-3">
                  <RowStatus row={row} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {batch.rows.length > PREVIEW_LIMIT ? (
        <p className="text-sm text-ink-500">
          Menampilkan {PREVIEW_LIMIT} dari {batch.rows.length.toLocaleString("id-ID")} baris. Semua baris tetap diproses saat impor.
        </p>
      ) : null}
      <Link href="/guests" className={buttonClassName("ghost")}>
        Batal
      </Link>
    </div>
  );
}
