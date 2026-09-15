import { z } from "zod";
import { VENDOR_RESEARCH_STATUSES, type VendorResearchStatusValue } from "@/lib/vendors";

export const VENDOR_PAGE_SIZE = 30;

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parsePage(value: string | undefined): number {
  const page = Number.parseInt(value ?? "", 10);
  return Number.isInteger(page) && page >= 1 ? Math.min(page, 10_000) : 1;
}

function parseCategory(value: string | undefined): string | null {
  return value && z.uuid().safeParse(value).success ? value : null;
}

/** "active" hides rejected candidates; any single status can also be chosen. */
export const RESEARCH_VIEWS = ["active", ...VENDOR_RESEARCH_STATUSES, "all"] as const;
export type ResearchView = "active" | "all" | VendorResearchStatusValue;

export type ResearchFilters = { view: ResearchView; categoryId: string | null; q: string; page: number };
export const DEFAULT_RESEARCH_FILTERS: ResearchFilters = { view: "active", categoryId: null, q: "", page: 1 };

export function parseResearchFilters(params: SearchParams): ResearchFilters {
  const view = first(params.view);
  return {
    view: (RESEARCH_VIEWS as readonly string[]).includes(view ?? "") ? (view as ResearchView) : "active",
    categoryId: parseCategory(first(params.category)),
    q: (first(params.q) ?? "").trim().slice(0, 100),
    page: parsePage(first(params.page)),
  };
}

export function researchHref(filters: ResearchFilters, overrides: Partial<ResearchFilters> = {}): string {
  const merged = { ...filters, ...overrides };
  const search = new URLSearchParams();
  if (merged.view !== "active") search.set("view", merged.view);
  if (merged.categoryId) search.set("category", merged.categoryId);
  if (merged.q) search.set("q", merged.q);
  if (merged.page > 1) search.set("page", String(merged.page));
  const query = search.toString();
  return query ? `/vendors/research?${query}` : "/vendors/research";
}

export type VendorFilters = { categoryId: string | null; q: string; page: number };
export const DEFAULT_VENDOR_FILTERS: VendorFilters = { categoryId: null, q: "", page: 1 };

export function parseVendorFilters(params: SearchParams): VendorFilters {
  return {
    categoryId: parseCategory(first(params.category)),
    q: (first(params.q) ?? "").trim().slice(0, 100),
    page: parsePage(first(params.page)),
  };
}

export function vendorsHref(filters: VendorFilters, overrides: Partial<VendorFilters> = {}): string {
  const merged = { ...filters, ...overrides };
  const search = new URLSearchParams();
  if (merged.categoryId) search.set("category", merged.categoryId);
  if (merged.q) search.set("q", merged.q);
  if (merged.page > 1) search.set("page", String(merged.page));
  const query = search.toString();
  return query ? `/vendors?${query}` : "/vendors";
}

/** Compare ids from `?ids=a&ids=b` or `?ids=a,b`; unique, valid UUIDs only. */
export function parseCompareIds(value: string | string[] | undefined, max: number): string[] {
  const raw = (Array.isArray(value) ? value : value ? [value] : []).flatMap((item) => item.split(","));
  const ids = raw.map((item) => item.trim()).filter((item) => z.uuid().safeParse(item).success);
  return [...new Set(ids)].slice(0, max);
}
