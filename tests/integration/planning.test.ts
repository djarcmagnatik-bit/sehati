import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { addDaysIso, todayIsoInTimeZone } from "@/lib/dates";
import { monthsUntil } from "@/lib/planning";
import type {
  CalendarEventInput,
  GiftItemInput,
  RundownItemInput,
  SavingsEntryInput,
} from "@/lib/validation/planning";
import type { VendorResearchInput } from "@/lib/validation/vendor";
import { getRecentActivity } from "@/server/activity/activity-service";
import { WeddingAccessError } from "@/server/authz/wedding-access";
import { createExpense, recordPayment } from "@/server/budget/budget-service";
import { getDb } from "@/server/db";
import { createWeddingEvent } from "@/server/invitation/event-service";
import {
  ensureInvitation,
  getInvitationForUser,
  publishInvitation,
  setInvitationMusic,
  updateInvitationMusic,
  updateSectionContent,
} from "@/server/invitation/invitation-service";
import { getPublishedInvitation } from "@/server/invitation/public-invitation-service";
import { deleteAssetIfUnused, getAssetForDelivery, uploadAudio, uploadImage } from "@/server/media/media-service";
import {
  createCalendarEvent,
  deleteCalendarEvent,
  listCalendarEntries,
  updateCalendarEvent,
} from "@/server/planning/calendar-service";
import { createRundownItem, deleteRundownItem, listRundown, moveRundownItem, updateRundownItem } from "@/server/planning/rundown-service";
import {
  createSavingsEntry,
  deleteSavingsEntry,
  getSavingsSummary,
  listSavingsEntries,
  updateSavingsEntry,
  updateSavingsSettings,
} from "@/server/planning/savings-service";
import {
  createGiftItem,
  deleteGiftItem,
  getGiftCategoryOptions,
  getSeserahanSummary,
  listGiftItems,
  setGiftItemPhoto,
  setGiftItemStatus,
  updateGiftItem,
} from "@/server/planning/seserahan-service";
import { createVendorResearch } from "@/server/vendors/vendor-service";
import { pngFixture } from "../support/image-fixtures";
import { createTestUser, deleteUsers } from "../support/integration-helpers";
import { createOwnerWorkspace } from "../support/workspace-helpers";

const userIds: string[] = [];
const M = 1_000_000n;
const today = todayIsoInTimeZone(new Date());
const MP3 = Buffer.concat([Buffer.from("ID3"), Buffer.from([4, 0, 0, 0, 0, 0, 0]), Buffer.alloc(2048, 0x55)]);

afterAll(async () => {
  await deleteUsers(userIds);
});

function savingsInput(overrides: Partial<SavingsEntryInput> = {}): SavingsEntryInput {
  return { contributor: "Fajar", amount: 5n * M, entryDate: today, account: "BCA", notes: null, ...overrides };
}

function giftInput(overrides: Partial<GiftItemInput> = {}): GiftItemInput {
  return {
    name: "Set mukena",
    categoryId: null,
    quantity: 1,
    estimatedPrice: 750_000n,
    actualPrice: null,
    responsible: "Ibu Putri",
    status: "PLANNED",
    notes: null,
    ...overrides,
  };
}

function rundownInput(overrides: Partial<RundownItemInput> = {}): RundownItemInput {
  return {
    title: "Makeup pengantin",
    itemDate: null,
    startTime: "05:00",
    endTime: "07:00",
    description: null,
    pic: "MUA",
    location: "Rumah",
    category: "Persiapan",
    notes: null,
    ...overrides,
  };
}

function agendaInput(overrides: Partial<CalendarEventInput> = {}): CalendarEventInput {
  return { title: "Fitting baju", eventDate: addDaysIso(today, 10), startTime: "10:00", endTime: "11:00", location: "Butik", notes: null, ...overrides };
}

describe("savings", () => {
  it("records deposits and summarizes them against the target", async () => {
    const { owner, weddingId } = await createOwnerWorkspace(userIds, { weddingInDays: 200 });
    await createSavingsEntry(owner.userId, weddingId, savingsInput({ amount: 20n * M }));
    await createSavingsEntry(owner.userId, weddingId, savingsInput({ contributor: "Orang tua", amount: 10n * M }));

    // No savings target yet: the Rp100.000.000 budget target is used.
    const summary = await getSavingsSummary(owner.userId, weddingId);
    expect(summary).toMatchObject({ target: 100n * M, saved: 30n * M, remaining: 70n * M, percent: 30, contributors: 2 });
    const months = BigInt(monthsUntil(today, addDaysIso(today, 200)));
    expect(summary.requiredMonthly! * months).toBeGreaterThanOrEqual(70n * M);
    expect((summary.requiredMonthly! - 1n) * months).toBeLessThan(70n * M);

    await updateSavingsSettings(owner.userId, weddingId, { savingsTarget: 60n * M, savingsMonthlyTarget: 5n * M });
    expect(await getSavingsSummary(owner.userId, weddingId)).toMatchObject({
      target: 60n * M,
      remaining: 30n * M,
      percent: 50,
      monthlyTarget: 5n * M,
    });
  });

  it("updates and deletes a deposit, newest first in the list", async () => {
    const { owner, weddingId } = await createOwnerWorkspace(userIds);
    const older = await createSavingsEntry(owner.userId, weddingId, savingsInput({ entryDate: addDaysIso(today, -30) }));
    const newer = await createSavingsEntry(owner.userId, weddingId, savingsInput({ contributor: "Putri", entryDate: today }));
    expect((await listSavingsEntries(owner.userId, weddingId)).map((entry) => entry.id)).toEqual([newer, older]);

    await updateSavingsEntry(owner.userId, older, savingsInput({ amount: 7n * M }));
    await deleteSavingsEntry(owner.userId, newer);
    expect(await getSavingsSummary(owner.userId, weddingId)).toMatchObject({ saved: 7n * M });

    const activity = await getRecentActivity(owner.userId, weddingId, 3);
    expect(activity[0]).toMatchObject({ action: "savings.deleted" });
  });

  it("refuses a non-positive amount at the database level", async () => {
    const { owner, weddingId } = await createOwnerWorkspace(userIds);
    const id = await createSavingsEntry(owner.userId, weddingId, savingsInput());
    await expect(getDb().$executeRaw`UPDATE savings_entries SET amount = 0 WHERE id = ${id}::uuid`).rejects.toThrow(
      /savings_entries_amount_positive/,
    );
  });
});

describe("seserahan", () => {
  it("tracks items from planned to ready with money totals", async () => {
    const { owner, weddingId } = await createOwnerWorkspace(userIds);
    const categories = await getGiftCategoryOptions();
    const worship = categories.find((category) => category.name === "Perlengkapan ibadah")!;

    const mukena = await createGiftItem(owner.userId, weddingId, giftInput({ categoryId: worship.id, estimatedPrice: 750_000n }));
    const shoes = await createGiftItem(owner.userId, weddingId, giftInput({ name: "Sepatu", quantity: 2, estimatedPrice: 1_200_000n }));
    if (!mukena.ok || !shoes.ok) throw new Error("gift item creation failed");

    await updateGiftItem(owner.userId, mukena.itemId, giftInput({ categoryId: worship.id, actualPrice: 700_000n, status: "PURCHASED" }));
    await setGiftItemStatus(owner.userId, mukena.itemId, "READY");

    expect(await getSeserahanSummary(owner.userId, weddingId)).toEqual({
      items: 2,
      pieces: 3,
      estimated: 1_950_000n,
      actual: 700_000n,
      done: 1,
      byStatus: { PLANNED: 1, PURCHASED: 0, PACKED: 0, READY: 1 },
    });
    expect((await listGiftItems(owner.userId, weddingId, "READY")).map((item) => item.name)).toEqual(["Set mukena"]);

    await deleteGiftItem(owner.userId, shoes.itemId);
    expect(await getSeserahanSummary(owner.userId, weddingId)).toMatchObject({ items: 1, done: 1 });
  });

  it("rejects an unknown category and out-of-range quantities", async () => {
    const { owner, weddingId } = await createOwnerWorkspace(userIds);
    expect(await createGiftItem(owner.userId, weddingId, giftInput({ categoryId: randomUUID() }))).toEqual({
      ok: false,
      reason: "invalid_category",
    });
    const item = await createGiftItem(owner.userId, weddingId, giftInput());
    if (!item.ok) throw new Error("gift item creation failed");
    await expect(getDb().$executeRaw`UPDATE gift_items SET quantity = 0 WHERE id = ${item.itemId}::uuid`).rejects.toThrow(
      /gift_items_quantity_range/,
    );
  });

  it("keeps item photos private to the wedding", async () => {
    const mine = await createOwnerWorkspace(userIds);
    const theirs = await createOwnerWorkspace(userIds, { name: "Rina" });
    const item = await createGiftItem(mine.owner.userId, mine.weddingId, giftInput());
    if (!item.ok) throw new Error("gift item creation failed");

    const photo = await uploadImage(mine.owner.userId, mine.weddingId, { name: "mukena.png", type: "image/png", bytes: pngFixture(300, 300) });
    const foreign = await uploadImage(theirs.owner.userId, theirs.weddingId, { name: "x.png", type: "image/png", bytes: pngFixture(301, 301) });
    if (!photo.ok || !foreign.ok) throw new Error("upload failed");

    await setGiftItemPhoto(mine.owner.userId, item.itemId, photo.assetId);
    await expect(setGiftItemPhoto(mine.owner.userId, item.itemId, foreign.assetId)).rejects.toBeInstanceOf(WeddingAccessError);

    expect(await getAssetForDelivery(photo.assetId, mine.owner.userId)).not.toBeNull();
    expect(await getAssetForDelivery(photo.assetId, null)).toBeNull();
    expect(await deleteAssetIfUnused(mine.owner.userId, photo.assetId)).toBe(false);
  });
});

describe("rundown", () => {
  it("groups by day and orders by time, defaulting to the wedding date", async () => {
    const { owner, weddingId } = await createOwnerWorkspace(userIds, { weddingInDays: 120 });
    const weddingDate = addDaysIso(today, 120);
    await createRundownItem(owner.userId, weddingId, rundownInput({ title: "Akad", startTime: "09:00", endTime: "10:00" }));
    await createRundownItem(owner.userId, weddingId, rundownInput({ title: "Makeup", startTime: "05:00" }));
    await createRundownItem(owner.userId, weddingId, rundownInput({ title: "Ngunduh mantu", itemDate: addDaysIso(weddingDate, 1), startTime: "10:00", endTime: null }));
    await createRundownItem(owner.userId, weddingId, rundownInput({ title: "Siraman", itemDate: addDaysIso(weddingDate, -1), startTime: "15:00", endTime: null }));

    const days = await listRundown(owner.userId, weddingId);
    expect(days.map((day) => [day.dateIso, day.items.map((item) => item.title)])).toEqual([
      [addDaysIso(weddingDate, -1), ["Siraman"]],
      [weddingDate, ["Makeup", "Akad"]],
      [addDaysIso(weddingDate, 1), ["Ngunduh mantu"]],
    ]);
  });

  it("only reorders items that start at the same time", async () => {
    const { owner, weddingId } = await createOwnerWorkspace(userIds);
    const photo = await createRundownItem(owner.userId, weddingId, rundownInput({ title: "Foto keluarga", startTime: "11:00", endTime: null }));
    const lunch = await createRundownItem(owner.userId, weddingId, rundownInput({ title: "Makan siang", startTime: "11:00", endTime: null }));
    const later = await createRundownItem(owner.userId, weddingId, rundownInput({ title: "Resepsi", startTime: "12:00", endTime: null }));

    expect(await moveRundownItem(owner.userId, lunch, "up")).toBe(true);
    expect((await listRundown(owner.userId, weddingId))[0]!.items.map((item) => item.title)).toEqual(["Makan siang", "Foto keluarga", "Resepsi"]);
    expect(await moveRundownItem(owner.userId, photo, "down")).toBe(false);
    expect(await moveRundownItem(owner.userId, later, "up")).toBe(false);

    await updateRundownItem(owner.userId, later, rundownInput({ title: "Resepsi", startTime: "12:30", endTime: "15:00" }));
    await deleteRundownItem(owner.userId, photo);
    expect((await listRundown(owner.userId, weddingId))[0]!.items.map((item) => `${item.startTime} ${item.title}`)).toEqual([
      "11:00 Makan siang",
      "12:30 Resepsi",
    ]);
  });

  it("refuses an end before the start at the database level", async () => {
    const { owner, weddingId } = await createOwnerWorkspace(userIds);
    const id = await createRundownItem(owner.userId, weddingId, rundownInput());
    await expect(getDb().$executeRaw`UPDATE rundown_items SET end_time = '04:00' WHERE id = ${id}::uuid`).rejects.toThrow(
      /rundown_items_end_time_format/,
    );
  });
});

describe("calendar", () => {
  it("brings every dated record into one list that links back to its source", async () => {
    const { owner, weddingId } = await createOwnerWorkspace(userIds, { weddingInDays: 20 });
    const day = addDaysIso(today, 5);

    const category = await getDb().budgetCategory.findFirstOrThrow({ where: { weddingId, name: "Catering" } });
    const expense = await createExpense(owner.userId, weddingId, {
      title: "DP catering",
      categoryId: category.id,
      vendorId: null,
      totalAmount: 10n * M,
      dueDate: day,
      notes: null,
    });
    if (!expense.ok) throw new Error("expense creation failed");
    await recordPayment(owner.userId, expense.expenseId, { amount: 4n * M, paymentDate: today, method: "BANK_TRANSFER", reference: null, notes: null });

    const vendorCategory = await getDb().vendorCategory.findFirstOrThrow({ where: { code: "CATERING" } });
    const research: VendorResearchInput = {
      name: "ABC Catering",
      categoryId: vendorCategory.id,
      contactPerson: null,
      whatsapp: null,
      phone: null,
      instagram: null,
      website: null,
      estimatedPrice: null,
      packageName: null,
      location: null,
      rating: null,
      pros: null,
      cons: null,
      notes: null,
      status: "MEETING",
      meetingDate: day,
      meetingTime: "14:00",
    };
    await createVendorResearch(owner.userId, weddingId, research);
    await createWeddingEvent(owner.userId, weddingId, {
      name: "Akad Nikah",
      eventDate: day,
      startTime: "08:00",
      endTime: "10:00",
      venueName: "Masjid",
      address: null,
      latitude: null,
      longitude: null,
      mapsUrl: null,
      dressCode: null,
      notes: null,
    });
    const agendaId = await createCalendarEvent(owner.userId, weddingId, agendaInput({ eventDate: day, startTime: "16:00", endTime: "17:00" }));
    await getDb().task.create({
      data: {
        weddingId,
        title: "Konfirmasi katering",
        dueDate: new Date(`${day}T00:00:00Z`),
        categoryId: (await getDb().taskCategory.findFirstOrThrow()).id,
        source: "CUSTOM",
      },
    });

    const entries = (await listCalendarEntries(owner.userId, weddingId, day, day)).filter((entry) => entry.dateIso === day);
    const bySource = Object.fromEntries(entries.map((entry) => [entry.source, entry]));

    expect(bySource.payment).toMatchObject({ title: "DP catering", href: `/budget/expenses/${expense.expenseId}`, done: false });
    expect(bySource.payment?.detail).toMatch(/sisa Rp\s6\.000\.000/);
    expect(bySource.vendor_meeting).toMatchObject({ title: "Janji dengan ABC Catering", time: "14:00" });
    expect(bySource.wedding_event).toMatchObject({ title: "Akad Nikah", time: "08:00" });
    expect(bySource.custom).toMatchObject({ title: "Fitting baju", href: `/calendar/events/${agendaId}` });
    expect(entries.some((entry) => entry.source === "task" && entry.title === "Konfirmasi katering")).toBe(true);

    // Timed entries come first, in time order.
    const timed = entries.filter((entry) => entry.time).map((entry) => entry.time);
    expect(timed).toEqual([...timed].sort());
  });

  it("only returns entries inside the requested range and refuses huge ranges", async () => {
    const { owner, weddingId } = await createOwnerWorkspace(userIds);
    await createCalendarEvent(owner.userId, weddingId, agendaInput({ title: "Di dalam", eventDate: addDaysIso(today, 3) }));
    await createCalendarEvent(owner.userId, weddingId, agendaInput({ title: "Di luar", eventDate: addDaysIso(today, 40) }));

    const custom = (await listCalendarEntries(owner.userId, weddingId, today, addDaysIso(today, 7))).filter((entry) => entry.source === "custom");
    expect(custom.map((entry) => entry.title)).toEqual(["Di dalam"]);
    await expect(listCalendarEntries(owner.userId, weddingId, today, addDaysIso(today, 100))).rejects.toThrow(RangeError);
    expect(await listCalendarEntries(owner.userId, weddingId, addDaysIso(today, 5), today)).toEqual([]);
  });

  it("updates and deletes a custom agenda", async () => {
    const { owner, weddingId } = await createOwnerWorkspace(userIds);
    const id = await createCalendarEvent(owner.userId, weddingId, agendaInput());
    await updateCalendarEvent(owner.userId, id, agendaInput({ title: "Fitting kedua", eventDate: addDaysIso(today, 12) }));
    const range = await listCalendarEntries(owner.userId, weddingId, today, addDaysIso(today, 14));
    expect(range.filter((entry) => entry.source === "custom").map((entry) => [entry.title, entry.dateIso])).toEqual([
      ["Fitting kedua", addDaysIso(today, 12)],
    ]);
    await deleteCalendarEvent(owner.userId, id);
    expect((await listCalendarEntries(owner.userId, weddingId, today, addDaysIso(today, 14))).some((entry) => entry.source === "custom")).toBe(false);
  });
});

describe("invitation music", () => {
  async function publishedInvitation() {
    const { owner, weddingId } = await createOwnerWorkspace(userIds);
    await ensureInvitation(owner.userId, weddingId);
    await createWeddingEvent(owner.userId, weddingId, {
      name: "Resepsi",
      eventDate: addDaysIso(today, 300),
      startTime: null,
      endTime: null,
      venueName: null,
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
    const published = await publishInvitation(owner.userId, weddingId);
    if (!published.ok) throw new Error("publish failed");
    return { owner, weddingId, slug: published.slug };
  }

  it("serves music publicly only while it is switched on", async () => {
    const { owner, weddingId, slug } = await publishedInvitation();
    const upload = await uploadAudio(owner.userId, weddingId, { name: "lagu.mp3", type: "audio/mpeg", bytes: MP3 });
    if (!upload.ok) throw new Error(`audio upload failed: ${upload.reason}`);
    expect(await getDb().mediaAsset.findUniqueOrThrow({ where: { id: upload.assetId } })).toMatchObject({
      kind: "AUDIO",
      mimeType: "audio/mpeg",
      width: null,
    });

    await setInvitationMusic(owner.userId, weddingId, upload.assetId);
    expect((await getPublishedInvitation(slug))?.music).toEqual({ assetId: upload.assetId, volume: 60 });
    expect(await getAssetForDelivery(upload.assetId, null)).toMatchObject({ mimeType: "audio/mpeg" });

    await updateInvitationMusic(owner.userId, weddingId, { musicEnabled: false, musicVolume: 40 });
    expect(await getAssetForDelivery(upload.assetId, null)).toBeNull();
    expect(await getAssetForDelivery(upload.assetId, owner.userId)).not.toBeNull();

    await setInvitationMusic(owner.userId, weddingId, null);
    expect(await deleteAssetIfUnused(owner.userId, upload.assetId)).toBe(true);
  });

  it("refuses to switch music on without a track, and rejects non-audio files", async () => {
    const { owner, weddingId } = await publishedInvitation();
    expect(await updateInvitationMusic(owner.userId, weddingId, { musicEnabled: true, musicVolume: 50 })).toEqual({ ok: false, reason: "no_track" });
    expect(await uploadAudio(owner.userId, weddingId, { name: "foto.mp3", type: "audio/mpeg", bytes: pngFixture(300, 300) })).toEqual({
      ok: false,
      reason: "unsupported_type",
    });

    const image = await uploadImage(owner.userId, weddingId, { name: "foto.png", type: "image/png", bytes: pngFixture(300, 300) });
    if (!image.ok) throw new Error("upload failed");
    await expect(setInvitationMusic(owner.userId, weddingId, image.assetId)).rejects.toBeInstanceOf(WeddingAccessError);
  });
});

describe("planning authorization", () => {
  it("keeps every planning record inside its workspace", async () => {
    const { owner, weddingId } = await createOwnerWorkspace(userIds);
    const outsider = await createTestUser(userIds, "Outsider");
    const savings = await createSavingsEntry(owner.userId, weddingId, savingsInput());
    const gift = await createGiftItem(owner.userId, weddingId, giftInput());
    const rundown = await createRundownItem(owner.userId, weddingId, rundownInput());
    const agenda = await createCalendarEvent(owner.userId, weddingId, agendaInput());
    if (!gift.ok) throw new Error("gift item creation failed");

    await expect(getSavingsSummary(outsider.userId, weddingId)).rejects.toBeInstanceOf(WeddingAccessError);
    await expect(updateSavingsEntry(outsider.userId, savings, savingsInput())).rejects.toBeInstanceOf(WeddingAccessError);
    await expect(deleteGiftItem(outsider.userId, gift.itemId)).rejects.toBeInstanceOf(WeddingAccessError);
    await expect(setGiftItemStatus(outsider.userId, gift.itemId, "READY")).rejects.toBeInstanceOf(WeddingAccessError);
    await expect(deleteRundownItem(outsider.userId, rundown)).rejects.toBeInstanceOf(WeddingAccessError);
    await expect(listCalendarEntries(outsider.userId, weddingId, today, today)).rejects.toBeInstanceOf(WeddingAccessError);
    await expect(deleteCalendarEvent(outsider.userId, agenda)).rejects.toBeInstanceOf(WeddingAccessError);
  });
});
