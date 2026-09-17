import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SuspendUserForm } from "@/components/admin/admin-forms";
import { AdminPageHeader, Badge, first, Notice } from "@/components/admin/admin-ui";
import { buttonClassName } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatCoupleName } from "@/lib/couple";
import { dbDateToIso, formatDateTime, formatIsoDateShort } from "@/lib/dates";
import { setUserRoleAction, unsuspendUserAction } from "@/server/actions/admin-actions";
import { requireAdminPage } from "@/server/admin/admin-access";
import { getUserDetail } from "@/server/admin/admin-user-service";

export const metadata: Metadata = { title: "Detail pengguna" };

const NOTICES = {
  suspended: { tone: "success", text: "Akun disuspend dan semua sesinya diakhiri." },
  unsuspended: { tone: "success", text: "Suspend dicabut. Pengguna bisa masuk lagi." },
  promoted: { tone: "success", text: "Pengguna sekarang admin." },
  demoted: { tone: "success", text: "Hak admin dicabut." },
  self: { tone: "error", text: "Kamu tidak bisa melakukan ini pada akunmu sendiri." },
  last_admin: { tone: "error", text: "Minimal harus ada satu admin aktif." },
  unchanged: { tone: "error", text: "Tidak ada perubahan." },
  not_found: { tone: "error", text: "Pengguna tidak ditemukan." },
} as const;

type PageProps = { params: Promise<{ userId: string }>; searchParams: Promise<{ notice?: string | string[] }> };

export default async function AdminUserDetailPage({ params, searchParams }: PageProps) {
  const admin = await requireAdminPage();
  const [{ userId }, query] = await Promise.all([params, searchParams]);
  const user = await getUserDetail(admin.id, userId);
  if (!user) notFound();
  const isSelf = user.id === admin.id;

  return (
    <>
      <p>
        <Link href="/admin/users" className="text-sm text-ink-700 underline-offset-4 hover:underline">
          ← Semua pengguna
        </Link>
      </p>
      <AdminPageHeader title={user.name} description={user.email} />
      <Notice notice={first(query.notice)} messages={NOTICES} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Akun">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-ink-500">Peran</dt>
            <dd data-testid="user-role">{user.role === "ADMIN" ? "Admin" : "Pengguna"}</dd>
            <dt className="text-ink-500">Status</dt>
            <dd data-testid="user-status">
              {user.suspendedAt ? <Badge tone="bad">Disuspend</Badge> : <Badge tone="good">Aktif</Badge>}
            </dd>
            {user.suspendedAt ? (
              <>
                <dt className="text-ink-500">Disuspend</dt>
                <dd>
                  {formatDateTime(user.suspendedAt)}
                  {user.suspendedReason ? ` — ${user.suspendedReason}` : ""}
                </dd>
              </>
            ) : null}
            <dt className="text-ink-500">Sesi aktif</dt>
            <dd className="tabular-nums">{user._count.sessions}</dd>
            <dt className="text-ink-500">Terdaftar</dt>
            <dd>{formatDateTime(user.createdAt)}</dd>
          </dl>
        </Card>

        <Card title="Pernikahan">
          {user.memberships.length === 0 ? (
            <p className="text-sm text-ink-500">Belum tergabung di pernikahan mana pun.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {user.memberships.map((membership) => (
                <li key={membership.wedding.id} className="flex flex-wrap items-center justify-between gap-2">
                  <Link href={`/admin/weddings/${membership.wedding.id}`} className="font-medium underline-offset-4 hover:underline">
                    {formatCoupleName({
                      brideName: membership.wedding.brideName,
                      groomName: membership.wedding.groomName,
                      format: "BRIDE_GROOM",
                      customDisplayName: null,
                    })}
                  </Link>
                  <span className="text-ink-500">
                    {formatIsoDateShort(dbDateToIso(membership.wedding.weddingDate))}
                    {membership.wedding.deletedAt ? " · dihapus" : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {isSelf ? (
        <p className="text-sm text-ink-500">Ini akunmu sendiri. Suspend dan perubahan peran dilakukan oleh admin lain.</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Suspend" description="Menghentikan akses masuk dan mengakhiri semua sesi. Data pernikahan tetap utuh.">
            {user.suspendedAt ? (
              <form action={unsuspendUserAction}>
                <input type="hidden" name="userId" value={user.id} />
                <button type="submit" className={buttonClassName("secondary")}>
                  Cabut suspend
                </button>
              </form>
            ) : (
              <SuspendUserForm userId={user.id} />
            )}
          </Card>
          <Card title="Peran" description="Admin bisa mengubah paket, promo, template, dan akun pengguna lain.">
            <form action={setUserRoleAction}>
              <input type="hidden" name="userId" value={user.id} />
              <input type="hidden" name="role" value={user.role === "ADMIN" ? "USER" : "ADMIN"} />
              <button type="submit" className={buttonClassName(user.role === "ADMIN" ? "danger" : "secondary")}>
                {user.role === "ADMIN" ? "Cabut hak admin" : "Jadikan admin"}
              </button>
            </form>
          </Card>
        </div>
      )}
    </>
  );
}
