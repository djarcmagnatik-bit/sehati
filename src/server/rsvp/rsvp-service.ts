import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { normalizeAttendance } from "@/lib/guests";
import type { RsvpInput } from "@/lib/validation/rsvp";
import { recordActivity } from "@/server/activity/activity-service";
import { memberWeddingWhere, requireWeddingMember, WeddingAccessError } from "@/server/authz/wedding-access";
import { getDb } from "@/server/db";

const uuidSchema = z.uuid();
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,32}$/;

/** Origin hint for abuse handling only: never reversible to an address, never shown to the couple. */
export function hashIp(ipAddress: string | null): string | null {
  return ipAddress ? createHash("sha256").update(ipAddress).digest("hex") : null;
}

export type RsvpGuest = {
  id: string;
  weddingId: string;
  invitationName: string;
  seatCount: number;
  rsvpStatus: "PENDING" | "ATTENDING" | "MAYBE" | "DECLINED";
  attendingCount: number;
  attendeeNames: string | null;
  message: string | null;
};

/** Resolves a personalized token to the little that the RSVP form needs. */
export async function getRsvpGuestByToken(token: string): Promise<RsvpGuest | null> {
  if (!TOKEN_PATTERN.test(token)) return null;
  const guest = await getDb().guest.findUnique({
    where: { invitationToken: token },
    select: {
      id: true,
      weddingId: true,
      invitationName: true,
      seatCount: true,
      rsvpStatus: true,
      attendingCount: true,
      rsvpSubmissions: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { attendeeNames: true, message: true },
      },
      wedding: { select: { invitation: { select: { status: true } } } },
    },
  });
  if (!guest || guest.wedding.invitation?.status !== "PUBLISHED") return null;

  const last = guest.rsvpSubmissions[0];
  return {
    id: guest.id,
    weddingId: guest.weddingId,
    invitationName: guest.invitationName,
    seatCount: guest.seatCount,
    rsvpStatus: guest.rsvpStatus,
    attendingCount: guest.attendingCount,
    attendeeNames: last?.attendeeNames ?? null,
    message: last?.message ?? null,
  };
}

export type SubmitRsvpResult =
  | { ok: true; guestId: string; rsvpStatus: RsvpGuest["rsvpStatus"]; attendingCount: number }
  | { ok: false; reason: "not_found" | "seats_exceeded" };

/**
 * Records one answer: the guest row keeps the latest, `rsvp_submissions` keeps every version.
 * The seat limit is re-checked against the guest row, not against whatever the form claimed.
 */
export async function submitRsvp(
  token: string,
  input: RsvpInput,
  options: { ipAddress?: string | null } = {},
  now: Date = new Date(),
): Promise<SubmitRsvpResult> {
  const guest = await getRsvpGuestByToken(token);
  if (!guest) return { ok: false, reason: "not_found" };

  const attendingCount = normalizeAttendance(input.rsvpStatus, input.attendingCount);
  if (attendingCount > guest.seatCount) return { ok: false, reason: "seats_exceeded" };

  const ipHash = hashIp(options.ipAddress ?? null);
  return getDb().$transaction(async (tx) => {
    // The seat count can change between reading the form and submitting it.
    const current = await tx.guest.findUnique({ where: { id: guest.id }, select: { seatCount: true } });
    if (!current) return { ok: false, reason: "not_found" } as const;
    if (attendingCount > current.seatCount) return { ok: false, reason: "seats_exceeded" } as const;

    await tx.guest.update({
      where: { id: guest.id },
      data: {
        rsvpStatus: input.rsvpStatus,
        attendingCount,
        // Answering proves the invitation was opened.
        invitationStatus: "OPENED",
        invitationOpenedAt: guest.rsvpStatus === "PENDING" ? now : undefined,
      },
    });
    await tx.rsvpSubmission.create({
      data: {
        weddingId: guest.weddingId,
        guestId: guest.id,
        rsvpStatus: input.rsvpStatus,
        attendingCount,
        attendeeNames: input.attendeeNames,
        message: input.message,
        ipHash,
        createdAt: now,
      },
    });
    await recordActivity(tx, {
      weddingId: guest.weddingId,
      userId: null,
      actorName: guest.invitationName,
      action: "rsvp.received",
      entityType: "guest",
      entityId: guest.id,
      metadata: { name: guest.invitationName, status: input.rsvpStatus, count: attendingCount },
    });
    return { ok: true, guestId: guest.id, rsvpStatus: input.rsvpStatus, attendingCount } as const;
  });
}

/** RSVP history for the planner's guest detail page, newest first. */
export async function listRsvpSubmissions(userId: string, guestId: string) {
  if (!uuidSchema.safeParse(guestId).success) return [];
  const guest = await getDb().guest.findFirst({
    where: { id: guestId, wedding: memberWeddingWhere(userId) },
    select: { id: true },
  });
  if (!guest) throw new WeddingAccessError();

  return getDb().rsvpSubmission.findMany({
    where: { guestId: guest.id },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { id: true, rsvpStatus: true, attendingCount: true, attendeeNames: true, message: true, createdAt: true },
  });
}

export type RsvpOverview = {
  responded: number;
  pending: number;
  attendingInvitations: number;
  attendingSeats: number;
  maybeInvitations: number;
  declinedInvitations: number;
  latest: Array<{
    id: string;
    guestId: string;
    invitationName: string;
    rsvpStatus: string;
    attendingCount: number;
    message: string | null;
    createdAt: Date;
  }>;
};

/** What the couple sees after guests start answering. */
export async function getRsvpOverview(userId: string, weddingId: string, latestLimit = 5): Promise<RsvpOverview> {
  const membership = await requireWeddingMember(userId, weddingId);
  const db = getDb();
  const [counts, latest] = await Promise.all([
    db.guest.groupBy({
      by: ["rsvpStatus"],
      where: { weddingId: membership.weddingId },
      _count: { _all: true },
      _sum: { attendingCount: true },
    }),
    db.rsvpSubmission.findMany({
      where: { weddingId: membership.weddingId },
      orderBy: { createdAt: "desc" },
      take: latestLimit,
      select: {
        id: true,
        guestId: true,
        rsvpStatus: true,
        attendingCount: true,
        message: true,
        createdAt: true,
        guest: { select: { invitationName: true } },
      },
    }),
  ]);

  const byStatus = new Map(counts.map((row) => [row.rsvpStatus, { count: row._count._all, seats: row._sum.attendingCount ?? 0 }]));
  const attending = byStatus.get("ATTENDING") ?? { count: 0, seats: 0 };
  return {
    responded: (byStatus.get("ATTENDING")?.count ?? 0) + (byStatus.get("MAYBE")?.count ?? 0) + (byStatus.get("DECLINED")?.count ?? 0),
    pending: byStatus.get("PENDING")?.count ?? 0,
    attendingInvitations: attending.count,
    attendingSeats: attending.seats,
    maybeInvitations: byStatus.get("MAYBE")?.count ?? 0,
    declinedInvitations: byStatus.get("DECLINED")?.count ?? 0,
    latest: latest.map((row) => ({
      id: row.id,
      guestId: row.guestId,
      invitationName: row.guest.invitationName,
      rsvpStatus: row.rsvpStatus,
      attendingCount: row.attendingCount,
      message: row.message,
      createdAt: row.createdAt,
    })),
  };
}
