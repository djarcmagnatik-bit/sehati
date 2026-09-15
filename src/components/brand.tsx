import Link from "next/link";
import { SITE } from "@/lib/site";

export function Brand({ href = "/" }: { href?: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2 rounded-full font-display text-xl font-semibold text-ink-900"
    >
      <svg aria-hidden="true" viewBox="0 0 32 32" className="size-7">
        <circle cx="12" cy="17" r="8" fill="none" strokeWidth="2.25" className="stroke-clay-600" />
        <circle cx="20" cy="15" r="8" fill="none" strokeWidth="2.25" className="stroke-sage-700" />
      </svg>
      <span>{SITE.name}</span>
    </Link>
  );
}
