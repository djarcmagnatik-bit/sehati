import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { GiftItemForm } from "@/components/planning/forms";
import { Card } from "@/components/ui/card";
import { requireSession } from "@/server/auth/session-cookie";
import { getGiftCategoryOptions } from "@/server/planning/seserahan-service";
import { getActiveWeddingForUser } from "@/server/wedding/wedding-service";

export const metadata: Metadata = { title: "Tambah seserahan" };

export default async function NewGiftItemPage() {
  const session = await requireSession();
  const membership = await getActiveWeddingForUser(session.user.id);
  if (!membership) redirect("/onboarding");
  const categories = await getGiftCategoryOptions();

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href="/seserahan" className="text-sm font-medium text-clay-700 underline-offset-4 hover:underline">
        ← Kembali ke seserahan
      </Link>
      <Card>
        <h1 className="font-display text-3xl font-semibold">Tambah barang seserahan</h1>
        <div className="mt-6">
          <GiftItemForm
            mode="create"
            weddingId={membership.wedding.id}
            categories={categories}
            defaults={{
              name: "",
              categoryId: "",
              quantity: "1",
              estimatedPrice: "",
              actualPrice: "",
              responsible: "",
              status: "PLANNED",
              notes: "",
            }}
          />
        </div>
      </Card>
    </div>
  );
}
