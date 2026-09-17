/** Content Security Policy for HTML responses (pure). */

/** Hosted checkout pages a form may post or redirect to when JavaScript is unavailable. */
const PAYMENT_FORM_TARGETS = ["https://app.midtrans.com", "https://app.sandbox.midtrans.com"];

/**
 * Scripts only run with the per-request nonce ('strict-dynamic' lets those scripts load the app's
 * chunks), so injected markup cannot execute. Inline style attributes are allowed because themes
 * set CSS variables that way; styles cannot run code.
 */
export function buildContentSecurityPolicy({ nonce, isDev }: { nonce: string; isDev: boolean }): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(isDev ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:"],
    "font-src": ["'self'"],
    "media-src": ["'self'", "blob:"],
    "connect-src": ["'self'", ...(isDev ? ["ws:"] : [])],
    // The invitation's location section embeds an OpenStreetMap frame (no API key, no tracking script).
    "frame-src": ["https://www.openstreetmap.org"],
    "worker-src": ["'self'"],
    "manifest-src": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'", ...PAYMENT_FORM_TARGETS],
    "frame-ancestors": ["'none'"],
  };
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(" ")}`)
    .join("; ");
}

/** 128 bits of randomness, base64 — unguessable per response. */
export function createNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}
