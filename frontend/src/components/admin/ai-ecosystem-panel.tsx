"use client";
import * as React from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Cpu,
  FileCheck,
  HeartHandshake,
  MessageSquare,
  Play,
  RefreshCw,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Thermometer,
  Video,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/field";
import { Panel, PanelBody, PanelHead } from "@/components/ui/panel";
import { api } from "@/lib/api";

export function AiEcosystemPanel() {
  const [activeTab, setActiveTab] = React.useState<"omni" | "kpsp" | "iot" | "comm" | "trust">("omni");
  const [loading, setLoading] = React.useState(false);

  // Modul 1 State: OmniWatch
  const [omniResult, setOmniResult] = React.useState<any>(null);
  const [simScenario, setSimScenario] = React.useState<"normal" | "fall" | "kitchen">("fall");

  // Modul 2 State: KPSP Kemenkes
  const [kpspAge, setKpspAge] = React.useState(24);
  const [kpspQuestions, setKpspQuestions] = React.useState<any[]>([]);
  const [kpspAnswers, setKpspAnswers] = React.useState<Record<string, boolean>>({});
  const [kpspResult, setKpspResult] = React.useState<any>(null);

  // Modul 3 State: IoT Vitals
  const [tempInput, setTempInput] = React.useState("37.8");
  const [napInput, setNapInput] = React.useState("40");
  const [iotResult, setIotResult] = React.useState<any>(null);

  // Modul 4 State: LLM Narrative
  const [childNameInput, setChildNameInput] = React.useState("Alula Syafira");
  const [caregiverNoteInput, setCaregiverNoteInput] = React.useState("Alula sangat aktif meronce manik dan tersenyum ceria saat makan siang");
  const [llmResult, setLlmResult] = React.useState<any>(null);

  // Modul 5 State: TrustMeter ABSA
  const [reviewInput, setReviewInput] = React.useState("Bunda pengasuh sangat telaten dan sabar merawat anak kami, tetapi ruang tunggu terasa agak panas dan laporan pesan sore kadang terlambat.");
  const [trustResult, setTrustResult] = React.useState<any>(null);

  // Load KPSP questions when tab or age changes
  React.useEffect(() => {
    if (activeTab === "kpsp") {
      fetchKpspQuestions(kpspAge);
    }
  }, [activeTab, kpspAge]);

  const fetchKpspQuestions = async (age: number) => {
    try {
      setLoading(true);
      const res = await api.get<any>(`/api/ai/development/kpsp-questions?age_months=${age}`);
      setKpspQuestions(res.questions || []);
      // default all true
      const initial: Record<string, boolean> = {};
      (res.questions || []).forEach((q: any) => {
        initial[q.id] = true;
      });
      setKpspAnswers(initial);
      setKpspResult(null);
    } catch {
      // Fallback local if API backend not running yet
      setKpspQuestions([
        { id: "KPSP_24_1", aspect: "gross_motor", milestone: "Menaiki tangga", text: "Apakah anak dapat menaiki tangga tanpa berpegangan?" },
        { id: "KPSP_24_2", aspect: "fine_motor", milestone: "Menyusun menara 4 balok", text: "Apakah anak dapat menyusun menara 4 balok kecil?" },
        { id: "KPSP_24_3", aspect: "speech_language", milestone: "Frasa 2 kata kombinasi", text: "Apakah anak dapat menggabungkan 2 kata (misal 'minta susu')?" },
        { id: "KPSP_24_4", aspect: "social_emotional", milestone: "Makan mandiri", text: "Apakah anak dapat makan sendiri dengan sendok tanpa banyak tumpah?" },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleRunOmniWatch = async () => {
    setLoading(true);
    let detections: any[] = [];
    if (simScenario === "fall") {
      detections = [{ track_id: "anak_01", bbox: [0.35, 0.60, 0.45, 0.18], confidence: 0.94, is_caregiver: false }];
    } else if (simScenario === "kitchen") {
      detections = [{ track_id: "anak_02", bbox: [0.80, 0.15, 0.15, 0.40], confidence: 0.92, is_caregiver: false }];
    } else {
      detections = [{ track_id: "anak_03", bbox: [0.40, 0.40, 0.18, 0.45], confidence: 0.96, is_caregiver: false }];
    }

    try {
      const res = await api.post<any>("/api/ai/omniwatch/evaluate-frame", {
        camera_id: "CCTV_Ruang_Bermain_Utama",
        detections,
      });
      setOmniResult(res);
    } catch {
      // client simulation fallback
      setOmniResult({
        camera_id: "CCTV_Ruang_Bermain_Utama",
        is_safe: simScenario === "normal",
        anomalies_detected:
          simScenario === "fall"
            ? [
                {
                  type: "fall_detected",
                  severity: "critical",
                  confidence: 0.94,
                  message: "Terdeteksi anak terjatuh mendadak! (Sudut tubuh 78°, W/H 2.5)",
                  auto_clip_saved: true,
                  clip_filename: "clip_fall_anak_01.mp4",
                  privacy_blur_applied: true,
                },
              ]
            : simScenario === "kitchen"
            ? [
                {
                  type: "geofence_breach",
                  severity: "critical",
                  zone_name: "Area Dapur & Pantry",
                  confidence: 0.95,
                  message: "Peringatan: Anak melintasi batas virtual Area Dapur & Kompor!",
                  auto_clip_saved: true,
                  clip_filename: "clip_geofence_kitchen.mp4",
                  privacy_blur_applied: true,
                },
              ]
            : [],
      });
    } finally {
      setLoading(false);
    }
  };

  const handleEvaluateKpsp = async () => {
    setLoading(true);
    try {
      const res = await api.post<any>("/api/ai/development/kpsp-evaluate", {
        child_id: "child_alula",
        child_name: "Alula Syafira",
        age_months: kpspAge,
        answers: kpspAnswers,
      });
      setKpspResult(res);
    } catch {
      const totalYes = Object.values(kpspAnswers).filter(Boolean).length;
      setKpspResult({
        child_name: "Alula Syafira",
        age_months: kpspAge,
        total_score: totalYes,
        max_score: kpspQuestions.length,
        status_label: totalYes >= 9 ? "Perkembangan Sesuai (Normal)" : totalYes >= 7 ? "Meragukan (Butuh Stimulasi)" : "Penyimpangan (Rujukan)",
        severity: totalYes >= 9 ? "low" : totalYes >= 7 ? "medium" : "critical",
        development_index: Math.round((totalYes / Math.max(1, kpspQuestions.length)) * 100),
        clinical_guidance: "Evaluasi mengacu pada pedoman baku Kementerian Kesehatan RI.",
        stimulations: [
          {
            aspect: "Motorik Kasar & Bahasa",
            title: "Stimulasi Lanjutan Usia Emas",
            activity: "Ajak anak bermain tangkap bola lembut dan membacakan dongeng dengan intonasi jelas.",
          },
        ],
      });
    } finally {
      setLoading(false);
    }
  };

  const handleEvaluateIot = async () => {
    setLoading(true);
    const temp = parseFloat(tempInput) || 36.6;
    const nap = parseFloat(napInput) || 90;
    try {
      const res = await api.post<any>("/api/ai/wellbeing/evaluate-vitals", {
        child_id: "anak_01",
        temperature: temp,
        nap_minutes: nap,
        meal_ratio: 0.85,
        restless_motion: 0.2,
      });
      setIotResult(res);
    } catch {
      const isDemam = temp >= 37.5;
      setIotResult({
        current_temp: temp,
        nap_duration_minutes: nap,
        wellbeing_score: isDemam ? 65 : 95,
        is_abnormal: isDemam || nap < 45,
        status_summary: isDemam
          ? `Subfebris/Hangat (${temp}°C). Terdeteksi gejala awal demam anak.`
          : "Kondisi Sehat & Bugar",
        deviations_detected: isDemam ? [`Suhu tubuh meningkat (${temp}°C)`] : [],
      });
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateLlm = async () => {
    setLoading(true);
    try {
      const res = await api.post<any>("/api/ai/communication/generate-narrative", {
        child_name: childNameInput,
        caregiver_notes: [caregiverNoteInput],
        activities: ["Bermain Sensorik Lilin", "Mendengarkan Dongeng Kelinci", "Senam Motorik Pagi"],
        meal_summary: "Makan siang 1 porsi habis lahap dan buah pisang",
        sleep_minutes: 90,
      });
      setLlmResult(res);
    } catch {
      setLlmResult({
        generated_narrative: `Halo Ayah & Bunda dari Ananda ${childNameInput}! Hari ini ananda sangat ceria mengikuti aneka kegiatan seperti bermain sensorik dan dongeng kelinci. Makan siang habis 1 porsi dan tidur siang 90 menit dengan pulas. Seluruh aktivitas terpantau aman dan nyaman.`,
        synthesized_by: "SmartDayCare LLM Core Engine v2.4",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAnalyzeTrust = async () => {
    setLoading(true);
    try {
      const res = await api.post<any>("/api/ai/trustmeter/analyze-feedback", {
        text: reviewInput,
        rating: 4,
      });
      setTrustResult(res);
    } catch {
      setTrustResult({
        text: reviewInput,
        overall_sentiment: "positif",
        parent_trust_score: 82.5,
        aspects: {
          sikap_pengasuh: { polarity: "positif", sentiment_score: 0.85 },
          komunikasi: { polarity: "negatif", sentiment_score: -0.45 },
          kebersihan: { polarity: "positif", sentiment_score: 0.70 },
        },
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-teal-200 bg-gradient-to-r from-teal-50 to-emerald-50 p-6">
        <div>
          <div className="inline-flex items-center gap-1.5 rounded-full bg-teal-200/80 px-3 py-0.5 text-[12px] font-bold text-teal-900">
            <Cpu size={14} /> Solusi Kemitraan Mitra Daycare
          </div>
          <h2 className="mt-2 text-[24px] font-bold text-ink">Panel Ekosistem 5 Modul Inovasi AI</h2>
          <p className="mt-1 text-[14px] text-muted max-w-2xl">
            Pusat kendali dan uji coba analitik kecerdasan buatan terpadu sesuai proposal usulan penajaman. Standar privasi UU PDP No. 27/2022.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-[13px]">
          <span className="rounded-lg bg-white px-3 py-1.5 font-semibold text-teal-800 shadow-sm border border-line">
            ✓ 5 Modul Terintegrasi
          </span>
          <span className="rounded-lg bg-white px-3 py-1.5 font-semibold text-teal-800 shadow-sm border border-line">
            🔒 Privacy by Design
          </span>
        </div>
      </div>

      {/* Tabs 5 Modul */}
      <div className="flex flex-wrap gap-2 border-b border-line pb-2">
        {[
          { id: "omni", name: "1. OmniWatch CCTV", icon: Video },
          { id: "kpsp", name: "2. KPSP Kemenkes ML", icon: BarChart3 },
          { id: "iot", name: "3. IoT & Vitals Anak", icon: Activity },
          { id: "comm", name: "4. Komunikasi LLM", icon: MessageSquare },
          { id: "trust", name: "5. TrustMeter ABSA", icon: HeartHandshake },
        ].map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={
                "flex items-center gap-2 rounded-xl px-4 py-2.5 text-[14px] font-semibold transition-all " +
                (active
                  ? "bg-teal-700 text-white shadow-sm"
                  : "bg-surface text-ink-2 hover:bg-wash border border-line/60")
              }
            >
              <Icon size={16} />
              {tab.name}
            </button>
          );
        })}
      </div>

      {/* Konten Tab 1: OmniWatch */}
      {activeTab === "omni" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Panel>
            <PanelHead title="Simulasi Deteksi Multi-CCTV (Tim Reino)" desc="Computer Vision, Pose Fall Detection, & Geofencing" />
            <PanelBody className="space-y-4">
              <div>
                <label className="text-[13px] font-semibold text-ink">Pilih Skenario Deteksi Kamera:</label>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {[
                    { id: "normal", label: "Aktivitas Normal" },
                    { id: "fall", label: "Anak Terjatuh" },
                    { id: "kitchen", label: "Dekati Dapur" },
                  ].map((sc) => (
                    <button
                      key={sc.id}
                      type="button"
                      onClick={() => setSimScenario(sc.id as any)}
                      className={
                        "rounded-lg p-2.5 text-[13px] font-medium border text-center transition " +
                        (simScenario === sc.id
                          ? "border-teal-700 bg-teal-50 text-teal-900 font-bold"
                          : "border-line bg-surface text-muted hover:text-ink")
                      }
                    >
                      {sc.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-xl bg-slate-950 p-4 text-white font-mono text-[12px] space-y-2 border border-slate-800">
                <div className="text-emerald-400">Stream: rtsp://edge-gateway.local/cctv_ruang_bermain_1</div>
                <div>Status Frame: 30 FPS · Latensi: 18ms · Privacy Masking: ON (Wajah Diblur)</div>
                <div className="text-slate-400">Model: YOLOv8-Pose + FallNet Edge Acceleration</div>
              </div>

              <Button
                variant="primary"
                onClick={handleRunOmniWatch}
                disabled={loading}
                className="w-full bg-teal-700 hover:bg-teal-800 text-white font-semibold"
              >
                <Play size={16} className="mr-2" /> Evaluasi Frame Kamera Sekarang
              </Button>
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHead title="Hasil Analisis AI OmniWatch" desc="Deteksi Anomali & Rekaman Bukti Otomatis" />
            <PanelBody>
              {omniResult ? (
                <div className="space-y-4">
                  <div
                    className={
                      "rounded-xl p-4 border " +
                      (omniResult.is_safe
                        ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                        : "bg-rose-50 border-rose-200 text-rose-900")
                    }
                  >
                    <div className="flex items-center gap-2 font-bold text-[15px]">
                      {omniResult.is_safe ? <CheckCircle2 className="text-emerald-600" /> : <ShieldAlert className="text-rose-600" />}
                      {omniResult.is_safe ? "Area Terpantau Aman & Kondusif" : "PERINGATAN ANOMALI KESELAMATAN TERDETEKSI!"}
                    </div>
                    <p className="mt-1 text-[13px] opacity-90">
                      Kamera: {omniResult.camera_id} · Privacy Masking UU PDP 2022 Aktif
                    </p>
                  </div>

                  {omniResult.anomalies_detected?.map((an: any, idx: number) => (
                    <div key={idx} className="rounded-xl border border-rose-300 bg-white p-4 shadow-sm space-y-2">
                      <div className="flex items-center justify-between">
                        <Badge tone="danger">Tingkat: {an.severity.toUpperCase()}</Badge>
                        <span className="text-[12px] font-mono text-muted">Akurasi: {Math.round(an.confidence * 100)}%</span>
                      </div>
                      <div className="text-[14px] font-semibold text-rose-950">{an.message}</div>
                      {an.auto_clip_saved && (
                        <div className="rounded bg-rose-100/60 p-2 text-[12px] text-rose-800 font-mono">
                          📹 Klip Rekaman Bukti Tersimpan: {an.clip_filename} (10 Detik Sebelum & Sesudah)
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex h-48 flex-col items-center justify-center text-center text-muted">
                  <Video size={36} className="text-slate-300 mb-2" />
                  <p className="text-[14px]">Klik tombol evaluasi untuk melihat deteksi pose & geofencing.</p>
                </div>
              )}
            </PanelBody>
          </Panel>
        </div>
      )}

      {/* Konten Tab 2: KPSP Kemenkes */}
      {activeTab === "kpsp" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Panel>
            <PanelHead title="Skrining Baku KPSP Kemenkes RI (Tim Abi)" desc="Instrumen Baku Tumbuh Kembang 4 Aspek" />
            <PanelBody className="space-y-4">
              <div className="flex items-center gap-3">
                <label className="text-[13.5px] font-semibold text-ink">Kelompok Usia Anak:</label>
                <select
                  value={kpspAge}
                  onChange={(e) => setKpspAge(Number(e.target.value))}
                  className="rounded-lg border border-line bg-surface px-3 py-1.5 text-[14px] font-semibold"
                >
                  <option value={12}>12 Bulan (1 Tahun)</option>
                  <option value={24}>24 Bulan (2 Tahun)</option>
                  <option value={36}>36 Bulan (3 Tahun)</option>
                  <option value={48}>48 Bulan (4 Tahun)</option>
                </select>
              </div>

              <div className="max-h-72 overflow-y-auto space-y-2.5 pr-2">
                {kpspQuestions.map((q) => (
                  <div key={q.id} className="flex items-start justify-between gap-3 rounded-lg border border-line bg-wash/40 p-2.5 text-[13px]">
                    <div className="flex-1">
                      <span className="font-bold text-teal-800 uppercase text-[11px]">[{q.aspect.replace("_", " ")}]</span>
                      <p className="text-ink font-medium mt-0.5">{q.text}</p>
                    </div>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => setKpspAnswers((prev) => ({ ...prev, [q.id]: true }))}
                        className={
                          "rounded px-2.5 py-1 text-[12px] font-bold " +
                          (kpspAnswers[q.id] ? "bg-emerald-600 text-white" : "bg-white border text-muted")
                        }
                      >
                        Ya
                      </button>
                      <button
                        type="button"
                        onClick={() => setKpspAnswers((prev) => ({ ...prev, [q.id]: false }))}
                        className={
                          "rounded px-2.5 py-1 text-[12px] font-bold " +
                          (kpspAnswers[q.id] === false ? "bg-rose-600 text-white" : "bg-white border text-muted")
                        }
                      >
                        Tidak
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <Button
                variant="primary"
                onClick={handleEvaluateKpsp}
                disabled={loading}
                className="w-full bg-teal-700 hover:bg-teal-800 text-white font-semibold"
              >
                Hitung Analitik Perkembangan KPSP AI
              </Button>
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHead title="Hasil Analitik Trajectory & Rekomendasi" desc="Deteksi Dini Keterlambatan Tumbuh Kembang" />
            <PanelBody>
              {kpspResult ? (
                <div className="space-y-4">
                  <div className="rounded-xl border border-teal-200 bg-teal-50 p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-[13px] font-semibold text-teal-900">Status Kemenkes RI:</span>
                      <span className="rounded-full bg-teal-200 px-3 py-0.5 text-[12px] font-bold text-teal-950">
                        Skor: {kpspResult.total_score} / {kpspResult.max_score}
                      </span>
                    </div>
                    <div className="mt-2 text-[20px] font-bold text-teal-900">{kpspResult.status_label}</div>
                    <p className="mt-1 text-[13px] text-teal-800">{kpspResult.clinical_guidance}</p>
                  </div>

                  <div>
                    <h4 className="text-[14px] font-bold text-ink mb-2">Rekomendasi Stimulasi Personal AI:</h4>
                    <div className="space-y-2">
                      {kpspResult.stimulations?.map((st: any, i: number) => (
                        <div key={i} className="rounded-lg border border-line bg-surface p-3 text-[13px]">
                          <span className="font-bold text-teal-700">{st.title}</span>
                          <p className="text-muted mt-1 leading-relaxed">{st.activity}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex h-48 flex-col items-center justify-center text-center text-muted">
                  <BarChart3 size={36} className="text-slate-300 mb-2" />
                  <p className="text-[14px]">Pilih jawaban checklist KPSP untuk melihat laporan analitik perkembangan.</p>
                </div>
              )}
            </PanelBody>
          </Panel>
        </div>
      )}

      {/* Konten Tab 3: IoT & Wellbeing */}
      {activeTab === "iot" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Panel>
            <PanelHead title="Input Sensor IoT Harian (Tim Zaki)" desc="Termometer IR Non-invasif, Kasur Gerak, & Sensor Udara" />
            <PanelBody className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[13px] font-semibold text-ink">Suhu Tubuh IR (°C):</label>
                  <input
                    type="number"
                    step="0.1"
                    value={tempInput}
                    onChange={(e) => setTempInput(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-[14px] font-bold"
                  />
                  <span className="text-[11.5px] text-muted">Normal: 36.5°C - 37.2°C</span>
                </div>
                <div>
                  <label className="text-[13px] font-semibold text-ink">Durasi Tidur Siang (menit):</label>
                  <input
                    type="number"
                    value={napInput}
                    onChange={(e) => setNapInput(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-[14px] font-bold"
                  />
                  <span className="text-[11.5px] text-muted">Normal: 60 - 120 menit</span>
                </div>
              </div>

              <div className="rounded-xl border border-line bg-wash/40 p-3 space-y-2 text-[13px]">
                <div className="font-semibold text-ink">Sensor Udara Ruang (CO2 & Kenyamanan):</div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded bg-white p-2 border">Suhu: 24.2°C</div>
                  <div className="rounded bg-white p-2 border">Kelembaban: 55%</div>
                  <div className="rounded bg-white p-2 border text-emerald-700 font-bold">CO2: 610 ppm</div>
                </div>
              </div>

              <Button
                variant="primary"
                onClick={handleEvaluateIot}
                disabled={loading}
                className="w-full bg-teal-700 hover:bg-teal-800 text-white font-semibold"
              >
                Evaluasi Kesejahteraan Fisiologis AI
              </Button>
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHead title="Status Kesejahteraan Anak" desc="Baseline Pembelajaran Pola Harian AI" />
            <PanelBody>
              {iotResult ? (
                <div className="space-y-4">
                  <div
                    className={
                      "rounded-xl p-4 border " +
                      (iotResult.is_abnormal
                        ? "bg-amber-50 border-amber-200 text-amber-950"
                        : "bg-emerald-50 border-emerald-200 text-emerald-950")
                    }
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[13px] font-bold">Skor Kesejahteraan Harian:</span>
                      <span className="text-[20px] font-extrabold">{iotResult.wellbeing_score}%</span>
                    </div>
                    <div className="mt-2 text-[15px] font-bold">{iotResult.status_summary}</div>
                  </div>

                  {iotResult.deviations_detected?.length > 0 && (
                    <div className="rounded-xl border border-amber-200 bg-white p-3 text-[13px] space-y-1">
                      <div className="font-bold text-amber-900">Penyimpangan Dari Kebiasaan Anak:</div>
                      {iotResult.deviations_detected.map((dev: string, i: number) => (
                        <div key={i} className="text-muted">• {dev}</div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex h-48 flex-col items-center justify-center text-center text-muted">
                  <Activity size={36} className="text-slate-300 mb-2" />
                  <p className="text-[14px]">Masukkan data vitals untuk melihat deteksi demam & kenyamanan.</p>
                </div>
              )}
            </PanelBody>
          </Panel>
        </div>
      )}

      {/* Konten Tab 4: Komunikasi LLM */}
      {activeTab === "comm" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Panel>
            <PanelHead title="Input Catatan Singkat Pengasuh (Tim Hafiz)" desc="Sintesis Narasi Otomatis Berbasis LLM" />
            <PanelBody className="space-y-4">
              <div>
                <label className="text-[13px] font-semibold text-ink">Nama Anak:</label>
                <input
                  type="text"
                  value={childNameInput}
                  onChange={(e) => setChildNameInput(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-[14px]"
                />
              </div>

              <div>
                <label className="text-[13px] font-semibold text-ink">Catatan Pengasuh (Singkat / Mentah):</label>
                <textarea
                  rows={3}
                  value={caregiverNoteInput}
                  onChange={(e) => setCaregiverNoteInput(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-line bg-surface p-3 text-[13.5px]"
                />
              </div>

              <Button
                variant="primary"
                onClick={handleGenerateLlm}
                disabled={loading}
                className="w-full bg-teal-700 hover:bg-teal-800 text-white font-semibold"
              >
                <Sparkles size={16} className="mr-2" /> Hasilkan Narasi Laporan Harian LLM
              </Button>
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHead title="Hasil Narasi Laporan Harian (Siap Kirim ke Ortu)" desc="Bahasa Hangat, Santun, & Terstruktur" />
            <PanelBody>
              {llmResult ? (
                <div className="space-y-3">
                  <div className="rounded-xl border border-line bg-wash/60 p-4 text-[14px] leading-relaxed text-ink whitespace-pre-line">
                    {llmResult.generated_narrative}
                  </div>
                  <div className="flex items-center justify-between text-[12px] text-muted">
                    <span>{llmResult.synthesized_by}</span>
                    <Button size="sm" variant="default" className="text-teal-800 font-semibold">
                      Salin Laporan
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex h-48 flex-col items-center justify-center text-center text-muted">
                  <MessageSquare size={36} className="text-slate-300 mb-2" />
                  <p className="text-[14px]">Tekan tombol untuk menghasilkan narasi harian otomatis berbasis LLM.</p>
                </div>
              )}
            </PanelBody>
          </Panel>
        </div>
      )}

      {/* Konten Tab 5: TrustMeter ABSA */}
      {activeTab === "trust" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Panel>
            <PanelHead title="Uji Coba Ulasan Orang Tua (Tim Rifqi)" desc="Aspect-Based Sentiment Analysis Bahasa Indonesia" />
            <PanelBody className="space-y-4">
              <div>
                <label className="text-[13px] font-semibold text-ink">Masukkan Teks Masukan Orang Tua:</label>
                <textarea
                  rows={4}
                  value={reviewInput}
                  onChange={(e) => setReviewInput(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-line bg-surface p-3 text-[13.5px] leading-relaxed"
                />
              </div>

              <Button
                variant="primary"
                onClick={handleAnalyzeTrust}
                disabled={loading}
                className="w-full bg-teal-700 hover:bg-teal-800 text-white font-semibold"
              >
                Analisis Sentimen 5 Aspek (ABSA)
              </Button>
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHead title="Parent Trust Index & Pemetaan Aspek" desc="Keamanan, Kebersihan, Gizi, Pengasuh, & Komunikasi" />
            <PanelBody>
              {trustResult ? (
                <div className="space-y-4">
                  <div className="rounded-xl border border-teal-200 bg-teal-50 p-4 flex items-center justify-between">
                    <div>
                      <span className="text-[12px] font-semibold text-teal-800 uppercase">Parent Trust Index (PTI)</span>
                      <div className="text-[24px] font-black text-teal-900">{trustResult.parent_trust_score}%</div>
                    </div>
                    <Badge tone={trustResult.overall_sentiment === "positif" ? "accent" : "warn"}>
                      Sentimen: {trustResult.overall_sentiment.toUpperCase()}
                    </Badge>
                  </div>

                  <div>
                    <h4 className="text-[13.5px] font-bold text-ink mb-2">Aspek Layanan yang Terdeteksi:</h4>
                    <div className="space-y-2">
                      {Object.entries(trustResult.aspects || {}).map(([asp, data]: [string, any]) => (
                        <div key={asp} className="flex items-center justify-between rounded-lg border border-line bg-surface p-2.5 text-[13px]">
                          <span className="font-semibold text-ink uppercase tracking-wide">
                            {asp.replace("_", " ")}
                          </span>
                          <span
                            className={
                              "font-bold px-2 py-0.5 rounded text-[11px] " +
                              (data.polarity === "positif"
                                ? "bg-emerald-100 text-emerald-800"
                                : data.polarity === "negatif"
                                ? "bg-rose-100 text-rose-800"
                                : "bg-slate-100 text-slate-800")
                            }
                          >
                            {data.polarity.toUpperCase()} ({data.sentiment_score > 0 ? "+" : ""}
                            {data.sentiment_score})
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex h-48 flex-col items-center justify-center text-center text-muted">
                  <HeartHandshake size={36} className="text-slate-300 mb-2" />
                  <p className="text-[14px]">Ketik ulasan dan klik analisis untuk memetakan aspek layanan.</p>
                </div>
              )}
            </PanelBody>
          </Panel>
        </div>
      )}
    </div>
  );
}
