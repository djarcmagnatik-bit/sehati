/**
 * Performance check against the PRD Phase 15 dataset (one wedding with 10,000 guests, 500 vendors,
 * 500 research entries, 2,000 tasks, 5,000 budget payments and 5,000 payment transactions).
 *
 *   pnpm test:perf
 *
 * Runs against DATABASE_URL_TEST. Every operation is measured warm (one warm-up, then RUNS timed
 * calls); the SQL statement count of one call is recorded to catch N+1 patterns.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

// Must be set before the first getDb() call.
process.env["PRISMA_QUERY_EVENTS"] = "1";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_EXPENSE_FILTERS } from "@/lib/budget-filters";
import { DEFAULT_CHECKLIST_FILTERS } from "@/lib/checklist-filters";
import { addDaysIso, isoToDbDate, todayIsoInTimeZone } from "@/lib/dates";
import { DEFAULT_GUEST_FILTERS } from "@/lib/guest-filters";
import { DEFAULT_RESEARCH_FILTERS, DEFAULT_VENDOR_FILTERS } from "@/lib/vendor-filters";
import { getRecentActivity, listActivity } from "@/server/activity/activity-service";
import { getAdminStats } from "@/server/admin/admin-stats-service";
import { listTransactions } from "@/server/admin/admin-billing-service";
import { listUsers, listWeddings } from "@/server/admin/admin-user-service";
import { createSession, validateSessionToken } from "@/server/auth/session-service";
import { getWeddingFeatures } from "@/server/billing/access";
import { getBillingOverview } from "@/server/billing/billing-service";
import { getBudgetOverview, getUpcomingPayments, listExpenses } from "@/server/budget/budget-service";
import { getChecklistSummary, getUpcomingTasks, listTasks } from "@/server/checklist/task-service";
import { getDb, onDbQuery } from "@/server/db";
import { getGuestSummary, listGuestGroupsWithCounts, listGuests } from "@/server/guests/guest-service";
import { ensureInvitation, getInvitationForUser, publishInvitation, updateSectionContent } from "@/server/invitation/invitation-service";
import { createWeddingEvent } from "@/server/invitation/event-service";
import { getPublishedInvitation } from "@/server/invitation/public-invitation-service";
import { handleRemindersScan } from "@/server/notifications/notification-jobs";
import { countUnreadNotifications } from "@/server/notifications/notification-service";
import { listCalendarEntries } from "@/server/planning/calendar-service";
import { getSavingsSummary } from "@/server/planning/savings-service";
import { getSeserahanSummary } from "@/server/planning/seserahan-service";
import { buildExport, toXlsxBuffer } from "@/server/reports/export-service";
import { getGuestReport, getTaskReport, getVendorReport } from "@/server/reports/report-service";
import { getRsvpGuestByToken, getRsvpOverview } from "@/server/rsvp/rsvp-service";
import { listPublicWishesBySlug } from "@/server/rsvp/wish-service";
import { getVendorSummary, listVendorResearch, listVendors } from "@/server/vendors/vendor-service";
import { getActiveWeddingForUser } from "@/server/wedding/wedding-service";
import { toCsv } from "@/lib/export/table";
import { deleteUsers } from "../support/integration-helpers";
import { createOwnerWorkspace } from "../support/workspace-helpers";

const RUNS = 5;
/** PRD §60: common operations < 500 ms under normal load. */
const COMMON_BUDGET_MS = 500;
/** Bulk work on the whole dataset (10,000-row exports and print lists, reminder scan). */
const BULK_BUDGET_MS = 3000;

const userIds: string[] = [];
const today = todayIsoInTimeZone(new Date());
const COUNTS = { guests: 10_000, vendors: 500, research: 500, tasks: 2_000, expenses: 1_000, payments: 5_000, transactions: 5_000, activity: 5_000 };

type Result = { name: string; kind: "common" | "bulk"; medianMs: number; maxMs: number; queries: number };
const results: Result[] = [];
/** Index names the planner chose, per query (written to the results file). */
const indexUse: Record<string, string[]> = {};

let ownerId = "";
let adminId = "";
let weddingId = "";
let slug = "";
let guestToken = "";
let sessionToken = "";
/** A small wedding (generated checklist, a few rows) to compare statement counts against. */
let small = { ownerId: "", weddingId: "", slug: "" };

async function inChunks<T>(rows: T[], size: number, insert: (chunk: T[]) => Promise<unknown>) {
  for (let index = 0; index < rows.length; index += size) await insert(rows.slice(index, index + size));
}

async function countQueries(operation: () => Promise<unknown>): Promise<number> {
  let queries = 0;
  const stop = onDbQuery(() => {
    queries += 1;
  });
  try {
    await operation();
  } finally {
    stop();
  }
  return queries;
}

async function measure(name: string, operation: () => Promise<unknown>, kind: Result["kind"] = "common") {
  await operation();
  let queries = 0;
  const stop = onDbQuery(() => {
    queries += 1;
  });
  const timings: number[] = [];
  for (let run = 0; run < RUNS; run += 1) {
    if (run === 1) stop();
    const started = performance.now();
    await operation();
    timings.push(performance.now() - started);
  }
  stop();
  timings.sort((a, b) => a - b);
  const result: Result = {
    name,
    kind,
    medianMs: Math.round(timings[Math.floor(timings.length / 2)]! * 10) / 10,
    maxMs: Math.round(timings[timings.length - 1]! * 10) / 10,
    queries,
  };
  results.push(result);
  return result;
}

beforeAll(async () => {
  const started = performance.now();
  const db = getDb();
  const workspace = await createOwnerWorkspace(userIds, { name: "Perf", weddingInDays: 180 });
  ownerId = workspace.owner.userId;
  weddingId = workspace.weddingId;
  const admin = await db.user.update({ where: { id: ownerId }, data: { role: "ADMIN" }, select: { id: true } });
  adminId = admin.id;

  // Guests in 12 groups.
  const groups = await Promise.all(
    Array.from({ length: 12 }, (_, index) => db.guestGroup.create({ data: { weddingId, name: `Grup perf ${index + 1}`, sortOrder: 100 + index }, select: { id: true } })),
  );
  const rsvp = ["PENDING", "ATTENDING", "DECLINED", "MAYBE"] as const;
  await inChunks(
    Array.from({ length: COUNTS.guests }, (_, index) => {
      const status = rsvp[index % 4]!;
      const seatCount = 1 + (index % 5);
      return {
        weddingId,
        groupId: groups[index % groups.length]!.id,
        guestName: `Tamu ${index}`,
        invitationName: `Keluarga Bapak ${index.toString().padStart(5, "0")}`,
        phone: `0812${(10_000_000 + index).toString()}`,
        phoneNormalized: `62812${(10_000_000 + index).toString()}`,
        seatCount,
        invitationStatus: index % 3 === 0 ? ("SENT" as const) : ("NOT_SENT" as const),
        rsvpStatus: status,
        attendingCount: status === "ATTENDING" ? Math.min(seatCount, 1 + (index % 3)) : 0,
        invitationToken: randomBytes(16).toString("hex"),
      };
    }),
    1000,
    (data) => db.guest.createMany({ data }),
  );
  guestToken = (await db.guest.findFirstOrThrow({ where: { weddingId }, select: { invitationToken: true } })).invitationToken;

  // Tasks: replace the generated checklist with 2,000 tasks spread over the year.
  await db.task.deleteMany({ where: { weddingId } });
  const taskCategories = await db.taskCategory.findMany({ select: { id: true } });
  const taskStatus = ["TODO", "IN_PROGRESS", "COMPLETED", "TODO"] as const;
  await inChunks(
    Array.from({ length: COUNTS.tasks }, (_, index) => ({
      weddingId,
      categoryId: taskCategories[index % taskCategories.length]!.id,
      title: `Tugas perf ${index}`,
      status: taskStatus[index % 4]!,
      source: "CUSTOM" as const,
      dueDate: isoToDbDate(addDaysIso(today, (index % 360) - 60)),
    })),
    1000,
    (data) => db.task.createMany({ data }),
  );

  // Vendors, research entries, expenses (half linked to vendors) and 5,000 payments.
  const vendorCategories = await db.vendorCategory.findMany({ select: { id: true } });
  const researchStatus = ["RESEARCHING", "CONTACTED", "MEETING", "SHORTLISTED", "REJECTED"] as const;
  await inChunks(
    Array.from({ length: COUNTS.research }, (_, index) => ({
      weddingId,
      categoryId: vendorCategories[index % vendorCategories.length]!.id,
      name: `Kandidat ${index}`,
      status: researchStatus[index % researchStatus.length]!,
    })),
    500,
    (data) => db.vendorResearch.createMany({ data }),
  );
  const vendorIds = Array.from({ length: COUNTS.vendors }, () => randomUUID());
  await inChunks(
    vendorIds.map((id, index) => ({ id, weddingId, categoryId: vendorCategories[index % vendorCategories.length]!.id, name: `Vendor ${index}` })),
    500,
    (data) => db.vendor.createMany({ data }),
  );
  const budgetCategories = await db.budgetCategory.findMany({ where: { weddingId }, select: { id: true } });
  const expenseIds = Array.from({ length: COUNTS.expenses }, () => randomUUID());
  await inChunks(
    expenseIds.map((id, index) => ({
      id,
      weddingId,
      categoryId: budgetCategories[index % budgetCategories.length]!.id,
      vendorId: index < COUNTS.vendors ? vendorIds[index]! : null,
      title: `Pengeluaran ${index}`,
      totalAmount: 10_000_000n,
      dueDate: isoToDbDate(addDaysIso(today, (index % 200) - 20)),
    })),
    500,
    (data) => db.expense.createMany({ data }),
  );
  await inChunks(
    Array.from({ length: COUNTS.payments }, (_, index) => ({
      weddingId,
      expenseId: expenseIds[index % expenseIds.length]!,
      amount: 100_000n,
      paymentDate: isoToDbDate(addDaysIso(today, -(index % 300))),
      method: "BANK_TRANSFER" as const,
    })),
    1000,
    (data) => db.payment.createMany({ data }),
  );

  // Billing history and activity log.
  const plan = await db.plan.findUniqueOrThrow({ where: { code: "FULL_ACCESS" }, select: { id: true } });
  const txStatus = ["EXPIRED", "FAILED", "PENDING", "PAID"] as const;
  await inChunks(
    Array.from({ length: COUNTS.transactions }, (_, index) => ({
      orderId: `SHT-20260918-${randomBytes(5).toString("hex").toUpperCase()}`,
      weddingId,
      userId: ownerId,
      kind: "PLAN" as const,
      planId: plan.id,
      itemName: "Akses Penuh",
      amount: 149_000n,
      status: txStatus[index % 4]!,
      paidAt: txStatus[index % 4] === "PAID" ? new Date(Date.now() - index * 60_000) : null,
      provider: "sandbox",
      expiresAt: new Date(Date.now() - index * 60_000),
      createdAt: new Date(Date.now() - index * 60_000),
    })),
    1000,
    (data) => db.paymentTransaction.createMany({ data }),
  );
  await inChunks(
    Array.from({ length: COUNTS.activity }, (_, index) => ({
      weddingId,
      userId: ownerId,
      actorName: "Perf",
      action: "task.created",
      entityType: "task",
      metadata: { title: `Tugas ${index}` },
      createdAt: new Date(Date.now() - index * 60_000),
    })),
    1000,
    (data) => db.activityLog.createMany({ data }),
  );

  // A published invitation.
  await ensureInvitation(ownerId, weddingId);
  await createWeddingEvent(ownerId, weddingId, {
    name: "Resepsi",
    eventDate: addDaysIso(today, 180),
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
  const invitation = await getInvitationForUser(ownerId, weddingId);
  const couple = invitation!.sections.find((section) => section.type === "COUPLE")!;
  await updateSectionContent(ownerId, couple.id, { brideFullName: "Putri", groomFullName: "Fajar" }, true);
  const published = await publishInvitation(ownerId, weddingId);
  if (!published.ok) throw new Error("publish failed");
  slug = published.slug;
  sessionToken = (await createSession(ownerId, { remember: false })).token;

  // The comparison wedding: same shape, a handful of rows.
  const tiny = await createOwnerWorkspace(userIds, { name: "Kecil", weddingInDays: 180 });
  small = { ownerId: tiny.owner.userId, weddingId: tiny.weddingId, slug: "" };
  const tinyGroup = await db.guestGroup.findFirstOrThrow({ where: { weddingId: tiny.weddingId }, select: { id: true } });
  await db.guest.createMany({
    data: [1, 2, 3].map((index) => ({
      weddingId: tiny.weddingId,
      groupId: tinyGroup.id,
      guestName: `Tamu ${index}`,
      invitationName: `Keluarga ${index}`,
      invitationToken: randomBytes(16).toString("hex"),
    })),
  });
  const tinyVendor = randomUUID();
  await db.vendor.create({ data: { id: tinyVendor, weddingId: tiny.weddingId, categoryId: vendorCategories[0]!.id, name: "Vendor kecil" } });
  const tinyExpense = await db.expense.create({
    data: { weddingId: tiny.weddingId, categoryId: (await db.budgetCategory.findFirstOrThrow({ where: { weddingId: tiny.weddingId } })).id, vendorId: tinyVendor, title: "DP", totalAmount: 1_000_000n },
    select: { id: true },
  });
  await db.payment.create({ data: { weddingId: tiny.weddingId, expenseId: tinyExpense.id, amount: 100_000n, paymentDate: isoToDbDate(today), method: "CASH" } });
  await ensureInvitation(tiny.owner.userId, tiny.weddingId);
  const tinyInvitation = await getInvitationForUser(tiny.owner.userId, tiny.weddingId);
  const tinyCouple = tinyInvitation!.sections.find((section) => section.type === "COUPLE")!;
  await updateSectionContent(tiny.owner.userId, tinyCouple.id, { brideFullName: "A", groomFullName: "B" }, true);
  await createWeddingEvent(tiny.owner.userId, tiny.weddingId, {
    name: "Akad",
    eventDate: addDaysIso(today, 180),
    startTime: "09:00",
    endTime: null,
    venueName: null,
    address: null,
    latitude: null,
    longitude: null,
    mapsUrl: null,
    dressCode: null,
    notes: null,
  });
  const tinyPublished = await publishInvitation(tiny.owner.userId, tiny.weddingId);
  if (!tinyPublished.ok) throw new Error("small publish failed");
  small.slug = tinyPublished.slug;

  await db.$executeRawUnsafe("ANALYZE");
  console.log(`[perf] dataset seeded in ${Math.round(performance.now() - started)} ms`);
}, 300_000);

afterAll(async () => {
  const table = results.map((row) => ({
    operation: row.name,
    median_ms: row.medianMs,
    max_ms: row.maxMs,
    sql: row.queries,
    budget_ms: row.kind === "common" ? COMMON_BUDGET_MS : BULK_BUDGET_MS,
  }));
  console.table(table);
  const out = path.resolve(import.meta.dirname, "../../test-results/perf");
  mkdirSync(out, { recursive: true });
  writeFileSync(path.join(out, "results.json"), JSON.stringify({ dataset: COUNTS, runs: RUNS, results: table, indexUse }, null, 2));
  await deleteUsers(userIds);
}, 120_000);

describe("performance with the PRD dataset", () => {
  it("serves every page's data within budget and without N+1 queries", async () => {
    const u = ownerId;
    const w = weddingId;

    // Work done on every signed-in request (layout + page guard).
    await measure("request: session + wedding + access + unread", async () => {
      const session = await validateSessionToken(sessionToken);
      const membership = await getActiveWeddingForUser(session!.user.id);
      await Promise.all([getWeddingFeatures(membership!.wedding.id, new Date()), countUnreadNotifications(session!.user.id)]);
    });

    // The dashboard loads these together.
    await measure("dashboard: all widgets", () =>
      Promise.all([
        getChecklistSummary(u, w, today),
        getUpcomingTasks(u, w, 5),
        getRecentActivity(u, w, 5),
        getBudgetOverview(u, w),
        getUpcomingPayments(u, w, 5),
        getVendorSummary(u, w),
        getGuestSummary(u, w),
        getSavingsSummary(u, w),
        getSeserahanSummary(u, w),
      ]),
    );

    await measure("guests: list page 1 (name)", () => listGuests(u, w, DEFAULT_GUEST_FILTERS));
    await measure("guests: list last page", () => listGuests(u, w, { ...DEFAULT_GUEST_FILTERS, page: 200 }));
    await measure("guests: search by name", () => listGuests(u, w, { ...DEFAULT_GUEST_FILTERS, q: "Bapak 0999" }));
    await measure("guests: search by phone digits", () => listGuests(u, w, { ...DEFAULT_GUEST_FILTERS, q: "10009" }));
    await measure("guests: filter RSVP + sort seats", () => listGuests(u, w, { ...DEFAULT_GUEST_FILTERS, rsvp: "ATTENDING", sort: "seats" }));
    await measure("guests: sort by group", () => listGuests(u, w, { ...DEFAULT_GUEST_FILTERS, sort: "group" }));
    await measure("guests: summary", () => getGuestSummary(u, w));
    await measure("guests: groups with counts", () => listGuestGroupsWithCounts(u, w));
    await measure("rsvp: overview", () => getRsvpOverview(u, w));

    await measure("checklist: open tasks", () => listTasks(u, w, DEFAULT_CHECKLIST_FILTERS, today));
    await measure("checklist: overdue tasks", () => listTasks(u, w, { ...DEFAULT_CHECKLIST_FILTERS, view: "overdue" }, today));
    await measure("checklist: search", () => listTasks(u, w, { ...DEFAULT_CHECKLIST_FILTERS, view: "all", q: "perf 19" }, today));

    await measure("vendors: list", () => listVendors(u, w, DEFAULT_VENDOR_FILTERS));
    await measure("vendors: research list", () => listVendorResearch(u, w, DEFAULT_RESEARCH_FILTERS));
    await measure("budget: expenses list", () => listExpenses(u, w, DEFAULT_EXPENSE_FILTERS));
    await measure("budget: expenses outstanding", () => listExpenses(u, w, { ...DEFAULT_EXPENSE_FILTERS, status: "outstanding" }));
    await measure("calendar: month", () => listCalendarEntries(u, w, addDaysIso(today, -3), addDaysIso(today, 35)));
    await measure("activity: page 1", () => listActivity(u, w, 1));
    await measure("activity: page 100", () => listActivity(u, w, 100));
    await measure("billing: overview", () => getBillingOverview(u, w));
    await measure("reports: tasks", () => getTaskReport(u, w, today));
    await measure("reports: vendors", () => getVendorReport(u, w));

    // Admin (the owner was made admin; the lists cover all accounts in the test database).
    await measure("admin: transactions page 1", () => listTransactions(adminId, { status: "all", q: "", page: 1 }));
    await measure("admin: transactions by email", () => listTransactions(adminId, { status: "all", q: "perf", page: 1 }));
    await measure("admin: users", () => listUsers(adminId, { q: "", role: "all", status: "all", page: 1 }));
    await measure("admin: weddings", () => listWeddings(adminId, { q: "", access: "all", page: 1 }));
    await measure("admin: dashboard stats (uncached)", () => getAdminStats(adminId, { fresh: true }));

    // Public invitation and personal link.
    await measure("public: invitation + wishes", () => Promise.all([getPublishedInvitation(slug), listPublicWishesBySlug(slug)]));
    await measure("public: personal RSVP link", () => getRsvpGuestByToken(guestToken));

    // Whole-dataset work.
    await measure("reports: guest list (10,000 rows)", () => getGuestReport(u, w), "bulk");
    await measure("export: guests CSV (10,000)", async () => toCsv(await buildExport(u, w, "guests", "csv")), "bulk");
    await measure("export: guests XLSX (10,000)", async () => toXlsxBuffer(await buildExport(u, w, "guests", "xlsx")), "bulk");
    await measure("export: payments XLSX (5,000)", async () => toXlsxBuffer(await buildExport(u, w, "payments", "xlsx")), "bulk");
    await measure("jobs: reminder scan", () => handleRemindersScan({}, new Date()), "bulk");

    const slow = results.filter((row) => row.medianMs > (row.kind === "common" ? COMMON_BUDGET_MS : BULK_BUDGET_MS));
    expect(slow.map((row) => `${row.name}: ${row.medianMs} ms`)).toEqual([]);
  }, 600_000);

  it("issues the same number of SQL statements for a small wedding and the PRD dataset (no N+1)", async () => {
    const operations: Record<string, (ownerId: string, weddingId: string, publicSlug: string) => Promise<unknown>> = {
      dashboard: (u, w) =>
        Promise.all([
          getChecklistSummary(u, w, today),
          getUpcomingTasks(u, w, 5),
          getRecentActivity(u, w, 5),
          getBudgetOverview(u, w),
          getUpcomingPayments(u, w, 5),
          getVendorSummary(u, w),
          getGuestSummary(u, w),
          getSavingsSummary(u, w),
          getSeserahanSummary(u, w),
        ]),
      guests: (u, w) => listGuests(u, w, DEFAULT_GUEST_FILTERS),
      guestGroups: (u, w) => listGuestGroupsWithCounts(u, w),
      tasks: (u, w) => listTasks(u, w, { ...DEFAULT_CHECKLIST_FILTERS, view: "all" }, today),
      vendors: (u, w) => listVendors(u, w, DEFAULT_VENDOR_FILTERS),
      research: (u, w) => listVendorResearch(u, w, { ...DEFAULT_RESEARCH_FILTERS, view: "all" }),
      expenses: (u, w) => listExpenses(u, w, DEFAULT_EXPENSE_FILTERS),
      calendar: (u, w) => listCalendarEntries(u, w, addDaysIso(today, -3), addDaysIso(today, 35)),
      vendorReport: (u, w) => getVendorReport(u, w),
      guestReport: (u, w) => getGuestReport(u, w),
      exportPayments: (u, w) => buildExport(u, w, "payments", "csv"),
      publicInvitation: (_u, _w, slugValue) => Promise.all([getPublishedInvitation(slugValue), listPublicWishesBySlug(slugValue)]),
    };
    const differences: string[] = [];
    for (const [name, operation] of Object.entries(operations)) {
      await operation(small.ownerId, small.weddingId, small.slug);
      const few = await countQueries(() => operation(small.ownerId, small.weddingId, small.slug));
      const many = await countQueries(() => operation(ownerId, weddingId, slug));
      if (few !== many) differences.push(`${name}: ${few} vs ${many}`);
    }
    expect(differences).toEqual([]);
  }, 120_000);

  it("uses indexes for admin lists and the cross-wedding reminder scan", async () => {
    const db = getDb();
    const plan = async (sql: string) => JSON.stringify(await db.$queryRawUnsafe(`EXPLAIN (FORMAT JSON) ${sql}`));
    const plans = {
      adminTransactions: await plan("SELECT id FROM payment_transactions ORDER BY created_at DESC LIMIT 25"),
      adminUsers: await plan("SELECT id FROM users ORDER BY created_at DESC LIMIT 25"),
      reminderTasks: await plan(
        "SELECT wedding_id FROM tasks WHERE status IN ('TODO', 'IN_PROGRESS') AND due_date BETWEEN CURRENT_DATE - 7 AND CURRENT_DATE + 2",
      ),
      reminderExpenses: await plan("SELECT id FROM expenses WHERE due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 2"),
      guestPage: await plan(`SELECT id FROM guests WHERE wedding_id = '${weddingId}' ORDER BY invitation_name LIMIT 50`),
    };
    for (const [name, json] of Object.entries(plans)) indexUse[name] = [...json.matchAll(/"Index Name":"([^"]+)"/g)].map((match) => match[1]!);
    expect(plans.adminTransactions).toContain("payment_transactions_created_at_idx");
    expect(plans.adminUsers).toContain("users_created_at_idx");
    expect(plans.reminderTasks).toContain("tasks_open_due_date_idx");
    expect(plans.reminderExpenses).toContain("expenses_due_date_idx");
    expect(plans.guestPage).toContain("guests_wedding_id_invitation_name_idx");
  });
});
