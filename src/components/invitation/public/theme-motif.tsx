import type { CornerArt, ThemeMotif } from "@/lib/invitation-themes";

/** Motif color: the theme's own (e.g. gold), or its accent. The picker preview sets only some variables. */
const MOTIF_COLOR = "var(--inv-motif, var(--inv-accent))";

/** The theme's corner decoration on the cover and the opening cover, if it has one. */
export function CornerArtLayer({ art }: { art: CornerArt }) {
  if (art === "sprig") return <CornerSprigs />;
  if (art === "melati") return <CornerMelati />;
  return null;
}

/**
 * The siger, the Sundanese bridal crown, as a fan: blades radiate from a point below the mark and
 * stand on the curve of the headband, tallest in the middle. Angles in degrees from upright.
 */
const SIGER_PIVOT = { x: 60, y: 52 };
const SIGER_BAND_RADIUS = 30;
const SIGER_BLADES: Array<{ angle: number; length: number; half: number }> = [
  { angle: 0, length: 21, half: 3.6 },
  { angle: -13, length: 17, half: 3.1 },
  { angle: 13, length: 17, half: 3.1 },
  { angle: -26, length: 13, half: 2.6 },
  { angle: 26, length: 13, half: 2.6 },
  { angle: -39, length: 9, half: 2 },
  { angle: 39, length: 9, half: 2 },
];

/** A pointed blade standing on (0, 0) with its tip at (0, -length). */
function bladePath(length: number, half: number): string {
  const shoulder = -length * 0.5;
  return `M0 ${-length}C${half} ${shoulder} ${half * 0.85} -2 0 0C${-half * 0.85} -2 ${-half} ${shoulder} 0 ${-length}Z`;
}

/** A point on a circle around the siger's pivot. */
function sigerPoint(radius: number, angle: number): { x: number; y: number } {
  const radians = (angle * Math.PI) / 180;
  return { x: SIGER_PIVOT.x + radius * Math.sin(radians), y: SIGER_PIVOT.y - radius * Math.cos(radians) };
}

function SigerMark({ className, hero }: { className: string; hero: boolean }) {
  const bandFrom = sigerPoint(SIGER_BAND_RADIUS, -44);
  const bandTo = sigerPoint(SIGER_BAND_RADIUS, 44);
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 120 30"
      className={`mx-auto ${hero ? "h-12 w-48 sm:h-14 sm:w-56" : "h-8 w-32"} ${className}`}
      style={{ color: MOTIF_COLOR }}
    >
      <g fill="none" stroke="currentColor" strokeLinecap="round">
        <path d="M4 26.5h27M89 26.5h27" strokeWidth="0.9" opacity="0.45" />
        <path d={`M${bandFrom.x} ${bandFrom.y}A${SIGER_BAND_RADIUS} ${SIGER_BAND_RADIUS} 0 0 1 ${bandTo.x} ${bandTo.y}`} strokeWidth="1.5" />
      </g>
      {SIGER_BLADES.map(({ angle, length, half }) => (
        <g key={angle} transform={`translate(${SIGER_PIVOT.x} ${SIGER_PIVOT.y}) rotate(${angle}) translate(0 ${-SIGER_BAND_RADIUS})`}>
          <path d={bladePath(length, half)} fill="currentColor" opacity={1 - Math.abs(angle) / 110} />
          {/* A jewel set in each blade. */}
          <circle cy={-length * 0.42} r={half * 0.32} fill="var(--inv-background, #fff)" />
        </g>
      ))}
      {/* Beads along the lower edge of the headband, and one at each end of the side lines. */}
      <g fill="currentColor">
        {[-32, -19.5, -6.5, 6.5, 19.5, 32].map((angle) => {
          const bead = sigerPoint(SIGER_BAND_RADIUS - 2.6, angle);
          return <circle key={angle} cx={bead.x} cy={bead.y} r="0.9" opacity="0.75" />;
        })}
        <circle cx="31" cy="26.5" r="1.2" opacity="0.7" />
        <circle cx="89" cy="26.5" r="1.2" opacity="0.7" />
      </g>
    </svg>
  );
}

/** Jasmine strings hanging from the top edge: where each hangs (on a 110-wide box) and how long it is. */
const MELATI_STRANDS: Array<{ x: number; length: number }> = [
  { x: 12, length: 148 },
  { x: 34, length: 116 },
  { x: 56, length: 84 },
  { x: 78, length: 56 },
];

/** Where the gently sagging gold band at the top passes x (0–110). */
function bandY(x: number): number {
  const t = x / 110;
  return (1 - t) ** 2 * 5 + 2 * (1 - t) * t * 14 + t ** 2 * 7;
}

const JASMINE = "#fffdf6";

/**
 * Ronce melati: strings of jasmine buds hanging from a gold band across the top corners (top-left,
 * and mirrored top-right), each ending in an open flower. They sway a little on a slow loop; the
 * global reduced-motion rule stops that. Ivory buds with a gold outline read on a photo and on the
 * plain cover alike.
 */
function CornerMelati() {
  const garland = (
    <svg viewBox="0 0 110 176" className="size-full" fill="none" stroke={MOTIF_COLOR} strokeLinecap="round">
      <path d="M0 5Q55 23 110 7" strokeWidth="1.8" />
      <path d="M0 9Q55 27 110 11" strokeWidth="0.8" opacity="0.6" />
      {MELATI_STRANDS.map(({ x, length }) => {
        const top = bandY(x) + 1;
        const end = top + length;
        const buds = Math.floor((length - 10) / 11);
        return (
          <g key={x}>
            <path d={`M${x} ${top}Q${x + 3} ${top + length / 2} ${x} ${end}`} strokeWidth="0.7" opacity="0.8" />
            {Array.from({ length: buds }, (_, index) => (
              <ellipse
                key={index}
                cx={x + Math.sin((index + 1) / buds * Math.PI) * 1.5}
                cy={top + 8 + index * 11}
                rx="2.4"
                ry="4"
                fill={JASMINE}
                strokeWidth="0.8"
                transform={`rotate(${index % 2 === 0 ? 10 : -10} ${x} ${top + 8 + index * 11})`}
              />
            ))}
            {/* An open jasmine flower at the end of the string. */}
            <g transform={`translate(${x} ${end + 5})`}>
              {[0, 72, 144, 216, 288].map((angle) => (
                <ellipse key={angle} cx="0" cy="-3.6" rx="2.2" ry="3.6" fill={JASMINE} strokeWidth="0.7" transform={`rotate(${angle})`} />
              ))}
              <circle r="1.3" fill={MOTIF_COLOR} stroke="none" />
            </g>
            <circle cx={x} cy={top - 1} r="1.8" fill={MOTIF_COLOR} stroke="none" />
          </g>
        );
      })}
    </svg>
  );
  return (
    <>
      <div aria-hidden="true" className="inv-sway pointer-events-none absolute left-0 top-0 h-40 w-24 origin-top sm:h-52 sm:w-32">
        {garland}
      </div>
      <div
        aria-hidden="true"
        className="inv-sway pointer-events-none absolute right-0 top-0 h-40 w-24 origin-top -scale-x-100 sm:h-52 sm:w-32"
        style={{ animationDelay: "-3.5s" }}
      >
        {garland}
      </div>
    </>
  );
}

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
      <div aria-hidden="true" className="inv-sway pointer-events-none absolute left-0 top-0 size-28 origin-top-left sm:size-36" style={{ color: MOTIF_COLOR, opacity: 0.55 }}>
        {sprig}
      </div>
      <div
        aria-hidden="true"
        className="inv-sway pointer-events-none absolute bottom-0 right-0 size-28 origin-bottom-right rotate-180 sm:size-36"
        style={{ color: MOTIF_COLOR, opacity: 0.55, animationDelay: "-3s" }}
      >
        {sprig}
      </div>
    </>
  );
}

/**
 * The theme's small decoration: under section headings, and above the cover title for the non-line
 * motifs (`hero`). Inline SVG in the accent color, so it scales crisply and costs no request. Decorative only.
 */
export function ThemeMotifMark({ motif, className = "", hero = false }: { motif: ThemeMotif; className?: string; hero?: boolean }) {
  if (motif === "line") {
    return <div aria-hidden="true" className={`mx-auto h-px w-32 ${className}`} style={{ background: "var(--inv-ornament)" }} />;
  }
  // Above the couple's names the siger is drawn crown-sized; under headings it stays a small mark.
  if (motif === "siger") return <SigerMark className={className} hero={hero} />;
  return (
    <svg aria-hidden="true" viewBox="0 0 120 24" className={`mx-auto h-6 w-28 ${className}`} style={{ color: MOTIF_COLOR }}>
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
