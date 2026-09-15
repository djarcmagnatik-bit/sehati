import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { VendorForm } from "@/components/vendors/vendor-form";
import { Card } from "@/components/ui/card";
import { todayIsoInTimeZone } from "@/lib/dates";
import { requireSession } from "@/server/auth/session-cookie";
import { getBudgetCategoryOptions } from "@/server/budget/budget-service";
import { getVendorCategoryOptions } from "@/server/vendors/vendor-service";
import { getActiveWeddingForUser } from "@/server/wedding/wedding-service";

export const metadata: Metadata = { title: "Tambah vendor" };

export default async function NewVendorPage() {
  const session = await requireSession();
  const membership = await getActiveWeddingForUser(session.user.id);
  if (!membership) redirect("/onboarding");

  const [categories, budgetCategories] = await Promise.all([
    getVendorCategoryOptions(),
    getBudgetCategoryOptions(session.user.id, membership.wedding.id),
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href="/vendors" className="text-sm font-medium text-clay-700 underline-offset-4 hover:underline">
        ← Kembali ke vendor
      </Link>
      <Card>
        <h1 className="font-display text-3xl font-semibold">Tambah vendor</h1>
        <p className="mt-1 text-ink-700">
          Untuk vendor yang langsung dibooking. Ingin membandingkan dulu?{" "}
          <Link href="/vendors/research/new" className="font-semibold text-clay-700 underline-offset-4 hover:underline">
            Tambah sebagai kandidat
          </Link>
        </p>
        <div className="mt-6">
          <VendorForm
            mode="create"
            weddingId={membership.wedding.id}
            todayIso={todayIsoInTimeZone(new Date(), membership.wedding.timeZone)}
            categories={categories}
            budgetCategories={budgetCategories}
          />
        </div>
      </Card>
    </div>
  );
}
