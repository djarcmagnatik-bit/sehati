import { afterAll, describe, expect, it } from "vitest";
import { authenticateUser, registerUser } from "@/server/auth/auth-service";
import {
  isPasswordResetTokenUsable,
  PASSWORD_RESET_TTL_MS,
  requestPasswordReset,
  resetPassword,
} from "@/server/auth/password-reset-service";
import {
  createSession,
  listUserSessions,
  REMEMBER_SESSION_TTL_MS,
  revokeOtherUserSessions,
  revokeSessionByToken,
  revokeUserSession,
  SESSION_TTL_MS,
  validateSessionToken,
} from "@/server/auth/session-service";
import { getDb } from "@/server/db";
import { createTestUser, deleteUsers, MemoryMailer, TEST_PASSWORD, uniqueEmail } from "../support/integration-helpers";

const userIds: string[] = [];
const APP_URL = "http://localhost:3000";

afterAll(async () => {
  await deleteUsers(userIds);
});

function extractResetToken(mailer: MemoryMailer): string {
  const text = mailer.messages.at(-1)?.text ?? "";
  const link = text.match(/http:\/\/localhost:3000\/reset-password\?token=[A-Za-z0-9_-]+/)?.[0];
  if (!link) throw new Error("reset link not found in email");
  const token = new URL(link).searchParams.get("token");
  if (!token) throw new Error("token missing from reset link");
  return token;
}

describe("registerUser", () => {
  it("stores a normalized email and an argon2id hash, never the plain password", async () => {
    const email = uniqueEmail("MixedCase").toUpperCase();
    const result = await registerUser({ name: "  Fajar ", email: `  ${email} `, password: TEST_PASSWORD });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    userIds.push(result.userId);

    const user = await getDb().user.findUniqueOrThrow({ where: { id: result.userId } });
    expect(user.email).toBe(email.toLowerCase());
    expect(user.name).toBe("Fajar");
    expect(user.role).toBe("USER");
    expect(user.passwordHash.startsWith("$argon2id$")).toBe(true);
    expect(user.passwordHash).not.toContain(TEST_PASSWORD);
  });

  it("rejects a duplicate email regardless of letter case", async () => {
    const existing = await createTestUser(userIds);
    const duplicate = await registerUser({ name: "Lain", email: existing.email.toUpperCase(), password: "password-lain-1" });
    expect(duplicate).toEqual({ ok: false, reason: "email_taken" });
    expect(await getDb().user.count({ where: { email: existing.email } })).toBe(1);
  });
});

describe("authenticateUser", () => {
  it("accepts the right password and rejects wrong or unknown credentials", async () => {
    const user = await createTestUser(userIds);
    expect(await authenticateUser(user.email, TEST_PASSWORD)).toEqual({ id: user.userId });
    expect(await authenticateUser(` ${user.email.toUpperCase()} `, TEST_PASSWORD)).toEqual({ id: user.userId });
    expect(await authenticateUser(user.email, "password-salah-1")).toBeNull();
    expect(await authenticateUser(uniqueEmail("ghost"), TEST_PASSWORD)).toBeNull();
  });
});

describe("sessions", () => {
  it("stores only the token hash and validates the raw token", async () => {
    const user = await createTestUser(userIds);
    const session = await createSession(user.userId, { remember: false, userAgent: "vitest", ipAddress: "127.0.0.1" });

    const row = await getDb().session.findUniqueOrThrow({ where: { id: session.sessionId } });
    expect(row.tokenHash).toHaveLength(64);
    expect(row.tokenHash).not.toBe(session.token);

    const validated = await validateSessionToken(session.token);
    expect(validated?.user).toEqual({ id: user.userId, name: "Tester", email: user.email, role: "USER" });
    expect(await validateSessionToken(`${session.token}x`)).toBeNull();
    expect(await validateSessionToken(row.tokenHash)).toBeNull();
  });

  it("uses a 24h lifetime by default and 30 days with remember me", async () => {
    const user = await createTestUser(userIds);
    const now = new Date();
    const normal = await createSession(user.userId, { remember: false }, now);
    const remembered = await createSession(user.userId, { remember: true }, now);
    expect(normal.expiresAt.getTime() - now.getTime()).toBe(SESSION_TTL_MS);
    expect(remembered.expiresAt.getTime() - now.getTime()).toBe(REMEMBER_SESSION_TTL_MS);
  });

  it("rejects and deletes expired sessions", async () => {
    const user = await createTestUser(userIds);
    const now = new Date();
    const session = await createSession(user.userId, { remember: false }, now);
    const afterExpiry = new Date(now.getTime() + SESSION_TTL_MS + 1_000);

    expect(await validateSessionToken(session.token, afterExpiry)).toBeNull();
    expect(await getDb().session.findUnique({ where: { id: session.sessionId } })).toBeNull();
  });

  it("logout revokes the session", async () => {
    const user = await createTestUser(userIds);
    const session = await createSession(user.userId, { remember: false });
    await revokeSessionByToken(session.token);
    expect(await validateSessionToken(session.token)).toBeNull();
  });

  it("never lets one user revoke another user's session (IDOR)", async () => {
    const alice = await createTestUser(userIds, "Alice");
    const bob = await createTestUser(userIds, "Bob");
    const bobSession = await createSession(bob.userId, { remember: false });

    expect(await revokeUserSession(alice.userId, bobSession.sessionId)).toBe(false);
    expect(await validateSessionToken(bobSession.token)).not.toBeNull();
    expect(await listUserSessions(alice.userId)).toEqual([]);

    expect(await revokeUserSession(bob.userId, bobSession.sessionId)).toBe(true);
    expect(await validateSessionToken(bobSession.token)).toBeNull();
  });

  it("can sign out every other device while keeping the current one", async () => {
    const user = await createTestUser(userIds);
    const current = await createSession(user.userId, { remember: false });
    const other1 = await createSession(user.userId, { remember: true });
    const other2 = await createSession(user.userId, { remember: false });

    expect(await revokeOtherUserSessions(user.userId, current.sessionId)).toBe(2);
    expect(await validateSessionToken(current.token)).not.toBeNull();
    expect(await validateSessionToken(other1.token)).toBeNull();
    expect(await validateSessionToken(other2.token)).toBeNull();
  });
});

describe("password reset", () => {
  it("emails a single-use link, changes the password and signs out every device", async () => {
    const user = await createTestUser(userIds);
    const session = await createSession(user.userId, { remember: true });
    const mailer = new MemoryMailer();

    await requestPasswordReset(user.email, { mailer, appUrl: APP_URL });
    expect(mailer.messages).toHaveLength(1);
    expect(mailer.messages[0]?.to).toBe(user.email);

    const token = extractResetToken(mailer);
    const stored = await getDb().passwordResetToken.findFirstOrThrow({ where: { userId: user.userId } });
    expect(stored.tokenHash).not.toBe(token);
    expect(await isPasswordResetTokenUsable(token)).toBe(true);

    expect(await resetPassword(token, "password-baru-456")).toEqual({ ok: true });
    expect(await validateSessionToken(session.token)).toBeNull();
    expect(await authenticateUser(user.email, TEST_PASSWORD)).toBeNull();
    expect(await authenticateUser(user.email, "password-baru-456")).toEqual({ id: user.userId });

    // Reuse is rejected.
    expect(await isPasswordResetTokenUsable(token)).toBe(false);
    expect(await resetPassword(token, "password-lain-789")).toEqual({ ok: false, reason: "invalid_or_expired" });
    expect(await authenticateUser(user.email, "password-baru-456")).toEqual({ id: user.userId });
  });

  it("does not send anything for unknown emails", async () => {
    const mailer = new MemoryMailer();
    await requestPasswordReset(uniqueEmail("ghost"), { mailer, appUrl: APP_URL });
    expect(mailer.messages).toHaveLength(0);
  });

  it("rejects expired links", async () => {
    const user = await createTestUser(userIds);
    const mailer = new MemoryMailer();
    const requestedAt = new Date(Date.now() - PASSWORD_RESET_TTL_MS - 60_000);
    await requestPasswordReset(user.email, { mailer, appUrl: APP_URL }, requestedAt);

    const token = extractResetToken(mailer);
    expect(await isPasswordResetTokenUsable(token)).toBe(false);
    expect(await resetPassword(token, "password-baru-456")).toEqual({ ok: false, reason: "invalid_or_expired" });
    expect(await authenticateUser(user.email, TEST_PASSWORD)).toEqual({ id: user.userId });
  });

  it("invalidates the previous link when a new one is requested", async () => {
    const user = await createTestUser(userIds);
    const mailer = new MemoryMailer();
    await requestPasswordReset(user.email, { mailer, appUrl: APP_URL });
    const firstToken = extractResetToken(mailer);
    await requestPasswordReset(user.email, { mailer, appUrl: APP_URL });
    const secondToken = extractResetToken(mailer);

    expect(await resetPassword(firstToken, "password-baru-456")).toEqual({ ok: false, reason: "invalid_or_expired" });
    expect(await resetPassword(secondToken, "password-baru-456")).toEqual({ ok: true });
  });
});
