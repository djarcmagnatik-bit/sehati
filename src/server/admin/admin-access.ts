import "server-only";
import { notFound } from "next/navigation";
import type { Prisma } from "@/generated/prisma/client";
import { requireSession } from "@/server/auth/session-cookie";
import { getDb } from "@/server/db";

/** Not an admin (or not signed in). Pages answer 404 so the admin area is not advertised. */
export class AdminAccessError extends Error {
  constructor() {
    super("admin_access_denied");
    this.name = "AdminAccessError";
  }
}

export type AdminActor = { id: string; email: string };

/** Role is read from the database on every call, so a demotion takes effect immediately. */
export async function requireAdmin(userId: string): Promise<AdminActor> {
  const user = await getDb().user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, role: true, suspendedAt: true },
  });
  if (!user || user.role !== "ADMIN" || user.suspendedAt) throw new AdminAccessError();
  return { id: user.id, email: user.email };
}

/** For admin pages and layouts. */
export async function requireAdminPage(): Promise<AdminActor> {
  const session = await requireSession();
  try {
    return await requireAdmin(session.user.id);
  } catch {
    notFound();
  }
}

export type AuditSummary = Record<string, string | number | boolean | null>;

/** Written in the caller's transaction so a change and its audit entry commit together. */
export async function recordAdminAudit(
  tx: Prisma.TransactionClient,
  actor: AdminActor,
  entry: { action: string; targetType: string; targetId?: string | null; summary?: AuditSummary },
): Promise<void> {
  await tx.adminAuditLog.create({
    data: {
      actorId: actor.id,
      actorEmail: actor.email,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId ?? null,
      summary: entry.summary ?? {},
    },
  });
}

export const ADMIN_PAGE_SIZE = 25;

export function pageArgs(page: number) {
  const current = Number.isInteger(page) && page >= 1 ? Math.min(page, 10_000) : 1;
  return { page: current, skip: (current - 1) * ADMIN_PAGE_SIZE, take: ADMIN_PAGE_SIZE };
}
