import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = { title: "Lupa password" };

export default function ForgotPasswordPage() {
  return (
    <Card>
      <h1 className="font-display text-3xl font-semibold">Lupa password</h1>
      <p className="mt-1 text-ink-700">Masukkan email akun kamu. Kami akan mengirim tautan untuk membuat password baru.</p>
      <div className="mt-6">
        <ForgotPasswordForm />
      </div>
      <p className="mt-6 text-center text-sm text-ink-700">
        <Link href="/login" className="font-semibold text-clay-700 underline-offset-4 hover:underline">
          Kembali ke halaman masuk
        </Link>
      </p>
    </Card>
  );
}
