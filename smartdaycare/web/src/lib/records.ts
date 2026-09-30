/* Label, ikon, dan warna catatan rutin (aktivitas, makan, tidur, mood). Sama dengan api/app/labels.py. */
import {
  Baby,
  Blocks,
  BookOpen,
  Brush,
  Cookie,
  Dumbbell,
  Hand,
  MoreHorizontal,
  PersonStanding,
  Puzzle,
  Salad,
  Soup,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { ActivityKind, FoodSlot, MoodKind, Portion, SleepQuality } from "./types";

export type TileTone = "green" | "blue" | "orange" | "red" | "purple" | "teal" | "yellow" | "gray";

export const ACTIVITY: { id: ActivityKind; label: string; icon: LucideIcon; tone: TileTone }[] = [
  { id: "bermain", label: "Bermain Bebas", icon: Blocks, tone: "green" },
  { id: "belajar", label: "Kegiatan Belajar", icon: Puzzle, tone: "blue" },
  { id: "seni", label: "Seni & Kreativitas", icon: Brush, tone: "orange" },
  { id: "motorik_kasar", label: "Motorik Kasar", icon: PersonStanding, tone: "red" },
  { id: "motorik_halus", label: "Motorik Halus", icon: Hand, tone: "purple" },
  { id: "sosial", label: "Kegiatan Sosial", icon: Users, tone: "teal" },
  { id: "membaca", label: "Membaca", icon: BookOpen, tone: "blue" },
  { id: "lainnya", label: "Lainnya", icon: MoreHorizontal, tone: "gray" },
];
export const ACTIVITY_LABEL: Record<string, string> = Object.fromEntries(ACTIVITY.map((a) => [a.id, a.label]));
export const ACTIVITY_COLOR: Record<string, string> = {
  bermain: "#22c55e",
  belajar: "#3b82f6",
  seni: "#f59e0b",
  motorik_kasar: "#ef4444",
  motorik_halus: "#8b5cf6",
  sosial: "#14b8a6",
  membaca: "#0ea5e9",
  lainnya: "#94a3b8",
};

export const FOOD_SLOTS: { id: FoodSlot; label: string; time: string }[] = [
  { id: "breakfast", label: "Sarapan", time: "07.30" },
  { id: "snack_am", label: "Snack Pagi", time: "09.45" },
  { id: "lunch", label: "Makan Siang", time: "11.45" },
  { id: "snack_pm", label: "Snack Sore", time: "15.00" },
];
export const FOOD_SLOT_LABEL: Record<string, string> = Object.fromEntries(FOOD_SLOTS.map((f) => [f.id, f.label]));
export const SLOT_COLOR: Record<string, string> = { breakfast: "#f59e0b", snack_am: "#22c55e", lunch: "#3b82f6", snack_pm: "#ec4899" };

export const MENU_OPTIONS: { id: string; label: string; icon: LucideIcon }[] = [
  { id: "Nasi", label: "Nasi", icon: Soup },
  { id: "Sayur", label: "Sayur", icon: Salad },
  { id: "Ayam", label: "Ayam", icon: Dumbbell },
  { id: "Ikan", label: "Ikan", icon: Soup },
  { id: "Telur", label: "Telur", icon: Cookie },
  { id: "Buah", label: "Buah", icon: Salad },
  { id: "Susu", label: "Susu", icon: Baby },
  { id: "Roti", label: "Roti", icon: Cookie },
  { id: "lainnya", label: "Lainnya", icon: MoreHorizontal },
];

export const PORTIONS: { id: Portion; label: string; tone: TileTone; score: number }[] = [
  { id: "habis", label: "Habis", tone: "green", score: 100 },
  { id: "setengah", label: "Setengah", tone: "blue", score: 50 },
  { id: "sedikit", label: "Sedikit", tone: "orange", score: 25 },
  { id: "tidak", label: "Tidak Makan", tone: "red", score: 0 },
];
export const PORTION_LABEL: Record<string, string> = Object.fromEntries(PORTIONS.map((p) => [p.id, p.label]));

export const SLEEP_KINDS = [
  { id: "siang" as const, label: "Tidur Siang" },
  { id: "tambahan" as const, label: "Tidur Tambahan" },
];
export const SLEEP_QUALITY: { id: SleepQuality; label: string; tone: TileTone; emoji: string }[] = [
  { id: "sangat_baik", label: "Sangat Baik", tone: "green", emoji: "😄" },
  { id: "baik", label: "Baik", tone: "blue", emoji: "🙂" },
  { id: "cukup", label: "Cukup", tone: "orange", emoji: "😐" },
  { id: "kurang", label: "Kurang", tone: "red", emoji: "😣" },
];

export const MOODS: { id: MoodKind; label: string; tone: TileTone; emoji: string; score: number }[] = [
  { id: "sangat_senang", label: "Sangat Senang", tone: "green", emoji: "😄", score: 5 },
  { id: "senang", label: "Senang", tone: "yellow", emoji: "😊", score: 4 },
  { id: "netral", label: "Netral", tone: "blue", emoji: "😐", score: 3 },
  { id: "sedih", label: "Sedih", tone: "purple", emoji: "😢", score: 2 },
  { id: "marah", label: "Marah", tone: "red", emoji: "😠", score: 1 },
  { id: "lelah", label: "Lelah", tone: "gray", emoji: "😴", score: 2.5 },
];
export const MOOD_BY_ID: Record<string, (typeof MOODS)[number]> = Object.fromEntries(MOODS.map((m) => [m.id, m]));

export function moodEmojiFor(score: number | null | undefined): string {
  if (score == null) return "–";
  if (score >= 4.5) return "😄";
  if (score >= 3.5) return "😊";
  if (score >= 2.75) return "😐";
  if (score >= 2) return "😢";
  return "😠";
}

export function moodLabelFor(score: number | null | undefined): string {
  if (score == null) return "Belum ada data";
  if (score >= 4.5) return "Sangat Senang";
  if (score >= 3.5) return "Senang";
  if (score >= 2.75) return "Netral";
  if (score >= 2) return "Kurang ceria";
  return "Perlu perhatian";
}

export function fmtMinutes(min: number): string {
  const m = Math.max(0, Math.round(min));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h && r) return `${h} j ${r} mnt`;
  if (h) return `${h} jam`;
  return `${r} mnt`;
}

export function fmtHours(min: number): { big: string; small: string } {
  const m = Math.max(0, Math.round(min));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (!h) return { big: `${r}`, small: "menit" };
  return { big: `${h} jam`, small: r ? `${r} menit` : "" };
}

/** Kelas warna latar/teks untuk ubin ikon (sesuai palet mockup). */
export const TONE_CLASS: Record<TileTone, string> = {
  green: "bg-emerald-50 text-emerald-600",
  blue: "bg-blue-50 text-blue-600",
  orange: "bg-orange-50 text-orange-500",
  red: "bg-rose-50 text-rose-500",
  purple: "bg-violet-50 text-violet-600",
  teal: "bg-teal-50 text-teal-600",
  yellow: "bg-amber-50 text-amber-500",
  gray: "bg-slate-100 text-slate-500",
};
export const TONE_RING: Record<TileTone, string> = {
  green: "border-emerald-500 ring-emerald-500/20",
  blue: "border-blue-500 ring-blue-500/20",
  orange: "border-orange-400 ring-orange-400/20",
  red: "border-rose-500 ring-rose-500/20",
  purple: "border-violet-500 ring-violet-500/20",
  teal: "border-teal-500 ring-teal-500/20",
  yellow: "border-amber-400 ring-amber-400/20",
  gray: "border-slate-400 ring-slate-400/20",
};
