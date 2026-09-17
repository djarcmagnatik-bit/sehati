import type { Metadata } from "next";
import { PromoCodeForm } from "@/components/admin/admin-forms";
import { AdminPageHeader } from "@/components/admin/admin-ui";
import { Card } from "@/components/ui/card";
import { requireAdminPage } from "@/server/admin/admin-access";
import { listPlansForAdmin } from "@/server/admin/admin-billing-service";

export const metadata: Metadata = { title: "Kode promo baru" };

export default async function NewPromoCodePage() {
  const admin = await requireAdminPage();
  const plans = await listPlansForAdmin(admin.id);
  return (
    <>
      <AdminPageHeader title="Kode promo baru" description="Kode tidak bisa diubah setelah dibuat karena mungkin sudah dibagikan." />
      <Card>
        <PromoCodeForm
          mode="create"
          plans={plans.map((plan) => ({ id: plan.id, name: plan.name }))}
          defaults={{
            code: "",
            description: "",
            discountType: "PERCENT",
            discountValue: "",
            planId: "",
            startsOn: "",
            endsOn: "",
            usageLimit: "",
            perUserLimit: "1",
            isActive: true,
          }}
        />
      </Card>
    </>
  );
}
