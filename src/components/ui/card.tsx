import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Card({
  title,
  description,
  children,
  className,
}: {
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-3xl border border-cream-200 bg-white p-5 shadow-sm shadow-ink-900/[0.03] sm:p-6", className)}>
      {title ? <h2 className="font-display text-xl font-semibold text-ink-900">{title}</h2> : null}
      {description ? <p className="mt-1 text-sm text-ink-500">{description}</p> : null}
      <div className={title || description ? "mt-4" : undefined}>{children}</div>
    </section>
  );
}
