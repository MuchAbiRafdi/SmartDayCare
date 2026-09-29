"use client";
import * as React from "react";
import { api } from "@/lib/api";
import { airHasData, airOverall, airTone, AIR_LABEL } from "@/lib/derive";
import { clock, fmtRupiah } from "@/lib/format";
import type { PublicSummary } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { useAction } from "@/lib/live";

/** Angka fasilitas yang diperbarui berkala (setiap 30 detik) tanpa memuat ulang halaman. */
export function usePublic(initial: PublicSummary | null) {
  const [s, setS] = React.useState(initial);
  React.useEffect(() => {
    const t = window.setInterval(() => {
      api
        .get<PublicSummary>("/api/public")
        .then(setS)
        .catch(() => undefined);
    }, 30_000);
    return () => window.clearInterval(t);
  }, []);
  return s;
}

export function AppWindow({ initial }: { initial: PublicSummary | null }) {
  const s = usePublic(initial);
  const air = s ? airOverall(s.air.readings, s.thresholds) : null;
  const tone = air ? airTone(air.status) : "neutral";
  return (
    <div className="shadow-pop border-line bg-surface overflow-hidden rounded-[16px] border" aria-label="Contoh tampilan dasbor orang tua">
      <div className="flex items-center justify-between gap-3 bg-[linear-gradient(135deg,#2459c9,#2f6fed)] px-4 py-3 text-white">
        <div>
          <div className="text-[11.5px] font-semibold tracking-[0.08em] text-white/75 uppercase">{s?.facility.name ?? "Daycare"} · Hari ini</div>
          <div className="text-[15px] font-bold">Ringkasan Aktivitas Hari Ini</div>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[12px]">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" aria-hidden />
          Diperbarui otomatis
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2.5 p-4">
        <div className="summary-tile bg-blue-50">
          <div className="lbl text-blue-700">Kehadiran</div>
          <div className="val text-blue-800">{s ? `${s.present}` : "—"}</div>
          <div className="sub">dari {s?.childCount ?? "—"} anak hadir</div>
        </div>
        <div className="summary-tile bg-emerald-50">
          <div className="lbl text-emerald-700">Aktivitas</div>
          <div className="val text-emerald-800">
            8 <span className="text-muted text-[13px] font-medium">jenis</span>
          </div>
          <div className="sub">bermain, belajar, seni, motorik…</div>
        </div>
        <div className="summary-tile bg-rose-50">
          <div className="lbl text-rose-700">Makan</div>
          <div className="val text-rose-800">4×</div>
          <div className="sub">sarapan sampai snack sore</div>
        </div>
        <div className="summary-tile bg-violet-50">
          <div className="lbl text-violet-700">Udara ruang</div>
          <div className="val text-[16px] text-violet-800">
            <Badge tone={tone} dot>
              {air ? AIR_LABEL[air.status] : "—"}
            </Badge>
          </div>
          <div className="sub">
            {air?.worst && airHasData(air.worst) ? `CO₂ ${air.worst.co2} ppm · ${air.worst.temp.toFixed(1).replace(".", ",")}°C` : "sensor tiap ruang"}
          </div>
        </div>
      </div>
      <dl className="border-line divide-line mx-4 mb-4 divide-y border-t text-[13px]">
        <div className="flex justify-between gap-3 py-2">
          <dt className="text-muted">Kejadian terakhir</dt>
          <dd className="text-right font-medium">
            {s?.lastIncident
              ? `${s.lastIncident.type}, ${clock(s.lastIncident.t)} · ${s.lastIncident.resolved ? "ditangani" : "sedang ditangani"}`
              : "Tidak ada hari ini"}
          </dd>
        </div>
        <div className="flex justify-between gap-3 py-2">
          <dt className="text-muted">Rekaman kamera</dt>
          <dd className="font-medium">Tersimpan {s?.thresholds.retentionDays ?? 7} hari</dd>
        </div>
        <div className="flex justify-between gap-3 py-2">
          <dt className="text-muted">Insight perkembangan</dt>
          <dd className="font-medium">Mingguan, dari catatan pengasuh</dd>
        </div>
      </dl>
    </div>
  );
}

const PLANS = [
  {
    id: "dasar",
    name: "Dasar",
    month: 35000,
    desc: "Untuk daycare kecil yang ingin mulai mencatat dengan rapi.",
    items: ["Kehadiran & suhu tubuh", "Catatan harian ke orang tua", "Pemberitahuan penting", "1 kamera per ruang anak"],
    featured: false,
  },
  {
    id: "utama",
    name: "Utama",
    month: 65000,
    desc: "Untuk daycare yang ingin gizi dan kualitas udara ikut terpantau.",
    items: ["Semua di paket Dasar", "Pindai piring & catatan gizi", "Sensor udara tiap ruang", "Riwayat akses & ekspor data", "Serah terima antar pengasuh"],
    featured: true,
  },
  {
    id: "yayasan",
    name: "Yayasan",
    month: 0,
    desc: "Untuk beberapa cabang dengan kebutuhan pelaporan sendiri.",
    items: ["Semua di paket Utama", "Banyak cabang, satu akun pengelola", "Penyimpanan rekaman lebih lama", "Pendampingan penerapan"],
    featured: false,
  },
];

export function Pricing() {
  const [yearly, setYearly] = React.useState(false);
  return (
    <div>
      <div className="border-line bg-surface mx-auto mb-8 inline-flex rounded-full border p-1 text-[14px]" role="group" aria-label="Periode tagihan">
        <button
          type="button"
          onClick={() => setYearly(false)}
          aria-pressed={!yearly}
          className={"rounded-full px-4 py-1.5 " + (!yearly ? "bg-ink text-white" : "text-ink-2")}
        >
          Bulanan
        </button>
        <button
          type="button"
          onClick={() => setYearly(true)}
          aria-pressed={yearly}
          className={"rounded-full px-4 py-1.5 " + (yearly ? "bg-ink text-white" : "text-ink-2")}
        >
          Tahunan <span className={"ml-1 text-[12px] " + (yearly ? "text-teal-300" : "text-teal-700")}>hemat 2 bulan</span>
        </button>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {PLANS.map((p) => (
          <div
            key={p.id}
            className={"flex flex-col rounded-xl border p-6 " + (p.featured ? "stage-bg shadow-pop border-teal-900 text-white" : "border-line bg-surface")}
          >
            <div className="flex items-center justify-between">
              <h3 className={"text-[17px] " + (p.featured ? "text-white" : "")}>{p.name}</h3>
              {p.featured ? <Badge tone="accent">Paling dipilih</Badge> : null}
            </div>
            <p className={"mt-1.5 text-[13.5px] " + (p.featured ? "text-white/70" : "text-muted")}>{p.desc}</p>
            <div className="mt-5">
              {p.month ? (
                <>
                  <span className="text-[30px] font-semibold tracking-tight tabular-nums">{fmtRupiah(yearly ? p.month * 10 : p.month)}</span>
                  <span className={"text-[13px] " + (p.featured ? "text-white/70" : "text-muted")}> / anak / {yearly ? "tahun" : "bulan"}</span>
                </>
              ) : (
                <span className="text-[24px] font-semibold">Hubungi kami</span>
              )}
            </div>
            <ul className={"mt-5 space-y-2 text-[14px] " + (p.featured ? "text-white/85" : "text-ink-2")}>
              {p.items.map((i) => (
                <li key={i} className="flex gap-2">
                  <span aria-hidden className={p.featured ? "text-teal-300" : "text-teal-700"}>
                    ✓
                  </span>
                  {i}
                </li>
              ))}
            </ul>
            <div className="mt-6">
              <a href={p.month ? "/register" : "#kontak"} className="block">
                <Button variant={p.featured ? "light" : "primary"} className="w-full">
                  {p.month ? "Mulai dengan " + p.name : "Hubungi tim kami"}
                </Button>
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ContactForm() {
  const { busy, run } = useAction();
  const [done, setDone] = React.useState<string | null>(null);
  const formRef = React.useRef<HTMLFormElement>(null);
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const r = await run(
      () =>
        api.post<{ id: string; message: string }>("/api/tickets", {
          name: f.get("name"),
          email: f.get("email"),
          org: f.get("org") || "",
          topic: "Kontak",
          msg: f.get("msg"),
        }),
      { ok: (r) => r.message },
    );
    if (r) {
      setDone(r.message);
      formRef.current?.reset();
    }
  };
  return (
    <form ref={formRef} onSubmit={submit} className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nama" htmlFor="c-name">
          <Input id="c-name" name="name" required minLength={2} autoComplete="name" />
        </Field>
        <Field label="Email" htmlFor="c-email">
          <Input id="c-email" name="email" type="email" required autoComplete="email" />
        </Field>
      </div>
      <Field label="Nama daycare atau yayasan" htmlFor="c-org">
        <Input id="c-org" name="org" autoComplete="organization" />
      </Field>
      <Field label="Pesan" htmlFor="c-msg">
        <Textarea id="c-msg" name="msg" required minLength={5} placeholder="Ceritakan jumlah anak, jumlah ruang, dan yang ingin Anda pantau." />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? "Mengirim…" : "Kirim permintaan"}
        </Button>
        {done ? <span className="text-ok text-[13.5px]">{done}</span> : <span className="text-muted text-[13px]">Dibalas dalam 1 hari kerja.</span>}
      </div>
    </form>
  );
}

export function FaqList({ items }: { items: { q: string; a: string }[] }) {
  return (
    <div className="divide-line border-line bg-surface divide-y rounded-xl border">
      {items.map((f, i) => (
        <details key={i} className="group open:bg-wash/40 px-5 py-4">
          <summary className="text-ink flex cursor-pointer list-none items-center justify-between gap-4 text-[15px] font-semibold [&::-webkit-details-marker]:hidden">
            {f.q}
            <span aria-hidden className="text-muted transition-transform group-open:rotate-45">
              +
            </span>
          </summary>
          <p className="text-muted mt-2 max-w-2xl text-[14.5px] leading-relaxed">{f.a}</p>
        </details>
      ))}
    </div>
  );
}
