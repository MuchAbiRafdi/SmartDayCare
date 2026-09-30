"use client";
/* Tampilan orang tua (Tema 1, mode lihat): sapaan, kartu anak, mood hari ini, ringkasan aktivitas,
   jadwal hari ini, dokumentasi terbaru, serta halaman per jenis catatan. */
import * as React from "react";
import Image from "next/image";
import { Activity, Camera as CameraIcon, CheckCircle2, Clock3, Moon, Smile, UserCheck, Utensils } from "lucide-react";
import { attendance, childLog, temps, timeline } from "@/lib/derive";
import { cn, fmtDate, fmtTime, fmtTemp, initials } from "@/lib/format";
import { useLive } from "@/lib/live";
import { ACTIVITY, ACTIVITY_COLOR, FOOD_SLOTS, MOOD_BY_ID, PORTIONS, SLEEP_QUALITY, TONE_CLASS, fmtMinutes, moodEmojiFor, moodLabelFor } from "@/lib/records";
import type { Analytics, Child, DayRow, LogEntry } from "@/lib/types";
import { useAnalytics } from "@/components/shared/analytics";
import { BarChart, Donut, MoodLine } from "@/components/charts/charts";
import { AuthImg } from "@/components/shared/auth-img";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, Kv, Panel, PanelBody, PanelHead } from "@/components/ui/panel";

const ROUTINE = new Set(["activity", "food", "sleep", "mood", "doc", "checkin", "checkout", "meal", "temp", "med", "incident", "note"]);

function firstName(name: string): string {
  return name.split(" ")[0];
}

export function ageLabel(child: Child): string {
  const dob = new Date(child.dob);
  if (Number.isNaN(dob.getTime())) return child.age;
  const now = new Date();
  let y = now.getFullYear() - dob.getFullYear();
  let m = now.getMonth() - dob.getMonth();
  if (now.getDate() < dob.getDate()) m -= 1;
  if (m < 0) {
    y -= 1;
    m += 12;
  }
  return y > 0 ? `${y} tahun${m ? " " + m + " bulan" : ""}` : `${m} bulan`;
}

export function groupLabel(child: Child): string {
  const y = Number(ageLabel(child).split(" ")[0]);
  if (ageLabel(child).includes("tahun")) return y >= 4 ? "Kelompok B (4–6 th)" : y >= 2 ? "Kelompok A (2–3 th)" : "Kelompok Bayi";
  return "Kelompok Bayi";
}

export function ChildAvatar({ child, size = 64, className }: { child: Child; size?: number; className?: string }) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-[16px] bg-[linear-gradient(160deg,#ffe4c4,#ffd0a8)] font-bold text-[#7a4a1a]",
        className,
      )}
      style={{ width: size, height: size, fontSize: size / 2.6 }}
      aria-hidden
    >
      {initials(child.name)}
    </span>
  );
}

/* ---------------------------------------------------------------- Beranda ---- */

export function ParentHome({ child, onTab }: { child: Child; onTab: (id: string) => void }) {
  const { state: s, now } = useLive();
  const att = attendance(s, child, now);
  const log = childLog(s, child.id);
  const acts = log.filter((e) => e.type === "activity");
  const foods = log.filter((e) => e.type === "food");
  const sleeps = log.filter((e) => e.type === "sleep");
  const moods = log.filter((e) => e.type === "mood").sort((a, b) => a.at.localeCompare(b.at));
  const lastMood = moods[moods.length - 1];
  const docs = s.log.filter((e) => e.type === "doc" && e.childId === child.id).sort((a, b) => b.at.localeCompare(a.at));
  const meal = foods.length ? Math.round(foods.reduce((a, e) => a + (e.score ?? 50), 0) / foods.length) : null;
  const mealWord = meal == null ? "Belum ada" : meal >= 75 ? "Baik" : meal >= 45 ? "Cukup" : "Kurang";
  const sleepMin = sleeps.reduce((a, e) => a + (e.minutes ?? 0), 0);
  const mood = lastMood ? MOOD_BY_ID[lastMood.mood ?? "senang"] : null;
  const tl = timeline(s, child, now);
  const items = tl.past.filter((i) => i.source === "log" || i.future === false);
  const routine = log
    .filter((e) => ROUTINE.has(e.type) && !["checkin", "checkout", "temp", "med", "incident", "note", "meal"].includes(e.type))
    .map((e) => ({ id: e.id, at: e.at, time: fmtTime(e.at), title: e.title, desc: e.type === "doc" ? "Foto ditambahkan" : e.text, type: e.type }));
  const schedule = [...items.map((i) => ({ id: i.id, at: i.at, time: i.time, title: i.title, desc: i.desc, type: "seed" })), ...routine].sort((a, b) =>
    a.at.localeCompare(b.at),
  );
  return (
    <div className="grid gap-4">
      <div>
        <h2 className="text-[22px] font-bold tracking-[-0.01em]">Halo, {firstName(s.me.name)}! 👋</h2>
        <p className="text-muted text-[13.5px]">
          {fmtDate(now)} · Berikut ringkasan aktivitas harian {child.short}.
        </p>
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="grid content-start gap-4">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            <Panel className="flex items-center gap-4 p-4">
              <ChildAvatar child={child} size={72} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[18px] font-bold">{child.name}</div>
                <div className="text-muted text-[13px]">Usia {ageLabel(child)}</div>
                <div className="text-muted text-[13px]">
                  {groupLabel(child)} · {child.room}
                </div>
                <Button size="sm" className="mt-2 h-8 border-teal-600 text-teal-700 hover:bg-teal-100/60" onClick={() => onTab("profil")}>
                  Lihat Profil
                </Button>
              </div>
            </Panel>
            <Panel className="flex flex-col items-center justify-center p-4 text-center">
              <div className="text-ink-2 self-start text-[13px] font-semibold">Mood Hari Ini</div>
              <div className="mt-1 text-[44px] leading-none" aria-hidden>
                {mood ? mood.emoji : "🙂"}
              </div>
              <div className="mt-2 text-[15px] font-bold">{mood ? mood.label : "Belum dicatat"}</div>
              {lastMood ? (
                <div className="text-muted text-[12px]">pukul {fmtTime(lastMood.at)}</div>
              ) : (
                <div className="text-muted text-[12px]">Pengasuh mencatat saat kegiatan</div>
              )}
            </Panel>
          </div>
          <Panel>
            <PanelHead
              title="Ringkasan Aktivitas Hari Ini"
              desc={att.label}
              action={
                <Badge tone={att.state === "in" ? "ok" : att.state === "out" ? "neutral" : "warn"} dot>
                  {att.state === "in" ? "Hadir" : att.state === "out" ? "Sudah pulang" : "Belum tiba"}
                </Badge>
              }
            />
            <PanelBody className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <button type="button" onClick={() => onTab("aktivitas")} className="summary-tile bg-emerald-50 text-left">
                <div className="lbl text-emerald-700">Aktivitas</div>
                <div className="val text-emerald-800">
                  {acts.length} <span className="text-muted text-[13px] font-medium">/ 8</span>
                </div>
                <div className="sub">Selesai</div>
              </button>
              <button type="button" onClick={() => onTab("makan")} className="summary-tile bg-rose-50 text-left">
                <div className="lbl text-rose-700">Makan</div>
                <div className="val text-rose-800">{foods.length}x</div>
                <div className="sub">{mealWord}</div>
              </button>
              <button type="button" onClick={() => onTab("tidur")} className="summary-tile bg-violet-50 text-left">
                <div className="lbl text-violet-700">Tidur</div>
                <div className="val text-violet-800">{sleeps.length}x</div>
                <div className="sub">{sleepMin ? fmtMinutes(sleepMin) : "Belum tercatat"}</div>
              </button>
              <button type="button" onClick={() => onTab("kehadiran")} className="summary-tile bg-blue-50 text-left">
                <div className="lbl text-blue-700">Kehadiran</div>
                <div className="val text-blue-800">{att.state === "pending" ? "Belum" : "Hadir"}</div>
                <div className="sub">{att.since ? att.since.replace(":", ".") : "–"}</div>
              </button>
            </PanelBody>
          </Panel>
          <Panel>
            <PanelHead
              title="Dokumentasi Terbaru"
              action={
                <button type="button" className="text-[13px] font-semibold text-teal-700 hover:underline" onClick={() => onTab("dokumentasi")}>
                  Lihat Semua
                </button>
              }
            />
            <PanelBody className="pt-3">
              <DocGrid docs={docs.slice(0, 8)} cols={4} empty="Belum ada foto minggu ini." />
            </PanelBody>
          </Panel>
        </div>
        <div className="grid gap-4">
          <Panel>
            <PanelHead
              title="Jadwal Hari Ini"
              desc={tl.next ? "Berikutnya: " + tl.next.title + " pukul " + tl.next.time : "Semua kegiatan hari ini tercatat"}
            />
            <PanelBody className="pt-3">
              {schedule.length === 0 ? <Empty>Belum ada kegiatan tercatat hari ini.</Empty> : null}
              <ol className="m-0 grid list-none gap-2.5 p-0">
                {schedule.slice(-8).map((i) => (
                  <li key={i.id} className="flex items-start gap-3">
                    <span className={cn("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md", iconTone(i.type))}>{iconFor(i.type)}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <time className="text-muted shrink-0 text-[12.5px] tabular-nums">{i.time}</time>
                        <span className="truncate text-[13.5px] font-semibold">{i.title}</span>
                      </div>
                      <p className="text-muted line-clamp-2 text-[12.5px]">{i.desc}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </PanelBody>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function iconTone(t: string): string {
  return (
    {
      activity: "bg-emerald-50 text-emerald-600",
      food: "bg-orange-50 text-orange-500",
      sleep: "bg-violet-50 text-violet-600",
      mood: "bg-amber-50 text-amber-500",
      doc: "bg-blue-50 text-blue-600",
    }[t] ?? "bg-slate-100 text-slate-500"
  );
}

function iconFor(t: string): React.ReactNode {
  const size = 15;
  if (t === "activity") return <Activity size={size} />;
  if (t === "food") return <Utensils size={size} />;
  if (t === "sleep") return <Moon size={size} />;
  if (t === "mood") return <Smile size={size} />;
  if (t === "doc") return <CameraIcon size={size} />;
  return <Clock3 size={size} />;
}

export function DocGrid({ docs, cols = 3, empty = "Belum ada foto hari ini." }: { docs: LogEntry[]; cols?: 3 | 4; empty?: string }) {
  if (!docs.length) return <Empty>{empty}</Empty>;
  return (
    <ul className={cn("photo-grid m-0 list-none p-0", cols === 4 && "sm:grid-cols-4")}>
      {docs.map((d) => (
        <li key={d.id} className="relative">
          {d.photoUrl ? (
            <AuthImg src={d.photoUrl} alt={d.title} />
          ) : d.img ? (
            <Image src={d.img} alt={d.title} fill sizes="200px" className="object-cover" />
          ) : (
            <span className="text-faint grid h-full place-items-center text-[12px]">Tanpa foto</span>
          )}
          <span className="absolute inset-x-0 bottom-0 truncate bg-[linear-gradient(transparent,rgba(0,0,0,.65))] px-2 pt-6 pb-1.5 text-[11.5px] font-medium text-white">
            {d.title} · {fmtTime(d.at)}
          </span>
        </li>
      ))}
    </ul>
  );
}

/* ---------------------------------------------------------------- halaman per catatan ---- */

function RecordList({ entries, render, empty }: { entries: LogEntry[]; render: (e: LogEntry) => React.ReactNode; empty: string }) {
  if (!entries.length) return <Empty>{empty}</Empty>;
  return (
    <ul className="m-0 grid list-none gap-2 p-0">
      {entries
        .slice()
        .sort((a, b) => b.at.localeCompare(a.at))
        .map((e) => (
          <li key={e.id} className="border-line flex items-start gap-3 rounded-[12px] border px-3.5 py-3">
            {render(e)}
          </li>
        ))}
    </ul>
  );
}

/** Tabel 7 hari terakhir (hari sekolah) dari sumber yang sama dengan dasbor admin. */
function WeekTable({ a, cols }: { a: Analytics; cols: { key: string; label: string; render: (d: DayRow) => React.ReactNode }[] }) {
  const rows = a.days.filter((d) => d.school);
  return (
    <div className="table-wrap">
      <table className="table text-[13px]">
        <thead>
          <tr>
            <th>Hari</th>
            {cols.map((c) => (
              <th key={c.key}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((d) => (
            <tr key={d.date} className={cn(!d.present && "text-muted")}>
              <td className="whitespace-nowrap">
                {d.label} {d.day}/{Number(d.date.slice(5, 7))}
              </td>
              {cols.map((c) => (
                <td key={c.key}>{d.present ? c.render(d) : <span className="text-faint">Tidak hadir</span>}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const moodText = (v: number | null) => (v == null ? "–" : `${moodEmojiFor(v)} ${moodLabelFor(v)}`);

export function ActivityView({ child }: { child: Child }) {
  const { state: s } = useLive();
  const acts = childLog(s, child.id).filter((e) => e.type === "activity");
  const { data: a } = useAnalytics(child.id, 7);
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <Panel>
        <PanelHead title="Aktivitas Hari Ini" desc={`${acts.length} kegiatan tercatat oleh pengasuh`} />
        <PanelBody>
          <RecordList
            entries={acts}
            empty="Belum ada aktivitas tercatat hari ini."
            render={(e) => {
              const def = ACTIVITY.find((x) => x.id === e.kind) ?? ACTIVITY[7];
              return (
                <>
                  <span className={cn("tile-icon", TONE_CLASS[def.tone])}>
                    <def.icon size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="font-semibold">{def.label}</span>
                      {e.minutes ? <span className="text-muted text-[12.5px]">{fmtMinutes(e.minutes)}</span> : null}
                    </div>
                    <p className="text-muted text-[13px]">{e.text}</p>
                  </div>
                  <time className="text-muted shrink-0 text-[12.5px] tabular-nums">{fmtTime(e.at)}</time>
                </>
              );
            }}
          />
        </PanelBody>
      </Panel>
      <Panel>
        <PanelHead title="Minggu ini" desc={a ? `${a.current.activities} kegiatan · ${a.range.label}` : "Memuat…"} />
        <PanelBody className="grid gap-3 pt-3">
          {a ? (
            <>
              <BarChart
                values={a.days.map((d) => d.activities)}
                labels={a.days.map((d) => d.label)}
                unit="kegiatan"
                height={150}
                ariaLabel="Aktivitas per hari minggu ini"
              />
              <ul className="m-0 grid list-none gap-1.5 p-0 text-[13px]">
                {a.kinds.slice(0, 5).map((k) => (
                  <li key={k.kind} className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: ACTIVITY_COLOR[k.kind] }} />
                    <span className="flex-1">{k.label}</span>
                    <span className="text-muted tabular-nums">{k.count}×</span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </PanelBody>
      </Panel>
    </div>
  );
}

export function FoodRecords({ child }: { child: Child }) {
  const { state: s } = useLive();
  const foods = childLog(s, child.id).filter((e) => e.type === "food");
  const { data: a } = useAnalytics(child.id, 7);
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <Panel>
        <PanelHead title="Makan Hari Ini" desc="Menu dan porsi yang dicatat pengasuh." />
        <PanelBody className="grid gap-2">
          {FOOD_SLOTS.map((slot) => {
            const e = foods.filter((f) => f.slot === slot.id).sort((x, y) => y.at.localeCompare(x.at))[0];
            const por = e ? PORTIONS.find((p) => p.id === e.portion) : null;
            return (
              <div key={slot.id} className={cn("border-line flex items-start gap-3 rounded-[12px] border px-3.5 py-3", !e && "opacity-70")}>
                <span className={cn("tile-icon", por ? TONE_CLASS[por.tone] : "bg-slate-100 text-slate-400")}>
                  <Utensils size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-semibold">{slot.label}</span>
                    <span className="text-muted text-[12.5px]">{e ? fmtTime(e.at) : "± " + slot.time}</span>
                  </div>
                  <p className="text-muted text-[13px]">{e ? (e.menu?.length ? "Menu " + e.menu.join(", ") : e.text) : "Belum dicatat"}</p>
                  {e?.note ? <p className="text-muted text-[12.5px] italic">“{e.note}”</p> : null}
                </div>
                {por ? (
                  <Badge tone={por.id === "habis" ? "ok" : por.id === "tidak" ? "danger" : por.id === "sedikit" ? "warn" : "neutral"}>{por.label}</Badge>
                ) : null}
              </div>
            );
          })}
        </PanelBody>
      </Panel>
      <Panel>
        <PanelHead title="Pola makan minggu ini" desc={a?.current.mealAvg != null ? `Rata-rata ${a.current.mealAvg}% porsi habis` : "Memuat…"} />
        <PanelBody className="grid gap-3 pt-3">
          {a ? (
            <>
              <div className="flex items-center gap-4">
                <Donut value={a.current.mealAvg ?? 0} color="#22c55e" size={88} label="Porsi habis" />
                <div className="grid gap-1 text-[13px]">
                  {FOOD_SLOTS.map((f) => (
                    <div key={f.id} className="flex items-center gap-2">
                      <span className="text-muted w-24">{f.label}</span>
                      <span className="font-semibold tabular-nums">{a.current.slotAvg[f.id] != null ? a.current.slotAvg[f.id] + "%" : "–"}</span>
                    </div>
                  ))}
                </div>
              </div>
              <p className="text-muted text-[12.5px]">Rincian gizi dan foto piring makan siang ada di bagian bawah halaman ini.</p>
            </>
          ) : null}
        </PanelBody>
      </Panel>
    </div>
  );
}

export function SleepView({ child }: { child: Child }) {
  const { state: s } = useLive();
  const sleeps = childLog(s, child.id).filter((e) => e.type === "sleep");
  const { data: a } = useAnalytics(child.id, 7);
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <Panel>
        <PanelHead title="Tidur Hari Ini" />
        <PanelBody>
          <RecordList
            entries={sleeps}
            empty="Belum ada catatan tidur hari ini."
            render={(e) => {
              const q = SLEEP_QUALITY.find((x) => x.id === e.quality);
              return (
                <>
                  <span className="tile-icon bg-violet-50 text-violet-600">
                    <Moon size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">{e.kindLabel ?? "Tidur Siang"}</div>
                    <p className="text-muted text-[13px]">
                      {e.start?.replace(":", ".")}–{e.end?.replace(":", ".")} · {fmtMinutes(e.minutes ?? 0)}
                    </p>
                    {e.note ? <p className="text-muted text-[12.5px] italic">“{e.note}”</p> : null}
                  </div>
                  {q ? <Badge tone={q.id === "kurang" ? "warn" : q.id === "cukup" ? "neutral" : "ok"}>{q.label}</Badge> : null}
                </>
              );
            }}
          />
        </PanelBody>
      </Panel>
      <Panel>
        <PanelHead title="Pola tidur minggu ini" desc={a?.current.sleepAvg ? `Rata-rata ${fmtMinutes(a.current.sleepAvg)} per hari` : "Memuat…"} />
        <PanelBody className="grid gap-3 pt-3">
          {a ? (
            <>
              <BarChart
                values={a.days.map((d) => Math.round(d.sleepMinutes / 6) / 10)}
                labels={a.days.map((d) => d.label)}
                color="#8b5cf6"
                unit="jam"
                step={1}
                height={150}
                ariaLabel="Durasi tidur per hari"
              />
              <WeekTable
                a={a}
                cols={[
                  { key: "d", label: "Durasi", render: (d) => (d.sleepMinutes ? fmtMinutes(d.sleepMinutes) : "Belum tercatat") },
                  {
                    key: "q",
                    label: "Kualitas",
                    render: (d) =>
                      d.sleepQuality
                        ? (SLEEP_QUALITY.find((q) => q.id === ["kurang", "cukup", "baik", "sangat_baik"][Math.round(d.sleepQuality!) - 1])?.label ?? "–")
                        : "–",
                  },
                ]}
              />
            </>
          ) : null}
        </PanelBody>
      </Panel>
    </div>
  );
}

export function MoodView({ child }: { child: Child }) {
  const { state: s } = useLive();
  const moods = childLog(s, child.id).filter((e) => e.type === "mood");
  const { data: a } = useAnalytics(child.id, 7);
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <Panel>
        <PanelHead title="Mood Hari Ini" desc="Dicatat pengasuh pada pagi dan siang hari." />
        <PanelBody>
          <RecordList
            entries={moods}
            empty="Belum ada catatan mood hari ini."
            render={(e) => {
              const m = MOOD_BY_ID[e.mood ?? "netral"];
              return (
                <>
                  <span className={cn("tile-icon text-[22px]", TONE_CLASS[m.tone])}>{m.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">{m.label}</div>
                    <p className="text-muted text-[13px]">{e.text}</p>
                  </div>
                  <time className="text-muted shrink-0 text-[12.5px] tabular-nums">{fmtTime(e.at)}</time>
                </>
              );
            }}
          />
        </PanelBody>
      </Panel>
      <Panel>
        <PanelHead
          title="Tren mood minggu ini"
          desc={a?.current.moodAvg != null ? `Rata-rata ${a.current.moodAvg.toFixed(1).replace(".", ",")}/5 · ${a.current.moodLabel}` : "Memuat…"}
        />
        <PanelBody className="grid gap-3 pt-3">
          {a ? (
            <>
              <MoodLine values={a.days.map((d) => d.mood)} labels={a.days.map((d) => d.label)} height={150} ariaLabel="Tren mood minggu ini" />
              <WeekTable
                a={a}
                cols={[
                  { key: "am", label: "Pagi", render: (d) => moodText(d.moodMorning) },
                  { key: "pm", label: "Siang/sore", render: (d) => moodText(d.moodAfternoon) },
                ]}
              />
            </>
          ) : null}
        </PanelBody>
      </Panel>
    </div>
  );
}

export function AttendanceView({ child }: { child: Child }) {
  const { state: s, now } = useLive();
  const att = attendance(s, child, now);
  const rows = temps(s, child, now);
  // suhu saat tiba = pemeriksaan pertama hari ini (daftar terurut dari yang terbaru)
  const t = rows.length ? rows[rows.length - 1] : null;
  const { data: a } = useAnalytics(child.id, 7);
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <Panel>
        <PanelHead title="Kehadiran Hari Ini" />
        <PanelBody className="grid gap-4 sm:grid-cols-2">
          <div
            className={cn(
              "flex items-center gap-3 rounded-[12px] border p-4",
              att.state === "in" ? "border-emerald-200 bg-emerald-50" : att.state === "out" ? "border-line bg-wash" : "border-amber-200 bg-amber-50",
            )}
          >
            <span
              className={cn(
                "flex h-11 w-11 items-center justify-center rounded-full",
                att.state === "in" ? "bg-emerald-500 text-white" : att.state === "out" ? "bg-slate-400 text-white" : "bg-amber-400 text-white",
              )}
            >
              {att.state === "pending" ? <Clock3 size={22} /> : <CheckCircle2 size={22} />}
            </span>
            <div>
              <div className="text-[18px] font-bold">{att.state === "in" ? "Hadir" : att.state === "out" ? "Sudah dijemput" : "Belum tiba"}</div>
              <div className="text-muted text-[13px]">{att.label}</div>
            </div>
          </div>
          <div className="border-line rounded-[12px] border p-4">
            <div className="text-muted text-[12.5px] font-medium">Waktu datang</div>
            <div className="text-[22px] font-bold tabular-nums">{att.state !== "pending" && att.since ? att.since.replace(":", ".") : "–"}</div>
            <div className="text-muted text-[12.5px]">{t ? `Suhu saat tiba ${fmtTemp(t.v)}` : "Suhu belum diukur"}</div>
          </div>
          {rows.length ? (
            <div className="sm:col-span-2">
              <div className="text-ink-2 mb-1 text-[13px] font-semibold">Pemeriksaan suhu hari ini</div>
              <Kv rows={rows.map((r) => [r.time, `${fmtTemp(r.v)} · ${r.by}`])} />
            </div>
          ) : null}
        </PanelBody>
      </Panel>
      <Panel>
        <PanelHead title="Kehadiran minggu ini" />
        <PanelBody className="flex items-center gap-4 pt-3">
          {a ? (
            <>
              <Donut value={a.current.attendancePct} size={96} />
              <div className="grid gap-1 text-[13.5px]">
                <div>
                  <span className="font-semibold">{a.current.presentDays}</span> dari {a.current.schoolDays} hari sekolah
                </div>
                <ul className="m-0 grid list-none grid-cols-5 gap-1 p-0">
                  {a.days
                    .filter((d) => d.school)
                    .map((d) => (
                      <li
                        key={d.date}
                        className={cn(
                          "rounded-md px-1 py-1 text-center text-[11.5px] font-semibold",
                          d.present ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-400",
                        )}
                        title={d.present ? "Hadir" : "Tidak hadir"}
                      >
                        {d.label}
                      </li>
                    ))}
                </ul>
              </div>
            </>
          ) : null}
        </PanelBody>
        {a ? (
          <PanelBody className="border-line border-t pt-3">
            <div className="text-ink-2 mb-2 text-[13px] font-semibold">Riwayat 7 hari</div>
            <WeekTable
              a={a}
              cols={[
                { key: "in", label: "Datang", render: (d) => (d.checkin ? d.checkin.replace(":", ".") : "–") },
                { key: "t", label: "Suhu tertinggi", render: (d) => (d.tempMax != null ? fmtTemp(d.tempMax) : "–") },
                { key: "n", label: "Kegiatan", render: (d) => (d.activities ? `${d.activities} kegiatan` : "–") },
              ]}
            />
          </PanelBody>
        ) : null}
      </Panel>
    </div>
  );
}

export function DocsView({ child }: { child: Child }) {
  const { state: s } = useLive();
  const docs = s.log.filter((e) => e.type === "doc" && e.childId === child.id).sort((a, b) => b.at.localeCompare(a.at));
  return (
    <Panel>
      <PanelHead
        title="Dokumentasi Kegiatan"
        desc="Foto yang diunggah pengasuh dalam 7 hari terakhir. Foto disimpan terbatas dan hanya dapat dilihat orang tua anak yang bersangkutan."
      />
      <PanelBody>
        <DocGrid docs={docs} cols={4} empty="Belum ada dokumentasi." />
      </PanelBody>
    </Panel>
  );
}

export function ProfileView({ child }: { child: Child }) {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Panel>
        <PanelHead title="Profil Anak" />
        <PanelBody className="grid gap-4">
          <div className="flex items-center gap-4">
            <ChildAvatar child={child} size={72} />
            <div>
              <div className="text-[18px] font-bold">{child.name}</div>
              <div className="text-muted text-[13px]">Kode anak {child.code}</div>
            </div>
          </div>
          <Kv
            rows={[
              ["Tanggal lahir", new Date(child.dob).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })],
              ["Usia", ageLabel(child)],
              ["Kelompok", groupLabel(child)],
              ["Ruang", child.room],
              ["Pengasuh", child.caregiver || "–"],
              ["Jam kedatangan", child.checkin.replace(":", ".") + " · dijemput " + child.checkout.replace(":", ".")],
            ]}
          />
        </PanelBody>
      </Panel>
      <Panel>
        <PanelHead title="Kesehatan & kontak darurat" />
        <PanelBody className="grid gap-4">
          <Kv
            rows={[
              ["Alergi", child.allergies || "Tidak ada"],
              ["Obat rutin", child.meds || "Tidak ada"],
              ["Orang tua", child.parentName],
            ]}
          />
          <div>
            <div className="text-ink-2 mb-1 text-[13px] font-semibold">Kontak darurat</div>
            {child.emergency.length ? (
              <Kv rows={child.emergency.map((e) => [e.n, e.p])} />
            ) : (
              <p className="text-muted text-[13.5px]">Belum ada kontak darurat.</p>
            )}
          </div>
          <p className="text-muted text-[12.5px]">Perubahan data anak dilakukan oleh admin daycare. Hubungi lewat menu Pesan.</p>
        </PanelBody>
      </Panel>
    </div>
  );
}

export function StatusPill({ child }: { child: Child }) {
  const { state: s, now } = useLive();
  const att = attendance(s, child, now);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12.5px] font-semibold",
        att.state === "in" ? "bg-emerald-50 text-emerald-700" : att.state === "out" ? "bg-slate-100 text-slate-600" : "bg-amber-50 text-amber-700",
      )}
    >
      <UserCheck size={13} /> {att.label}
    </span>
  );
}
