"use client";
/* CCTV dengan hak akses (Tema 3). Orang tua: daftar kamera + pengajuan akses; admin: persetujuan;
   staf/admin: monitor. Server yang membatasi gambar/siaran — komponen ini hanya menampilkan statusnya. */
import * as React from "react";
import { Check, Clock3, Lock, ShieldCheck, Video, X } from "lucide-react";
import { api } from "@/lib/api";
import { cn, fmtDateShort, fmtTime, isToday } from "@/lib/format";
import { useAction, useLive } from "@/lib/live";
import type { AccessStatus, Camera, CameraRequest, Child } from "@/lib/types";
import { CameraView } from "@/components/shared/camera-view";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Select, Textarea } from "@/components/ui/field";
import { Empty, Note, Panel, PanelBody, PanelHead } from "@/components/ui/panel";
import { TableWrap } from "@/components/ui/table-wrap";

export const ACCESS_LABEL: Record<AccessStatus, string> = {
  none: "Belum diajukan",
  pending: "Menunggu persetujuan",
  approved: "Disetujui",
  denied: "Ditolak",
  expired: "Kedaluwarsa",
  revoked: "Dicabut",
};
export const ACCESS_TONE: Record<AccessStatus, Tone> = {
  none: "neutral",
  pending: "warn",
  approved: "ok",
  denied: "danger",
  expired: "neutral",
  revoked: "danger",
};

function fmtWhen(iso: string | null): string {
  if (!iso) return "–";
  return isToday(iso) ? "hari ini " + fmtTime(iso) : fmtDateShort(iso);
}

/* ---------------------------------------------------------------- orang tua ---- */

export function ParentCameras({ child, present }: { child: Child; present: boolean }) {
  const { state: s, refresh } = useLive();
  const [ask, setAsk] = React.useState<Camera | null>(null);
  const cams = s.cameras;
  const mine = s.cameraRequests;
  return (
    <div className="grid gap-4">
      <Note>
        <span className="inline-flex items-center gap-1.5 font-semibold">
          <ShieldCheck size={15} /> Akses kamera berdasarkan hak akses yang diberikan.
        </span>{" "}
        Ajukan akses untuk kamera yang ingin Anda lihat; admin daycare meninjau dan memberi izin dengan masa berlaku. Kamera area staf tidak tersedia untuk
        orang tua.
      </Note>
      {cams.length === 0 ? <Empty>Belum ada kamera yang dibuka untuk orang tua.</Empty> : null}
      <div className="grid gap-4 md:grid-cols-2">
        {cams.map((cam) => {
          const a = cam.access ?? { status: "none" as AccessStatus, expiresAt: null, note: "", requestId: null, decidedAt: null, createdAt: null };
          if (a.status === "approved") {
            return (
              <div key={cam.id} className="grid gap-2">
                <CameraView cam={cam} child={child} present={present} viewer="parent" />
                <div className="text-muted flex flex-wrap items-center justify-between gap-2 px-1 text-[12.5px]">
                  <Badge tone="ok" dot>
                    Akses aktif
                  </Badge>
                  <span>Berlaku hingga {fmtWhen(a.expiresAt)}</span>
                </div>
              </div>
            );
          }
          return (
            <figure key={cam.id} className="overflow-hidden rounded-[14px] border border-[#243046] bg-[#111a2e] text-white">
              <div className="relative grid aspect-[4/3] place-items-center p-6 text-center">
                <div>
                  <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-white/10">
                    <Lock size={22} />
                  </span>
                  <div className="text-[15px] font-semibold">{cam.room}</div>
                  <p className="mt-1 text-[13px] text-white/70">
                    {cam.label} · {ACCESS_LABEL[a.status]}
                  </p>
                  {a.status === "denied" && a.note ? <p className="mt-1 text-[12.5px] text-white/60">Catatan admin: {a.note}</p> : null}
                  <div className="mt-4">
                    {a.status === "pending" ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-400/20 px-3 py-1 text-[12.5px] font-semibold text-amber-200">
                        <Clock3 size={14} /> Menunggu persetujuan admin
                      </span>
                    ) : (
                      <Button variant="light" size="sm" onClick={() => setAsk(cam)}>
                        <Video size={15} /> Ajukan akses
                      </Button>
                    )}
                  </div>
                </div>
                <span className="absolute top-3 left-3 rounded-md bg-black/50 px-2 py-1 text-[12px] font-semibold">{cam.label}</span>
              </div>
            </figure>
          );
        })}
      </div>
      {mine.length ? (
        <Panel>
          <PanelHead title="Riwayat permintaan akses" desc="Semua pengajuan Anda dan keputusannya." />
          <PanelBody>
            <TableWrap label="Riwayat permintaan akses kamera">
              <table className="table">
                <thead>
                  <tr>
                    <th>Kamera</th>
                    <th className="hidden sm:table-cell">Alasan</th>
                    <th>Status</th>
                    <th className="hidden md:table-cell">Berlaku hingga</th>
                  </tr>
                </thead>
                <tbody>
                  {mine.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <div className="font-medium">{r.room}</div>
                        <div className="text-muted text-[12px]">
                          {r.camera} · diajukan {fmtWhen(r.createdAt)}
                        </div>
                      </td>
                      <td className="text-muted hidden max-w-[320px] sm:table-cell">{r.reason}</td>
                      <td>
                        <Badge tone={ACCESS_TONE[r.status]}>{ACCESS_LABEL[r.status]}</Badge>
                        {r.note && r.status !== "pending" ? <div className="text-muted mt-1 text-[12px]">{r.note}</div> : null}
                      </td>
                      <td className="hidden md:table-cell">{r.status === "approved" ? fmtWhen(r.expiresAt) : "–"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          </PanelBody>
        </Panel>
      ) : null}
      <RequestDialog cam={ask} child={child} onClose={() => setAsk(null)} onDone={() => refresh()} />
    </div>
  );
}

function RequestDialog({ cam, child, onClose, onDone }: { cam: Camera | null; child: Child; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = React.useState("");
  const { busy, run } = useAction();
  React.useEffect(() => {
    if (cam) setReason("");
  }, [cam]);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cam) return;
    const r = await run(() => api.post("/api/cctv/requests", { camId: cam.id, childId: child.id, reason: reason.trim() }), {
      ok: "Permintaan terkirim. Anda akan diberi tahu setelah admin meninjau.",
    });
    if (r) {
      onDone();
      onClose();
    }
  };
  return (
    <Dialog open={!!cam} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={cam ? "Ajukan akses " + cam.label : ""} desc={cam ? cam.room + " · ditinjau oleh admin daycare" : undefined}>
        <form onSubmit={submit} className="grid gap-4">
          <Field label="Alasan" htmlFor="cctv-reason" hint="Contoh: ingin melihat anak saat jam bermain pagi.">
            <Textarea
              id="cctv-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              minLength={3}
              maxLength={300}
              placeholder="Tulis alasan singkat…"
            />
          </Field>
          <p className="text-muted text-[12.5px]">Setelah disetujui, akses berlaku untuk jangka waktu yang ditentukan admin dan tercatat di riwayat akses.</p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Batal
            </Button>
            <Button type="submit" variant="primary" disabled={busy || reason.trim().length < 3}>
              Kirim permintaan
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------------------------------------------------------- admin ---- */

export function AccessRequests({ compact = false }: { compact?: boolean }) {
  const { state: s, refresh } = useLive();
  const { busy, run } = useAction();
  const [days, setDays] = React.useState<Record<string, string>>({});
  const reqs = s.cameraRequests;
  const pending = reqs.filter((r) => r.status === "pending");
  const others = reqs.filter((r) => r.status !== "pending");
  const decide = async (r: CameraRequest, action: "approve" | "deny" | "revoke") => {
    const ok = await run(() => api.post(`/api/cctv/requests/${r.id}/decide`, { action, days: Number(days[r.id] || 7), note: "" }), {
      ok: action === "approve" ? "Akses disetujui. Orang tua diberi tahu." : action === "deny" ? "Permintaan ditolak." : "Akses dicabut.",
    });
    if (ok) void refresh();
  };
  return (
    <div className="grid gap-4">
      <Panel>
        <PanelHead
          title={"Permintaan menunggu" + (pending.length ? " (" + pending.length + ")" : "")}
          desc="Orang tua hanya dapat melihat kamera setelah disetujui di sini."
        />
        <PanelBody className="grid gap-3">
          {pending.length === 0 ? <Empty>Tidak ada permintaan yang menunggu.</Empty> : null}
          {pending.map((r) => (
            <div key={r.id} className="border-line grid gap-3 rounded-[12px] border p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{r.user}</span>
                  {r.child ? <Badge tone="neutral">Orang tua {r.child}</Badge> : null}
                  <Badge tone="warn">Menunggu</Badge>
                </div>
                <div className="text-ink-2 mt-1 text-[14px]">
                  {r.camera} · {r.room}
                </div>
                <p className="text-muted mt-1 text-[13px]">“{r.reason}”</p>
                <div className="text-faint mt-1 text-[12px]">Diajukan {fmtWhen(r.createdAt)}</div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Select
                  aria-label="Masa berlaku"
                  value={days[r.id] ?? "7"}
                  onChange={(e) => setDays((d) => ({ ...d, [r.id]: e.target.value }))}
                  className="h-9 w-auto py-1 text-[13.5px]"
                >
                  <option value="1">1 hari</option>
                  <option value="7">7 hari</option>
                  <option value="30">30 hari</option>
                  <option value="90">90 hari</option>
                </Select>
                <Button variant="primary" size="sm" disabled={busy} onClick={() => decide(r, "approve")}>
                  <Check size={15} /> Setujui
                </Button>
                <Button variant="danger" size="sm" disabled={busy} onClick={() => decide(r, "deny")}>
                  <X size={15} /> Tolak
                </Button>
              </div>
            </div>
          ))}
        </PanelBody>
      </Panel>
      {!compact ? (
        <Panel>
          <PanelHead title="Riwayat keputusan" desc="Akses yang masih berlaku dapat dicabut kapan saja." />
          <PanelBody>
            {others.length === 0 ? (
              <Empty>Belum ada riwayat.</Empty>
            ) : (
              <TableWrap label="Riwayat permintaan akses kamera">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Orang tua</th>
                      <th>Kamera</th>
                      <th>Status</th>
                      <th className="hidden md:table-cell">Berlaku hingga</th>
                      <th className="hidden sm:table-cell">Diputuskan</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {others.map((r) => (
                      <tr key={r.id}>
                        <td>
                          <div className="font-medium">{r.user}</div>
                          {r.child ? <div className="text-muted text-[12px]">Orang tua {r.child}</div> : null}
                        </td>
                        <td>
                          <div>{r.room}</div>
                          <div className="text-muted text-[12px]">{r.camera}</div>
                        </td>
                        <td>
                          <Badge tone={ACCESS_TONE[r.status]}>{ACCESS_LABEL[r.status]}</Badge>
                        </td>
                        <td className="hidden md:table-cell">{r.status === "approved" ? fmtWhen(r.expiresAt) : "–"}</td>
                        <td className="text-muted hidden text-[13px] sm:table-cell">
                          {r.decidedBy || "–"}
                          {r.decidedAt ? <div className="text-[12px]">{fmtWhen(r.decidedAt)}</div> : null}
                        </td>
                        <td className="text-right">
                          {r.status === "approved" ? (
                            <Button size="sm" variant="ghost" disabled={busy} onClick={() => decide(r, "revoke")}>
                              Cabut
                            </Button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            )}
          </PanelBody>
        </Panel>
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------------------- monitor staf/admin ---- */

export function CctvMonitor({ children }: { children?: React.ReactNode }) {
  const { state: s } = useLive();
  const [sel, setSel] = React.useState<string>("all");
  const cams = s.cameras;
  const shown = sel === "all" ? cams : cams.filter((c) => c.id === sel);
  const activeReq = s.cameraRequests.filter((r) => r.status === "approved");
  return (
    <div className="panel overflow-hidden">
      <header className="border-line flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3.5">
        <h2 className="inline-flex items-center gap-2 text-[15px] font-semibold">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[#1b2340] text-white">
            <Video size={15} />
          </span>
          CCTV Monitor
        </h2>
        <Select aria-label="Tampilan" value={sel} onChange={(e) => setSel(e.target.value)} className="h-9 w-auto py-1 text-[13.5px]">
          <option value="all">Semua kamera</option>
          {cams.map((c) => (
            <option key={c.id} value={c.id}>
              {c.room}
            </option>
          ))}
        </Select>
      </header>
      <div className="grid lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="border-line border-b px-4 py-4 lg:border-r lg:border-b-0">
          <div className="text-muted mb-2 text-[11.5px] font-semibold tracking-[0.06em] uppercase">Kamera</div>
          <ul className="m-0 list-none space-y-0.5 p-0">
            <li>
              <button
                type="button"
                onClick={() => setSel("all")}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13.5px]",
                  sel === "all" ? "bg-teal-100 font-semibold text-teal-800" : "hover:bg-wash",
                )}
              >
                ▸ Semua
              </button>
            </li>
            {cams.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setSel(c.id)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13.5px]",
                    sel === c.id ? "bg-teal-100 font-semibold text-teal-800" : "hover:bg-wash",
                  )}
                >
                  <span className={cn("h-2 w-2 rounded-full", c.online ? "bg-ok" : "bg-danger")} aria-hidden /> {c.room}
                </button>
              </li>
            ))}
          </ul>
          <div className="text-muted mt-5 mb-2 text-[11.5px] font-semibold tracking-[0.06em] uppercase">Pengguna</div>
          <ul className="text-ink-2 m-0 list-none space-y-1 p-0 text-[13px]">
            <li>👤 Orang tua — {activeReq.length} akses aktif</li>
            <li>👥 Pengasuh — semua ruang anak</li>
            <li>🛡️ Admin — semua kamera</li>
          </ul>
        </aside>
        <div className="grid gap-4 p-4 md:grid-cols-2">
          {shown.map((cam) => (
            <div key={cam.id} className="relative">
              <CameraView cam={cam} viewer="staff" />
              {cam.online ? (
                <span className="live-tag top-3" aria-hidden>
                  <span className="h-1.5 w-1.5 rounded-full bg-white" /> LIVE
                </span>
              ) : null}
            </div>
          ))}
          {shown.length === 0 ? <Empty className="md:col-span-2">Belum ada kamera.</Empty> : null}
        </div>
      </div>
      <footer className="border-line text-muted flex items-center gap-2 border-t px-5 py-2.5 text-[12.5px]">
        <Lock size={13} /> Akses kamera berdasarkan hak akses yang diberikan. Setiap pembukaan kamera tercatat di riwayat akses.
      </footer>
      {children}
    </div>
  );
}
