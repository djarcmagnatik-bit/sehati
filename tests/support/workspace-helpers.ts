import { addDaysIso, todayIsoInTimeZone } from "@/lib/dates";
import { makeOnboardingSchema } from "@/lib/validation/onboarding";
import { registerUser } from "@/server/auth/auth-service";
import { getDb } from "@/server/db";
import { createWeddingForUser } from "@/server/wedding/wedding-service";
import { createTestUser, ensureReferenceData, TEST_PASSWORD } from "./integration-helpers";

/** Registers a user with a specific email and tracks it for cleanup. */
export async function createUserWithEmail(tracker: string[], email: string, name: string) {
  const result = await registerUser({ name, email, password: TEST_PASSWORD });
  if (!result.ok) throw new Error(`registration failed: ${result.reason}`);
  tracker.push(result.userId);
  return { userId: result.userId, email: email.trim().toLowerCase(), password: TEST_PASSWORD };
}

/** Owner account + wedding workspace (Akad + Resepsi, KUA, Rp100.000.000). */
export async function createOwnerWorkspace(tracker: string[], options: { name?: string; weddingInDays?: number } = {}) {
  const refs = await ensureReferenceData();
  const owner = await createTestUser(tracker, options.name ?? "Fajar");
  const today = todayIsoInTimeZone(new Date());
  const data = makeOnboardingSchema(today).parse({
    displayName: options.name ?? "Fajar",
    partnerName: "Putri",
    brideName: "Putri",
    groomName: "Fajar",
    coupleDisplayFormat: "BRIDE_GROOM",
    weddingDate: addDaysIso(today, options.weddingInDays ?? 400),
    eventTypeId: refs.eventTypeId,
    marriageProcessId: refs.marriageProcessId,
    targetBudget: "100.000.000",
    currency: "IDR",
  });
  const result = await createWeddingForUser(owner.userId, data);
  if (!result.ok) throw new Error(`workspace creation failed: ${result.reason}`);
  const ownerMember = await getDb().weddingMember.findFirstOrThrow({
    where: { weddingId: result.weddingId, userId: owner.userId },
    select: { id: true },
  });
  return { owner, weddingId: result.weddingId, ownerMemberId: ownerMember.id };
}
