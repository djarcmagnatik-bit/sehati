/** Client IP extraction for rate limiting (pure). */

const IP_PATTERN = /^[0-9a-fA-F:.]{2,45}$/;

/**
 * The client address as seen by the outermost trusted reverse proxy.
 *
 * Each proxy appends the address it received the request from to X-Forwarded-For, so only the
 * last `trustedProxies` entries were written by infrastructure we control; everything to their left
 * came from the client and can be forged. With no trusted proxy the header is ignored entirely.
 */
export function clientIpFromHeaders(headers: { get(name: string): string | null }, trustedProxies: number): string | null {
  if (trustedProxies <= 0) return null;
  const hops = (headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const candidate = hops.length >= trustedProxies ? hops[hops.length - trustedProxies] : undefined;
  // A single proxy that sets X-Real-IP (and overwrites any client value) is also common.
  const ip = candidate ?? (trustedProxies === 1 ? headers.get("x-real-ip")?.trim() : undefined);
  return ip && IP_PATTERN.test(ip) ? ip : null;
}
