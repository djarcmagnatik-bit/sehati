import type { Metadata } from "next";
import { AdminPageHeader, AdminTable, adminHref, ADMIN_INPUT_CLASS, EmptyRow, first, pageParam, Pagination, Td, Th } from "@/components/admin/admin-ui";
import { buttonClassName } from "@/components/ui/button";
import { formatDateTime } from "@/lib/dates";
import { requireAdminPage } from "@/server/admin/admin-access";
import { listAuditLogs, type AuditFilter } from "@/server/admin/admin-content-service";

export const metadata: Metadata = { title: "Audit log" };

type Params = Record<string, string | string[] | undefined>;

function describeSummary(summary: unknown): string {
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) return "";
  return Object.entries(summary as Record<string, unknown>)
    .filter(([, value]) => value !== null && value !== "")
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(" · ");
}

export default async function AdminAuditLogsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const admin = await requireAdminPage();
  const params = await searchParams;
  const filter: AuditFilter = {
    q: first(params.q).trim().slice(0, 100),
    targetType: first(params.target).slice(0, 40) || null,
    page: pageParam(params.page),
  };
  const result = await listAuditLogs(admin.id, filter);

  return (
    <>
      <AdminPageHeader title="Audit log" description="Setiap perubahan oleh admin dicatat bersama perubahannya dan tidak bisa diedit." />
      <form method="get" className="grid gap-3 rounded-3xl border border-cream-200 bg-white p-4 sm:grid-cols-[1fr_auto_auto] sm:items-end">
        <label className="text-sm font-medium">
          Cari aksi, email admin, atau ID target
          <input name="q" type="search" defaultValue={filter.q} className={`${ADMIN_INPUT_CLASS} mt-1`} />
        </label>
        <label className="text-sm font-medium">
          Target
          <select name="target" defaultValue={filter.targetType ?? ""} className={`${ADMIN_INPUT_CLASS} mt-1`}>
            <option value="">Semua</option>
            {result.targetTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className={buttonClassName("secondary")}>
          Terapkan
        </button>
      </form>

      <AdminTable caption="Audit log admin">
        <thead>
          <tr>
            <Th>Waktu</Th>
            <Th>Admin</Th>
            <Th>Aksi</Th>
            <Th>Target</Th>
            <Th>Rincian</Th>
          </tr>
        </thead>
        <tbody>
          {result.items.length === 0 ? (
            <EmptyRow colSpan={5}>Belum ada catatan.</EmptyRow>
          ) : (
            result.items.map((entry) => (
              <tr key={entry.id}>
                <Td className="whitespace-nowrap">{formatDateTime(entry.createdAt)}</Td>
                <Td className="break-all">{entry.actorEmail}</Td>
                <Td className="font-mono text-xs whitespace-nowrap">{entry.action}</Td>
                <Td className="text-xs">
                  {entry.targetType}
                  {entry.targetId ? <span className="block font-mono break-all text-ink-500">{entry.targetId}</span> : null}
                </Td>
                <Td className="text-xs break-words text-ink-700">{describeSummary(entry.summary)}</Td>
              </tr>
            ))
          )}
        </tbody>
      </AdminTable>
      <Pagination
        page={result.page}
        pageSize={result.pageSize}
        total={result.total}
        href={(page) => adminHref("/admin/audit-logs", { q: filter.q, target: filter.targetType, page })}
      />
    </>
  );
}
