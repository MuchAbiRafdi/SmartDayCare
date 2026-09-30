import type { Role, Sev } from "./types";

const TZ = "Asia/Jakarta";

/** "HH:MM" dari ISO UTC menurut waktu Indonesia bagian barat. */
export function fmtTime(iso: string | undefined | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TZ }).format(d).replace(":", ".");
}

/** "HH:MM" dari string jam "07:42" → "07.42" */
export function clock(t: string | undefined | null): string {
  return t ? t.replace(":", ".") : "—";
}

export function fmtDate(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: TZ }).format(d);
}

export function fmtDateShort(iso: string): string {
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TZ })
    .format(new Date(iso))
    .replace(/\./g, ":")
    .replace(/(\d{2}):(\d{2})$/, "$1.$2");
}

/** "3 Okt 2026" dari ISO. */
export function fmtDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: TZ }).format(d);
}

export function fmtNum(v: number, digits = 0): string {
  return new Intl.NumberFormat("id-ID", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v);
}

export function fmtTemp(v: number): string {
  return fmtNum(v, 1) + "°C";
}

export function fmtRupiah(v: number): string {
  return "Rp " + new Intl.NumberFormat("id-ID").format(v);
}

export function isoDate(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: TZ }).format(d);
}

/** "HH:MM" waktu sekarang dalam WIB (untuk perbandingan dengan jadwal dasar "07:42"). */
export function nowClock(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TZ }).format(d);
}

/** Awal hari ini (WIB) dalam ISO UTC. */
export function todayStartIso(d: Date = new Date()): string {
  const day = isoDate(d);
  // WIB = UTC+7 sepanjang tahun
  return new Date(day + "T00:00:00+07:00").toISOString();
}

export function isToday(iso: string): boolean {
  const start = todayStartIso();
  const end = new Date(new Date(start).getTime() + 24 * 3600e3).toISOString();
  return iso >= start && iso < end;
}

/** Ubah jam "HH:MM" hari ini menjadi ISO UTC (untuk mengurutkan data dasar bersama catatan). */
export function clockToIso(t: string, d: Date = new Date()): string {
  return new Date(isoDate(d) + "T" + t + ":00+07:00").toISOString();
}

export function greeting(d: Date = new Date()): string {
  const h = Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: TZ }).format(d));
  if (h < 11) return "Selamat pagi";
  if (h < 15) return "Selamat siang";
  if (h < 18) return "Selamat sore";
  return "Selamat malam";
}

export const ROLE_LABEL: Record<Role | "system", string> = {
  parent: "Orang tua",
  caregiver: "Pengasuh",
  admin: "Admin daycare",
  system: "Sistem",
};

export const SEV_LABEL: Record<Sev, string> = { high: "Penting", medium: "Perhatian", low: "Info" };

export const MEAL_LABEL: Record<string, string> = {
  lunch: "Makan siang",
  snack_am: "Camilan pagi",
  snack_pm: "Camilan sore",
  breakfast: "Sarapan",
};

export function mealLabel(k: string | null | undefined): string {
  return MEAL_LABEL[k ?? "lunch"] ?? "Makan";
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export function pluralAnak(n: number): string {
  return `${n} anak`;
}

export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}
