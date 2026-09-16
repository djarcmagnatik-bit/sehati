import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { GalleryCaptionForm } from "@/components/invitation/content-forms";
import { GalleryUploadForm } from "@/components/invitation/invitation-forms";
import { Alert } from "@/components/ui/alert";
import { buttonClassName } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatBytes, GALLERY_MAX_IMAGES, mediaPath } from "@/lib/media";
import { moveGalleryImageAction, removeGalleryImageAction } from "@/server/actions/invitation-actions";
import { requireSession } from "@/server/auth/session-cookie";
import { listGalleryImages } from "@/server/invitation/content-service";
import { getInvitationForUser } from "@/server/invitation/invitation-service";
import { getActiveWeddingForUser } from "@/server/wedding/wedding-service";

export const metadata: Metadata = { title: "Galeri undangan" };

export default async function InvitationGalleryPage() {
  const session = await requireSession();
  const membership = await getActiveWeddingForUser(session.user.id);
  if (!membership) redirect("/onboarding");

  const invitation = await getInvitationForUser(session.user.id, membership.wedding.id);
  if (!invitation) redirect("/invitation");

  const images = await listGalleryImages(session.user.id, membership.wedding.id);
  const gallerySection = invitation.sections.find((section) => section.type === "GALLERY");
  const lastIndex = images.length - 1;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href="/invitation" className="text-sm font-medium text-clay-700 underline-offset-4 hover:underline">
        ← Kembali ke undangan
      </Link>
      <header>
        <h1 className="font-display text-3xl font-semibold">Galeri</h1>
        <p className="mt-1 text-ink-700">
          {images.length} dari {GALLERY_MAX_IMAGES} foto. Foto hanya bisa dilihat publik setelah undangan diterbitkan.
        </p>
      </header>

      {images.length > 0 && gallerySection && !gallerySection.enabled ? (
        <Alert tone="warning">
          Bagian galeri masih disembunyikan.{" "}
          <Link href="/invitation/sections/gallery" className="font-semibold underline underline-offset-4">
            Tampilkan bagiannya
          </Link>{" "}
          agar foto muncul di undangan.
        </Alert>
      ) : null}

      <Card title="Tambah foto">
        <GalleryUploadForm weddingId={membership.wedding.id} />
      </Card>

      {images.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-cream-300 bg-white p-6 text-center">
          <p className="text-ink-700">Belum ada foto di galeri.</p>
        </div>
      ) : (
        <ul className="space-y-4">
          {images.map((image, index) => (
            <li key={image.id}>
              <Card>
                <div className="flex flex-wrap gap-4">
                  {/* Served from our own /media route; no external image optimizer is configured. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={mediaPath(image.asset.id)}
                    alt={image.caption ?? image.asset.fileName}
                    width={image.asset.width}
                    height={image.asset.height}
                    className="size-28 rounded-2xl object-cover"
                  />
                  <div className="min-w-48 flex-1 space-y-3">
                    <p className="text-xs text-ink-500">
                      {image.asset.fileName} · {image.asset.width}×{image.asset.height} · {formatBytes(image.asset.byteSize)}
                    </p>
                    <GalleryCaptionForm imageId={image.id} caption={image.caption ?? ""} />
                    <div className="flex flex-wrap gap-2">
                      <form action={moveGalleryImageAction}>
                        <input type="hidden" name="imageId" value={image.id} />
                        <input type="hidden" name="direction" value="up" />
                        <button
                          type="submit"
                          disabled={index === 0}
                          className={buttonClassName("secondary", "min-h-10 px-4 disabled:opacity-40")}
                        >
                          ↑ Naikkan
                        </button>
                      </form>
                      <form action={moveGalleryImageAction}>
                        <input type="hidden" name="imageId" value={image.id} />
                        <input type="hidden" name="direction" value="down" />
                        <button
                          type="submit"
                          disabled={index === lastIndex}
                          className={buttonClassName("secondary", "min-h-10 px-4 disabled:opacity-40")}
                        >
                          ↓ Turunkan
                        </button>
                      </form>
                      <form action={removeGalleryImageAction}>
                        <input type="hidden" name="imageId" value={image.id} />
                        <button type="submit" className={buttonClassName("danger", "min-h-10 px-4")}>
                          Hapus foto
                        </button>
                      </form>
                    </div>
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
