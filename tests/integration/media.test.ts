import sharp from "sharp";
import { afterAll, describe, expect, it } from "vitest";
import { parseImageVariants } from "@/lib/media";
import { getDb } from "@/server/db";
import { getMediaStore } from "@/server/media/media-store";
import { deleteAssetIfUnused, getAssetForDelivery, uploadImage } from "@/server/media/media-service";
import { jpegHeaderFixture, pngFixture } from "../support/image-fixtures";
import { deleteUsers } from "../support/integration-helpers";
import { createOwnerWorkspace } from "../support/workspace-helpers";

const userIds: string[] = [];

afterAll(async () => {
  await deleteUsers(userIds);
});

/** A 2400×1800 photo taken in portrait orientation (EXIF 6): upright it is 1800 wide. */
async function portraitPhoto(): Promise<Buffer> {
  return sharp({ create: { width: 2400, height: 1800, channels: 3, background: { r: 180, g: 120, b: 90 } } })
    .jpeg({ quality: 90 })
    .withMetadata({ orientation: 6 })
    .toBuffer();
}

describe("responsive image copies", () => {
  it("stores upright WebP copies no wider than the photo, and serves the one asked for", async () => {
    const { owner, weddingId } = await createOwnerWorkspace(userIds);
    const upload = await uploadImage(owner.userId, weddingId, { name: "IMG_0001.jpg", type: "image/jpeg", bytes: await portraitPhoto() });
    expect(upload.ok).toBe(true);
    const assetId = upload.ok ? upload.assetId : "";
    const asset = await getDb().mediaAsset.findUniqueOrThrow({ where: { id: assetId } });
    const variants = parseImageVariants(asset.variants);
    expect(variants.map((variant) => [variant.width, variant.height])).toEqual([
      [480, 640],
      [960, 1280],
      [1280, 1707],
      [1800, 2400],
    ]);
    for (const variant of variants) {
      const stored = await getMediaStore().get(variant.storageKey);
      const info = await sharp(stored!).metadata();
      expect(info).toMatchObject({ format: "webp", width: variant.width, height: variant.height });
      expect(info.exif).toBeUndefined();
    }

    const small = await getAssetForDelivery(assetId, owner.userId, 400);
    expect(small).toMatchObject({ mimeType: "image/webp", byteSize: variants[0]!.byteSize });
    const phone = await getAssetForDelivery(assetId, owner.userId, 1082);
    expect(phone?.byteSize).toBe(variants[2]!.byteSize);
    const original = await getAssetForDelivery(assetId, owner.userId);
    expect(original).toMatchObject({ mimeType: "image/jpeg", byteSize: asset.byteSize });
    expect(small!.checksum).not.toBe(original!.checksum);
    // Copies follow the same access rule as the original.
    expect(await getAssetForDelivery(assetId, null, 400)).toBeNull();

    expect(await deleteAssetIfUnused(owner.userId, assetId)).toBe(true);
    for (const variant of variants) expect(await getMediaStore().get(variant.storageKey)).toBeNull();
  });

  it("makes a single copy for small images and none when the bytes cannot be decoded", async () => {
    const { owner, weddingId } = await createOwnerWorkspace(userIds);
    const png = await uploadImage(owner.userId, weddingId, { name: "kecil.png", type: "image/png", bytes: pngFixture(400, 300) });
    const pngAsset = await getDb().mediaAsset.findUniqueOrThrow({ where: { id: png.ok ? png.assetId : "" } });
    expect(parseImageVariants(pngAsset.variants).map((variant) => variant.width)).toEqual([400]);

    // A header-only JPEG passes validation but cannot be decoded: the upload still succeeds.
    const header = await uploadImage(owner.userId, weddingId, { name: "rusak.jpg", type: "image/jpeg", bytes: jpegHeaderFixture() });
    expect(header.ok).toBe(true);
    const headerAsset = await getDb().mediaAsset.findUniqueOrThrow({ where: { id: header.ok ? header.assetId : "" } });
    expect(headerAsset.variants).toEqual([]);
    expect(await getAssetForDelivery(headerAsset.id, owner.userId, 960)).toMatchObject({ mimeType: "image/jpeg" });
  });
});
