import type { Metadata } from "next";
import { PlanForm } from "@/components/admin/admin-forms";
import { AdminPageHeader } from "@/components/admin/admin-ui";
import { Card } from "@/components/ui/card";
import { requireAdminPage } from "@/server/admin/admin-access";

export const metadata: Metadata = { title: "Paket baru" };

export default async function NewPlanPage() {
  await requireAdminPage();
  return (
    <>
      <AdminPageHeader title="Paket baru" description="Kode paket tidak bisa diubah setelah dibuat." />
      <Card>
        <PlanForm
          mode="create"
          defaults={{ code: "", name: "", description: "", price: "", durationDays: "", features: [], isActive: true, sortOrder: "100" }}
        />
      </Card>
    </>
  );
}
