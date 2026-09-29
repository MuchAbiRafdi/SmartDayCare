"use client";
/* Halaman analitik admin (Tema 4): dashboard perkembangan per anak, halaman per area, laporan, dan rekomendasi. */
import * as React from "react";
import { api } from "@/lib/api";
import { useLive } from "@/lib/live";
import type { Child } from "@/lib/types";
import {
  type AnalyticsTab,
  DetailAnalytics,
  InsightsPanel,
  KpiCards,
  MethodNote,
  ProfileList,
  RangeControl,
  ReportCard,
  TrendCharts,
  useAnalytics,
  useRange,
} from "@/components/shared/analytics";
import { ChildAvatar, ageLabel, groupLabel } from "@/components/parent/home";
import { Select } from "@/components/ui/field";
import { Empty, Note, Panel, PanelBody, PanelHead } from "@/components/ui/panel";

/** Anak yang sedang dianalisis; disimpan di preferensi akun supaya sama di semua halaman analitik. */
export function useAnalyticsChild(): [Child | undefined, (id: string) => void] {
  const { state: s, patch } = useLive();
  const active = s.children.filter((c) => !c.archivedAt);
  const pref = s.prefs.child;
  const child = active.find((c) => c.id === pref) ?? active[0];
  const choose = React.useCallback(
    (id: string) => {
      patch((st) => ({ ...st, prefs: { ...st.prefs, child: id } }));
      api.put("/api/prefs/child", { value: id }).catch(() => undefined);
    },
    [patch],
  );
  return [child, choose];
}

function ChildBar({
  title,
  child,
  onChild,
  range,
  label,
  withPeriod = true,
}: {
  title: string;
  child: Child;
  onChild: (id: string) => void;
  range: ReturnType<typeof useRange>;
  label?: string;
  withPeriod?: boolean;
}) {
  const { state: s } = useLive();
  const active = s.children.filter((c) => !c.archivedAt);
  return (
    <Panel className="flex flex-wrap items-center gap-4 p-4">
      <ChildAvatar child={child} size={48} />
      <div className="min-w-[300px] flex-1">
        <h2 className="text-[18px] leading-tight font-bold">
          {title} – {child.name}
        </h2>
        <p className="text-muted text-[13px]">
          Usia {ageLabel(child)} · {groupLabel(child)} · {child.room}
          {child.caregiver ? ` · Pengasuh ${child.caregiver}` : ""}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={child.id}
          onChange={(e) => onChild(e.target.value)}
          className="h-9 w-auto min-w-[170px] py-1 text-[13.5px] font-semibold"
          aria-label="Pilih anak"
        >
          {active.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <RangeControl range={range} label={label} withPeriod={withPeriod} />
      </div>
    </Panel>
  );
}

function NoChild() {
  return <Empty>Belum ada anak aktif yang dapat dianalisis. Daftarkan anak lewat menu Akun & kode anak.</Empty>;
}

/* ---------------------------------------------------------------- Dashboard ---- */

export function DevelopmentDashboard({ onGo }: { onGo: (tab: string) => void }) {
  const [child, choose] = useAnalyticsChild();
  const range = useRange(7);
  const { data: a, error } = useAnalytics(child?.id, range.days, range.end);
  const [tab, setTab] = React.useState<AnalyticsTab>("aktivitas");
  if (!child) return <NoChild />;
  return (
    <div className="grid gap-4">
      <ChildBar title="Dashboard Perkembangan" child={child} onChild={choose} range={range} label={a?.range.label} withPeriod={false} />
      {error ? <Note tone="warn">{error}</Note> : null}
      {a ? (
        <>
          <KpiCards a={a} />
          <TrendCharts a={a} />
          <DetailAnalytics a={a} tab={tab} onTab={setTab} />
          <InsightsPanel a={a} compact detailHref="#rekomendasi" />
          <ReportCard a={a} child={child} range={range} />
          <p className="text-muted text-[12.5px]">
            Halaman per area (Analitik Aktivitas, Mood Tracker, Pola Tidur, Pola Makan, Kehadiran) menampilkan rincian yang sama dengan rentang lebih panjang.{" "}
            <button type="button" className="font-semibold text-violet-700 hover:underline" onClick={() => onGo("rekomendasi")}>
              Lihat semua insight & rekomendasi
            </button>
          </p>
        </>
      ) : !error ? (
        <Empty>Menyusun analitik…</Empty>
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------------------- halaman per area ---- */

const AREA_TITLE: Record<AnalyticsTab, string> = {
  aktivitas: "Analitik Aktivitas",
  mood: "Mood Tracker",
  tidur: "Pola Tidur",
  makan: "Pola Makan",
  kehadiran: "Kehadiran",
};
const AREA_OF: Record<AnalyticsTab, string[]> = {
  aktivitas: ["aktivitas", "sosial", "motorik", "kognitif"],
  mood: ["mood", "emosi"],
  tidur: ["tidur"],
  makan: ["makan"],
  kehadiran: ["kehadiran"],
};

export function AreaPage({ area }: { area: AnalyticsTab }) {
  const [child, choose] = useAnalyticsChild();
  const range = useRange(30);
  const { data: a, error } = useAnalytics(child?.id, range.days, range.end);
  if (!child) return <NoChild />;
  const related = a
    ? {
        ...a,
        insights: a.insights.filter((i) => AREA_OF[area].includes(i.area)),
        recommendations: a.recommendations.filter((r) => AREA_OF[area].some((k) => r.why.toLowerCase().includes(k) || r.title.toLowerCase().includes(k))),
      }
    : null;
  return (
    <div className="grid gap-4">
      <ChildBar title={AREA_TITLE[area]} child={child} onChild={choose} range={range} label={a?.range.label} />
      {error ? <Note tone="warn">{error}</Note> : null}
      {a && related ? (
        <>
          <DetailAnalytics a={a} tab={area} fixed />
          {related.insights.length || related.recommendations.length ? (
            <InsightsPanel a={related} />
          ) : (
            <Panel>
              <PanelHead title="Insight area ini" />
              <PanelBody>
                <p className="text-muted text-[13.5px]">
                  Belum ada pola yang menonjol pada area ini dalam rentang terpilih. Tambah rentang atau tunggu catatan berikutnya.
                </p>
              </PanelBody>
            </Panel>
          )}
        </>
      ) : !error ? (
        <Empty>Menyusun analitik…</Empty>
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------------------- laporan & rekomendasi ---- */

export function ReportPage() {
  const [child, choose] = useAnalyticsChild();
  const range = useRange(30);
  const { data: a, error } = useAnalytics(child?.id, range.days, range.end);
  if (!child) return <NoChild />;
  return (
    <div className="grid gap-4">
      <ChildBar title="Laporan Perkembangan" child={child} onChild={choose} range={range} label={a?.range.label} />
      {error ? <Note tone="warn">{error}</Note> : null}
      {a ? (
        <>
          <ReportCard a={a} child={child} range={range} />
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel>
              <PanelHead
                title="Profil perkembangan & dasarnya"
                desc="Tingkat tiap area dihitung dari jenis aktivitas, catatan mood, dan kehadiran pada rentang ini."
              />
              <PanelBody>
                <ProfileList a={a} withBasis />
              </PanelBody>
            </Panel>
            <MethodNote />
          </div>
        </>
      ) : !error ? (
        <Empty>Menyusun laporan…</Empty>
      ) : null}
    </div>
  );
}

export function RecommendationsPage() {
  const [child, choose] = useAnalyticsChild();
  const range = useRange(30);
  const { data: a, error } = useAnalytics(child?.id, range.days, range.end);
  if (!child) return <NoChild />;
  return (
    <div className="grid gap-4" id="rekomendasi">
      <ChildBar title="Rekomendasi AI" child={child} onChild={choose} range={range} label={a?.range.label} />
      {error ? <Note tone="warn">{error}</Note> : null}
      {a ? (
        <>
          <KpiCards a={a} />
          <InsightsPanel a={a} />
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel>
              <PanelHead title="Profil perkembangan" />
              <PanelBody>
                <ProfileList a={a} withBasis />
              </PanelBody>
            </Panel>
            <MethodNote />
          </div>
        </>
      ) : !error ? (
        <Empty>Menyusun rekomendasi…</Empty>
      ) : null}
    </div>
  );
}
