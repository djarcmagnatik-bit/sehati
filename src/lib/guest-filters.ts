import { z } from "zod";
import {
  GUEST_INVITATION_STATUSES,
  GUEST_RSVP_STATUSES,
  type GuestInvitationStatusValue,
  type GuestRsvpStatusValue,
} from "@/lib/guests";

export const GUEST_PAGE_SIZE = 50;

export const GUEST_SORTS = ["name", "group", "recent", "seats"] as const;
export type GuestSort = (typeof GUEST_SORTS)[number];
export const GUEST_SORT_LABEL: Record<GuestSort, string> = {
  name: "Nama undangan (A–Z)",
  group: "Grup",
  recent: "Terbaru ditambahkan",
  seats: "Kursi terbanyak",
};

export type GuestFilters = {
  rsvp: GuestRsvpStatusValue | "all";
  invitation: GuestInvitationStatusValue | "all";
  /** A group id, "none" for guests without a group, or null for all. */
  group: string | "none" | null;
  q: string;
  sort: GuestSort;
  page: number;
};

export const DEFAULT_GUEST_FILTERS: GuestFilters = { rsvp: "all", invitation: "all", group: null, q: "", sort: "name", page: 1 };

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function parseGuestFilters(params: SearchParams): GuestFilters {
  const rsvp = first(params.rsvp);
  const invitation = first(params.invitation);
  const group = first(params.group);
  const sort = first(params.sort);
  const page = Number.parseInt(first(params.page) ?? "", 10);
  return {
    rsvp: (GUEST_RSVP_STATUSES as readonly string[]).includes(rsvp ?? "") ? (rsvp as GuestRsvpStatusValue) : "all",
    invitation: (GUEST_INVITATION_STATUSES as readonly string[]).includes(invitation ?? "")
      ? (invitation as GuestInvitationStatusValue)
      : "all",
    group: group === "none" ? "none" : group && z.uuid().safeParse(group).success ? group : null,
    q: (first(params.q) ?? "").trim().slice(0, 100),
    sort: (GUEST_SORTS as readonly string[]).includes(sort ?? "") ? (sort as GuestSort) : "name",
    page: Number.isInteger(page) && page >= 1 ? Math.min(page, 10_000) : 1,
  };
}

export function guestsHref(filters: GuestFilters, overrides: Partial<GuestFilters> = {}): string {
  const merged = { ...filters, ...overrides };
  const search = new URLSearchParams();
  if (merged.rsvp !== "all") search.set("rsvp", merged.rsvp);
  if (merged.invitation !== "all") search.set("invitation", merged.invitation);
  if (merged.group) search.set("group", merged.group);
  if (merged.q) search.set("q", merged.q);
  if (merged.sort !== "name") search.set("sort", merged.sort);
  if (merged.page > 1) search.set("page", String(merged.page));
  const query = search.toString();
  return query ? `/guests?${query}` : "/guests";
}
