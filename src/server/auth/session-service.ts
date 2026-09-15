import "server-only";
import type { UserRole } from "@/generated/prisma/client";
import { getDb } from "@/server/db";
import { generateToken, hashToken } from "./tokens";

export const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
export const REMEMBER_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const LAST_SEEN_THROTTLE_MS = 5 * 60 * 1000;
const MAX_TOKEN_LENGTH = 128;

export type SessionUser = { id: string; name: string; email: string; role: UserRole };

export type ValidatedSession = {
  sessionId: string;
  expiresAt: Date;
  remember: boolean;
  user: SessionUser;
};

export async function createSession(
  userId: string,
  options: { remember: boolean; userAgent?: string | null; ipAddress?: string | null },
  now: Date = new Date(),
): Promise<{ token: string; sessionId: string; expiresAt: Date }> {
  const token = generateToken();
  const expiresAt = new Date(now.getTime() + (options.remember ? REMEMBER_SESSION_TTL_MS : SESSION_TTL_MS));
  const session = await getDb().session.create({
    data: {
      tokenHash: hashToken(token),
      userId,
      remember: options.remember,
      userAgent: options.userAgent?.slice(0, 512) ?? null,
      ipAddress: options.ipAddress?.slice(0, 64) ?? null,
      expiresAt,
      lastSeenAt: now,
      createdAt: now,
    },
    select: { id: true, expiresAt: true },
  });
  return { token, sessionId: session.id, expiresAt: session.expiresAt };
}

export async function validateSessionToken(token: string, now: Date = new Date()): Promise<ValidatedSession | null> {
  if (!token || token.length > MAX_TOKEN_LENGTH) return null;
  const db = getDb();
  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      id: true,
      expiresAt: true,
      remember: true,
      lastSeenAt: true,
      user: { select: { id: true, name: true, email: true, role: true } },
    },
  });
  if (!session) return null;

  if (session.expiresAt.getTime() <= now.getTime()) {
    await db.session.deleteMany({ where: { id: session.id } });
    return null;
  }

  if (now.getTime() - session.lastSeenAt.getTime() > LAST_SEEN_THROTTLE_MS) {
    await db.session.updateMany({ where: { id: session.id }, data: { lastSeenAt: now } });
  }

  return { sessionId: session.id, expiresAt: session.expiresAt, remember: session.remember, user: session.user };
}

export async function revokeSessionByToken(token: string): Promise<void> {
  if (!token || token.length > MAX_TOKEN_LENGTH) return;
  await getDb().session.deleteMany({ where: { tokenHash: hashToken(token) } });
}

/** Scoped by userId so a user can never revoke someone else's session (IDOR-safe). */
export async function revokeUserSession(userId: string, sessionId: string): Promise<boolean> {
  const result = await getDb().session.deleteMany({ where: { id: sessionId, userId } });
  return result.count > 0;
}

export async function revokeOtherUserSessions(userId: string, keepSessionId: string): Promise<number> {
  const result = await getDb().session.deleteMany({ where: { userId, NOT: { id: keepSessionId } } });
  return result.count;
}

export function listUserSessions(userId: string, now: Date = new Date()) {
  return getDb().session.findMany({
    where: { userId, expiresAt: { gt: now } },
    orderBy: { lastSeenAt: "desc" },
    select: {
      id: true,
      userAgent: true,
      ipAddress: true,
      remember: true,
      createdAt: true,
      lastSeenAt: true,
      expiresAt: true,
    },
  });
}
