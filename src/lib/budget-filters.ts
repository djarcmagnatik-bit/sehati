import { z } from "zod";

export const EXPENSE_STATUS_FILTERS = ["all", "outstanding", "paid"] as const;
export type ExpenseStatusFilter = (typeof EXPENSE_STATUS_FILTERS)[number];

export const EXPENSE_STATUS_FILTER_LABEL: Record<ExpenseStatusFilter, string> = {
  all: "Semua",
  outstanding: "Belum lunas",
  paid: "Lunas",
};

export const EXPENSE_SORTS = ["due", "recent", "amount", "outstanding"] as const;
export type ExpenseSort = (typeof EXPENSE_SORTS)[number];

export const EXPENSE_SORT_LABEL: Record<ExpenseSort, string> = {
  due: "Jatuh tempo terdekat",
  recent: "Terbaru",
  amount: "Nilai terbesar",
  outstanding: "Sisa tagihan terbesar",
};

export const EXPENSE_PAGE_SIZE = 30;

export type ExpenseFilters = {
  status: ExpenseStatusFilter;
  categoryId: string | null;
  q: string;
  sort: ExpenseSort;
  page: number;
};

export const DEFAULT_EXPENSE_FILTERS: ExpenseFilters = { status: "all", categoryId: null, q: "", sort: "due", page: 1 };

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function parseExpenseFilters(params: SearchParams): ExpenseFilters {
  const status = first(params.status);
  const sort = first(params.sort);
  const category = first(params.category);
  const page = Number.parseInt(first(params.page) ?? "", 10);
  return {
    status: (EXPENSE_STATUS_FILTERS as readonly string[]).includes(status ?? "") ? (status as ExpenseStatusFilter) : "all",
    sort: (EXPENSE_SORTS as readonly string[]).includes(sort ?? "") ? (sort as ExpenseSort) : "due",
    categoryId: category && z.uuid().safeParse(category).success ? category : null,
    q: (first(params.q) ?? "").trim().slice(0, 100),
    page: Number.isInteger(page) && page >= 1 ? Math.min(page, 10_000) : 1,
  };
}

export function expensesHref(filters: ExpenseFilters, overrides: Partial<ExpenseFilters> = {}): string {
  const merged = { ...filters, ...overrides };
  const search = new URLSearchParams();
  if (merged.status !== DEFAULT_EXPENSE_FILTERS.status) search.set("status", merged.status);
  if (merged.categoryId) search.set("category", merged.categoryId);
  if (merged.q) search.set("q", merged.q);
  if (merged.sort !== DEFAULT_EXPENSE_FILTERS.sort) search.set("sort", merged.sort);
  if (merged.page > 1) search.set("page", String(merged.page));
  const query = search.toString();
  return query ? `/budget/expenses?${query}` : "/budget/expenses";
}
