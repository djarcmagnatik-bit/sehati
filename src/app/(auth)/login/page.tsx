import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { safeRedirectPath } from "@/lib/redirect";
import { getCurrentSession } from "@/server/auth/session-cookie";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Masuk" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[]; reset?: string | string[] }>;
}) {
  if (await getCurrentSession()) redirect("/dashboard");

  const params = await searchParams;
  const next = typeof params.next === "string" ? safeRedirectPath(params.next) : null;

  return (
    <Card>
      <h1 className="font-display text-3xl font-semibold">Selamat datang kembali</h1>
      <p className="mt-1 text-ink-700">Masuk untuk melanjutkan persiapan pernikahan kalian.</p>
      <div className="mt-6 space-y-4">
        {params.reset === "1" ? (
          <Alert tone="success">Password berhasil diubah. Silakan masuk dengan password baru.</Alert>
        ) : null}
        <LoginForm next={next} />
      </div>
      <p className="mt-6 text-center text-sm text-ink-700">
        Belum punya akun?{" "}
        <Link href="/register" className="font-semibold text-clay-700 underline-offset-4 hover:underline">
          Daftar
        </Link>
      </p>
    </Card>
  );
}
