import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { buttonClassName } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmActionButton } from "@/components/ui/confirm-action-button";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/dates";
import { WISH_STATUS_LABEL, type WishStatusValue } from "@/lib/rsvp";
import { deleteWishAction, setWishStatusAction } from "@/server/actions/invitation-actions";
import { requireSession } from "@/server/auth/session-cookie";
import { getInvitationForUser } from "@/server/invitation/invitation-service";
import { listWishesForUser, type WishFilter } from "@/server/rsvp/wish-service";
import { getActiveWeddingForUser } from "@/server/wedding/wedding-service";

export const metadata: Metadata = { title: "Ucapan & doa" };

const FILTERS: Array<{ value: WishFilter; label: string }> = [
  { value: "all", label: "Semua" },
  { value: "VISIBLE", label: "Tampil" },
  { value: "HIDDEN", label: "Disembunyikan" },
];

function parseFilter(value: string | string[] | undefined): WishFilter {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "VISIBLE" || raw === "HIDDEN" ? raw : "all";
}

export default async function WishesModerationPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string | string[]; status?: string | string[]; page?: string | string[] }>;
}) {
  const session = await requireSession();
  const membership = await getActiveWeddingForUser(session.user.id);
  if (!membership) redirect("/onboarding");

  const invitation = await getInvitationForUser(session.user.id, membership.wedding.id);
  if (!invitation) redirect("/invitation");

  const params = await searchParams;
  const filter = parseFilter(params.status);
  const page = Number.parseInt(typeof params.page === "string" ? params.page : "", 10) || 1;
  const wishes = await listWishesForUser(session.user.id, membership.wedding.id, filter, page);
  const wishesSection = invitation.sections.find((section) => section.type === "WISHES");
  const lastPage = Math.max(1, Math.ceil(wishes.total / wishes.pageSize));

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href="/invitation" className="text-sm font-medium text-clay-700 underline-offset-4 hover:underline">
        ← Kembali ke undangan
      </Link>
      <header>
        <h1 className="font-display text-3xl font-semibold">Ucapan & doa</h1>
        <p className="mt-1 text-ink-700">
          <span data-testid="wishes-visible">{wishes.visible}</span> ucapan tampil di undangan. Sembunyikan yang kurang pantas, atau hapus
          permanen.
        </p>
      </header>

      {params.notice === "deleted" ? <Alert tone="success">Ucapan dihapus permanen.</Alert> : null}
      {wishes.total > 0 && wishesSection && !wishesSection.enabled ? (
        <Alert tone="warning">
          Bagian ucapan masih disembunyikan di undangan.{" "}
          <Link href="/invitation/sections/wishes" className="font-semibold underline underline-offset-4">
            Tampilkan bagiannya
          </Link>{" "}
          agar tamu bisa mengirim ucapan.
        </Alert>
      ) : null}

      <nav aria-label="Filter ucapan">
        <ul className="flex flex-wrap gap-2">
          {FILTERS.map((item) => {
            const active = filter === item.value;
            return (
              <li key={item.value}>
                <Link
                  href={item.value === "all" ? "/invitation/wishes" : `/invitation/wishes?status=${item.value}`}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex min-h-10 items-center rounded-full px-4 text-sm font-medium",
                    active ? "bg-ink-900 text-white" : "bg-white text-ink-700 ring-1 ring-cream-300 hover:bg-cream-100",
                  )}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {wishes.items.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-cream-300 bg-white p-6 text-center">
          <p className="text-ink-700">Belum ada ucapan dari tamu.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {wishes.items.map((wish) => {
            const hidden = wish.status === "HIDDEN";
            return (
              <li key={wish.id}>
                <Card>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div>
                      <p className="font-medium text-ink-900">{wish.name}</p>
                      <p className="text-xs text-ink-500">
                        {formatDateTime(wish.createdAt, membership.wedding.timeZone)}
                        {wish.guest ? ` · dari tautan ${wish.guest.invitationName}` : " · dari tautan umum"}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-0.5 text-xs font-medium",
                        hidden ? "bg-cream-100 text-ink-500" : "bg-sage-50 text-sage-700",
                      )}
                    >
                      {WISH_STATUS_LABEL[wish.status as WishStatusValue]}
                    </span>
                  </div>
                  <p className="mt-3 text-pretty whitespace-pre-line">{wish.message}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <form action={setWishStatusAction}>
                      <input type="hidden" name="wishId" value={wish.id} />
                      <input type="hidden" name="status" value={hidden ? "VISIBLE" : "HIDDEN"} />
                      <button type="submit" className={buttonClassName("secondary", "min-h-10 px-4")}>
                        {hidden ? "Tampilkan lagi" : "Sembunyikan"}
                      </button>
                    </form>
                    <ConfirmActionButton
                      action={deleteWishAction}
                      fields={{ wishId: wish.id }}
                      triggerLabel={`Hapus ucapan dari ${wish.name}`}
                      confirmLabel="Ya, hapus permanen"
                      message="Ucapan ini akan hilang permanen. Menyembunyikan lebih aman bila kamu ragu."
                    />
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      {lastPage > 1 ? (
        <nav aria-label="Halaman" className="flex items-center justify-between gap-3">
          {wishes.page > 1 ? (
            <Link
              href={`/invitation/wishes?status=${filter}&page=${wishes.page - 1}`}
              className={buttonClassName("secondary")}
            >
              ← Sebelumnya
            </Link>
          ) : (
            <span />
          )}
          <span className="text-sm text-ink-500">
            Halaman {wishes.page} dari {lastPage}
          </span>
          {wishes.page < lastPage ? (
            <Link
              href={`/invitation/wishes?status=${filter}&page=${wishes.page + 1}`}
              className={buttonClassName("secondary")}
            >
              Berikutnya →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </div>
  );
}
