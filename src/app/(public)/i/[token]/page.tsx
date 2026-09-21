import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { InvitationView } from "@/components/invitation/public/invitation-view";
import { formatRelativeTime } from "@/lib/activity";
import { getInvitationForGuestToken } from "@/server/invitation/public-invitation-service";
import { getRsvpGuestByToken } from "@/server/rsvp/rsvp-service";
import { listPublicWishes } from "@/server/rsvp/wish-service";

type PageProps = { params: Promise<{ token: string }> };

/** Personalized links are never indexed: the URL identifies one guest. */
export const metadata: Metadata = {
  title: "Undangan Pernikahan",
  robots: { index: false, follow: false },
};

export default async function GuestInvitationPage({ params }: PageProps) {
  const { token } = await params;
  const result = await getInvitationForGuestToken(token);
  if (!result) notFound();

  const now = new Date();
  const [rsvpGuest, wishes] = await Promise.all([getRsvpGuestByToken(token), listPublicWishes(result.weddingId)]);

  return (
    <InvitationView
      invitation={result.invitation}
      guestName={result.guest.invitationName}
      guestSeatCount={result.guest.seatCount}
      rsvp={
        rsvpGuest
          ? {
              token,
              invitationName: rsvpGuest.invitationName,
              seatCount: rsvpGuest.seatCount,
              askAttendingCount: rsvpGuest.askAttendingCount,
              rsvpStatus: rsvpGuest.rsvpStatus,
              attendingCount: rsvpGuest.attendingCount,
              attendeeNames: rsvpGuest.attendeeNames,
              message: rsvpGuest.message,
            }
          : null
      }
      wishes={wishes.map((wish) => ({
        id: wish.id,
        name: wish.name,
        message: wish.message,
        createdAtIso: wish.createdAt.toISOString(),
        timeLabel: formatRelativeTime(wish.createdAt, now, result.invitation.timeZone),
      }))}
      now={now}
    />
  );
}
