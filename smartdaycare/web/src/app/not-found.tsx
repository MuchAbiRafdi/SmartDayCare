import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="container-x flex min-h-dvh flex-col items-center justify-center py-16 text-center">
      <p className="text-[13px] font-semibold tracking-[0.08em] text-teal-700 uppercase">404</p>
      <h1 className="mt-2 text-[28px]">Halaman tidak ditemukan</h1>
      <p className="text-muted mt-2 max-w-md">Tautan mungkin sudah berubah. Kembali ke beranda atau masuk ke akun Anda.</p>
      <div className="mt-6 flex gap-3">
        <Link href="/">
          <Button>Ke beranda</Button>
        </Link>
        <Link href="/dashboard">
          <Button variant="primary">Buka dasbor</Button>
        </Link>
      </div>
    </main>
  );
}
