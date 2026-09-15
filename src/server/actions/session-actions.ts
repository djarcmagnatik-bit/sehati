"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/server/auth/session-cookie";
import { revokeOtherUserSessions, revokeUserSession } from "@/server/auth/session-service";

export async function revokeSessionAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const parsed = z.uuid().safeParse(formData.get("sessionId"));
  // The current session is ended through logout, not from the list.
  if (!parsed.success || parsed.data === session.sessionId) return;

  await revokeUserSession(session.user.id, parsed.data);
  revalidatePath("/settings/security");
}

export async function revokeOtherSessionsAction(): Promise<void> {
  const session = await requireSession();
  await revokeOtherUserSessions(session.user.id, session.sessionId);
  revalidatePath("/settings/security");
}
