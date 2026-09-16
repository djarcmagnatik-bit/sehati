import { cn } from "@/lib/cn";
import {
  GUEST_INVITATION_LABEL,
  GUEST_RSVP_LABEL,
  type GuestInvitationStatusValue,
  type GuestRsvpStatusValue,
} from "@/lib/guests";

const BADGE = "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium";

const RSVP_CLASS: Record<GuestRsvpStatusValue, string> = {
  ATTENDING: "bg-success-50 text-success-700",
  MAYBE: "bg-clay-100 text-clay-700",
  DECLINED: "bg-cream-100 text-ink-500",
  PENDING: "bg-cream-100 text-ink-700",
};

export function RsvpBadge({ status, attendingCount }: { status: GuestRsvpStatusValue; attendingCount: number }) {
  const count = (status === "ATTENDING" || status === "MAYBE") && attendingCount > 0 ? ` · ${attendingCount} orang` : "";
  return (
    <span className={cn(BADGE, RSVP_CLASS[status])}>
      {status === "ATTENDING" ? <span aria-hidden="true">✓</span> : null}
      {GUEST_RSVP_LABEL[status]}
      {count}
    </span>
  );
}

const INVITATION_CLASS: Record<GuestInvitationStatusValue, string> = {
  NOT_SENT: "bg-white text-ink-500 ring-1 ring-cream-300",
  SENT: "bg-sage-50 text-sage-700",
  OPENED: "bg-sage-100 text-sage-700",
  FOLLOW_UP: "bg-danger-50 text-danger-600",
};

export function InvitationStatusBadge({ status }: { status: GuestInvitationStatusValue }) {
  return <span className={cn(BADGE, INVITATION_CLASS[status])}>{GUEST_INVITATION_LABEL[status]}</span>;
}
