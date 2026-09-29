import { Suspense } from "react";
import type { Metadata } from "next";
import { AuthLayout } from "@/components/auth/auth-layout";
import { VerifyEmail } from "@/components/auth/recovery-forms";

export const metadata: Metadata = { title: "Verifikasi email" };
export const dynamic = "force-dynamic";

export default function VerifyPage() {
  return (
    <AuthLayout title="Verifikasi email" desc="Memastikan alamat email Anda benar agar pemberitahuan dan pemulihan akun sampai.">
      <Suspense fallback={null}>
        <VerifyEmail />
      </Suspense>
    </AuthLayout>
  );
}
