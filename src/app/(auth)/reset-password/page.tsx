import type { Metadata } from "next";
import Link from "next/link";
import { buttonClassName } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { isPasswordResetTokenUsable } from "@/server/auth/password-reset-service";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = {
  title: "Atur ulang password",
  robots: { index: false, follow: false },
  // The token is in the URL; never leak it through the Referer header.
  referrer: "no-referrer",
};

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { token } = await searchParams;
  const value = typeof token === "string" ? token : "";
  const usable = value ? await isPasswordResetTokenUsable(value) : false;

  if (!usable) {
    return (
      <Card>
        <h1 className="font-display text-3xl font-semibold">Tautan tidak berlaku</h1>
        <p className="mt-2 text-ink-700">Tautan reset password tidak valid, sudah dipakai, atau sudah kedaluwarsa.</p>
        <Link href="/forgot-password" className={buttonClassName("primary", "mt-6 w-full")}>
          Minta tautan baru
        </Link>
      </Card>
    );
  }

  return (
    <Card>
      <h1 className="font-display text-3xl font-semibold">Buat password baru</h1>
      <p className="mt-1 text-ink-700">Setelah diubah, kamu akan keluar dari semua perangkat.</p>
      <div className="mt-6">
        <ResetPasswordForm token={value} />
      </div>
    </Card>
  );
}
