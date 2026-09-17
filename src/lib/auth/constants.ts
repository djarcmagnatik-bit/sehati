/**
 * The `__Host-` prefix forces Secure + Path=/ + no Domain. Browsers only accept it over HTTPS
 * (or localhost), so it is used in production only.
 */
export const SESSION_COOKIE_NAME =
  process.env.NODE_ENV === "production" ? "__Host-sehati_session" : "sehati_session";

/** Signed-in areas: the proxy redirects anonymous visitors to /login and marks responses noindex. */
export const PRIVATE_PATH_PREFIXES = [
  "/dashboard",
  "/onboarding",
  "/settings",
  "/checklist",
  "/budget",
  "/vendors",
  "/guests",
  "/invitation",
  "/calendar",
  "/savings",
  "/seserahan",
  "/rundown",
  "/billing",
  "/payments",
  "/activity",
  "/more",
  "/admin",
] as const;

export function isPrivatePath(pathname: string): boolean {
  return PRIVATE_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
