import { cn } from "@/lib/cn";
import { formatRupiah } from "@/lib/money";

export function MoneyStat({
  label,
  amount,
  testId,
  emptyLabel = "Belum diatur",
  className,
}: {
  label: string;
  amount: bigint | null;
  testId?: string;
  emptyLabel?: string;
  className?: string;
}) {
  const negative = amount !== null && amount < 0n;
  return (
    <div className={className}>
      <dt className="text-xs text-ink-500">{label}</dt>
      <dd data-testid={testId} className={cn("mt-0.5 font-semibold", negative ? "text-danger-600" : "text-ink-900")}>
        {amount === null ? emptyLabel : formatRupiah(amount)}
      </dd>
    </div>
  );
}
