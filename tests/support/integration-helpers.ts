import { randomUUID } from "node:crypto";
import { registerUser } from "@/server/auth/auth-service";
import { getDb } from "@/server/db";
import type { MailMessage, Mailer } from "@/server/mail/mailer";
import { upsertReferenceData } from "@/server/seed/reference-data";

export const TEST_PASSWORD = "rahasia-aman-123";

export function uniqueEmail(prefix = "user"): string {
  return `${prefix}-${randomUUID()}@example.test`;
}

export async function ensureReferenceData(): Promise<{ eventTypeId: string; marriageProcessId: string }> {
  const db = getDb();
  await upsertReferenceData(db);
  const [eventType, marriageProcess] = await Promise.all([
    db.eventType.findUniqueOrThrow({ where: { code: "AKAD_RECEPTION" } }),
    db.marriageProcess.findUniqueOrThrow({ where: { code: "KUA" } }),
  ]);
  return { eventTypeId: eventType.id, marriageProcessId: marriageProcess.id };
}

/** Registers a user and records its id for cleanup. */
export async function createTestUser(tracker: string[], name = "Tester") {
  const email = uniqueEmail(name.toLowerCase());
  const result = await registerUser({ name, email, password: TEST_PASSWORD });
  if (!result.ok) throw new Error(`registration failed: ${result.reason}`);
  tracker.push(result.userId);
  return { userId: result.userId, email, password: TEST_PASSWORD };
}

export async function deleteUsers(userIds: string[]): Promise<void> {
  if (userIds.length === 0) return;
  const db = getDb();
  await db.wedding.deleteMany({ where: { members: { some: { userId: { in: userIds } } } } });
  await db.user.deleteMany({ where: { id: { in: userIds } } });
}

export class MemoryMailer implements Mailer {
  readonly messages: MailMessage[] = [];

  async send(message: MailMessage): Promise<void> {
    this.messages.push(message);
  }
}
