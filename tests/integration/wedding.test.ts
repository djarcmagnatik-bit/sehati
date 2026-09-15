import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { dbDateToIso, isoDateToUtcMs, todayIsoInTimeZone } from "@/lib/dates";
import { makeOnboardingSchema, type OnboardingData } from "@/lib/validation/onboarding";
import { requireWeddingMember, WeddingAccessError } from "@/server/authz/wedding-access";
import { getDb } from "@/server/db";
import {
  createWeddingForUser,
  getActiveWeddingForUser,
  updateCoupleNote,
  userHasWedding,
} from "@/server/wedding/wedding-service";
import { createTestUser, deleteUsers, ensureReferenceData } from "../support/integration-helpers";

const userIds: string[] = [];
const today = todayIsoInTimeZone(new Date());
const weddingDate = new Date(isoDateToUtcMs(today) + 460 * 86_400_000).toISOString().slice(0, 10);
let refs: { eventTypeId: string; marriageProcessId: string };

beforeAll(async () => {
  refs = await ensureReferenceData();
});

afterAll(async () => {
  await deleteUsers(userIds);
});

function onboarding(overrides: Record<string, unknown> = {}): OnboardingData {
  return makeOnboardingSchema(today).parse({
    displayName: "Fajar",
    partnerName: "Putri",
    brideName: "Putri",
    groomName: "Fajar",
    coupleDisplayFormat: "BRIDE_GROOM",
    customDisplayName: "",
    weddingDate,
    engagementDate: "",
    receptionDate: "",
    eventTypeId: refs.eventTypeId,
    marriageProcessId: refs.marriageProcessId,
    targetBudget: "100.000.000",
    currency: "IDR",
    ...overrides,
  });
}

async function createCoupleWorkspace() {
  const owner = await createTestUser(userIds, "Fajar");
  const result = await createWeddingForUser(owner.userId, onboarding());
  if (!result.ok) throw new Error(`wedding creation failed: ${result.reason}`);
  return { owner, weddingId: result.weddingId };
}

describe("createWeddingForUser", () => {
  it("creates the workspace with the creator as OWNER and exact date/money values", async () => {
    const { owner, weddingId } = await createCoupleWorkspace();

    const wedding = await getDb().wedding.findUniqueOrThrow({
      where: { id: weddingId },
      include: { members: true, eventType: true, marriageProcess: true },
    });
    expect(wedding.targetBudget).toBe(100_000_000n);
    expect(wedding.currency).toBe("IDR");
    expect(dbDateToIso(wedding.weddingDate)).toBe(weddingDate);
    expect(wedding.timeZone).toBe("Asia/Jakarta");
    expect(wedding.status).toBe("PLANNING");
    expect(wedding.createdById).toBe(owner.userId);
    expect(wedding.eventType?.code).toBe("AKAD_RECEPTION");
    expect(wedding.marriageProcess?.code).toBe("KUA");
    expect(wedding.members).toHaveLength(1);
    expect(wedding.members[0]).toMatchObject({ userId: owner.userId, role: "OWNER", displayName: "Fajar" });

    expect(await userHasWedding(owner.userId)).toBe(true);
    expect((await getActiveWeddingForUser(owner.userId))?.wedding.id).toBe(weddingId);
  });

  it("refuses a second workspace for the same user", async () => {
    const { owner } = await createCoupleWorkspace();
    expect(await createWeddingForUser(owner.userId, onboarding())).toEqual({
      ok: false,
      reason: "already_has_wedding",
    });
  });

  it("creates exactly one workspace when submitted twice concurrently", async () => {
    const owner = await createTestUser(userIds, "Double");
    const results = await Promise.all([
      createWeddingForUser(owner.userId, onboarding()),
      createWeddingForUser(owner.userId, onboarding()),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await getDb().weddingMember.count({ where: { userId: owner.userId } })).toBe(1);
  });

  it("rejects unknown or deactivated reference data", async () => {
    const owner = await createTestUser(userIds, "Ref");
    expect(await createWeddingForUser(owner.userId, onboarding({ eventTypeId: randomUUID() }))).toEqual({
      ok: false,
      reason: "invalid_event_type",
    });
    expect(await createWeddingForUser(owner.userId, onboarding({ marriageProcessId: randomUUID() }))).toEqual({
      ok: false,
      reason: "invalid_marriage_process",
    });
    expect(await userHasWedding(owner.userId)).toBe(false);
  });

  it("enforces a non-negative budget at the database level", async () => {
    const { weddingId } = await createCoupleWorkspace();
    await expect(getDb().wedding.update({ where: { id: weddingId }, data: { targetBudget: -1n } })).rejects.toThrow();
  });
});

describe("wedding authorization", () => {
  it("blocks a non-member from reading or modifying another couple's wedding (IDOR)", async () => {
    const { owner, weddingId } = await createCoupleWorkspace();
    const outsider = await createTestUser(userIds, "Outsider");

    expect(await getActiveWeddingForUser(outsider.userId)).toBeNull();
    await expect(requireWeddingMember(outsider.userId, weddingId)).rejects.toBeInstanceOf(WeddingAccessError);
    await expect(updateCoupleNote(outsider.userId, weddingId, "diretas")).rejects.toBeInstanceOf(WeddingAccessError);
    expect((await getDb().wedding.findUniqueOrThrow({ where: { id: weddingId } })).coupleNote).toBeNull();

    await updateCoupleNote(owner.userId, weddingId, "Jangan lupa meeting WO malam ini");
    const updated = await getDb().wedding.findUniqueOrThrow({ where: { id: weddingId } });
    expect(updated.coupleNote).toBe("Jangan lupa meeting WO malam ini");
    expect(updated.coupleNoteUpdatedAt).toBeInstanceOf(Date);
  });

  it("gives the same answer for unknown and malformed wedding ids", async () => {
    const { owner } = await createCoupleWorkspace();
    await expect(requireWeddingMember(owner.userId, randomUUID())).rejects.toBeInstanceOf(WeddingAccessError);
    await expect(requireWeddingMember(owner.userId, "not-a-uuid")).rejects.toBeInstanceOf(WeddingAccessError);
  });

  it("gives a partner member the same wedding data but not owner-only access", async () => {
    const { owner, weddingId } = await createCoupleWorkspace();
    const partner = await createTestUser(userIds, "Putri");
    await getDb().weddingMember.create({
      data: { weddingId, userId: partner.userId, role: "PARTNER", displayName: "Putri" },
    });

    const partnerView = await getActiveWeddingForUser(partner.userId);
    expect(partnerView?.wedding.id).toBe(weddingId);
    expect(partnerView?.wedding.targetBudget).toBe(100_000_000n);

    await expect(requireWeddingMember(partner.userId, weddingId)).resolves.toMatchObject({ role: "PARTNER" });
    await expect(requireWeddingMember(partner.userId, weddingId, { ownerOnly: true })).rejects.toBeInstanceOf(
      WeddingAccessError,
    );
    await expect(requireWeddingMember(owner.userId, weddingId, { ownerOnly: true })).resolves.toMatchObject({
      role: "OWNER",
    });

    // A change by the partner is visible to the owner.
    await updateCoupleNote(partner.userId, weddingId, "Sudah booking fotografer");
    expect((await getActiveWeddingForUser(owner.userId))?.wedding.coupleNote).toBe("Sudah booking fotografer");
  });

  it("makes soft-deleted weddings inaccessible", async () => {
    const { owner, weddingId } = await createCoupleWorkspace();
    await getDb().wedding.update({ where: { id: weddingId }, data: { deletedAt: new Date() } });

    await expect(requireWeddingMember(owner.userId, weddingId)).rejects.toBeInstanceOf(WeddingAccessError);
    expect(await getActiveWeddingForUser(owner.userId)).toBeNull();
  });
});
