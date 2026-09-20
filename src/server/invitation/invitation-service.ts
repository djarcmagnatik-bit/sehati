import "server-only";
import { z } from "zod";
import { Prisma, type InvitationSectionType } from "@/generated/prisma/client";
import {
  INVITATION_SECTION_TYPES,
  SECTION_LABEL,
  SECTIONS_NOT_YET_INTERACTIVE,
  suggestSlug,
  type InvitationSectionTypeValue,
} from "@/lib/invitation";
import { COVER_LAYOUTS, DEFAULT_THEME_CODE, getTheme, type CoverLayout } from "@/lib/invitation-themes";
import {
  parseSectionContent,
  type InvitationSettingsInput,
  type InvitationThemeInput,
} from "@/lib/validation/invitation";
import type { InvitationMusicInput } from "@/lib/validation/planning";
import { recordActivity } from "@/server/activity/activity-service";
import { memberWeddingWhere, WeddingAccessError } from "@/server/authz/wedding-access";
import { requireWeddingFeature, weddingHasFeature } from "@/server/billing/access";
import { themeChoiceProblem, type ThemeChoiceProblem } from "./theme-catalog";
import { getDb } from "@/server/db";

type Tx = Prisma.TransactionClient;

const uuidSchema = z.uuid();
const isUuid = (value: string) => uuidSchema.safeParse(value).success;

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/** Sections the couple has to fill in before they are worth showing start disabled. */
const DISABLED_BY_DEFAULT: readonly InvitationSectionTypeValue[] = [
  "LOVE_STORY",
  "GALLERY",
  "GIFT",
  ...SECTIONS_NOT_YET_INTERACTIVE,
];

const DEFAULT_CONTENT: Partial<Record<InvitationSectionTypeValue, Record<string, string>>> = {
  COVER: { prefix: "The Wedding Of" },
  EVENTS: { intro: "Dengan memohon rahmat dan ridho Allah SWT, kami bermaksud menyelenggarakan acara:" },
  CLOSING: {
    message:
      "Merupakan suatu kehormatan dan kebahagiaan bagi kami apabila Bapak/Ibu/Saudara/i berkenan hadir dan memberikan doa restu.",
    signature: "Kami yang berbahagia",
  },
};

// ─── Reading ─────────────────────────────────────────────────────────────────

const invitationSelect = {
  id: true,
  weddingId: true,
  slug: true,
  status: true,
  themeCode: true,
  themeOptions: true,
  coverImageId: true,
  musicAssetId: true,
  musicEnabled: true,
  musicVolume: true,
  defaultGuestLabel: true,
  giftAddress: true,
  publishedAt: true,
  updatedAt: true,
} satisfies Prisma.InvitationSelect;

export type InvitationSectionView = {
  id: string;
  type: InvitationSectionTypeValue;
  enabled: boolean;
  sortOrder: number;
  content: Record<string, string | null>;
};

export function coverLayoutOf(themeOptions: unknown, themeCode: string): CoverLayout {
  const raw = themeOptions && typeof themeOptions === "object" ? (themeOptions as Record<string, unknown>).coverLayout : null;
  return typeof raw === "string" && (COVER_LAYOUTS as readonly string[]).includes(raw)
    ? (raw as CoverLayout)
    : getTheme(themeCode).defaultCoverLayout;
}

/** Whether guests first see the full-screen opening cover. Older invitations have no value: on. */
export function openingCoverOf(themeOptions: unknown): boolean {
  const raw = themeOptions && typeof themeOptions === "object" ? (themeOptions as Record<string, unknown>).openingCover : undefined;
  return raw !== false;
}

function toSectionView(section: { id: string; type: InvitationSectionType; enabled: boolean; sortOrder: number; content: unknown }): InvitationSectionView {
  const type = section.type as InvitationSectionTypeValue;
  return {
    id: section.id,
    type,
    enabled: section.enabled,
    sortOrder: section.sortOrder,
    content: parseSectionContent(type, section.content) as Record<string, string | null>,
  };
}

async function loadSections(db: Tx | ReturnType<typeof getDb>, invitationId: string): Promise<InvitationSectionView[]> {
  const sections = await db.invitationSection.findMany({
    where: { invitationId },
    orderBy: { sortOrder: "asc" },
    select: { id: true, type: true, enabled: true, sortOrder: true, content: true },
  });
  return sections.map(toSectionView);
}

/** The editor view: invitation settings plus every section in display order. */
export async function getInvitationForUser(userId: string, weddingId: string) {
  const membership = await requireWeddingFeature("invitation", userId, weddingId);
  const invitation = await getDb().invitation.findUnique({ where: { weddingId: membership.weddingId }, select: invitationSelect });
  if (!invitation) return null;
  return { ...invitation, sections: await loadSections(getDb(), invitation.id) };
}

// ─── Creation ────────────────────────────────────────────────────────────────

async function createSections(tx: Tx, invitationId: string, weddingId: string): Promise<void> {
  await tx.invitationSection.createMany({
    data: INVITATION_SECTION_TYPES.map((type, index) => ({
      invitationId,
      weddingId,
      type,
      enabled: !DISABLED_BY_DEFAULT.includes(type),
      sortOrder: (index + 1) * 10,
      content: DEFAULT_CONTENT[type] ?? {},
    })),
  });
}

/** Free slug based on the couple's names: "putri-fajar", "putri-fajar-2", … */
async function availableSlug(tx: Tx, base: string): Promise<string> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const taken = await tx.invitation.findUnique({ where: { slug: candidate }, select: { id: true } });
    if (!taken) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

export type CreateInvitationResult = { ok: true; invitationId: string; created: boolean };

/** Creates the invitation and its sections once per wedding; safe to call from any page. */
export async function ensureInvitation(userId: string, weddingId: string): Promise<CreateInvitationResult> {
  const membership = await requireWeddingFeature("invitation", userId, weddingId);
  const db = getDb();
  const existing = await db.invitation.findUnique({ where: { weddingId: membership.weddingId }, select: { id: true } });
  if (existing) return { ok: true, invitationId: existing.id, created: false };

  const wedding = await db.wedding.findUniqueOrThrow({
    where: { id: membership.weddingId },
    select: { brideName: true, groomName: true },
  });

  try {
    return await db.$transaction(async (tx) => {
      const slug = await availableSlug(tx, suggestSlug(wedding.brideName, wedding.groomName));
      const invitation = await tx.invitation.create({
        data: {
          weddingId: membership.weddingId,
          slug,
          themeCode: DEFAULT_THEME_CODE,
          defaultGuestLabel: "Bapak/Ibu/Saudara/i",
          createdById: userId,
        },
        select: { id: true },
      });
      await createSections(tx, invitation.id, membership.weddingId);
      await recordActivity(tx, {
        weddingId: membership.weddingId,
        userId,
        actorName: membership.displayName,
        action: "invitation.created",
        entityType: "invitation",
        entityId: invitation.id,
        metadata: { name: slug },
      });
      return { ok: true, invitationId: invitation.id, created: true } as const;
    });
  } catch (error) {
    // Both partners can press the button at the same time; the wedding_id unique index settles it.
    if (isUniqueViolation(error)) {
      const invitation = await db.invitation.findUniqueOrThrow({ where: { weddingId: membership.weddingId }, select: { id: true } });
      return { ok: true, invitationId: invitation.id, created: false };
    }
    throw error;
  }
}

async function requireInvitation(userId: string, weddingId: string) {
  const membership = await requireWeddingFeature("invitation", userId, weddingId);
  const invitation = await getDb().invitation.findUnique({
    where: { weddingId: membership.weddingId },
    select: { id: true, slug: true, status: true, themeCode: true, themeOptions: true },
  });
  if (!invitation) throw new WeddingAccessError();
  return { invitation, membership };
}

// ─── Settings, theme, sections ───────────────────────────────────────────────

export type SettingsResult = { ok: true } | { ok: false; reason: "slug_taken" };

export async function updateInvitationSettings(
  userId: string,
  weddingId: string,
  input: InvitationSettingsInput,
): Promise<SettingsResult> {
  const { invitation, membership } = await requireInvitation(userId, weddingId);
  try {
    await getDb().$transaction(async (tx) => {
      await tx.invitation.update({
        where: { id: invitation.id },
        data: { slug: input.slug, defaultGuestLabel: input.defaultGuestLabel },
      });
      await recordActivity(tx, {
        weddingId: membership.weddingId,
        userId,
        actorName: membership.displayName,
        action: "invitation.settings_updated",
        entityType: "invitation",
        entityId: invitation.id,
        metadata: { name: input.slug },
      });
    });
    return { ok: true };
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, reason: "slug_taken" };
    throw error;
  }
}

export type ThemeUpdateResult = { ok: true } | { ok: false; reason: ThemeChoiceProblem };

export async function updateInvitationTheme(userId: string, weddingId: string, input: InvitationThemeInput): Promise<ThemeUpdateResult> {
  const { invitation, membership } = await requireInvitation(userId, weddingId);
  const problem = await themeChoiceProblem(input.themeCode, {
    currentThemeCode: invitation.themeCode,
    hasPremiumThemes: await weddingHasFeature(membership.weddingId, "premium_themes"),
  });
  if (problem) return { ok: false, reason: problem };

  await getDb().$transaction(async (tx) => {
    await tx.invitation.update({
      where: { id: invitation.id },
      data: { themeCode: input.themeCode, themeOptions: { coverLayout: input.coverLayout, openingCover: input.openingCover ?? true } },
    });
    await recordActivity(tx, {
      weddingId: membership.weddingId,
      userId,
      actorName: membership.displayName,
      action: "invitation.theme_changed",
      entityType: "invitation",
      entityId: invitation.id,
      metadata: { name: getTheme(input.themeCode).name },
    });
  });
  return { ok: true };
}

async function findSectionScope(userId: string, sectionId: string) {
  if (!isUuid(sectionId)) throw new WeddingAccessError();
  const section = await getDb().invitationSection.findFirst({
    where: { id: sectionId, wedding: memberWeddingWhere(userId) },
    select: { id: true, weddingId: true, invitationId: true, type: true, enabled: true },
  });
  if (!section) throw new WeddingAccessError();
  const membership = await requireWeddingFeature("invitation", userId, section.weddingId);
  return { section, membership };
}

/** Content is stored as JSON per section type; unknown keys never reach the database. */
export async function updateSectionContent(
  userId: string,
  sectionId: string,
  content: Record<string, string | null>,
  enabled: boolean,
): Promise<void> {
  const { section, membership } = await findSectionScope(userId, sectionId);
  const type = section.type as InvitationSectionTypeValue;
  await getDb().$transaction(async (tx) => {
    await tx.invitationSection.update({
      where: { id: section.id },
      data: { content: parseSectionContent(type, content) as Prisma.InputJsonValue, enabled },
    });
    await recordActivity(tx, {
      weddingId: section.weddingId,
      userId,
      actorName: membership.displayName,
      action: "invitation.section_updated",
      entityType: "invitation_section",
      entityId: section.id,
      metadata: { name: SECTION_LABEL[type], enabled },
    });
  });
}

export async function setSectionEnabled(userId: string, sectionId: string, enabled: boolean): Promise<void> {
  const { section, membership } = await findSectionScope(userId, sectionId);
  if (section.enabled === enabled) return;
  await getDb().$transaction(async (tx) => {
    await tx.invitationSection.update({ where: { id: section.id }, data: { enabled } });
    await recordActivity(tx, {
      weddingId: section.weddingId,
      userId,
      actorName: membership.displayName,
      action: "invitation.section_updated",
      entityType: "invitation_section",
      entityId: section.id,
      metadata: { name: SECTION_LABEL[section.type as InvitationSectionTypeValue], enabled },
    });
  });
}

/** Ids from another invitation are ignored; sections left out keep their relative order at the end. */
export async function reorderSections(userId: string, weddingId: string, sectionIds: string[]): Promise<number> {
  const { invitation, membership } = await requireInvitation(userId, weddingId);
  const db = getDb();
  const sections = await db.invitationSection.findMany({
    where: { invitationId: invitation.id },
    orderBy: { sortOrder: "asc" },
    select: { id: true },
  });
  const known = new Set(sections.map((section) => section.id));
  const ordered = [...sectionIds.filter((id) => known.has(id)), ...sections.map((section) => section.id)];
  const unique = [...new Set(ordered)];

  return db.$transaction(async (tx) => {
    await Promise.all(
      unique.map((id, index) => tx.invitationSection.update({ where: { id }, data: { sortOrder: (index + 1) * 10 } })),
    );
    await recordActivity(tx, {
      weddingId: membership.weddingId,
      userId,
      actorName: membership.displayName,
      action: "invitation.sections_reordered",
      entityType: "invitation",
      entityId: invitation.id,
    });
    return unique.length;
  });
}

/** One step up or down in the section list, expressed through the same reorder path. */
export async function moveSection(userId: string, sectionId: string, direction: "up" | "down"): Promise<void> {
  const { section } = await findSectionScope(userId, sectionId);
  const db = getDb();
  const sections = await db.invitationSection.findMany({
    where: { invitationId: section.invitationId },
    orderBy: { sortOrder: "asc" },
    select: { id: true },
  });
  const index = sections.findIndex((row) => row.id === section.id);
  const target = direction === "up" ? index - 1 : index + 1;
  if (index === -1 || target < 0 || target >= sections.length) return;

  const order = sections.map((row) => row.id);
  const [moved] = order.splice(index, 1);
  order.splice(target, 0, moved!);
  await reorderSections(userId, section.weddingId, order);
}

// ─── Publishing ──────────────────────────────────────────────────────────────

export type PublishRequirement = "events" | "couple";

export type PublishResult = { ok: true; slug: string } | { ok: false; missing: PublishRequirement[] };

/** An invitation without an event or the couple's names would be a broken public page. */
export async function publishInvitation(userId: string, weddingId: string, now: Date = new Date()): Promise<PublishResult> {
  const { invitation, membership } = await requireInvitation(userId, weddingId);
  const db = getDb();
  const [eventCount, coupleSection] = await Promise.all([
    db.weddingEvent.count({ where: { weddingId: membership.weddingId } }),
    db.invitationSection.findFirst({ where: { invitationId: invitation.id, type: "COUPLE" }, select: { content: true } }),
  ]);
  const couple = parseSectionContent("COUPLE", coupleSection?.content);
  const missing: PublishRequirement[] = [];
  if (eventCount === 0) missing.push("events");
  if (!couple.brideFullName || !couple.groomFullName) missing.push("couple");
  if (missing.length > 0) return { ok: false, missing };

  await db.$transaction(async (tx) => {
    await tx.invitation.update({ where: { id: invitation.id }, data: { status: "PUBLISHED", publishedAt: now } });
    await recordActivity(tx, {
      weddingId: membership.weddingId,
      userId,
      actorName: membership.displayName,
      action: "invitation.published",
      entityType: "invitation",
      entityId: invitation.id,
      metadata: { name: invitation.slug },
    });
  });
  return { ok: true, slug: invitation.slug };
}

export async function unpublishInvitation(userId: string, weddingId: string): Promise<void> {
  const { invitation, membership } = await requireInvitation(userId, weddingId);
  await getDb().$transaction(async (tx) => {
    await tx.invitation.update({ where: { id: invitation.id }, data: { status: "DRAFT", publishedAt: null } });
    await recordActivity(tx, {
      weddingId: membership.weddingId,
      userId,
      actorName: membership.displayName,
      action: "invitation.unpublished",
      entityType: "invitation",
      entityId: invitation.id,
      metadata: { name: invitation.slug },
    });
  });
}

export async function setCoverImage(userId: string, weddingId: string, assetId: string | null): Promise<void> {
  const { invitation, membership } = await requireInvitation(userId, weddingId);
  if (assetId) {
    const asset = await getDb().mediaAsset.findFirst({
      where: { id: assetId, weddingId: membership.weddingId, kind: "IMAGE" },
      select: { id: true },
    });
    if (!asset) throw new WeddingAccessError();
  }
  await getDb().invitation.update({ where: { id: invitation.id }, data: { coverImageId: assetId } });
}

// ─── Background music ────────────────────────────────────────────────────────

/** Attaches an uploaded audio file from the same wedding, or clears it (which also switches music off). */
export async function setInvitationMusic(userId: string, weddingId: string, assetId: string | null): Promise<void> {
  const { invitation, membership } = await requireInvitation(userId, weddingId);
  if (assetId) {
    const asset = await getDb().mediaAsset.findFirst({
      where: { id: assetId, weddingId: membership.weddingId, kind: "AUDIO" },
      select: { id: true },
    });
    if (!asset) throw new WeddingAccessError();
  }
  await getDb().$transaction(async (tx) => {
    await tx.invitation.update({
      where: { id: invitation.id },
      data: assetId ? { musicAssetId: assetId, musicEnabled: true } : { musicAssetId: null, musicEnabled: false },
    });
    await recordActivity(tx, {
      weddingId: membership.weddingId,
      userId,
      actorName: membership.displayName,
      action: "invitation.music_updated",
      entityType: "invitation",
      entityId: invitation.id,
      metadata: { enabled: assetId !== null },
    });
  });
}

export type MusicSettingsResult = { ok: true } | { ok: false; reason: "no_track" };

export async function updateInvitationMusic(
  userId: string,
  weddingId: string,
  input: InvitationMusicInput,
): Promise<MusicSettingsResult> {
  const { invitation, membership } = await requireInvitation(userId, weddingId);
  const current = await getDb().invitation.findUniqueOrThrow({ where: { id: invitation.id }, select: { musicAssetId: true } });
  if (input.musicEnabled && !current.musicAssetId) return { ok: false, reason: "no_track" };

  await getDb().$transaction(async (tx) => {
    await tx.invitation.update({
      where: { id: invitation.id },
      data: { musicEnabled: input.musicEnabled, musicVolume: input.musicVolume },
    });
    await recordActivity(tx, {
      weddingId: membership.weddingId,
      userId,
      actorName: membership.displayName,
      action: "invitation.music_updated",
      entityType: "invitation",
      entityId: invitation.id,
      metadata: { enabled: input.musicEnabled, count: input.musicVolume },
    });
  });
  return { ok: true };
}
