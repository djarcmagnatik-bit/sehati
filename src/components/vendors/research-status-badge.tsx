import { cn } from "@/lib/cn";
import { VENDOR_RESEARCH_STATUS_LABEL, type VendorResearchStatusValue } from "@/lib/vendors";

const STATUS_CLASS: Record<VendorResearchStatusValue, string> = {
  RESEARCHING: "bg-cream-100 text-ink-700",
  CONTACTED: "bg-cream-100 text-ink-700",
  MEETING: "bg-clay-50 text-clay-700",
  SHORTLISTED: "bg-clay-100 text-clay-700",
  REJECTED: "bg-cream-100 text-ink-500 line-through",
  SELECTED: "bg-success-50 text-success-700",
};

export function ResearchStatusBadge({ status }: { status: VendorResearchStatusValue }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", STATUS_CLASS[status])}>
      {status === "SELECTED" ? <span aria-hidden="true">✓</span> : null}
      {VENDOR_RESEARCH_STATUS_LABEL[status]}
    </span>
  );
}
