import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ExpenseForm } from "@/components/budget/expense-form";
import { Card } from "@/components/ui/card";
import { requireSession } from "@/server/auth/session-cookie";
import { getBudgetCategoryOptions } from "@/server/budget/budget-service";
import { getActiveWeddingForUser } from "@/server/wedding/wedding-service";

export const metadata: Metadata = { title: "Tambah pengeluaran" };

export default async function NewExpensePage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string | string[] }>;
}) {
  const session = await requireSession();
  const membership = await getActiveWeddingForUser(session.user.id);
  if (!membership) redirect("/onboarding");

  const [categories, params] = await Promise.all([
    getBudgetCategoryOptions(session.user.id, membership.wedding.id),
    searchParams,
  ]);
  const requested = typeof params.category === "string" ? params.category : undefined;
  const defaultCategoryId = categories.some((category) => category.id === requested) ? requested : undefined;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href="/budget/expenses" className="text-sm font-medium text-clay-700 underline-offset-4 hover:underline">
        ← Kembali ke pengeluaran
      </Link>
      <Card>
        <h1 className="font-display text-3xl font-semibold">Tambah pengeluaran</h1>
        <p className="mt-1 text-ink-700">Catat kontrak atau tagihan. Pembayaran (DP, cicilan, pelunasan) dicatat setelahnya.</p>
        <div className="mt-6">
          {categories.length === 0 ? (
            <p className="text-sm text-ink-700">
              Belum ada kategori budget.{" "}
              <Link href="/budget" className="font-semibold text-clay-700 underline-offset-4 hover:underline">
                Siapkan kategori dulu
              </Link>
            </p>
          ) : (
            <ExpenseForm
              mode="create"
              weddingId={membership.wedding.id}
              categories={categories}
              defaultCategoryId={defaultCategoryId}
            />
          )}
        </div>
      </Card>
    </div>
  );
}
