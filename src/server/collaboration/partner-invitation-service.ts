import "server-only";
import { maskEmail } from "@/lib/activity";
import { formatCoupleName } from "@/lib/couple";
import { formatIsoDateLong, dbDateToIso } from "@/lib/dates";
import { logger } from "@/lib/logger";
import { SITE } from "@/lib/site";
import { recordActivity } from "@/server/activity/activity-service";
import { generateToken, hashToken } from "@/server/auth/tokens";
import { requireWeddingMember } from "@/server/authz/wedding-access";
import { getDb } from "@/server/db";
import type { Mailer } from "@/server/mail/mailer";

export const PARTNER_INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** A workspace holds the couple: the owner plus one partner. */
export const MAX_COUPLE_MEMBERS = 2;
const MAX_TOKEN_LENGTH = 128;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function partnerInvitationUrl(appUrl: string, token: string): string {
  const url = new URL("/invite/partner", appUrl);
  url.searchParams.set("token", token);
  return url.toString();
}

export type CreatePartnerInvitationResult =
  | { ok: true; invitationId: string; inviteUrl: string; expiresAt: Date; emailSent: boolean }
  | { ok: false; reason: "not_owner" | "partner_already_joined" | "own_email" };

/**
 * Owner-only. Replaces any pending invitation (old links stop working), emails the new link and
 * returns it so the owner can also share it directly.
 */
export async function createPartnerInvitation(
  userId: string,
  weddingId: string,
  rawEmail: string,
  deps: { mailer: Mailer; appUrl: string },
  now: Date = new Date(),
): Promise<CreatePartnerInvitationResult> {
  const membership = await requireWeddingMember(userId, weddingId);
  if (membership.role !== "OWNER") return { ok: false, reason: "not_owner" };

  const email = normalizeEmail(rawEmail);
  const token = generateToken();
  const weddingKey = `wedding:${membership.weddingId}`;

  const created = await getDb().$transaction(async (tx) => {
    await tx.$executeRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext(${weddingKey}::text))`;

    const memberCount = await tx.weddingMember.count({ where: { weddingId: membership.weddingId } });
    if (memberCount >= MAX_COUPLE_MEMBERS) return { ok: false, reason: "partner_already_joined" } as const;

    const inviter = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } });
    if (inviter.email === email) return { ok: false, reason: "own_email" } as const;

    await tx.partnerInvitation.updateMany({
      where: { weddingId: membership.weddingId, status: "PENDING" },
      data: { status: "REVOKED", respondedAt: now },
    });
    const invitation = await tx.partnerInvitation.create({
      data: {
        weddingId: membership.weddingId,
        email,
        tokenHash: hashToken(token),
        invitedById: userId,
        expiresAt: new Date(now.getTime() + PARTNER_INVITATION_TTL_MS),
        createdAt: now,
      },
      select: { id: true, expiresAt: true },
    });
    const wedding = await tx.wedding.findUniqueOrThrow({
      where: { id: membership.weddingId },
      select: { brideName: true, groomName: true, coupleDisplayFormat: true, customDisplayName: true, weddingDate: true },
    });

    await recordActivity(tx, {
      weddingId: membership.weddingId,
      userId,
      actorName: membership.displayName,
      action: "partner.invited",
      entityType: "partner_invitation",
      entityId: invitation.id,
      metadata: { email: maskEmail(email) },
    });

    return { ok: true, invitation, wedding } as const;
  });

  if (!created.ok) return created;

  const inviteUrl = partnerInvitationUrl(deps.appUrl, token);
  const coupleName = formatCoupleName({
    brideName: created.wedding.brideName,
    groomName: created.wedding.groomName,
    format: created.wedding.coupleDisplayFormat,
    customDisplayName: created.wedding.customDisplayName,
  });

  let emailSent = true;
  try {
    await deps.mailer.send({
      to: email,
      subject: `${membership.displayName} mengundangmu merencanakan pernikahan bersama`,
      text: [
        "Halo,",
        "",
        `${membership.displayName} mengundangmu bergabung ke workspace pernikahan "${coupleName}" ` +
          `(${formatIsoDateLong(dbDateToIso(created.wedding.weddingDate))}) di ${SITE.name}.`,
        "",
        "Buka tautan berikut untuk menerima undangan (berlaku 7 hari):",
        inviteUrl,
        "",
        `Gunakan akun dengan email ${email}. Jika belum punya akun, kamu bisa mendaftar dari tautan tersebut.`,
      ].join("\n"),
    });
  } catch (error) {
    emailSent = false;
    logger.error("partner_invitation.email_failed", { error, invitationId: created.invitation.id });
  }

  return { ok: true, invitationId: created.invitation.id, inviteUrl, expiresAt: created.invitation.expiresAt, emailSent };
}

/** Members and the current pending invitation for the partner settings page. */
export async function getPartnerOverview(userId: string, weddingId: string, now: Date = new Date()) {
  const membership = await requireWeddingMember(userId, weddingId);
  const db = getDb();
  const [members, pendingInvitation] = await Promise.all([
    db.weddingMember.findMany({
      where: { weddingId: membership.weddingId },
      orderBy: { joinedAt: "asc" },
      select: { id: true, role: true, displayName: true, joinedAt: true },
    }),
    membership.role === "OWNER"
      ? db.partnerInvitation.findFirst({
          where: { weddingId: membership.weddingId, status: "PENDING", expiresAt: { gt: now } },
          orderBy: { createdAt: "desc" },
          select: { id: true, email: true, expiresAt: true, createdAt: true },
        })
      : Promise.resolve(null),
  ]);
  return { viewerRole: membership.role, viewerMemberId: membership.id, members, pendingInvitation };
}

export async function revokePartnerInvitation(
  userId: string,
  weddingId: string,
  now: Date = new Date(),
): Promise<{ ok: true; revoked: number } | { ok: false; reason: "not_owner" }> {
  const membership = await requireWeddingMember(userId, weddingId);
  if (membership.role !== "OWNER") return { ok: false, reason: "not_owner" };

  return getDb().$transaction(async (tx) => {
    const result = await tx.partnerInvitation.updateMany({
      where: { weddingId: membership.weddingId, status: "PENDING" },
      data: { status: "REVOKED", respondedAt: now },
    });
    if (result.count > 0) {
      await recordActivity(tx, {
        weddingId: membership.weddingId,
        userId,
        actorName: membership.displayName,
        action: "partner.invitation_revoked",
        entityType: "partner_invitation",
      });
    }
    return { ok: true, revoked: result.count } as const;
  });
}

export type PartnerInvitationPreview =
  | { status: "valid"; coupleName: string; inviterName: string; maskedEmail: string; expiresAt: Date }
  | { status: "invalid" };

/**
 * Public, token-gated preview. Exposes only what the invitee needs to decide — never planner data.
 * Unknown, expired, used and revoked invitations are indistinguishable.
 */
export async function getPartnerInvitationPreview(token: string, now: Date = new Date()): Promise<PartnerInvitationPreview> {
  if (!token || token.length > MAX_TOKEN_LENGTH) return { status: "invalid" };
  const invitation = await getDb().partnerInvitation.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      status: true,
      email: true,
      expiresAt: true,
      invitedBy: { select: { name: true } },
      wedding: {
        select: { brideName: true, groomName: true, coupleDisplayFormat: true, customDisplayName: true, deletedAt: true },
      },
    },
  });
  if (
    !invitation ||
    invitation.status !== "PENDING" ||
    invitation.expiresAt.getTime() <= now.getTime() ||
    invitation.wedding.deletedAt
  ) {
    return { status: "invalid" };
  }

  return {
    status: "valid",
    coupleName: formatCoupleName({
      brideName: invitation.wedding.brideName,
      groomName: invitation.wedding.groomName,
      format: invitation.wedding.coupleDisplayFormat,
      customDisplayName: invitation.wedding.customDisplayName,
    }),
    inviterName: invitation.invitedBy?.name ?? "Pasanganmu",
    maskedEmail: maskEmail(invitation.email),
    expiresAt: invitation.expiresAt,
  };
}

export type AcceptPartnerInvitationResult =
  | { ok: true; weddingId: string }
  | { ok: false; reason: "invalid" | "email_mismatch" | "already_member" | "has_other_wedding" | "workspace_full" };

export async function acceptPartnerInvitation(
  userId: string,
  token: string,
  now: Date = new Date(),
): Promise<AcceptPartnerInvitationResult> {
  if (!token || token.length > MAX_TOKEN_LENGTH) return { ok: false, reason: "invalid" };
  const db = getDb();
  const invitation = await db.partnerInvitation.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { id: true, weddingId: true },
  });
  if (!invitation) return { ok: false, reason: "invalid" };
  const weddingKey = `wedding:${invitation.weddingId}`;

  return db.$transaction(
    async (tx) => {
      // Lock order (user, then wedding) is the same everywhere to avoid deadlocks.
      await tx.$executeRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext(${userId}::text))`;
      await tx.$executeRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext(${weddingKey}::text))`;

      const current = await tx.partnerInvitation.findUniqueOrThrow({
        where: { id: invitation.id },
        select: { status: true, expiresAt: true, email: true, wedding: { select: { deletedAt: true } } },
      });
      if (current.status !== "PENDING" || current.expiresAt.getTime() <= now.getTime() || current.wedding.deletedAt) {
        return { ok: false, reason: "invalid" } as const;
      }

      const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true, name: true } });
      if (user.email !== current.email) return { ok: false, reason: "email_mismatch" } as const;

      const existing = await tx.weddingMember.findFirst({
        where: { userId, wedding: { deletedAt: null } },
        select: { weddingId: true },
      });
      if (existing?.weddingId === invitation.weddingId) return { ok: false, reason: "already_member" } as const;
      if (existing) return { ok: false, reason: "has_other_wedding" } as const;

      const memberCount = await tx.weddingMember.count({ where: { weddingId: invitation.weddingId } });
      if (memberCount >= MAX_COUPLE_MEMBERS) return { ok: false, reason: "workspace_full" } as const;

      await tx.partnerInvitation.update({
        where: { id: invitation.id },
        data: { status: "ACCEPTED", acceptedById: userId, respondedAt: now },
      });
      const member = await tx.weddingMember.create({
        data: { weddingId: invitation.weddingId, userId, role: "PARTNER", displayName: user.name.slice(0, 80) },
        select: { id: true },
      });
      await recordActivity(tx, {
        weddingId: invitation.weddingId,
        userId,
        actorName: user.name,
        action: "partner.joined",
        entityType: "wedding_member",
        entityId: member.id,
      });

      return { ok: true, weddingId: invitation.weddingId } as const;
    },
    { timeout: 15_000 },
  );
}

export async function declinePartnerInvitation(
  userId: string,
  token: string,
  now: Date = new Date(),
): Promise<{ ok: true } | { ok: false; reason: "invalid" | "email_mismatch" }> {
  if (!token || token.length > MAX_TOKEN_LENGTH) return { ok: false, reason: "invalid" };
  const db = getDb();

  return db.$transaction(async (tx) => {
    const invitation = await tx.partnerInvitation.findUnique({
      where: { tokenHash: hashToken(token) },
      select: { id: true, weddingId: true, email: true, status: true, expiresAt: true },
    });
    if (!invitation || invitation.status !== "PENDING" || invitation.expiresAt.getTime() <= now.getTime()) {
      return { ok: false, reason: "invalid" } as const;
    }
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true, name: true } });
    if (user.email !== invitation.email) return { ok: false, reason: "email_mismatch" } as const;

    const claimed = await tx.partnerInvitation.updateMany({
      where: { id: invitation.id, status: "PENDING" },
      data: { status: "DECLINED", respondedAt: now },
    });
    if (claimed.count !== 1) return { ok: false, reason: "invalid" } as const;

    await recordActivity(tx, {
      weddingId: invitation.weddingId,
      userId,
      actorName: user.name,
      action: "partner.invitation_declined",
      entityType: "partner_invitation",
      entityId: invitation.id,
    });
    return { ok: true } as const;
  });
}

/** Owner-only. The partner loses access immediately; data they created stays in the workspace. */
export async function removePartner(
  userId: string,
  weddingId: string,
): Promise<{ ok: true } | { ok: false; reason: "not_owner" | "no_partner" }> {
  const membership = await requireWeddingMember(userId, weddingId);
  if (membership.role !== "OWNER") return { ok: false, reason: "not_owner" };
  const weddingKey = `wedding:${membership.weddingId}`;

  return getDb().$transaction(async (tx) => {
    await tx.$executeRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext(${weddingKey}::text))`;
    const partner = await tx.weddingMember.findFirst({
      where: { weddingId: membership.weddingId, role: "PARTNER" },
      select: { id: true, displayName: true },
    });
    if (!partner) return { ok: false, reason: "no_partner" } as const;

    await tx.weddingMember.delete({ where: { id: partner.id } });
    await recordActivity(tx, {
      weddingId: membership.weddingId,
      userId,
      actorName: membership.displayName,
      action: "partner.removed",
      entityType: "wedding_member",
      entityId: partner.id,
      metadata: { name: partner.displayName },
    });
    return { ok: true } as const;
  });
}
