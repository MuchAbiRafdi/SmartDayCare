"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api, ApiError, cookieSessionWorks } from "@/lib/api";
import { clearSessionToken, getSessionToken, storeSessionToken } from "@/lib/session";
import type { Role, User } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input } from "@/components/ui/field";
import { Note } from "@/components/ui/panel";
import { useToast } from "@/components/ui/toast";

function safeNext(v: string | null): string {
  return v && v.startsWith("/") && !v.startsWith("//") ? v : "/dashboard";
}

/* Setelah server menerima login/daftar, tentukan cara sesi dibawa di peramban ini:
   1. cookie HttpOnly (bawaan) — dicoba dulu dengan satu permintaan tanpa header;
   2. bila cookie tidak sampai ke server (proxy yang membuang Cookie, bingkai lintas situs dengan
      cookie pihak ketiga diblokir), token disimpan di peramban dan dikirim lewat header X-Session.
   Keduanya diverifikasi ke server sebelum berpindah halaman, jadi tidak ada lagi "masuk berhasil"
   yang berujung kembali ke formulir. */
async function finishSignIn(token: string, remember: boolean, next: string, router: ReturnType<typeof useRouter>): Promise<void> {
  clearSessionToken();
  let ok = await cookieSessionWorks();
  let persisted = true;
  if (!ok) {
    persisted = storeSessionToken(token, remember);
    try {
      await api.get("/api/auth/me");
      ok = true;
    } catch {
      clearSessionToken();
    }
  }
  if (!ok) throw new Error("Sesi tidak dapat dipertahankan di peramban ini. Coba peramban lain atau matikan mode penjelajahan pribadi.");
  // Token yang hanya hidup di memori halaman tidak bertahan pada muat ulang penuh: pakai navigasi
  // klien. Selain itu navigasi penuh membuang status klien lama dan paling mudah ditebak.
  if (persisted) window.location.assign(next);
  else router.push(next);
}

export function PasswordInput({
  id,
  name,
  autoComplete,
  value,
  onChange,
  minLength,
  required = true,
  placeholder,
}: {
  id: string;
  name: string;
  autoComplete: string;
  value?: string;
  onChange?: (v: string) => void;
  minLength?: number;
  required?: boolean;
  placeholder?: string;
}) {
  const [show, setShow] = React.useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        name={name}
        type={show ? "text" : "password"}
        autoComplete={autoComplete}
        required={required}
        minLength={minLength}
        value={value}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        placeholder={placeholder}
        className="pr-24"
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute top-1/2 right-2 -translate-y-1/2 rounded px-2 py-1 text-[13px] font-semibold text-teal-800 hover:bg-teal-100"
        aria-pressed={show}
      >
        {show ? "Sembunyikan" : "Lihat"}
      </button>
    </div>
  );
}

export function LoginForm({ currentUser }: { currentUser: User | null }) {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [forgot, setForgot] = React.useState(false);
  const [forgotMsg, setForgotMsg] = React.useState<string | null>(null);
  const next = safeNext(params.get("next"));
  const switching = params.get("switch") === "1";
  const [current, setCurrent] = React.useState<User | null>(currentUser);

  React.useEffect(() => {
    if (params.get("out") === "1") toast("Anda telah keluar. Sampai jumpa.", "ok");
    // sesi lewat header tidak terlihat server: lengkapi catatan "sedang masuk sebagai" dari klien
    if (!currentUser && getSessionToken()) {
      api
        .get<{ user: User }>("/api/auth/me")
        .then((r) => setCurrent(r.user))
        .catch(() => clearSessionToken());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const remember = f.get("remember") === "on";
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<{ token: string }>("/api/auth/login", {
        email: String(f.get("email") ?? "").trim(),
        password: String(f.get("password") ?? ""),
        remember,
      });
      await finishSignIn(r.token, remember, next, router);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Tidak dapat masuk.");
      setBusy(false);
    }
  };

  const sendForgot = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get("femail") ?? "").trim();
    try {
      const r = await api.post<{ message: string }>("/api/auth/forgot", { email });
      setForgotMsg(r.message);
    } catch (err) {
      setForgotMsg(err instanceof ApiError ? err.message : "Tidak dapat mengirim permintaan.");
    }
  };

  return (
    <div>
      {current ? (
        <Note className="mb-4">
          Anda sedang masuk sebagai <b>{current.name}</b>.{" "}
          {switching ? (
            "Masuk dengan akun lain akan mengganti sesi ini."
          ) : (
            <>
              <Link href="/dashboard" className="font-semibold text-teal-800 hover:underline">
                Lanjut ke dasbor
              </Link>{" "}
              atau masuk dengan akun lain.
            </>
          )}
        </Note>
      ) : null}
      <form onSubmit={submit} className="grid gap-4" noValidate>
        <Field label="Email" htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="username" required autoFocus inputMode="email" defaultValue={params.get("email") ?? ""} />
        </Field>
        <Field label="Kata sandi" htmlFor="password">
          <PasswordInput id="password" name="password" autoComplete="current-password" />
        </Field>
        <div className="flex items-center justify-between gap-3">
          <Checkbox name="remember" label="Ingat saya 30 hari" />
          <button type="button" onClick={() => setForgot((v) => !v)} className="text-[13.5px] font-semibold text-teal-800 hover:underline">
            Lupa kata sandi?
          </button>
        </div>
        {error ? (
          <Note tone="danger" role="alert">
            {error}
          </Note>
        ) : null}
        <Button type="submit" variant="primary" size="lg" disabled={busy} className="w-full">
          {busy ? "Memeriksa…" : "Masuk"}
        </Button>
      </form>
      {forgot ? (
        <form onSubmit={sendForgot} className="border-line bg-wash/60 mt-4 rounded-lg border p-4">
          <Field label="Email akun" htmlFor="femail" hint="Tautan pemulihan dikirim ke email (dan WhatsApp bila terdaftar), berlaku 30 menit.">
            <div className="flex gap-2">
              <Input id="femail" name="femail" type="email" required />
              <Button type="submit">Kirim</Button>
            </div>
          </Field>
          {forgotMsg ? <p className="mt-2 text-[13.5px] text-teal-900">{forgotMsg}</p> : null}
        </form>
      ) : null}
      <p className="text-muted mt-6 text-center text-[14px]">
        Belum punya akun?{" "}
        <Link href="/register" className="font-semibold text-teal-800 hover:underline">
          Daftar
        </Link>
      </p>
    </div>
  );
}

export function pwScore(pw: string): number {
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw) || /[^A-Za-z0-9]/.test(pw)) s++;
  return Math.min(s, 4);
}

export function PasswordMeter({ pw }: { pw: string }) {
  const s = pwScore(pw);
  const label = !pw
    ? "Minimal 8 karakter dengan huruf besar, kecil, dan angka."
    : s <= 1
      ? "Terlalu lemah"
      : s === 2
        ? "Cukup"
        : s === 3
          ? "Kuat"
          : "Sangat kuat";
  const color = s <= 1 ? "bg-danger" : s === 2 ? "bg-warn" : "bg-ok";
  return (
    <div className="mt-2" aria-live="polite">
      <div className="grid grid-cols-4 gap-1">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={"h-1.5 rounded-full " + (pw && i < s ? color : "bg-wash-2")} />
        ))}
      </div>
      <p className="text-muted mt-1.5 text-[12.5px]">{label}</p>
    </div>
  );
}

const ROLE_INFO: Record<Role, { title: string; codeLabel: string; hint: string; required: boolean }> = {
  parent: {
    title: "Orang tua / wali",
    codeLabel: "Kode anak (opsional)",
    hint: "Kode seperti KA-2201 yang diberikan daycare saat anak Anda didaftarkan. Belum punya? Kosongkan; anak bisa ditautkan nanti dari Beranda.",
    required: false,
  },
  caregiver: {
    title: "Pengasuh",
    codeLabel: "Kode undangan staf",
    hint: "Dibuat oleh admin daycare tempat Anda bekerja, berlaku terbatas dan umumnya sekali pakai.",
    required: true,
  },
  admin: {
    title: "Admin daycare",
    codeLabel: "Kode undangan admin",
    hint: "Dibuat oleh admin daycare yang sudah terdaftar, atau diberikan tim SmartDayCare AI saat fasilitas pertama kali didaftarkan.",
    required: true,
  },
};

export function RegisterForm() {
  const router = useRouter();
  const params = useSearchParams();
  const initialRole = (["parent", "caregiver", "admin"] as const).find((r) => r === params.get("role")) ?? "parent";
  const [role, setRole] = React.useState<Role>(initialRole);
  const [pw, setPw] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const info = ROLE_INFO[role];

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (f.get("consent") !== "on") {
      setError("Centang persetujuan Syarat Layanan dan Kebijakan Privasi.");
      return;
    }
    if (pwScore(pw) < 2) {
      setError("Kata sandi terlalu lemah. Gunakan minimal 8 karakter dengan huruf besar, kecil, dan angka.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<{ token: string }>("/api/auth/register", {
        name: String(f.get("name") ?? "").trim(),
        email: String(f.get("email") ?? "").trim(),
        phone: String(f.get("phone") ?? "").trim(),
        password: pw,
        role,
        code: String(f.get("code") ?? "").trim(),
        consent: true,
      });
      await finishSignIn(r.token, false, "/dashboard?welcome=1", router);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Pendaftaran gagal.");
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <fieldset>
        <legend className="text-ink-2 mb-1.5 block text-[13px] font-semibold">Saya mendaftar sebagai</legend>
        <div className="grid grid-cols-3 gap-2">
          {(Object.keys(ROLE_INFO) as Role[]).map((r) => (
            <label
              key={r}
              className={
                "cursor-pointer rounded-md border px-3 py-2.5 text-center text-[13.5px] font-medium " +
                (role === r ? "border-teal-700 bg-teal-100 text-teal-900" : "border-line-strong bg-surface text-ink-2 hover:border-teal-600")
              }
            >
              <input type="radio" name="role" value={r} checked={role === r} onChange={() => setRole(r)} className="sr-only" />
              {ROLE_INFO[r].title}
            </label>
          ))}
        </div>
      </fieldset>
      <Field label="Nama lengkap" htmlFor="r-name">
        <Input id="r-name" name="name" required minLength={3} autoComplete="name" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Email" htmlFor="r-email">
          <Input id="r-email" name="email" type="email" required autoComplete="email" inputMode="email" />
        </Field>
        <Field label="Nomor WhatsApp" htmlFor="r-phone">
          <Input id="r-phone" name="phone" type="tel" autoComplete="tel" inputMode="tel" placeholder="+62 8xx" />
        </Field>
      </div>
      <Field label={info.codeLabel} htmlFor="r-code" hint={info.hint}>
        <Input id="r-code" name="code" required={info.required} autoCapitalize="characters" className="uppercase" />
      </Field>
      <Field label="Kata sandi" htmlFor="r-pw">
        <PasswordInput id="r-pw" name="password" autoComplete="new-password" value={pw} onChange={setPw} minLength={8} />
        <PasswordMeter pw={pw} />
      </Field>
      <Checkbox
        name="consent"
        label={
          <>
            Saya menyetujui{" "}
            <Link href="/help#syarat" className="font-semibold text-teal-800 hover:underline">
              Syarat Layanan
            </Link>{" "}
            dan{" "}
            <Link href="/help#privasi" className="font-semibold text-teal-800 hover:underline">
              Kebijakan Privasi
            </Link>
            .
          </>
        }
      />
      {error ? (
        <Note tone="danger" role="alert">
          {error}
        </Note>
      ) : null}
      <Button type="submit" variant="primary" size="lg" disabled={busy} className="w-full">
        {busy ? "Membuat akun…" : "Buat akun"}
      </Button>
      <p className="text-muted text-center text-[14px]">
        Sudah punya akun?{" "}
        <Link href="/login" className="font-semibold text-teal-800 hover:underline">
          Masuk
        </Link>
      </p>
    </form>
  );
}
