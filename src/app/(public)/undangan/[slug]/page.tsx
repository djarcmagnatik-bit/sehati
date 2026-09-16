import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { InvitationView } from "@/components/invitation/public/invitation-view";
import { formatRelativeTime } from "@/lib/activity";
import { formatIsoDateLong } from "@/lib/dates";
import { getPublishedInvitation } from "@/server/invitation/public-invitation-service";
import { listPublicWishesBySlug } from "@/server/rsvp/wish-service";

type PageProps = {
  params: Promise<{ slug: string }>;
  /** `?to=Bapak+Ahmad` addresses the invitation without exposing any stored guest data. */
  searchParams: Promise<{ to?: string | string[] }>;
};

function guestFromQuery(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const name = raw?.replace(/\s+/g, " ").trim().slice(0, 120);
  return name ? name : null;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const invitation = await getPublishedInvitation(slug);
  if (!invitation) return { title: "Undangan tidak ditemukan", robots: { index: false, follow: false } };

  const title = `Undangan Pernikahan ${invitation.coupleName}`;
  const description = `${invitation.coupleName} — ${formatIsoDateLong(invitation.weddingDateIso)}`;
  return {
    title,
    description,
    alternates: { canonical: `/undangan/${invitation.slug}` },
    openGraph: { title, description, type: "website" },
    // Anyone with the link can open it, but a wedding invitation has no business in search results.
    robots: { index: false, follow: false },
  };
}

export default async function PublicInvitationPage({ params, searchParams }: PageProps) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const invitation = await getPublishedInvitation(slug);
  // Drafts and unknown slugs look identical from outside.
  if (!invitation) notFound();

  const now = new Date();
  const wishes = await listPublicWishesBySlug(slug);
  return (
    <InvitationView
      invitation={invitation}
      guestName={guestFromQuery(query.to)}
      wishes={wishes.map((wish) => ({
        id: wish.id,
        name: wish.name,
        message: wish.message,
        createdAtIso: wish.createdAt.toISOString(),
        timeLabel: formatRelativeTime(wish.createdAt, now, invitation.timeZone),
      }))}
      now={now}
    />
  );
}
