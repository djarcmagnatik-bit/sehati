import Link from "next/link";
import type { ReactNode } from "react";
import { buttonClassName } from "@/components/ui/button";
import type { PaymentStatusValue } from "@/lib/billing";
import { cn } from "@/lib/cn";

export const ADMIN_INPUT_CLASS =
  "block min-h-11 w-full rounded-xl border border-cream-300 bg-white px-3 text-base text-ink-900 focus:outline-2 focus:outline-offset-1 focus:outline-clay-600";

export function AdminPageHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-3xl font-semibold">{title}</h1>
        {description ? <p className="mt-1 text-ink-700">{description}</p> : null}
      </div>
      {action}
    </header>
  );
}

/** Wide tables scroll inside their own box so the page itself never scrolls sideways. */
export function AdminTable({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-3xl border border-cream-200 bg-white">
      <table className="w-full min-w-[44rem] text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        {children}
      </table>
    </div>
  );
}

export function Th({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <th scope="col" className={cn("border-b border-cream-200 px-3 py-2 font-medium text-ink-500", className)}>
      {children}
    </th>
  );
}

export function Td({ children, className, colSpan }: { children: ReactNode; className?: string; colSpan?: number }) {
  return (
    <td colSpan={colSpan} className={cn("border-b border-cream-200 px-3 py-2 align-top", className)}>
      {children}
    </td>
  );
}

/** Shown in place of rows when a list is empty. */
export function EmptyRow({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr>
      <Td colSpan={colSpan} className="py-6 text-center text-ink-500">
        {children}
      </Td>
    </tr>
  );
}

const NOTICE_TONE = "rounded-2xl border px-4 py-3 text-sm";

/** Result banner after a redirecting admin action (`?notice=...`). Unknown keys render nothing. */
export function Notice({ notice, messages }: { notice: string; messages: Record<string, { tone: "success" | "error"; text: string }> }) {
  const entry = Object.hasOwn(messages, notice) ? messages[notice] : undefined;
  if (!entry) return null;
  return (
    <p
      role={entry.tone === "error" ? "alert" : "status"}
      className={cn(
        NOTICE_TONE,
        entry.tone === "error" ? "border-danger-600/30 bg-danger-50 text-danger-600" : "border-success-700/30 bg-success-50 text-success-700",
      )}
    >
      {entry.text}
    </p>
  );
}

export function Badge({ tone = "neutral", children }: { tone?: "neutral" | "good" | "warn" | "bad"; children: ReactNode }) {
  const tones = {
    neutral: "bg-cream-100 text-ink-700",
    good: "bg-success-50 text-success-700",
    warn: "bg-clay-50 text-clay-700",
    bad: "bg-danger-50 text-danger-600",
  } as const;
  return <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap", tones[tone])}>{children}</span>;
}

export function Pagination({
  page,
  pageSize,
  total,
  href,
}: {
  page: number;
  pageSize: number;
  total: number;
  href: (page: number) => string;
}) {
  const last = Math.max(1, Math.ceil(total / pageSize));
  if (last <= 1) return <p className="text-sm text-ink-500">{total.toLocaleString("id-ID")} data</p>;
  return (
    <nav aria-label="Halaman" className="flex flex-wrap items-center justify-between gap-3">
      {page > 1 ? (
        <Link href={href(page - 1)} className={buttonClassName("secondary", "min-h-10")}>
          ← Sebelumnya
        </Link>
      ) : (
        <span />
      )}
      <span className="text-sm text-ink-500">
        Halaman {page} dari {last} · {total.toLocaleString("id-ID")} data
      </span>
      {page < last ? (
        <Link href={href(page + 1)} className={buttonClassName("secondary", "min-h-10")}>
          Berikutnya →
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}

/** Builds "/admin/users?q=x&page=2" from the non-empty filter values. */
export function adminHref(path: string, params: Record<string, string | number | null | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === "" || value === "all" || (key === "page" && value === 1)) continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

export function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

export function pageParam(value: string | string[] | undefined): number {
  const page = Number.parseInt(first(value), 10);
  return Number.isInteger(page) && page >= 1 ? page : 1;
}

export const PAYMENT_STATUS_TONE: Record<PaymentStatusValue, "neutral" | "good" | "warn" | "bad"> = {
  PENDING: "warn",
  PAID: "good",
  FAILED: "bad",
  EXPIRED: "neutral",
  REFUNDED: "neutral",
};
