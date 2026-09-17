import type { Metadata } from "next";
import Link from "next/link";
import { AdminPageHeader, AdminTable, adminHref, ADMIN_INPUT_CLASS, Badge, EmptyRow, first, Notice, pageParam, Pagination, Td, Th } from "@/components/admin/admin-ui";
import { buttonClassName } from "@/components/ui/button";
import { requireAdminPage } from "@/server/admin/admin-access";
import { getTemplateFormOptions, listTaskTemplates, type TemplateFilter } from "@/server/admin/admin-content-service";

export const metadata: Metadata = { title: "Template tugas" };

const NOTICES = {
  created: { tone: "success", text: "Template dibuat. Dipakai untuk checklist yang dibuat setelah ini." },
  updated: { tone: "success", text: "Template disimpan. Checklist yang sudah ada tidak berubah." },
} as const;

const PRIORITY_LABEL: Record<string, string> = { LOW: "Rendah", MEDIUM: "Sedang", HIGH: "Tinggi", URGENT: "Mendesak" };

function describeOffset(days: number): string {
  if (days === 0) return "Hari H";
  return days < 0 ? `H-${Math.abs(days)}` : `H+${days}`;
}

type Params = Record<string, string | string[] | undefined>;

export default async function AdminTaskTemplatesPage({ searchParams }: { searchParams: Promise<Params> }) {
  const admin = await requireAdminPage();
  const params = await searchParams;
  const status = first(params.status);
  const filter: TemplateFilter = {
    q: first(params.q).trim().slice(0, 100),
    categoryId: first(params.category) || null,
    status: status === "active" || status === "inactive" ? status : "all",
    page: pageParam(params.page),
  };
  const [result, options] = await Promise.all([listTaskTemplates(admin.id, filter), getTemplateFormOptions(admin.id)]);

  return (
    <>
      <AdminPageHeader
        title="Template tugas"
        description="Sumber checklist otomatis saat pasangan menyelesaikan onboarding."
        action={
          <Link href="/admin/task-templates/new" className={buttonClassName("primary")}>
            Template baru
          </Link>
        }
      />
      <Notice notice={first(params.notice)} messages={NOTICES} />
      <form method="get" className="grid gap-3 rounded-3xl border border-cream-200 bg-white p-4 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end">
        <label className="text-sm font-medium">
          Cari judul
          <input name="q" type="search" defaultValue={filter.q} className={`${ADMIN_INPUT_CLASS} mt-1`} />
        </label>
        <label className="text-sm font-medium">
          Kategori
          <select name="category" defaultValue={filter.categoryId ?? ""} className={`${ADMIN_INPUT_CLASS} mt-1`}>
            <option value="">Semua</option>
            {options.categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium">
          Status
          <select name="status" defaultValue={filter.status} className={`${ADMIN_INPUT_CLASS} mt-1`}>
            <option value="all">Semua</option>
            <option value="active">Aktif</option>
            <option value="inactive">Nonaktif</option>
          </select>
        </label>
        <button type="submit" className={buttonClassName("secondary")}>
          Terapkan
        </button>
      </form>

      <AdminTable caption="Daftar template tugas">
        <thead>
          <tr>
            <Th>Judul</Th>
            <Th>Kategori</Th>
            <Th>Tenggat</Th>
            <Th>Prioritas</Th>
            <Th>Cakupan</Th>
            <Th>Status</Th>
          </tr>
        </thead>
        <tbody>
          {result.items.length === 0 ? (
            <EmptyRow colSpan={6}>Tidak ada template yang cocok.</EmptyRow>
          ) : (
            result.items.map((template) => (
              <tr key={template.id}>
                <Td>
                  <Link href={`/admin/task-templates/${template.id}`} className="font-medium underline-offset-4 hover:underline">
                    {template.title}
                  </Link>
                  <span className="block font-mono text-xs text-ink-500">{template.code}</span>
                </Td>
                <Td>{template.category.name}</Td>
                <Td className="whitespace-nowrap">{describeOffset(template.deadlineOffsetDays)}</Td>
                <Td>{PRIORITY_LABEL[template.priority] ?? template.priority}</Td>
                <Td className="text-xs whitespace-nowrap">
                  {template._count.eventTypes} jenis acara · {template._count.marriageProcesses} jalur
                  <span className="block text-ink-500">{template._count.tasks} tugas dibuat</span>
                </Td>
                <Td>{template.isActive ? <Badge tone="good">Aktif</Badge> : <Badge>Nonaktif</Badge>}</Td>
              </tr>
            ))
          )}
        </tbody>
      </AdminTable>
      <Pagination
        page={result.page}
        pageSize={result.pageSize}
        total={result.total}
        href={(page) => adminHref("/admin/task-templates", { q: filter.q, category: filter.categoryId, status: filter.status, page })}
      />
    </>
  );
}
