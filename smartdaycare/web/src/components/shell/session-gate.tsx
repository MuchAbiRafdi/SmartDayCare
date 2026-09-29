"use client";
/* Gerbang halaman terlindung.

   Jalur cepat: server sudah membaca cookie sesi dan mengirim cuplikan status → halaman langsung
   dirender penuh (tanpa jeda). Jalur cadangan: cookie tidak sampai ke server (proxy yang membuang
   Cookie, bingkai lintas situs) → sesi tersimpan di peramban dan status diambil dari sini dengan
   header X-Session. Tanpa keduanya, pengguna diarahkan ke halaman masuk. */
import * as React from "react";
import { api, ApiError } from "@/lib/api";
import { LiveProvider } from "@/lib/live";
import { clearSessionToken, getSessionToken } from "@/lib/session";
import type { Role, State } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/site/logo";

export function SessionGate({ initial, path, roles, children }: { initial: State | null; path: string; roles?: Role[]; children: React.ReactNode }) {
  const [state, setState] = React.useState<State | null>(initial);
  const [error, setError] = React.useState<string | null>(null);
  const [attempt, setAttempt] = React.useState(0);

  // cuplikan baru dari server (mis. setelah router.refresh) menggantikan yang lama; null diabaikan
  React.useEffect(() => {
    if (initial) setState(initial);
  }, [initial]);

  React.useEffect(() => {
    if (state) return;
    const back = "/login?next=" + encodeURIComponent(path);
    if (!getSessionToken()) {
      window.location.replace(back);
      return;
    }
    let cancelled = false;
    setError(null);
    api
      .get<State>("/api/state")
      .then((s) => {
        if (!cancelled) setState(s);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 401) {
          clearSessionToken();
          window.location.replace(back);
          return;
        }
        setError(e instanceof Error ? e.message : "Data tidak dapat dimuat.");
      });
    return () => {
      cancelled = true;
    };
  }, [state, path, attempt]);

  const allowed = state && (!roles || roles.includes(state.me.role));
  React.useEffect(() => {
    if (state && !allowed) window.location.replace("/dashboard?denied=" + encodeURIComponent(path.replace("/", "")));
  }, [state, allowed, path]);

  if (state && allowed) return <LiveProvider initial={state}>{children}</LiveProvider>;

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      <aside className="border-side-line bg-side hidden h-dvh border-r lg:block" aria-hidden>
        <div className="px-4 pt-4 pb-3">
          <Logo dark />
        </div>
      </aside>
      <div className="flex min-w-0 flex-col">
        <header className="border-line bg-surface/92 sticky top-0 z-30 border-b">
          <div className="flex items-center gap-3 px-4 py-2.5 md:px-6">
            <div className="lg:hidden">
              <Logo />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-muted truncate text-[16px] leading-tight font-semibold md:text-[17px]">
                {error ? "Data belum dapat dimuat" : "Membuka data Anda"}
              </h1>
            </div>
          </div>
        </header>
        <main className="px-4 py-6 md:px-6" aria-live="polite">
          {error ? (
            <div className="border-line bg-surface max-w-md rounded-lg border p-5">
              <p className="text-[15px] font-semibold">{error}</p>
              <p className="text-muted mt-1 text-[14px]">Data Anda aman di server; coba muat lagi.</p>
              <div className="mt-4 flex gap-2">
                <Button variant="primary" onClick={() => setAttempt((n) => n + 1)}>
                  Coba lagi
                </Button>
                <Button onClick={() => window.location.assign("/login")}>Masuk kembali</Button>
              </div>
            </div>
          ) : null}
        </main>
      </div>
    </div>
  );
}
