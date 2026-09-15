import "server-only";
import { getDb } from "@/server/db";
import type { Mailer } from "@/server/mail/mailer";
import { hashPassword } from "./password";
import { generateToken, hashToken } from "./tokens";

export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

/**
 * Creates a single-use reset token and emails the link. Silently does nothing for unknown emails
 * so the response never reveals whether an account exists.
 */
export async function requestPasswordReset(
  email: string,
  deps: { mailer: Mailer; appUrl: string },
  now: Date = new Date(),
): Promise<void> {
  const db = getDb();
  const user = await db.user.findUnique({
    where: { email: email.trim().toLowerCase() },
    select: { id: true, name: true, email: true },
  });
  if (!user) return;

  const token = generateToken();
  await db.$transaction([
    db.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } }),
    db.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(now.getTime() + PASSWORD_RESET_TTL_MS),
        createdAt: now,
      },
    }),
  ]);

  const url = new URL("/reset-password", deps.appUrl);
  url.searchParams.set("token", token);

  await deps.mailer.send({
    to: user.email,
    subject: "Atur ulang password kamu",
    text: [
      `Halo ${user.name},`,
      "",
      "Kami menerima permintaan untuk mengatur ulang password akun kamu.",
      `Buka tautan berikut untuk membuat password baru (berlaku 60 menit):`,
      url.toString(),
      "",
      "Jika kamu tidak meminta ini, abaikan email ini. Password kamu tidak akan berubah.",
    ].join("\n"),
  });
}

export async function isPasswordResetTokenUsable(token: string, now: Date = new Date()): Promise<boolean> {
  if (!token || token.length > 128) return false;
  const record = await getDb().passwordResetToken.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { usedAt: true, expiresAt: true },
  });
  return Boolean(record && !record.usedAt && record.expiresAt.getTime() > now.getTime());
}

export type ResetPasswordResult = { ok: true } | { ok: false; reason: "invalid_or_expired" };

/** Sets the new password, burns the token and signs the user out of every device. */
export async function resetPassword(
  token: string,
  newPassword: string,
  now: Date = new Date(),
): Promise<ResetPasswordResult> {
  const db = getDb();
  const record = await db.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { id: true, userId: true, usedAt: true, expiresAt: true },
  });
  if (!record || record.usedAt || record.expiresAt.getTime() <= now.getTime()) {
    return { ok: false, reason: "invalid_or_expired" };
  }

  const passwordHash = await hashPassword(newPassword);

  return db.$transaction(async (tx) => {
    // Conditional claim: only one concurrent request can use the token.
    const claimed = await tx.passwordResetToken.updateMany({
      where: { id: record.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (claimed.count !== 1) return { ok: false, reason: "invalid_or_expired" } as const;

    await tx.user.update({ where: { id: record.userId }, data: { passwordHash } });
    await tx.passwordResetToken.deleteMany({ where: { userId: record.userId, usedAt: null } });
    await tx.session.deleteMany({ where: { userId: record.userId } });
    return { ok: true } as const;
  });
}
