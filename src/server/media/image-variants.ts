import "server-only";
import sharp from "sharp";
import { IMAGE_MAX_DIMENSION, IMAGE_VARIANT_WIDTHS } from "@/lib/media";

export type RenderedVariant = { width: number; height: number; bytes: Buffer };

/**
 * Resized WebP copies for responsive images. The EXIF orientation is applied so the copies are
 * upright without metadata. Widths never exceed the original; the widest copy is capped at the
 * largest variant width, so a 4000px photo is never sent to a phone.
 */
export async function renderImageVariants(bytes: Buffer): Promise<RenderedVariant[]> {
  const image = sharp(bytes, { failOn: "error", limitInputPixels: IMAGE_MAX_DIMENSION * IMAGE_MAX_DIMENSION });
  const metadata = await image.metadata();
  if (!metadata.width || !metadata.height) return [];
  const rotated = (metadata.orientation ?? 1) >= 5;
  const uprightWidth = rotated ? metadata.height : metadata.width;
  const largest = Math.max(...IMAGE_VARIANT_WIDTHS);
  const widths = [...new Set([...IMAGE_VARIANT_WIDTHS.filter((width) => width < uprightWidth), Math.min(uprightWidth, largest)])];

  const variants: RenderedVariant[] = [];
  for (const width of widths.sort((a, b) => a - b)) {
    const { data, info } = await sharp(bytes, { failOn: "error" })
      .rotate()
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 64, effort: 4 })
      .toBuffer({ resolveWithObject: true });
    variants.push({ width: info.width, height: info.height, bytes: data });
  }
  return variants;
}
