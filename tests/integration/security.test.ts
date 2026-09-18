import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as webhookRoute } from "@/app/api/payments/webhook/[provider]/route";
import { addDaysIso, todayIsoInTimeZone } from "@/lib/dates";
import { DEFAULT_GUEST_FILTERS } from "@/lib/guest-filters";
import { DEFAULT_VENDOR_FILTERS } from "@/lib/vendor-filters";
import { getRecentActivity } from "@/server/activity/activity-service";
import { listUsers } from "@/server/admin/admin-user-service";
import { WeddingAccessError } from "@/server/authz/wedding-access";
import { getBillingOverview, getTransactionForUser } from "@/server/billing/billing-service";
import { signSandboxPayload, SANDBOX_SIGNATURE_HEADER } from "@/server/billing/providers/sandbox";
import {
  createBudgetCategory,
  createExpense,
  getBudgetCategoryForUser,
  getBudgetCategoryOptions,
  getExpenseForUser,
  recordPayment,
  updateBudgetCategory,
} from "@/server/budget/budget-service";
import { createTask, getTaskForUser, getTaskFormOptions } from "@/server/checklist/task-service";
import { getDb } from "@/server/db";
import { readGuestFile } from "@/server/guests/guest-import-service";
import {
  createGuest,
  createGuestGroup,
  getGuestForUser,
  getGuestGroupOptions,
  listGuestGroupsWithCounts,
  listGuests,
  updateGuestGroup,
} from "@/server/guests/guest-service";
import {
  addGalleryImage,
  createGiftAccount,
  createLoveStoryEntry,
  deleteGiftAccount,
  deleteLoveStoryEntry,
  getGiftAccountForUser,
  getLoveStoryEntryForUser,
  listGalleryImages,
  listGiftAccounts,
  listLoveStoryEntries,
  moveGalleryImage,
  removeGalleryImage,
  updateGalleryCaption,
  updateGiftAccount,
  updateGiftAddress,
  updateLoveStoryEntry,
} from "@/server/invitation/content-service";
import { createWeddingEvent, getWeddingEventForUser, listWeddingEvents } from "@/server/invitation/event-service";
import {
  ensureInvitation,
  getInvitationForUser,
  moveSection,
  publishInvitation,
  reorderSections,
  setCoverImage,
  unpublishInvitation,
  updateInvitationTheme,
  updateSectionContent,
} from "@/server/invitation/invitation-service";
import { getPublishedInvitation } from "@/server/invitation/public-invitation-service";
import { getMediaStore } from "@/server/media/media-store";
import { listWeddingImages, uploadAudio, uploadImage } from "@/server/media/media-service";
import { createCalendarEvent, getCalendarEventForUser, updateCalendarEvent } from "@/server/planning/calendar-service";
import { createRundownItem, getRundownItemForUser, listRundown, moveRundownItem, updateRundownItem } from "@/server/planning/rundown-service";
import { createSavingsEntry, deleteSavingsEntry, getSavingsEntryForUser, listSavingsEntries, updateSavingsSettings } from "@/server/planning/savings-service";
import { createGiftItem, getGiftItemForUser, getSeserahanSummary, listGiftItems, updateGiftItem } from "@/server/planning/seserahan-service";
import { getRsvpGuestByToken, getRsvpOverview } from "@/server/rsvp/rsvp-service";
import { countWishes, listPublicWishesBySlug, submitWish } from "@/server/rsvp/wish-service";
import { createVendor, getVendorForUser, getVendorOptions, getVendorResearchForUser, listVendors, updateVendor } from "@/server/vendors/vendor-service";
import { countRecalculableTasks } from "@/server/wedding/wedding-service";
import { jpegWithExifFixture, pngFixture } from "../support/image-fixtures";
import { createTestUser, deleteUsers } from "../support/integration-helpers";
import { createOwnerWorkspace } from "../support/workspace-helpers";

const userIds: string[] = [];
const M = 1_000_000n;
const today = todayIsoInTimeZone(new Date());
const SECRET = process.env["PAYMENT_SANDBOX_SECRET"]!;

afterAll(async () => {
  await deleteUsers(userIds);
});

type Victim = Awaited<ReturnType<typeof buildVictim>>;

/** A wedding with one of (almost) everything, and private details that must never leak. */
async function buildVictim() {
  const workspace = await createOwnerWorkspace(userIds, { name: "Korban" });
  const { owner, weddingId } = workspace;
  const db = getDb();
  const ownerEmail = owner.email;

  const category = await db.budgetCategory.findFirstOrThrow({ where: { weddingId }, select: { id: true } });
  const newCategory = await createBudgetCategory(owner.userId, weddingId, { name: "Kategori rahasia", allocatedAmount: 7n * M });
  if (!newCategory.ok) throw new Error("category");
  const expense = await createExpense(owner.userId, weddingId, {
    title: "Pengeluaran-Rahasia-XYZ",
    categoryId: category.id,
    vendorId: null,
    totalAmount: 12_345_678n,
    dueDate: addDaysIso(today, 5),
    notes: "Catatan-Internal-Budget",
  });
  if (!expense.ok) throw new Error("expense");
  await recordPayment(owner.userId, expense.expenseId, { amount: M, paymentDate: today, method: "CASH", reference: null, notes: null });

  const taskCategory = await db.taskCategory.findFirstOrThrow({ select: { id: true } });
  const task = await createTask(owner.userId, weddingId, {
    title: "Tugas-Pribadi-XYZ",
    description: null,
    categoryId: taskCategory.id,
    dueDate: null,
    priority: "MEDIUM",
    assigneeMemberId: null,
  });
  if (!task.ok) throw new Error("task");

  const vendorCategory = await db.vendorCategory.findFirstOrThrow({ select: { id: true } });
  const vendor = await createVendor(owner.userId, weddingId, {
    name: "Vendor Rahasia",
    categoryId: vendorCategory.id,
    contactPerson: null,
    whatsapp: null,
    phone: "0811-9999-8888",
    instagram: null,
    website: null,
    packageName: null,
    bookingDate: null,
    eventLabel: null,
    notes: "Catatan-Vendor-Internal",
    contractValue: null,
    budgetCategoryId: null,
    paymentDueDate: null,
  });
  if (!vendor.ok) throw new Error("vendor");

  const group = await createGuestGroup(owner.userId, weddingId, { name: "Grup rahasia" });
  if (!group.ok) throw new Error("group");
  const guest = await createGuest(owner.userId, weddingId, {
    guestName: "Tamu Rahasia",
    invitationName: "Keluarga Rahasia",
    groupId: group.groupId,
    phone: "0812-7777-6666",
    email: "tamu-rahasia@example.test",
    address: "Jl. Rahasia 12",
    seatCount: 2,
    invitationStatus: "SENT",
    rsvpStatus: "PENDING",
    attendingCount: 0,
    notes: "Catatan-Tamu-Internal",
  });
  if (!guest.ok) throw new Error("guest");

  await ensureInvitation(owner.userId, weddingId);
  const event = await createWeddingEvent(owner.userId, weddingId, {
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
  await updateSectionContent(owner.userId, couple.id, { brideFullName: "Putri", groomFullName: "Fajar" }, true);
  const story = await createLoveStoryEntry(owner.userId, weddingId, { title: "Bertemu", timeLabel: null, story: "Di kampus" });
  const account = await createGiftAccount(owner.userId, weddingId, { type: "BANK", providerName: "BCA", accountNumber: "123", accountHolder: "Putri", notes: null });
  const upload = await uploadImage(owner.userId, weddingId, { name: "foto.png", type: "image/png", bytes: pngFixture() });
  if (!upload.ok) throw new Error("upload");
  const gallery = await addGalleryImage(owner.userId, weddingId, upload.assetId);
  if (!gallery.ok) throw new Error("gallery");
  const galleryImage = await db.galleryImage.findFirstOrThrow({ where: { weddingId }, select: { id: true } });
  const privateUpload = await uploadImage(owner.userId, weddingId, { name: "draf.png", type: "image/png", bytes: pngFixture(300, 300, [10, 20, 30]) });
  if (!privateUpload.ok) throw new Error("private upload");
  const published = await publishInvitation(owner.userId, weddingId);
  if (!published.ok) throw new Error("publish");

  const savings = await createSavingsEntry(owner.userId, weddingId, { contributor: "Fajar", amount: 3n * M, entryDate: today, account: null, notes: null });
  const giftItem = await createGiftItem(owner.userId, weddingId, {
    name: "Set mukena",
    categoryId: null,
    quantity: 1,
    estimatedPrice: null,
    actualPrice: null,
    responsible: null,
    status: "PLANNED",
    notes: null,
  });
  const rundown = await createRundownItem(owner.userId, weddingId, {
    title: "Akad",
    itemDate: null,
    startTime: "08:00",
    endTime: null,
    description: null,
    pic: null,
    location: null,
    category: null,
    notes: null,
  });
  await createRundownItem(owner.userId, weddingId, {
    title: "Resepsi",
    itemDate: null,
    startTime: "11:00",
    endTime: null,
    description: null,
    pic: null,
    location: null,
    category: null,
    notes: null,
  });
  const agenda = await createCalendarEvent(owner.userId, weddingId, { title: "Fitting", eventDate: addDaysIso(today, 3), startTime: null, endTime: null, location: null, notes: null });
  const research = await db.vendorResearch.create({
    data: { weddingId, categoryId: vendorCategory.id, name: "Kandidat", status: "SHORTLISTED" },
    select: { id: true },
  });
  // The wedding already has full access, so checkout would refuse; the order row is created directly.
  const plan = await db.plan.findUniqueOrThrow({ where: { code: "FULL_ACCESS" }, select: { id: true } });
  const order = await db.paymentTransaction.create({
    data: {
      orderId: `SHT-20260917-${randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase()}`,
      weddingId,
      userId: owner.userId,
      kind: "PLAN",
      planId: plan.id,
      itemName: "Akses Penuh",
      amount: 149_000n,
      provider: "sandbox",
      expiresAt: new Date(Date.now() + 3_600_000),
    },
    select: { orderId: true },
  });
  const guestToken = (await db.guest.findUniqueOrThrow({ where: { id: guest.guestId }, select: { invitationToken: true } })).invitationToken;

  return {
    ...workspace,
    ownerEmail,
    slug: published.slug,
    ids: {
      budgetCategory: newCategory.categoryId,
      expense: expense.expenseId,
      task: task.taskId,
      vendor: vendor.vendorId,
      research: research.id,
      group: group.groupId,
      guest: guest.guestId,
      event: event,
      section: couple.id,
      story,
      account,
      asset: upload.assetId,
      privateAsset: privateUpload.assetId,
      galleryImage: galleryImage.id,
      savings,
      giftItem: giftItem.ok ? giftItem.itemId : "",
      rundown,
      agenda,
      orderId: order.orderId,
    },
    guestToken,
  };
}

const bigintSafe = (_key: string, value: unknown) => (typeof value === "bigint" ? value.toString() : value);

/** Every private row of the wedding, so any successful write by an outsider shows up as a diff. */
async function snapshot(weddingId: string): Promise<string> {
  const db = getDb();
  const where = { weddingId };
  const rows = await Promise.all([
    db.wedding.findUnique({ where: { id: weddingId } }),
    db.task.findMany({ where, orderBy: { id: "asc" } }),
    db.budgetCategory.findMany({ where, orderBy: { id: "asc" } }),
    db.expense.findMany({ where, orderBy: { id: "asc" } }),
    db.payment.findMany({ where, orderBy: { id: "asc" } }),
    db.vendor.findMany({ where, orderBy: { id: "asc" } }),
    db.vendorResearch.findMany({ where, orderBy: { id: "asc" } }),
    db.guestGroup.findMany({ where, orderBy: { id: "asc" } }),
    db.guest.findMany({ where, orderBy: { id: "asc" } }),
    db.invitation.findMany({ where }),
    db.invitationSection.findMany({ where, orderBy: { id: "asc" } }),
    db.weddingEvent.findMany({ where, orderBy: { id: "asc" } }),
    db.loveStoryEntry.findMany({ where, orderBy: { id: "asc" } }),
    db.galleryImage.findMany({ where, orderBy: { id: "asc" } }),
    db.giftAccount.findMany({ where, orderBy: { id: "asc" } }),
    db.mediaAsset.findMany({ where, orderBy: { id: "asc" } }),
    db.savingsEntry.findMany({ where, orderBy: { id: "asc" } }),
    db.giftItem.findMany({ where, orderBy: { id: "asc" } }),
    db.rundownItem.findMany({ where, orderBy: { id: "asc" } }),
    db.calendarEvent.findMany({ where, orderBy: { id: "asc" } }),
    db.wish.findMany({ where, orderBy: { id: "asc" } }),
  ]);
  return JSON.stringify(rows, bigintSafe);
}

type Outcome = "denied" | string;

/** Denied means: the service threw the membership error, or answered "nothing here". */
async function attempt(call: () => Promise<unknown>): Promise<Outcome> {
  try {
    const result = await call();
    if (result === null || result === false || result === undefined) return "denied";
    if (typeof result === "object" && result !== null && "ok" in result && (result as { ok: unknown }).ok === false) return "denied";
    return `returned ${JSON.stringify(result, bigintSafe).slice(0, 120)}`;
  } catch (error) {
    return error instanceof WeddingAccessError ? "denied" : `threw ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`;
  }
}

describe("IDOR: a member of another wedding", () => {
  let victim: Victim;
  let attacker: { userId: string; weddingId: string };

  beforeAll(async () => {
    victim = await buildVictim();
    const other = await createOwnerWorkspace(userIds, { name: "Penyerang" });
    attacker = { userId: other.owner.userId, weddingId: other.weddingId };
  }, 60_000);

  it("can neither read nor change anything by guessing ids", async () => {
    const before = await snapshot(victim.weddingId);
    const a = attacker.userId;
    const w = victim.weddingId;
    const id = victim.ids;
    const png = { name: "x.png", type: "image/png", bytes: pngFixture() };

    const calls: Record<string, () => Promise<unknown>> = {
      // Reads by id
      getBudgetCategoryForUser: () => getBudgetCategoryForUser(a, id.budgetCategory),
      getExpenseForUser: () => getExpenseForUser(a, id.expense),
      getTaskForUser: () => getTaskForUser(a, id.task),
      getVendorForUser: () => getVendorForUser(a, id.vendor),
      getVendorResearchForUser: () => getVendorResearchForUser(a, id.research),
      getGuestForUser: () => getGuestForUser(a, id.guest),
      getWeddingEventForUser: () => getWeddingEventForUser(a, id.event),
      getLoveStoryEntryForUser: () => getLoveStoryEntryForUser(a, id.story),
      getGiftAccountForUser: () => getGiftAccountForUser(a, id.account),
      getSavingsEntryForUser: () => getSavingsEntryForUser(a, id.savings),
      getGiftItemForUser: () => getGiftItemForUser(a, id.giftItem),
      getRundownItemForUser: () => getRundownItemForUser(a, id.rundown),
      getCalendarEventForUser: () => getCalendarEventForUser(a, id.agenda),
      getTransactionForUser: () => getTransactionForUser(a, id.orderId),
      // Reads by wedding
      getBillingOverview: () => getBillingOverview(a, w),
      getBudgetCategoryOptions: () => getBudgetCategoryOptions(a, w),
      getGuestGroupOptions: () => getGuestGroupOptions(a, w),
      listGuestGroupsWithCounts: () => listGuestGroupsWithCounts(a, w),
      getRecentActivity: () => getRecentActivity(a, w, 5),
      getRsvpOverview: () => getRsvpOverview(a, w),
      getSeserahanSummary: () => getSeserahanSummary(a, w),
      getTaskFormOptions: () => getTaskFormOptions(a, w),
      getVendorOptions: () => getVendorOptions(a, w),
      listGalleryImages: () => listGalleryImages(a, w),
      listGiftAccounts: () => listGiftAccounts(a, w),
      listGiftItems: () => listGiftItems(a, w),
      listLoveStoryEntries: () => listLoveStoryEntries(a, w),
      listRundown: () => listRundown(a, w),
      listSavingsEntries: () => listSavingsEntries(a, w),
      listWeddingEvents: () => listWeddingEvents(a, w),
      listWeddingImages: () => listWeddingImages(a, w),
      countWishes: () => countWishes(a, w),
      countRecalculableTasks: () => countRecalculableTasks(a, w),
      // Writes by wedding
      ensureInvitation: () => ensureInvitation(a, w),
      unpublishInvitation: () => unpublishInvitation(a, w),
      reorderSections: () => reorderSections(a, w, [id.section]),
      updateInvitationTheme: () => updateInvitationTheme(a, w, { themeCode: "minimal", coverLayout: "center" }),
      updateGiftAddress: () => updateGiftAddress(a, w, { giftAddress: "Alamat penyerang" }),
      updateSavingsSettings: () => updateSavingsSettings(a, w, { savingsTarget: 1n, savingsMonthlyTarget: null }),
      createBudgetCategory: () => createBudgetCategory(a, w, { name: "Disusupkan", allocatedAmount: 0n }),
      createGuestGroup: () => createGuestGroup(a, w, { name: "Disusupkan" }),
      createLoveStoryEntry: () => createLoveStoryEntry(a, w, { title: "x", timeLabel: null, story: "x" }),
      createGiftAccount: () => createGiftAccount(a, w, { type: "BANK", providerName: "X", accountNumber: "9", accountHolder: "X", notes: null }),
      createSavingsEntry: () => createSavingsEntry(a, w, { contributor: "x", amount: 1n, entryDate: today, account: null, notes: null }),
      createCalendarEvent: () => createCalendarEvent(a, w, { title: "x", eventDate: today, startTime: null, endTime: null, location: null, notes: null }),
      uploadImage: () => uploadImage(a, w, png),
      uploadAudio: () => uploadAudio(a, w, { name: "a.mp3", type: "audio/mpeg", bytes: Buffer.from("ID3\x03\0\0\0\0\0\0\0\0", "binary") }),
      addGalleryImage: () => addGalleryImage(a, w, id.privateAsset),
      setCoverImage: () => setCoverImage(a, w, id.privateAsset),
      // Writes by id
      updateBudgetCategory: () => updateBudgetCategory(a, id.budgetCategory, { name: "Diubah", allocatedAmount: 1n }),
      updateVendor: () =>
        updateVendor(a, id.vendor, {
          name: "Diubah",
          categoryId: randomUUID(),
          contactPerson: null,
          whatsapp: null,
          phone: null,
          instagram: null,
          website: null,
          packageName: null,
          bookingDate: null,
          eventLabel: null,
          notes: null,
        }),
      updateGuestGroup: () => updateGuestGroup(a, id.group, { name: "Diubah" }),
      moveSection: () => moveSection(a, id.section, "down"),
      updateLoveStoryEntry: () => updateLoveStoryEntry(a, id.story, { title: "Diubah", timeLabel: null, story: "x" }),
      deleteLoveStoryEntry: () => deleteLoveStoryEntry(a, id.story),
      updateGiftAccount: () => updateGiftAccount(a, id.account, { type: "BANK", providerName: "X", accountNumber: "9", accountHolder: "X", notes: null }),
      deleteGiftAccount: () => deleteGiftAccount(a, id.account),
      updateGalleryCaption: () => updateGalleryCaption(a, id.galleryImage, { caption: "Diubah" }),
      moveGalleryImage: () => moveGalleryImage(a, id.galleryImage, "down"),
      removeGalleryImage: () => removeGalleryImage(a, id.galleryImage),
      deleteSavingsEntry: () => deleteSavingsEntry(a, id.savings),
      updateGiftItem: () =>
        updateGiftItem(a, id.giftItem, { name: "Diubah", categoryId: null, quantity: 1, estimatedPrice: null, actualPrice: null, responsible: null, status: "PURCHASED", notes: null }),
      updateRundownItem: () =>
        updateRundownItem(a, id.rundown, { title: "Diubah", itemDate: null, startTime: "01:00", endTime: null, description: null, pic: null, location: null, category: null, notes: null }),
      moveRundownItem: () => moveRundownItem(a, id.rundown, "down"),
      updateCalendarEvent: () => updateCalendarEvent(a, id.agenda, { title: "Diubah", eventDate: today, startTime: null, endTime: null, location: null, notes: null }),
    };

    // Control: the same reads succeed for the owner, so "denied" below really comes from the access check.
    const v = victim.owner.userId;
    for (const control of [
      () => getGuestForUser(v, id.guest),
      () => getExpenseForUser(v, id.expense),
      () => getVendorForUser(v, id.vendor),
      () => listRundown(v, w),
      () => getTransactionForUser(v, id.orderId),
    ]) {
      expect(await attempt(control)).not.toBe("denied");
    }

    const outcomes: Record<string, Outcome> = {};
    for (const [name, call] of Object.entries(calls)) outcomes[name] = await attempt(call);
    const allowed = Object.entries(outcomes).filter(([, outcome]) => outcome !== "denied");
    expect(allowed).toEqual([]);
    expect(Object.keys(outcomes).length).toBeGreaterThanOrEqual(60);
    expect(await snapshot(victim.weddingId)).toBe(before);
  });

  it("cannot pull another wedding's records into its own wedding by id", async () => {
    const before = await snapshot(victim.weddingId);
    const a = attacker.userId;
    const own = attacker.weddingId;
    const id = victim.ids;
    await ensureInvitation(a, own);

    const outcomes: Record<string, Outcome> = {
      expenseInForeignCategory: await attempt(() =>
        createExpense(a, own, { title: "x", categoryId: id.budgetCategory, vendorId: null, totalAmount: 1n, dueDate: null, notes: null }),
      ),
      expenseForForeignVendor: await attempt(async () => {
        const mine = await getDb().budgetCategory.findFirstOrThrow({ where: { weddingId: own }, select: { id: true } });
        return createExpense(a, own, { title: "x", categoryId: mine.id, vendorId: id.vendor, totalAmount: 1n, dueDate: null, notes: null });
      }),
      guestInForeignGroup: await attempt(() =>
        createGuest(a, own, {
          guestName: "x",
          invitationName: "x",
          groupId: id.group,
          phone: null,
          email: null,
          address: null,
          seatCount: 1,
          invitationStatus: "NOT_SENT",
          rsvpStatus: "PENDING",
          attendingCount: 0,
          notes: null,
        }),
      ),
      foreignImageInOwnGallery: await attempt(() => addGalleryImage(a, own, id.privateAsset)),
      foreignImageAsOwnCover: await attempt(() => setCoverImage(a, own, id.privateAsset)),
      paymentOnForeignExpense: await attempt(() => recordPayment(a, id.expense, { amount: 1n, paymentDate: today, method: "CASH", reference: null, notes: null })),
    };
    expect(Object.entries(outcomes).filter(([, outcome]) => outcome !== "denied")).toEqual([]);
    expect(await snapshot(victim.weddingId)).toBe(before);
  });

  it("finds nothing of the other wedding through search filters, including SQL-looking input", async () => {
    const a = attacker.userId;
    const own = attacker.weddingId;
    for (const q of ["Rahasia", "' OR '1'='1", "%", "_", "\\", "'; DROP TABLE guests; --", "Keluarga Rahasia"]) {
      const guests = await listGuests(a, own, { ...DEFAULT_GUEST_FILTERS, q });
      expect(guests.items.map((guest) => guest.invitationName)).not.toContain("Keluarga Rahasia");
      const vendors = await listVendors(a, own, { ...DEFAULT_VENDOR_FILTERS, q });
      expect(vendors.items.map((vendor) => vendor.name)).not.toContain("Vendor Rahasia");
    }
    // The tables are still there and the victim still sees their own data.
    const victimGuests = await listGuests(victim.owner.userId, victim.weddingId, { ...DEFAULT_GUEST_FILTERS, q: "' OR '1'='1" });
    expect(victimGuests.total).toBe(0);
    expect((await listGuests(victim.owner.userId, victim.weddingId, DEFAULT_GUEST_FILTERS)).total).toBe(1);
  });

  it("is refused by admin services", async () => {
    await expect(listUsers(attacker.userId, { q: "' OR 1=1 --", role: "all", status: "all", page: 1 })).rejects.toThrow("admin_access_denied");
  });
});

describe("public and private data separation", () => {
  let victim: Victim;
  beforeAll(async () => {
    victim = await buildVictim();
  }, 60_000);

  const PRIVATE_MARKERS = (v: Victim) => [
    v.ownerEmail,
    v.weddingId,
    v.owner.userId,
    "Pengeluaran-Rahasia-XYZ",
    "Catatan-Internal-Budget",
    "12345678",
    "Tugas-Pribadi-XYZ",
    "Vendor Rahasia",
    "Catatan-Vendor-Internal",
    "0811-9999-8888",
    "0812-7777-6666",
    "tamu-rahasia@example.test",
    "Jl. Rahasia 12",
    "Catatan-Tamu-Internal",
    v.guestToken,
    v.ids.privateAsset,
    "100000000",
  ];

  it("exposes only public fields on the published invitation", async () => {
    const invitation = await getPublishedInvitation(victim.slug);
    expect(invitation).not.toBeNull();
    const json = JSON.stringify(invitation, bigintSafe);
    for (const marker of PRIVATE_MARKERS(victim)) expect(json, marker).not.toContain(marker);
    expect(Object.keys(invitation!).sort()).toEqual(
      [
        "brideName",
        "coupleName",
        "coverImageId",
        "coverImageWidths",
        "coverLayout",
        "defaultGuestLabel",
        "events",
        "gallery",
        "giftAccounts",
        "giftAddress",
        "groomName",
        "loveStory",
        "music",
        "sections",
        "slug",
        "themeCode",
        "timeZone",
        "weddingDateIso",
      ].sort(),
    );
  });

  it("exposes only the guest's own greeting data on a personal link, and only names and messages on the wish wall", async () => {
    const guest = await getRsvpGuestByToken(victim.guestToken);
    const guestJson = JSON.stringify(guest, bigintSafe);
    for (const marker of ["0812-7777-6666", "tamu-rahasia@example.test", "Jl. Rahasia 12", "Catatan-Tamu-Internal", victim.ownerEmail]) {
      expect(guestJson, marker).not.toContain(marker);
    }

    const wish = await submitWish({ slug: victim.slug }, { name: "Sahabat", message: "Selamat!" }, { ipAddress: "203.0.113.5" });
    expect(wish.ok).toBe(true);
    const wishes = await listPublicWishesBySlug(victim.slug);
    expect(wishes.length).toBeGreaterThan(0);
    for (const item of wishes) expect(Object.keys(item).sort()).toEqual(["createdAt", "id", "message", "name"]);
    expect(JSON.stringify(wishes)).not.toContain("203.0.113.5");
  });
});

describe("upload validation", () => {
  it("stores images without EXIF/GPS and refuses mismatching names", async () => {
    const { owner, weddingId } = await createOwnerWorkspace(userIds);
    const photo = jpegWithExifFixture(6);
    expect(photo.includes(Buffer.from("GPS-6.914744"))).toBe(true);

    const upload = await uploadImage(owner.userId, weddingId, { name: "IMG_2041.jpg", type: "image/jpeg", bytes: photo });
    expect(upload.ok).toBe(true);
    const asset = await getDb().mediaAsset.findUniqueOrThrow({ where: { id: upload.ok ? upload.assetId : "" } });
    const stored = await getMediaStore().get(asset.storageKey);
    expect(stored).not.toBeNull();
    expect(stored!.includes(Buffer.from("GPS-"))).toBe(false);
    expect(stored!.includes(Buffer.from("Rahasia"))).toBe(false);
    expect(asset.byteSize).toBe(stored!.byteLength);
    expect(asset.storageKey).toMatch(new RegExp(`^${weddingId}/[0-9a-f-]{36}\\.jpg$`));

    expect(await uploadImage(owner.userId, weddingId, { name: "shell.php", type: "image/jpeg", bytes: photo })).toEqual({ ok: false, reason: "unsupported_type" });
    expect(await uploadImage(owner.userId, weddingId, { name: "a.svg", type: "image/svg+xml", bytes: Buffer.from("<svg onload=alert(1)>") })).toEqual({
      ok: false,
      reason: "unsupported_type",
    });
    expect(await uploadImage(owner.userId, weddingId, { name: "foto.png", type: "image/png", bytes: Buffer.from("<?php system($_GET['c']); ?>") })).toEqual({
      ok: false,
      reason: "unsupported_type",
    });
    expect(
      await uploadAudio(owner.userId, weddingId, { name: "lagu.exe", type: "audio/mpeg", bytes: Buffer.from("ID3\x03\0\0\0\0\0\0\0\0", "binary") }),
    ).toEqual({ ok: false, reason: "unsupported_type" });
  });

  it("refuses a spreadsheet that would inflate to an unreasonable size", async () => {
    const entry = Buffer.alloc(46 + 5);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt32LE(2_000_000_000, 24);
    entry.writeUInt16LE(5, 28);
    entry.write("a.xml", 46, "ascii");
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(1, 8);
    end.writeUInt16LE(1, 10);
    end.writeUInt32LE(entry.length, 12);
    end.writeUInt32LE(4, 16);
    const bomb = Buffer.concat([Buffer.from("PK\x03\x04", "binary"), entry, end]);
    expect(await readGuestFile({ name: "tamu.xlsx", type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", bytes: bomb })).toEqual({
      ok: false,
      reason: "too_large",
    });
  });
});

describe("payment webhook hardening", () => {
  const post = (body: string, headers: Record<string, string>) =>
    webhookRoute(new Request("http://localhost/api/payments/webhook/sandbox", { method: "POST", headers, body }) as never, {
      params: Promise.resolve({ provider: "sandbox" }),
    });

  it("refuses a body that differs from what was signed, and oversized calls before reading them", async () => {
    const signed = JSON.stringify({ order_id: "SHT-20260917-ABCDEFGHIJ", status: "PAID", gross_amount: "1000", event_id: randomUUID() });
    const tampered = signed.replace('"1000"', '"1"');
    expect((await post(tampered, { [SANDBOX_SIGNATURE_HEADER]: signSandboxPayload(SECRET, signed) })).status).toBe(401);
    expect((await post("{}", { "content-length": String(10 * 1024 * 1024), [SANDBOX_SIGNATURE_HEADER]: "x" })).status).toBe(413);
    const huge = JSON.stringify({ padding: "x".repeat(70 * 1024) });
    expect((await post(huge, { [SANDBOX_SIGNATURE_HEADER]: signSandboxPayload(SECRET, huge) })).status).toBe(413);
  });
});

describe("account boundaries", () => {
  it("does not let one account read another account's data through its own session id", async () => {
    const a = await createTestUser(userIds, "Satu");
    const b = await createOwnerWorkspace(userIds, { name: "Dua" });
    await expect(getRecentActivity(a.userId, b.weddingId, 5)).rejects.toBeInstanceOf(WeddingAccessError);
    expect(await getTransactionForUser(a.userId, "SHT-20260917-ABCDEFGHIJ")).toBeNull();
  });
});
