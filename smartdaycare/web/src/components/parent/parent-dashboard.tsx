"use client";
import * as React from "react";
import Link from "next/link";
import {
  Activity,
  Baby,
  Bell,
  Camera as CameraIcon,
  FileText,
  HeartPulse,
  Home,
  MessageCircle,
  Moon,
  Printer,
  Smile,
  Sparkles,
  Star,
  UserCheck,
  Utensils,
  Video,
} from "lucide-react";
import { api } from "@/lib/api";
import {
  attendance,
  consumedSoFar,
  lastTemp,
  loggedMeals,
  lunchTotals,
  meds,
  notifications,
  pendingPlates,
  temps,
  tempStatusText,
  timeline,
  unreadCount,
  weekSeries,
  seedLunch,
} from "@/lib/derive";
import { clock, fmtDate, fmtNum, fmtTemp, mealLabel, nowClock } from "@/lib/format";
import { useHashTab, useLive } from "@/lib/live";
import type { Child, LogEntry, NutritionItem, SeedLunch } from "@/lib/types";
import { AppShell, type Section } from "@/components/shell/app-shell";
import { LinkChildCard } from "@/components/shell/hub";
import { ConfBadge, LeftoverNote, MacroBars, MealTable, PlatePhoto, type MealView } from "@/components/shared/meal";
import { AnnouncementsPanel, ChatPanel } from "@/components/shared/chat";
import { ParentCameras } from "@/components/shared/cctv";
import { FeedbackSection } from "@/components/shared/trust";
import { InsightsPanel, KpiCards, MethodNote, ProfileList, RangeControl, ReportCard, TrendCharts, useAnalytics, useRange } from "@/components/shared/analytics";
import { ActivityView, AttendanceView, DocsView, FoodRecords, MoodView, ParentHome, ProfileView, SleepView } from "./home";
import { WeeklyBars } from "@/components/charts/charts";
import { Badge, SevBadge, sevTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { Empty, Kv, Note, Panel, PanelBody, PanelHead } from "@/components/ui/panel";
import { TableWrap } from "@/components/ui/table-wrap";

const SECTIONS: Section[] = [
  { id: "beranda", label: "Beranda", icon: Home },
  { id: "aktivitas", label: "Aktivitas Harian", icon: Activity },
  { id: "makan", label: "Makan", icon: Utensils },
  { id: "tidur", label: "Tidur", icon: Moon },
  { id: "mood", label: "Mood", icon: Smile },
  { id: "kehadiran", label: "Kehadiran", icon: UserCheck },
  { id: "dokumentasi", label: "Dokumentasi", icon: CameraIcon },
  { id: "profil", label: "Profil Anak", icon: Baby },
  { id: "pesan", label: "Pesan", icon: MessageCircle, group: "Komunikasi" },
  { id: "pemberitahuan", label: "Pengumuman", icon: Bell },
  { id: "umpan-balik", label: "Umpan Balik", icon: Star },
  { id: "kamera", label: "Kamera", icon: Video, group: "Pemantauan" },
  { id: "kesehatan", label: "Kesehatan", icon: HeartPulse },
  { id: "perkembangan", label: "Perkembangan", icon: Sparkles },
  { id: "laporan", label: "Laporan", icon: FileText },
];
const IDS = SECTIONS.map((s) => s.id);

export function ParentDashboard() {
  const { state: s, now, patch } = useLive();
  const [tab, setTab] = useHashTab(IDS, "beranda");
  const [childId, setChildId] = React.useState<string>(
    s.prefs.child && s.children.some((c) => c.id === s.prefs.child) ? s.prefs.child : (s.children[0]?.id ?? ""),
  );
  const child = s.children.find((c) => c.id === childId) ?? s.children[0];
  const unread = unreadCount(s);
  const sections = SECTIONS.map((x) => {
    if (x.id === "pemberitahuan" && unread) return { ...x, count: unread };
    if (x.id === "pesan" && s.chatUnread) return { ...x, count: s.chatUnread };
    if (x.id === "kamera") {
      const waiting = s.cameraRequests.filter((r) => r.status === "approved").length;
      return waiting ? { ...x, count: waiting } : x;
    }
    return x;
  });

  const chooseChild = (id: string) => {
    setChildId(id);
    api.put("/api/prefs/child", { value: id }).catch(() => undefined);
  };

  // membuka tab pengumuman menandai semuanya terbaca
  React.useEffect(() => {
    if (tab !== "pemberitahuan" || !unread) return;
    const at = new Date().toISOString();
    api
      .put("/api/prefs/lastRead", { value: at })
      .then(() => patch((st) => ({ ...st, prefs: { ...st.prefs, lastRead: at } })))
      .catch(() => undefined);
  }, [tab, unread, patch]);

  if (!child) {
    return (
      <AppShell me={s.me} title="Dasbor orang tua">
        <div className="mx-auto grid max-w-[720px] gap-4">
          <Note>Belum ada anak yang tertaut dengan akun Anda. Masukkan kode anak dari daycare untuk mulai melihat catatan harian.</Note>
          <LinkChildCard state={s} />
        </div>
      </AppShell>
    );
  }

  const att = attendance(s, child, now);
  const topRight =
    s.children.length > 1 ? (
      <Select aria-label="Pilih anak" value={child.id} onChange={(e) => chooseChild(e.target.value)} className="h-9 w-auto min-w-[130px] py-1 text-[14px]">
        {s.children.map((c) => (
          <option key={c.id} value={c.id}>
            {c.short}
          </option>
        ))}
      </Select>
    ) : null;
  const title = SECTIONS.find((x) => x.id === tab)?.label ?? "Beranda";

  return (
    <AppShell
      me={s.me}
      title={title}
      subtitle={child.name}
      sections={sections}
      tab={tab}
      onTab={setTab}
      unread={unread}
      chatUnread={s.chatUnread}
      chatHref="/parent#pesan"
      topRight={topRight}
    >
      <div className="mx-auto max-w-[1100px]">
        {tab === "beranda" ? <ParentHome child={child} onTab={setTab} /> : null}
        {tab === "aktivitas" ? <ActivityView child={child} /> : null}
        {tab === "makan" ? (
          <div className="grid gap-4">
            <FoodRecords child={child} />
            <Food child={child} />
          </div>
        ) : null}
        {tab === "tidur" ? <SleepView child={child} /> : null}
        {tab === "mood" ? <MoodView child={child} /> : null}
        {tab === "kehadiran" ? <AttendanceView child={child} /> : null}
        {tab === "dokumentasi" ? <DocsView child={child} /> : null}
        {tab === "profil" ? <ProfileView child={child} /> : null}
        {tab === "pesan" ? <ChatPanel /> : null}
        {tab === "pemberitahuan" ? <Notices child={child} onTab={setTab} /> : null}
        {tab === "umpan-balik" ? <FeedbackSection childId={child.id} /> : null}
        {tab === "kamera" ? <ParentCameras child={child} present={att.state === "in"} /> : null}
        {tab === "kesehatan" ? <Health child={child} /> : null}
        {tab === "perkembangan" ? <Development child={child} /> : null}
        {tab === "laporan" ? <ReportTab child={child} att={att} /> : null}
      </div>
    </AppShell>
  );
}

function ReportTab({ child, att }: { child: Child; att: ReturnType<typeof attendance> }) {
  const range = useRange(7);
  const { data: a } = useAnalytics(child.id, range.days, range.end);
  return (
    <div className="grid gap-4">
      <Report child={child} att={att} />
      {a ? <ReportCard a={a} child={child} range={range} /> : null}
    </div>
  );
}

function Development({ child }: { child: Child }) {
  const range = useRange(30);
  const { data: a, error } = useAnalytics(child.id, range.days, range.end);
  if (error) return <Note tone="warn">{error}</Note>;
  if (!a) return <Empty>Menyusun analisis perkembangan…</Empty>;
  return (
    <div className="grid gap-4">
      <Panel className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <h2 className="text-[17px] font-bold">Perkembangan {child.short}</h2>
          <p className="text-muted text-[13px]">Ringkasan pola dari catatan pengasuh · {a.range.label}</p>
        </div>
        <RangeControl range={range} label={a.range.label} withPeriod={false} />
      </Panel>
      <KpiCards a={a} />
      <TrendCharts a={a} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <InsightsPanel a={a} audience="parent" />
        <Panel>
          <PanelHead title="Profil Perkembangan" desc="Empat area yang dinilai dari jenis aktivitas, catatan mood, dan kehadiran." />
          <PanelBody>
            <ProfileList a={a} withBasis />
          </PanelBody>
        </Panel>
      </div>
      <MethodNote />
    </div>
  );
}

function mealFromEntry(e: LogEntry, child: Child): MealView {
  return {
    label: mealLabel(e.meal),
    served: e.served ?? "—",
    scannedPost: e.scannedPost ?? "—",
    items: (e.items as NutritionItem[]) ?? [],
    pct: e.pct ?? 0,
    kcal: e.kcal ?? 0,
    protein: e.protein ?? 0,
    carbs: e.carbs ?? 0,
    fat: e.fat ?? 0,
    by: e.by || child.caregiver,
    photoPre: e.photoPreUrl ?? null,
    photoPost: e.photoPostUrl ?? null,
    boxesPre: e.boxesPre ?? [],
    boxesPost: e.boxesPost ?? [],
    source: "scan",
    conf: e.confPost ?? e.confPre,
  };
}

function mealFromSeed(child: Child, sl: SeedLunch): MealView {
  const t = lunchTotals(child);
  return {
    label: "Makan siang",
    served: clock(sl.served),
    scannedPost: clock(sl.scannedPost),
    items: sl.items,
    pct: t.pct,
    kcal: t.kcal,
    protein: t.protein,
    carbs: t.carbs,
    fat: t.fat,
    by: child.caregiver,
    photoPre: "/img/plate-before.jpg",
    photoPost: "/img/plate-after.jpg",
    boxesPre: [],
    boxesPost: [],
    source: "seed",
  };
}

function Food({ child }: { child: Child }) {
  const { state: s, now } = useLive();
  const logged = loggedMeals(s, child.id);
  const sl = seedLunch(child);
  const seedReady = !!sl && nowClock(now) >= sl.scannedPost && !logged.some((e) => e.meal === "lunch");
  const views: { id: string; m: MealView }[] = [
    ...logged.map((e) => ({ id: e.id, m: mealFromEntry(e, child) })),
    ...(sl && seedReady ? [{ id: "seed", m: mealFromSeed(child, sl) }] : []),
  ];
  const [sel, setSel] = React.useState<string>(views[0]?.id ?? "");
  const cur = views.find((v) => v.id === sel) ?? views[0];
  const pend = pendingPlates(s, child.id)[0];
  const eaten = consumedSoFar(s, child, now);
  const { labels, values: weekly } = weekSeries(child, now);
  if (cur && labels[6] !== "Min") weekly[6] = cur.m.kcal;

  return (
    <div className="grid gap-4">
      {!cur ? (
        <Panel>
          <PanelBody>
            {pend ? (
              <Note>
                Piring {child.short} untuk {mealLabel(pend.meal).toLowerCase()} sudah dipindai pukul {pend.served ?? "—"} oleh {pend.by}. Catatan makan akan
                muncul di sini setelah pindaian sesudah makan.
              </Note>
            ) : (
              <Empty>Belum ada catatan makan hari ini. Makan siang biasanya disajikan pukul 11.50 dan catatannya masuk sekitar pukul 12.20.</Empty>
            )}
          </PanelBody>
        </Panel>
      ) : (
        <Panel>
          <PanelHead
            title={cur.m.label + " " + child.short}
            desc={`${cur.m.pct}% porsi habis · ${fmtNum(cur.m.kcal)} kkal · protein ${fmtNum(cur.m.protein, 1)} g · pukul ${cur.m.scannedPost}`}
            action={
              <>
                {views.length > 1 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {views.map((v) => (
                      <Button key={v.id} size="sm" variant={v.id === cur.id ? "dark" : "default"} onClick={() => setSel(v.id)}>
                        {v.m.label} · {v.m.scannedPost}
                      </Button>
                    ))}
                  </div>
                ) : null}
                <ConfBadge conf={cur.m.conf} />
              </>
            }
          />
          <PanelBody className="grid gap-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <PlatePhoto
                src={cur.m.photoPre}
                boxes={cur.m.boxesPre}
                caption={"Saat disajikan · pukul " + cur.m.served}
                alt={"Piring " + child.short + " saat disajikan"}
              />
              <PlatePhoto
                src={cur.m.photoPost}
                boxes={cur.m.boxesPost}
                caption={"Sesudah makan · pukul " + cur.m.scannedPost}
                alt={"Piring " + child.short + " sesudah makan"}
              />
            </div>
            <MealTable m={cur.m} />
            <LeftoverNote m={cur.m} />
            <p className="text-muted text-[13px] leading-relaxed">
              {cur.m.source === "scan"
                ? `Dihitung dari dua foto piring (pukul ${cur.m.served} dan ${cur.m.scannedPost}) oleh ${cur.m.by}. Menu dikenali otomatis di perangkat pengasuh lalu diperiksa sebelum dikirim; berat diperkirakan dari luas makanan di piring ${s.thresholds.plateDiameterCm} cm, sehingga angkanya perkiraan.`
                : `Dicatat oleh ${cur.m.by} dari foto piring pukul ${cur.m.served} dan ${cur.m.scannedPost}. Berat diperkirakan dari luas makanan di piring, sehingga angkanya perkiraan.`}
            </p>
          </PanelBody>
        </Panel>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <PanelHead title="Asupan hari ini vs. target" desc="Target harian ditetapkan bersama orang tua saat pendaftaran" />
          <PanelBody>
            <MacroBars consumed={eaten} target={child.target} />
          </PanelBody>
        </Panel>
        <Panel>
          <PanelHead title="Energi makan siang, 7 hari" desc={cur ? `Hari ini ${fmtNum(cur.m.kcal)} kkal` : "Hari ini belum tercatat"} />
          <PanelBody>
            <WeeklyBars values={weekly} labels={labels} />
          </PanelBody>
        </Panel>
      </div>
    </div>
  );
}

function Health({ child }: { child: Child }) {
  const { state: s, now } = useLive();
  const rows = temps(s, child, now);
  const medRows = meds(s, child.id);
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <div className="grid gap-4">
        <Panel>
          <PanelHead
            title="Suhu tubuh hari ini"
            desc={`Batas pantau ${fmtTemp(s.thresholds.bodyTempWatch)}, batas tinggi ${fmtTemp(s.thresholds.bodyTempHigh)}`}
          />
          <PanelBody>
            {rows.length ? (
              <TableWrap label="Suhu tubuh hari ini">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Pukul</th>
                      <th className="num">Suhu</th>
                      <th>Status</th>
                      <th>Diukur oleh</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.at + r.v}>
                        <td className="tabular-nums">{r.time}</td>
                        <td className="num font-semibold">{fmtTemp(r.v)}</td>
                        <td>
                          <Badge tone={sevTone(r.sev) === "neutral" ? "ok" : sevTone(r.sev)}>{tempStatusText(r.sev)}</Badge>
                        </td>
                        <td>{r.by}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            ) : (
              <Empty>Belum ada pengukuran suhu hari ini.</Empty>
            )}
          </PanelBody>
        </Panel>
        <Panel>
          <PanelHead title="Obat yang diberikan hari ini" />
          <PanelBody>
            {medRows.length ? (
              <ul className="divide-line divide-y">
                {medRows.map((m) => (
                  <li key={m.id} className="flex gap-3 py-2.5 text-[14px]">
                    <time className="text-muted w-12 shrink-0 tabular-nums">{m.time}</time>
                    <div>
                      <b>
                        {m.med} {m.dose}
                      </b>
                      <div className="text-muted text-[13.5px]">
                        {m.note} · {m.by}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>Tidak ada obat yang diberikan hari ini.</Empty>
            )}
          </PanelBody>
        </Panel>
      </div>
      <Panel>
        <PanelHead title="Data kesehatan" />
        <PanelBody>
          <Kv
            rows={[
              ["Alergi", child.allergies ?? "Tidak ada"],
              ["Obat rutin", child.meds ?? "Tidak ada"],
              [
                "Tanggal lahir",
                new Date(child.dob + "T00:00:00").toLocaleDateString("id-ID", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                }),
              ],
              ["Pengasuh", child.caregiver],
              ["Kontak darurat", <span key="e">{child.emergency.map((e) => `${e.n} — ${e.p}`).join("; ") || "Belum dicatat"}</span>],
            ]}
          />
          <p className="text-muted mt-4 text-[13px] leading-relaxed">
            Perubahan alergi atau obat rutin disampaikan ke admin daycare agar tercatat di semua perangkat pengasuh.
          </p>
        </PanelBody>
      </Panel>
    </div>
  );
}

function Notices({ child, onTab }: { child: Child; onTab: (id: string) => void }) {
  const { state: s } = useLive();
  const all = notifications(s);
  const unread = all.filter((n) => n.unread).length;
  void child;
  return (
    <div className="grid gap-4">
      <Panel>
        <PanelHead title="Pengumuman Daycare" desc="Informasi resmi dari pengelola untuk semua orang tua." />
        <PanelBody>
          <AnnouncementsPanel onOpenChat={() => onTab("pesan")} />
        </PanelBody>
      </Panel>
      <Panel>
        <PanelHead
          title="Pemberitahuan tentang anak"
          desc={`${all.length} pemberitahuan hari ini${unread ? `, ${unread} baru` : ""}`}
          action={
            <Link href="/account#pemberitahuan" className="text-[13.5px] font-semibold text-teal-800 hover:underline">
              Atur cara pemberitahuan
            </Link>
          }
        />
        <PanelBody>
          {all.length ? (
            <ul className="divide-line divide-y">
              {all.map((n) => (
                <li key={n.id} className="flex gap-3 py-3">
                  <time className="text-muted w-12 shrink-0 pt-0.5 text-[13px] tabular-nums">{n.time}</time>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-[14px] font-semibold">
                      {s.children.length > 1 && n.child ? <span className="text-teal-800">{n.child.split(" ")[0]}</span> : null}
                      <span>{n.title}</span>
                      <SevBadge sev={n.sev} />
                      {n.unread ? <Badge tone="accent">Baru</Badge> : null}
                    </div>
                    <p className="text-muted mt-0.5 text-[13.5px]">{n.text}</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Belum ada pemberitahuan hari ini.</Empty>
          )}
        </PanelBody>
      </Panel>
    </div>
  );
}

function Report({ child, att }: { child: Child; att: ReturnType<typeof attendance> }) {
  const { state: s, now } = useLive();
  const tl = timeline(s, child, now);
  const t = lastTemp(s, child, now);
  const logged = loggedMeals(s, child.id);
  const lunch = logged.find((e) => e.meal === "lunch");
  const sl = seedLunch(child);
  const baseLunch = sl && nowClock(now) >= sl.scannedPost ? lunchTotals(child) : null;
  const lunchText = lunch
    ? `${lunch.pct}% porsi, ${lunch.kcal} kkal (${lunch.by})`
    : baseLunch
      ? `${baseLunch.pct}% porsi, ${baseLunch.kcal} kkal (${child.caregiver})`
      : "Belum tercatat";
  const incidentsToday = notifications(s, [child.id]).filter((n) => n.sev !== "low").length;
  return (
    <Panel className="print:border-0 print:shadow-none">
      <PanelHead
        title={"Laporan harian · " + child.name}
        desc={fmtDate(now) + " · " + s.facility.name}
        action={
          <Button onClick={() => window.print()} className="no-print">
            <Printer size={16} /> Cetak
          </Button>
        }
      />
      <PanelBody className="grid gap-5">
        <Kv
          rows={[
            ["Kehadiran", att.label],
            ["Suhu terakhir", t ? `${fmtTemp(t.v)} · ${tempStatusText(t.sev)} (${t.time})` : "Belum diukur"],
            ["Makan siang", lunchText],
            ["Catatan penting", incidentsToday ? `${incidentsToday} catatan perlu perhatian` : "Tidak ada"],
            ["Pengasuh", child.caregiver],
          ]}
        />
        <div>
          <h4 className="text-muted mb-3 text-[14px] font-semibold tracking-[0.04em] uppercase">Urutan kegiatan</h4>
          {tl.past.length ? (
            <ol className="tl">
              {tl.past.map((i) => (
                <li key={i.id} className={i.sev !== "low" ? "sev-" + i.sev : undefined}>
                  <div className="flex items-baseline gap-2 text-[14px]">
                    <time className="text-muted shrink-0 tabular-nums">{i.time}</time>
                    <b>{i.title}</b>
                  </div>
                  <p className="text-muted text-[13.5px]">{i.desc}</p>
                </li>
              ))}
            </ol>
          ) : (
            <Empty>Belum ada kegiatan tercatat.</Empty>
          )}
        </div>
        <p className="text-muted text-[12.5px]">
          Laporan ini dibuat dari catatan pengasuh dan foto piring hari ini. Angka gizi merupakan perkiraan dari luas makanan di piring.
        </p>
      </PanelBody>
    </Panel>
  );
}
