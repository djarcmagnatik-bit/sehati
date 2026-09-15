import { EXPENSE_STATUS_LABEL, type BudgetWarningLevel, type ExpensePaymentStatus } from "@/lib/budget";
import { cn } from "@/lib/cn";

const BADGE = "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium";

export function BudgetWarningBadge({ level }: { level: BudgetWarningLevel }) {
  if (level === "none") return null;
  return level === "over" ? (
    <span className={cn(BADGE, "bg-danger-50 text-danger-600")}>⚠ Melebihi alokasi</span>
  ) : (
    <span className={cn(BADGE, "bg-clay-100 text-clay-700")}>⚠ Mendekati batas</span>
  );
}

const STATUS_CLASS: Record<ExpensePaymentStatus, string> = {
  paid: "bg-success-50 text-success-700",
  partial: "bg-clay-100 text-clay-700",
  unpaid: "bg-cream-100 text-ink-700",
};

export function PaymentStatusBadge({ status }: { status: ExpensePaymentStatus }) {
  return (
    <span className={cn(BADGE, STATUS_CLASS[status])}>
      {status === "paid" ? <span aria-hidden="true">✓</span> : null}
      {EXPENSE_STATUS_LABEL[status]}
    </span>
  );
}
