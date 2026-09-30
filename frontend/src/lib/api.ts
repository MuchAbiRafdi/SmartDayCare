/* Klien API. Di peramban memanggil jalur relatif /api/* (diteruskan Next.js ke layanan API);
   di server memanggil API_URL langsung sambil meneruskan cookie pengguna. */
import { getSessionToken } from "./session";
import type { PublicSummary, State, User } from "./types";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function csrfToken(): string {
  if (typeof document === "undefined") return "";
  try {
    const m = document.cookie.match(/(?:^|;\s*)sd_csrf=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : "";
  } catch {
    return "";
  }
}

/* Header yang menyertai setiap permintaan dari peramban:
   - X-Requested-With: bukti permintaan berasal dari klien kita (situs lain tidak bisa
     menambahkannya tanpa izin CORS), dipakai server saat Origin/Referer diubah proxy;
   - X-Session: token sesi, hanya ada bila cookie terbukti tidak sampai ke server. */
export function authHeaders(): Record<string, string> {
  const h: Record<string, string> = { "X-Requested-With": "SmartDaycare" };
  const token = getSessionToken();
  if (token) h["X-Session"] = token;
  return h;
}

/** Apakah cookie sesi benar-benar sampai ke server? (tanpa header X-Session, tanpa cache) */
export async function cookieSessionWorks(): Promise<boolean> {
  try {
    const res = await fetch("/api/auth/me", { credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" } });
    return res.ok;
  } catch {
    return false;
  }
}

const UNREACHABLE = "Layanan sedang tidak dapat dihubungi. Coba lagi beberapa saat lagi.";

async function parse<T>(res: Response): Promise<T> {
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const d = data as { detail?: unknown } | null;
    let msg: string;
    if (typeof d?.detail === "string") msg = d.detail;
    else if (res.status === 401) msg = "Sesi berakhir. Silakan masuk kembali.";
    else if (res.status === 429) msg = "Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.";
    else if (res.status === 403) msg = "Permintaan ditolak. Muat ulang halaman lalu coba lagi.";
    else if (res.status >= 502 || (res.status === 500 && data === null)) msg = UNREACHABLE;
    else msg = "Permintaan gagal (" + res.status + ").";
    throw new ApiError(res.status, msg);
  }
  return data as T;
}

/* Batas waktu permintaan dari peramban. Tanpa ini, server/proxy yang diam membuat tombol
   "Memeriksa…" menunggu tanpa akhir. Unggahan foto piring diberi waktu lebih panjang. */
const TIMEOUT_MS = 20_000;
const UPLOAD_TIMEOUT_MS = 45_000;

async function safeFetch(input: string, init: RequestInit, timeoutMs = TIMEOUT_MS): Promise<Response> {
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: ctrl.signal });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      throw new ApiError(0, "Server tidak merespons. Periksa koneksi Anda lalu coba lagi.");
    }
    // jaringan putus / permintaan diblokir sebelum sampai ke server
    throw new ApiError(0, "Tidak ada koneksi. Periksa jaringan Anda lalu coba lagi.");
  } finally {
    window.clearTimeout(timer);
  }
}

/** Panggilan dari komponen klien. */
export const api = {
  async get<T>(path: string): Promise<T> {
    const res = await safeFetch(path, { credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json", ...authHeaders() } });
    return parse<T>(res);
  },
  async send<T>(method: "POST" | "PUT" | "PATCH" | "DELETE", path: string, body?: unknown): Promise<T> {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const res = await safeFetch(
      path,
      {
        method,
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", Accept: "application/json", "X-CSRF-Token": csrfToken(), ...authHeaders() },
        body: payload,
      },
      payload && payload.length > 50_000 ? UPLOAD_TIMEOUT_MS : TIMEOUT_MS,
    );
    return parse<T>(res);
  },
  post<T>(path: string, body?: unknown): Promise<T> {
    return api.send<T>("POST", path, body);
  },
  put<T>(path: string, body?: unknown): Promise<T> {
    return api.send<T>("PUT", path, body);
  },
  patch<T>(path: string, body?: unknown): Promise<T> {
    return api.send<T>("PATCH", path, body);
  },
  del<T>(path: string): Promise<T> {
    return api.send<T>("DELETE", path);
  },
  /** Ambil berkas (foto, CSV) dengan kredensial yang sama seperti permintaan JSON. */
  async blob(path: string): Promise<Blob> {
    const res = await safeFetch(path, { credentials: "same-origin", headers: authHeaders() });
    if (!res.ok) await parse<unknown>(res);
    return res.blob();
  },
};

/* ---- Sisi server (komponen server / route handler) --------------------------------------- */

const API_URL = process.env.API_URL ?? "http://127.0.0.1:8000";

async function serverFetch<T>(path: string, cookie: string): Promise<T | null> {
  try {
    const res = await fetch(API_URL + path, { headers: { cookie, Accept: "application/json" }, cache: "no-store" });
    if (res.status === 401 || res.status === 403) return null;
    if (!res.ok) throw new ApiError(res.status, "API " + res.status);
    return (await res.json()) as T;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(503, "Layanan API tidak dapat dihubungi.");
  }
}

export async function fetchMe(cookie: string): Promise<{ user: User; session: { createdAt: string; expiresAt: string; remember: boolean } } | null> {
  return serverFetch("/api/auth/me", cookie);
}

export async function fetchState(cookie: string): Promise<State | null> {
  return serverFetch<State>("/api/state", cookie);
}

export async function fetchPublic(): Promise<PublicSummary | null> {
  try {
    return await serverFetch<PublicSummary>("/api/public", "");
  } catch {
    return null;
  }
}
