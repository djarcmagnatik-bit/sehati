import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { MoneyStat } from "@/components/budget/money-stat";
import { Alert } from "@/components/ui/alert";
import { buttonClassName } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui/progress-bar";
import { cn } from "@/lib/cn";
import { formatRupiah } from "@/lib/money";
import { GIFT_ITEM_STATUS_LABEL, GIFT_ITEM_STATUSES, isGiftItemDone, type GiftItemStatusValue } from "@/lib/planning";
import { setGiftItemStatusAction } from "@/server/actions/planning-actions";
import { requireSession } from "@/server/auth/session-cookie";
import { getSeserahanSummary, listGiftItems } from "@/server/planning/seserahan-service";
import { getActiveWeddingForUser } from "@/server/wedding/wedding-service";

export const metadata: Metadata = { title: "Seserahan" };

const NOTICES: Record<string, string> = { deleted: "Barang seserahan dihapus." };

/** Next step in preparation, offered as a one-tap action on the list. */
const NEXT_STATUS: Record<GiftItemStatusValue, GiftItemStatusValue | null> = {
  PLANNED: "PURCHASED",
  PURCHASED: "PACKED",
  PACKED: "READY",
  READY: null,
};

const NEXT_ACTION_LABEL: Record<GiftItemStatusValue, string> = {
  PLANNED: "",
  PURCHASED: "Tandai sudah dibeli",
  PACKED: "Tandai sudah dikemas",
  READY: "Tandai siap diantar",
};

const STATUS_CLASS: Record<GiftItemStatusValue, string> = {
  PLANNED: "bg-cream-100 text-ink-700",
  PURCHASED: "bg-clay-50 text-clay-700",
  PACKED: "bg-sage-50 text-sage-700",
  READY: "bg-success-50 text-success-700",
};

function parseStatus(value: string | string[] | undefined): GiftItemStatusValue | "all" {
  const raw = Array.isArray(value) ? value[0] : value;
  return (GIFT_ITEM_STATUSES as readonly string[]).includes(raw ?? "") ? (raw as GiftItemStatusValue) : "all";
}

export default async function SeserahanPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string | string[]; status?: string | string[] }>;
}) {
  const session = await requireSession();
  const membership = await getActiveWeddingForUser(session.user.id);
  if (!membership) redirect("/onboarding");

  const { wedding } = membership;
  const params = await searchParams;
  const status = parseStatus(params.status);
  const [summary, items] = await Promise.all([
    getSeserahanSummary(session.user.id, wedding.id),
    listGiftItems(session.user.id, wedding.id, status),
  ]);
  const notice = typeof params.notice === "string" ? NOTICES[params.notice] : undefined;
  const percent = summary.items > 0 ? Math.round((summary.done / summary.items) * 100) : 0;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">Seserahan</h1>
          <p className="mt-1 text-ink-700">Daftar hantaran: siapa yang membeli, berapa biayanya, dan sudah sampai tahap mana.</p>
        </div>
        <Link href="/seserahan/new" className={buttonClassName("primary")}>
          + Tambah barang
        </Link>
      </header>

      {notice ? <Alert tone="success">{notice}</Alert> : null}

      <section aria-label="Ringkasan seserahan" className="rounded-3xl border border-cream-200 bg-white p-5 sm:p-6">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4">
          <div>
            <dt className="text-xs text-ink-500">Barang</dt>
            <dd className="mt-0.5 font-semibold text-ink-900" data-testid="seserahan-items">
              {summary.items}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-ink-500">Selesai (dikemas / siap)</dt>
            <dd className="mt-0.5 font-semibold text-ink-900" data-testid="seserahan-done">
              {summary.done}
            </dd>
          </div>
          <MoneyStat label="Total perkiraan" amount={summary.estimated} testId="seserahan-estimated" />
          <MoneyStat label="Total sebenarnya" amount={summary.actual} testId="seserahan-actual" />
        </dl>
        {summary.items > 0 ? <ProgressBar percent={percent} label="Progres seserahan" className="mt-5" /> : null}
      </section>

      <nav aria-label="Filter status">
        <ul className="flex gap-2 overflow-x-auto pb-1">
          {(["all", ...GIFT_ITEM_STATUSES] as const).map((value) => {
            const active = status === value;
            const count = value === "all" ? summary.items : summary.byStatus[value];
            return (
              <li key={value}>
                <Link
                  href={value === "all" ? "/seserahan" : `/seserahan?status=${value}`}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex min-h-10 items-center whitespace-nowrap rounded-full px-4 text-sm font-medium",
                    active ? "bg-ink-900 text-white" : "bg-white text-ink-700 ring-1 ring-cream-300 hover:bg-cream-100",
                  )}
                >
                  {value === "all" ? "Semua" : GIFT_ITEM_STATUS_LABEL[value]} ({count})
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {items.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-cream-300 bg-white p-6 text-center">
          <p className="text-ink-700">{status === "all" ? "Belum ada barang seserahan." : "Tidak ada barang dengan status ini."}</p>
        </div>
      ) : (
        <ul className="divide-y divide-cream-200 rounded-3xl border border-cream-200 bg-white px-4">
          {items.map((item) => {
            const next = NEXT_STATUS[item.status];
            const price =
              item.actualPrice !== null
                ? formatRupiah(item.actualPrice)
                : item.estimatedPrice !== null
                  ? `± ${formatRupiah(item.estimatedPrice)}`
                  : null;
            return (
              <li key={item.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <Link href={`/seserahan/${item.id}`} className="font-medium text-ink-900 underline-offset-4 hover:underline">
                    {item.name}
                  </Link>
                  <p className="mt-0.5 text-xs text-ink-500">
                    {[`${item.quantity}×`, item.category?.name ?? "Tanpa kategori", item.responsible ? `oleh ${item.responsible}` : null, price]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", STATUS_CLASS[item.status])}>
                  {isGiftItemDone(item.status) ? "✓ " : ""}
                  {GIFT_ITEM_STATUS_LABEL[item.status]}
                </span>
                {next ? (
                  <form action={setGiftItemStatusAction}>
                    <input type="hidden" name="itemId" value={item.id} />
                    <input type="hidden" name="status" value={next} />
                    <button
                      type="submit"
                      aria-label={`${NEXT_ACTION_LABEL[next]}: ${item.name}`}
                      className={buttonClassName("secondary", "min-h-10 px-3")}
                    >
                      {NEXT_ACTION_LABEL[next]}
                    </button>
                  </form>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
