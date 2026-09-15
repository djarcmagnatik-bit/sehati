import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import { getCurrentSession } from "@/server/auth/session-cookie";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = { title: "Daftar" };

export default async function RegisterPage() {
  if (await getCurrentSession()) redirect("/dashboard");

  return (
    <Card>
      <h1 className="font-display text-3xl font-semibold">Buat akun</h1>
      <p className="mt-1 text-ink-700">Mulai siapkan pernikahan kalian dalam satu workspace.</p>
      <div className="mt-6">
        <RegisterForm />
      </div>
      <p className="mt-6 text-center text-sm text-ink-700">
        Sudah punya akun?{" "}
        <Link href="/login" className="font-semibold text-clay-700 underline-offset-4 hover:underline">
          Masuk
        </Link>
      </p>
    </Card>
  );
}
