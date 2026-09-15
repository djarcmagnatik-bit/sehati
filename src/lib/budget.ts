/**
 * Deterministic budget arithmetic on whole-rupiah bigints (never floating point).
 */

export const PAYMENT_METHODS = ["BANK_TRANSFER", "CASH", "E_WALLET", "CARD", "OTHER"] as const;
export type PaymentMethodValue = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABEL: Record<PaymentMethodValue, string> = {
  BANK_TRANSFER: "Transfer bank",
  CASH: "Tunai",
  E_WALLET: "E-wallet",
  CARD: "Kartu",
  OTHER: "Lainnya",
};

export const DEFAULT_BUDGET_WARNING_PERCENT = 80;

export type ExpensePaymentStatus = "unpaid" | "partial" | "paid";

export const EXPENSE_STATUS_LABEL: Record<ExpensePaymentStatus, string> = {
  unpaid: "Belum dibayar",
  partial: "Dibayar sebagian",
  paid: "Lunas",
};

/** outstanding = total - paid (the core invariant); payments never exceed the total. */
export function expensePaymentState(
  totalAmount: bigint,
  paidAmount: bigint,
): { outstanding: bigint; status: ExpensePaymentStatus } {
  const outstanding = totalAmount > paidAmount ? totalAmount - paidAmount : 0n;
  const status: ExpensePaymentStatus = paidAmount <= 0n ? "unpaid" : outstanding === 0n ? "paid" : "partial";
  return { outstanding, status };
}

/** Floor percentage of part/whole; null when whole is not positive. */
export function percentOf(part: bigint, whole: bigint): number | null {
  if (whole <= 0n) return null;
  return Number((part * 100n) / whole);
}

export type BudgetWarningLevel = "none" | "near" | "over";

/**
 * "over" when usage exceeds the limit, "near" when it reaches thresholdPercent of the limit.
 * Spending in a category without allocation counts as over.
 */
export function budgetWarningLevel(used: bigint, limit: bigint, thresholdPercent: number): BudgetWarningLevel {
  if (used > limit) return "over";
  if (used <= 0n) return "none";
  if (used * 100n >= limit * BigInt(thresholdPercent)) return "near";
  return "none";
}

export type CategoryBudgetFigures = { allocated: bigint; committed: bigint; paid: bigint };

export type BudgetTotals = {
  target: bigint | null;
  allocated: bigint;
  committed: bigint;
  paid: bigint;
  unpaid: bigint;
  /** target - committed; null without a target. Negative means over budget. */
  remaining: bigint | null;
  /** target - allocated; null without a target. */
  unallocated: bigint | null;
  warning: BudgetWarningLevel;
  overAllocated: boolean;
};

export function summarizeBudget(
  target: bigint | null,
  categories: readonly CategoryBudgetFigures[],
  thresholdPercent: number,
): BudgetTotals {
  let allocated = 0n;
  let committed = 0n;
  let paid = 0n;
  for (const category of categories) {
    allocated += category.allocated;
    committed += category.committed;
    paid += category.paid;
  }
  return {
    target,
    allocated,
    committed,
    paid,
    unpaid: committed - paid,
    remaining: target === null ? null : target - committed,
    unallocated: target === null ? null : target - allocated,
    warning: target === null ? "none" : budgetWarningLevel(committed, target, thresholdPercent),
    overAllocated: target !== null && allocated > target,
  };
}
