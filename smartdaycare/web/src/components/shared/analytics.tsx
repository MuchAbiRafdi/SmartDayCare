"use client";
/* Dasbor analitik perkembangan (Tema 4) + lapisan insight yang dapat dijelaskan.
   Semua angka berasal dari /api/analytics/{anak}: catatan pengasuh → deret harian → indikator →
   insight (tren/pola/anomali) → rekomendasi. Komponen ini hanya menampilkannya. */
import * as React from "react";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Brain,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  Hand,
  Heart,
  HelpCircle,
  Lightbulb,
  Moon,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  TrendingDown,
  TrendingUp,
  UserCheck,
  Users,
  Utensils,
} from "lucide-react";
import { api } from "@/lib/api";
import { MODEL_URLS } from "@/lib/foodnet";
import { CATS } from "@/lib/vision";
import type { ScannerQuality as ScannerQualityData } from "@/lib/types";
import { cn, fmtDate, fmtNum, isoDate } from "@/lib/format";
import { useLive } from "@/lib/live";
import { ACTIVITY, ACTIVITY_COLOR, FOOD_SLOTS, SLOT_COLOR, fmtHours, fmtMinutes, moodEmojiFor } from "@/lib/records";
import type { Analytics, Child, Insight, ProfileArea } from "@/lib/types";
import { BarChart, MoodLine, MultiLine, StackedBars, Donut } from "@/components/charts/charts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, Note, Panel, PanelBody, PanelHead } from "@/components/ui/panel";

/* ---------------------------------------------------------------- data ---- */

export function useAnalytics(childId: string | undefined, days: number, end?: string) {
  const { state } = useLive();
  const [data, setData] = React.useState<Analytics | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const version = state.serverTime;
  React.useEffect(() => {
    if (!childId) return;
    let live = true;
    const q = new URLSearchParams({ days: String(days) });
    if (end) q.set("end", end);
    api
      .get<Analytics>(`/api/analytics/${childId}?${q}`)
      .then((a) => {
        if (live) {
          setData(a);
          setError(null);
        }
      })
      .catch((e: unknown) => {
        if (live) setError(e instanceof Error ? e.message : "Gagal memuat analitik.");
      });
    return () => {
      live = false;
    };
  }, [childId, days, end, version]);
  return { data, error };
}

/** Tanggal (YYYY-MM-DD) dalam WIB — sama dengan "hari ini" di server, di mana pun peramban berada. */
const isoDay = (d: Date): string => isoDate(d);

/** Pengendali rentang: ‹ 22/09 – 28/09/2026 › + pilihan periode. */
export function useRange(initialDays = 7) {
  const [days, setDays] = React.useState(initialDays);
  const [end, setEnd] = React.useState<string>(() => isoDay(new Date()));
  const today = isoDay(new Date());
  const shift = (dir: -1 | 1) => {
    const d = new Date(end + "T12:00:00+07:00");
    d.setUTCDate(d.getUTCDate() + dir * days);
    const next = isoDay(d);
    setEnd(next > today ? today : next);
  };
  return { days, setDays, end, setEnd, shift, isCurrent: end === today, reset: () => setEnd(today) };
}

export function RangeControl({ range, label, withPeriod = true }: { range: ReturnType<typeof useRange>; label?: string; withPeriod?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {withPeriod ? (
        <div className="flex gap-1" role="tablist" aria-label="Periode">
          {[
            [7, "Mingguan"],
            [30, "Bulanan"],
            [180, "Semester"],
          ].map(([d, l]) => (
            <button
              key={d}
              type="button"
              role="tab"
              aria-selected={range.days === d}
              className={cn("chip h-8", range.days === d && "active")}
              onClick={() => range.setDays(Number(d))}
            >
              {l}
            </button>
          ))}
        </div>
      ) : null}
      <div className="border-line bg-surface inline-flex h-9 items-center rounded-[10px] border text-[13.5px]">
        <button type="button" className="hover:bg-wash rounded-l-[10px] px-2 py-1.5" aria-label="Periode sebelumnya" onClick={() => range.shift(-1)}>
          <ChevronLeft size={16} />
        </button>
        <span className="px-1.5 font-medium tabular-nums">{label ?? "–"}</span>
        <button
          type="button"
          className="hover:bg-wash rounded-r-[10px] px-2 py-1.5 disabled:opacity-40"
          aria-label="Periode berikutnya"
          disabled={range.isCurrent}
          onClick={() => range.shift(1)}
        >
          <ChevronRight size={16} />
        </button>
      </div>
      {!range.isCurrent ? (
        <Button size="sm" variant="ghost" onClick={range.reset}>
          Hari ini
        </Button>
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------------------- KPI ---- */

export function KpiCards({ a }: { a: Analytics }) {
  const c = a.current;
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <div className="kpi">
        <span className="kpi-icon bg-blue-50 text-blue-600">
          <UserCheck size={20} />
        </span>
        <div className="min-w-0">
          <div className="text-muted text-[12.5px] font-medium">Kehadiran</div>
          <div className="kpi-value">
            {c.presentDays} / {c.schoolDays}
            <small>hari</small>
          </div>
        </div>
      </div>
      <div className="kpi">
        <span className="kpi-icon bg-pink-50 text-pink-500">
          <Activity size={20} />
        </span>
        <div className="min-w-0">
          <div className="text-muted text-[12.5px] font-medium">Total Aktivitas</div>
          <div className="kpi-value">
            {c.activities}
            <small>kegiatan</small>
          </div>
        </div>
      </div>
      <div className="kpi">
        <span className="kpi-icon bg-amber-50 text-[22px]">{c.moodEmoji}</span>
        <div className="min-w-0">
          <div className="text-muted text-[12.5px] font-medium">Rata-rata Mood</div>
          <div className="kpi-value">
            {c.moodAvg != null ? c.moodAvg.toFixed(1).replace(".", ",") : "–"}
            <small>/ 5 · {c.moodLabel}</small>
          </div>
        </div>
      </div>
      <div className="kpi">
        <span className="kpi-icon bg-violet-50 text-violet-600">
          <Moon size={20} />
        </span>
        <div className="min-w-0">
          <div className="text-muted text-[12.5px] font-medium">Total Tidur</div>
          <div className="kpi-value">
            {c.sleepAvg ? fmtMinutes(c.sleepAvg) : "–"}
            <small>per hari</small>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- pengelompokan titik grafik ---- */

export interface Point {
  label: string;
  /** Label pendek untuk sumbu (kosong bila dilewati agar tidak bertumpuk). */
  tick: string;
  activities: number;
  byKind: Record<string, number>;
  mood: number | null;
  sleepMinutes: number;
  meals: Record<string, number>;
  mealAvg: number | null;
  present: number;
  school: number;
}

function avg(xs: number[]): number | null {
  return xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100 : null;
}

function dm(date: string): string {
  return `${Number(date.slice(8, 10))}/${Number(date.slice(5, 7))}`;
}

/** Titik grafik: ≤14 hari → per hari; ≤60 hari → per hari sekolah (label jarang); lebih → per minggu. */
export function chartPoints(a: Analytics): { points: Point[]; unit: "hari" | "minggu" } {
  const days = a.days;
  if (a.range.days <= 14) {
    return {
      unit: "hari",
      points: days.map((d) => ({
        label: d.label,
        tick: d.label,
        activities: d.activities,
        byKind: d.byKind,
        mood: d.mood,
        sleepMinutes: d.sleepMinutes,
        meals: d.meals,
        mealAvg: d.mealAvg,
        present: d.present ? 1 : 0,
        school: d.school ? 1 : 0,
      })),
    };
  }
  if (a.range.days <= 60) {
    const school = days.filter((d) => d.school);
    const every = Math.max(1, Math.ceil(school.length / 8));
    return {
      unit: "hari",
      points: school.map((d, i) => ({
        label: d.label + " " + dm(d.date),
        tick: i % every === 0 || i === school.length - 1 ? dm(d.date) : "",
        activities: d.activities,
        byKind: d.byKind,
        mood: d.mood,
        sleepMinutes: d.sleepMinutes,
        meals: d.meals,
        mealAvg: d.mealAvg,
        present: d.present ? 1 : 0,
        school: 1,
      })),
    };
  }
  return { unit: "minggu", points: weekPoints(days) };
}

/** Rangkuman per minggu (Senin–Minggu): jumlah kegiatan, rata-rata mood/tidur/porsi, hari hadir. */
export function weekPoints(days: Analytics["days"]): Point[] {
  const weeks: Point[] = [];
  let cur: (typeof days)[number][] = [];
  const flush = () => {
    if (!cur.length) return;
    const first = cur[0];
    const byKind: Record<string, number> = {};
    const meals: Record<string, number[]> = {};
    for (const d of cur) {
      for (const [k, v] of Object.entries(d.byKind)) byKind[k] = (byKind[k] ?? 0) + v;
      for (const [k, v] of Object.entries(d.meals)) (meals[k] ??= []).push(v);
    }
    const mealsAvg: Record<string, number> = {};
    for (const [k, v] of Object.entries(meals)) mealsAvg[k] = avg(v) ?? 0;
    const sleeping = cur.filter((d) => d.sleepMinutes > 0).map((d) => d.sleepMinutes);
    weeks.push({
      label: "Minggu " + dm(first.date),
      tick: dm(first.date),
      activities: cur.reduce((x, d) => x + d.activities, 0),
      byKind,
      mood: avg(cur.map((d) => d.mood).filter((m): m is number => m != null)),
      sleepMinutes: Math.round(avg(sleeping) ?? 0),
      meals: mealsAvg,
      mealAvg: avg(cur.map((d) => d.mealAvg).filter((m): m is number => m != null)),
      present: cur.filter((d) => d.present).length,
      school: cur.filter((d) => d.school).length,
    });
    cur = [];
  };
  for (const d of days) {
    if (cur.length && new Date(d.date + "T12:00:00+07:00").getDay() === 1) flush();
    cur.push(d);
  }
  flush();
  /* minggu di tepi rentang yang baru berisi 1–2 hari sekolah (mis. rentang mulai Sabtu, atau minggu
     yang sedang berjalan pada hari Senin) tidak digambar: jumlahnya pasti kecil dan terbaca seolah
     anjlok. Angka harinya tetap masuk ke KPI dan tabel. */
  const partial = (w: Point) => w.school < 3;
  while (weeks.length > 2 && partial(weeks[0])) weeks.shift();
  while (weeks.length > 2 && partial(weeks[weeks.length - 1])) weeks.pop();
  const every = Math.max(1, Math.ceil(weeks.length / 9));
  weeks.forEach((w, i) => {
    if (i % every !== 0 && i !== weeks.length - 1) w.tick = "";
  });
  return weeks;
}

/* ---------------------------------------------------------------- grafik ---- */

export function TrendCharts({ a }: { a: Analytics }) {
  const { points, unit } = chartPoints(a);
  const ticks = points.map((p) => p.tick);
  const per = unit === "minggu" ? "per minggu penuh" : "per hari";
  const slots = FOOD_SLOTS.map((f) => ({ key: f.id, label: f.label, color: SLOT_COLOR[f.id], values: points.map((p) => (p.meals[f.id] ?? 0) / 100) }));
  const mealsPerDay = a.current.mealCount && a.current.presentDays ? Math.round((a.current.mealCount / a.current.presentDays) * 10) / 10 : 0;
  const sleepAvg = fmtHours(a.current.sleepAvg);
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Panel>
        <PanelHead title="Tren Aktivitas Harian" desc={`Jumlah kegiatan tercatat ${per}.`} level={3} />
        <PanelBody className="pt-3">
          <BarChart
            values={points.map((p) => p.activities)}
            labels={ticks}
            unit="kegiatan"
            step={unit === "minggu" ? 10 : 5}
            ariaLabel={"Aktivitas " + per + ": " + points.map((p) => p.label + " " + p.activities).join(", ")}
          />
        </PanelBody>
      </Panel>
      <Panel>
        <PanelHead title="Tren Mood" desc={`Rata-rata mood ${per} (1 = marah, 5 = sangat senang).`} level={3} />
        <PanelBody className="pt-3">
          <MoodLine
            values={points.map((p) => p.mood)}
            labels={ticks}
            ariaLabel={"Mood " + per + ": " + points.map((p) => p.label + " " + (p.mood ?? "-")).join(", ")}
          />
        </PanelBody>
      </Panel>
      <Panel>
        <PanelHead title="Pola Tidur" desc={unit === "minggu" ? "Rata-rata tidur siang per hari, tiap minggu." : "Durasi tidur siang per hari."} level={3} />
        <PanelBody className="grid items-center gap-4 pt-3 sm:grid-cols-[184px_minmax(0,1fr)]">
          <div className="flex items-center gap-3">
            <span className="kpi-icon bg-violet-50 text-violet-600">
              <Moon size={20} />
            </span>
            <div>
              <div className="text-[20px] leading-none font-bold whitespace-nowrap">
                {a.current.sleepAvg ? sleepAvg.big : "–"} <span className="text-muted text-[13px] font-medium">{sleepAvg.small}</span>
              </div>
              <div className="text-muted mt-1 text-[12.5px]">Rata-rata per hari</div>
            </div>
          </div>
          <BarChart
            values={points.map((p) => Math.round(p.sleepMinutes / 6) / 10)}
            labels={ticks}
            color="#8b5cf6"
            unit="jam"
            step={1}
            height={120}
            ariaLabel={"Tidur (jam): " + points.map((p) => p.label + " " + fmtMinutes(p.sleepMinutes)).join(", ")}
          />
        </PanelBody>
      </Panel>
      <Panel>
        <PanelHead title="Pola Makan" desc={`Porsi yang dihabiskan per waktu makan (1 = habis), ${per}.`} level={3} />
        <PanelBody className="grid items-center gap-4 pt-3 sm:grid-cols-[150px_minmax(0,1fr)]">
          <div className="flex items-center gap-3">
            <span className="kpi-icon bg-orange-50 text-orange-500">
              <Utensils size={20} />
            </span>
            <div>
              <div className="text-[20px] leading-none font-bold">
                {mealsPerDay ? mealsPerDay.toString().replace(".", ",") + "x" : "–"} <span className="text-muted text-[13px] font-medium">Sehari</span>
              </div>
              <div className="text-muted mt-1 text-[12.5px]">
                {a.current.mealAvg != null ? "Rata-rata " + a.current.mealAvg + "% porsi habis" : "Belum ada catatan makan"}
              </div>
            </div>
          </div>
          <StackedBars
            series={slots}
            labels={ticks}
            max={4}
            height={130}
            ariaLabel={"Porsi makan " + per + ": " + points.map((p) => p.label + " " + (p.mealAvg ?? "-") + "%").join(", ")}
          />
        </PanelBody>
      </Panel>
    </div>
  );
}

/* ---------------------------------------------------------------- analitik per tab ---- */

const TABS = [
  { id: "aktivitas", label: "Aktivitas", icon: Activity },
  { id: "mood", label: "Mood", icon: Heart },
  { id: "tidur", label: "Tidur", icon: Moon },
  { id: "makan", label: "Makan", icon: Utensils },
  { id: "kehadiran", label: "Kehadiran", icon: UserCheck },
] as const;
export type AnalyticsTab = (typeof TABS)[number]["id"];

export function DetailAnalytics({ a, tab, onTab, fixed = false }: { a: Analytics; tab: AnalyticsTab; onTab?: (t: AnalyticsTab) => void; fixed?: boolean }) {
  const days = a.days;
  const { points: sampled, unit } = chartPoints(a);
  const labels = sampled.map((p) => p.tick);
  const per = unit === "minggu" ? "per minggu penuh" : "per hari";
  const kinds = ACTIVITY.filter((k) => a.kinds.some((x) => x.kind === k.id));
  // Distribusi jenis aktivitas: per hari untuk rentang pendek, per minggu bila lebih dari dua minggu (agar garis terbaca).
  const distWeekly = a.range.days > 14;
  const distPoints = distWeekly ? weekPoints(days) : sampled;
  const distLabels = distPoints.map((p) => p.tick);
  const distPer = distWeekly ? "per minggu penuh" : per;
  const series = kinds.map((k) => ({ key: k.id, label: k.label, color: ACTIVITY_COLOR[k.id], values: distPoints.map((p) => p.byKind[k.id] ?? 0) }));
  const c = a.current;
  const p = a.previous;
  const dAct = p.activities ? Math.round(((c.activities - p.activities) / p.activities) * 100) : null;
  return (
    <Panel>
      <div className="border-line flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3.5">
        <h3 className="text-[15px] font-semibold">Analitik Perkembangan</h3>
        {!fixed ? (
          <div className="flex flex-wrap gap-1" role="tablist" aria-label="Jenis analitik">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                className={cn("chip h-8", tab === t.id && "active")}
                onClick={() => onTab?.(t.id)}
              >
                <t.icon size={14} /> {t.label}
              </button>
            ))}
          </div>
        ) : (
          <Badge tone="accent">{TABS.find((t) => t.id === tab)?.label}</Badge>
        )}
      </div>
      <PanelBody className="grid gap-4">
        {tab === "aktivitas" ? (
          <>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h4 className="text-[14px] font-semibold">
                Distribusi Jenis Aktivitas <span className="text-muted font-normal">· jumlah {distPer}</span>
              </h4>
              <span className="text-muted text-[12.5px]">
                {c.activities} kegiatan · {dAct != null ? (dAct >= 0 ? "+" : "") + dAct + "% vs periode sebelumnya" : "belum ada pembanding"}
              </span>
            </div>
            {series.length ? (
              <MultiLine series={series} labels={distLabels} ariaLabel={"Distribusi jenis aktivitas " + distPer} />
            ) : (
              <Empty>Belum ada catatan aktivitas pada periode ini.</Empty>
            )}
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {a.kinds.map((k) => {
                const def = ACTIVITY.find((x) => x.id === k.kind);
                const Icon = def?.icon ?? Activity;
                const pct = c.activities ? Math.round((k.count / c.activities) * 100) : 0;
                return (
                  <div key={k.kind} className="border-line flex items-center gap-3 rounded-[12px] border px-3 py-2.5">
                    <span className="tile-icon" style={{ background: ACTIVITY_COLOR[k.kind] + "22", color: ACTIVITY_COLOR[k.kind] }}>
                      <Icon size={18} />
                    </span>
                    <div className="min-w-0">
                      <div className="truncate text-[13.5px] font-semibold">{k.label}</div>
                      <div className="text-muted text-[12px]">
                        {k.count} kali · {pct}%
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : null}
        {tab === "mood" ? (
          <>
            <MoodLine values={sampled.map((d) => d.mood)} labels={labels} ariaLabel={"Tren mood " + per} />
            <div className="grid gap-2 sm:grid-cols-3">
              <Stat label="Rata-rata" value={c.moodAvg != null ? c.moodAvg.toFixed(1).replace(".", ",") + " / 5" : "–"} sub={c.moodLabel} />
              <Stat
                label="Pagi vs sore"
                value={avgOf(days.map((d) => d.moodMorning)) + " · " + avgOf(days.map((d) => d.moodAfternoon))}
                sub="rata-rata mood pagi · sore"
              />
              <Stat label="Periode sebelumnya" value={p.moodAvg != null ? p.moodAvg.toFixed(1).replace(".", ",") + " / 5" : "–"} sub={p.moodLabel} />
            </div>
            <DayTable
              days={days}
              render={(d) => (d.mood != null ? `${d.moodEmoji} ${d.moodLabel} (${d.mood.toFixed(1).replace(".", ",")})` : d.present ? "Belum dicatat" : "–")}
            />
          </>
        ) : null}
        {tab === "tidur" ? (
          <>
            <BarChart
              values={sampled.map((d) => Math.round(d.sleepMinutes / 6) / 10)}
              labels={labels}
              color="#8b5cf6"
              unit="jam"
              step={1}
              ariaLabel={"Durasi tidur " + per}
            />
            <div className="grid gap-2 sm:grid-cols-3">
              <Stat label="Rata-rata per hari" value={c.sleepAvg ? fmtMinutes(c.sleepAvg) : "–"} sub={c.sleepDays + " hari dengan catatan tidur"} />
              <Stat label="Total periode" value={fmtMinutes(c.sleepTotal)} />
              <Stat label="Periode sebelumnya" value={p.sleepAvg ? fmtMinutes(p.sleepAvg) + " / hari" : "–"} />
            </div>
            <DayTable
              days={days}
              render={(d) =>
                d.sleepMinutes
                  ? fmtMinutes(d.sleepMinutes) +
                    (d.sleepQuality ? " · kualitas " + ["", "kurang", "cukup", "baik", "sangat baik"][Math.round(d.sleepQuality)] : "")
                  : d.present
                    ? "Tidak ada catatan"
                    : "–"
              }
            />
          </>
        ) : null}
        {tab === "makan" ? (
          <>
            <StackedBars
              series={FOOD_SLOTS.map((f) => ({ key: f.id, label: f.label, color: SLOT_COLOR[f.id], values: sampled.map((d) => (d.meals[f.id] ?? 0) / 100) }))}
              labels={labels}
              max={4}
              ariaLabel={"Porsi makan " + per}
            />
            <div className="grid gap-2 sm:grid-cols-4">
              {FOOD_SLOTS.map((f) => (
                <Stat key={f.id} label={f.label} value={c.slotAvg[f.id] != null ? c.slotAvg[f.id] + "%" : "–"} sub="rata-rata porsi habis" />
              ))}
            </div>
            <DayTable
              days={days}
              render={(d) =>
                Object.keys(d.meals).length
                  ? FOOD_SLOTS.filter((f) => d.meals[f.id] != null)
                      .map((f) => f.label + " " + d.meals[f.id] + "%")
                      .join(" · ")
                  : d.present
                    ? "Tidak ada catatan"
                    : "–"
              }
            />
          </>
        ) : null}
        {tab === "kehadiran" ? (
          <>
            <div className="flex flex-wrap items-center gap-6">
              <Donut value={c.attendancePct} label="Kehadiran" size={96} />
              <div className="grid gap-1 text-[14px]">
                <div>
                  <span className="font-semibold">{c.presentDays}</span> dari {c.schoolDays} hari sekolah hadir
                </div>
                <div className="text-muted">
                  Periode sebelumnya: {p.presentDays} dari {p.schoolDays} hari
                </div>
                {c.feverDays ? <div className="text-warn-ink">{c.feverDays} hari dengan suhu ≥ 37,5 °C</div> : null}
              </div>
            </div>
            <DayTable
              days={days}
              render={(d) => (!d.school ? "Libur" : d.present ? "Hadir" + (d.checkin ? " · tiba " + d.checkin.replace(":", ".") : "") : "Tidak hadir")}
            />
          </>
        ) : null}
      </PanelBody>
    </Panel>
  );
}

function avgOf(xs: (number | null)[]): string {
  const v = xs.filter((x): x is number => x != null);
  return v.length ? (v.reduce((a, b) => a + b, 0) / v.length).toFixed(1).replace(".", ",") : "–";
}

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="bg-wash rounded-[12px] px-3.5 py-3">
      <div className="text-muted text-[12px] font-medium">{label}</div>
      <div className="mt-0.5 text-[17px] leading-tight font-bold">{value}</div>
      {sub ? <div className="text-muted mt-0.5 text-[12px]">{sub}</div> : null}
    </div>
  );
}

function DayTable({ days, render }: { days: Analytics["days"]; render: (d: Analytics["days"][number]) => string }) {
  const rows = days.length > 14 ? days.filter((d) => d.present || d.school).slice(-14) : days;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Hari</th>
            <th>Catatan</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((d) => (
            <tr key={d.date}>
              <td className="whitespace-nowrap">
                {d.label} {d.day}
              </td>
              <td className={cn(!d.present && "text-muted")}>{render(d)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------------------------------------------------------------- insight & rekomendasi ---- */

const AREA_ICON: Record<Insight["area"], React.ReactNode> = {
  aktivitas: <Activity size={14} />,
  mood: <Heart size={14} />,
  tidur: <Moon size={14} />,
  makan: <Utensils size={14} />,
  kehadiran: <UserCheck size={14} />,
  kesehatan: <AlertTriangle size={14} />,
};

function InsightIcon({ i }: { i: Insight }) {
  if (i.kind === "anomaly") return <AlertTriangle size={15} className={i.sev === "high" ? "text-rose-600" : "text-rose-500"} />;
  if (i.kind === "positive") return <Sparkles size={15} className="text-emerald-500" />;
  if (i.kind === "trend")
    return (i.delta ?? 0) >= 0 ? <TrendingUp size={15} className="text-emerald-600" /> : <TrendingDown size={15} className="text-amber-600" />;
  return <Activity size={15} className="text-blue-600" />;
}

const KIND_LABEL: Record<Insight["kind"], string> = { trend: "Tren", pattern: "Pola", anomaly: "Anomali", positive: "Positif" };

const CONFIDENCE_STYLE: Record<NonNullable<Insight["confidence"]>, string> = {
  tinggi: "bg-emerald-50 text-emerald-700",
  sedang: "bg-slate-100 text-slate-600",
  rendah: "bg-amber-50 text-amber-700",
};

function baselineText(a: Analytics): string | null {
  const b = a.baseline;
  if (!b || b.days < 6) return null;
  const parts: string[] = [];
  // pusat perbandingan = median (bukan rata-rata) supaya satu hari ekstrem tidak menggeser "kebiasaan"
  if (b.mood) parts.push(`mood ${fmtNum(b.mood.center ?? b.mood.mean, 1)}`);
  if (b.sleep) parts.push(`tidur siang ${fmtMinutes(b.sleep.center ?? b.sleep.mean)}`);
  if (b.meal) parts.push(`porsi makan ${Math.round(b.meal.center ?? b.meal.mean)}%`);
  if (b.activities) parts.push(`${fmtNum(b.activities.center ?? b.activities.mean, 1)} kegiatan/hari`);
  if (b.arrive?.center != null) parts.push(`masuk ${String(Math.floor(b.arrive.center / 60)).padStart(2, "0")}.${String(Math.round(b.arrive.center % 60)).padStart(2, "0")}`);
  if (parts.length === 0) return null;
  return `Kebiasaan ${a.child.split(" ")[0]} dari ${b.days} hari hadir sebelumnya (nilai tengah, bukan rata-rata): ${parts.join(" · ")}.`;
}

/* ---------------------------------------------------------------- skor pantauan ---- */

const WATCH_TONE: Record<NonNullable<Analytics["watch"]>["level"], string> = {
  tenang: "bg-emerald-50 text-emerald-700 border-emerald-100",
  wajar: "bg-amber-50 text-amber-700 border-amber-100",
  "perlu dipantau": "bg-rose-50 text-rose-700 border-rose-100",
};

/** Rangkuman sinyal hari ini. Tiap baris menyebut aturannya, jadi angkanya bisa ditelusuri. */
export function WatchStrip({ a }: { a: Analytics }) {
  const w = a.watch;
  if (!w) return null;
  return (
    <div className={cn("border rounded-[12px] px-4 py-3", WATCH_TONE[w.level])}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <strong className="text-[14px]">Skor pantauan {w.score}</strong>
        <Badge className="bg-white/70 text-current border-0">{w.level}</Badge>
        <span className="text-[12.5px] opacity-80">{w.note}</span>
      </div>
      {w.components.length > 0 ? (
        <ul className="mt-2 grid gap-1 text-[12.5px] sm:grid-cols-2">
          {w.components.map((c) => (
            <li key={c.key} className="flex items-start gap-2">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden />
              <span className="min-w-0">
                {c.label} <span className="opacity-70">— {c.detail}</span>
              </span>
              <span className="ml-auto shrink-0 font-semibold">+{c.points}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-[12.5px] opacity-80">Tidak ada sinyal yang menyala pada periode ini.</p>
      )}
    </div>
  );
}

export function InsightsPanel({
  a,
  detailHref,
  compact = false,
  audience = "staff",
  withWatch,
  canRate = false,
}: {
  a: Analytics;
  detailHref?: string;
  compact?: boolean;
  audience?: "staff" | "parent";
  /** strip skor pantauan — untuk staf saja; orang tua melihat uraian catatan, bukan skor internal */
  withWatch?: boolean;
  /** admin boleh menilai saran (👍/👎) untuk mengurutkan saran berikutnya */
  canRate?: boolean;
}) {
  const showWatch = withWatch ?? audience !== "parent";
  const insights = compact ? a.insights.slice(0, 4) : a.insights;
  const recs = compact ? a.recommendations.slice(0, 3) : a.recommendations;
  return (
    <Panel className="bg-[linear-gradient(180deg,#f6f7ff_0%,#ffffff_120px)]">
      <PanelHead
        title={
          <span className="inline-flex items-center gap-2">
            <Sparkles size={17} className="text-violet-600" /> Insight & Rekomendasi AI
          </span>
        }
        desc={`Dianalisis dari ${a.current.activities} aktivitas, ${a.current.mealCount} catatan makan, ${a.current.sleepDays} catatan tidur, dan mood ${a.range.label}${
          a.baseline && a.baseline.days >= 6 ? `, dibandingkan dengan kebiasaan anak ${a.baseline.days} hari sebelumnya` : ""
        }${a.peers && a.peers.n >= 3 ? ` dan ${a.peers.n} anak lain` : ""}.`}
      />
      <PanelBody className="grid gap-4 lg:grid-cols-2">
        {showWatch ? (
          <div className="lg:col-span-2">
            <WatchStrip a={a} />
          </div>
        ) : null}
        <div className="border-line bg-surface rounded-[12px] border p-4">
          <h4 className="mb-2 inline-flex items-center gap-2 text-[14px] font-semibold">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-blue-50 text-blue-600">
              <Lightbulb size={14} />
            </span>
            Insight {a.range.days === 7 ? "Minggu Ini" : "Periode Ini"}
          </h4>
          {insights.length === 0 ? (
            <p className="text-muted text-[13.5px]">Belum cukup catatan untuk menemukan pola. Insight muncul setelah beberapa hari pencatatan.</p>
          ) : null}
          <ul className="grid gap-2.5">
            {insights.map((i) => (
              <li key={i.id} className="flex gap-2.5 text-[13.5px] leading-snug">
                <span className="mt-0.5 shrink-0">
                  <InsightIcon i={i} />
                </span>
                <span className="min-w-0">
                  <span className="font-semibold">{i.title}.</span> {i.text}
                  <span className="text-faint mt-0.5 block text-[12px]">
                    <span className="inline-flex items-center gap-1 align-middle">
                      {AREA_ICON[i.area]} {KIND_LABEL[i.kind]}
                    </span>{" "}
                    · bukti: {i.evidence}
                    {i.confidence ? (
                      <>
                        {" "}
                        <span
                          className={`ml-1 inline-block rounded-full px-1.5 py-px align-middle text-[11px] font-medium ${CONFIDENCE_STYLE[i.confidence]}`}
                          title="Tingkat keyakinan mengikuti jumlah data dan besar efek"
                        >
                          keyakinan {i.confidence}
                        </span>
                      </>
                    ) : null}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="border-line bg-surface rounded-[12px] border p-4">
          <h4 className="mb-2 inline-flex items-center gap-2 text-[14px] font-semibold">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-50 text-emerald-600">
              <Sparkles size={14} />
            </span>
            Rekomendasi {audience === "parent" ? "untuk di Rumah & Daycare" : "AI"}
          </h4>
          <ul className="grid gap-2.5">
            {recs.map((r) => (
              <li key={r.id} className="flex gap-2.5 text-[13.5px] leading-snug">
                <span className="mt-[7px] h-2 w-2 shrink-0 rounded-full bg-emerald-500" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="font-semibold">{r.title}.</span> {r.text}
                  <span className="text-faint mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]">
                    <span>Alasan: {r.why}</span>
                    {r.impactLabel ? (
                      <span className="border-line rounded-full border px-1.5 py-px" title="Dampak perkiraan bila saran dijalankan">
                        {r.impactLabel}
                      </span>
                    ) : null}
                    {r.effortLabel ? (
                      <span className="border-line rounded-full border px-1.5 py-px" title="Seberapa berat menjalankannya di keseharian">
                        {r.effortLabel}
                      </span>
                    ) : null}
                  </span>
                </span>
                {canRate ? <RecoRating id={r.id} /> : null}
              </li>
            ))}
          </ul>
          {detailHref ? (
            <div className="mt-3">
              <Button size="sm" variant="primary" onClick={() => (window.location.hash = detailHref)}>
                Lihat Detail Rekomendasi <ArrowRight size={14} />
              </Button>
            </div>
          ) : null}
        </div>
        {!compact && baselineText(a) ? <p className="text-muted text-[12.5px] leading-relaxed lg:col-span-2">{baselineText(a)}</p> : null}
        {!compact ? <p className="text-muted text-[12.5px] leading-relaxed lg:col-span-2">Cara kerja: {a.method}</p> : null}
      </PanelBody>
    </Panel>
  );
}

/* ---------------------------------------------------------------- profil perkembangan & laporan ---- */

const PROFILE_ICON: Record<ProfileArea["area"], { icon: React.ReactNode; cls: string }> = {
  sosial: { icon: <Users size={18} />, cls: "bg-emerald-50 text-emerald-600" },
  motorik: { icon: <Hand size={18} />, cls: "bg-orange-50 text-orange-500" },
  kognitif: { icon: <Brain size={18} />, cls: "bg-blue-50 text-blue-600" },
  emosi: { icon: <Heart size={18} />, cls: "bg-pink-50 text-pink-500" },
};

function TrendArrow({ t }: { t: ProfileArea["trend"] }) {
  if (t === "up") return <ArrowUpRight size={18} className="text-emerald-600" aria-label="meningkat" />;
  if (t === "down") return <ArrowDownRight size={18} className="text-rose-500" aria-label="menurun" />;
  return <ArrowRight size={18} className="text-slate-400" aria-label="stabil" />;
}

export function ProfileList({ a, withBasis = false }: { a: Analytics; withBasis?: boolean }) {
  return (
    <ul className="grid gap-2">
      {a.profile.map((p) => (
        <li key={p.area} className="border-line flex items-center gap-3 rounded-[12px] border px-3.5 py-2.5">
          <span className={cn("tile-icon", PROFILE_ICON[p.area].cls)}>{PROFILE_ICON[p.area].icon}</span>
          <div className="min-w-0 flex-1">
            <div className="text-muted text-[12.5px]">Perkembangan {p.label}</div>
            <div className="text-[15px] leading-tight font-bold">{p.level}</div>
            {withBasis ? <div className="text-faint text-[12px]">{p.basis}</div> : null}
          </div>
          <TrendArrow t={p.trend} />
        </li>
      ))}
    </ul>
  );
}

/** Cetak hanya kartu laporan (dialog cetak peramban → "Simpan sebagai PDF"). */
export function printReport(): void {
  const body = document.body;
  body.classList.add("printing-report");
  const done = () => {
    body.classList.remove("printing-report");
    window.removeEventListener("afterprint", done);
  };
  window.addEventListener("afterprint", done);
  window.print();
  // peramban tanpa afterprint (mis. beberapa WebView): bersihkan setelah dialog ditutup
  window.setTimeout(done, 60_000);
}

export function ReportCard({ a, child, range, onPrint }: { a: Analytics; child: Child; range: ReturnType<typeof useRange>; onPrint?: () => void }) {
  const note = a.teacherNotes[a.teacherNotes.length - 1];
  return (
    <Panel id="laporan-perkembangan" className="print-area">
      <PanelHead
        title="Laporan Perkembangan Anak"
        desc={`${child.name} · ${a.range.label}`}
        action={
          <Button size="sm" variant="primary" className="no-print" onClick={onPrint ?? printReport}>
            <Download size={15} /> Download PDF
          </Button>
        }
      />
      <PanelBody className="grid gap-4">
        <div className="no-print flex gap-1" role="tablist" aria-label="Periode laporan">
          {[
            [7, "Mingguan"],
            [30, "Bulanan"],
            [180, "Semester"],
          ].map(([d, l]) => (
            <button
              key={d}
              type="button"
              role="tab"
              aria-selected={range.days === d}
              className={cn("chip h-8", range.days === d && "active")}
              onClick={() => range.setDays(Number(d))}
            >
              {l}
            </button>
          ))}
        </div>
        <div>
          <h4 className="mb-2 text-[14px] font-semibold">Ringkasan Perkembangan</h4>
          <ProfileList a={a} withBasis />
        </div>
        <div className="grid gap-2 sm:grid-cols-4">
          <Stat label="Kehadiran" value={`${a.current.presentDays}/${a.current.schoolDays} hari`} />
          <Stat label="Aktivitas" value={`${a.current.activities} kegiatan`} sub={a.current.activitiesPerDay + " per hari"} />
          <Stat
            label="Mood"
            value={`${a.current.moodEmoji} ${a.current.moodAvg != null ? a.current.moodAvg.toFixed(1).replace(".", ",") : "–"}/5`}
            sub={a.current.moodLabel}
          />
          <Stat label="Tidur siang" value={a.current.sleepAvg ? fmtMinutes(a.current.sleepAvg) : "–"} sub="rata-rata per hari" />
        </div>
        <div className="rounded-[12px] bg-amber-50/70 p-4">
          <h4 className="mb-1 inline-flex items-center gap-2 text-[14px] font-semibold">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-amber-100 text-amber-700">✎</span> Catatan Guru
          </h4>
          {note ? (
            <>
              <p className="text-[14px] leading-relaxed">“{note.text}”</p>
              <div className="text-muted mt-1 text-[12.5px]">
                – {note.by} ({fmtDate(new Date(note.at))})
              </div>
            </>
          ) : (
            <p className="text-muted text-[13.5px]">
              Belum ada catatan guru pada periode ini. Pengasuh dapat menambahkannya lewat “Catatan” di dasbor pengasuh.
            </p>
          )}
        </div>
        <p className="text-faint text-[12px] leading-relaxed">
          Skor area perkembangan dihitung dari proporsi jenis aktivitas dan rata-rata mood yang dicatat pengasuh, dibandingkan dengan periode sebelumnya. Ini
          gambaran kebiasaan harian, bukan asesmen klinis.
        </p>
      </PanelBody>
    </Panel>
  );
}

export function MethodNote() {
  return (
    <Note>
      <strong>Bagaimana insight dibuat.</strong> Data → Analisis → Insight → Rekomendasi: catatan pengasuh dirangkum per hari, dibandingkan dengan periode
      sebelumnya (tren), dicari kejadian berulang pada hari/waktu tertentu (pola) dan nilai yang jauh dari kebiasaan anak itu sendiri (anomali). Setiap insight
      menyertakan bukti angkanya.
    </Note>
  );
}

/** Ringkas kondisi emosi untuk kartu "Mood Hari Ini" bila belum ada catatan hari ini. */
export function moodSummary(a: Analytics | null): { emoji: string; label: string } {
  if (!a || a.current.moodAvg == null) return { emoji: "🙂", label: "Belum ada catatan" };
  return { emoji: moodEmojiFor(a.current.moodAvg), label: a.current.moodLabel };
}

/* ---------------------------------------------------------------- penilaian saran & kualitas pemindai ---- */

/** 👍/👎 admin. Hanya mengubah urutan saran berikutnya, tidak menambah klaim apa pun. */
function RecoRating({ id }: { id: string }) {
  const [done, setDone] = React.useState<"up" | "down" | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const vote = (v: "up" | "down") => {
    setBusy(true);
    setErr(null);
    api
      .post<{ ok: boolean }>("/api/analytics/reco-feedback", { key: id, vote: v })
      .then(() => setDone(v))
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : "Gagal mencatat penilaian."))
      .finally(() => setBusy(false));
  };
  return (
    <span className="ml-auto flex shrink-0 items-center gap-1">
      <button
        type="button"
        onClick={() => vote("up")}
        disabled={busy}
        title="Saran ini berguna"
        aria-label="Saran ini berguna"
        className={cn("rounded-md border px-1.5 py-1 transition", done === "up" ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-line text-slate-500 hover:bg-slate-50")}
      >
        <ThumbsUp size={13} aria-hidden />
      </button>
      <button
        type="button"
        onClick={() => vote("down")}
        disabled={busy}
        title="Saran ini kurang berguna"
        aria-label="Saran ini kurang berguna"
        className={cn("rounded-md border px-1.5 py-1 transition", done === "down" ? "border-rose-300 bg-rose-50 text-rose-700" : "border-line text-slate-500 hover:bg-slate-50")}
      >
        <ThumbsDown size={13} aria-hidden />
      </button>
      {done ? (
        <span className="text-faint text-[11.5px]">tersimpan</span>
      ) : err ? (
        <span className="text-[11.5px] text-rose-600">{err}</span>
      ) : null}
    </span>
  );
}

/** Nama kelas model → istilah yang dipakai di aplikasi. "none" = piring/mangkok tanpa makanan. */
function classNameOf(c: string): string {
  const def = (CATS as Record<string, { label: string }>)[c];
  return def ? def.label : c === "none" ? "piring kosong" : c;
}

function pct(x: number | undefined): string | null {
  return x == null ? null : `${Math.round(x * 100)}%`;
}

/** Berkas model yang dimuat peramban menyimpan hasil ujinya; panel ini hanya membacanya. */
export function ScannerQuality({ className }: { className?: string }) {
  const [q, setQ] = React.useState<ScannerQualityData | null>(null);
  const [failed, setFailed] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  React.useEffect(() => {
    let live = true;
    const urls = MODEL_URLS.map((u) => u.replace(/\.bin$/, ".model.json"));
    (async () => {
      for (const u of urls) {
        try {
          const r = await fetch(u, { cache: "no-store" });
          if (!r.ok) continue;
          const j = (await r.json()) as ScannerQualityData;
          if (live) {
            setQ(j);
            setFailed(false);
          }
          return;
        } catch {
          /* coba sumber berikutnya */
        }
      }
      if (live) setFailed(true);
    })().finally(() => {
      if (live) setLoading(false);
    });
    return () => {
      live = false;
    };
  }, []);
  if (loading) return <p className={cn("text-muted text-[13px]", className)}>Memeriksa kualitas pemindai…</p>;
  if (failed || !q)
    return (
      <p className={cn("text-muted text-[13px]", className)}>
        Berkas hasil uji pemindai belum tersedia di perangkat ini. Jalankan ekspor model untuk melampirkannya.
      </p>
    );
  const photoAcc = pct(q.photoAccuracy);
  const photoPrec = pct(q.photoPrecision);
  const weak = (q.weakClasses ?? []).map(classNameOf);
  const rows = [
    q.photosTrain != null && q.photosVal != null ? { k: "Belajar dari", v: `${q.photosTrain} foto makanan, diuji pada ${q.photosVal} foto yang tidak pernah dilihatnya` } : null,
    photoAcc ? { k: "Kelas utama benar pada", v: `${photoAcc} foto uji — dihitung dari suara terbanyak potongan gambar per foto, bukan hasil akhir pemindai` } : null,
    photoPrec ? { k: "Nama menu benar saat model yakin", v: `${photoPrec} terhadap isi foto uji (p ≥ 0,6) — angka per kelas inilah yang dipakai badge keyakinan di pemindai; nama yang tidak terbukti tetap bisa diganti sebelum disimpan` } : null,
    q.thresholds?.relabelMin != null ? { k: "Ambang koreksi warna", v: `nama menu hanya diganti bila model yakin (≥ ${Math.round(q.thresholds.relabelMin * 100)}%) dan kelas itu memang jarang meleset` } : null,
    q.temperature != null ? { k: "Peluang sudah dikalibrasi", v: `angka "yakin" model disesuaikan pada ${q.photosVal ?? "banyak"} foto uji, bukan angka mentah jaringan` } : null,
  ].filter(Boolean) as { k: string; v: string }[];
  return (
    <div className={cn("grid gap-2", className)}>
      <ul className="grid gap-1.5 text-[13px]">
        {rows.map((r) => (
          <li key={r.k} className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-muted min-w-[168px] font-medium">{r.k}</span>
            <span>{r.v}</span>
          </li>
        ))}
      </ul>
      {weak.length > 0 ? (
        <p className="text-muted flex items-start gap-1.5 text-[12.5px]">
          <HelpCircle size={14} className="mt-0.5 shrink-0" aria-hidden />
          Paling sering perlu dikoreksi: {weak.join(", ")}. Untuk makanan itu, hasil pindai selalu bisa diedit sebelum disimpan.
        </p>
      ) : (
        <p className="text-emerald-700 flex items-start gap-1.5 text-[12.5px]">
          <CheckCircle2 size={14} className="mt-0.5 shrink-0" aria-hidden /> Tidak ada golongan makanan yang tercatat lemah pada foto uji.
        </p>
      )}
      <p className="text-faint text-[11.5px]">
        Diuji {q.trainedAt ?? "baru-baru ini"}
        {q.patches != null ? ` · ${q.patches.toLocaleString("id-ID")} potongan gambar` : ""}
      </p>
    </div>
  );
}
