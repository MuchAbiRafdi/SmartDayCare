import { Suspense } from "react";
import type { Metadata } from "next";
import { AuthLayout } from "@/components/auth/auth-layout";
import { ResetForm } from "@/components/auth/recovery-forms";

export const metadata: Metadata = { title: "Kata sandi baru" };
export const dynamic = "force-dynamic";

export default function ResetPage() {
  return (
    <AuthLayout title="Buat kata sandi baru" desc="Pilih kata sandi yang belum pernah dipakai di layanan lain.">
      <Suspense fallback={null}>
        <ResetForm />
      </Suspense>
    </AuthLayout>
  );
}
