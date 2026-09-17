import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PromoCodeForm } from "@/components/admin/admin-forms";
import { AdminPageHeader } from "@/components/admin/admin-ui";
import { Card } from "@/components/ui/card";
import { todayIsoInTimeZone } from "@/lib/dates";
import { requireAdminPage } from "@/server/admin/admin-access";
import { getPromoCodeForAdmin, listPlansForAdmin } from "@/server/admin/admin-billing-service";

export const metadata: Metadata = { title: "Ubah kode promo" };

export default async function EditPromoCodePage({ params }: { params: Promise<{ promoId: string }> }) {
  const admin = await requireAdminPage();
  const { promoId } = await params;
  const [promo, plans] = await Promise.all([getPromoCodeForAdmin(admin.id, promoId), listPlansForAdmin(admin.id)]);
  if (!promo) notFound();

  return (
    <>
      <AdminPageHeader title={`Ubah ${promo.code}`} />
      <Card>
        <PromoCodeForm
          mode="edit"
          promoId={promo.id}
          plans={plans.map((plan) => ({ id: plan.id, name: plan.name }))}
          defaults={{
            code: promo.code,
            description: promo.description ?? "",
            discountType: promo.discountType,
            discountValue: promo.discountValue.toString(),
            planId: promo.planId ?? "",
            // Stored as instants; the form works in whole Jakarta days (the end is exclusive).
            startsOn: promo.startsAt ? todayIsoInTimeZone(promo.startsAt) : "",
            endsOn: promo.expiresAt ? todayIsoInTimeZone(new Date(promo.expiresAt.getTime() - 1)) : "",
            usageLimit: promo.usageLimit?.toString() ?? "",
            perUserLimit: promo.perUserLimit?.toString() ?? "",
            isActive: promo.isActive,
          }}
        />
      </Card>
    </>
  );
}
