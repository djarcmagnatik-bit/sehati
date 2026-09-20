import type { ThemeMotif } from "@/lib/invitation-themes";

/**
 * A line-drawn botanical sprig for the cover corners (top-left, and mirrored bottom-right). It sways
 * a few degrees on a slow loop; the global reduced-motion rule stops that.
 */
export function CornerSprigs() {
  const sprig = (
    <svg viewBox="0 0 160 160" className="size-full" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4c30 20 60 50 86 96" strokeWidth="1.6" />
      <path d="M22 16c-2-10 4-16 12-14-1 8-6 12-12 14z" strokeWidth="1.2" />
      <path d="M38 30c10-6 18-2 20 6-8 2-15 0-20-6z" strokeWidth="1.2" />
      <path d="M48 44c-4-10 1-17 9-17 0 8-4 14-9 17z" strokeWidth="1.2" />
      <path d="M62 60c10-4 17 1 18 9-8 1-14-3-18-9z" strokeWidth="1.2" />
      <path d="M70 76c-6-9-2-17 6-18 1 8-2 14-6 18z" strokeWidth="1.2" />
      <path d="M8 26c8-6 16-6 20 0M16 40c6-3 12-2 15 2" strokeWidth="1" opacity="0.7" />
      <circle cx="92" cy="104" r="3" fill="currentColor" stroke="none" opacity="0.7" />
      <circle cx="84" cy="96" r="2" fill="currentColor" stroke="none" opacity="0.5" />
    </svg>
  );
  return (
    <>
      <div aria-hidden="true" className="inv-sway pointer-events-none absolute left-0 top-0 size-28 origin-top-left sm:size-36" style={{ color: "var(--inv-accent)", opacity: 0.55 }}>
        {sprig}
      </div>
      <div
        aria-hidden="true"
        className="inv-sway pointer-events-none absolute bottom-0 right-0 size-28 origin-bottom-right rotate-180 sm:size-36"
        style={{ color: "var(--inv-accent)", opacity: 0.55, animationDelay: "-3s" }}
      >
        {sprig}
      </div>
    </>
  );
}

/**
 * The theme's small decoration: under section headings, and above the cover title for the non-line
 * motifs. Inline SVG in the accent color, so it scales crisply and costs no request. Decorative only.
 */
export function ThemeMotifMark({ motif, className = "" }: { motif: ThemeMotif; className?: string }) {
  if (motif === "line") {
    return <div aria-hidden="true" className={`mx-auto h-px w-32 ${className}`} style={{ background: "var(--inv-ornament)" }} />;
  }
  return (
    <svg aria-hidden="true" viewBox="0 0 120 24" className={`mx-auto h-6 w-28 ${className}`} style={{ color: "var(--inv-accent)" }}>
      {motif === "bow" ? (
        <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M60 12c-6-8-17-9-18-3s10 7 18 3z" />
          <path d="M60 12c6-8 17-9 18-3s-10 7-18 3z" />
          <circle cx="60" cy="12" r="2.2" fill="currentColor" />
          <path d="M58.5 13.5 52 23M61.5 13.5 68 23" />
          <path d="M8 12h26M86 12h26" strokeWidth="1" opacity="0.6" />
        </g>
      ) : motif === "squiggle" ? (
        <path
          d="M6 14c6-8 10 8 16 0s10 8 16 0 10 8 16 0 10 8 16 0 10 8 16 0 10 8 16 0 10 8 12 2"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      ) : motif === "sprig" ? (
        <g fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
          <path d="M14 12h32M74 12h32" opacity="0.5" />
          <path d="M48 12c4-1 8-1 12 0s8 1 12 0" />
          <path d="M54 12c-2-4-1-7 2-9M60 12c0-4 1-7 4-9M66 12c2-4 4-6 7-7" />
          <path d="M54 12c-2 4-1 7 2 9M60 12c0 4 1 7 4 9M66 12c2 4 4 6 7 7" opacity="0.8" />
        </g>
      ) : motif === "sparkle" ? (
        <g fill="currentColor">
          <path d="M60 2l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" />
          <path d="M34 8l1.5 3.5L39 13l-3.5 1.5L34 18l-1.5-3.5L29 13l3.5-1.5z" opacity="0.7" />
          <path d="M86 8l1.5 3.5L91 13l-3.5 1.5L86 18l-1.5-3.5L81 13l3.5-1.5z" opacity="0.7" />
          <circle cx="16" cy="13" r="1.6" opacity="0.5" />
          <circle cx="104" cy="13" r="1.6" opacity="0.5" />
        </g>
      ) : (
        // film: a strip with sprocket holes
        <g>
          <rect x="4" y="3" width="112" height="18" rx="2" fill="currentColor" />
          {Array.from({ length: 12 }, (_, index) => (
            <g key={index} fill="var(--inv-background)">
              <rect x={8 + index * 9} y="5" width="4.5" height="3" rx="0.8" />
              <rect x={8 + index * 9} y="16" width="4.5" height="3" rx="0.8" />
            </g>
          ))}
        </g>
      )}
    </svg>
  );
}
