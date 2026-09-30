"use client";
import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Note } from "@/components/ui/panel";
import { PasswordInput, PasswordMeter, pwScore } from "@/components/auth/auth-forms";

/** Formulir kata sandi baru dari tautan email `/reset?token=…`. */
export function ResetForm() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [pw, setPw] = React.useState("");
  const [pw2, setPw2] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<{ message: string; email: string } | null>(null);

  if (!token) {
    return (
      <Note tone="warn">
        Tautan ini tidak lengkap. Buka kembali tautan dari email pemulihan, atau{" "}
        <Link href="/login" className="font-semibold text-teal-800 hover:underline">
          minta tautan baru
        </Link>
        .
      </Note>
    );
  }
  if (done) {
    return (
      <div className="grid gap-4">
        <Note tone="ok" role="status">
          {done.message}
        </Note>
        <Link href={"/login?email=" + encodeURIComponent(done.email)} className={buttonVariants({ variant: "primary", size: "lg" }) + " w-full"}>
          Masuk sekarang
        </Link>
      </div>
    );
  }

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    if (pwScore(pw) < 2) return setError("Kata sandi terlalu lemah. Gunakan minimal 8 karakter dengan huruf besar, kecil, dan angka.");
    if (pw !== pw2) return setError("Ulangi kata sandi belum sama.");
    setBusy(true);
    try {
      const r = await api.post<{ message: string; email: string }>("/api/auth/reset", { token, password: pw });
      setDone(r);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Tidak dapat mengganti kata sandi sekarang.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <Field label="Kata sandi baru" htmlFor="pw">
        <PasswordInput id="pw" name="pw" autoComplete="new-password" value={pw} onChange={setPw} minLength={8} />
        <PasswordMeter pw={pw} />
      </Field>
      <Field label="Ulangi kata sandi" htmlFor="pw2">
        <PasswordInput id="pw2" name="pw2" autoComplete="new-password" value={pw2} onChange={setPw2} minLength={8} />
      </Field>
      {error ? (
        <Note tone="danger" role="alert">
          {error}
        </Note>
      ) : null}
      <Button type="submit" variant="primary" size="lg" disabled={busy} className="w-full">
        {busy ? "Menyimpan…" : "Simpan kata sandi baru"}
      </Button>
      <p className="text-muted text-center text-[13.5px]">Tautan pemulihan hanya berlaku 30 menit dan sekali pakai.</p>
    </form>
  );
}

/** Halaman `/verify?token=…`: memverifikasi alamat email begitu dibuka. */
export function VerifyEmail() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [result, setResult] = React.useState<{ ok: boolean; message: string } | null>(null);

  React.useEffect(() => {
    if (!token) return;
    let alive = true;
    api
      .post<{ message: string }>("/api/auth/verify", { token })
      .then((r) => alive && setResult({ ok: true, message: r.message }))
      .catch((err: unknown) => alive && setResult({ ok: false, message: err instanceof ApiError ? err.message : "Tidak dapat memverifikasi sekarang." }));
    return () => {
      alive = false;
    };
  }, [token]);

  if (!token) return <Note tone="warn">Tautan ini tidak lengkap. Buka kembali tautan dari email verifikasi.</Note>;
  if (!result) return <p className="text-muted text-[15px]">Memeriksa tautan…</p>;
  return (
    <div className="grid gap-4">
      <Note tone={result.ok ? "ok" : "warn"} role="status">
        {result.message}
      </Note>
      <Link href="/dashboard" className={buttonVariants({ variant: "primary", size: "lg" }) + " w-full"}>
        Lanjut ke dasbor
      </Link>
    </div>
  );
}
