"use client";
import * as React from "react";
import {
  Activity,
  ClipboardList,
  Cpu,
  Download,
  FileText,
  HeartHandshake,
  History,
  Home,
  LayoutDashboard,
  LifeBuoy,
  MessageCircle,
  Moon,
  Settings as SettingsIcon,
  Smile,
  Sparkles,
  UserCheck,
  Users,
  Utensils,
  Video,
} from "lucide-react";
import { api } from "@/lib/api";
import { accessRows, airHasData, airOverall, airStatus, airTone, AIR_LABEL, AIR_SOURCE_LABEL, dailyRows, incidents, present, TYPE_LABEL } from "@/lib/derive";
import { fmtDate, fmtDateShort, fmtNum, ROLE_LABEL } from "@/lib/format";
import { useAction, useHashTab, useLive } from "@/lib/live";
import type { Food, Role, State, Thresholds, User } from "@/lib/types";
import { AppShell, type Section } from "@/components/shell/app-shell";
import { Co2Lines } from "@/components/charts/charts";
import { Badge, SevBadge } from "@/components/ui/badge";
import { Band, BandPill } from "@/components/ui/band";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/field";
import { Metric } from "@/components/ui/metric";
import { Empty, Kv, Note, Panel, PanelBody, PanelHead } from "@/components/ui/panel";
import { useToast } from "@/components/ui/toast";
import { TableWrap } from "@/components/ui/table-wrap";
import { PasswordInput, PasswordMeter, pwScore } from "@/components/auth/auth-forms";
import { ChildrenPanel, InvitesPanel } from "@/components/admin/access-codes";
import { DevicesTab } from "@/components/admin/devices";
import { AreaPage, DevelopmentDashboard, RecommendationsPage, ReportPage } from "@/components/admin/analytics-pages";
import { ChatPanel } from "@/components/shared/chat";
import { AccessRequests, CctvMonitor } from "@/components/shared/cctv";
import { TrustOverview } from "@/components/shared/trust";

const SECTIONS: Section[] = [
  { id: "ringkasan", label: "Beranda", icon: Home },
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "analitik-aktivitas", label: "Analitik Aktivitas", icon: Activity },
  { id: "mood", label: "Mood Tracker", icon: Smile },
  { id: "tidur", label: "Pola Tidur", icon: Moon },
  { id: "makan", label: "Pola Makan", icon: Utensils },
  { id: "kehadiran", label: "Kehadiran", icon: UserCheck },
  { id: "laporan", label: "Laporan Perkembangan", icon: FileText },
  { id: "rekomendasi", label: "Rekomendasi AI", icon: Sparkles },
  { id: "pesan", label: "Pesan", icon: MessageCircle, group: "Komunikasi" },
  { id: "kepercayaan", label: "Kepercayaan Orang Tua", icon: HeartHandshake },
  { id: "kamera", label: "Akses Kamera", icon: Video, group: "Operasional" },
  { id: "perangkat", label: "Perangkat & Sensor", icon: Cpu },
  { id: "catatan", label: "Catatan Harian", icon: ClipboardList },
  { id: "akses", label: "Riwayat Akses", icon: History },
  { id: "akun", label: "Akun & Kode Anak", icon: Users },
  { id: "permintaan", label: "Permintaan Bantuan", icon: LifeBuoy },
  { id: "pengaturan", label: "Pengaturan", icon: SettingsIcon },
];
const IDS = SECTIONS.map((s) => s.id);

export function AdminDashboard() {
  const { state: s } = useLive();
  const [tab, setTab] = useHashTab(IDS, "ringkasan");
  const openTickets = s.tickets.filter((t) => t.status === "open").length;
  const pendingCams = s.cameraRequests.filter((r) => r.status === "pending").length;
  const sections = SECTIONS.map((x) => {
    if (x.id === "permintaan" && openTickets) return { ...x, count: openTickets };
    if (x.id === "kamera" && pendingCams) return { ...x, count: pendingCams };
    if (x.id === "pesan" && s.chatUnread) return { ...x, count: s.chatUnread };
    return x;
  });
  const title = SECTIONS.find((x) => x.id === tab)?.label ?? "Beranda";
  return (
    <AppShell me={s.me} title={title} subtitle={s.facility.name} sections={sections} tab={tab} onTab={setTab} chatUnread={s.chatUnread} chatHref="/admin#pesan">
      <div className="mx-auto max-w-[1100px]">
        {tab === "ringkasan" ? <Overview onGo={setTab} /> : null}
        {tab === "dashboard" ? <DevelopmentDashboard onGo={setTab} /> : null}
        {tab === "analitik-aktivitas" ? <AreaPage area="aktivitas" /> : null}
        {tab === "mood" ? <AreaPage area="mood" /> : null}
        {tab === "tidur" ? <AreaPage area="tidur" /> : null}
        {tab === "makan" ? <AreaPage area="makan" /> : null}
        {tab === "kehadiran" ? <AreaPage area="kehadiran" /> : null}
        {tab === "laporan" ? <ReportPage /> : null}
        {tab === "rekomendasi" ? <RecommendationsPage /> : null}
        {tab === "pesan" ? <ChatPanel /> : null}
        {tab === "kepercayaan" ? <TrustOverview /> : null}
        {tab === "kamera" ? (
          <div className="grid gap-4">
            <AccessRequests />
            <CctvMonitor />
          </div>
        ) : null}
        {tab === "perangkat" ? <DevicesTab /> : null}
        {tab === "catatan" ? <DailyLog /> : null}
        {tab === "akses" ? <AccessLog /> : null}
        {tab === "akun" ? <Accounts /> : null}
        {tab === "permintaan" ? <Tickets /> : null}
        {tab === "pengaturan" ? <Settings /> : null}
      </div>
    </AppShell>
  );
}

function Overview({ onGo }: { onGo: (tab: string) => void }) {
  const { state: s, now } = useLive();
  const inc = incidents(s);
  const handled = inc.filter((i) => i.resolved).length;
  const air = airOverall(s.air.readings, s.thresholds, true);
  const access = accessRows(s).filter((r) => r.at >= new Date(now.getTime() - 24 * 3600e3).toISOString() || r.source === "seed").length;
  const plates =
    s.log.filter((e) => (e.type === "plate" || e.type === "meal") && e.done !== "replaced").length +
    s.children.filter(
      (c) =>
        !!c.nutrition?.lunch &&
        c.nutrition.lunch.scannedPost <=
          now.toLocaleTimeString("en-GB", {
            hour: "2-digit",
            minute: "2-digit",
            timeZone: "Asia/Jakarta",
          }),
    ).length;
  const series = s.rooms.map((r) => ({
    room: r.name,
    values: s.air.history[r.name] ?? [],
  }));
  return (
    <div className="grid gap-4">
      <Band
        eyebrow={fmtDate(now)}
        title={s.facility.name}
        desc="Ringkasan hari ini: kehadiran, kejadian, kualitas udara, dan perangkat. Angka diperbarui langsung saat ada catatan baru."
        right={
          <BandPill tone={airTone(air.status)} dot>
            Udara {AIR_LABEL[air.status].toLowerCase()}
          </BandPill>
        }
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Metric label="Anak hadir sekarang" value={`${present(s, now).length} dari ${s.children.length}`} />
        <Metric
          label="Kejadian hari ini"
          value={inc.length}
          sub={`${handled} ditangani · ${inc.length - handled} terbuka`}
          tone={inc.length - handled ? "warn" : "ok"}
        />
        <Metric label="Kamera & sensor" value={`${s.cameras.length + s.sensors.length} aktif`} sub="Semua perangkat merespons" tone="ok" />
        <Metric
          label="Kualitas udara"
          value={AIR_LABEL[air.status]}
          tone={airTone(air.status)}
          sub={air.worst ? `Terburuk: ${air.worst.room} · CO₂ ${air.worst.co2} ppm` : s.air.sample ? "" : "Belum ada sensor yang mengirim"}
        />
        <Metric label="Akses tercatat (24 jam)" value={access} sub="Kamera, masuk/keluar akun, perubahan" />
        <Metric label="Piring dipindai hari ini" value={plates} sub="Sebelum & sesudah makan" />
      </div>
      <Panel>
        <PanelHead title="Perlu tindakan" desc="Hal yang menunggu keputusan atau balasan admin." />
        <PanelBody className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {(
            [
              ["kamera", "Permintaan akses kamera", s.cameraRequests.filter((r) => r.status === "pending").length, "menunggu persetujuan"],
              ["permintaan", "Permintaan bantuan", s.tickets.filter((t) => t.status === "open").length, "belum ditangani"],
              ["pesan", "Pesan belum dibaca", s.chatUnread, "dari orang tua & staf"],
              ["kepercayaan", "Umpan balik belum dibalas", s.feedback.filter((f) => !f.response).length, "dalam 30 hari terakhir"],
            ] as const
          ).map(([id, label, n, sub]) => (
            <button
              key={id}
              type="button"
              onClick={() => onGo(id)}
              className={"border-line rounded-[12px] border px-3.5 py-3 text-left transition hover:border-teal-600 " + (n ? "bg-surface" : "bg-wash")}
            >
              <div className="text-muted text-[12.5px] font-medium">{label}</div>
              <div className={"text-[22px] font-bold tabular-nums " + (n ? "text-teal-700" : "text-ink")}>{n}</div>
              <div className="text-muted text-[12px]">{n ? sub : "Tidak ada"}</div>
            </button>
          ))}
        </PanelBody>
      </Panel>
      <Panel>
        <PanelHead
          title="CO₂ per ruang"
          desc={`Pembacaan setiap beberapa detik dari sensor tiap ruang · terakhir ${new Date(s.air.updatedAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Asia/Jakarta" })} WIB`}
        />
        <PanelBody>
          <Co2Lines series={series} threshold={s.thresholds.co2Max} />
        </PanelBody>
      </Panel>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <PanelHead title="Kondisi tiap ruang" />
          <PanelBody className="pt-2">
            <TableWrap label="Kondisi tiap ruang">
              <table className="table">
                <thead>
                  <tr>
                    <th>Ruang</th>
                    <th className="num">Suhu</th>
                    <th className="num hidden sm:table-cell">Lembap</th>
                    <th className="num">CO₂</th>
                    <th className="num hidden sm:table-cell">PM2,5</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {s.air.readings.map((r) => {
                    const st = airStatus(r, s.thresholds);
                    const has = airHasData(r);
                    return (
                      <tr key={r.room}>
                        <td className="font-medium">
                          {r.room}
                          <span className="text-muted block text-[12px] font-normal">
                            {AIR_SOURCE_LABEL[r.source]}
                            {r.source === "sensor" && r.battery !== undefined ? ` · baterai ${r.battery}%` : ""}
                          </span>
                        </td>
                        <td className="num">{has ? fmtNum(r.temp, 1) + "°C" : "—"}</td>
                        <td className="num hidden sm:table-cell">{has ? r.hum + "%" : "—"}</td>
                        <td className="num">{has ? r.co2 : "—"}</td>
                        <td className="num hidden sm:table-cell">{has ? r.pm25 : "—"}</td>
                        <td>
                          <Badge tone={airTone(st)}>{AIR_LABEL[st]}</Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableWrap>
          </PanelBody>
        </Panel>
        <Panel>
          <PanelHead title="Kejadian terbaru" />
          <PanelBody className="pt-2">
            {inc.length ? (
              <ul className="divide-line divide-y">
                {inc.slice(0, 5).map((i) => (
                  <li key={i.id} className="flex gap-3 py-2.5 text-[14px]">
                    <time className="text-muted w-12 shrink-0 tabular-nums">{i.time}</time>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 font-semibold">
                        {i.kind} <SevBadge sev={i.sev} />
                      </div>
                      <div className="text-muted text-[13px]">
                        {i.child.split(" ")[0]} · {i.room} · {i.resolved ? `ditangani ${i.resolved.by}` : "belum ditangani"}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>Tidak ada kejadian hari ini.</Empty>
            )}
          </PanelBody>
        </Panel>
      </div>
    </div>
  );
}

function DailyLog() {
  const { state: s } = useLive();
  const [type, setType] = React.useState("all");
  const [q, setQ] = React.useState("");
  const rows = dailyRows(s).filter(
    (r) => (type === "all" || r.type === type) && (!q || (r.child + " " + r.title + " " + r.text + " " + r.by).toLowerCase().includes(q.toLowerCase())),
  );
  return (
    <Panel>
      <PanelHead
        title="Catatan harian"
        desc={`${rows.length} catatan hari ini`}
        action={
          <div className="flex gap-2">
            <Select aria-label="Jenis" value={type} onChange={(e) => setType(e.target.value)} className="h-9 w-auto py-1 text-[13.5px]">
              <option value="all">Semua jenis</option>
              {Object.entries(TYPE_LABEL)
                .filter(([k]) => k !== "access" && k !== "account")
                .map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
            </Select>
            <Input
              aria-label="Cari"
              placeholder="Cari nama atau kata"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="h-9 w-[180px] py-1 text-[13.5px]"
            />
          </div>
        }
      />
      <PanelBody className="pt-2">
        {rows.length ? (
          <TableWrap label="Catatan harian">
            <table className="table min-w-[640px]">
              <thead>
                <tr>
                  <th>Pukul</th>
                  <th>Jenis</th>
                  <th>Anak</th>
                  <th>Catatan</th>
                  <th>Oleh</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="tabular-nums">{r.time}</td>
                    <td>
                      <Badge tone={r.sev === "high" ? "danger" : r.sev === "medium" ? "warn" : "neutral"}>{TYPE_LABEL[r.type] ?? r.type}</Badge>
                    </td>
                    <td className="font-medium">{r.child === "—" ? "—" : r.child.split(" ")[0]}</td>
                    <td>
                      <div className="font-medium">{r.title}</div>
                      <div className="text-muted text-[13px]">{r.text}</div>
                    </td>
                    <td className="text-muted">{r.by}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        ) : (
          <Empty>Tidak ada catatan yang cocok.</Empty>
        )}
      </PanelBody>
    </Panel>
  );
}

function AccessLog() {
  const { state: s } = useLive();
  const [role, setRole] = React.useState("all");
  const { busy, run } = useAction();
  const rows = accessRows(s).filter((r) => role === "all" || r.role === role);
  // diunduh lewat fetch agar kredensial sesi ikut terkirim pada kedua jalur (cookie/header)
  const exportCsv = () =>
    run(async () => {
      const blob = await api.blob("/api/admin/access.csv");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "riwayat-akses.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    });
  return (
    <Panel>
      <PanelHead
        title="Riwayat akses"
        desc="Siapa membuka apa, kapan, dan untuk apa. Termasuk masuk/keluar akun dan perubahan pengaturan."
        action={
          <div className="flex gap-2">
            <Select aria-label="Peran" value={role} onChange={(e) => setRole(e.target.value)} className="h-9 w-auto py-1 text-[13.5px]">
              <option value="all">Semua peran</option>
              {(["parent", "caregiver", "admin", "system"] as const).map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </Select>
            <Button size="sm" className="h-9" onClick={exportCsv} disabled={busy}>
              <Download size={15} /> {busy ? "Menyiapkan…" : "Ekspor CSV"}
            </Button>
          </div>
        }
      />
      <PanelBody className="pt-2">
        <TableWrap label="Riwayat akses">
          <table className="table min-w-[640px]">
            <thead>
              <tr>
                <th>Waktu</th>
                <th>Pengguna</th>
                <th>Peran</th>
                <th>Aktivitas</th>
                <th>Keterangan</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 200).map((r) => (
                <tr key={r.id}>
                  <td className="text-muted tabular-nums">{r.source === "seed" ? r.time : fmtDateShort(r.at)}</td>
                  <td className="font-medium">{r.user}</td>
                  <td>{ROLE_LABEL[r.role as Role | "system"] ?? r.role}</td>
                  <td>{r.action}</td>
                  <td className="text-muted">{r.purpose}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </PanelBody>
    </Panel>
  );
}

function Accounts() {
  const { state: s, refresh } = useLive();
  const { busy, run } = useAction();
  const users = s.users ?? [];
  const [reset, setReset] = React.useState<{ user: User; pw: string } | null>(null);
  const [create, setCreate] = React.useState(false);
  const toggle = async (u: User) => {
    const r = await run(() => api.patch("/api/admin/users/" + u.id, { disabled: !u.disabled }), {
      ok: `${u.name} ${u.disabled ? "diaktifkan" : "dinonaktifkan"}.`,
    });
    if (r) await refresh();
  };
  const doReset = async (u: User) => {
    const r = await run(() => api.post<{ temporaryPassword: string }>("/api/admin/users/" + u.id + "/reset-password"));
    if (r) {
      setReset({ user: u, pw: r.temporaryPassword });
      await refresh();
    }
  };
  return (
    <div className="grid gap-4">
      <Panel>
        <PanelHead
          title="Akun pengguna"
          desc={`${users.length} akun · orang tua, pengasuh, admin`}
          action={
            <Button size="sm" variant="primary" onClick={() => setCreate(true)}>
              Tambah akun
            </Button>
          }
        />
        <PanelBody className="pt-2">
          <TableWrap label="Akun pengguna">
            <table className="table min-w-[700px]">
              <thead>
                <tr>
                  <th>Nama</th>
                  <th>Email</th>
                  <th>Peran</th>
                  <th>Anak tertaut</th>
                  <th>Status</th>
                  <th>
                    <span className="sr-only">Tindakan</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td className="font-medium">
                      {u.name}
                      {u.mustChangePassword ? <span className="text-warn-ink ml-1 text-[11.5px]">· perlu ganti sandi</span> : null}
                    </td>
                    <td className="text-muted">{u.email}</td>
                    <td>{ROLE_LABEL[u.role]}</td>
                    <td>{u.children.map((cid) => s.children.find((c) => c.id === cid)?.short ?? cid).join(", ") || "—"}</td>
                    <td>
                      <Badge tone={u.disabled ? "danger" : "ok"}>{u.disabled ? "Nonaktif" : "Aktif"}</Badge>
                    </td>
                    <td>
                      <div className="flex justify-end gap-1.5">
                        <Button size="sm" variant="ghost" onClick={() => doReset(u)} disabled={busy}>
                          Atur ulang sandi
                        </Button>
                        <Button size="sm" variant={u.disabled ? "default" : "ghost"} onClick={() => toggle(u)} disabled={busy || u.id === s.me.id}>
                          {u.disabled ? "Aktifkan" : "Nonaktifkan"}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </PanelBody>
      </Panel>
      <ChildrenPanel />
      <InvitesPanel />
      <Dialog open={!!reset} onOpenChange={(o) => !o && setReset(null)}>
        {reset ? (
          <DialogContent
            title={"Kata sandi sementara · " + reset.user.name}
            desc="Ditampilkan sekali. Sampaikan langsung kepada pemilik akun; ia diminta mengganti sandi saat masuk."
          >
            <div className="border-line bg-wash rounded-md border px-4 py-3 text-center font-mono text-[22px] font-semibold tracking-wider">{reset.pw}</div>
            <p className="text-muted mt-3 text-[13px]">Semua sesi {reset.user.name} yang sedang berjalan telah ditutup.</p>
            <div className="mt-4 flex justify-end">
              <Button variant="primary" onClick={() => setReset(null)}>
                Selesai
              </Button>
            </div>
          </DialogContent>
        ) : null}
      </Dialog>
      <CreateUserDialog open={create} onClose={() => setCreate(false)} />
    </div>
  );
}

function CreateUserDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state: s, refresh } = useLive();
  const { busy, run } = useAction();
  const [role, setRole] = React.useState<Role>("parent");
  const [pw, setPw] = React.useState("");
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (pwScore(pw) < 2) return;
    const r = await run(
      () =>
        api.post<{ user: User }>("/api/admin/users", {
          name: f.get("name"),
          email: f.get("email"),
          phone: f.get("phone") || "",
          role,
          password: pw,
          childCode: f.get("childCode") || "",
        }),
      {
        ok: (r) => `Akun ${r.user.name} dibuat. Ia diminta mengganti sandi saat pertama masuk.`,
      },
    );
    if (r) {
      setPw("");
      await refresh();
      onClose();
    }
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Tambah akun" desc="Untuk keluarga atau staf yang didaftarkan langsung oleh admin.">
        <form onSubmit={submit} className="grid gap-3">
          <Field label="Peran" htmlFor="cu-role">
            <Select id="cu-role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
              <option value="parent">Orang tua</option>
              <option value="caregiver">Pengasuh</option>
              <option value="admin">Admin daycare</option>
            </Select>
          </Field>
          <Field label="Nama lengkap" htmlFor="cu-name">
            <Input id="cu-name" name="name" required minLength={3} />
          </Field>
          <Field label="Email" htmlFor="cu-email">
            <Input id="cu-email" name="email" type="email" required />
          </Field>
          <Field label="Nomor WhatsApp" htmlFor="cu-phone">
            <Input id="cu-phone" name="phone" type="tel" />
          </Field>
          {role === "parent" ? (
            <Field label="Kode anak (opsional)" htmlFor="cu-code">
              <Select id="cu-code" name="childCode" defaultValue="">
                <option value="">Tautkan nanti</option>
                {s.children.map((c) => (
                  <option key={c.id} value={c.code}>
                    {c.code} · {c.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          <Field label="Kata sandi awal" htmlFor="cu-pw">
            <PasswordInput id="cu-pw" name="password" autoComplete="new-password" value={pw} onChange={setPw} minLength={8} />
            <PasswordMeter pw={pw} />
          </Field>
          <div className="mt-1 flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Batal
            </Button>
            <Button type="submit" variant="primary" disabled={busy || pwScore(pw) < 2}>
              {busy ? "Membuat…" : "Buat akun"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Tickets() {
  const { state: s, refresh } = useLive();
  const { busy, run } = useAction();
  const setStatus = async (id: string, status: "open" | "answered" | "closed") => {
    const r = await run(() => api.patch("/api/admin/tickets/" + id, { status }), { ok: "Status permintaan diperbarui." });
    if (r) await refresh();
  };
  const label = {
    open: "Baru",
    answered: "Dibalas",
    closed: "Selesai",
  } as const;
  return (
    <Panel>
      <PanelHead title="Permintaan bantuan & kontak" desc="Dari formulir kontak di beranda dan halaman bantuan." />
      <PanelBody className="pt-2">
        {s.tickets.length ? (
          <ul className="divide-line divide-y">
            {s.tickets.map((t) => (
              <li key={t.id} className="grid gap-2 py-3 md:grid-cols-[minmax(0,1fr)_auto]">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-[14px] font-semibold">
                    <span className="text-muted font-mono text-[12.5px]">{t.id}</span> {t.name}
                    {t.org ? <span className="text-muted font-normal">· {t.org}</span> : null}
                    <Badge tone={t.status === "open" ? "warn" : t.status === "answered" ? "accent" : "neutral"}>{label[t.status]}</Badge>
                  </div>
                  <div className="text-muted text-[13px]">
                    {fmtDateShort(t.at)} · {t.email} · {t.topic || "Kontak"}
                  </div>
                  <p className="text-ink-2 mt-1 text-[14px]">{t.msg}</p>
                </div>
                <div className="flex gap-1.5 md:justify-end">
                  {t.status !== "answered" ? (
                    <Button size="sm" onClick={() => setStatus(t.id, "answered")} disabled={busy}>
                      Tandai dibalas
                    </Button>
                  ) : null}
                  {t.status !== "closed" ? (
                    <Button size="sm" variant="ghost" onClick={() => setStatus(t.id, "closed")} disabled={busy}>
                      Selesai
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>Belum ada permintaan.</Empty>
        )}
      </PanelBody>
    </Panel>
  );
}

const SKEYS: {
  k: keyof Thresholds;
  label: string;
  unit: string;
  step: number;
}[] = [
  { k: "tempMax", label: "Suhu ruang maksimum", unit: "°C", step: 0.5 },
  { k: "humMax", label: "Kelembapan maksimum", unit: "%", step: 1 },
  { k: "co2Max", label: "CO₂ maksimum", unit: "ppm", step: 50 },
  {
    k: "pm25Max",
    label: "Debu halus (PM2,5) maksimum",
    unit: "µg/m³",
    step: 1,
  },
  {
    k: "bodyTempWatch",
    label: "Suhu tubuh: batas pantau",
    unit: "°C",
    step: 0.1,
  },
  {
    k: "bodyTempHigh",
    label: "Suhu tubuh: batas tinggi",
    unit: "°C",
    step: 0.1,
  },
  {
    k: "retentionDays",
    label: "Masa simpan rekaman kamera",
    unit: "hari",
    step: 1,
  },
  { k: "plateDiameterCm", label: "Diameter piring anak", unit: "cm", step: 1 },
];

function Settings() {
  const { state: s, refresh } = useLive();
  const { busy, run } = useAction();
  const toast = useToast();
  const [confirmReset, setConfirmReset] = React.useState(false);
  const save = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body: Record<string, number> = {};
    for (const x of SKEYS) body[x.k] = Number(f.get(x.k));
    if (body.bodyTempHigh <= body.bodyTempWatch) {
      toast("Batas suhu tinggi harus lebih besar dari batas pantau.", "err");
      return;
    }
    if (body.plateDiameterCm < 12 || body.plateDiameterCm > 40) {
      toast("Diameter piring harus antara 12 dan 40 cm.", "err");
      return;
    }
    const r = await run(() => api.put("/api/admin/settings", body), {
      ok: "Pengaturan tersimpan dan berlaku di semua dasbor.",
    });
    if (r) await refresh();
  };
  const addFood = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const r = await run(
      () =>
        api.post("/api/admin/foods", {
          name: f.get("name"),
          kcal: Number(f.get("kcal")),
          protein: Number(f.get("protein")),
          carbs: Number(f.get("carbs")),
          fat: Number(f.get("fat")),
        }),
      { ok: "Makanan ditambahkan ke tabel gizi." },
    );
    if (r) {
      form.reset();
      await refresh();
    }
  };
  const delFood = async (fd: Food) => {
    const r = await run(() => api.del("/api/admin/foods/" + fd.id), {
      ok: `${fd.name} dihapus.`,
    });
    if (r) await refresh();
  };
  const resetLog = async () => {
    const r = await run(() => api.post<{ deleted: number }>("/api/admin/log/reset"), {
      ok: (r) => `${r.deleted} catatan aplikasi dihapus. Riwayat akses tetap disimpan.`,
    });
    setConfirmReset(false);
    if (r) await refresh();
  };
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Panel>
          <PanelHead title="Ambang batas" desc="Menentukan status udara, pemberitahuan suhu tubuh, dan skala pindai piring." />
          <PanelBody>
            <form onSubmit={save} className="grid gap-3 sm:grid-cols-2" key={JSON.stringify(s.thresholds)}>
              {SKEYS.map((x) => (
                <Field key={x.k} label={x.label} htmlFor={"st-" + x.k}>
                  <div className="flex items-center gap-2">
                    <Input id={"st-" + x.k} name={x.k} type="number" step={x.step} required defaultValue={s.thresholds[x.k]} inputMode="decimal" />
                    <span className="text-muted w-12 text-[13px]">{x.unit}</span>
                  </div>
                </Field>
              ))}
              <div className="sm:col-span-2">
                <Button type="submit" variant="primary" disabled={busy}>
                  {busy ? "Menyimpan…" : "Simpan pengaturan"}
                </Button>
              </div>
            </form>
          </PanelBody>
        </Panel>
        <div className="grid gap-4">
          <FacilityPanel />
          <Panel>
            <PanelHead title="Catatan aplikasi" />
            <PanelBody>
              <p className="text-muted text-[13.5px]">
                Menghapus semua catatan yang dibuat lewat aplikasi (kedatangan, suhu, piring, kejadian, obat). Riwayat akses dan akun tidak ikut dihapus.
              </p>
              {confirmReset ? (
                <Note tone="danger" className="mt-3">
                  Yakin? Tindakan ini tidak bisa dibatalkan.
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" variant="danger" onClick={resetLog} disabled={busy}>
                      Ya, kosongkan
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirmReset(false)}>
                      Batal
                    </Button>
                  </div>
                </Note>
              ) : (
                <Button variant="danger" className="mt-3" onClick={() => setConfirmReset(true)}>
                  Kosongkan catatan aplikasi
                </Button>
              )}
            </PanelBody>
          </Panel>
        </div>
      </div>
      <Panel>
        <PanelHead title="Tabel gizi" desc={`${s.foods.length} menu · nilai per 100 g, dipakai untuk menghitung asupan dari pindaian piring`} />
        <PanelBody className="grid gap-4">
          <form onSubmit={addFood} className="grid grid-cols-2 gap-2 sm:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))_auto] sm:items-end">
            <Field label="Nama menu" htmlFor="f-name" className="col-span-2 sm:col-span-1">
              <Input id="f-name" name="name" required minLength={2} />
            </Field>
            <Field label="kkal" htmlFor="f-kcal">
              <Input id="f-kcal" name="kcal" type="number" step="0.1" min={0} required inputMode="decimal" />
            </Field>
            <Field label="Protein g" htmlFor="f-protein">
              <Input id="f-protein" name="protein" type="number" step="0.1" min={0} required inputMode="decimal" />
            </Field>
            <Field label="Karbo g" htmlFor="f-carbs">
              <Input id="f-carbs" name="carbs" type="number" step="0.1" min={0} required inputMode="decimal" />
            </Field>
            <Field label="Lemak g" htmlFor="f-fat">
              <Input id="f-fat" name="fat" type="number" step="0.1" min={0} required inputMode="decimal" />
            </Field>
            <Button type="submit" className="col-span-2 sm:col-span-1" disabled={busy}>
              Tambah
            </Button>
          </form>
          <TableWrap label="Tabel gizi">
            <table className="table min-w-[560px]">
              <thead>
                <tr>
                  <th>Menu</th>
                  <th className="num">kkal</th>
                  <th className="num">Protein</th>
                  <th className="num">Karbo</th>
                  <th className="num">Lemak</th>
                  <th>
                    <span className="sr-only">Tindakan</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {s.foods.map((f) => (
                  <tr key={f.id}>
                    <td className="font-medium">{f.name}</td>
                    <td className="num">{f.kcal}</td>
                    <td className="num">{f.protein}</td>
                    <td className="num">{f.carbs}</td>
                    <td className="num">{f.fat}</td>
                    <td className="text-right">
                      {f.seed ? (
                        <span className="text-muted text-[12px]">bawaan</span>
                      ) : (
                        <Button size="sm" variant="ghost" onClick={() => delFood(f)} disabled={busy}>
                          Hapus
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </PanelBody>
      </Panel>
    </div>
  );
}

const FKEYS: { k: keyof State["facility"]; label: string; type?: string; hint?: string }[] = [
  { k: "name", label: "Nama fasilitas" },
  { k: "city", label: "Kota" },
  { k: "address", label: "Alamat" },
  { k: "phone", label: "Telepon", type: "tel" },
  { k: "email", label: "Email kontak", type: "email", hint: "Tampil di halaman depan dan kaki pesan" },
  { k: "hours", label: "Jam buka" },
];

/** Profil fasilitas: tampil di halaman depan, kop laporan, dan pesan ke orang tua. */
function FacilityPanel() {
  const { state: s, refresh } = useLive();
  const { busy, run } = useAction();
  const [editing, setEditing] = React.useState(false);
  const save = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body: Record<string, string> = {};
    for (const x of FKEYS) body[x.k] = String(f.get(x.k) ?? "").trim();
    const r = await run(() => api.put("/api/admin/facility", body), { ok: "Profil fasilitas tersimpan." });
    if (r) {
      setEditing(false);
      await refresh();
    }
  };
  return (
    <Panel>
      <PanelHead
        title="Fasilitas"
        action={
          <Button size="sm" variant="ghost" onClick={() => setEditing((v) => !v)}>
            {editing ? "Batal" : "Ubah"}
          </Button>
        }
      />
      <PanelBody>
        {editing ? (
          <form onSubmit={save} className="grid gap-3">
            {FKEYS.map((x) => (
              <Field key={x.k} label={x.label} htmlFor={"fc-" + x.k} hint={x.hint}>
                <Input
                  id={"fc-" + x.k}
                  name={x.k}
                  type={x.type ?? "text"}
                  defaultValue={s.facility[x.k]}
                  required={x.k === "name"}
                  maxLength={x.k === "address" ? 200 : 120}
                />
              </Field>
            ))}
            <div>
              <Button type="submit" variant="primary" disabled={busy}>
                {busy ? "Menyimpan…" : "Simpan profil"}
              </Button>
            </div>
          </form>
        ) : (
          <Kv
            rows={[
              ["Nama", s.facility.name],
              ["Anak aktif", `${s.children.length} anak` + (s.archivedChildren?.length ? ` · ${s.archivedChildren.length} di arsip` : "")],
              ["Alamat", s.facility.address || "—"],
              ["Telepon", s.facility.phone || "—"],
              ["Email", s.facility.email || "—"],
              ["Jam buka", s.facility.hours || "—"],
            ]}
          />
        )}
      </PanelBody>
    </Panel>
  );
}
