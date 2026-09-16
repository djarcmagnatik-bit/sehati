import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { InvitationView } from "@/components/invitation/public/invitation-view";
import { getInvitationForGuestToken } from "@/server/invitation/public-invitation-service";

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

  return (
    <InvitationView
      invitation={result.invitation}
      guestName={result.guest.invitationName}
      guestSeatCount={result.guest.seatCount}
      now={new Date()}
    />
  );
}
