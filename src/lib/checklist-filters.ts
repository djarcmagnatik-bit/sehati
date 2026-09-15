import { z } from "zod";

export const CHECKLIST_VIEWS = ["open", "overdue", "COMPLETED", "CANCELLED", "all"] as const;
export type ChecklistView = (typeof CHECKLIST_VIEWS)[number];

export const CHECKLIST_VIEW_LABEL: Record<ChecklistView, string> = {
  open: "Aktif",
  overdue: "Terlambat",
  COMPLETED: "Selesai",
  CANCELLED: "Dibatalkan",
  all: "Semua",
};

export const CHECKLIST_SORTS = ["due", "priority", "title", "recent"] as const;
export type ChecklistSort = (typeof CHECKLIST_SORTS)[number];

export const CHECKLIST_SORT_LABEL: Record<ChecklistSort, string> = {
  due: "Tenggat terdekat",
  priority: "Prioritas tertinggi",
  title: "Judul (A–Z)",
  recent: "Terakhir diubah",
};

export const CHECKLIST_PAGE_SIZE = 50;
const MAX_QUERY_LENGTH = 100;
const MAX_PAGE = 10_000;

export type ChecklistFilters = {
  view: ChecklistView;
  categoryId: string | null;
  q: string;
  sort: ChecklistSort;
  page: number;
};

export const DEFAULT_CHECKLIST_FILTERS: ChecklistFilters = { view: "open", categoryId: null, q: "", sort: "due", page: 1 };

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Lenient parsing of URL search params: anything invalid falls back to the default. */
export function parseChecklistFilters(params: SearchParams): ChecklistFilters {
  const view = first(params.view);
  const sort = first(params.sort);
  const category = first(params.category);
  const page = Number.parseInt(first(params.page) ?? "", 10);

  return {
    view: (CHECKLIST_VIEWS as readonly string[]).includes(view ?? "") ? (view as ChecklistView) : "open",
    sort: (CHECKLIST_SORTS as readonly string[]).includes(sort ?? "") ? (sort as ChecklistSort) : "due",
    categoryId: category && z.uuid().safeParse(category).success ? category : null,
    q: (first(params.q) ?? "").trim().slice(0, MAX_QUERY_LENGTH),
    page: Number.isInteger(page) && page >= 1 ? Math.min(page, MAX_PAGE) : 1,
  };
}

/** Builds "/checklist?..." omitting default values. */
export function checklistHref(filters: ChecklistFilters, overrides: Partial<ChecklistFilters> = {}): string {
  const merged = { ...filters, ...overrides };
  const search = new URLSearchParams();
  if (merged.view !== DEFAULT_CHECKLIST_FILTERS.view) search.set("view", merged.view);
  if (merged.categoryId) search.set("category", merged.categoryId);
  if (merged.q) search.set("q", merged.q);
  if (merged.sort !== DEFAULT_CHECKLIST_FILTERS.sort) search.set("sort", merged.sort);
  if (merged.page > 1) search.set("page", String(merged.page));
  const query = search.toString();
  return query ? `/checklist?${query}` : "/checklist";
}
