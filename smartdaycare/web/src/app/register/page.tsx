import { Suspense } from "react";
import type { Metadata } from "next";
import { AuthLayout } from "@/components/auth/auth-layout";
import { RegisterForm } from "@/components/auth/auth-forms";

export const metadata: Metadata = { title: "Daftar" };
export const dynamic = "force-dynamic";

export default function RegisterPage() {
  return (
    <AuthLayout title="Buat akun" desc="Akun orang tua gratis. Pengasuh dan admin memerlukan kode undangan dari daycare.">
      <Suspense fallback={null}>
        <RegisterForm />
      </Suspense>
    </AuthLayout>
  );
}
