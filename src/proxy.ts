import { NextResponse, type NextRequest } from "next/server";
import { isPrivatePath, SESSION_COOKIE_NAME } from "@/lib/auth/constants";

const REQUEST_ID_PATTERN = /^[A-Za-z0-9-]{8,64}$/;

/**
 * Optimistic checks only: redirects visitors without a session cookie away from private pages and
 * tags requests with an ID. Real session validation happens server-side in every page/action.
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
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("x-request-id", requestId);
  if (isPrivate) response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico|txt|xml)$).*)"],
};
