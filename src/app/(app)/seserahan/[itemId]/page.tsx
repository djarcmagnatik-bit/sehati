import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GiftItemForm, GiftItemPhotoForm } from "@/components/planning/forms";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { ConfirmActionButton } from "@/components/ui/confirm-action-button";
import { mediaPath } from "@/lib/media";
import { formatRupiahDigits } from "@/lib/money";
import { deleteGiftItemAction } from "@/server/actions/planning-actions";
import { requireSession } from "@/server/auth/session-cookie";
import { getGiftCategoryOptions, getGiftItemForUser } from "@/server/planning/seserahan-service";

export const metadata: Metadata = { title: "Detail seserahan" };

const NOTICES: Record<string, string> = { created: "Barang seserahan ditambahkan.", updated: "Perubahan disimpan." };

export default async function GiftItemPage({
  params,
  searchParams,
}: {
  params: Promise<{ itemId: string }>;
  searchParams: Promise<{ notice?: string | string[] }>;
}) {
  const session = await requireSession();
  const { itemId } = await params;
  const item = await getGiftItemForUser(session.user.id, itemId);
  if (!item) notFound();

  const [categories, query] = await Promise.all([getGiftCategoryOptions(item.categoryId ?? undefined), searchParams]);
  const notice = typeof query.notice === "string" ? NOTICES[query.notice] : undefined;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href="/seserahan" className="text-sm font-medium text-clay-700 underline-offset-4 hover:underline">
        ← Kembali ke seserahan
      </Link>
      {notice ? <Alert tone="success">{notice}</Alert> : null}

      <Card>
        <h1 className="font-display text-3xl font-semibold">{item.name}</h1>
        <div className="mt-6">
          <GiftItemForm
            mode="edit"
            itemId={item.id}
            categories={categories}
            defaults={{
              name: item.name,
              categoryId: item.categoryId ?? "",
              quantity: String(item.quantity),
              estimatedPrice: item.estimatedPrice === null ? "" : formatRupiahDigits(item.estimatedPrice),
              actualPrice: item.actualPrice === null ? "" : formatRupiahDigits(item.actualPrice),
              responsible: item.responsible ?? "",
              status: item.status,
              notes: item.notes ?? "",
            }}
          />
        </div>
      </Card>

      <Card title="Foto">
        {item.photoId ? (
          <>
            {/* Private: /media serves this only to members of the wedding. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={mediaPath(item.photoId, 480)}
              alt={`Foto ${item.name}`}
              className="mb-4 aspect-square w-full max-w-xs rounded-2xl object-cover"
            />
          </>
        ) : null}
        <GiftItemPhotoForm weddingId={item.weddingId} itemId={item.id} />
      </Card>

      <Card title="Hapus barang">
        <ConfirmActionButton
          action={deleteGiftItemAction}
          fields={{ itemId: item.id }}
          triggerLabel="Hapus barang"
          confirmLabel="Ya, hapus"
          message={`Hapus “${item.name}” dari daftar seserahan?`}
        />
      </Card>
    </div>
  );
}
