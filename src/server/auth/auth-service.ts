import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/server/db";
import { hashPassword, verifyPassword } from "./password";
import { generateToken } from "./tokens";

export type RegisterResult = { ok: true; userId: string } | { ok: false; reason: "email_taken" };

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export async function registerUser(input: { name: string; email: string; password: string }): Promise<RegisterResult> {
  const db = getDb();
  const email = normalizeEmail(input.email);

  const existing = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) return { ok: false, reason: "email_taken" };

  const passwordHash = await hashPassword(input.password);
  try {
    const user = await db.user.create({
      data: { name: input.name.trim(), email, passwordHash },
      select: { id: true },
    });
    return { ok: true, userId: user.id };
  } catch (error) {
    // Concurrent registration with the same email.
    if (isUniqueViolation(error)) return { ok: false, reason: "email_taken" };
    throw error;
  }
}

let dummyHash: Promise<string> | undefined;

/** Verifying against a throwaway hash keeps response time similar for unknown emails. */
function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword(generateToken());
  return dummyHash;
}

export async function authenticateUser(email: string, password: string): Promise<{ id: string } | null> {
  const user = await getDb().user.findUnique({
    where: { email: normalizeEmail(email) },
    select: { id: true, passwordHash: true, suspendedAt: true },
  });

  if (!user) {
    await verifyPassword(await getDummyHash(), password);
    return null;
  }

  const valid = await verifyPassword(user.passwordHash, password);
  // Same answer as a wrong password: a suspended account is not confirmed to exist.
  return valid && !user.suspendedAt ? { id: user.id } : null;
}
