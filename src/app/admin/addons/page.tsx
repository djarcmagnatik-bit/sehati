import type { Metadata } from "next";
import { AddonForm } from "@/components/admin/admin-forms";
import { AdminPageHeader, Badge } from "@/components/admin/admin-ui";
import { Card } from "@/components/ui/card";
import { requireAdminPage } from "@/server/admin/admin-access";
import { listAddonsForAdmin } from "@/server/admin/admin-billing-service";

export const metadata: Metadata = { title: "Add-on" };

export default async function AdminAddonsPage() {
  const admin = await requireAdminPage();
  const addons = await listAddonsForAdmin(admin.id);

  return (
    <>
      <AdminPageHeader title="Add-on" description="Kuota tambahan yang bisa dibeli. Kode add-on dipakai aplikasi, jadi hanya harga dan deskripsinya yang diubah di sini." />
      {addons.length === 0 ? <p className="text-ink-500">Belum ada add-on.</p> : null}
      <div className="grid gap-4 lg:grid-cols-2">
        {addons.map((addon) => (
          <Card key={addon.id}>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <p className="font-mono text-xs text-ink-500">{addon.code}</p>
              <span className="flex items-center gap-2 text-sm text-ink-500">
                {addon._count.purchases} terjual
                {addon.isActive ? <Badge tone="good">Aktif</Badge> : <Badge>Nonaktif</Badge>}
              </span>
            </div>
            <AddonForm
              addonId={addon.id}
              defaults={{
                name: addon.name,
                description: addon.description ?? "",
                price: addon.price.toString(),
                quotaAmount: addon.quotaAmount.toString(),
                unit: addon.unit,
                isActive: addon.isActive,
              }}
            />
          </Card>
        ))}
      </div>
    </>
  );
}
