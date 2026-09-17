import type { Metadata } from "next";
import Link from "next/link";
import { AdminPageHeader, AdminTable, adminHref, ADMIN_INPUT_CLASS, Badge, EmptyRow, first, pageParam, Pagination, Td, Th } from "@/components/admin/admin-ui";
import { buttonClassName } from "@/components/ui/button";
import { formatDateTime } from "@/lib/dates";
import { requireAdminPage } from "@/server/admin/admin-access";
import { listUsers, type UserFilter } from "@/server/admin/admin-user-service";

export const metadata: Metadata = { title: "Pengguna" };

type Params = Record<string, string | string[] | undefined>;

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<Params> }) {
  const admin = await requireAdminPage();
  const params = await searchParams;
  const role = first(params.role);
  const status = first(params.status);
  const filter: UserFilter = {
    q: first(params.q).trim().slice(0, 100),
    role: role === "USER" || role === "ADMIN" ? role : "all",
    status: status === "active" || status === "suspended" ? status : "all",
    page: pageParam(params.page),
  };
  const result = await listUsers(admin.id, filter);

  return (
    <>
      <AdminPageHeader title="Pengguna" description="Cari akun, lihat keanggotaan, dan kelola status." />
      <form method="get" className="grid gap-3 rounded-3xl border border-cream-200 bg-white p-4 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end">
        <label className="text-sm font-medium">
          Cari nama atau email
          <input name="q" type="search" defaultValue={filter.q} className={`${ADMIN_INPUT_CLASS} mt-1`} />
        </label>
        <label className="text-sm font-medium">
          Peran
          <select name="role" defaultValue={filter.role} className={`${ADMIN_INPUT_CLASS} mt-1`}>
            <option value="all">Semua</option>
            <option value="USER">Pengguna</option>
            <option value="ADMIN">Admin</option>
          </select>
        </label>
        <label className="text-sm font-medium">
          Status
          <select name="status" defaultValue={filter.status} className={`${ADMIN_INPUT_CLASS} mt-1`}>
            <option value="all">Semua</option>
            <option value="active">Aktif</option>
            <option value="suspended">Disuspend</option>
          </select>
        </label>
        <button type="submit" className={buttonClassName("secondary")}>
          Terapkan
        </button>
      </form>

      <AdminTable caption="Daftar pengguna">
        <thead>
          <tr>
            <Th>Nama</Th>
            <Th>Email</Th>
            <Th>Peran</Th>
            <Th>Status</Th>
            <Th>Pernikahan</Th>
            <Th>Terdaftar</Th>
          </tr>
        </thead>
        <tbody>
          {result.items.length === 0 ? (
            <EmptyRow colSpan={6}>Tidak ada pengguna yang cocok.</EmptyRow>
          ) : (
            result.items.map((user) => (
              <tr key={user.id}>
                <Td>
                  <Link href={`/admin/users/${user.id}`} className="font-medium underline-offset-4 hover:underline">
                    {user.name}
                  </Link>
                </Td>
                <Td className="break-all">{user.email}</Td>
                <Td>{user.role === "ADMIN" ? <Badge tone="warn">Admin</Badge> : "Pengguna"}</Td>
                <Td>{user.suspendedAt ? <Badge tone="bad">Disuspend</Badge> : <Badge tone="good">Aktif</Badge>}</Td>
                <Td className="tabular-nums">{user._count.memberships}</Td>
                <Td className="whitespace-nowrap">{formatDateTime(user.createdAt)}</Td>
              </tr>
            ))
          )}
        </tbody>
      </AdminTable>
      <Pagination
        page={result.page}
        pageSize={result.pageSize}
        total={result.total}
        href={(page) => adminHref("/admin/users", { q: filter.q, role: filter.role, status: filter.status, page })}
      />
    </>
  );
}
