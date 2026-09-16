import { afterAll, describe, expect, it } from "vitest";
import { addDaysIso, todayIsoInTimeZone } from "@/lib/dates";
import type { GuestInput } from "@/lib/validation/guests";
import type { RsvpInput } from "@/lib/validation/rsvp";
import { getRecentActivity } from "@/server/activity/activity-service";
import { WeddingAccessError } from "@/server/authz/wedding-access";
import { getDb } from "@/server/db";
import { createGuest, deleteGuest, getGuestSummary } from "@/server/guests/guest-service";
import { createWeddingEvent } from "@/server/invitation/event-service";
import {
  ensureInvitation,
  getInvitationForUser,
  publishInvitation,
  updateSectionContent,
} from "@/server/invitation/invitation-service";
import { getRsvpGuestByToken, getRsvpOverview, listRsvpSubmissions, submitRsvp } from "@/server/rsvp/rsvp-service";
import {
  countWishes,
  deleteWish,
  listPublicWishes,
  listPublicWishesBySlug,
  listWishesForUser,
  setWishStatus,
  submitWish,
} from "@/server/rsvp/wish-service";
import { createTestUser, deleteUsers } from "../support/integration-helpers";
import { createOwnerWorkspace } from "../support/workspace-helpers";

const userIds: string[] = [];
const today = todayIsoInTimeZone(new Date());

afterAll(async () => {
  await deleteUsers(userIds);
});

function guestInput(overrides: Partial<GuestInput> = {}): GuestInput {
  return {
    guestName: "Ahmad Fauzi",
    invitationName: "Keluarga Bapak Ahmad",
    groupId: null,
    phone: null,
    email: null,
    address: null,
    seatCount: 5,
    invitationStatus: "SENT",
    rsvpStatus: "PENDING",
    attendingCount: 0,
    notes: null,
    ...overrides,
  };
}

function rsvpInput(overrides: Partial<RsvpInput> = {}): RsvpInput {
  return { rsvpStatus: "ATTENDING", attendingCount: 4, attendeeNames: null, message: null, ...overrides };
}

/** Published invitation + one guest with a personalized token. */
async function publishedWithGuest(overrides: Partial<GuestInput> = {}) {
  const { owner, weddingId } = await createOwnerWorkspace(userIds);
  await ensureInvitation(owner.userId, weddingId);
  await createWeddingEvent(owner.userId, weddingId, {
    name: "Resepsi",
    eventDate: addDaysIso(today, 300),
    startTime: "18:00",
    endTime: null,
    venueName: "Gedung Serbaguna",
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

  const guest = await createGuest(owner.userId, weddingId, guestInput(overrides));
  if (!guest.ok) throw new Error("guest creation failed");
  const published = await publishInvitation(owner.userId, weddingId);
  if (!published.ok) throw new Error(`publish failed: ${published.missing.join(",")}`);

  const row = await getDb().guest.findUniqueOrThrow({ where: { id: guest.guestId }, select: { invitationToken: true } });
  return { owner, weddingId, guestId: guest.guestId, token: row.invitationToken, slug: published.slug };
}

describe("RSVP submission", () => {
  it("updates the guest record and keeps the answer as history", async () => {
    const { owner, weddingId, guestId, token } = await publishedWithGuest();

    const result = await submitRsvp(token, rsvpInput({ attendeeNames: "Ahmad, Siti", message: "Selamat!" }), { ipAddress: "10.0.0.1" });
    expect(result).toMatchObject({ ok: true, rsvpStatus: "ATTENDING", attendingCount: 4 });

    const guest = await getDb().guest.findUniqueOrThrow({ where: { id: guestId } });
    expect(guest).toMatchObject({ rsvpStatus: "ATTENDING", attendingCount: 4, invitationStatus: "OPENED" });

    const history = await listRsvpSubmissions(owner.userId, guestId);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ rsvpStatus: "ATTENDING", attendingCount: 4, attendeeNames: "Ahmad, Siti", message: "Selamat!" });

    // The guest dashboard reflects it immediately.
    expect(await getGuestSummary(owner.userId, weddingId)).toMatchObject({
      invitations: 1,
      seats: 5,
      attendingInvitations: 1,
      attendingSeats: 4,
      pendingInvitations: 0,
    });
  });

  it("keeps every answer when the guest changes their mind", async () => {
    const { owner, weddingId, guestId, token } = await publishedWithGuest();
    await submitRsvp(token, rsvpInput({ attendingCount: 4 }));
    await submitRsvp(token, rsvpInput({ rsvpStatus: "MAYBE", attendingCount: 2 }));
    await submitRsvp(token, rsvpInput({ rsvpStatus: "DECLINED", attendingCount: 3 }));

    const history = await listRsvpSubmissions(owner.userId, guestId);
    expect(history.map((entry) => [entry.rsvpStatus, entry.attendingCount])).toEqual([
      ["DECLINED", 0],
      ["MAYBE", 2],
      ["ATTENDING", 4],
    ]);
    expect(await getDb().guest.findUniqueOrThrow({ where: { id: guestId } })).toMatchObject({
      rsvpStatus: "DECLINED",
      attendingCount: 0,
    });
    expect(await getGuestSummary(owner.userId, weddingId)).toMatchObject({ declinedInvitations: 1, attendingSeats: 0 });
  });

  it("refuses more people than the invitation covers", async () => {
    const { owner, guestId, token } = await publishedWithGuest({ seatCount: 2 });
    expect(await submitRsvp(token, rsvpInput({ attendingCount: 5 }))).toEqual({ ok: false, reason: "seats_exceeded" });
    expect(await getDb().guest.findUniqueOrThrow({ where: { id: guestId } })).toMatchObject({ rsvpStatus: "PENDING" });
    expect(await listRsvpSubmissions(owner.userId, guestId)).toHaveLength(0);
  });

  it("refuses an unknown token and a draft invitation", async () => {
    const { owner, weddingId, token } = await publishedWithGuest();
    expect(await submitRsvp("tidak-valid", rsvpInput())).toEqual({ ok: false, reason: "not_found" });

    await getDb().invitation.update({ where: { weddingId }, data: { status: "DRAFT", publishedAt: null } });
    expect(await getRsvpGuestByToken(token)).toBeNull();
    expect(await submitRsvp(token, rsvpInput())).toEqual({ ok: false, reason: "not_found" });
    expect(await getRsvpOverview(owner.userId, weddingId)).toMatchObject({ responded: 0, pending: 1 });
  });

  it("rejects an impossible row at the database level", async () => {
    const { weddingId, guestId } = await publishedWithGuest();
    await expect(
      getDb().$executeRaw`
        INSERT INTO rsvp_submissions (id, wedding_id, guest_id, rsvp_status, attending_count)
        VALUES (gen_random_uuid(), ${weddingId}::uuid, ${guestId}::uuid, 'DECLINED', 3)
      `,
    ).rejects.toThrow(/rsvp_submissions_attending_matches_rsvp/);
  });

  it("shows the guest their last answer when they come back", async () => {
    const { token } = await publishedWithGuest();
    await submitRsvp(token, rsvpInput({ attendingCount: 3, attendeeNames: "Ahmad & Siti", message: "Sampai jumpa" }));

    expect(await getRsvpGuestByToken(token)).toMatchObject({
      invitationName: "Keluarga Bapak Ahmad",
      seatCount: 5,
      rsvpStatus: "ATTENDING",
      attendingCount: 3,
      attendeeNames: "Ahmad & Siti",
      message: "Sampai jumpa",
    });
  });

  it("writes an activity entry the couple can read", async () => {
    const { owner, weddingId, token } = await publishedWithGuest();
    await submitRsvp(token, rsvpInput({ attendingCount: 4 }));

    const activity = await getRecentActivity(owner.userId, weddingId, 3);
    expect(activity[0]).toMatchObject({
      action: "rsvp.received",
      actorName: "Keluarga Bapak Ahmad",
      metadata: { status: "ATTENDING", count: 4 },
    });
  });

  it("summarizes responses for the couple", async () => {
    const { owner, weddingId, token } = await publishedWithGuest();
    const second = await createGuest(owner.userId, weddingId, guestInput({ guestName: "Siti", invitationName: "Siti Rahma", seatCount: 2 }));
    if (!second.ok) throw new Error("guest creation failed");
    const secondToken = (await getDb().guest.findUniqueOrThrow({ where: { id: second.guestId } })).invitationToken;

    await submitRsvp(token, rsvpInput({ attendingCount: 4 }));
    await submitRsvp(secondToken, rsvpInput({ rsvpStatus: "DECLINED" }));

    const overview = await getRsvpOverview(owner.userId, weddingId);
    expect(overview).toMatchObject({
      responded: 2,
      pending: 0,
      attendingInvitations: 1,
      attendingSeats: 4,
      declinedInvitations: 1,
    });
    expect(overview.latest.map((entry) => entry.invitationName)).toEqual(["Siti Rahma", "Keluarga Bapak Ahmad"]);
  });

  it("keeps RSVP history inside the workspace", async () => {
    const { guestId } = await publishedWithGuest();
    const outsider = await createTestUser(userIds, "Outsider");
    await expect(listRsvpSubmissions(outsider.userId, guestId)).rejects.toBeInstanceOf(WeddingAccessError);
  });
});

describe("guestbook", () => {
  it("accepts a wish from the public link and shows it publicly", async () => {
    const { owner, weddingId, slug } = await publishedWithGuest();
    const result = await submitWish({ slug }, { name: "Rina", message: "Selamat menempuh hidup baru!" }, { ipAddress: "10.0.0.2" });
    expect(result).toMatchObject({ ok: true });

    const wishes = await listPublicWishesBySlug(slug);
    expect(wishes).toHaveLength(1);
    expect(wishes[0]).toMatchObject({ name: "Rina", message: "Selamat menempuh hidup baru!" });
    expect(await countWishes(owner.userId, weddingId)).toEqual({ total: 1, hidden: 0 });

    const activity = await getRecentActivity(owner.userId, weddingId, 3);
    expect(activity[0]).toMatchObject({ action: "wish.received", actorName: "Rina" });
  });

  it("links a wish sent from a personalized link to that guest", async () => {
    const { owner, weddingId, guestId, token } = await publishedWithGuest();
    await submitWish({ token }, { name: "Ahmad", message: "Barakallah" });

    const moderation = await listWishesForUser(owner.userId, weddingId);
    expect(moderation.items[0]).toMatchObject({ name: "Ahmad", guest: { id: guestId, invitationName: "Keluarga Bapak Ahmad" } });
  });

  it("refuses wishes for an unknown slug, an unknown token, and a draft invitation", async () => {
    const { weddingId, slug, token } = await publishedWithGuest();
    expect(await submitWish({ slug: "tidak-ada-undangan" }, { name: "X", message: "Y" })).toEqual({ ok: false, reason: "not_found" });
    expect(await submitWish({ token: "bukan-token" }, { name: "X", message: "Y" })).toEqual({ ok: false, reason: "not_found" });

    await getDb().invitation.update({ where: { weddingId }, data: { status: "DRAFT", publishedAt: null } });
    expect(await submitWish({ slug }, { name: "X", message: "Y" })).toEqual({ ok: false, reason: "not_found" });
    expect(await submitWish({ token }, { name: "X", message: "Y" })).toEqual({ ok: false, reason: "not_found" });
  });

  it("hides a wish from the public page without losing it", async () => {
    const { owner, weddingId, slug } = await publishedWithGuest();
    await submitWish({ slug }, { name: "Rina", message: "Selamat!" });
    const listed = await listWishesForUser(owner.userId, weddingId);
    const wishId = listed.items[0]!.id;

    await setWishStatus(owner.userId, wishId, "HIDDEN");
    expect(await listPublicWishes(weddingId)).toHaveLength(0);
    expect(await listWishesForUser(owner.userId, weddingId, "HIDDEN")).toMatchObject({ total: 1 });
    expect(await countWishes(owner.userId, weddingId)).toEqual({ total: 1, hidden: 1 });

    await setWishStatus(owner.userId, wishId, "VISIBLE");
    expect(await listPublicWishes(weddingId)).toHaveLength(1);
    expect(await getDb().wish.findUniqueOrThrow({ where: { id: wishId } })).toMatchObject({ hiddenAt: null, hiddenById: null });
  });

  it("deletes a wish permanently", async () => {
    const { owner, weddingId, slug } = await publishedWithGuest();
    await submitWish({ slug }, { name: "Spam", message: "promo" });
    const wishId = (await listWishesForUser(owner.userId, weddingId)).items[0]!.id;

    await deleteWish(owner.userId, wishId);
    expect(await countWishes(owner.userId, weddingId)).toEqual({ total: 0, hidden: 0 });
  });

  it("keeps a wish when the guest who sent it is deleted", async () => {
    const { owner, weddingId, guestId, token } = await publishedWithGuest();
    await submitWish({ token }, { name: "Ahmad", message: "Barakallah" });

    await deleteGuest(owner.userId, guestId);
    const moderation = await listWishesForUser(owner.userId, weddingId);
    expect(moderation.items[0]).toMatchObject({ name: "Ahmad", guest: null });
  });

  it("keeps moderation inside the workspace", async () => {
    const { owner, weddingId, slug } = await publishedWithGuest();
    await submitWish({ slug }, { name: "Rina", message: "Selamat!" });
    const wishId = (await listWishesForUser(owner.userId, weddingId)).items[0]!.id;
    const outsider = await createTestUser(userIds, "Outsider");

    await expect(listWishesForUser(outsider.userId, weddingId)).rejects.toBeInstanceOf(WeddingAccessError);
    await expect(setWishStatus(outsider.userId, wishId, "HIDDEN")).rejects.toBeInstanceOf(WeddingAccessError);
    await expect(deleteWish(outsider.userId, wishId)).rejects.toBeInstanceOf(WeddingAccessError);
  });
});
