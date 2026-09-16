import type { NextRequest } from "next/server";
import { getCurrentSession } from "@/server/auth/session-cookie";
import { getAssetForDelivery } from "@/server/media/media-service";

/**
 * Serves an uploaded image. Public while it is part of a published invitation, otherwise only to
 * members of the wedding that owns it (drafts stay private).
 */
export async function GET(request: NextRequest, context: { params: Promise<{ assetId: string }> }) {
  const { assetId } = await context.params;
  const session = await getCurrentSession();
  const asset = await getAssetForDelivery(assetId, session?.user.id ?? null);
  if (!asset) return new Response("Not found", { status: 404 });

  const etag = `"${asset.checksum}"`;
  if (request.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers: { ETag: etag } });
  }

  const body = new Uint8Array(asset.bytes);
  return new Response(body, {
    headers: {
      "Content-Type": asset.mimeType,
      "Content-Length": String(asset.byteSize),
      ETag: etag,
      // Content at a given id never changes; a new upload gets a new id.
      "Cache-Control": session ? "private, max-age=300" : "public, max-age=31536000, immutable",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
