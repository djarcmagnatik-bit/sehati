import type { Metadata } from "next";
import Link from "next/link";
import { AdminPageHeader, AdminTable, adminHref, ADMIN_INPUT_CLASS, Badge, EmptyRow, first, pageParam, Pagination, Td, Th } from "@/components/admin/admin-ui";
import { buttonClassName } from "@/components/ui/button";
import { dbDateToIso, formatDateTime, formatIsoDateShort } from "@/lib/dates";
import { requireAdminPage } from "@/server/admin/admin-access";
import { listWeddings, type WeddingFilter } from "@/server/admin/admin-user-service";

export const metadata: Metadata = { title: "Pernikahan" };

type Params = Record<string, string | string[] | undefined>;

export default async function AdminWeddingsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const admin = await requireAdminPage();
  const params = await searchParams;
  const access = first(params.access);
  const filter: WeddingFilter = {
    q: first(params.q).trim().slice(0, 100),
    access: access === "paid" || access === "free" ? access : "all",
    page: pageParam(params.page),
  };
  const result = await listWeddings(admin.id, filter);

  return (
    <>
      <AdminPageHeader title="Pernikahan" description="Workspace pasangan beserta status aksesnya." />
      <form method="get" className="grid gap-3 rounded-3xl border border-cream-200 bg-white p-4 sm:grid-cols-[1fr_auto_auto] sm:items-end">
        <label className="text-sm font-medium">
          Cari nama mempelai atau email anggota
          <input name="q" type="search" defaultValue={filter.q} className={`${ADMIN_INPUT_CLASS} mt-1`} />
        </label>
        <label className="text-sm font-medium">
          Akses
          <select name="access" defaultValue={filter.access} className={`${ADMIN_INPUT_CLASS} mt-1`}>
            <option value="all">Semua</option>
            <option value="paid">Berbayar</option>
            <option value="free">Gratis</option>
          </select>
        </label>
        <button type="submit" className={buttonClassName("secondary")}>
          Terapkan
        </button>
      </form>

      <AdminTable caption="Daftar pernikahan">
        <thead>
          <tr>
            <Th>Pasangan</Th>
            <Th>Tanggal</Th>
            <Th>Akses</Th>
            <Th>Anggota</Th>
            <Th>Tamu</Th>
            <Th>Dibuat</Th>
          </tr>
        </thead>
        <tbody>
          {result.items.length === 0 ? (
            <EmptyRow colSpan={6}>Tidak ada pernikahan yang cocok.</EmptyRow>
          ) : (
            result.items.map((wedding) => (
              <tr key={wedding.id}>
                <Td>
                  <Link href={`/admin/weddings/${wedding.id}`} className="font-medium underline-offset-4 hover:underline">
                    {wedding.coupleName}
                  </Link>
                </Td>
                <Td className="whitespace-nowrap">{formatIsoDateShort(dbDateToIso(wedding.weddingDate))}</Td>
                <Td>{wedding.paid ? <Badge tone="good">Berbayar</Badge> : <Badge>Gratis</Badge>}</Td>
                <Td className="tabular-nums">{wedding.members}</Td>
                <Td className="tabular-nums">{wedding.guests}</Td>
                <Td className="whitespace-nowrap">{formatDateTime(wedding.createdAt)}</Td>
              </tr>
            ))
          )}
        </tbody>
      </AdminTable>
      <Pagination
        page={result.page}
        pageSize={result.pageSize}
        total={result.total}
        href={(page) => adminHref("/admin/weddings", { q: filter.q, access: filter.access, page })}
      />
    </>
  );
}
