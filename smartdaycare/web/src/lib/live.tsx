"use client";
/* Status aplikasi di klien: cuplikan awal dari server, lalu diperbarui lewat aliran peristiwa
   (SSE). Perubahan catatan memicu pengambilan ulang /api/state; pembacaan udara masuk langsung. */
import * as React from "react";
import { useRouter } from "next/navigation";
import { api, ApiError, authHeaders } from "./api";
import { clearSessionToken } from "./session";
import { openEventStream } from "./sse";
import { useToast } from "@/components/ui/toast";
import type { AirSnapshot, State } from "./types";

interface ChangeEvent {
  kind: string;
  id?: string;
  type?: string;
  childId?: string | null;
  child?: string | null;
  title?: string;
  sev?: string;
  silent?: boolean;
}

interface LiveCtx {
  state: State;
  now: Date;
  refresh: () => Promise<void>;
  connected: boolean;
  patch: (fn: (s: State) => State) => void;
}

const Ctx = React.createContext<LiveCtx | null>(null);

export function useLive(): LiveCtx {
  const v = React.useContext(Ctx);
  if (!v) throw new Error("useLive dipakai di luar LiveProvider");
  return v;
}

export function LiveProvider({ initial, children }: { initial: State; children: React.ReactNode }) {
  const [state, setState] = React.useState<State>(initial);
  const [now, setNow] = React.useState(() => new Date());
  const [connected, setConnected] = React.useState(false);
  const toast = useToast();
  const router = useRouter();
  const meId = initial.me.id;
  const timer = React.useRef<number | null>(null);
  const lastToast = React.useRef<string>("");
  // Referensi stabil agar aliran peristiwa tidak dibuka ulang setiap komponen server dirender ulang.
  const meRef = React.useRef(initial.me);
  const toastRef = React.useRef(toast);
  React.useEffect(() => {
    meRef.current = initial.me;
    toastRef.current = toast;
  });
  // Cuplikan baru dari server (mis. setelah router.refresh) menggantikan cuplikan lama.
  React.useEffect(() => {
    setState(initial);
  }, [initial]);

  // Satu pengambilan status pada satu waktu; permintaan yang datang saat masih berjalan ikut menunggu.
  const inflight = React.useRef<Promise<void> | null>(null);
  const refresh = React.useCallback((): Promise<void> => {
    if (inflight.current) return inflight.current;
    const p = (async () => {
      try {
        const s = await api.get<State>("/api/state");
        setState(s);
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          clearSessionToken();
          router.replace("/login?next=" + encodeURIComponent(window.location.pathname));
        }
      } finally {
        inflight.current = null;
      }
    })();
    inflight.current = p;
    return p;
  }, [router]);

  // jam aplikasi: cukup tiap 30 detik untuk linimasa & status kehadiran
  React.useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  React.useEffect(() => {
    const schedule = () => {
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        // bila pengambilan sedang berjalan, ambil sekali lagi setelahnya agar perubahan terbaru ikut
        const cur = inflight.current;
        if (cur) void cur.then(() => refresh());
        else void refresh();
      }, 180);
    };
    const stream = openEventStream("/api/events", authHeaders, {
      onOpen: () => setConnected(true),
      onClose: () => setConnected(false),
      onEvent: (name, data) => {
        if (name === "air") {
          const air = JSON.parse(data) as AirSnapshot;
          setState((s) => ({ ...s, air }));
          return;
        }
        if (name !== "change") return;
        const c = JSON.parse(data) as ChangeEvent;
        schedule();
        if (c.kind !== "log" || !c.id || c.id === lastToast.current) return;
        lastToast.current = c.id;
        const me = meRef.current;
        if (me.role === "parent") {
          const mine = c.childId && me.children.includes(c.childId);
          if (mine && !c.silent && c.type !== "plate" && c.child && c.title)
            toastRef.current(c.child.split(" ")[0] + ": " + c.title, c.sev === "high" ? "err" : "info");
        }
      },
    });
    const onVis = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      stream.close();
      document.removeEventListener("visibilitychange", onVis);
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [refresh, meId]);

  const patch = React.useCallback((fn: (s: State) => State) => setState(fn), []);
  const value = React.useMemo(() => ({ state, now, refresh, connected, patch }), [state, now, refresh, connected, patch]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Tab berbasis hash URL (#id) agar tautan seperti /account#pemberitahuan tetap bekerja. */
export function useHashTab(ids: readonly string[], fallback: string): [string, (id: string) => void] {
  const [tab, setTabState] = React.useState(fallback);
  React.useEffect(() => {
    const read = () => {
      const h = window.location.hash.replace(/^#/, "");
      setTabState(ids.includes(h) ? h : fallback);
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, [ids, fallback]);
  const setTab = React.useCallback((id: string) => {
    if (window.location.hash !== "#" + id) history.pushState(null, "", "#" + id);
    setTabState(id);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    window.scrollTo({ top: 0 });
  }, []);
  return [tab, setTab];
}

/** Pembantu aksi formulir: status tombol + pesan galat ramah. */
export function useAction() {
  const [busy, setBusy] = React.useState(false);
  const toast = useToast();
  const run = React.useCallback(
    async <T,>(fn: () => Promise<T>, opts: { ok?: string | ((r: T) => string); silent?: boolean } = {}): Promise<T | null> => {
      setBusy(true);
      try {
        const r = await fn();
        if (opts.ok && !opts.silent) toast(typeof opts.ok === "function" ? opts.ok(r) : opts.ok, "ok");
        return r;
      } catch (e) {
        toast(e instanceof Error ? e.message : "Terjadi kesalahan.", "err");
        return null;
      } finally {
        setBusy(false);
      }
    },
    [toast],
  );
  return { busy, run };
}
