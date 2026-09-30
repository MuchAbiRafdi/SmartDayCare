"use client";
import * as React from "react";
import { Copy, Plus, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { copyText } from "@/lib/clipboard";
import { fmtDateShort, fmtTime } from "@/lib/format";
import { useAction, useLive } from "@/lib/live";
import type { Device, MessageStatus, OutboxMessage } from "@/lib/types";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import { Empty, Kv, Note, Panel, PanelBody, PanelHead } from "@/components/ui/panel";
import { useToast } from "@/components/ui/toast";
import { TableWrap } from "@/components/ui/table-wrap";

const STATUS: Record<MessageStatus, { label: string; tone: Tone }> = {
  queued: { label: "Menunggu", tone: "neutral" },
  sending: { label: "Mengirim", tone: "accent" },
  sent: { label: "Terkirim", tone: "ok" },
  failed: { label: "Gagal", tone: "danger" },
  off: { label: "Pengirim belum diatur", tone: "warn" },
};

const REF_LABEL: Record<string, string> = { reset: "Pemulihan kata sandi", verify: "Verifikasi email", daily: "Ringkasan harian", test: "Pesan percobaan" };

function refLabel(ref: string): string {
  if (ref.startsWith("alert:")) return "Pemberitahuan catatan";
  return REF_LABEL[ref] ?? ref;
}

/** Tab Perangkat & pesan: sensor/kamera terdaftar, token perangkat, kotak keluar email/WhatsApp. */
export function DevicesTab() {
  const { state: s } = useLive();
  const devices = s.devices ?? [];
  const real = devices.filter((d) => d.source === "device");
  const builtin = devices.filter((d) => d.source === "builtin");
  const [adding, setAdding] = React.useState(false);
  const [token, setToken] = React.useState<{ device: Device; token: string; fresh: boolean } | null>(null);
  const { busy, run } = useAction();
  const toast = useToast();

  const patchDevice = (d: Device, body: Record<string, unknown>, ok: string) => run(() => api.patch(`/api/admin/devices/${d.id}`, body), { ok });
  const newToken = async (d: Device) => {
    if (!window.confirm(`Buat token baru untuk ${d.label}? Token lama berhenti berlaku seketika; perangkat harus diisi token baru.`)) return;
    const r = await run(() => api.post<{ token: string; device: Device }>(`/api/admin/devices/${d.id}/new-token`));
    if (r) setToken({ device: r.device, token: r.token, fresh: false });
  };
  const remove = async (d: Device) => {
    if (!window.confirm(`Hapus ${d.label}? Kiriman dari perangkat ini tidak akan diterima lagi.`)) return;
    await run(() => api.del(`/api/admin/devices/${d.id}`), { ok: `${d.label} dihapus.` });
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted max-w-[62ch] text-[14px]">
          Sensor dan kamera mengirim data ke aplikasi dengan token perangkat. Token hanya ditampilkan sekali saat dibuat; panduan pemasangan ada di berkas{" "}
          <code className="font-mono text-[13px]">docs/PERANGKAT.md</code>.
        </p>
        <Button variant="primary" onClick={() => setAdding(true)}>
          <Plus size={16} /> Tambah perangkat
        </Button>
      </div>

      <Panel>
        <PanelHead title="Perangkat terdaftar" desc={real.length ? `${real.length} perangkat` : "Belum ada perangkat sungguhan"} />
        <PanelBody className="pt-2">
          {real.length ? (
            <TableWrap label="Perangkat terdaftar">
              <table className="table">
                <thead>
                  <tr>
                    <th>Perangkat</th>
                    <th>Ruang</th>
                    <th>Status</th>
                    <th className="hidden sm:table-cell">Kiriman terakhir</th>
                    <th className="text-right">Tindakan</th>
                  </tr>
                </thead>
                <tbody>
                  {real.map((d) => (
                    <tr key={d.id} className={d.enabled === false ? "opacity-60" : ""}>
                      <td>
                        <div className="font-medium">{d.label}</div>
                        <div className="text-muted text-[12px]">
                          {d.kind === "sensor" ? "Sensor udara" : "Kamera"}
                          {d.kind === "camera" ? (d.parents ? " · terlihat orang tua" : " · area staf") : ""}
                          {d.stream ? ` · siaran ${String(d.streamKind ?? "").toUpperCase()}` : ""}
                        </div>
                      </td>
                      <td>{d.room}</td>
                      <td>
                        <Badge tone={d.enabled === false ? "neutral" : d.ok ? "ok" : "warn"} dot>
                          {d.enabled === false ? "Dinonaktifkan" : d.ok ? "Terhubung" : "Terputus"}
                        </Badge>
                        <div className="text-muted mt-1 text-[12px]">{d.detail}</div>
                      </td>
                      <td className="text-muted hidden text-[13px] tabular-nums sm:table-cell">{d.at ? `${fmtDateShort(d.at)} ${fmtTime(d.at)}` : "—"}</td>
                      <td>
                        <div className="flex flex-wrap justify-end gap-1.5">
                          {d.kind === "camera" ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={busy}
                              onClick={() =>
                                patchDevice(d, { parents: !d.parents }, d.parents ? "Kamera kini hanya untuk staf." : "Kamera kini terlihat orang tua.")
                              }
                            >
                              {d.parents ? "Jadikan area staf" : "Buka untuk orang tua"}
                            </Button>
                          ) : null}
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={busy}
                            onClick={() =>
                              patchDevice(
                                d,
                                { enabled: d.enabled === false },
                                d.enabled === false ? "Perangkat diaktifkan." : "Perangkat dinonaktifkan; tokennya berhenti berlaku.",
                              )
                            }
                          >
                            {d.enabled === false ? "Aktifkan" : "Nonaktifkan"}
                          </Button>
                          <Button size="sm" variant="ghost" disabled={busy} onClick={() => newToken(d)}>
                            <RefreshCw size={13} /> Token baru
                          </Button>
                          <Button size="sm" variant="ghost" className="text-danger" disabled={busy} onClick={() => remove(d)}>
                            Hapus
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          ) : (
            <Empty>
              Belum ada sensor atau kamera yang terhubung.{" "}
              {s.sample ? "Angka udara dan gambar kamera yang tampil sekarang adalah nilai contoh." : "Ruang anak belum punya data udara."} Tambahkan perangkat
              untuk mulai menerima data sungguhan.
            </Empty>
          )}
        </PanelBody>
      </Panel>

      {builtin.length ? (
        <Panel>
          <PanelHead title="Perangkat contoh" desc="Bawaan data contoh · digantikan otomatis begitu ruangan yang sama punya perangkat sungguhan" />
          <PanelBody className="pt-2">
            <TableWrap label="Perangkat contoh">
              <table className="table">
                <thead>
                  <tr>
                    <th>Perangkat</th>
                    <th>Ruang</th>
                    <th>Keterangan</th>
                  </tr>
                </thead>
                <tbody>
                  {builtin.map((d) => (
                    <tr key={d.id}>
                      <td className="font-medium">{d.label}</td>
                      <td>{d.room}</td>
                      <td className="text-muted text-[13px]">{d.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          </PanelBody>
        </Panel>
      ) : null}

      <Outbox />

      <Panel>
        <PanelHead title="Penyimpanan" />
        <PanelBody>
          <Kv
            rows={[
              ["Foto kamera", "Hanya foto terbaru tiap kamera yang disimpan di memori server; tidak ada rekaman"],
              ["Foto piring", "Disimpan 3 hari di server, hanya untuk orang tua anak terkait"],
              ["Catatan harian", "Disimpan 30 hari; ringkasan laporan dapat dicetak kapan saja"],
              ["Pembacaan udara", "12 pembacaan terakhir per ruang untuk grafik"],
              ["Cadangan basis data", "Salinan otomatis setiap hari pukul 02.00, disimpan 14 hari"],
            ]}
          />
        </PanelBody>
      </Panel>

      <AddDeviceDialog
        open={adding}
        onClose={() => setAdding(false)}
        onCreated={(d, t) => {
          setAdding(false);
          setToken({ device: d, token: t, fresh: true });
        }}
      />
      <Dialog open={!!token} onOpenChange={(o) => !o && setToken(null)}>
        {token ? (
          <DialogContent title={token.fresh ? "Perangkat terdaftar" : "Token baru dibuat"} desc={`${token.device.label} · ${token.device.room}`}>
            <div className="grid gap-3">
              <div className="border-line code-reveal rounded-lg border px-4 py-4 text-center">
                <div className="font-mono text-[15px] font-semibold tracking-wide break-all">{token.token}</div>
              </div>
              <p className="text-muted text-[13.5px] leading-relaxed">
                Simpan token ini di perangkat sekarang — <b>tidak akan ditampilkan lagi</b>. Perangkat mengirim data dengan header{" "}
                <code className="font-mono text-[12.5px]">X-Device-Token</code> ke{" "}
                <code className="font-mono text-[12.5px]">{token.device.kind === "sensor" ? "/api/devices/ingest" : "/api/devices/snapshot"}</code>.
              </p>
              <Button
                onClick={async () => {
                  const ok = await copyText(token.token);
                  toast(ok ? "Token disalin." : "Tidak bisa menyalin otomatis; salin manual dari kotak di atas.", ok ? "ok" : "info");
                }}
              >
                <Copy size={15} /> Salin token
              </Button>
            </div>
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}

function AddDeviceDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (d: Device, token: string) => void }) {
  const { state: s } = useLive();
  const { busy, run } = useAction();
  const [kind, setKind] = React.useState<"sensor" | "camera">("sensor");
  const [room, setRoom] = React.useState(s.rooms[0]?.name ?? "");
  const [customRoom, setCustomRoom] = React.useState(false);
  const [parents, setParents] = React.useState(false);
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body = {
      kind,
      name: String(f.get("name") ?? "").trim(),
      room: (customRoom ? String(f.get("roomCustom") ?? "") : room).trim(),
      parents: kind === "camera" ? parents : false,
      stream: kind === "camera" ? String(f.get("stream") ?? "").trim() || null : null,
    };
    const r = await run(() => api.post<{ device: Device; token: string }>("/api/admin/devices", body));
    if (r) onCreated(r.device, r.token);
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Tambah perangkat" desc="Setelah disimpan, token perangkat ditampilkan satu kali.">
        <form onSubmit={submit} className="grid gap-4">
          <Field label="Jenis" htmlFor="dv-kind">
            <Select id="dv-kind" value={kind} onChange={(e) => setKind(e.target.value as "sensor" | "camera")}>
              <option value="sensor">Sensor udara (suhu, kelembapan, CO₂, PM2,5)</option>
              <option value="camera">Kamera</option>
            </Select>
          </Field>
          <Field label="Nama" htmlFor="dv-name" hint="Contoh: Sensor Ruang Bermain, Kamera Teras">
            <Input id="dv-name" name="name" required minLength={2} maxLength={80} />
          </Field>
          <Field label="Ruang" htmlFor="dv-room">
            {customRoom ? (
              <Input id="dv-room" name="roomCustom" required minLength={2} maxLength={80} placeholder="Nama ruang baru" />
            ) : (
              <Select id="dv-room" value={room} onChange={(e) => (e.target.value === "__baru" ? setCustomRoom(true) : setRoom(e.target.value))}>
                {s.rooms.map((r) => (
                  <option key={r.id} value={r.name}>
                    {r.name}
                  </option>
                ))}
                <option value="__baru">Ruang lain…</option>
              </Select>
            )}
          </Field>
          {kind === "camera" ? (
            <>
              <Checkbox label="Terlihat orang tua (selama anaknya hadir di ruang ini)" checked={parents} onChange={(e) => setParents(e.target.checked)} />
              <Field
                label="Alamat siaran (opsional)"
                htmlFor="dv-stream"
                hint="Kosongkan bila kamera mengirim foto berkala. Untuk siaran langsung isi jalur /stream/… (HLS lewat MediaMTX)."
              >
                <Input id="dv-stream" name="stream" placeholder="/stream/ruang-bermain/index.m3u8" maxLength={400} />
              </Field>
            </>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Batal
            </Button>
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? "Menyimpan…" : "Simpan & tampilkan token"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Outbox() {
  const { state: s, patch } = useLive();
  const { busy, run } = useAction();
  const msgs = s.messages ?? [];
  const ch = s.channels;
  const apply = (r: { messages: OutboxMessage[] }) => patch((st) => ({ ...st, messages: r.messages }));
  const test = async (channel: "email" | "wa") => {
    const r = await run(() => api.post<{ messages: OutboxMessage[] }>("/api/admin/messages/test", { channel }), {
      ok:
        channel === "email"
          ? `Pesan percobaan dimasukkan ke antrean untuk ${s.me.email}.`
          : `Pesan percobaan dimasukkan ke antrean untuk ${s.me.phone || "nomor Anda"}.`,
    });
    if (r) apply(r);
  };
  const dailyNow = async () => {
    if (!window.confirm("Kirim ringkasan hari ini ke semua orang tua sekarang? Biasanya otomatis pukul 17.30.")) return;
    const r = await run(() => api.post<{ sent: number; messages: OutboxMessage[] }>("/api/admin/messages/daily-now"), {
      ok: (r) => `${r.sent} ringkasan dimasukkan ke antrean.`,
    });
    if (r) apply(r);
  };
  const retry = async (m: OutboxMessage) => {
    const r = await run(() => api.post<{ messages: OutboxMessage[] }>(`/api/admin/messages/${m.id}/retry`), { ok: "Pesan dikirim ulang." });
    if (r) apply(r);
  };
  const reload = async () => {
    const r = await run(() => api.get<{ messages: OutboxMessage[] }>("/api/admin/messages"), { silent: true });
    if (r) apply(r);
  };
  const failed = msgs.filter((m) => m.status === "failed").length;
  return (
    <Panel>
      <PanelHead
        title="Pesan keluar"
        desc="Pemberitahuan ke orang tua, tautan pemulihan, dan verifikasi email"
        action={
          <Button size="sm" variant="ghost" onClick={reload} disabled={busy} aria-label="Muat ulang daftar pesan">
            <RefreshCw size={14} /> Muat ulang
          </Button>
        }
      />
      <PanelBody className="grid gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="border-line rounded-lg border p-3.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[14px] font-semibold">Email</span>
              <Badge tone={ch.email ? "ok" : "warn"} dot>
                {ch.email ? (ch.email === "smtp" ? "SMTP aktif" : "Resend aktif") : "Belum diatur"}
              </Badge>
            </div>
            <p className="text-muted mt-1.5 text-[13px] leading-relaxed">
              {ch.email
                ? "Tautan pemulihan, verifikasi, dan pemberitahuan dikirim lewat email."
                : "Isi SD_SMTP_HOST/USER/PASS atau SD_RESEND_API_KEY di konfigurasi server, lalu mulai ulang layanan API."}
            </p>
            <Button size="sm" className="mt-3" disabled={busy || !ch.email} onClick={() => test("email")}>
              Kirim percobaan ke {s.me.email}
            </Button>
          </div>
          <div className="border-line rounded-lg border p-3.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[14px] font-semibold">WhatsApp</span>
              <Badge tone={ch.wa ? "ok" : "warn"} dot>
                {ch.wa ? (ch.wa === "meta" ? "WhatsApp Cloud API aktif" : "Fonnte aktif") : "Belum diatur"}
              </Badge>
            </div>
            <p className="text-muted mt-1.5 text-[13px] leading-relaxed">
              {ch.wa
                ? "Pemberitahuan penting dan ringkasan harian dikirim ke nomor orang tua."
                : "Isi SD_WA_PROVIDER (meta atau fonnte) dan SD_WA_TOKEN di konfigurasi server."}
              {ch.wa === "meta" && ch.waTemplate === false
                ? " Tanpa templat yang disetujui, pesan hanya sampai dalam 24 jam setelah orang tua terakhir membalas."
                : ""}
            </p>
            <Button size="sm" className="mt-3" disabled={busy || !ch.wa || !s.me.phone} onClick={() => test("wa")}>
              Kirim percobaan ke {s.me.phone || "nomor Anda (belum diisi)"}
            </Button>
          </div>
        </div>
        {!ch.publicUrl ? <Note tone="warn">Alamat situs (SD_PUBLIC_URL) belum diisi; tautan di email memakai alamat dari permintaan yang masuk.</Note> : null}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-muted text-[13.5px]">
            {msgs.length ? `${msgs.length} pesan terakhir` : "Belum ada pesan."}
            {failed ? ` · ${failed} gagal` : ""}
          </p>
          <Button size="sm" variant="ghost" disabled={busy || (!ch.email && !ch.wa)} onClick={dailyNow}>
            Kirim ringkasan harian sekarang
          </Button>
        </div>
        {msgs.length ? (
          <TableWrap label="Pesan keluar">
            <table className="table">
              <thead>
                <tr>
                  <th>Waktu</th>
                  <th>Saluran</th>
                  <th>Tujuan</th>
                  <th className="hidden sm:table-cell">Isi</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {msgs.slice(0, 60).map((m) => (
                  <tr key={m.id}>
                    <td className="text-muted text-[13px] whitespace-nowrap tabular-nums">
                      {fmtDateShort(m.at)} {fmtTime(m.at)}
                    </td>
                    <td>{m.channel === "wa" ? "WhatsApp" : "Email"}</td>
                    <td className="max-w-[180px] truncate" title={m.to}>
                      {m.to}
                    </td>
                    <td className="text-muted hidden max-w-[320px] truncate text-[13px] sm:table-cell" title={m.body}>
                      <span className="text-ink-2 font-medium">{refLabel(m.ref)}</span> · {m.subject}
                    </td>
                    <td>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge tone={STATUS[m.status].tone} dot>
                          {STATUS[m.status].label}
                        </Badge>
                        {m.status === "failed" || m.status === "off" ? (
                          <Button size="sm" variant="ghost" disabled={busy} onClick={() => retry(m)}>
                            Coba lagi
                          </Button>
                        ) : null}
                      </div>
                      {m.error ? (
                        <div className="text-danger mt-1 max-w-[260px] text-[12px]" title={m.error}>
                          {m.error.length > 90 ? m.error.slice(0, 90) + "…" : m.error}
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        ) : null}
      </PanelBody>
    </Panel>
  );
}
