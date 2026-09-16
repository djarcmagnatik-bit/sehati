/**
 * Map links without a paid maps API: either the couple's own link or a plain search URL built
 * from coordinates/address, which every maps app can open.
 */
import { safeExternalUrl } from "@/lib/vendors";

export type MapTarget = {
  latitude: number | null;
  longitude: number | null;
  mapsUrl: string | null;
  address: string | null;
  venueName: string | null;
};

export function formatCoordinates(latitude: number, longitude: number): string {
  return `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
}

/** Coordinates win over an address: they open the exact spot instead of a guessed one. */
export function mapsLink(target: MapTarget): string | null {
  const explicit = safeExternalUrl(target.mapsUrl);
  if (explicit) return explicit;
  if (target.latitude !== null && target.longitude !== null) {
    return `https://www.google.com/maps/search/?api=1&query=${target.latitude},${target.longitude}`;
  }
  const query = [target.venueName, target.address].filter(Boolean).join(", ").trim();
  return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : null;
}

/** Embeddable map without an API key; only used when coordinates are known. */
export function mapEmbedUrl(latitude: number, longitude: number): string {
  const delta = 0.004;
  const bbox = [longitude - delta, latitude - delta, longitude + delta, latitude + delta].map((value) => value.toFixed(6)).join(",");
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${latitude},${longitude}`;
}
