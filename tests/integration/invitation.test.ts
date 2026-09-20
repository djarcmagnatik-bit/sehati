import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { addDaysIso, todayIsoInTimeZone } from "@/lib/dates";
import { INVITATION_SECTION_TYPES } from "@/lib/invitation";
import type { WeddingEventInput } from "@/lib/validation/invitation";
import { getRecentActivity } from "@/server/activity/activity-service";
import { WeddingAccessError } from "@/server/authz/wedding-access";
import { getDb } from "@/server/db";
import {
  addGalleryImage,
  createGiftAccount,
  createLoveStoryEntry,
  deleteGiftAccount,
  listGalleryImages,
  listGiftAccounts,
  listLoveStoryEntries,
  moveGalleryImage,
  removeGalleryImage,
  updateGiftAddress,
} from "@/server/invitation/content-service";
import { createWeddingEvent, deleteWeddingEvent, listWeddingEvents, updateWeddingEvent } from "@/server/invitation/event-service";
import {
  ensureInvitation,
  getInvitationForUser,
  moveSection,
  publishInvitation,
  setCoverImage,
  setSectionEnabled,
  unpublishInvitation,
  updateInvitationSettings,
  updateInvitationTheme,
  updateSectionContent,
} from "@/server/invitation/invitation-service";
import { getInvitationForGuestToken, getPublishedInvitation } from "@/server/invitation/public-invitation-service";
import { createGuest } from "@/server/guests/guest-service";
import { deleteAssetIfUnused, getAssetForDelivery, uploadImage } from "@/server/media/media-service";
import { pngFixture } from "../support/image-fixtures";
import { createTestUser, deleteUsers } from "../support/integration-helpers";
import { createOwnerWorkspace } from "../support/workspace-helpers";

const userIds: string[] = [];
const today = todayIsoInTimeZone(new Date());

afterAll(async () => {
  await deleteUsers(userIds);
});

function eventInput(overrides: Partial<WeddingEventInput> = {}): WeddingEventInput {
  return {
    name: "Akad Nikah",
    eventDate: addDaysIso(today, 400),
    startTime: "09:00",
    endTime: "11:00",
    venueName: "Masjid Agung",
    address: "Jl. Merdeka 1, Bandung",
    latitude: -6.914744,
    longitude: 107.60981,
    mapsUrl: null,
    dressCode: "Batik",
    notes: null,
    ...overrides,
  };
}

/** Workspace with an invitation that already satisfies the publish requirements. */
async function readyInvitation(name = "Fajar") {
  const { owner, weddingId } = await createOwnerWorkspace(userIds, { name });
  await ensureInvitation(owner.userId, weddingId);
  await createWeddingEvent(owner.userId, weddingId, eventInput());
  const invitation = await getInvitationForUser(owner.userId, weddingId);
  const couple = invitation!.sections.find((section) => section.type === "COUPLE")!;
  await updateSectionContent(
    owner.userId,
    couple.id,
    { brideFullName: "Putri Ayu", groomFullName: "Fajar Pratama", brideParents: "Bpk. A & Ibu B" },
    true,
  );
  return { owner, weddingId, invitationId: invitation!.id, slug: invitation!.slug };
}

async function uploadFixture(userId: string, weddingId: string, name = "foto.png", size = 400) {
  const result = await uploadImage(userId, weddingId, { name, type: "image/png", bytes: pngFixture(size, size, [size % 255, 100, 50]) });
  if (!result.ok) throw new Error(`upload failed: ${result.reason}`);
  return result;
}

describe("invitation creation", () => {
  it("creates every section once, in order, with sensible defaults", async () => {
    const { owner, weddingId } = await createOwnerWorkspace(userIds);
    const created = await ensureInvitation(owner.userId, weddingId);
    expect(created).toMatchObject({ ok: true, created: true });

    const invitation = await getInvitationForUser(owner.userId, weddingId);
    expect(invitation).toMatchObject({ status: "DRAFT", themeCode: "minimal", publishedAt: null });
    // Other couples in the test database may already hold the base slug.
    expect(invitation?.slug).toMatch(/^putri-fajar(-\d+)?$/);
    expect(invitation?.sections.map((section) => section.type)).toEqual([...INVITATION_SECTION_TYPES]);

    const enabled = Object.fromEntries(invitation!.sections.map((section) => [section.type, section.enabled]));
    expect(enabled).toMatchObject({ COVER: true, COUPLE: true, EVENTS: true, RSVP: false, WISHES: false, GALLERY: false });
    expect(invitation?.sections.find((section) => section.type === "COVER")?.content).toMatchObject({ prefix: "The Wedding Of" });
  });

  it("is idempotent, even when both partners create it at the same time", async () => {
    const { owner, weddingId } = await createOwnerWorkspace(userIds);
    const [first, second] = await Promise.all([ensureInvitation(owner.userId, weddingId), ensureInvitation(owner.userId, weddingId)]);
    expect(first.invitationId).toBe(second.invitationId);
    expect([first.created, second.created].filter(Boolean)).toHaveLength(1);
    expect(await getDb().invitationSection.count({ where: { invitationId: first.invitationId } })).toBe(INVITATION_SECTION_TYPES.length);
  });

  it("gives the second couple with the same names a different slug", async () => {
    const first = await createOwnerWorkspace(userIds);
    const second = await createOwnerWorkspace(userIds);
    await ensureInvitation(first.owner.userId, first.weddingId);
    await ensureInvitation(second.owner.userId, second.weddingId);

    const a = await getInvitationForUser(first.owner.userId, first.weddingId);
    const b = await getInvitationForUser(second.owner.userId, second.weddingId);
    expect(a?.slug).not.toBe(b?.slug);
  });
});

describe("invitation settings and theme", () => {
  it("saves a slug and refuses one that is taken", async () => {
    const mine = await readyInvitation();
    const other = await readyInvitation("Rina");

    expect(await updateInvitationSettings(mine.owner.userId, mine.weddingId, { slug: "kami-menikah", defaultGuestLabel: "Bapak/Ibu" })).toEqual({
      ok: true,
    });
    expect(await updateInvitationSettings(other.owner.userId, other.weddingId, { slug: "kami-menikah", defaultGuestLabel: null })).toEqual({
      ok: false,
      reason: "slug_taken",
    });
    expect((await getInvitationForUser(mine.owner.userId, mine.weddingId))?.slug).toBe("kami-menikah");
  });

  it("stores the theme and cover layout without touching content", async () => {
    const { owner, weddingId } = await readyInvitation();
    const before = await getInvitationForUser(owner.userId, weddingId);
    await updateInvitationTheme(owner.userId, weddingId, { themeCode: "dark-luxury", coverLayout: "split" });

    const after = await getInvitationForUser(owner.userId, weddingId);
    expect(after).toMatchObject({ themeCode: "dark-luxury", themeOptions: { coverLayout: "split" } });
    expect(after?.sections.map((section) => section.content)).toEqual(before?.sections.map((section) => section.content));
  });

  it("remembers the opening cover switch and shows it to guests, on by default", async () => {
    const { owner, weddingId, invitationId, slug } = await readyInvitation();
    await publishInvitation(owner.userId, weddingId);

    // Saving the design without the switch keeps the cover on.
    await updateInvitationTheme(owner.userId, weddingId, { themeCode: "boho", coverLayout: "center" });
    expect((await getInvitationForUser(owner.userId, weddingId))?.themeOptions).toMatchObject({ openingCover: true });
    expect(await getPublishedInvitation(slug)).toMatchObject({ openingCover: true });

    await updateInvitationTheme(owner.userId, weddingId, { themeCode: "boho", coverLayout: "center", openingCover: false });
    expect((await getInvitationForUser(owner.userId, weddingId))?.themeOptions).toMatchObject({ openingCover: false });
    expect(await getPublishedInvitation(slug)).toMatchObject({ openingCover: false });

    await updateInvitationTheme(owner.userId, weddingId, { themeCode: "boho", coverLayout: "center", openingCover: true });
    expect(await getPublishedInvitation(slug)).toMatchObject({ openingCover: true });

    // Invitations saved before this setting existed have no flag at all: they get the cover too.
    await getDb().invitation.update({ where: { id: invitationId }, data: { themeOptions: { coverLayout: "center" } } });
    expect(await getPublishedInvitation(slug)).toMatchObject({ openingCover: true });
  });
});

describe("invitation sections", () => {
  it("keeps only known fields and can hide a section", async () => {
    const { owner, weddingId } = await readyInvitation();
    const invitation = await getInvitationForUser(owner.userId, weddingId);
    const quote = invitation!.sections.find((section) => section.type === "QUOTE")!;

    await updateSectionContent(owner.userId, quote.id, { text: "  Ayat pilihan  ", source: "QS. Ar-Rum: 21", hacked: "x" }, true);
    const saved = (await getInvitationForUser(owner.userId, weddingId))!.sections.find((section) => section.type === "QUOTE");
    expect(saved?.content).toEqual({ text: "Ayat pilihan", source: "QS. Ar-Rum: 21" });

    await setSectionEnabled(owner.userId, quote.id, false);
    expect((await getInvitationForUser(owner.userId, weddingId))!.sections.find((s) => s.type === "QUOTE")?.enabled).toBe(false);
  });

  it("moves a section one step and keeps the rest in order", async () => {
    const { owner, weddingId } = await readyInvitation();
    const before = (await getInvitationForUser(owner.userId, weddingId))!.sections.map((section) => section.type);
    const gallery = (await getInvitationForUser(owner.userId, weddingId))!.sections.find((section) => section.type === "GALLERY")!;

    await moveSection(owner.userId, gallery.id, "up");
    const after = (await getInvitationForUser(owner.userId, weddingId))!.sections.map((section) => section.type);
    const galleryIndex = before.indexOf("GALLERY");
    expect(after[galleryIndex - 1]).toBe("GALLERY");
    expect(after[galleryIndex]).toBe(before[galleryIndex - 1]);
    expect([...after].sort()).toEqual([...before].sort());
  });
});

describe("publishing", () => {
  it("refuses to publish an invitation without events or couple names", async () => {
    const { owner, weddingId } = await createOwnerWorkspace(userIds);
    await ensureInvitation(owner.userId, weddingId);
    expect(await publishInvitation(owner.userId, weddingId)).toEqual({ ok: false, missing: ["events", "couple"] });
    expect((await getInvitationForUser(owner.userId, weddingId))?.status).toBe("DRAFT");
  });

  it("publishes a complete invitation and exposes it publicly", async () => {
    const { owner, weddingId, slug } = await readyInvitation();
    expect(await getPublishedInvitation(slug)).toBeNull();

    const result = await publishInvitation(owner.userId, weddingId);
    expect(result).toEqual({ ok: true, slug });

    const published = await getPublishedInvitation(slug);
    expect(published).toMatchObject({ slug, themeCode: "minimal", coupleName: "Putri & Fajar" });
    expect(published?.events[0]).toMatchObject({ name: "Akad Nikah", startTime: "09:00", latitude: -6.914744 });
    expect(published?.sections.some((section) => section.type === "RSVP")).toBe(false); // disabled sections stay out

    const activity = await getRecentActivity(owner.userId, weddingId, 3);
    expect(activity[0]).toMatchObject({ action: "invitation.published", metadata: { name: slug } });
  });

  it("stops serving the page after it is taken down", async () => {
    const { owner, weddingId, slug } = await readyInvitation();
    await publishInvitation(owner.userId, weddingId);
    await unpublishInvitation(owner.userId, weddingId);

    expect(await getPublishedInvitation(slug)).toBeNull();
    expect(await getInvitationForUser(owner.userId, weddingId)).toMatchObject({ status: "DRAFT", publishedAt: null });
  });

  it("never exposes planning data through the public payload", async () => {
    const { owner, weddingId, slug } = await readyInvitation();
    await createGuest(owner.userId, weddingId, {
      guestName: "Ahmad",
      invitationName: "Keluarga Bapak Ahmad",
      groupId: null,
      phone: "0812-3456-7890",
      email: null,
      address: null,
      seatCount: 5,
      invitationStatus: "SENT",
      rsvpStatus: "PENDING",
      attendingCount: 0,
      notes: null,
    });
    await publishInvitation(owner.userId, weddingId);

    const serialized = JSON.stringify(await getPublishedInvitation(slug));
    expect(serialized).not.toContain("Keluarga Bapak Ahmad");
    expect(serialized).not.toContain("6281234567890");
    expect(serialized).not.toMatch(/targetBudget|budget|guests|members/i);
  });
});

describe("wedding events", () => {
  it("creates, updates and deletes an event", async () => {
    const { owner, weddingId } = await readyInvitation();
    const id = await createWeddingEvent(owner.userId, weddingId, eventInput({ name: "Resepsi", startTime: "18:00", endTime: "21:00" }));

    const events = await listWeddingEvents(owner.userId, weddingId);
    expect(events.map((event) => event.name)).toEqual(["Akad Nikah", "Resepsi"]);
    expect(events[1]).toMatchObject({ startTime: "18:00", latitude: -6.914744, longitude: 107.60981 });

    await updateWeddingEvent(owner.userId, id, eventInput({ name: "Resepsi Malam", latitude: null, longitude: null, mapsUrl: "https://maps.app.goo.gl/x" }));
    expect((await listWeddingEvents(owner.userId, weddingId))[1]).toMatchObject({
      name: "Resepsi Malam",
      latitude: null,
      mapsUrl: "https://maps.app.goo.gl/x",
    });

    await deleteWeddingEvent(owner.userId, id);
    expect(await listWeddingEvents(owner.userId, weddingId)).toHaveLength(1);
  });

  it("enforces time format and coordinate ranges in the database", async () => {
    const { owner, weddingId } = await readyInvitation();
    const event = (await listWeddingEvents(owner.userId, weddingId))[0]!;

    await expect(getDb().$executeRaw`UPDATE wedding_events SET start_time = '9am' WHERE id = ${event.id}::uuid`).rejects.toThrow(
      /wedding_events_start_time_format/,
    );
    await expect(getDb().$executeRaw`UPDATE wedding_events SET latitude = 91 WHERE id = ${event.id}::uuid`).rejects.toThrow(
      /wedding_events_latitude_range/,
    );
    await expect(getDb().$executeRaw`UPDATE wedding_events SET longitude = NULL WHERE id = ${event.id}::uuid`).rejects.toThrow(
      /wedding_events_coordinates_pair/,
    );
  });
});

describe("images", () => {
  it("stores an upload once per wedding and reuses it on re-upload", async () => {
    const { owner, weddingId } = await readyInvitation();
    const first = await uploadFixture(owner.userId, weddingId);
    const second = await uploadImage(owner.userId, weddingId, {
      name: "lagi.png",
      type: "image/png",
      bytes: pngFixture(400, 400, [400 % 255, 100, 50]),
    });

    expect(first.reused).toBe(false);
    expect(second).toMatchObject({ ok: true, assetId: first.assetId, reused: true });
    expect(await getDb().mediaAsset.count({ where: { weddingId } })).toBe(1);
    expect(await getDb().mediaAsset.findUniqueOrThrow({ where: { id: first.assetId } })).toMatchObject({
      mimeType: "image/png",
      width: 400,
      height: 400,
    });
  });

  it("rejects files that are not usable images", async () => {
    const { owner, weddingId } = await readyInvitation();
    expect(await uploadImage(owner.userId, weddingId, { name: "x.png", type: "image/png", bytes: Buffer.from("not a png") })).toEqual({
      ok: false,
      reason: "unsupported_type",
    });
    expect(await uploadImage(owner.userId, weddingId, { name: "x.png", type: "image/jpeg", bytes: pngFixture(400, 400) })).toEqual({
      ok: false,
      reason: "unsupported_type",
    });
    expect(await uploadImage(owner.userId, weddingId, { name: "x.png", type: "image/png", bytes: pngFixture(100, 100) })).toEqual({
      ok: false,
      reason: "too_small",
    });
  });

  it("serves a draft image only to members, and a published one to anyone", async () => {
    const { owner, weddingId } = await readyInvitation();
    const outsider = await createTestUser(userIds, "Outsider");
    const asset = await uploadFixture(owner.userId, weddingId);
    await addGalleryImage(owner.userId, weddingId, asset.assetId);

    expect(await getAssetForDelivery(asset.assetId, owner.userId)).toMatchObject({ mimeType: "image/png" });
    expect(await getAssetForDelivery(asset.assetId, outsider.userId)).toBeNull();
    expect(await getAssetForDelivery(asset.assetId, null)).toBeNull();

    await publishInvitation(owner.userId, weddingId);
    expect(await getAssetForDelivery(asset.assetId, null)).toMatchObject({ mimeType: "image/png", byteSize: expect.any(Number) });
    expect(await getAssetForDelivery(randomUUID(), null)).toBeNull();
  });

  it("keeps an unpublished cover image private", async () => {
    const { owner, weddingId } = await readyInvitation();
    const asset = await uploadFixture(owner.userId, weddingId);
    await setCoverImage(owner.userId, weddingId, asset.assetId);
    await publishInvitation(owner.userId, weddingId);
    expect(await getAssetForDelivery(asset.assetId, null)).not.toBeNull();

    await unpublishInvitation(owner.userId, weddingId);
    expect(await getAssetForDelivery(asset.assetId, null)).toBeNull();
  });

  it("only deletes an asset nothing references", async () => {
    const { owner, weddingId } = await readyInvitation();
    const asset = await uploadFixture(owner.userId, weddingId);
    const added = await addGalleryImage(owner.userId, weddingId, asset.assetId);
    if (!added.ok) throw new Error("gallery add failed");

    expect(await deleteAssetIfUnused(owner.userId, asset.assetId)).toBe(false);
    await removeGalleryImage(owner.userId, added.imageId);
    expect(await deleteAssetIfUnused(owner.userId, asset.assetId)).toBe(true);
    expect(await getDb().mediaAsset.count({ where: { id: asset.assetId } })).toBe(0);
  });
});

describe("gallery, love story and gift information", () => {
  it("orders gallery images and stores captions", async () => {
    const { owner, weddingId } = await readyInvitation();
    const first = await uploadFixture(owner.userId, weddingId, "satu.png", 400);
    const second = await uploadFixture(owner.userId, weddingId, "dua.png", 401);
    const addedFirst = await addGalleryImage(owner.userId, weddingId, first.assetId, "Prewedding");
    await addGalleryImage(owner.userId, weddingId, second.assetId);
    if (!addedFirst.ok) throw new Error("gallery add failed");

    expect(await addGalleryImage(owner.userId, weddingId, first.assetId)).toEqual({ ok: false, reason: "duplicate" });
    expect((await listGalleryImages(owner.userId, weddingId)).map((image) => image.caption)).toEqual(["Prewedding", null]);

    await moveGalleryImage(owner.userId, addedFirst.imageId, "down");
    expect((await listGalleryImages(owner.userId, weddingId)).map((image) => image.caption)).toEqual([null, "Prewedding"]);
  });

  it("keeps love story entries in insertion order", async () => {
    const { owner, weddingId } = await readyInvitation();
    await createLoveStoryEntry(owner.userId, weddingId, { title: "Pertemuan", timeLabel: "2019", story: "Kami bertemu" });
    await createLoveStoryEntry(owner.userId, weddingId, { title: "Lamaran", timeLabel: "2025", story: "Melamar" });
    expect((await listLoveStoryEntries(owner.userId, weddingId)).map((entry) => entry.title)).toEqual(["Pertemuan", "Lamaran"]);
  });

  it("stores gift accounts and the delivery address", async () => {
    const { owner, weddingId, slug } = await readyInvitation();
    const accountId = await createGiftAccount(owner.userId, weddingId, {
      type: "BANK",
      providerName: "BCA",
      accountNumber: "1234567890",
      accountHolder: "Putri Ayu",
      notes: null,
    });
    await updateGiftAddress(owner.userId, weddingId, { giftAddress: "Jl. Mawar 5, Bandung" });
    await publishInvitation(owner.userId, weddingId);

    const published = await getPublishedInvitation(slug);
    expect(published?.giftAccounts[0]).toMatchObject({ providerName: "BCA", accountNumber: "1234567890" });
    expect(published?.giftAddress).toBe("Jl. Mawar 5, Bandung");

    await deleteGiftAccount(owner.userId, accountId);
    expect(await listGiftAccounts(owner.userId, weddingId)).toHaveLength(0);
  });
});

describe("personalized guest link", () => {
  async function guestWithToken(userId: string, weddingId: string, invitationStatus: "SENT" | "FOLLOW_UP" = "SENT") {
    const result = await createGuest(userId, weddingId, {
      guestName: "Ahmad Fauzi",
      invitationName: "Keluarga Bapak Ahmad",
      groupId: null,
      phone: null,
      email: null,
      address: null,
      seatCount: 5,
      invitationStatus,
      rsvpStatus: "PENDING",
      attendingCount: 0,
      notes: null,
    });
    if (!result.ok) throw new Error("guest creation failed");
    const guest = await getDb().guest.findUniqueOrThrow({ where: { id: result.guestId }, select: { invitationToken: true } });
    return { guestId: result.guestId, token: guest.invitationToken };
  }

  it("greets the guest by name and marks the invitation as opened", async () => {
    const { owner, weddingId } = await readyInvitation();
    const { guestId, token } = await guestWithToken(owner.userId, weddingId);
    await publishInvitation(owner.userId, weddingId);

    const result = await getInvitationForGuestToken(token);
    expect(result?.guest).toEqual({ invitationName: "Keluarga Bapak Ahmad", seatCount: 5 });

    const after = await getDb().guest.findUniqueOrThrow({ where: { id: guestId } });
    expect(after.invitationStatus).toBe("OPENED");
    expect(after.invitationOpenedAt).not.toBeNull();

    // Opening again keeps the first timestamp.
    await getInvitationForGuestToken(token);
    const second = await getDb().guest.findUniqueOrThrow({ where: { id: guestId } });
    expect(second.invitationOpenedAt?.getTime()).toBe(after.invitationOpenedAt?.getTime());
  });

  it("does not overwrite a follow-up status the planner set by hand", async () => {
    const { owner, weddingId } = await readyInvitation();
    const { guestId, token } = await guestWithToken(owner.userId, weddingId, "FOLLOW_UP");
    await publishInvitation(owner.userId, weddingId);

    await getInvitationForGuestToken(token);
    const after = await getDb().guest.findUniqueOrThrow({ where: { id: guestId } });
    expect(after.invitationStatus).toBe("FOLLOW_UP");
    expect(after.invitationOpenedAt).not.toBeNull();
  });

  it("refuses unknown tokens and unpublished invitations", async () => {
    const { owner, weddingId } = await readyInvitation();
    const { token } = await guestWithToken(owner.userId, weddingId);
    expect(await getInvitationForGuestToken(token)).toBeNull(); // still a draft

    await publishInvitation(owner.userId, weddingId);
    expect(await getInvitationForGuestToken("tidak-valid")).toBeNull();
    expect(await getInvitationForGuestToken("a".repeat(22))).toBeNull();
  });
});

describe("invitation authorization", () => {
  it("keeps every invitation mutation inside the workspace", async () => {
    const mine = await readyInvitation();
    const outsider = await createTestUser(userIds, "Outsider");
    const invitation = await getInvitationForUser(mine.owner.userId, mine.weddingId);
    const section = invitation!.sections[0]!;
    const event = (await listWeddingEvents(mine.owner.userId, mine.weddingId))[0]!;

    await expect(getInvitationForUser(outsider.userId, mine.weddingId)).rejects.toBeInstanceOf(WeddingAccessError);
    await expect(updateSectionContent(outsider.userId, section.id, {}, true)).rejects.toBeInstanceOf(WeddingAccessError);
    await expect(setSectionEnabled(outsider.userId, section.id, false)).rejects.toBeInstanceOf(WeddingAccessError);
    await expect(updateWeddingEvent(outsider.userId, event.id, eventInput())).rejects.toBeInstanceOf(WeddingAccessError);
    await expect(deleteWeddingEvent(outsider.userId, event.id)).rejects.toBeInstanceOf(WeddingAccessError);
    await expect(publishInvitation(outsider.userId, mine.weddingId)).rejects.toBeInstanceOf(WeddingAccessError);
    await expect(createLoveStoryEntry(outsider.userId, mine.weddingId, { title: "x", timeLabel: null, story: "y" })).rejects.toBeInstanceOf(
      WeddingAccessError,
    );
    await expect(deleteAssetIfUnused(outsider.userId, randomUUID())).rejects.toBeInstanceOf(WeddingAccessError);
  });

  it("does not let one workspace attach another workspace's image", async () => {
    const mine = await readyInvitation();
    const theirs = await readyInvitation("Rina");
    const asset = await uploadFixture(theirs.owner.userId, theirs.weddingId);

    await expect(addGalleryImage(mine.owner.userId, mine.weddingId, asset.assetId)).rejects.toBeInstanceOf(WeddingAccessError);
    await expect(setCoverImage(mine.owner.userId, mine.weddingId, asset.assetId)).rejects.toBeInstanceOf(WeddingAccessError);
  });
});
