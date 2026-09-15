import { afterAll, describe, expect, it } from "vitest";
import { maskEmail } from "@/lib/activity";
import { DEFAULT_CHECKLIST_FILTERS } from "@/lib/checklist-filters";
import { todayIsoInTimeZone } from "@/lib/dates";
import { ACTIVITY_PAGE_SIZE, getRecentActivity, listActivity } from "@/server/activity/activity-service";
import { WeddingAccessError, requireWeddingMember } from "@/server/authz/wedding-access";
import {
  createTask,
  deleteTask,
  getChecklistSummary,
  listTasks,
  setTaskCompleted,
  updateTask,
} from "@/server/checklist/task-service";
import {
  acceptPartnerInvitation,
  createPartnerInvitation,
  declinePartnerInvitation,
  getPartnerInvitationPreview,
  getPartnerOverview,
  PARTNER_INVITATION_TTL_MS,
  removePartner,
  revokePartnerInvitation,
} from "@/server/collaboration/partner-invitation-service";
import { getDb } from "@/server/db";
import { changeWeddingDate, getActiveWeddingForUser, updateCoupleNote } from "@/server/wedding/wedding-service";
import { createTestUser, deleteUsers, MemoryMailer, uniqueEmail } from "../support/integration-helpers";
import { createOwnerWorkspace, createUserWithEmail } from "../support/workspace-helpers";

const userIds: string[] = [];
const APP_URL = "http://localhost:3000";
const today = todayIsoInTimeZone(new Date());

afterAll(async () => {
  await deleteUsers(userIds);
});

function tokenFrom(inviteUrl: string): string {
  const token = new URL(inviteUrl).searchParams.get("token");
  if (!token) throw new Error("token missing from invite url");
  return token;
}

async function invite(ownerUserId: string, weddingId: string, email: string, now?: Date) {
  const mailer = new MemoryMailer();
  const result = await createPartnerInvitation(ownerUserId, weddingId, email, { mailer, appUrl: APP_URL }, now);
  if (!result.ok) throw new Error(`invite failed: ${result.reason}`);
  return { result, mailer, token: tokenFrom(result.inviteUrl) };
}

describe("PRD acceptance: two accounts, one wedding", () => {
  it("partner joins via invitation and both accounts see and change the same data", async () => {
    const db = getDb();
    const { owner, weddingId } = await createOwnerWorkspace(userIds);
    const partnerEmail = uniqueEmail("putri");

    const { result, mailer, token } = await invite(owner.userId, weddingId, `  ${partnerEmail.toUpperCase()} `);
    expect(result.emailSent).toBe(true);
    expect(mailer.messages).toHaveLength(1);
    expect(mailer.messages[0]?.to).toBe(partnerEmail);
    expect(mailer.messages[0]?.text).toContain(result.inviteUrl);

    const stored = await db.partnerInvitation.findUniqueOrThrow({ where: { id: result.invitationId } });
    expect(stored).toMatchObject({ email: partnerEmail, status: "PENDING", invitedById: owner.userId });
    expect(stored.tokenHash).not.toBe(token);
    expect(stored.expiresAt.getTime() - stored.createdAt.getTime()).toBe(PARTNER_INVITATION_TTL_MS);

    // Public preview exposes only what the invitee needs.
    const preview = await getPartnerInvitationPreview(token);
    expect(preview).toEqual({
      status: "valid",
      coupleName: "Putri & Fajar",
      inviterName: "Fajar",
      maskedEmail: maskEmail(partnerEmail),
      expiresAt: stored.expiresAt,
    });

    const partner = await createUserWithEmail(userIds, partnerEmail, "Putri");
    expect(await acceptPartnerInvitation(partner.userId, token)).toEqual({ ok: true, weddingId });

    const [ownerView, partnerView] = await Promise.all([
      getActiveWeddingForUser(owner.userId),
      getActiveWeddingForUser(partner.userId),
    ]);
    expect(partnerView?.role).toBe("PARTNER");
    expect(partnerView?.wedding.id).toBe(weddingId);
    expect(partnerView?.wedding).toEqual(ownerView?.wedding);
    expect(partnerView?.wedding.targetBudget).toBe(100_000_000n);

    const all = { ...DEFAULT_CHECKLIST_FILTERS, view: "all" as const };
    const [ownerTasks, partnerTasks] = await Promise.all([
      listTasks(owner.userId, weddingId, all, today),
      listTasks(partner.userId, weddingId, all, today),
    ]);
    expect(partnerTasks.total).toBe(ownerTasks.total);
    expect(partnerTasks.items.map((t) => t.id)).toEqual(ownerTasks.items.map((t) => t.id));

    // Partner completes a task → owner's dashboard numbers change.
    const task = ownerTasks.items[0]!;
    await setTaskCompleted(partner.userId, task.id, true);
    expect((await getChecklistSummary(owner.userId, weddingId, today)).completed).toBe(1);

    // Invitation is single-use.
    expect(await getPartnerInvitationPreview(token)).toEqual({ status: "invalid" });
    expect(await acceptPartnerInvitation(partner.userId, token)).toEqual({ ok: false, reason: "invalid" });

    const activity = await getRecentActivity(owner.userId, weddingId, 10);
    expect(activity.map((a) => a.action)).toEqual(
      expect.arrayContaining(["wedding.created", "partner.invited", "partner.joined", "task.completed"]),
    );
    expect(activity.find((a) => a.action === "task.completed")).toMatchObject({
      actorName: "Putri",
      metadata: { title: task.title },
    });
    expect(activity.find((a) => a.action === "partner.invited")?.metadata).toEqual({ email: maskEmail(partnerEmail) });

    // No secrets or full emails in the activity log.
    const serialized = JSON.stringify(await db.activityLog.findMany({ where: { weddingId } }));
    expect(serialized).not.toContain(token);
    expect(serialized).not.toContain(stored.tokenHash);
    expect(serialized).not.toContain(partnerEmail);
  });
});

describe("invitation rules", () => {
  it("only the owner can invite, revoke or remove", async () => {
    const { owner, weddingId } = await createOwnerWorkspace(userIds);
    const partner = await createTestUser(userIds, "Putri");
    await getDb().weddingMember.create({ data: { weddingId, userId: partner.userId, role: "PARTNER", displayName: "Putri" } });
    const outsider = await createTestUser(userIds, "Outsider");
    const mailer = new MemoryMailer();

    expect(await createPartnerInvitation(partner.userId, weddingId, uniqueEmail(), { mailer, appUrl: APP_URL })).toEqual({
      ok: false,
      reason: "not_owner",
    });
    expect(await revokePartnerInvitation(partner.userId, weddingId)).toEqual({ ok: false, reason: "not_owner" });
    expect(await removePartner(partner.userId, weddingId)).toEqual({ ok: false, reason: "not_owner" });
    expect((await getPartnerOverview(partner.userId, weddingId)).pendingInvitation).toBeNull();

    await expect(
      createPartnerInvitation(outsider.userId, weddingId, uniqueEmail(), { mailer, appUrl: APP_URL }),
    ).rejects.toBeInstanceOf(WeddingAccessError);
    await expect(revokePartnerInvitation(outsider.userId, weddingId)).rejects.toBeInstanceOf(WeddingAccessError);
    await expect(removePartner(outsider.userId, weddingId)).rejects.toBeInstanceOf(WeddingAccessError);
    await expect(getPartnerOverview(outsider.userId, weddingId)).rejects.toBeInstanceOf(WeddingAccessError);
    await expect(listActivity(outsider.userId, weddingId, 1)).rejects.toBeInstanceOf(WeddingAccessError);

    // Workspace is already full.
    expect(await createPartnerInvitation(owner.userId, weddingId, uniqueEmail(), { mailer, appUrl: APP_URL })).toEqual({
      ok: false,
      reason: "partner_already_joined",
    });
    expect(mailer.messages).toHaveLength(0);
  });

  it("rejects inviting yourself", async () => {
    const { owner, weddingId } = await createOwnerWorkspace(userIds);
    const mailer = new MemoryMailer();
    expect(
      await createPartnerInvitation(owner.userId, weddingId, owner.email.toUpperCase(), { mailer, appUrl: APP_URL }),
    ).toEqual({ ok: false, reason: "own_email" });
  });

  it("a new invitation replaces the pending one and revoking kills the link", async () => {
    const { owner, weddingId } = await createOwnerWorkspace(userIds);
    const email = uniqueEmail("putri");
    const first = await invite(owner.userId, weddingId, email);
    const second = await invite(owner.userId, weddingId, email);

    expect(await getPartnerInvitationPreview(first.token)).toEqual({ status: "invalid" });
    expect((await getPartnerInvitationPreview(second.token)).status).toBe("valid");
    expect((await getPartnerOverview(owner.userId, weddingId)).pendingInvitation?.id).toBe(second.result.invitationId);

    expect(await revokePartnerInvitation(owner.userId, weddingId)).toEqual({ ok: true, revoked: 1 });
    expect(await getPartnerInvitationPreview(second.token)).toEqual({ status: "invalid" });

    const partner = await createUserWithEmail(userIds, email, "Putri");
    expect(await acceptPartnerInvitation(partner.userId, second.token)).toEqual({ ok: false, reason: "invalid" });
    expect(await getActiveWeddingForUser(partner.userId)).toBeNull();
  });

  it("requires the invited email and leaves the invitation usable on mismatch", async () => {
    const { owner, weddingId } = await createOwnerWorkspace(userIds);
    const email = uniqueEmail("putri");
    const { token } = await invite(owner.userId, weddingId, email);

    const wrongAccount = await createTestUser(userIds, "Orang lain");
    expect(await acceptPartnerInvitation(wrongAccount.userId, token)).toEqual({ ok: false, reason: "email_mismatch" });
    expect(await declinePartnerInvitation(wrongAccount.userId, token)).toEqual({ ok: false, reason: "email_mismatch" });
    await expect(requireWeddingMember(wrongAccount.userId, weddingId)).rejects.toBeInstanceOf(WeddingAccessError);

    const partner = await createUserWithEmail(userIds, email, "Putri");
    expect(await acceptPartnerInvitation(partner.userId, token)).toEqual({ ok: true, weddingId });
  });

  it("rejects expired, malformed and declined invitations", async () => {
    const { owner, weddingId } = await createOwnerWorkspace(userIds);
    const email = uniqueEmail("putri");
    const partner = await createUserWithEmail(userIds, email, "Putri");

    const expired = await invite(owner.userId, weddingId, email, new Date(Date.now() - PARTNER_INVITATION_TTL_MS - 60_000));
    expect(await getPartnerInvitationPreview(expired.token)).toEqual({ status: "invalid" });
    expect(await acceptPartnerInvitation(partner.userId, expired.token)).toEqual({ ok: false, reason: "invalid" });

    expect(await acceptPartnerInvitation(partner.userId, "")).toEqual({ ok: false, reason: "invalid" });
    expect(await acceptPartnerInvitation(partner.userId, "x".repeat(500))).toEqual({ ok: false, reason: "invalid" });
    expect(await getPartnerInvitationPreview("tidak-ada")).toEqual({ status: "invalid" });

    const fresh = await invite(owner.userId, weddingId, email);
    expect(await declinePartnerInvitation(partner.userId, fresh.token)).toEqual({ ok: true });
    expect(await acceptPartnerInvitation(partner.userId, fresh.token)).toEqual({ ok: false, reason: "invalid" });
    const activity = await getRecentActivity(owner.userId, weddingId, 1);
    expect(activity[0]).toMatchObject({ action: "partner.invitation_declined", actorName: "Putri" });
  });

  it("does not let an account with its own workspace join another", async () => {
    const a = await createOwnerWorkspace(userIds, { name: "Fajar" });
    const b = await createOwnerWorkspace(userIds, { name: "Budi" });
    const { token } = await invite(a.owner.userId, a.weddingId, b.owner.email);

    expect(await acceptPartnerInvitation(b.owner.userId, token)).toEqual({ ok: false, reason: "has_other_wedding" });
    await expect(requireWeddingMember(b.owner.userId, a.weddingId)).rejects.toBeInstanceOf(WeddingAccessError);
  });

  it("never exceeds two members, even with concurrent accepts", async () => {
    const { owner, weddingId } = await createOwnerWorkspace(userIds);
    const email = uniqueEmail("putri");
    const { token } = await invite(owner.userId, weddingId, email);
    const partner = await createUserWithEmail(userIds, email, "Putri");

    const results = await Promise.all([
      acceptPartnerInvitation(partner.userId, token),
      acceptPartnerInvitation(partner.userId, token),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await getDb().weddingMember.count({ where: { weddingId } })).toBe(2);

    // Pending invitation while someone else fills the slot → workspace_full.
    const other = await createOwnerWorkspace(userIds);
    const otherEmail = uniqueEmail("late");
    const late = await invite(other.owner.userId, other.weddingId, otherEmail);
    const intruder = await createTestUser(userIds, "Intruder");
    await getDb().weddingMember.create({
      data: { weddingId: other.weddingId, userId: intruder.userId, role: "PARTNER", displayName: "Intruder" },
    });
    const lateUser = await createUserWithEmail(userIds, otherEmail, "Late");
    expect(await acceptPartnerInvitation(lateUser.userId, late.token)).toEqual({ ok: false, reason: "workspace_full" });
  });

  it("removing the partner revokes access but keeps their work", async () => {
    const { owner, weddingId } = await createOwnerWorkspace(userIds);
    const email = uniqueEmail("putri");
    const { token } = await invite(owner.userId, weddingId, email);
    const partner = await createUserWithEmail(userIds, email, "Putri");
    await acceptPartnerInvitation(partner.userId, token);

    const partnerMember = await getDb().weddingMember.findFirstOrThrow({ where: { weddingId, userId: partner.userId } });
    const categoryId = (await getDb().taskCategory.findFirstOrThrow({ where: { code: "OTHER" } })).id;
    const created = await createTask(partner.userId, weddingId, {
      title: "Tugas dari Putri",
      description: null,
      categoryId,
      dueDate: null,
      priority: "MEDIUM",
      assigneeMemberId: partnerMember.id,
    });
    if (!created.ok) throw new Error("create failed");

    expect(await removePartner(owner.userId, weddingId)).toEqual({ ok: true });
    expect(await removePartner(owner.userId, weddingId)).toEqual({ ok: false, reason: "no_partner" });

    await expect(requireWeddingMember(partner.userId, weddingId)).rejects.toBeInstanceOf(WeddingAccessError);
    expect(await getActiveWeddingForUser(partner.userId)).toBeNull();
    const task = await getDb().task.findUniqueOrThrow({ where: { id: created.taskId } });
    expect(task.assigneeMemberId).toBeNull();
    expect(task.title).toBe("Tugas dari Putri");

    const activity = await getRecentActivity(owner.userId, weddingId, 1);
    expect(activity[0]).toMatchObject({ action: "partner.removed", actorName: "Fajar", metadata: { name: "Putri" } });
  });
});

describe("activity log", () => {
  it("records planning changes with actor and non-secret context, newest first", async () => {
    const { owner, weddingId } = await createOwnerWorkspace(userIds);
    const categoryId = (await getDb().taskCategory.findFirstOrThrow({ where: { code: "OTHER" } })).id;
    const base = { description: null, categoryId, dueDate: null, priority: "MEDIUM" as const, assigneeMemberId: null };

    const created = await createTask(owner.userId, weddingId, { ...base, title: "Cetak souvenir" });
    if (!created.ok) throw new Error("create failed");
    await updateTask(owner.userId, created.taskId, { ...base, title: "Cetak souvenir (revisi)", status: "IN_PROGRESS" });
    await setTaskCompleted(owner.userId, created.taskId, true);
    await setTaskCompleted(owner.userId, created.taskId, true); // no-op, no log
    await setTaskCompleted(owner.userId, created.taskId, false);
    await deleteTask(owner.userId, created.taskId);
    await updateCoupleNote(owner.userId, weddingId, "Meeting WO jam 7");
    await changeWeddingDate(owner.userId, weddingId, todayIsoInTimeZone(new Date(Date.now() + 300 * 86_400_000)), true);

    const recent = await getRecentActivity(owner.userId, weddingId, 8);
    expect(recent.map((a) => a.action)).toEqual([
      "wedding.date_changed",
      "couple_note.updated",
      "task.deleted",
      "task.reopened",
      "task.completed",
      "task.updated",
      "task.created",
      "wedding.created",
    ]);
    expect(recent.every((a) => a.actorName === "Fajar")).toBe(true);
    expect(recent[2]?.metadata).toEqual({ title: "Cetak souvenir (revisi)" });
    expect(recent[0]?.metadata).toMatchObject({ recalculated: expect.any(Number) });
  });

  it("paginates the full history", async () => {
    const { owner, weddingId } = await createOwnerWorkspace(userIds);
    for (let i = 0; i < ACTIVITY_PAGE_SIZE + 2; i += 1) {
      await updateCoupleNote(owner.userId, weddingId, `Catatan ${i}`);
    }
    const page1 = await listActivity(owner.userId, weddingId, 1);
    const page2 = await listActivity(owner.userId, weddingId, 2);
    expect(page1.total).toBe(ACTIVITY_PAGE_SIZE + 3); // + wedding.created
    expect(page1.items).toHaveLength(ACTIVITY_PAGE_SIZE);
    expect(page2.items).toHaveLength(3);
    expect(new Set([...page1.items, ...page2.items].map((a) => a.id)).size).toBe(ACTIVITY_PAGE_SIZE + 3);
    expect(page2.items.at(-1)?.action).toBe("wedding.created");
  });
});
