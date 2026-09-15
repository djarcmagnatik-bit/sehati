import { cn } from "@/lib/cn";

export function ProgressBar({ percent, label, className }: { percent: number; label: string; className?: string }) {
  const value = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      className={cn("h-2 overflow-hidden rounded-full bg-cream-200", className)}
    >
      <div className="h-full rounded-full bg-clay-600 transition-[width] duration-500" style={{ width: `${value}%` }} />
    </div>
  );
}
