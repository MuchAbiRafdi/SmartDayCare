"use client";
import * as React from "react";
import {
  Activity,
  AlertTriangle,
  ArrowLeftRight,
  Camera as CameraIcon,
  Home,
  MessageCircle,
  Moon,
  Pill as PillIcon,
  ScanLine,
  Smile,
  Utensils,
  Video,
} from "lucide-react";
import { api } from "@/lib/api";
import {
  attendance,
  airLine,
  airStatus,
  airTone,
  AIR_LABEL,
  AIR_SOURCE_LABEL,
  handovers,
  incidents,
  lastTemp,
  meds,
  openIncidents,
  present,
} from "@/lib/derive";
import { fmtDate, fmtTemp } from "@/lib/format";
import { useAction, useHashTab, useLive } from "@/lib/live";
import type { Child, LogEntry, MealKey } from "@/lib/types";
import * as VZ from "@/lib/vision";
import { AppShell, type Section } from "@/components/shell/app-shell";
import { CameraView } from "@/components/shared/camera-view";
import { ChatPanel } from "@/components/shared/chat";
import { ActivityView, FoodRecords, MoodView, SleepView } from "@/components/parent/home";
import { Scanner, PendingAndSent } from "./scanner";
import { ActivityForm, AttendanceDocs, ChildRecordStrip, FoodForm, MoodForm, RecordHeader, SleepForm, useChildPick } from "./record-forms";
import { Badge, SevBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Metric } from "@/components/ui/metric";
import { Empty, Kv, Panel, PanelBody, PanelHead } from "@/components/ui/panel";
import { TableWrap } from "@/components/ui/table-wrap";

const SECTIONS: Section[] = [
  { id: "anak", label: "Beranda", icon: Home },
  { id: "aktivitas", label: "Aktivitas Harian", icon: Activity },
  { id: "makan", label: "Makan", icon: Utensils },
  { id: "tidur", label: "Tidur", icon: Moon },
  { id: "mood", label: "Mood", icon: Smile },
  { id: "kehadiran", label: "Kehadiran & Foto", icon: CameraIcon },
  { id: "pindai", label: "Pindai Piring", icon: ScanLine, group: "Gizi & kesehatan" },
  { id: "obat", label: "Obat", icon: PillIcon },
  { id: "kejadian", label: "Kejadian", icon: AlertTriangle },
  { id: "serah-terima", label: "Serah Terima", icon: ArrowLeftRight },
  { id: "pesan", label: "Pesan", icon: MessageCircle, group: "Komunikasi & pemantauan" },
  { id: "kamera", label: "Kamera & Udara", icon: Video },
];
const IDS = SECTIONS.map((s) => s.id);

type ActKind = "checkin" | "temp" | "note" | "checkout";

const RECORD_TITLE: Record<string, [string, string]> = {
  aktivitas: ["Pencatatan Aktivitas", "Catatan langsung tampil di dasbor orang tua dan menjadi bahan analisis perkembangan."],
  makan: ["Pencatatan Makan", "Menu dan porsi per waktu makan. Foto piring makan siang dipindai lewat menu Pindai Piring."],
  tidur: ["Pencatatan Tidur", "Tidur siang dan tidur tambahan beserta kualitasnya."],
  mood: ["Pencatatan Mood", "Suasana hati anak; dicatat pagi dan siang, atau saat ada perubahan berarti."],
  kehadiran: ["Kehadiran & Dokumentasi", "Status kedatangan hari ini dan foto kegiatan untuk orang tua."],
};

export function CaregiverDashboard() {
  const { state: s, now } = useLive();
  const [tab, setTab] = useHashTab(IDS, "anak");
  const [act, setAct] = React.useState<{ kind: ActKind; child: Child } | null>(null);
  const [preset, setPreset] = React.useState<{ childId: string; meal: MealKey; stage: VZ.Stage } | null>(null);
  const [picked, pick] = useChildPick(s.children);
  const openN = openIncidents(s).length;
  const sections = SECTIONS.map((x) => {
    if (x.id === "kejadian" && openN) return { ...x, count: openN };
    if (x.id === "pesan" && s.chatUnread) return { ...x, count: s.chatUnread };
    return x;
  });
  const watch = s.children.filter((c) => {
    const t = lastTemp(s, c, now);
    return t && t.sev !== "low";
  }).length;
  const medsToday = meds(s).length;
  const presentN = present(s, now).length;

  const goScan = (childId: string, stage: VZ.Stage = "pre", meal: MealKey = "lunch") => {
    setPreset({ childId, meal, stage });
    setTab("pindai");
  };
  const recordTab = tab in RECORD_TITLE;
  const title = SECTIONS.find((x) => x.id === tab)?.label ?? "Beranda";

  return (
    <AppShell
      me={s.me}
      title={title}
      subtitle={s.me.area ? `${s.me.area}${s.me.shift ? " · Shift " + s.me.shift.toLowerCase() : ""}` : undefined}
      sections={sections}
      tab={tab}
      onTab={setTab}
      chatUnread={s.chatUnread}
      chatHref="/caregiver#pesan"
    >
      <div className="mx-auto max-w-[1100px]">
        {tab === "anak" ? (
          <div className="grid gap-4">
            <div>
              <h2 className="text-[22px] font-bold tracking-[-0.01em]">Halo, {s.me.name.split(" ")[0]}! 👋</h2>
              <p className="text-muted text-[13.5px]">
                {fmtDate(now)} · {presentN} dari {s.children.length} anak hadir
                {s.me.shift ? ` · Shift ${s.me.shift.toLowerCase()}` : ""}
                {s.me.area ? ` · ${s.me.area}` : ""}
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Metric label="Anak hadir" value={`${presentN} dari ${s.children.length}`} />
              <Metric
                label="Suhu perlu dipantau"
                value={watch}
                tone={watch ? "warn" : "ok"}
                sub={watch ? "Ukur ulang dalam 30 menit" : "Semua dalam batas normal"}
              />
              <Metric label="Obat diberikan hari ini" value={medsToday} />
              <Metric label="Kejadian belum ditangani" value={openN} tone={openN ? "danger" : "ok"} />
            </div>
            <Panel>
              <PanelHead title="Catat cepat" desc="Pilih anak, lalu jenis catatan. Semua catatan langsung terkirim ke orang tua." />
              <PanelBody className="flex flex-wrap items-center gap-2">
                <Select
                  value={picked?.id ?? ""}
                  onChange={(e) => pick(e.target.value)}
                  className="h-9 w-auto min-w-[180px] py-1 text-[13.5px] font-semibold"
                  aria-label="Pilih anak untuk dicatat"
                >
                  {s.children.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
                {(
                  [
                    ["aktivitas", "Aktivitas", Activity],
                    ["makan", "Makan", Utensils],
                    ["tidur", "Tidur", Moon],
                    ["mood", "Mood", Smile],
                    ["kehadiran", "Foto & kehadiran", CameraIcon],
                  ] as const
                ).map(([id, label, Icon]) => (
                  <Button key={id} size="sm" onClick={() => setTab(id)}>
                    <Icon size={15} /> {label}
                  </Button>
                ))}
              </PanelBody>
            </Panel>
            <section aria-labelledby="anak-hari-ini">
              <h3 id="anak-hari-ini" className="text-ink-2 mb-2 text-[14px] font-semibold">
                Anak di ruang Anda hari ini
              </h3>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {s.children.map((c) => (
                  <ChildTile key={c.id} child={c} onAct={(kind) => setAct({ kind, child: c })} onScan={() => goScan(c.id)} />
                ))}
              </div>
            </section>
          </div>
        ) : null}
        {recordTab && picked ? (
          <div className="grid gap-4">
            <RecordHeader title={RECORD_TITLE[tab][0]} desc={RECORD_TITLE[tab][1]} child={picked} childrenList={s.children} onChild={pick} />
            <ChildRecordStrip child={picked} />
            {tab === "aktivitas" ? (
              <>
                <ActivityForm child={picked} />
                <ActivityView child={picked} />
              </>
            ) : null}
            {tab === "makan" ? (
              <>
                <FoodForm child={picked} />
                <FoodRecords child={picked} />
              </>
            ) : null}
            {tab === "tidur" ? (
              <>
                <SleepForm child={picked} />
                <SleepView child={picked} />
              </>
            ) : null}
            {tab === "mood" ? (
              <>
                <MoodForm child={picked} />
                <MoodView child={picked} />
              </>
            ) : null}
            {tab === "kehadiran" ? (
              <AttendanceDocs
                child={picked}
                onCheckin={() => setAct({ kind: "checkin", child: picked })}
                onCheckout={() => setAct({ kind: "checkout", child: picked })}
              />
            ) : null}
          </div>
        ) : null}
        {recordTab && !picked ? <Empty>Belum ada anak di ruang Anda.</Empty> : null}
        {tab === "pindai" ? (
          <div className="grid gap-4">
            <Scanner preset={preset} onDone={() => setPreset(null)} />
            <PendingAndSent onScanPost={(p) => goScan(p.childId ?? "", "post", p.meal ?? "lunch")} />
          </div>
        ) : null}
        {tab === "obat" ? <MedsSection /> : null}
        {tab === "kejadian" ? <IncidentsSection /> : null}
        {tab === "serah-terima" ? <HandoverSection /> : null}
        {tab === "pesan" ? <ChatPanel /> : null}
        {tab === "kamera" ? <CamerasSection /> : null}
      </div>
      <ActDialog act={act} onClose={() => setAct(null)} />
    </AppShell>
  );
}

function ChildTile({ child, onAct, onScan }: { child: Child; onAct: (k: ActKind) => void; onScan: () => void }) {
  const { state: s, now } = useLive();
  const att = attendance(s, child, now);
  const t = lastTemp(s, child, now);
  return (
    <article className="panel flex flex-col gap-3 p-4" aria-label={child.name}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-[16px]">{child.name}</h3>
          <p className="text-muted text-[13px]">
            {child.age} · {child.room.replace("Ruang ", "R. ")}
          </p>
        </div>
        <Badge tone={att.state === "in" ? "ok" : att.state === "out" ? "neutral" : "warn"} dot>
          {att.state === "in" ? "Hadir" : att.state === "out" ? "Pulang" : "Belum tiba"}
        </Badge>
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[13px]">
        <dt className="text-muted">Suhu terakhir</dt>
        <dd className={"font-semibold tabular-nums " + (t?.sev === "high" ? "text-danger" : t?.sev === "medium" ? "text-warn-ink" : "")}>
          {t ? `${fmtTemp(t.v)} · ${t.time}` : "—"}
        </dd>
        <dt className="text-muted">Alergi</dt>
        <dd className={child.allergies && child.allergies !== "Tidak ada" ? "text-warn-ink font-semibold" : ""}>{child.allergies ?? "Tidak ada"}</dd>
        {child.meds ? (
          <>
            <dt className="text-muted">Obat</dt>
            <dd>{child.meds}</dd>
          </>
        ) : null}
      </dl>
      <div className="mt-auto flex flex-wrap gap-1.5">
        {att.state !== "in" ? (
          <Button size="sm" variant="primary" onClick={() => onAct("checkin")}>
            Tandai tiba
          </Button>
        ) : null}
        <Button size="sm" onClick={() => onAct("temp")}>
          Suhu
        </Button>
        <Button size="sm" onClick={onScan}>
          Pindai piring
        </Button>
        <Button size="sm" onClick={() => onAct("note")}>
          Catatan
        </Button>
        {att.state === "in" ? (
          <Button size="sm" onClick={() => onAct("checkout")}>
            Pulang
          </Button>
        ) : null}
      </div>
    </article>
  );
}

const TITLES: Record<ActKind, string> = { checkin: "Tandai tiba", temp: "Catat suhu tubuh", note: "Catatan pengasuh", checkout: "Tandai pulang" };

function ActDialog({ act, onClose }: { act: { kind: ActKind; child: Child } | null; onClose: () => void }) {
  const { state: s, refresh } = useLive();
  const { busy, run } = useAction();
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!act) return;
    const f = new FormData(e.currentTarget);
    const body: Record<string, unknown> = { childId: act.child.id };
    if (act.kind === "checkin") Object.assign(body, { temp: Number(f.get("temp")), who: f.get("who"), cond: f.get("cond") });
    if (act.kind === "temp") body.temp = Number(f.get("temp"));
    if (act.kind === "note") body.note = f.get("note");
    if (act.kind === "checkout") Object.assign(body, { who: f.get("who"), note: f.get("note") || "" });
    const r = await run(() => api.post<{ entry: LogEntry }>("/api/log/" + act.kind, body), { ok: (r) => `${act.child.short}: ${r.entry.title} tercatat.` });
    if (r) {
      await refresh();
      onClose();
    }
  };
  const th = s.thresholds;
  return (
    <Dialog open={!!act} onOpenChange={(o) => !o && onClose()}>
      {act ? (
        <DialogContent
          title={TITLES[act.kind] + " · " + act.child.short}
          desc={
            act.kind === "temp" || act.kind === "checkin" ? `Batas pantau ${fmtTemp(th.bodyTempWatch)}, batas tinggi ${fmtTemp(th.bodyTempHigh)}.` : undefined
          }
        >
          <form onSubmit={submit} className="grid gap-4" key={act.kind + act.child.id}>
            {act.kind === "checkin" || act.kind === "temp" ? (
              <Field label="Suhu tubuh (°C)" htmlFor="a-temp">
                <Input id="a-temp" name="temp" type="number" step="0.1" min={34} max={42} inputMode="decimal" required defaultValue="36.6" autoFocus />
              </Field>
            ) : null}
            {act.kind === "checkin" || act.kind === "checkout" ? (
              <Field label={act.kind === "checkin" ? "Diantar oleh" : "Dijemput oleh"} htmlFor="a-who">
                <Select id="a-who" name="who" defaultValue="Ibu">
                  {["Ibu", "Ayah", "Nenek", "Kakek", "Pengasuh keluarga", "Wali lain"].map((w) => (
                    <option key={w}>{w}</option>
                  ))}
                </Select>
              </Field>
            ) : null}
            {act.kind === "checkin" ? (
              <Field label="Kondisi saat tiba" htmlFor="a-cond">
                <Select id="a-cond" name="cond" defaultValue="baik">
                  <option value="baik">Baik</option>
                  <option value="batuk">Batuk ringan</option>
                  <option value="pilek">Pilek</option>
                  <option value="lesu">Tampak lesu</option>
                  <option value="lainnya">Perlu perhatian lain</option>
                </Select>
              </Field>
            ) : null}
            {act.kind === "note" || act.kind === "checkout" ? (
              <Field label={act.kind === "note" ? "Catatan" : "Catatan untuk orang tua (opsional)"} htmlFor="a-note">
                <Textarea
                  id="a-note"
                  name="note"
                  required={act.kind === "note"}
                  minLength={act.kind === "note" ? 3 : undefined}
                  maxLength={600}
                  placeholder={act.kind === "note" ? "Misal: bermain aktif, minum 2 gelas air." : "Misal: bekal botol minum dibawa pulang."}
                  autoFocus={act.kind === "note"}
                />
              </Field>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose}>
                Batal
              </Button>
              <Button type="submit" variant="primary" disabled={busy}>
                {busy ? "Menyimpan…" : "Simpan"}
              </Button>
            </div>
          </form>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

function MedsSection() {
  const { state: s, refresh } = useLive();
  const { busy, run } = useAction();
  const rows = meds(s);
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const r = await run(
      () => api.post<{ entry: LogEntry }>("/api/log/med", { childId: f.get("childId"), med: f.get("med"), dose: f.get("dose"), note: f.get("note") || "" }),
      { ok: (r) => `${r.entry.child?.split(" ")[0]}: ${r.entry.title}.` },
    );
    if (r) {
      form.reset();
      await refresh();
    }
  };
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <Panel>
        <PanelHead title="Obat yang diberikan hari ini" desc="Sesuai catatan orang tua; setiap pemberian dikirim sebagai pemberitahuan." />
        <PanelBody>
          {rows.length ? (
            <TableWrap label="Obat yang diberikan hari ini">
              <table className="table min-w-[520px]">
                <thead>
                  <tr>
                    <th>Pukul</th>
                    <th>Anak</th>
                    <th>Obat</th>
                    <th>Catatan</th>
                    <th>Oleh</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((m) => (
                    <tr key={m.id}>
                      <td className="tabular-nums">{m.time}</td>
                      <td className="font-semibold">{m.child.split(" ")[0]}</td>
                      <td>
                        {m.med} {m.dose}
                      </td>
                      <td className="text-muted">{m.note}</td>
                      <td>{m.by}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          ) : (
            <Empty>Belum ada obat yang diberikan hari ini.</Empty>
          )}
        </PanelBody>
      </Panel>
      <Panel>
        <PanelHead title="Catat pemberian obat" />
        <PanelBody>
          <form onSubmit={submit} className="grid gap-3">
            <Field label="Anak" htmlFor="m-child">
              <Select id="m-child" name="childId" required defaultValue={s.children.find((c) => c.meds)?.id}>
                {s.children.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.meds ? " — " + c.meds : ""}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] gap-3">
              <Field label="Nama obat" htmlFor="m-med">
                <Input id="m-med" name="med" required minLength={2} placeholder="Misal: Parasetamol sirup" />
              </Field>
              <Field label="Dosis" htmlFor="m-dose">
                <Input id="m-dose" name="dose" required placeholder="5 ml" />
              </Field>
            </div>
            <Field label="Catatan (opsional)" htmlFor="m-note">
              <Input id="m-note" name="note" placeholder="Diminum habis setelah makan." />
            </Field>
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? "Menyimpan…" : "Catat & beri tahu orang tua"}
            </Button>
          </form>
        </PanelBody>
      </Panel>
    </div>
  );
}

const KINDS = ["Anak terjatuh", "Menangis cukup lama", "Mendekati area dapur", "Bertengkar dengan teman", "Muntah", "Alergi / ruam", "Lainnya"];

function IncidentsSection() {
  const { state: s, refresh } = useLive();
  const { busy, run } = useAction();
  const list = incidents(s);
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const r = await run(
      () =>
        api.post<{ entry: LogEntry }>("/api/log/incident", {
          childId: f.get("childId"),
          kind: f.get("kind"),
          sev: f.get("sev"),
          room: f.get("room"),
          note: f.get("note"),
        }),
      { ok: (r) => `Kejadian tercatat: ${r.entry.title} (${r.entry.child?.split(" ")[0]}). Orang tua diberi tahu.` },
    );
    if (r) {
      form.reset();
      await refresh();
    }
  };
  const resolve = async (id: string) => {
    const r = await run(() => api.post("/api/incidents/" + id + "/resolve"), { ok: "Kejadian ditandai sudah ditangani." });
    if (r) await refresh();
  };
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <Panel>
        <PanelHead title="Kejadian hari ini" desc="Kejadian penting dikirim ke orang tua saat itu juga." />
        <PanelBody>
          {list.length ? (
            <ul className="divide-line divide-y">
              {list.map((i) => (
                <li key={i.id} className="grid gap-1 py-3 sm:grid-cols-[52px_minmax(0,1fr)_auto]">
                  <time className="text-muted text-[13px] tabular-nums">{i.time}</time>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-[14px] font-semibold">
                      {i.kind} <SevBadge sev={i.sev} /> <span className="text-muted font-normal">· {i.child.split(" ")[0]}</span>
                    </div>
                    <div className="text-muted text-[13.5px]">
                      {i.room} · {i.note}
                    </div>
                    <div className="text-muted mt-0.5 text-[12.5px]">
                      {i.resolved ? `Ditangani oleh ${i.resolved.by} pukul ${i.resolved.at}` : "Belum ditandai ditangani"}
                    </div>
                  </div>
                  <div className="sm:text-right">
                    {i.resolved ? (
                      <Badge tone="ok">Ditangani</Badge>
                    ) : (
                      <Button size="sm" onClick={() => resolve(i.id)} disabled={busy}>
                        Tandai ditangani
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Tidak ada kejadian hari ini.</Empty>
          )}
        </PanelBody>
      </Panel>
      <Panel>
        <PanelHead title="Catat kejadian" />
        <PanelBody>
          <form onSubmit={submit} className="grid gap-3">
            <Field label="Anak" htmlFor="i-child">
              <Select id="i-child" name="childId" required>
                {s.children.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Jenis" htmlFor="i-kind">
                <Select id="i-kind" name="kind" required>
                  {KINDS.map((k) => (
                    <option key={k}>{k}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Tingkat" htmlFor="i-sev">
                <Select id="i-sev" name="sev" defaultValue="medium">
                  <option value="low">Info</option>
                  <option value="medium">Perhatian</option>
                  <option value="high">Penting</option>
                </Select>
              </Field>
            </div>
            <Field label="Ruangan" htmlFor="i-room">
              <Select id="i-room" name="room" required>
                {s.rooms.map((r) => (
                  <option key={r.id}>{r.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Apa yang terjadi dan tindakan" htmlFor="i-note">
              <Textarea
                id="i-note"
                name="note"
                required
                minLength={3}
                maxLength={600}
                placeholder="Misal: tersandung karpet, tidak ada luka, kompres dingin 10 menit."
              />
            </Field>
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? "Menyimpan…" : "Catat kejadian"}
            </Button>
          </form>
        </PanelBody>
      </Panel>
    </div>
  );
}

function HandoverSection() {
  const { state: s, refresh } = useLive();
  const { busy, run } = useAction();
  const rows = handovers(s);
  const others = (s.staff ?? []).filter((u) => u.id !== s.me.id).map((u) => u.name);
  const targets = [...others, "Admin daycare"];
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const r = await run(() => api.post<{ entry: LogEntry }>("/api/log/handover", { to: f.get("to"), note: f.get("note") }), {
      ok: (r) => r.entry.title + " tersimpan.",
    });
    if (r) {
      form.reset();
      await refresh();
    }
  };
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <Panel>
        <PanelHead title="Serah terima hari ini" desc="Catatan antar shift yang perlu diketahui pengasuh berikutnya." />
        <PanelBody>
          {rows.length ? (
            <ul className="divide-line divide-y">
              {rows.map((h) => (
                <li key={h.id} className="flex gap-3 py-3">
                  <time className="text-muted w-12 shrink-0 text-[13px] tabular-nums">{h.time}</time>
                  <div>
                    <div className="text-[14px] font-semibold">
                      {h.from} → {h.to}
                    </div>
                    <p className="text-ink-2 text-[13.5px]">{h.note}</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Belum ada serah terima hari ini.</Empty>
          )}
        </PanelBody>
      </Panel>
      <Panel>
        <PanelHead title="Tulis serah terima" />
        <PanelBody>
          <form onSubmit={submit} className="grid gap-3">
            <Field label="Kepada" htmlFor="h-to">
              <Select id="h-to" name="to" required>
                {targets.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </Select>
            </Field>
            <Field label="Catatan" htmlFor="h-note">
              <Textarea id="h-note" name="note" required minLength={3} maxLength={600} placeholder="Stok, alat, kondisi anak yang perlu diperhatikan…" />
            </Field>
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? "Menyimpan…" : "Simpan serah terima"}
            </Button>
          </form>
        </PanelBody>
      </Panel>
    </div>
  );
}

function CamerasSection() {
  const { state: s } = useLive();
  const [camId, setCamId] = React.useState(s.cameras[0].id);
  const cam = s.cameras.find((c) => c.id === camId) ?? s.cameras[0];
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <div className="grid gap-3">
        <div className="flex flex-wrap gap-2">
          {s.cameras.map((c) => (
            <Button key={c.id} size="sm" variant={c.id === cam.id ? "dark" : "default"} onClick={() => setCamId(c.id)} aria-pressed={c.id === cam.id}>
              {c.label} · {c.room.replace("Ruang ", "").replace(" (khusus staf)", "")}
            </Button>
          ))}
        </div>
        <CameraView cam={cam} viewer="staff" />
      </div>
      <Panel>
        <PanelHead
          title="Udara tiap ruang"
          desc={`Ambang: CO₂ ${s.thresholds.co2Max} ppm · debu ${s.thresholds.pm25Max} µg/m³ · suhu ${s.thresholds.tempMax}°C`}
        />
        <PanelBody>
          <ul className="divide-line divide-y">
            {s.air.readings.map((r) => {
              const st = airStatus(r, s.thresholds);
              return (
                <li key={r.room} className="flex items-center justify-between gap-3 py-2.5">
                  <div>
                    <div className="text-[14px] font-semibold">{r.room}</div>
                    <div className="text-muted text-[13px] tabular-nums">
                      {airLine(r, true)}
                      {r.source !== "none" && r.source !== "stale" ? <span className="text-faint"> · {AIR_SOURCE_LABEL[r.source].toLowerCase()}</span> : null}
                    </div>
                  </div>
                  <Badge tone={airTone(st)} dot>
                    {AIR_LABEL[st]}
                  </Badge>
                </li>
              );
            })}
          </ul>
          <Kv
            className="mt-4"
            rows={[
              [
                "Pembacaan terakhir",
                new Date(s.air.updatedAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Asia/Jakarta" }) +
                  " WIB",
              ],
            ]}
          />
        </PanelBody>
      </Panel>
    </div>
  );
}
