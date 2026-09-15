/**
 * The `__Host-` prefix forces Secure + Path=/ + no Domain. Browsers only accept it over HTTPS
 * (or localhost), so it is used in production only.
 */
export const SESSION_COOKIE_NAME =
  process.env.NODE_ENV === "production" ? "__Host-sehati_session" : "sehati_session";

export const PRIVATE_PATH_PREFIXES = ["/dashboard", "/onboarding", "/settings"] as const;

export function isPrivatePath(pathname: string): boolean {
  return PRIVATE_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
