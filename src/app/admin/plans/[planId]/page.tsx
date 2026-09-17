import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PlanForm } from "@/components/admin/admin-forms";
import { AdminPageHeader } from "@/components/admin/admin-ui";
import { Card } from "@/components/ui/card";
import { knownFeatures } from "@/lib/billing";
import { requireAdminPage } from "@/server/admin/admin-access";
import { getPlanForAdmin } from "@/server/admin/admin-billing-service";

export const metadata: Metadata = { title: "Ubah paket" };

export default async function EditPlanPage({ params }: { params: Promise<{ planId: string }> }) {
  const admin = await requireAdminPage();
  const { planId } = await params;
  const plan = await getPlanForAdmin(admin.id, planId);
  if (!plan) notFound();

  return (
    <>
      <AdminPageHeader title={`Ubah paket ${plan.name}`} />
      <Card>
        <PlanForm
          mode="edit"
          planId={plan.id}
          defaults={{
            code: plan.code,
            name: plan.name,
            description: plan.description ?? "",
            price: plan.price.toString(),
            durationDays: plan.durationDays?.toString() ?? "",
            features: knownFeatures(plan.features),
            isActive: plan.isActive,
            sortOrder: plan.sortOrder.toString(),
          }}
        />
      </Card>
    </>
  );
}
