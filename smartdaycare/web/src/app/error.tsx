"use client";
import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

/* Batas kesalahan aplikasi: dipakai saat halaman tidak bisa dirender, umumnya karena layanan
   data sedang tidak dapat dihubungi. Tidak menampilkan detail teknis kepada pengguna. */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  React.useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="container-x flex min-h-dvh flex-col items-center justify-center py-16 text-center">
      <p className="text-[13px] font-semibold tracking-[0.08em] text-teal-700 uppercase">Gangguan sementara</p>
      <h1 className="mt-2 text-[28px]">Halaman belum bisa dimuat</h1>
      <p className="text-muted mt-2 max-w-md">Layanan data sedang tidak dapat dihubungi. Data Anda aman; coba muat ulang beberapa saat lagi.</p>
      <div className="mt-6 flex gap-3">
        <Button variant="primary" onClick={() => reset()}>
          Coba lagi
        </Button>
        <Link href="/">
          <Button>Ke beranda</Button>
        </Link>
      </div>
    </main>
  );
}
