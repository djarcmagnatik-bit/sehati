import "server-only";
import { cache } from "react";
import { formatCoupleName } from "@/lib/couple";
import { dbDateToIso } from "@/lib/dates";
import type { GiftAccountTypeValue, InvitationSectionTypeValue } from "@/lib/invitation";
import { parseImageVariants } from "@/lib/media";
import { parseSectionContent } from "@/lib/validation/invitation";
import { weddingHasFeature } from "@/server/billing/access";
import { getDb } from "@/server/db";
import { coverLayoutOf } from "./invitation-service";
import type { CoverLayout } from "@/lib/invitation-themes";
import type { WeddingEventRow } from "./event-service";

export type PublicSection = {
  id: string;
  type: InvitationSectionTypeValue;
  content: Record<string, string | null>;
};

export type PublicInvitation = {
  slug: string;
  themeCode: string;
  coverLayout: CoverLayout;
  coupleName: string;
  brideName: string;
  groomName: string;
  weddingDateIso: string;
  timeZone: string;
  defaultGuestLabel: string | null;
  coverImageId: string | null;
  /** Widths of the cover's resized copies (empty: only the original exists). */
  coverImageWidths: number[];
  /** Present only when music is switched on and a track is attached. */
  music: { assetId: string; volume: number } | null;
  giftAddress: string | null;
  sections: PublicSection[];
  events: WeddingEventRow[];
  loveStory: Array<{ id: string; title: string; timeLabel: string | null; story: string; imageId: string | null }>;
  gallery: Array<{ id: string; assetId: string; caption: string | null; width: number; height: number; widths: number[] }>;
  giftAccounts: Array<{
    id: string;
    type: GiftAccountTypeValue;
    providerName: string;
    accountNumber: string;
    accountHolder: string;
    notes: string | null;
  }>;
};

/**
 * Everything the public page may read, and nothing else: no budget, no guest list, no member data.
 * Only published invitations are ever returned.
 */
export const getPublishedInvitation = cache(async (slug: string): Promise<PublicInvitation | null> => {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length > 60) return null;
  const invitation = await getDb().invitation.findFirst({
    where: { slug, status: "PUBLISHED", wedding: { deletedAt: null } },
    select: {
      weddingId: true,
      slug: true,
      themeCode: true,
      themeOptions: true,
      coverImageId: true,
      coverImage: { select: { variants: true } },
      musicAssetId: true,
      musicEnabled: true,
      musicVolume: true,
      defaultGuestLabel: true,
      giftAddress: true,
      wedding: {
        select: {
          brideName: true,
          groomName: true,
          coupleDisplayFormat: true,
          customDisplayName: true,
          weddingDate: true,
          timeZone: true,
          weddingEvents: {
            orderBy: [{ sortOrder: "asc" }, { eventDate: "asc" }],
            select: {
              id: true,
              name: true,
              eventDate: true,
              startTime: true,
              endTime: true,
              venueName: true,
              address: true,
              latitude: true,
              longitude: true,
              mapsUrl: true,
              dressCode: true,
              notes: true,
              sortOrder: true,
            },
          },
        },
      },
      sections: {
        where: { enabled: true },
        orderBy: { sortOrder: "asc" },
        select: { id: true, type: true, content: true },
      },
      loveStoryEntries: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: { id: true, title: true, timeLabel: true, story: true, imageId: true },
      },
      galleryImages: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: { id: true, caption: true, asset: { select: { id: true, width: true, height: true, variants: true } } },
      },
      giftAccounts: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: { id: true, type: true, providerName: true, accountNumber: true, accountHolder: true, notes: true },
      },
    },
  });
  if (!invitation) return null;
  // A published page stays up only while the wedding still has invitation access (e.g. not refunded).
  if (!(await weddingHasFeature(invitation.weddingId, "invitation"))) return null;

  const { wedding } = invitation;
  return {
    slug: invitation.slug,
    themeCode: invitation.themeCode,
    coverLayout: coverLayoutOf(invitation.themeOptions, invitation.themeCode),
    coupleName: formatCoupleName({
      brideName: wedding.brideName,
      groomName: wedding.groomName,
      format: wedding.coupleDisplayFormat,
      customDisplayName: wedding.customDisplayName,
    }),
    brideName: wedding.brideName,
    groomName: wedding.groomName,
    weddingDateIso: dbDateToIso(wedding.weddingDate),
    timeZone: wedding.timeZone,
    defaultGuestLabel: invitation.defaultGuestLabel,
    coverImageId: invitation.coverImageId,
    coverImageWidths: variantWidths(invitation.coverImage?.variants),
    music:
      invitation.musicEnabled && invitation.musicAssetId
        ? { assetId: invitation.musicAssetId, volume: invitation.musicVolume }
        : null,
    giftAddress: invitation.giftAddress,
    sections: invitation.sections.map((section) => ({
      id: section.id,
      type: section.type as InvitationSectionTypeValue,
      content: parseSectionContent(section.type as InvitationSectionTypeValue, section.content) as Record<string, string | null>,
    })),
    events: wedding.weddingEvents.map((event) => ({
      ...event,
      latitude: event.latitude === null ? null : Number(event.latitude),
      longitude: event.longitude === null ? null : Number(event.longitude),
    })),
    loveStory: invitation.loveStoryEntries,
    // Gallery rows only ever point at images, which always carry dimensions (CHECK constraint).
    gallery: invitation.galleryImages.flatMap((image) =>
      image.asset.width && image.asset.height
        ? [
            {
              id: image.id,
              assetId: image.asset.id,
              caption: image.caption,
              width: image.asset.width,
              height: image.asset.height,
              widths: variantWidths(image.asset.variants),
            },
          ]
        : [],
    ),
    giftAccounts: invitation.giftAccounts.map((account) => ({ ...account, type: account.type as GiftAccountTypeValue })),
  };
});

/** Only widths reach the page; storage keys stay on the server. */
function variantWidths(value: unknown): number[] {
  return parseImageVariants(value).map((variant) => variant.width);
}

export type GuestGreeting = { invitationName: string; seatCount: number };

/**
 * Resolves a personalized link. Only the guest's own display name and seat count are returned —
 * never their phone, email, RSVP history or anything about other guests.
 */
export async function getInvitationForGuestToken(
  token: string,
  now: Date = new Date(),
): Promise<{ invitation: PublicInvitation; guest: GuestGreeting; weddingId: string } | null> {
  if (!/^[A-Za-z0-9_-]{16,32}$/.test(token)) return null;
  const guest = await getDb().guest.findUnique({
    where: { invitationToken: token },
    select: {
      id: true,
      weddingId: true,
      invitationName: true,
      seatCount: true,
      invitationStatus: true,
      invitationOpenedAt: true,
      wedding: { select: { invitation: { select: { slug: true, status: true } } } },
    },
  });
  const slug = guest?.wedding.invitation?.slug;
  if (!guest || !slug || guest.wedding.invitation?.status !== "PUBLISHED") return null;

  const invitation = await getPublishedInvitation(slug);
  if (!invitation) return null;

  await markInvitationOpened(guest.id, guest.invitationOpenedAt, now);
  return {
    invitation,
    guest: { invitationName: guest.invitationName, seatCount: guest.seatCount },
    weddingId: guest.weddingId,
  };
}

/**
 * First open flips "Terkirim" to "Dibuka". It never overwrites a follow-up the planner set by hand,
 * and it only writes once per guest.
 */
async function markInvitationOpened(guestId: string, openedAt: Date | null, now: Date): Promise<void> {
  if (openedAt) return;
  const db = getDb();
  await db.$transaction([
    db.guest.updateMany({ where: { id: guestId, invitationOpenedAt: null }, data: { invitationOpenedAt: now } }),
    db.guest.updateMany({
      where: { id: guestId, invitationStatus: { in: ["NOT_SENT", "SENT"] } },
      data: { invitationStatus: "OPENED" },
    }),
  ]);
}
