import type { Metadata } from "next";
import Link from "next/link";
import { ThemeSettingForm } from "@/components/admin/admin-forms";
import { AdminPageHeader, Badge } from "@/components/admin/admin-ui";
import { buttonClassName } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { requireAdminPage } from "@/server/admin/admin-access";
import { listThemesForAdmin } from "@/server/admin/admin-content-service";

export const metadata: Metadata = { title: "Tema undangan" };

export default async function AdminThemesPage() {
  const admin = await requireAdminPage();
  const themes = await listThemesForAdmin(admin.id);

  return (
    <>
      <AdminPageHeader
        title="Tema undangan"
        description="Tampilan tema diatur di kode. Di sini hanya nama, urutan, ketersediaan, dan status premium. Undangan yang sudah memakai tema tetap bisa mempertahankannya."
      />
      <div className="grid gap-4 lg:grid-cols-2">
        {themes.map((entry) => (
          <Card key={entry.code}>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span aria-hidden="true" className="flex overflow-hidden rounded-full ring-1 ring-cream-300">
                  {[entry.theme.tokens.background, entry.theme.tokens.accent, entry.theme.tokens.ink].map((color, index) => (
                    <span key={index} className="size-6" style={{ background: color }} />
                  ))}
                </span>
                <span className="text-sm text-ink-500">{entry.invitations} undangan</span>
              </div>
              <span className="flex items-center gap-2">
                {entry.isEnabled ? <Badge tone="good">Tersedia</Badge> : <Badge>Disembunyikan</Badge>}
                {entry.isPremium ? <Badge tone="warn">Premium</Badge> : null}
                <Link href={`/admin/themes/${entry.code}/preview`} className={buttonClassName("ghost", "min-h-10 px-3")}>
                  Pratinjau
                </Link>
              </span>
            </div>
            <ThemeSettingForm
              code={entry.code}
              defaults={{
                displayName: entry.name,
                description: entry.description,
                isEnabled: entry.isEnabled,
                isPremium: entry.isPremium,
                sortOrder: entry.sortOrder.toString(),
              }}
            />
          </Card>
        ))}
      </div>
    </>
  );
}
