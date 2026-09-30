"use client";
import * as React from "react";
import { api } from "@/lib/api";
import { airHasData, airOverall, airTone, AIR_LABEL } from "@/lib/derive";
import { clock } from "@/lib/format";
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

export interface PartnershipPlan {
  id: string;
  name: string;
  badge: string;
  target: string;
  desc: string;
  modules: string[];
  scope: string[];
  cta: string;
  featured?: boolean;
}

const PARTNERSHIP_MODELS: PartnershipPlan[] = [
  {
    id: "pilot",
    name: "Program Kemitraan Percontohan",
    badge: "Daycare Percontohan",
    target: "Fasilitas Daycare yang Siap Meningkatkan Mutu",
    desc: "Program pendampingan intensif bagi daycare yang ingin menerapkan pencatatan digital terstandar dan kamera pengawasan keselamatan modern.",
    modules: [
      "Pemasangan kamera pintar pengawasan keselamatan",
      "Pencatatan tumbuh kembang anak terstandar Kemenkes RI",
      "Pemeriksaan suhu tubuh & kenyamanan kamar tidur anak",
      "Bimbingan operasional praktis untuk seluruh pengasuh",
    ],
    scope: [
      "Kesepakatan kerja sama kemitraan resmi (MoU)",
      "Jaminan privasi data anak & keluarga",
      "Laporan evaluasi berkala untuk pimpinan daycare",
    ],
    cta: "Daftar Sebagai Daycare Percontohan",
    featured: false,
  },
  {
    id: "full_ecosystem",
    name: "Kemitraan Terpadu Daycare Mandiri",
    badge: "Paling Banyak Dipilih",
    target: "Daycare Mandiri, Preschool, & Sentra Layanan Anak",
    desc: "Solusi lengkap pengawasan keselamatan, pemantauan kesehatan harian, laporan otomatis ke orang tua, dan evaluasi kepuasan layanan.",
    modules: [
      "Kamera pintar deteksi jatuh & pembatas zona aman",
      "Buku pantau tumbuh kembang resmi per jenjang usia",
      "Sensor kualitas udara & suhu tubuh nirsentuh",
      "Laporan harian otomatis tersusun rapi untuk orang tua",
      "Pengukur kepuasan & masukan orang tua berkala",
    ],
    scope: [
      "Akses penuh aplikasi untuk admin daycare & staf pengasuh",
      "Dukungan perangkat kamera & sensor siap pakai",
      "Dasbor evaluasi mutu layanan daycare",
      "Bantuan teknis & pendampingan operasional berkala",
    ],
    cta: "Konsultasikan Kemitraan Penuh",
    featured: true,
  },
  {
    id: "institution",
    name: "Solusi Jaringan Yayasan & Multi-Cabang",
    badge: "Yayasan & Korporasi",
    target: "Yayasan Pendidikan, Korporasi, & Daycare Multi-Lokasi",
    desc: "Sentralisasi pemantauan beberapa cabang daycare sekaligus dalam satu portal manajemen yayasan yang mudah dipantau kapan saja.",
    modules: [
      "Seluruh layanan unggulan fasilitas SmartDayCare",
      "Dasbor terpusat untuk pimpinan yayasan / yayasan pendidikan",
      "Perbandingan standar mutu layanan antar cabang fasilitas",
      "Penyelarasan SOP dan kurikulum kegiatan pengasuhan",
    ],
    scope: [
      "Pelatihan terpusat untuk kepala daycare dan pengasuh",
      "Integrasi dengan sistem administrasi yayasan",
      "Dukungan teknis prioritas & pembaruan berkelanjutan",
    ],
    cta: "Hubungi Kemitraan Yayasan",
    featured: false,
  },
];

export function PartnershipPrograms() {
  return (
    <div className="grid gap-6 md:grid-cols-3">
      {PARTNERSHIP_MODELS.map((p) => (
        <div
          key={p.id}
          className={
            "flex flex-col rounded-2xl border p-6 text-left transition-all duration-300 hover:shadow-lg " +
            (p.featured
              ? "stage-bg border-teal-800 text-white shadow-xl ring-2 ring-teal-500/50"
              : "border-line bg-surface hover:border-teal-300")
          }
        >
          <div className="flex items-center justify-between">
            <span
              className={
                "rounded-full px-3 py-1 text-[11.5px] font-semibold uppercase tracking-wider " +
                (p.featured ? "bg-teal-400/20 text-teal-200 border border-teal-300/30" : "bg-teal-50 text-teal-800 border border-teal-200")
              }
            >
              {p.badge}
            </span>
          </div>
          <h3 className={"mt-4 text-[20px] font-bold " + (p.featured ? "text-white" : "text-ink")}>{p.name}</h3>
          <p className={"mt-1 text-[13px] font-medium " + (p.featured ? "text-teal-200/80" : "text-teal-700")}>{p.target}</p>
          <p className={"mt-3 text-[14px] leading-relaxed " + (p.featured ? "text-white/80" : "text-muted")}>{p.desc}</p>

          <div className="mt-6 border-t pt-4 border-line/40">
            <div className={"text-[12px] font-bold uppercase tracking-wider " + (p.featured ? "text-teal-300" : "text-ink-2")}>
              Cakupan Layanan:
            </div>
            <ul className={"mt-3 space-y-2 text-[13.5px] " + (p.featured ? "text-white/90" : "text-ink-2")}>
              {p.modules.map((m) => (
                <li key={m} className="flex gap-2">
                  <span className={p.featured ? "text-teal-300 font-bold" : "text-teal-700 font-bold"}>✓</span>
                  <span>{m}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-4 border-t pt-4 border-line/40">
            <div className={"text-[12px] font-bold uppercase tracking-wider " + (p.featured ? "text-teal-300" : "text-ink-2")}>
              Dukungan Kemitraan:
            </div>
            <ul className={"mt-2 space-y-1.5 text-[13px] " + (p.featured ? "text-white/75" : "text-muted")}>
              {p.scope.map((s) => (
                <li key={s} className="flex gap-2">
                  <span className="opacity-60">•</span>
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-8 pt-2">
            <a href="#kontak" className="block">
              <Button
                variant={p.featured ? "light" : "primary"}
                className={"w-full font-semibold " + (p.featured ? "shadow-md hover:bg-white" : "")}
              >
                {p.cta} →
              </Button>
            </a>
          </div>
        </div>
      ))}
    </div>
  );
}

export function InteractiveAiDemo() {
  const [activeTab, setActiveTab] = React.useState<"safety" | "dev" | "health" | "report" | "trust">("safety");

  return (
    <div className="rounded-2xl border border-line bg-surface p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
        <div>
          <span className="text-[12px] font-bold uppercase tracking-wider text-teal-700">Pratinjau Layanan</span>
          <h3 className="text-[19px] font-bold text-ink">Fitur Unggulan Fasilitas Daycare</h3>
        </div>
        <div className="flex flex-wrap gap-1.5 rounded-lg bg-wash p-1 text-[13px]">
          <button
            type="button"
            onClick={() => setActiveTab("safety")}
            className={"rounded-md px-3 py-1.5 font-medium transition " + (activeTab === "safety" ? "bg-white shadow text-teal-800" : "text-muted hover:text-ink")}
          >
            1. Pengawasan Kamera
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("dev")}
            className={"rounded-md px-3 py-1.5 font-medium transition " + (activeTab === "dev" ? "bg-white shadow text-teal-800" : "text-muted hover:text-ink")}
          >
            2. Tumbuh Kembang
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("health")}
            className={"rounded-md px-3 py-1.5 font-medium transition " + (activeTab === "health" ? "bg-white shadow text-teal-800" : "text-muted hover:text-ink")}
          >
            3. Kesehatan & Udara
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("report")}
            className={"rounded-md px-3 py-1.5 font-medium transition " + (activeTab === "report" ? "bg-white shadow text-teal-800" : "text-muted hover:text-ink")}
          >
            4. Laporan Kegiatan
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("trust")}
            className={"rounded-md px-3 py-1.5 font-medium transition " + (activeTab === "trust" ? "bg-white shadow text-teal-800" : "text-muted hover:text-ink")}
          >
            5. Kepuasan Orang Tua
          </button>
        </div>
      </div>

      <div className="mt-6">
        {activeTab === "safety" && (
          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-xl border border-line bg-wash/50 p-4">
              <div className="flex items-center justify-between text-[13px]">
                <span className="font-semibold text-ink">Pemantauan Area Bermain (Kamera Ruang Utama)</span>
                <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-600 animate-pulse" /> Pengawasan Aktif
                </span>
              </div>
              <div className="relative mt-3 h-52 w-full rounded-lg bg-slate-900 overflow-hidden flex flex-col items-center justify-center text-white border border-slate-700">
                <div className="absolute top-2 left-2 rounded bg-black/70 px-2 py-0.5 text-[11px] text-emerald-400 font-medium">
                  Area Bermain Anak · Pengawasan Siang
                </div>
                <div className="absolute top-2 right-2 rounded bg-black/70 px-2 py-0.5 text-[11px] text-yellow-300 font-medium">
                  Privasi Wajah Terlindungi
                </div>
                {/* Zona Pembatas Dapur */}
                <div className="absolute top-0 right-0 h-24 w-32 border-2 border-dashed border-rose-500 bg-rose-500/20 flex items-center justify-center text-[11px] text-rose-200 font-semibold">
                  Zona Terbatas (Dapur)
                </div>
                {/* Visual Peringatan Keselamatan */}
                <div className="rounded-md border border-teal-400 bg-teal-950/70 p-3 text-center text-xs backdrop-blur-sm">
                  <span className="font-bold text-teal-300">Area Terpantau Aman & Terawasi</span>
                  <div className="text-[11px] text-white/80 mt-0.5">Pengasuh mendampingi anak secara aktif</div>
                </div>
              </div>
              <p className="mt-2 text-[12px] text-muted">
                Bila terdeteksi anak mendekati area dapur atau tangga, sistem langsung mengirim peringatan ke ponsel pengasuh.
              </p>
            </div>
            <div className="flex flex-col justify-between">
              <div>
                <h4 className="text-[16px] font-bold text-ink">Pengawasan Keselamatan Pintar</h4>
                <p className="mt-2 text-[14px] text-muted leading-relaxed">
                  Membantu pengasuh mengawasi anak secara optimal. Kamera pintar secara otomatis mendeteksi kejadian penting seperti anak jatuh atau mendekati area terlarang, memberikan ketenangan ekstra bagi pengelola dan orang tua.
                </p>
                <div className="mt-4 space-y-2 text-[13px]">
                  <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-emerald-900">
                    🔒 <b>Privasi Anak Terjaga:</b> Rekaman kamera disimpan secara aman di fasilitas daycare Anda dan wajah anak dilindungi penyamaran otomatis bagi pihak yang tidak berwenang.
                  </div>
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-line text-[13px] font-semibold text-teal-800">
                Fitur siap pakai dan mudah diintegrasikan dengan kamera yang sudah ada di daycare Anda.
              </div>
            </div>
          </div>
        )}

        {activeTab === "dev" && (
          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-xl border border-line bg-wash/50 p-4">
              <span className="text-[12px] font-bold uppercase text-teal-700">Pemantauan Tumbuh Kembang (Anak Usia 2 Tahun)</span>
              <div className="mt-3 space-y-2">
                {[
                  { name: "Motorik Kasar (Keseimbangan, berjalan, melompat)", score: "100%", status: "Sangat Baik" },
                  { name: "Motorik Halus (Menyusun balok, menggenggam)", score: "90%", status: "Sangat Baik" },
                  { name: "Bicara & Bahasa (Mengucapkan kalimat sederhana)", score: "85%", status: "Baik" },
                  { name: "Sosial & Kemandirian (Makan sendiri, melepas sepatu)", score: "90%", status: "Sangat Baik" },
                ].map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between rounded-lg bg-white p-2.5 border border-line text-[13px]">
                    <span className="font-medium text-ink">{item.name}</span>
                    <span className="rounded bg-emerald-100 px-2 py-0.5 font-bold text-emerald-800 text-[12px]">{item.status} ({item.score})</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 rounded-lg bg-teal-50 border border-teal-200 p-3 text-[13px] text-teal-900">
                <b>Hasil Pemantauan:</b> Perkembangan anak berjalan sangat baik sesuai usianya. Saran stimulasi: permainan rintangan bantal dan membacakan buku cerita bergambar.
              </div>
            </div>
            <div>
              <h4 className="text-[16px] font-bold text-ink">Pemantauan Tumbuh Kembang Terstandar</h4>
              <p className="mt-2 text-[14px] text-muted leading-relaxed">
                Memudahkan pengasuh mencatat tahapan perkembangan anak mengacu pada pedoman baku Kementerian Kesehatan RI. Hasil pemantauan disajikan dalam bentuk grafik yang mudah dipahami orang tua.
              </p>
              <ul className="mt-4 space-y-2 text-[13.5px] text-ink-2">
                <li className="flex gap-2"><span className="text-teal-700 font-bold">✓</span> Memastikan potensi keterlambatan anak terdeteksi sejak masa emas usia dini.</li>
                <li className="flex gap-2"><span className="text-teal-700 font-bold">✓</span> Saran stimulasi bermain yang dapat dilanjutkan orang tua di rumah.</li>
                <li className="flex gap-2"><span className="text-teal-700 font-bold">✓</span> Laporan perkembangan berkala siap cetak untuk portofolio anak.</li>
              </ul>
            </div>
          </div>
        )}

        {activeTab === "health" && (
          <div className="grid gap-6 md:grid-cols-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-line bg-blue-50 p-4">
                <div className="text-[12px] font-semibold text-blue-700">Pemeriksaan Suhu Tubuh</div>
                <div className="mt-1 text-[26px] font-bold text-blue-900">36.6°C</div>
                <div className="text-[11.5px] text-blue-700">Suhu Tubuh Normal & Sehat</div>
              </div>
              <div className="rounded-xl border border-line bg-emerald-50 p-4">
                <div className="text-[12px] font-semibold text-emerald-700">Kenyamanan Udara Kamar</div>
                <div className="mt-1 text-[26px] font-bold text-emerald-900">24.5°C</div>
                <div className="text-[11.5px] text-emerald-700">Udara Sejuk & Bersih</div>
              </div>
              <div className="rounded-xl border border-line bg-violet-50 p-4">
                <div className="text-[12px] font-semibold text-violet-700">Durasi Tidur Siang</div>
                <div className="mt-1 text-[26px] font-bold text-violet-900">90 Menit</div>
                <div className="text-[11.5px] text-violet-700">Tidur Tenang & Cukup</div>
              </div>
              <div className="rounded-xl border border-line bg-amber-50 p-4">
                <div className="text-[12px] font-semibold text-amber-700">Porsi Makan Siang</div>
                <div className="mt-1 text-[26px] font-bold text-amber-900">1 Porsi</div>
                <div className="text-[11.5px] text-amber-700">Makan Lahap & Habis</div>
              </div>
            </div>
            <div>
              <h4 className="text-[16px] font-bold text-ink">Pemantau Kesehatan & Kenyamanan</h4>
              <p className="mt-2 text-[14px] text-muted leading-relaxed">
                Menjaga lingkungan kamar tidur anak tetap sejuk, nyaman, dan berudara segar. Pengasuh dapat memeriksa suhu tubuh anak secara non-kontak saat anak tiba dan sebelum tidur siang.
              </p>
              <div className="mt-3 rounded-lg bg-wash p-3 border border-line text-[13px] text-ink-2">
                <b>Pemberitahuan Cepat:</b> Bila suhu tubuh anak menunjukkan kenaikan atau anak tampak kurang sehat, pengasuh dapat segera memberi perhatian dan mengabari orang tua.
              </div>
            </div>
          </div>
        )}

        {activeTab === "report" && (
          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-xl border border-line bg-wash/50 p-4">
              <span className="text-[12px] font-bold uppercase text-teal-700">Contoh Laporan Harian untuk Orang Tua</span>
              <div className="mt-2 rounded-lg bg-white p-3.5 border border-line text-[13px] text-ink-2 leading-relaxed italic">
                “Halo Ayah & Bunda! Hari ini Ananda sangat ceria saat belajar meronce balok kayu dan bernyanyi bersama teman-teman. Makan siang habis satu porsi dan tidur siang selama 90 menit dengan sangat nyenyak di ruang tidur ber-AC sejuk. Seluruh aktivitas terpantau aman dan menyenangkan.”
              </div>
              <div className="mt-3 rounded-lg border border-teal-200 bg-teal-50 p-2.5 text-[12px] text-teal-900">
                <b>Catatan Transparan:</b> Rangkuman aktivitas harian tersusun otomatis setiap sore, memudahkan pengasuh berbagi momen indah anak ke keluarga.
              </div>
            </div>
            <div>
              <h4 className="text-[16px] font-bold text-ink">Laporan Harian Rapi & Penanganan Cepat</h4>
              <p className="mt-2 text-[14px] text-muted leading-relaxed">
                Menghilangkan kebingungan orang tua akibat informasi yang terpecah di grup chat. Memberikan laporan harian terstruktur yang rapi, santun, dan hangat setiap sore.
              </p>
            </div>
          </div>
        )}

        {activeTab === "trust" && (
          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-xl border border-line bg-wash/50 p-4">
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-bold uppercase text-teal-700">Indeks Kepuasan Orang Tua</span>
                <span className="text-[22px] font-bold text-teal-800">95.0%</span>
              </div>
              <div className="mt-3 space-y-2 text-[13px]">
                <div className="flex justify-between border-b pb-1"><span>Keamanan Fasilitas</span><span className="font-bold text-teal-700">96% (Sangat Puas)</span></div>
                <div className="flex justify-between border-b pb-1"><span>Kebersihan Ruangan</span><span className="font-bold text-teal-700">94% (Sangat Puas)</span></div>
                <div className="flex justify-between border-b pb-1"><span>Menu & Gizi Makanan</span><span className="font-bold text-teal-700">92% (Puas)</span></div>
                <div className="flex justify-between border-b pb-1"><span>Keramahan Pengasuh</span><span className="font-bold text-teal-700">98% (Sangat Puas)</span></div>
                <div className="flex justify-between pb-1"><span>Komunikasi & Laporan</span><span className="font-bold text-teal-700">95% (Sangat Puas)</span></div>
              </div>
              <div className="mt-3 rounded bg-emerald-100 p-2 text-center text-[12px] font-semibold text-emerald-800">
                Tingkat Kepercayaan Keluarga Sangat Tinggi
              </div>
            </div>
            <div>
              <h4 className="text-[16px] font-bold text-ink">Evaluasi Mutu & Kepuasan Layanan</h4>
              <p className="mt-2 text-[14px] text-muted leading-relaxed">
                Menyediakan umpan balik berkala dari orang tua secara terstruktur. Pimpinan daycare dapat melihat bagian mana yang disukai keluarga dan bagian mana yang perlu ditingkatkan, sehingga reputasi daycare terus terjaga prima.
              </p>
            </div>
          </div>
        )}
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
          topic: "Kemitraan Mitra Daycare",
          msg: `[Kota: ${f.get("city") || "-"}] [Kapasitas Anak: ${f.get("capacity") || "-"}] [Minat Modul: ${f.get("module") || "-"}] - Pesan: ${f.get("msg")}`,
        }),
      { ok: (r) => r.message },
    );
    if (r) {
      setDone("Terima kasih! Tim Kemitraan SmartDayCare akan segera menghubungi Anda dalam 1 hari kerja.");
      formRef.current?.reset();
    }
  };
  return (
    <form ref={formRef} onSubmit={submit} className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nama Pengelola / Pimpinan" htmlFor="c-name">
          <Input id="c-name" name="name" required minLength={2} placeholder="contoh: Ibu Maria / Bpk. Faisal" autoComplete="name" />
        </Field>
        <Field label="Email Resmi" htmlFor="c-email">
          <Input id="c-email" name="email" type="email" required placeholder="pengelola@daycare.com" autoComplete="email" />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nama Fasilitas Daycare / Yayasan" htmlFor="c-org">
          <Input id="c-org" name="org" required placeholder="contoh: Daycare Bintang Ceria" autoComplete="organization" />
        </Field>
        <Field label="Kota Lokasi Fasilitas" htmlFor="c-city">
          <Input id="c-city" name="city" required placeholder="contoh: Semarang / Bandung / Jakarta" />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Kapasitas Anak Saat Ini" htmlFor="c-capacity">
          <Input id="c-capacity" name="capacity" placeholder="contoh: 25 anak (3 ruang)" />
        </Field>
        <Field label="Fokus Modul yang Diutamakan" htmlFor="c-module">
          <Input id="c-module" name="module" placeholder="contoh: OmniWatch CCTV & KPSP Kemenkes" />
        </Field>
      </div>

      <Field label="Kebutuhan Khusus / Rencana Kemitraan" htmlFor="c-msg">
        <Textarea
          id="c-msg"
          name="msg"
          required
          minLength={5}
          placeholder="Ceritakan kondisi CCTV/sensor saat ini, target waktu implementasi, atau kesediaan menjadi mitra uji coba (MoU pilot)..."
        />
      </Field>

      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <Button type="submit" variant="primary" disabled={busy} className="bg-teal-700 hover:bg-teal-800 text-white font-semibold px-6">
          {busy ? "Mengirimkan Pengajuan…" : "Kirim Pengajuan Kemitraan"}
        </Button>
        {done ? (
          <span className="text-emerald-700 font-semibold text-[13px] bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg">
            ✓ {done}
          </span>
        ) : (
          <span className="text-muted text-[12.5px]">Konfirmasi dikirimkan via email dan WhatsApp dalam 24 jam.</span>
        )}
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
