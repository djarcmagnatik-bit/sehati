const INTERNAL_ORIGIN = "http://internal.invalid";

/**
 * Only allows same-origin relative paths as post-login redirect targets (prevents open redirects
 * such as "//evil.example" or "/\\evil.example").
 */
export function safeRedirectPath(value: string | null | undefined, fallback = "/dashboard"): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return fallback;
  }
  try {
    const url = new URL(value, INTERNAL_ORIGIN);
    if (url.origin !== INTERNAL_ORIGIN) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
