import { describe, expect, it } from "vitest";
import { describeActivity } from "@/lib/activity";
import { budgetWarningLevel, expensePaymentState, percentOf, summarizeBudget } from "@/lib/budget";
import { DEFAULT_EXPENSE_FILTERS, expensesHref, parseExpenseFilters } from "@/lib/budget-filters";

const M = 1_000_000n;

describe("expensePaymentState (outstanding = total - SUM(payments))", () => {
  it("covers unpaid, partial and paid", () => {
    expect(expensePaymentState(30n * M, 0n)).toEqual({ outstanding: 30n * M, status: "unpaid" });
    expect(expensePaymentState(30n * M, 10n * M)).toEqual({ outstanding: 20n * M, status: "partial" });
    expect(expensePaymentState(30n * M, 30n * M)).toEqual({ outstanding: 0n, status: "paid" });
  });

  it("never reports a negative outstanding amount", () => {
    expect(expensePaymentState(10n, 11n)).toEqual({ outstanding: 0n, status: "paid" });
  });

  it("is exact for amounts beyond Number.MAX_SAFE_INTEGER", () => {
    const total = 999_999_999_999_999n;
    expect(expensePaymentState(total, 1n).outstanding).toBe(999_999_999_999_998n);
  });
});

describe("percentOf", () => {
  it("floors and handles zero bases", () => {
    expect(percentOf(30n * M, 35n * M)).toBe(85);
    expect(percentOf(1n, 3n)).toBe(33);
    expect(percentOf(5n, 0n)).toBeNull();
  });
});

describe("budgetWarningLevel", () => {
  it("warns at the threshold and flags spend above the limit", () => {
    expect(budgetWarningLevel(79n, 100n, 80)).toBe("none");
    expect(budgetWarningLevel(80n, 100n, 80)).toBe("near");
    expect(budgetWarningLevel(100n, 100n, 80)).toBe("near");
    expect(budgetWarningLevel(101n, 100n, 80)).toBe("over");
  });

  it("respects a configurable threshold", () => {
    expect(budgetWarningLevel(85n, 100n, 90)).toBe("none");
    expect(budgetWarningLevel(90n, 100n, 90)).toBe("near");
  });

  it("treats spending without an allocation as over, and nothing as none", () => {
    expect(budgetWarningLevel(1n, 0n, 80)).toBe("over");
    expect(budgetWarningLevel(0n, 0n, 80)).toBe("none");
  });
});

describe("summarizeBudget", () => {
  it("matches the PRD example: Rp100jt target, Rp30jt contract, Rp10jt DP", () => {
    const totals = summarizeBudget(
      100n * M,
      [
        { allocated: 35n * M, committed: 30n * M, paid: 10n * M },
        { allocated: 25n * M, committed: 0n, paid: 0n },
      ],
      80,
    );
    expect(totals).toEqual({
      target: 100n * M,
      allocated: 60n * M,
      committed: 30n * M,
      paid: 10n * M,
      unpaid: 20n * M,
      remaining: 70n * M,
      unallocated: 40n * M,
      warning: "none",
      overAllocated: false,
    });
  });

  it("flags over-allocation and over-commitment", () => {
    const totals = summarizeBudget(50n * M, [{ allocated: 60n * M, committed: 55n * M, paid: 0n }], 80);
    expect(totals.overAllocated).toBe(true);
    expect(totals.warning).toBe("over");
    expect(totals.remaining).toBe(-5n * M);
  });

  it("has no remaining/warnings without a target", () => {
    const totals = summarizeBudget(null, [{ allocated: 0n, committed: 5n, paid: 5n }], 80);
    expect(totals).toMatchObject({ remaining: null, unallocated: null, warning: "none", overAllocated: false, unpaid: 0n });
  });
});

describe("expense filters", () => {
  it("falls back to defaults and round-trips", () => {
    expect(parseExpenseFilters({ status: "x", sort: "y", category: "z", page: "0" })).toEqual(DEFAULT_EXPENSE_FILTERS);
    expect(expensesHref(DEFAULT_EXPENSE_FILTERS)).toBe("/budget/expenses");
    const href = expensesHref(DEFAULT_EXPENSE_FILTERS, { status: "outstanding", q: "catering 50%", page: 2 });
    const params = Object.fromEntries(new URL(href, "http://x").searchParams);
    expect(parseExpenseFilters(params)).toMatchObject({ status: "outstanding", q: "catering 50%", page: 2 });
  });
});

describe("budget activity descriptions", () => {
  it("shows amounts in rupiah (PRD: partner recorded payment Rp2.000.000)", () => {
    const text = describeActivity({
      action: "payment.recorded",
      actorName: "Putri",
      metadata: { title: "ABC Catering", amount: "2000000" },
    });
    expect(text.replace(/ /g, " ")).toBe("Putri mencatat pembayaran Rp 2.000.000 untuk “ABC Catering”");
  });

  it("ignores malformed amounts", () => {
    expect(describeActivity({ action: "payment.recorded", actorName: "Putri", metadata: { amount: "12abc" } })).toBe(
      "Putri mencatat pembayaran",
    );
  });
});
