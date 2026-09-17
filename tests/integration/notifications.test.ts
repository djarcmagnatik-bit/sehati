import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

// Enables the cron endpoint for this file. Read lazily by getEnv(), i.e. after this line runs.
const CRON_SECRET = "integration-cron-secret-0123456789abcdef";
process.env["JOBS_CRON_SECRET"] = CRON_SECRET;

import { POST as cronRoute } from "@/app/api/jobs/run/route";
import { addDaysIso, isoToDbDate, todayIsoInTimeZone } from "@/lib/dates";
import { adminGrantPlan, getBillingOverview } from "@/server/billing/billing-service";
import { createExpense, updateBudgetSettings } from "@/server/budget/budget-service";
import { acceptPartnerInvitation, createPartnerInvitation } from "@/server/collaboration/partner-invitation-service";
import { getDb } from "@/server/db";
import { createGuest } from "@/server/guests/guest-service";
import { createWeddingEvent } from "@/server/invitation/event-service";
import { ensureInvitation, getInvitationForUser, publishInvitation, updateSectionContent } from "@/server/invitation/invitation-service";
import {
  claimJobs,
  completeJob,
  enqueueJob,
  ensureRecurringJob,
  failJob,
  JOB_LEASE_MS,
  PermanentJobError,
} from "@/server/jobs/queue";
import { runDueJobs } from "@/server/jobs/runner";
import { handleRemindersScan } from "@/server/notifications/notification-jobs";
import {
  countUnreadNotifications,
  deliverNotification,
  listNotifications,
  markAllNotificationsRead,
  openNotification,
} from "@/server/notifications/notification-service";
import { submitRsvp } from "@/server/rsvp/rsvp-service";
import { MemoryMailer, createTestUser, deleteUsers } from "../support/integration-helpers";
import { createUserWithEmail, createOwnerWorkspace } from "../support/workspace-helpers";

const userIds: string[] = [];
const M = 1_000_000n;

afterAll(async () => {
  await deleteUsers(userIds);
  await getDb().backgroundJob.deleteMany({});
});

// Every test starts with an empty queue so claims only see this test's jobs (test database only).
beforeEach(async () => {
  await getDb().backgroundJob.deleteMany({});
});

const drain = () => runDueJobs({ workerId: "test-worker" });

async function notificationsFor(userId: string) {
  return getDb().notification.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });
}

describe("job queue", () => {
  it("collapses waiting duplicates but accepts a new request once the first one runs", async () => {
    const weddingId = randomUUID();
    const db = getDb();
    await enqueueJob(db, "budget.check", { weddingId }, { dedupeKey: `budget.check:${weddingId}` });
    await enqueueJob(db, "budget.check", { weddingId }, { dedupeKey: `budget.check:${weddingId}` });
    expect(await db.backgroundJob.count()).toBe(1);

    const [claimed] = await claimJobs("worker-a", 10);
    expect(claimed).toMatchObject({ type: "budget.check", attempts: 1 });
    await enqueueJob(db, "budget.check", { weddingId }, { dedupeKey: `budget.check:${weddingId}` });
    expect(await db.backgroundJob.count({ where: { state: "PENDING" } })).toBe(1);
    expect(await db.backgroundJob.count({ where: { state: "RUNNING" } })).toBe(1);
  });

  it("never hands the same job to two concurrent workers", async () => {
    const db = getDb();
    for (let index = 0; index < 20; index += 1) await enqueueJob(db, "reminders.scan", {});
    const batches = await Promise.all(["w1", "w2", "w3", "w4"].map((worker) => claimJobs(worker, 10)));
    const ids = batches.flat().map((job) => job.id);
    expect(ids).toHaveLength(20);
    expect(new Set(ids).size).toBe(20);
  });

  it("retries with backoff, then parks the job as dead", async () => {
    const db = getDb();
    const now = new Date();
    await enqueueJob(db, "reminders.scan", {}, { maxAttempts: 2, runAt: now });

    const [first] = await claimJobs("w", 1, now);
    expect(await failJob(first!, "w", new Error("database hiccup"), now)).toBe("retry");
    const waiting = await db.backgroundJob.findUniqueOrThrow({ where: { id: first!.id } });
    expect(waiting).toMatchObject({ state: "PENDING", attempts: 1, lockedAt: null, lastError: "Error: database hiccup" });
    expect(waiting.runAt.getTime()).toBe(now.getTime() + 30_000);

    expect(await claimJobs("w", 1, new Date(now.getTime() + 29_000))).toHaveLength(0);
    const [second] = await claimJobs("w", 1, new Date(now.getTime() + 31_000));
    expect(second?.attempts).toBe(2);
    expect(await failJob(second!, "w", new Error("again"), now)).toBe("dead");
    expect(await db.backgroundJob.findUniqueOrThrow({ where: { id: first!.id } })).toMatchObject({ state: "DEAD" });

    await enqueueJob(db, "reminders.scan", {});
    const [permanent] = await claimJobs("w", 1);
    expect(await failJob(permanent!, "w", new PermanentJobError("bad payload"))).toBe("dead");
  });

  it("lets a newer waiting request supersede a failed run with the same key", async () => {
    const db = getDb();
    const weddingId = randomUUID();
    const key = `budget.check:${weddingId}`;
    await enqueueJob(db, "budget.check", { weddingId }, { dedupeKey: key });
    const [running] = await claimJobs("w", 1);
    await enqueueJob(db, "budget.check", { weddingId }, { dedupeKey: key });
    expect(await failJob(running!, "w", new Error("boom"))).toBe("superseded");
    expect(await db.backgroundJob.findUniqueOrThrow({ where: { id: running!.id } })).toMatchObject({ state: "DONE" });
    expect(await db.backgroundJob.count({ where: { dedupeKey: key, state: "PENDING" } })).toBe(1);
  });

  it("reclaims a job whose worker stopped responding, and the old worker cannot close it", async () => {
    const db = getDb();
    const start = new Date();
    await enqueueJob(db, "reminders.scan", {}, { runAt: start });
    const [held] = await claimJobs("crashed", 1, start);
    expect(await claimJobs("healthy", 1, new Date(start.getTime() + 60_000))).toHaveLength(0);

    const [reclaimed] = await claimJobs("healthy", 1, new Date(start.getTime() + JOB_LEASE_MS + 1000));
    expect(reclaimed).toMatchObject({ id: held!.id, attempts: 2 });
    await completeJob(held!, "crashed");
    expect(await db.backgroundJob.findUniqueOrThrow({ where: { id: held!.id } })).toMatchObject({ state: "RUNNING", lockedBy: "healthy" });
    await completeJob(reclaimed!, "healthy");
    expect(await db.backgroundJob.findUniqueOrThrow({ where: { id: held!.id } })).toMatchObject({ state: "DONE" });
  });

  it("sends jobs with unknown types or invalid payloads straight to dead", async () => {
    const db = getDb();
    await db.backgroundJob.create({ data: { type: "notify.rsvp_received", payload: { submissionId: "not-a-uuid" } } });
    await db.backgroundJob.create({ data: { type: "mystery.job", payload: {} } });
    expect(await drain()).toEqual({ done: 0, retried: 0, dead: 2 });
    await expect(db.backgroundJob.create({ data: { type: "Bad Type!", payload: {} } })).rejects.toThrow();
  });

  it("schedules a recurring job once per interval", async () => {
    const now = new Date();
    expect(await ensureRecurringJob("maintenance.cleanup", 60_000, now)).toBe(true);
    expect(await ensureRecurringJob("maintenance.cleanup", 60_000, now)).toBe(false);
    const [job] = await claimJobs("w", 1, now);
    await completeJob(job!, "w", now);
    expect(await ensureRecurringJob("maintenance.cleanup", 60_000, new Date(now.getTime() + 30_000))).toBe(false);
    expect(await ensureRecurringJob("maintenance.cleanup", 60_000, new Date(now.getTime() + 61_000))).toBe(true);
  });
});

describe("event notifications are delivered asynchronously", () => {
  async function publishedWithGuest() {
    const today = todayIsoInTimeZone(new Date());
    const workspace = await createOwnerWorkspace(userIds);
    const { owner, weddingId } = workspace;
    await ensureInvitation(owner.userId, weddingId);
    await createWeddingEvent(owner.userId, weddingId, {
      name: "Resepsi",
      eventDate: addDaysIso(today, 300),
      startTime: "18:00",
      endTime: null,
      venueName: "Gedung",
      address: null,
      latitude: null,
      longitude: null,
      mapsUrl: null,
      dressCode: null,
      notes: null,
    });
    const invitation = await getInvitationForUser(owner.userId, weddingId);
    const couple = invitation!.sections.find((section) => section.type === "COUPLE")!;
    await updateSectionContent(owner.userId, couple.id, { brideFullName: "Putri Ayu", groomFullName: "Fajar Pratama" }, true);
    const guest = await createGuest(owner.userId, weddingId, {
      guestName: "Ahmad Fauzi",
      invitationName: "Keluarga Bapak Ahmad",
      groupId: null,
      phone: null,
      email: null,
      address: null,
      seatCount: 4,
      invitationStatus: "SENT",
      rsvpStatus: "PENDING",
      attendingCount: 0,
      notes: null,
    });
    if (!guest.ok) throw new Error("guest creation failed");
    const published = await publishInvitation(owner.userId, weddingId);
    if (!published.ok) throw new Error("publish failed");
    const row = await getDb().guest.findUniqueOrThrow({ where: { id: guest.guestId }, select: { invitationToken: true } });
    return { ...workspace, guestId: guest.guestId, token: row.invitationToken };
  }

  it("queues an RSVP notification with the answer and delivers it once", async () => {
    const { owner, weddingId, guestId, token } = await publishedWithGuest();
    const result = await submitRsvp(token, { rsvpStatus: "ATTENDING", attendingCount: 3, attendeeNames: null, message: null });
    expect(result.ok).toBe(true);

    // Nothing is delivered inside the guest's request.
    expect(await notificationsFor(owner.userId)).toHaveLength(0);
    expect(await getDb().backgroundJob.count({ where: { type: "notify.rsvp_received", state: "PENDING" } })).toBe(1);

    await drain();
    const [notification] = await notificationsFor(owner.userId);
    expect(notification).toMatchObject({
      weddingId,
      type: "RSVP_RECEIVED",
      title: "Keluarga Bapak Ahmad membalas RSVP",
      body: "Hadir · 3 orang",
      link: `/guests/${guestId}`,
      readAt: null,
    });

    // A replayed job does not notify twice.
    const submission = await getDb().rsvpSubmission.findFirstOrThrow({ where: { guestId } });
    await enqueueJob(getDb(), "notify.rsvp_received", { submissionId: submission.id });
    await drain();
    expect(await notificationsFor(owner.userId)).toHaveLength(1);
  });

  it("stays silent when the wedding no longer has guest access", async () => {
    const { owner, weddingId, token } = await publishedWithGuest();
    const overview = await getBillingOverview(owner.userId, weddingId);
    await submitRsvp(token, { rsvpStatus: "DECLINED", attendingCount: 0, attendeeNames: null, message: null });
    await getDb().weddingEntitlement.updateMany({
      where: { id: { in: overview.activeEntitlements.map((item) => item.id) } },
      data: { revokedAt: new Date() },
    });
    expect(await drain()).toMatchObject({ done: 1, dead: 0 });
    expect(await notificationsFor(owner.userId)).toHaveLength(0);
  });

  it("tells an existing account about a partner invitation (without the secret link) and the owner when they join", async () => {
    const { owner, weddingId } = await createOwnerWorkspace(userIds);
    const partnerEmail = `partner-${randomUUID()}@example.test`;
    const partner = await createUserWithEmail(userIds, partnerEmail, "Putri");
    const mailer = new MemoryMailer();
    const invited = await createPartnerInvitation(owner.userId, weddingId, partnerEmail, { mailer, appUrl: "http://localhost:3000" });
    if (!invited.ok) throw new Error("invite failed");

    await drain();
    const [invite] = await notificationsFor(partner.userId);
    expect(invite).toMatchObject({ type: "PARTNER_INVITED", weddingId: null, link: null });
    expect(invite?.body).not.toContain("token");
    expect(await notificationsFor(owner.userId)).toHaveLength(0);

    const token = new URL(invited.inviteUrl).searchParams.get("token")!;
    expect((await acceptPartnerInvitation(partner.userId, token)).ok).toBe(true);
    await drain();
    expect(await notificationsFor(owner.userId)).toMatchObject([{ type: "PARTNER_JOINED", title: "Putri bergabung ke ruang kerja", weddingId }]);
    expect((await notificationsFor(partner.userId)).map((item) => item.type)).toEqual(["PARTNER_INVITED"]);
  });

  it("does not notify anyone when the invited email has no account", async () => {
    const { owner, weddingId } = await createOwnerWorkspace(userIds);
    const before = new Date();
    const invited = await createPartnerInvitation(owner.userId, weddingId, `nobody-${randomUUID()}@example.test`, {
      mailer: new MemoryMailer(),
      appUrl: "http://localhost:3000",
    });
    expect(invited.ok).toBe(true);
    expect(await drain()).toMatchObject({ done: 1 });
    expect(await getDb().notification.count({ where: { type: "PARTNER_INVITED", createdAt: { gte: before } } })).toBe(0);
  });

  it("warns once per budget crossing, and again after the target is raised and exceeded", async () => {
    const { owner, weddingId } = await createOwnerWorkspace(userIds);
    const db = getDb();
    const category = await db.budgetCategory.findFirstOrThrow({ where: { weddingId }, select: { id: true } });
    await updateBudgetSettings(owner.userId, weddingId, { targetBudget: 50n * M, warningPercent: 80 });
    await db.budgetCategory.update({ where: { id: category.id }, data: { allocatedAmount: 20n * M } });

    const expense = (amount: bigint) =>
      createExpense(owner.userId, weddingId, { title: "Gedung", categoryId: category.id, vendorId: null, totalAmount: amount, dueDate: null, notes: null });

    await expense(30n * M);
    await drain();
    expect((await notificationsFor(owner.userId)).map((item) => item.title)).toEqual([expect.stringMatching(/^Kategori .+ melebihi alokasi$/)]);

    await expense(30n * M);
    await expense(1n * M);
    // Three changes, but the waiting check is shared.
    expect(await db.backgroundJob.count({ where: { type: "budget.check", state: "PENDING" } })).toBe(1);
    await drain();
    const afterTotal = await notificationsFor(owner.userId);
    expect(afterTotal.map((item) => item.title)).toContain("Pengeluaran melebihi target budget");
    expect(afterTotal).toHaveLength(2);

    await expense(1n * M);
    await drain();
    expect(await notificationsFor(owner.userId)).toHaveLength(2);

    await updateBudgetSettings(owner.userId, weddingId, { targetBudget: 62n * M, warningPercent: 80 });
    await expense(2n * M);
    await drain();
    expect((await notificationsFor(owner.userId)).filter((item) => item.title === "Pengeluaran melebihi target budget")).toHaveLength(2);
  });
});

describe("reminder scan", () => {
  it("groups tasks per due date, reminds recent overdue ones, and flags payments due soon", async () => {
    const { owner, weddingId } = await createOwnerWorkspace(userIds);
    const db = getDb();
    const now = new Date();
    const today = todayIsoInTimeZone(now, "Asia/Jakarta");
    await db.task.deleteMany({ where: { weddingId } });
    const category = await db.taskCategory.findFirstOrThrow({ select: { id: true } });
    const task = (title: string, dueIso: string, status: "TODO" | "COMPLETED" = "TODO") =>
      db.task.create({ data: { weddingId, categoryId: category.id, title, dueDate: isoToDbDate(dueIso), status, source: "CUSTOM" } });

    await task("Fitting baju", addDaysIso(today, 1));
    await task("Booking MUA", addDaysIso(today, 1));
    await task("Cetak undangan", addDaysIso(today, 1), "COMPLETED");
    await task("Survey gedung", addDaysIso(today, -2));
    await task("Tugas lama sekali", addDaysIso(today, -30));
    await task("Masih lama", addDaysIso(today, 20));

    const budgetCategory = await db.budgetCategory.findFirstOrThrow({ where: { weddingId }, select: { id: true } });
    const due = await createExpense(owner.userId, weddingId, {
      title: "DP Katering",
      categoryId: budgetCategory.id,
      vendorId: null,
      totalAmount: 5n * M,
      dueDate: addDaysIso(today, 2),
      notes: null,
    });
    if (!due.ok) throw new Error("expense failed");
    await createExpense(owner.userId, weddingId, {
      title: "Jauh di depan",
      categoryId: budgetCategory.id,
      vendorId: null,
      totalAmount: 5n * M,
      dueDate: addDaysIso(today, 10),
      notes: null,
    });

    await handleRemindersScan({}, now);
    // Ordered by the enum declaration: TASK_DUE, TASK_OVERDUE, PAYMENT_DUE.
    const created = await db.notification.findMany({ where: { userId: owner.userId }, orderBy: { type: "asc" } });
    expect(created.map((item) => [item.type, item.title])).toEqual([
      ["TASK_DUE", "2 tugas jatuh tempo besok"],
      ["TASK_OVERDUE", "Tugas terlambat"],
      ["PAYMENT_DUE", "Pembayaran jatuh tempo lusa"],
    ]);
    expect(created.find((item) => item.type === "TASK_DUE")?.body).toBe("Booking MUA dan Fitting baju");
    expect(created.find((item) => item.type === "PAYMENT_DUE")).toMatchObject({ link: `/budget/expenses/${due.expenseId}` });

    await handleRemindersScan({}, new Date(now.getTime() + 60 * 60 * 1000));
    expect(await db.notification.count({ where: { userId: owner.userId } })).toBe(created.length);
  });

  it("skips payment reminders for weddings without budget access", async () => {
    const { owner, weddingId } = await createOwnerWorkspace(userIds);
    const db = getDb();
    const now = new Date();
    const today = todayIsoInTimeZone(now, "Asia/Jakarta");
    await db.task.deleteMany({ where: { weddingId } });
    const category = await db.budgetCategory.findFirstOrThrow({ where: { weddingId }, select: { id: true } });
    await createExpense(owner.userId, weddingId, { title: "DP", categoryId: category.id, vendorId: null, totalAmount: M, dueDate: today, notes: null });
    await db.weddingEntitlement.updateMany({ where: { weddingId }, data: { revokedAt: now } });
    await handleRemindersScan({}, now);
    expect(await db.notification.count({ where: { userId: owner.userId } })).toBe(0);

    await adminGrantPlan(weddingId, "FULL_ACCESS", { note: "test" });
    await handleRemindersScan({}, new Date(now.getTime() + 1000));
    expect(await db.notification.count({ where: { userId: owner.userId, type: "PAYMENT_DUE" } })).toBe(1);
  });
});

describe("notification inbox", () => {
  it("lists, opens and marks only the owner's notifications", async () => {
    const reader = await createTestUser(userIds, "Pembaca");
    const stranger = await createTestUser(userIds, "Asing");
    const db = getDb();
    await deliverNotification(db, [reader.userId], {
      weddingId: null,
      type: "BUDGET_EXCEEDED",
      dedupeKey: "test:one",
      content: { title: "Satu", body: "Isi", link: "/budget" },
    });
    await deliverNotification(db, [reader.userId], {
      weddingId: null,
      type: "BUDGET_EXCEEDED",
      dedupeKey: "test:two",
      content: { title: "Dua", body: "Isi", link: "//evil.example/phish" },
    });
    expect(
      await deliverNotification(db, [reader.userId], { weddingId: null, type: "BUDGET_EXCEEDED", dedupeKey: "test:one", content: { title: "Satu", body: "Isi", link: null } }),
    ).toBe(0);

    const inbox = await listNotifications(reader.userId);
    expect(inbox).toMatchObject({ total: 2, unread: 2 });
    const unsafe = inbox.items.find((item) => item.title === "Dua")!;
    expect(unsafe.link).toBeNull();
    const safe = inbox.items.find((item) => item.title === "Satu")!;

    expect(await openNotification(stranger.userId, safe.id)).toBeNull();
    expect(await countUnreadNotifications(reader.userId)).toBe(2);
    expect(await openNotification(reader.userId, safe.id)).toEqual({ link: "/budget" });
    expect(await openNotification(reader.userId, "not-a-uuid")).toBeNull();
    expect(await countUnreadNotifications(reader.userId)).toBe(1);
    expect(await markAllNotificationsRead(stranger.userId)).toBe(0);
    expect(await markAllNotificationsRead(reader.userId)).toBe(1);
    expect(await countUnreadNotifications(reader.userId)).toBe(0);

    // The database refuses external links even if a caller skips the service.
    await expect(
      db.notification.create({ data: { userId: reader.userId, type: "BUDGET_EXCEEDED", title: "x", body: "x", link: "https://evil.example", dedupeKey: "raw" } }),
    ).rejects.toThrow();
  });
});

describe("cron endpoint", () => {
  it("requires the bearer secret and runs one worker cycle", async () => {
    const call = (authorization?: string) =>
      cronRoute(new Request("http://localhost/api/jobs/run", { method: "POST", headers: authorization ? { authorization } : {} }));
    expect((await call()).status).toBe(401);
    expect((await call("Bearer wrong-secret")).status).toBe(401);
    const ok = await call(`Bearer ${CRON_SECRET}`);
    expect(ok.status).toBe(200);
    expect(ok.headers.get("cache-control")).toBe("no-store");
    expect(await ok.json()).toMatchObject({ dead: 0 });
    expect(await getDb().backgroundJob.count({ where: { type: { in: ["reminders.scan", "maintenance.cleanup"] }, state: "DONE" } })).toBe(2);
  });
});
