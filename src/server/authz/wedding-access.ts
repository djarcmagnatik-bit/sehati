import "server-only";
import { z } from "zod";
import type { WeddingMemberRole } from "@/generated/prisma/client";
import { getDb } from "@/server/db";

/** Thrown for both "not found" and "not a member" so wedding existence is never revealed. */
export class WeddingAccessError extends Error {
  constructor() {
    super("wedding_access_denied");
    this.name = "WeddingAccessError";
  }
}

export type WeddingMembership = {
  id: string;
  weddingId: string;
  role: WeddingMemberRole;
  displayName: string;
};

const uuidSchema = z.uuid();

/**
 * The single gate for every private wedding operation: the user must be a member of a
 * non-deleted wedding. Pass `ownerOnly` for owner-restricted actions.
 */
export async function requireWeddingMember(
  userId: string,
  weddingId: string,
  options: { ownerOnly?: boolean } = {},
): Promise<WeddingMembership> {
  if (!uuidSchema.safeParse(weddingId).success || !uuidSchema.safeParse(userId).success) {
    throw new WeddingAccessError();
  }

  const membership = await getDb().weddingMember.findFirst({
    where: {
      userId,
      weddingId,
      wedding: { deletedAt: null },
      ...(options.ownerOnly ? { role: "OWNER" as const } : {}),
    },
    select: { id: true, weddingId: true, role: true, displayName: true },
  });

  if (!membership) throw new WeddingAccessError();
  return membership;
}
