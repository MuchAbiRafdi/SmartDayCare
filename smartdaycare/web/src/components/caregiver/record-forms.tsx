"use client";
/* Formulir pencatatan pengasuh (Tema 1, mode catat): aktivitas, makan, tidur, mood, kehadiran & dokumentasi. */
import * as React from "react";
import { Camera, CheckCircle2, Clock3, ImagePlus, Moon } from "lucide-react";
import { api } from "@/lib/api";
import { attendance, childLog, lastTemp } from "@/lib/derive";
import { cn, fmtDate, fmtTemp, fmtTime } from "@/lib/format";
import { useAction, useLive } from "@/lib/live";
import { ACTIVITY, FOOD_SLOTS, MENU_OPTIONS, MOODS, PORTIONS, SLEEP_KINDS, SLEEP_QUALITY, TONE_CLASS, TONE_RING, fmtMinutes } from "@/lib/records";
import type { ActivityKind, Child, FoodSlot, LogEntry, MoodKind, Portion, SleepQuality } from "@/lib/types";
import { thumb } from "@/lib/vision";
import { ChildAvatar, DocGrid } from "@/components/parent/home";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Label, Select, Textarea } from "@/components/ui/field";
import { Note, Panel, PanelBody, PanelHead } from "@/components/ui/panel";

const PICK_KEY = "sd:record-child";

/** Anak yang sedang dicatat; diingat per tab peramban supaya tidak perlu memilih ulang di tiap menu. */
export function useChildPick(children: Child[]): [Child | null, (id: string) => void] {
  const [id, setId] = React.useState<string>("");
  React.useEffect(() => {
    try {
      const saved = sessionStorage.getItem(PICK_KEY);
      if (saved && children.some((c) => c.id === saved)) setId(saved);
    } catch {
      /* penyimpanan sesi tidak tersedia */
    }
  }, [children]);
  const pick = React.useCallback((v: string) => {
    setId(v);
    try {
      sessionStorage.setItem(PICK_KEY, v);
    } catch {
      /* abaikan */
    }
  }, []);
  const child = children.find((c) => c.id === id) ?? children[0] ?? null;
  return [child, pick];
}

export function RecordHeader({
  title,
  desc,
  child,
  childrenList,
  onChild,
}: {
  title: string;
  desc?: string;
  child: Child | null;
  childrenList: Child[];
  onChild: (id: string) => void;
}) {
  const { now } = useLive();
  return (
    <Panel className="flex flex-wrap items-center gap-4 p-4">
      <div className="min-w-0 flex-1">
        <h2 className="text-[18px] font-bold">{title}</h2>
        {desc ? <p className="text-muted text-[13px]">{desc}</p> : null}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-[13px]">
          <span className="text-muted font-medium whitespace-nowrap">Nama Anak</span>
          <Select
            value={child?.id ?? ""}
            onChange={(e) => onChild(e.target.value)}
            className="h-9 min-w-[170px] py-1 text-[13.5px] font-semibold"
            aria-label="Pilih anak"
          >
            {childrenList.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </label>
        <span className="text-[13px]">
          <span className="text-muted font-medium">Tanggal </span>
          <b>{fmtDate(now)}</b>
        </span>
      </div>
    </Panel>
  );
}

function TileButton({
  active,
  tone,
  onClick,
  children,
  className,
}: {
  active: boolean;
  tone: keyof typeof TONE_CLASS;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn("tile-btn text-[13px] font-semibold", active && cn("ring-4", TONE_RING[tone]), className)}
    >
      {children}
    </button>
  );
}

function Pill({
  active,
  onClick,
  children,
  tone = "accent",
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  tone?: "accent" | "green" | "red" | "orange" | "gray";
}) {
  const on = {
    accent: "bg-teal-600 text-white border-teal-600",
    green: "bg-emerald-500 text-white border-emerald-500",
    red: "bg-rose-500 text-white border-rose-500",
    orange: "bg-orange-400 text-white border-orange-400",
    gray: "bg-slate-500 text-white border-slate-500",
  }[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition",
        active ? on : "border-line bg-surface text-ink-2 hover:border-teal-600/50",
      )}
    >
      {children}
    </button>
  );
}

function SaveRow({ busy, label, disabled, hint }: { busy: boolean; label: string; disabled?: boolean; hint?: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <span className="text-muted text-[12.5px]">{hint}</span>
      <Button type="submit" variant="primary" disabled={busy || disabled} className="min-w-[180px]">
        {busy ? "Menyimpan…" : label}
      </Button>
    </div>
  );
}

/* ---------------------------------------------------------------- aktivitas ---- */

export function ActivityForm({ child }: { child: Child }) {
  const { refresh } = useLive();
  const { busy, run } = useAction();
  const [kind, setKind] = React.useState<ActivityKind | null>(null);
  const [note, setNote] = React.useState("");
  const [minutes, setMinutes] = React.useState("");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!kind) return;
    const r = await run(
      () => api.post<{ entry: LogEntry }>("/api/log/activity", { childId: child.id, kind, note: note.trim(), minutes: minutes ? Number(minutes) : null }),
      {
        ok: (r) => `${child.short}: ${r.entry.title} tersimpan dan terkirim ke orang tua.`,
      },
    );
    if (r) {
      setKind(null);
      setNote("");
      setMinutes("");
      await refresh();
    }
  };
  return (
    <Panel>
      <PanelHead title="Catatan aktivitas baru" desc="Pilih jenis kegiatan, lalu tambahkan catatan singkat untuk orang tua." />
      <PanelBody>
        <form onSubmit={submit} className="grid gap-5">
          <div>
            <Label>Jenis Aktivitas</Label>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {ACTIVITY.map((a) => (
                <TileButton key={a.id} tone={a.tone} active={kind === a.id} onClick={() => setKind(a.id)}>
                  <span className={cn("tile-icon", TONE_CLASS[a.tone])}>
                    <a.icon size={20} />
                  </span>
                  {a.label}
                </TileButton>
              ))}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_160px]">
            <Field label="Catatan Aktivitas" htmlFor="act-note" hint="Dibaca orang tua apa adanya. Tulis apa yang dilakukan dan bagaimana respons anak.">
              <Textarea
                id="act-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={600}
                placeholder="Misal: menyusun balok jadi menara 8 tingkat bersama Rizky, sabar menunggu giliran."
              />
            </Field>
            <Field label="Durasi (menit)" htmlFor="act-min" hint="Opsional, 5–240 menit.">
              <Input
                id="act-min"
                type="number"
                min={5}
                max={240}
                inputMode="numeric"
                value={minutes}
                onChange={(e) => setMinutes(e.target.value)}
                placeholder="30"
              />
            </Field>
          </div>
          <SaveRow
            busy={busy}
            label="Simpan Aktivitas"
            disabled={!kind}
            hint={kind ? `Akan tercatat sebagai ${ACTIVITY.find((a) => a.id === kind)?.label} untuk ${child.short}.` : "Pilih jenis aktivitas terlebih dahulu."}
          />
        </form>
      </PanelBody>
    </Panel>
  );
}

/* ---------------------------------------------------------------- makan ---- */

function defaultSlot(now: Date): FoodSlot {
  const h = now.getHours() + now.getMinutes() / 60;
  if (h < 9.5) return "breakfast";
  if (h < 11.5) return "snack_am";
  if (h < 14.5) return "lunch";
  return "snack_pm";
}

export function FoodForm({ child }: { child: Child }) {
  const { refresh, now } = useLive();
  const { busy, run } = useAction();
  const [slot, setSlot] = React.useState<FoodSlot>(() => defaultSlot(now));
  const [menu, setMenu] = React.useState<string[]>([]);
  const [other, setOther] = React.useState("");
  const [portion, setPortion] = React.useState<Portion | null>(null);
  const [note, setNote] = React.useState("");
  const toggle = (id: string) => setMenu((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]));
  const fullMenu = [
    ...menu.filter((m) => m !== "lainnya").map((m) => MENU_OPTIONS.find((o) => o.id === m)?.label ?? m),
    ...(menu.includes("lainnya") && other.trim() ? [other.trim()] : []),
  ];
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!portion || !fullMenu.length) return;
    const r = await run(() => api.post<{ entry: LogEntry }>("/api/log/food", { childId: child.id, slot, menu: fullMenu, portion, note: note.trim() }), {
      ok: (r) => `${child.short}: ${r.entry.title} tersimpan.`,
    });
    if (r) {
      setMenu([]);
      setOther("");
      setPortion(null);
      setNote("");
      await refresh();
    }
  };
  const PORTION_TONE: Record<Portion, "green" | "orange" | "red" | "gray"> = { habis: "green", setengah: "orange", sedikit: "orange", tidak: "red" };
  return (
    <Panel>
      <PanelHead title="Catatan makan baru" desc="Catat waktu makan, menu yang disajikan, dan porsi yang dihabiskan." />
      <PanelBody>
        <form onSubmit={submit} className="grid gap-5">
          <div>
            <Label>Waktu Makan</Label>
            <div className="flex flex-wrap gap-2">
              {FOOD_SLOTS.map((f) => (
                <Pill key={f.id} active={slot === f.id} onClick={() => setSlot(f.id)}>
                  {f.label}
                </Pill>
              ))}
            </div>
          </div>
          <div>
            <Label>Menu Makanan</Label>
            <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-5">
              {MENU_OPTIONS.map((m) => (
                <TileButton key={m.id} tone="orange" active={menu.includes(m.id)} onClick={() => toggle(m.id)}>
                  <span className={cn("tile-icon", menu.includes(m.id) ? "bg-orange-50 text-orange-500" : "bg-slate-100 text-slate-500")}>
                    <m.icon size={20} />
                  </span>
                  {m.label}
                </TileButton>
              ))}
            </div>
            {menu.includes("lainnya") ? (
              <Input
                className="mt-2"
                value={other}
                onChange={(e) => setOther(e.target.value)}
                maxLength={40}
                placeholder="Tulis menu lainnya, misal: bubur kacang hijau"
                aria-label="Menu lainnya"
              />
            ) : null}
          </div>
          <div>
            <Label>Porsi</Label>
            <div className="flex flex-wrap gap-2">
              {PORTIONS.map((p) => (
                <Pill key={p.id} tone={PORTION_TONE[p.id]} active={portion === p.id} onClick={() => setPortion(p.id)}>
                  {p.label}
                </Pill>
              ))}
            </div>
          </div>
          <Field label="Catatan (opsional)" htmlFor="food-note">
            <Input
              id="food-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={600}
              placeholder="Misal: minta tambah sayur, tidak suka wortel."
            />
          </Field>
          <SaveRow
            busy={busy}
            label="Simpan"
            disabled={!portion || !fullMenu.length}
            hint={
              !fullMenu.length
                ? "Pilih minimal satu menu."
                : !portion
                  ? "Pilih porsi yang dihabiskan."
                  : `${FOOD_SLOTS.find((f) => f.id === slot)?.label}: ${fullMenu.join(", ")}.`
            }
          />
        </form>
      </PanelBody>
    </Panel>
  );
}

/* ---------------------------------------------------------------- tidur ---- */

function diffMinutes(a: string, b: string): number | null {
  if (!/^\d{2}:\d{2}$/.test(a) || !/^\d{2}:\d{2}$/.test(b)) return null;
  const [h1, m1] = a.split(":").map(Number);
  const [h2, m2] = b.split(":").map(Number);
  const d = h2 * 60 + m2 - (h1 * 60 + m1);
  return d > 0 ? d : null;
}

export function SleepForm({ child }: { child: Child }) {
  const { refresh } = useLive();
  const { busy, run } = useAction();
  const [kind, setKind] = React.useState<"siang" | "tambahan">("siang");
  const [start, setStart] = React.useState("12:30");
  const [end, setEnd] = React.useState("14:00");
  const [quality, setQuality] = React.useState<SleepQuality | null>(null);
  const [note, setNote] = React.useState("");
  const dur = diffMinutes(start, end);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quality || !dur) return;
    const r = await run(() => api.post<{ entry: LogEntry }>("/api/log/sleep", { childId: child.id, kind, start, end, quality, note: note.trim() }), {
      ok: (r) => `${child.short}: ${r.entry.title} tersimpan.`,
    });
    if (r) {
      setQuality(null);
      setNote("");
      await refresh();
    }
  };
  return (
    <Panel>
      <PanelHead title="Catatan tidur baru" desc="Durasi dihitung otomatis dari waktu mulai dan bangun." />
      <PanelBody>
        <form onSubmit={submit} className="grid gap-5">
          <div>
            <Label>Jenis Tidur</Label>
            <div className="flex flex-wrap gap-2">
              {SLEEP_KINDS.map((k) => (
                <Pill key={k.id} active={kind === k.id} onClick={() => setKind(k.id)}>
                  {k.label}
                </Pill>
              ))}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Waktu Mulai" htmlFor="sl-start">
              <Input id="sl-start" type="time" value={start} onChange={(e) => setStart(e.target.value)} required />
            </Field>
            <Field label="Waktu Bangun" htmlFor="sl-end">
              <Input id="sl-end" type="time" value={end} onChange={(e) => setEnd(e.target.value)} required />
            </Field>
            <div>
              <Label>Durasi</Label>
              <div className={cn("field flex items-center gap-2 font-semibold", dur ? "text-violet-700" : "text-danger")}>
                <Moon size={16} /> {dur ? fmtMinutes(dur) : "Waktu bangun harus setelah mulai"}
              </div>
            </div>
          </div>
          <div>
            <Label>Kualitas Tidur</Label>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {SLEEP_QUALITY.map((q) => (
                <TileButton key={q.id} tone={q.tone} active={quality === q.id} onClick={() => setQuality(q.id)}>
                  <span className="text-[26px] leading-none" aria-hidden>
                    {q.emoji}
                  </span>
                  {q.label}
                </TileButton>
              ))}
            </div>
          </div>
          <Field label="Catatan (opsional)" htmlFor="sl-note">
            <Input
              id="sl-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={600}
              placeholder="Misal: sempat terbangun sekali, lalu tidur lagi."
            />
          </Field>
          <SaveRow
            busy={busy}
            label="Simpan"
            disabled={!quality || !dur}
            hint={quality ? `${SLEEP_KINDS.find((k) => k.id === kind)?.label} ${start.replace(":", ".")}–${end.replace(":", ".")}.` : "Pilih kualitas tidur."}
          />
        </form>
      </PanelBody>
    </Panel>
  );
}

/* ---------------------------------------------------------------- mood ---- */

export function MoodForm({ child }: { child: Child }) {
  const { refresh, state: s } = useLive();
  const { busy, run } = useAction();
  const [mood, setMood] = React.useState<MoodKind | null>(null);
  const [note, setNote] = React.useState("");
  const today = childLog(s, child.id).filter((e) => e.type === "mood");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mood) return;
    const r = await run(() => api.post<{ entry: LogEntry }>("/api/log/mood", { childId: child.id, mood, note: note.trim() }), {
      ok: (r) => `${child.short}: ${r.entry.title} tersimpan.`,
    });
    if (r) {
      setMood(null);
      setNote("");
      await refresh();
    }
  };
  return (
    <Panel>
      <PanelHead
        title="Pencatatan Mood"
        desc={
          today.length ? `Sudah ${today.length} kali dicatat hari ini; catatan baru menjadi mood terkini.` : "Catat suasana hati anak pada pagi dan siang hari."
        }
      />
      <PanelBody>
        <form onSubmit={submit} className="grid gap-5">
          <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-6">
            {MOODS.map((m) => (
              <TileButton key={m.id} tone={m.tone} active={mood === m.id} onClick={() => setMood(m.id)} className="py-4">
                <span className="text-[34px] leading-none" aria-hidden>
                  {m.emoji}
                </span>
                {m.label}
              </TileButton>
            ))}
          </div>
          <Field label="Catatan (opsional)" htmlFor="mood-note" hint="Konteksnya membantu orang tua memahami: apa yang terjadi sebelum atau sesudahnya.">
            <Input
              id="mood-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={600}
              placeholder="Misal: ceria setelah bermain air, sempat rewel saat ditinggal."
            />
          </Field>
          <SaveRow
            busy={busy}
            label="Simpan Mood"
            disabled={!mood}
            hint={mood ? `Mood ${child.short} dicatat: ${MOODS.find((m) => m.id === mood)?.label}.` : "Pilih salah satu suasana hati."}
          />
        </form>
      </PanelBody>
    </Panel>
  );
}

/* ---------------------------------------------------------------- kehadiran & dokumentasi ---- */

export function AttendanceDocs({ child, onCheckin, onCheckout }: { child: Child; onCheckin: () => void; onCheckout: () => void }) {
  const { state: s, now, refresh } = useLive();
  const { busy, run } = useAction();
  const att = attendance(s, child, now);
  const t = lastTemp(s, child, now);
  const docs = s.log.filter((e) => e.type === "doc" && e.childId === child.id).sort((a, b) => b.at.localeCompare(a.at));
  const [preview, setPreview] = React.useState<string | null>(null);
  const [caption, setCaption] = React.useState("");
  const [err, setErr] = React.useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const onFile = (f: File | undefined) => {
    setErr(null);
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      setErr("Untuk saat ini hanya foto (JPG/PNG) yang dapat diunggah; video belum didukung.");
      return;
    }
    const url = URL.createObjectURL(f);
    const img = new window.Image();
    img.onload = () => {
      const data = thumb(img, 640, 0.72);
      URL.revokeObjectURL(url);
      if (!data) setErr("Foto tidak dapat dibaca. Coba foto lain.");
      else setPreview(data);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      setErr("Foto tidak dapat dibaca. Coba foto lain.");
    };
    img.src = url;
  };

  const upload = async () => {
    if (!preview) return;
    const r = await run(() => api.post<{ entry: LogEntry }>("/api/log/doc", { childId: child.id, caption: caption.trim(), photo: preview }), {
      ok: `Foto ${child.short} tersimpan dan tampil di dasbor orang tua.`,
    });
    if (r) {
      setPreview(null);
      setCaption("");
      if (fileRef.current) fileRef.current.value = "";
      await refresh();
    }
  };

  return (
    <div className="grid gap-4">
      <Panel>
        <PanelHead title="Status Kehadiran" />
        <PanelBody className="flex flex-wrap items-center gap-4">
          <div
            className={cn(
              "flex flex-1 items-center gap-3 rounded-[12px] border p-4",
              att.state === "in" ? "border-emerald-200 bg-emerald-50" : att.state === "out" ? "border-line bg-wash" : "border-amber-200 bg-amber-50",
            )}
          >
            <span
              className={cn(
                "flex h-11 w-11 items-center justify-center rounded-full text-white",
                att.state === "in" ? "bg-emerald-500" : att.state === "out" ? "bg-slate-400" : "bg-amber-400",
              )}
            >
              {att.state === "pending" ? <Clock3 size={22} /> : <CheckCircle2 size={22} />}
            </span>
            <div className="min-w-0">
              <div className="text-[17px] font-bold">{att.state === "in" ? "Hadir" : att.state === "out" ? "Sudah dijemput" : "Belum tiba"}</div>
              <div className="text-muted text-[13px]">
                {att.state === "pending"
                  ? `Biasanya tiba pukul ${child.checkin.replace(":", ".")}`
                  : `Waktu ${att.state === "in" ? "datang" : "pulang"} ${att.since?.replace(":", ".")}`}
                {t ? ` · suhu ${fmtTemp(t.v)} (${t.time})` : ""}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            {att.state !== "in" ? (
              <Button variant="primary" onClick={onCheckin}>
                {att.state === "out" ? "Catat datang lagi" : "Catat kedatangan"}
              </Button>
            ) : (
              <Button variant="primary" onClick={onCheckout}>
                Ubah Status: Pulang
              </Button>
            )}
          </div>
        </PanelBody>
      </Panel>
      <Panel>
        <PanelHead
          title="Dokumentasi Kegiatan"
          desc="Foto dikecilkan otomatis dan hanya dapat dilihat orang tua anak ini."
          action={<Badge tone="neutral">{docs.length} foto</Badge>}
        />
        <PanelBody className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-[200px_minmax(0,1fr)]">
            <label
              className={cn(
                "border-line flex aspect-[4/3] cursor-pointer flex-col items-center justify-center gap-2 rounded-[12px] border-2 border-dashed text-center text-[13px] font-semibold hover:border-teal-600/60",
                preview ? "border-teal-600/60 bg-teal-100/40" : "text-teal-700",
              )}
            >
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt="Pratinjau foto" className="h-full w-full rounded-[10px] object-cover" />
              ) : (
                <>
                  <ImagePlus size={26} />
                  Tambah Foto
                  <span className="text-muted text-[12px] font-normal">JPG/PNG dari kamera atau galeri</span>
                </>
              )}
              <input ref={fileRef} type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
            </label>
            <div className="grid content-start gap-3">
              <Field label="Keterangan foto" htmlFor="doc-cap" hint="Tampil di bawah foto pada dasbor orang tua.">
                <Input
                  id="doc-cap"
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  maxLength={200}
                  placeholder="Misal: melukis dengan jari di sesi seni"
                />
              </Field>
              {err ? <Note tone="warn">{err}</Note> : null}
              <div className="flex flex-wrap gap-2">
                <Button variant="primary" onClick={upload} disabled={!preview || busy}>
                  <Camera size={16} /> {busy ? "Mengunggah…" : "Unggah Foto"}
                </Button>
                {preview ? (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setPreview(null);
                      if (fileRef.current) fileRef.current.value = "";
                    }}
                  >
                    Batal
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
          <DocGrid docs={docs} cols={4} empty="Belum ada foto untuk anak ini." />
        </PanelBody>
      </Panel>
    </div>
  );
}

/* ---------------------------------------------------------------- ringkasan pengasuh ---- */

export function ChildRecordStrip({ child }: { child: Child }) {
  const { state: s } = useLive();
  const log = childLog(s, child.id);
  const n = (t: LogEntry["type"]) => log.filter((e) => e.type === t).length;
  const lastMood = log.filter((e) => e.type === "mood").sort((a, b) => b.at.localeCompare(a.at))[0];
  const cells: [string, React.ReactNode][] = [
    ["Aktivitas", `${n("activity")}×`],
    ["Makan", `${n("food")}×`],
    ["Tidur", `${n("sleep")}×`],
    ["Mood", lastMood ? `${lastMood.emoji ?? ""} ${lastMood.moodLabel ?? ""}` : "–"],
    ["Foto", `${n("doc")}`],
  ];
  return (
    <Panel className="flex flex-wrap items-center gap-4 p-4">
      <ChildAvatar child={child} size={44} />
      <div className="min-w-0">
        <div className="font-bold">{child.name}</div>
        <div className="text-muted text-[12.5px]">
          {child.room}
          {child.allergies && child.allergies !== "Tidak ada" ? ` · Alergi: ${child.allergies}` : ""}
        </div>
      </div>
      <dl className="ml-auto flex flex-wrap gap-x-5 gap-y-1 text-[13px]">
        {cells.map(([k, v]) => (
          <div key={k}>
            <dt className="text-muted text-[11.5px] font-medium tracking-wide uppercase">{k}</dt>
            <dd className="font-semibold">{v}</dd>
          </div>
        ))}
      </dl>
      {log.length ? (
        <span className="text-muted text-[12px]">
          Terakhir{" "}
          {fmtTime(
            log
              .map((e) => e.at)
              .sort()
              .at(-1) ?? "",
          )}
        </span>
      ) : null}
    </Panel>
  );
}
