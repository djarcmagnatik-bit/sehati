/**
 * Creates the resized WebP copies for images uploaded before responsive images existed.
 *
 *   pnpm media:variants
 *
 * Safe to run repeatedly: only images without copies are processed. Uses DATABASE_URL and the
 * configured media store, like the app.
 */
import { config } from "dotenv";

config({ quiet: true });

async function main() {
  const [{ getDb }, { getMediaStore }, { storeImageVariants }] = await Promise.all([
    import("../src/server/db"),
    import("../src/server/media/media-store"),
    import("../src/server/media/media-service"),
  ]);
  const db = getDb();
  let processed = 0;
  let withCopies = 0;
  let after = "00000000-0000-0000-0000-000000000000";
  try {
    for (;;) {
      // Cursor over ids: images whose copies cannot be made stay as they are and are not retried.
      const batch = await db.mediaAsset.findMany({
        where: { kind: "IMAGE", variants: { equals: [] }, id: { gt: after } },
        orderBy: { id: "asc" },
        take: 20,
        select: { id: true, weddingId: true, storageKey: true },
      });
      if (batch.length === 0) break;
      for (const asset of batch) {
        after = asset.id;
        processed += 1;
        const bytes = await getMediaStore().get(asset.storageKey);
        if (!bytes) continue;
        const variants = await storeImageVariants(asset.weddingId, asset.id, bytes);
        if (variants.length === 0) continue;
        await db.mediaAsset.update({ where: { id: asset.id }, data: { variants } });
        withCopies += 1;
      }
    }
    console.log(`Gambar diperiksa: ${processed}, salinan dibuat untuk: ${withCopies}.`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
