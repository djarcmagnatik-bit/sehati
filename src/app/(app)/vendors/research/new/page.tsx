import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { VendorResearchForm } from "@/components/vendors/vendor-research-form";
import { Card } from "@/components/ui/card";
import { requireSession } from "@/server/auth/session-cookie";
import { getVendorCategoryOptions } from "@/server/vendors/vendor-service";
import { getActiveWeddingForUser } from "@/server/wedding/wedding-service";

export const metadata: Metadata = { title: "Tambah kandidat vendor" };

export default async function NewVendorResearchPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string | string[] }>;
}) {
  const session = await requireSession();
  const membership = await getActiveWeddingForUser(session.user.id);
  if (!membership) redirect("/onboarding");

  const [categories, params] = await Promise.all([getVendorCategoryOptions(), searchParams]);
  const requested = typeof params.category === "string" ? params.category : undefined;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href="/vendors/research" className="text-sm font-medium text-clay-700 underline-offset-4 hover:underline">
        ← Kembali ke riset vendor
      </Link>
      <Card>
        <h1 className="font-display text-3xl font-semibold">Tambah kandidat vendor</h1>
        <p className="mt-1 text-ink-700">Catat semua info penting supaya mudah dibandingkan berdua.</p>
        <div className="mt-6">
          <VendorResearchForm
            mode="create"
            weddingId={membership.wedding.id}
            categories={categories}
            defaultCategoryId={categories.find((category) => category.id === requested)?.id}
          />
        </div>
      </Card>
    </div>
  );
}
