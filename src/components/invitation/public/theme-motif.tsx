import type { ThemeMotif } from "@/lib/invitation-themes";

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
