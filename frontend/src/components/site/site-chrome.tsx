"use client";
import * as React from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { Logo } from "./logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/format";
import { getSessionToken } from "@/lib/session";

const NAV = [
  { href: "/#ekosistem", label: "5 Modul AI" },
  { href: "/#kemitraan", label: "Kemitraan Mitra" },
  { href: "/#alur-validasi", label: "Tahapan TKT" },
  { href: "/#privasi", label: "Privasi UU PDP" },
  { href: "/#faq", label: "Tanya Jawab" },
  { href: "/#kontak", label: "Hubungi Mitra" },
];

/** Server hanya melihat cookie; bila sesi hidup lewat header (tersimpan di peramban), status
    masuk menyesuaikan setelah hidrasi. */
export function useLoggedIn(initial: boolean): boolean {
  const [loggedIn, setLoggedIn] = React.useState(initial);
  React.useEffect(() => {
    if (!initial && getSessionToken()) setLoggedIn(true);
  }, [initial]);
  return loggedIn;
}

/** Tombol ajakan utama di beranda: ke dasbor bila sudah masuk, ke pendaftaran bila belum. */
export function HeroCta({ loggedIn: initial }: { loggedIn: boolean }) {
  const loggedIn = useLoggedIn(initial);
  return (
    <Link href={loggedIn ? "/dashboard" : "/register"}>
      <Button size="lg" variant="primary">
        {loggedIn ? "Buka dasbor" : "Mulai sekarang"}
      </Button>
    </Link>
  );
}

export function SiteHeader({ loggedIn: initialLoggedIn, dark = false }: { loggedIn: boolean; dark?: boolean }) {
  const [open, setOpen] = React.useState(false);
  const loggedIn = useLoggedIn(initialLoggedIn);
  return (
    <header className={cn("sticky top-0 z-40 border-b backdrop-blur-sm", dark ? "border-white/10 bg-[#0B1210]/85" : "border-line bg-surface/90")}>
      <div className="container-x flex h-16 items-center justify-between gap-4">
        <Link href="/" aria-label="SmartDayCare AI — beranda">
          <Logo dark={dark} />
        </Link>
        <nav className="hidden items-center gap-1 lg:flex" aria-label="Navigasi utama">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={cn(
                "rounded-md px-3 py-2 text-[14px]",
                dark ? "text-white/80 hover:bg-white/8 hover:text-white" : "text-ink-2 hover:bg-wash hover:text-ink",
              )}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="hidden items-center gap-2 lg:flex">
          {loggedIn ? (
            <Link href="/dashboard">
              <Button variant="primary">Buka dasbor</Button>
            </Link>
          ) : (
            <>
              <Link href="/login">
                <Button variant={dark ? "light" : "default"}>Masuk</Button>
              </Link>
              <Link href="/register">
                <Button variant="primary">Daftar</Button>
              </Link>
            </>
          )}
        </div>
        <Button
          variant={dark ? "light" : "ghost"}
          size="icon"
          className="lg:hidden"
          aria-label={open ? "Tutup menu" : "Buka menu"}
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </Button>
      </div>
      {open ? (
        <div className={cn("border-t lg:hidden", dark ? "border-white/10 bg-[#0B1210]" : "border-line bg-surface")}>
          <nav className="container-x flex flex-col py-2" aria-label="Navigasi utama">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                onClick={() => setOpen(false)}
                className={cn("rounded-md px-3 py-2.5 text-[15px]", dark ? "text-white/85" : "text-ink-2")}
              >
                {n.label}
              </Link>
            ))}
            <div className="mt-2 flex gap-2 px-3 pb-3">
              {loggedIn ? (
                <Link href="/dashboard" className="flex-1">
                  <Button variant="primary" className="w-full">
                    Buka dasbor
                  </Button>
                </Link>
              ) : (
                <>
                  <Link href="/login" className="flex-1">
                    <Button className="w-full" variant={dark ? "light" : "default"}>
                      Masuk
                    </Button>
                  </Link>
                  <Link href="/register" className="flex-1">
                    <Button variant="primary" className="w-full">
                      Daftar
                    </Button>
                  </Link>
                </>
              )}
            </div>
          </nav>
        </div>
      ) : null}
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-line bg-surface border-t">
      <div className="container-x grid gap-8 py-12 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <Logo />
          <p className="text-muted mt-3 max-w-sm text-[14px] leading-relaxed">
            Intelligent Child Development & Wellbeing Platform — catatan harian anak yang menjadi insight perkembangan, bisa dijelaskan kepada orang tua.
          </p>
        </div>
        <FooterCol
          title="Produk"
          links={[
            ["/#kemampuan", "Kemampuan"],
            ["/#harga", "Harga"],
            ["/#cara-ai", "Cara kerja AI"],
            ["/help", "Bantuan"],
          ]}
        />
        <FooterCol
          title="Akun"
          links={[
            ["/login", "Masuk"],
            ["/register", "Daftar"],
            ["/register?role=caregiver", "Daftar sebagai pengasuh"],
            ["/account", "Akun & privasi"],
          ]}
        />
        <FooterCol
          title="Perusahaan"
          links={[
            ["/#privasi", "Privasi"],
            ["/help#privasi", "Kebijakan privasi"],
            ["/help#syarat", "Syarat layanan"],
            ["/#kontak", "Kontak"],
          ]}
        />
      </div>
      <div className="border-line border-t">
        <div className="container-x text-muted flex flex-col gap-2 py-5 text-[13px] md:flex-row md:items-center md:justify-between">
          <span>© 2026 SmartDayCare AI. Bandung, Indonesia.</span>
          <span>halo@smartdaycare.id · +62 22 2034 5510</span>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <div className="text-ink-2 text-[13px] font-semibold tracking-[0.06em] uppercase">{title}</div>
      <ul className="mt-3 space-y-2">
        {links.map(([href, label]) => (
          <li key={href + label}>
            <Link href={href} className="text-muted text-[14px] hover:text-teal-800">
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
