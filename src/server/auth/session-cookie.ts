import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";
import { validateSessionToken, type ValidatedSession } from "./session-service";

const secure = process.env.NODE_ENV === "production";

/** Only callable from Server Actions / Route Handlers. */
export async function setSessionCookie(token: string, expiresAt: Date, remember: boolean): Promise<void> {
  (await cookies()).set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    // Without "remember me" the cookie ends with the browser session (server expiry still applies).
    ...(remember ? { expires: expiresAt } : {}),
  });
}

export async function clearSessionCookie(): Promise<void> {
  // Same attributes as when set — required for `__Host-` cookies to be overwritten.
  (await cookies()).set(SESSION_COOKIE_NAME, "", { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: 0 });
}

export async function readSessionToken(): Promise<string | null> {
  return (await cookies()).get(SESSION_COOKIE_NAME)?.value ?? null;
}

/** Validates the session once per request. */
export const getCurrentSession = cache(async (): Promise<ValidatedSession | null> => {
  const token = await readSessionToken();
  if (!token) return null;
  return validateSessionToken(token);
});

export async function requireSession(): Promise<ValidatedSession> {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  return session;
}
