import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BudgetCategoryForm } from "@/components/budget/budget-category-form";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { ConfirmActionButton } from "@/components/ui/confirm-action-button";
import { formatRupiahDigits } from "@/lib/money";
import { deleteBudgetCategoryAction } from "@/server/actions/budget-actions";
import { requireSession } from "@/server/auth/session-cookie";
import { getBudgetCategoryForUser } from "@/server/budget/budget-service";

export const metadata: Metadata = { title: "Ubah kategori budget" };

export default async function BudgetCategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ categoryId: string }>;
  searchParams: Promise<{ notice?: string | string[] }>;
}) {
  const session = await requireSession();
  const { categoryId } = await params;
  const category = await getBudgetCategoryForUser(session.user.id, categoryId);
  if (!category) notFound();
  const { notice } = await searchParams;
  const expenseCount = category._count.expenses;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href="/budget" className="text-sm font-medium text-clay-700 underline-offset-4 hover:underline">
        ← Kembali ke budget
      </Link>
      {notice === "has_expenses" ? (
        <Alert tone="error">Kategori ini masih dipakai oleh pengeluaran, jadi belum bisa dihapus.</Alert>
      ) : null}

      <Card>
        <h1 className="font-display text-3xl font-semibold">Ubah kategori</h1>
        <p className="mt-1 text-sm text-ink-500">
          {expenseCount > 0 ? `${expenseCount} pengeluaran memakai kategori ini.` : "Belum ada pengeluaran di kategori ini."}
        </p>
        <div className="mt-6">
          <BudgetCategoryForm
            mode="edit"
            categoryId={category.id}
            name={category.name}
            allocatedAmount={formatRupiahDigits(category.allocatedAmount)}
          />
        </div>
      </Card>

      <Card title="Hapus kategori">
        {expenseCount === 0 ? (
          <ConfirmActionButton
            action={deleteBudgetCategoryAction}
            fields={{ categoryId: category.id }}
            triggerLabel="Hapus kategori"
            confirmLabel="Ya, hapus"
            message={`Hapus kategori “${category.name}”? Alokasinya akan hilang.`}
          />
        ) : (
          <p className="text-sm text-ink-700">
            Pindahkan atau hapus pengeluaran di kategori ini terlebih dahulu.{" "}
            <Link
              href={`/budget/expenses?category=${category.id}`}
              className="font-semibold text-clay-700 underline-offset-4 hover:underline"
            >
              Lihat pengeluaran
            </Link>
          </p>
        )}
      </Card>
    </div>
  );
}
