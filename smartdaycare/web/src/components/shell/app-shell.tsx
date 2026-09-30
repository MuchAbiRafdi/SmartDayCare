"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, ChevronRight, CircleHelp, Home, LayoutGrid, LogOut, Menu, MessageCircle, Settings, X, type LucideIcon } from "lucide-react";
import { api } from "@/lib/api";
import { cn, fmtDate, initials, ROLE_LABEL } from "@/lib/format";
import { clearSessionToken } from "@/lib/session";
import type { Role, User } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/site/logo";

export interface Section {
  id: string;
  label: string;
  count?: number;
  icon?: LucideIcon;
  /** Judul kelompok yang ditampilkan di atas butir ini (mis. "Lainnya"). */
  group?: string;
}

const PAGES: { href: string; label: string; roles: Role[]; icon: LucideIcon }[] = [
  { href: "/dashboard", label: "Beranda", roles: ["parent", "caregiver", "admin"], icon: Home },
  { href: "/account", label: "Pengaturan & akun", roles: ["parent", "caregiver", "admin"], icon: Settings },
  { href: "/help", label: "Bantuan", roles: ["parent", "caregiver", "admin"], icon: CircleHelp },
];

const ROLE_HOME: Record<Role, string> = { parent: "/parent", caregiver: "/caregiver", admin: "/admin" };

export function AppShell({
  me,
  title,
  subtitle,
  sections = [],
  tab,
  onTab,
  unread = 0,
  chatUnread = 0,
  chatHref,
  topRight,
  children,
}: {
  me: User;
  title: string;
  subtitle?: React.ReactNode;
  sections?: Section[];
  tab?: string;
  onTab?: (id: string) => void;
  unread?: number;
  chatUnread?: number;
  chatHref?: string;
  topRight?: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);
  const [leaving, setLeaving] = React.useState(false);
  const purple = pathname.startsWith("/admin") || (me.role === "admin" && !pathname.startsWith("/parent") && !pathname.startsWith("/caregiver"));
  const roleHome = ROLE_HOME[me.role];
  const onRoleHome = pathname === roleHome || (me.role === "admin" && ["/parent", "/caregiver"].includes(pathname));

  const logout = async () => {
    setLeaving(true);
    try {
      await api.post("/api/auth/logout");
    } catch {
      /* sesi yang sudah tidak sah tetap dianggap keluar */
    }
    clearSessionToken();
    // navigasi penuh: semua status klien pengguna sebelumnya ikut dibuang
    window.location.assign("/login?out=1");
  };

  const close = () => setOpen(false);
  const hasHome = sections.some((x) => x.label === "Beranda");

  const nav = (
    <>
      <div className="px-4 pt-5 pb-4">
        <Link href="/dashboard" className="inline-flex items-center gap-2" onClick={close}>
          <Logo dark />
        </Link>
      </div>
      <nav className="flex-1 px-3" aria-label="Menu utama">
        <ul className="m-0 list-none space-y-0.5 p-0">
          {!hasHome ? (
            <li>
              <Link
                href="/dashboard"
                onClick={close}
                aria-current={pathname === "/dashboard" ? "page" : undefined}
                className={cn("side-item", pathname === "/dashboard" && "side-item-active")}
              >
                <Home size={17} /> Beranda
              </Link>
            </li>
          ) : null}
          {sections.map((s) => {
            const active = tab === s.id;
            const Icon = s.icon;
            return (
              <React.Fragment key={s.id}>
                {s.group ? <li className="px-3 pt-4 pb-1 text-[11px] font-semibold tracking-[0.08em] text-white/60 uppercase">{s.group}</li> : null}
                <li>
                  <button
                    type="button"
                    onClick={() => {
                      onTab?.(s.id);
                      close();
                    }}
                    aria-current={active ? "true" : undefined}
                    className={cn("side-item", active && "side-item-active")}
                  >
                    {Icon ? <Icon size={17} className="shrink-0" /> : <span className="h-[17px] w-[17px] shrink-0" />}
                    <span className="min-w-0 flex-1 truncate">{s.label}</span>
                    {s.count ? (
                      <span className={cn("rounded-full px-1.5 text-[11px] font-bold", active ? "bg-teal-100 text-teal-800" : "bg-white/20 text-white")}>
                        {s.count}
                      </span>
                    ) : null}
                  </button>
                </li>
              </React.Fragment>
            );
          })}
          {!sections.length ? (
            <li>
              <Link href={roleHome} onClick={close} className={cn("side-item", onRoleHome && "side-item-active")}>
                <ChevronRight size={17} /> {me.role === "parent" ? "Dasbor orang tua" : me.role === "caregiver" ? "Dasbor pengasuh" : "Dashboard admin"}
              </Link>
            </li>
          ) : null}
          {hasHome ? <li className="px-3 pt-4 pb-1 text-[11px] font-semibold tracking-[0.08em] text-white/60 uppercase">Akun</li> : null}
          {me.role === "admin" && !pathname.startsWith("/admin") ? (
            <li>
              <Link href="/admin" onClick={close} className="side-item">
                <ChevronRight size={17} /> Dashboard admin
              </Link>
            </li>
          ) : null}
          {me.role === "admin" && hasHome ? (
            <li>
              <Link href="/dashboard" onClick={close} className="side-item">
                <LayoutGrid size={17} /> Pilih dasbor
              </Link>
            </li>
          ) : null}
          {PAGES.filter((p) => p.roles.includes(me.role) && p.href !== "/dashboard").map((p) => {
            const active = pathname === p.href;
            return (
              <li key={p.href}>
                <Link href={p.href} onClick={close} aria-current={active ? "page" : undefined} className={cn("side-item", active && "side-item-active")}>
                  <p.icon size={17} /> {p.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="border-side-line mt-auto border-t p-3">
        <div className="flex items-center gap-3 px-1.5 py-1.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20 text-[13px] font-bold text-white">
            {initials(me.name)}
          </span>
          <div className="min-w-0">
            <div className="truncate text-[14px] font-semibold text-white">{me.name}</div>
            <div className="truncate text-[12px] text-white/70">{ROLE_LABEL[me.role]}</div>
          </div>
        </div>
        <button type="button" onClick={logout} disabled={leaving} className="side-item mt-1 text-[13.5px]">
          <LogOut size={15} /> {leaving ? "Keluar…" : "Keluar"}
        </button>
      </div>
    </>
  );

  return (
    <div className={cn("min-h-dvh lg:grid lg:grid-cols-[248px_minmax(0,1fr)]", purple && "role-admin")}>
      <aside className="side-bg sticky top-0 hidden h-dvh flex-col overflow-y-auto lg:flex">{nav}</aside>
      {open ? (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" className="bg-ink/50 absolute inset-0" aria-label="Tutup menu" onClick={close} />
          <div className="side-bg shadow-pop absolute inset-y-0 left-0 flex w-[280px] max-w-[85vw] flex-col overflow-y-auto">
            <button type="button" onClick={close} className="absolute top-3 right-2 rounded-md p-1.5 text-white/80 hover:text-white" aria-label="Tutup">
              <X size={18} />
            </button>
            {nav}
          </div>
        </div>
      ) : null}
      <div className="flex min-w-0 flex-col">
        <header className="border-line bg-surface/95 sticky top-0 z-30 border-b backdrop-blur-sm">
          <div className="flex items-center gap-3 px-4 py-2.5 md:px-6">
            <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Buka menu" onClick={() => setOpen(true)}>
              <Menu size={20} />
            </Button>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-[15px] leading-tight font-semibold md:text-[16px]">{title}</h1>
              <div className="text-muted truncate text-[12.5px]">{subtitle ?? fmtDate()}</div>
            </div>
            {topRight}
            {chatHref ? (
              <Link href={chatHref} className="text-ink-2 hover:bg-wash relative rounded-md p-2" aria-label={chatUnread ? chatUnread + " pesan baru" : "Pesan"}>
                <MessageCircle size={19} />
                {chatUnread ? (
                  <span className="bg-danger absolute -top-0.5 -right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10.5px] font-bold text-white">
                    {chatUnread}
                  </span>
                ) : null}
              </Link>
            ) : null}
            {me.role === "parent" ? (
              <Link
                href="/parent#pemberitahuan"
                className="text-ink-2 hover:bg-wash relative rounded-md p-2"
                aria-label={unread ? unread + " pemberitahuan baru" : "Pemberitahuan"}
              >
                <Bell size={19} />
                {unread ? (
                  <span className="bg-danger absolute -top-0.5 -right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10.5px] font-bold text-white">
                    {unread}
                  </span>
                ) : null}
              </Link>
            ) : null}
          </div>
          {sections.length ? (
            <nav className="no-print border-line flex gap-1 overflow-x-auto border-t px-3 py-1.5 lg:hidden" aria-label="Bagian">
              {sections.map((s) => (
                <button key={s.id} type="button" onClick={() => onTab?.(s.id)} className={cn("chip shrink-0", tab === s.id && "active")}>
                  {s.label}
                  {s.count ? " · " + s.count : ""}
                </button>
              ))}
            </nav>
          ) : null}
        </header>
        <main className="app-main flex-1 px-4 py-5 md:px-6 md:py-6">{children}</main>
      </div>
    </div>
  );
}
