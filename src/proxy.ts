import { NextResponse, type NextRequest } from "next/server";
import { isPrivatePath, SESSION_COOKIE_NAME } from "@/lib/auth/constants";
import { buildContentSecurityPolicy, createNonce } from "@/lib/security-headers";

const REQUEST_ID_PATTERN = /^[A-Za-z0-9-]{8,64}$/;

/** Non-HTML responses set their own headers (e.g. /media is sandboxed); the page CSP is not for them. */
const NON_DOCUMENT_PREFIXES = ["/api/", "/media/", "/exports/", "/pwa-icon/", "/reports/share/image"];
const NON_DOCUMENT_PATHS = new Set(["/sw.js", "/manifest.webmanifest"]);

function isDocumentPath(pathname: string): boolean {
  return !NON_DOCUMENT_PATHS.has(pathname) && !NON_DOCUMENT_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/**
 * Optimistic checks only: redirects visitors without a session cookie away from private pages and
 * tags requests with an ID. Real session validation happens server-side in every page/action.
 * Also issues the per-request CSP nonce; Next.js reads it from the request header while rendering.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const incomingId = request.headers.get("x-request-id");
  const requestId = incomingId && REQUEST_ID_PATTERN.test(incomingId) ? incomingId : crypto.randomUUID();
  const isPrivate = isPrivatePath(pathname);

  if (isPrivate && !request.cookies.has(SESSION_COOKIE_NAME)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    loginUrl.searchParams.set("next", `${pathname}${search}`);
    const response = NextResponse.redirect(loginUrl);
    response.headers.set("x-request-id", requestId);
    return response;
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", requestId);
  const csp = isDocumentPath(pathname)
    ? buildContentSecurityPolicy({ nonce: createNonce(), isDev: process.env.NODE_ENV === "development" })
    : null;
  if (csp) requestHeaders.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("x-request-id", requestId);
  if (csp) response.headers.set("Content-Security-Policy", csp);
  if (isPrivate) response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico|txt|xml)$).*)"],
};
