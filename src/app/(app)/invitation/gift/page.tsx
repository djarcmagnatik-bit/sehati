import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { GiftAccountForm } from "@/components/invitation/content-forms";
import { GiftAddressForm } from "@/components/invitation/invitation-forms";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { ConfirmActionButton } from "@/components/ui/confirm-action-button";
import { GIFT_ACCOUNT_LABEL, type GiftAccountTypeValue } from "@/lib/invitation";
import { deleteGiftAccountAction } from "@/server/actions/invitation-actions";
import { requireSession } from "@/server/auth/session-cookie";
import { listGiftAccounts } from "@/server/invitation/content-service";
import { getInvitationForUser } from "@/server/invitation/invitation-service";
import { getActiveWeddingForUser } from "@/server/wedding/wedding-service";

export const metadata: Metadata = { title: "Hadiah digital" };

export default async function GiftPage({ searchParams }: { searchParams: Promise<{ notice?: string | string[] }> }) {
  const session = await requireSession();
  const membership = await getActiveWeddingForUser(session.user.id);
  if (!membership) redirect("/onboarding");

  const invitation = await getInvitationForUser(session.user.id, membership.wedding.id);
  if (!invitation) redirect("/invitation");

  const [accounts, params] = await Promise.all([listGiftAccounts(session.user.id, membership.wedding.id), searchParams]);
  const giftSection = invitation.sections.find((section) => section.type === "GIFT");

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href="/invitation" className="text-sm font-medium text-clay-700 underline-offset-4 hover:underline">
        ← Kembali ke undangan
      </Link>
      <header>
        <h1 className="font-display text-3xl font-semibold">Hadiah digital</h1>
        <p className="mt-1 text-ink-700">
          Halaman undangan hanya menampilkan informasi ini agar tamu bisa menyalinnya. Tidak ada pembayaran yang diproses aplikasi.
        </p>
      </header>

      {params.notice === "deleted" ? <Alert tone="success">Info hadiah dihapus.</Alert> : null}
      {(accounts.length > 0 || invitation.giftAddress) && giftSection && !giftSection.enabled ? (
        <Alert tone="warning">
          Bagian hadiah masih disembunyikan.{" "}
          <Link href="/invitation/sections/gift" className="font-semibold underline underline-offset-4">
            Tampilkan bagiannya
          </Link>{" "}
          agar muncul di undangan.
        </Alert>
      ) : null}

      <Card title="Tambah rekening / dompet digital">
        <GiftAccountForm mode="create" weddingId={membership.wedding.id} />
      </Card>

      {accounts.map((account) => (
        <Card key={account.id} title={`${GIFT_ACCOUNT_LABEL[account.type as GiftAccountTypeValue]} · ${account.providerName}`}>
          <GiftAccountForm
            mode="edit"
            accountId={account.id}
            defaults={{
              type: account.type,
              providerName: account.providerName,
              accountNumber: account.accountNumber,
              accountHolder: account.accountHolder,
              notes: account.notes ?? "",
            }}
          />
          <div className="mt-4">
            <ConfirmActionButton
              action={deleteGiftAccountAction}
              fields={{ accountId: account.id }}
              triggerLabel={`Hapus ${account.providerName}`}
              confirmLabel="Ya, hapus"
              message={`Hapus info ${account.providerName} dari undangan?`}
            />
          </div>
        </Card>
      ))}

      <Card title="Alamat kirim hadiah">
        <GiftAddressForm weddingId={membership.wedding.id} giftAddress={invitation.giftAddress ?? ""} />
      </Card>
    </div>
  );
}
