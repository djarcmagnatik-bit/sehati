import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ActivityList } from "@/components/activity/activity-list";
import { buttonClassName } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { listActivity } from "@/server/activity/activity-service";
import { requireSession } from "@/server/auth/session-cookie";
import { getActiveWeddingForUser } from "@/server/wedding/wedding-service";

export const metadata: Metadata = { title: "Aktivitas" };

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  const session = await requireSession();
  const membership = await getActiveWeddingForUser(session.user.id);
  if (!membership) redirect("/onboarding");

  const params = await searchParams;
  const requested = Number.parseInt(typeof params.page === "string" ? params.page : "1", 10);
  const result = await listActivity(session.user.id, membership.wedding.id, Math.min(Math.max(requested || 1, 1), 10_000));
  const lastPage = Math.max(1, Math.ceil(result.total / result.pageSize));

  return (
    <div className="space-y-6">
      <header>
        <Link href="/dashboard" className="text-sm font-medium text-clay-700 underline-offset-4 hover:underline">
          ← Kembali ke beranda
        </Link>
        <h1 className="mt-2 font-display text-3xl font-semibold">Aktivitas</h1>
        <p className="mt-1 text-ink-700">Riwayat perubahan di workspace kalian berdua.</p>
      </header>

      <Card>
        {result.items.length === 0 ? (
          <p className="text-sm text-ink-700">Belum ada aktivitas.</p>
        ) : (
          <ActivityList entries={result.items} now={new Date()} timeZone={membership.wedding.timeZone} />
        )}
      </Card>

      {lastPage > 1 ? (
        <nav aria-label="Halaman" className="flex items-center justify-between gap-3">
          {result.page > 1 ? (
            <Link href={`/activity?page=${result.page - 1}`} className={buttonClassName("secondary")}>
              ← Lebih baru
            </Link>
          ) : (
            <span />
          )}
          <span className="text-sm text-ink-500">
            Halaman {result.page} dari {lastPage}
          </span>
          {result.page < lastPage ? (
            <Link href={`/activity?page=${result.page + 1}`} className={buttonClassName("secondary")}>
              Lebih lama →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </div>
  );
}
