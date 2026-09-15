import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import { safeRedirectPath } from "@/lib/redirect";
import { getCurrentSession } from "@/server/auth/session-cookie";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = { title: "Daftar" };

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? safeRedirectPath(params.next, "/onboarding") : null;
  if (await getCurrentSession()) redirect(next ?? "/dashboard");

  return (
    <Card>
      <h1 className="font-display text-3xl font-semibold">Buat akun</h1>
      <p className="mt-1 text-ink-700">Mulai siapkan pernikahan kalian dalam satu workspace.</p>
      <div className="mt-6">
        <RegisterForm next={next} />
      </div>
      <p className="mt-6 text-center text-sm text-ink-700">
        Sudah punya akun?{" "}
        <Link
          href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"}
          className="font-semibold text-clay-700 underline-offset-4 hover:underline"
        >
          Masuk
        </Link>
      </p>
    </Card>
  );
}
