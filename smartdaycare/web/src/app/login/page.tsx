import { Suspense } from "react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { fetchMe } from "@/lib/api";
import { AuthLayout } from "@/components/auth/auth-layout";
import { LoginForm } from "@/components/auth/auth-forms";

export const metadata: Metadata = { title: "Masuk" };
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const jar = await cookies();
  const me = jar.get("sd_session") ? await fetchMe(jar.toString()).catch(() => null) : null;
  return (
    <AuthLayout title="Masuk ke akun" desc="Gunakan email dan kata sandi yang terdaftar di daycare Anda.">
      <Suspense fallback={null}>
        <LoginForm currentUser={me?.user ?? null} />
      </Suspense>
    </AuthLayout>
  );
}
