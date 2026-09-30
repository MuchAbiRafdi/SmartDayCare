"use client";
/* Kepercayaan & keterlibatan (Tema 5): indikator kepuasan, respon, keterlibatan, skor kepercayaan;
   tren kepuasan; umpan balik terbaru dengan label sentimen; notifikasi pintar; rekomendasi. */
import * as React from "react";
import { Bell, Lightbulb, MessageSquareHeart, ShieldCheck, Star, Users } from "lucide-react";
import { api } from "@/lib/api";
import { cn, fmtDateShort, fmtTime, isToday } from "@/lib/format";
import { useAction, useLive } from "@/lib/live";
import type { FeedbackItem, Sentiment, TrustMetrics } from "@/lib/types";
import { SimpleLine } from "@/components/charts/charts";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Empty, Note, Panel, PanelBody, PanelHead } from "@/components/ui/panel";

const SENT_LABEL: Record<Sentiment, string> = { positif: "Positif", netral: "Netral", negatif: "Negatif" };

function SentimentTag({ s }: { s: Sentiment }) {
  return <span className={cn("rounded-full px-2.5 py-0.5 text-[12px] font-semibold", "sentiment-" + s)}>{SENT_LABEL[s]}</span>;
}

function Stars({ n, size = 14 }: { n: number; size?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5 text-amber-400" aria-label={n + " dari 5 bintang"}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} size={size} fill={i <= n ? "currentColor" : "none"} className={i <= n ? "" : "text-slate-300"} />
      ))}
    </span>
  );
}

function when(iso: string): string {
  return isToday(iso) ? "hari ini " + fmtTime(iso) : fmtDateShort(iso);
}

function KpiCard({
  icon,
  iconClass,
  label,
  value,
  unit,
  sub,
  basis,
}: {
  icon: React.ReactNode;
  iconClass: string;
  label: string;
  value: React.ReactNode;
  unit?: string;
  sub: string;
  basis: string;
}) {
  return (
    <div className="kpi flex-col items-start gap-2" title={basis}>
      <div className="flex w-full items-center justify-between">
        <span className="text-muted text-[13px] font-medium">{label}</span>
        <span className={cn("kpi-icon h-9 w-9 text-[17px]", iconClass)}>{icon}</span>
      </div>
      <div className="kpi-value">
        {value}
        {unit ? <small>{unit}</small> : null}
      </div>
      <div className="text-muted text-[12.5px]">{sub}</div>
    </div>
  );
}

function recommendationsFor(t: TrustMetrics, fb: FeedbackItem[]): { title: string; text: string }[] {
  const out: { title: string; text: string }[] = [];
  const unanswered = fb.filter((f) => !f.response);
  if (unanswered.length)
    out.push({
      title: "Tanggapi umpan balik yang belum dibalas",
      text: `${unanswered.length} umpan balik belum ditanggapi. Balasan dalam 24 jam menaikkan respon dan kepercayaan.`,
    });
  if (t.sentiments.negatif + t.sentiments.netral >= 2)
    out.push({ title: "Tindak lanjuti masukan netral/negatif", text: "Hubungi orang tua yang memberi nilai ≤ 3 dan sampaikan perbaikan yang dilakukan." });
  if (t.engagement.value < 70)
    out.push({ title: "Tingkatkan keterlibatan orang tua", text: "Kirim ringkasan harian dengan foto kegiatan dan ajak membalas lewat percakapan guru." });
  out.push({
    title: "Tingkatkan dokumentasi kegiatan outdoor",
    text: "Foto kegiatan di luar ruangan paling sering mendapat tanggapan positif; unggah minimal satu per hari.",
  });
  return out.slice(0, 3);
}

export function TrustOverview() {
  const { state: s, patch, refresh } = useLive();
  const t = s.trust;
  const fb = s.feedback;
  const { busy, run } = useAction();
  const [reply, setReply] = React.useState<Record<string, string>>({});
  const [time, setTime] = React.useState(s.dailySummary.time);
  React.useEffect(() => setTime(s.dailySummary.time), [s.dailySummary.time]);
  if (!t) return <Empty>Indikator kepercayaan hanya tersedia untuk staf.</Empty>;
  const admin = s.me.role === "admin";
  const saveDaily = async (enabled: boolean, tm: string) => {
    const r = await run(() => api.put<{ dailySummary: { enabled: boolean; time: string } }>("/api/admin/daily-summary", { enabled, time: tm }), {
      ok: enabled ? "Ringkasan harian aktif pukul " + tm.replace(":", ".") : "Ringkasan harian dimatikan.",
    });
    if (r) patch((st) => ({ ...st, dailySummary: r.dailySummary }));
  };
  const respond = async (f: FeedbackItem) => {
    const text = (reply[f.id] || "").trim();
    if (text.length < 2) return;
    const r = await run(() => api.post(`/api/feedback/${f.id}/respond`, { text }), { ok: "Tanggapan terkirim." });
    if (r) {
      setReply((m) => ({ ...m, [f.id]: "" }));
      void refresh();
    }
  };
  const avg = t.satisfaction.value ? (t.satisfaction.value / 20).toFixed(1).replace(".", ",") : "–";
  const recs = recommendationsFor(t, fb);
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          icon={<Star size={17} fill="currentColor" />}
          iconClass="bg-amber-50 text-amber-500"
          label="Kepuasan Orang Tua"
          value={avg}
          unit="/ 5"
          sub={t.satisfaction.value >= 85 ? "Sangat Puas" : t.satisfaction.value >= 70 ? "Puas" : t.satisfaction.value ? "Perlu perhatian" : "Belum ada data"}
          basis={t.satisfaction.basis}
        />
        <KpiCard
          icon={<MessageSquareHeart size={17} />}
          iconClass="bg-emerald-50 text-emerald-600"
          label="Respon Feedback"
          value={t.response.value + "%"}
          sub={t.response.value >= 80 ? "Responsif" : "Perlu ditingkatkan"}
          basis={t.response.basis}
        />
        <KpiCard
          icon={<Users size={17} />}
          iconClass="bg-blue-50 text-blue-600"
          label="Engagement Rate"
          value={t.engagement.value + "%"}
          sub={t.engagement.value >= 70 ? "Aktif" : "Kurang aktif"}
          basis={t.engagement.basis}
        />
        <KpiCard
          icon={<ShieldCheck size={17} />}
          iconClass="bg-orange-50 text-orange-500"
          label="Trust Score"
          value={(t.trust.value / 20).toFixed(1).replace(".", ",")}
          unit="/ 5"
          sub={t.trust.value >= 80 ? "Tinggi" : t.trust.value >= 60 ? "Cukup" : "Rendah"}
          basis={t.trust.basis}
        />
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <Panel>
          <PanelHead title="Tren Kepuasan Orang Tua" desc="Rata-rata penilaian per minggu (Senin–Minggu), 6 minggu terakhir." />
          <PanelBody>
            <SimpleLine
              values={t.weeks.map((w) => w.avg)}
              labels={t.weeks.map((w) => w.label)}
              ariaLabel={"Tren kepuasan: " + t.weeks.map((w) => w.label + " " + (w.avg ?? "-")).join(", ")}
            />
            <p className="text-muted mt-2 text-[12.5px]">{t.satisfaction.basis}. Minggu tanpa penilaian dikosongkan.</p>
          </PanelBody>
        </Panel>
        <Panel>
          <PanelHead
            title="Feedback Terbaru"
            desc={`${t.count30} umpan balik dalam 30 hari · ${t.sentiments.positif} positif · ${t.sentiments.netral} netral · ${t.sentiments.negatif} negatif`}
          />
          <PanelBody className="grid gap-3">
            {fb.length === 0 ? <Empty>Belum ada umpan balik.</Empty> : null}
            {fb.slice(0, 6).map((f) => (
              <div key={f.id} className="border-line rounded-[12px] border p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[14px] leading-snug">{f.text || <span className="text-muted">(tanpa komentar)</span>}</p>
                    <div className="text-muted mt-1 flex flex-wrap items-center gap-x-2 text-[12.5px]">
                      <span>– {f.by}</span>
                      {f.child ? <span>· Orang tua {f.child}</span> : null}
                      <span>· {when(f.at)}</span>
                      <Stars n={f.rating} size={12} />
                    </div>
                  </div>
                  <SentimentTag s={f.sentiment} />
                </div>
                {f.response ? (
                  <div className="bg-wash mt-2 rounded-md px-3 py-2 text-[13px]">
                    <span className="font-semibold">Tanggapan {f.respondedBy.split(" ")[0]}:</span> {f.response}
                  </div>
                ) : (
                  <form
                    className="mt-2 flex gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void respond(f);
                    }}
                  >
                    <Input
                      value={reply[f.id] ?? ""}
                      onChange={(e) => setReply((m) => ({ ...m, [f.id]: e.target.value }))}
                      placeholder="Tulis tanggapan…"
                      aria-label={"Tanggapan untuk " + f.by}
                      className="h-9 min-h-0 py-1 text-[13.5px]"
                      maxLength={800}
                    />
                    <Button type="submit" size="sm" variant="primary" disabled={busy || (reply[f.id] ?? "").trim().length < 2}>
                      Balas
                    </Button>
                  </form>
                )}
              </div>
            ))}
          </PanelBody>
        </Panel>
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <Panel>
          <PanelBody className="flex flex-wrap items-center gap-4">
            <span className="kpi-icon bg-amber-50 text-amber-500">
              <Bell size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-[15px] font-semibold">Notifikasi Pintar</h2>
              <p className="text-muted mt-0.5 text-[13px]">
                Sistem mengirim ringkasan aktivitas harian ke orang tua setiap pukul{" "}
                <strong className="text-ink">{s.dailySummary.time.replace(":", ".")}</strong> lewat kanal yang mereka pilih (WhatsApp/email).
                {!s.channels.email && !s.channels.wa ? " Kanal pengirim belum diatur — pesan tercatat di kotak keluar." : ""}
              </p>
              {admin ? (
                <form
                  className="mt-2 flex flex-wrap items-center gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void saveDaily(s.dailySummary.enabled, time);
                  }}
                >
                  <label className="text-muted text-[12.5px]" htmlFor="daily-time">
                    Jam kirim
                  </label>
                  <Input
                    id="daily-time"
                    type="time"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    className="h-9 min-h-0 w-[120px] py-1 text-[13.5px]"
                  />
                  <Button type="submit" size="sm" disabled={busy || time === s.dailySummary.time}>
                    Simpan jam
                  </Button>
                </form>
              ) : null}
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={s.dailySummary.enabled}
              aria-label="Ringkasan harian otomatis"
              className="toggle"
              disabled={!admin || busy}
              onClick={() => saveDaily(!s.dailySummary.enabled, time)}
              title={admin ? undefined : "Hanya admin yang dapat mengubah"}
            >
              <span />
            </button>
          </PanelBody>
        </Panel>
        <Panel>
          <PanelBody className="flex gap-4">
            <span className="kpi-icon bg-amber-50 text-amber-500">
              <Lightbulb size={20} />
            </span>
            <div className="min-w-0">
              <h2 className="text-[15px] font-semibold">Rekomendasi</h2>
              <ul className="mt-1.5 grid gap-1.5 pl-4 text-[13.5px]">
                {recs.map((r) => (
                  <li key={r.title} className="list-disc">
                    <span className="font-semibold">{r.title}.</span> <span className="text-muted">{r.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          </PanelBody>
        </Panel>
      </div>
      <Note>
        Cara hitung: kepuasan = rata-rata bintang 30 hari ÷ 5; respon = umpan balik yang ditanggapi; keterlibatan = akun orang tua yang aktif 7 hari terakhir;
        skor kepercayaan = 40 % kepuasan + 30 % respon + 30 % keterlibatan. Label sentimen ditentukan dari bintang dan kata kunci dalam komentar.
      </Note>
    </div>
  );
}

/* ---------------------------------------------------------------- orang tua ---- */

export function FeedbackSection({ childId }: { childId: string }) {
  const { state: s, refresh } = useLive();
  const [rating, setRating] = React.useState(0);
  const [hover, setHover] = React.useState(0);
  const [text, setText] = React.useState("");
  const { busy, run } = useAction();
  const mine = s.feedback;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rating) return;
    const r = await run(() => api.post("/api/feedback", { rating, text: text.trim(), childId }), { ok: "Terima kasih! Umpan balik Anda tersimpan." });
    if (r) {
      setRating(0);
      setText("");
      void refresh();
    }
  };
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Panel>
        <PanelHead title="Beri penilaian" desc="Penilaian Anda membantu daycare memperbaiki layanan. Pengelola dapat membalas di sini." />
        <PanelBody>
          <form onSubmit={submit} className="grid gap-4">
            <div>
              <div className="text-ink-2 mb-1.5 text-[13.5px] font-medium">Seberapa puas Anda minggu ini?</div>
              <div className="flex items-center gap-1" role="radiogroup" aria-label="Penilaian bintang">
                {[1, 2, 3, 4, 5].map((i) => (
                  <button
                    key={i}
                    type="button"
                    role="radio"
                    aria-checked={rating === i}
                    aria-label={i + " bintang"}
                    onMouseEnter={() => setHover(i)}
                    onMouseLeave={() => setHover(0)}
                    onClick={() => setRating(i)}
                    className={cn("rounded-md p-1 transition-transform hover:scale-110", (hover || rating) >= i ? "text-amber-400" : "text-slate-300")}
                  >
                    <Star size={30} fill="currentColor" />
                  </button>
                ))}
                <span className="text-muted ml-2 text-[13px]">{rating ? ["", "Kurang", "Cukup", "Baik", "Puas", "Sangat puas"][rating] : "Pilih bintang"}</span>
              </div>
            </div>
            <Field label="Komentar (opsional)" htmlFor="fb-text">
              <Textarea
                id="fb-text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={800}
                placeholder="Apa yang sudah baik, apa yang perlu diperbaiki?"
              />
            </Field>
            <div className="flex justify-end">
              <Button type="submit" variant="primary" disabled={busy || !rating}>
                Kirim umpan balik
              </Button>
            </div>
          </form>
        </PanelBody>
      </Panel>
      <Panel>
        <PanelHead title="Umpan balik saya" desc="Riwayat penilaian dan tanggapan daycare." />
        <PanelBody className="grid gap-3">
          {mine.length === 0 ? <Empty>Belum ada umpan balik dari Anda.</Empty> : null}
          {mine.map((f) => (
            <div key={f.id} className="border-line rounded-[12px] border p-3.5">
              <div className="flex items-center justify-between gap-2">
                <Stars n={f.rating} />
                <span className="text-muted text-[12.5px]">{when(f.at)}</span>
              </div>
              {f.text ? <p className="mt-1.5 text-[14px]">{f.text}</p> : null}
              {f.response ? (
                <div className="mt-2 rounded-md bg-emerald-50 px-3 py-2 text-[13px] text-emerald-900">
                  <span className="font-semibold">Tanggapan {f.respondedBy.split(" ")[0]}:</span> {f.response}
                </div>
              ) : (
                <div className="text-faint mt-2 text-[12.5px]">Belum ada tanggapan.</div>
              )}
            </div>
          ))}
        </PanelBody>
      </Panel>
    </div>
  );
}
