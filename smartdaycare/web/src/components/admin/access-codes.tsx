"use client";
import * as React from "react";
import { Copy, Plus } from "lucide-react";
import { api } from "@/lib/api";
import { copyText } from "@/lib/clipboard";
import { fmtDay, fmtDateShort, ROLE_LABEL } from "@/lib/format";
import { useAction, useLive } from "@/lib/live";
import type { Child, InviteCode, User } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/field";
import { Note, Panel, PanelBody, PanelHead } from "@/components/ui/panel";
import { useToast } from "@/components/ui/toast";
import { TableWrap } from "@/components/ui/table-wrap";

/* ---- Bagian bersama ------------------------------------------------------------------------- */

function CopyButton({ text, label }: { text: string; label: string }) {
  const toast = useToast();
  return (
    <Button
      size="icon"
      variant="ghost"
      className="text-muted h-7 w-7"
      aria-label={"Salin " + label}
      title={"Salin " + label}
      onClick={async () => {
        const ok = await copyText(text);
        toast(ok ? `${text} disalin.` : `Tidak bisa menyalin otomatis. Salin manual: ${text}`, ok ? "ok" : "info");
      }}
    >
      <Copy size={14} />
    </Button>
  );
}

/** Kotak kode besar yang ditampilkan setelah kode dibuat. */
function CodeReveal({ code, children }: { code: string; children: React.ReactNode }) {
  const toast = useToast();
  return (
    <div className="grid gap-3">
      <div className="border-line code-reveal rounded-lg border px-4 py-4 text-center">
        <div className="font-mono text-[24px] font-semibold tracking-[0.12em]">{code}</div>
      </div>
      <div className="text-muted text-[13.5px] leading-relaxed">{children}</div>
      <Button
        variant="default"
        onClick={async () => {
          const ok = await copyText(code);
          toast(ok ? `${code} disalin.` : `Tidak bisa menyalin otomatis. Salin manual: ${code}`, ok ? "ok" : "info");
        }}
      >
        <Copy size={15} /> Salin kode
      </Button>
    </div>
  );
}

function ConfirmDialog({
  open,
  title,
  desc,
  action,
  danger,
  busy,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  desc: React.ReactNode;
  action: string;
  danger?: boolean;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      {open ? (
        <DialogContent title={title}>
          <div className="text-ink-2 text-[14px] leading-relaxed">{desc}</div>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Batal
            </Button>
            <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} disabled={busy}>
              {busy ? "Memproses…" : action}
            </Button>
          </div>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

/* ---- Anak & kode anak ----------------------------------------------------------------------- */

export function ChildrenPanel() {
  const { state: s, refresh } = useLive();
  const { busy, run } = useAction();
  const users = s.users ?? [];
  const links = s.links ?? [];
  const [dialog, setDialog] = React.useState<{ mode: "create" } | { mode: "edit"; child: Child } | null>(null);
  const [newCode, setNewCode] = React.useState<Child | null>(null);
  const [unlink, setUnlink] = React.useState<{ user: User; child: Child } | null>(null);
  const [archive, setArchive] = React.useState<Child | null>(null);
  const [archiveNote, setArchiveNote] = React.useState("");
  const [purge, setPurge] = React.useState<Child | null>(null);
  const archived = s.archivedChildren ?? [];

  const doArchive = async () => {
    if (!archive) return;
    const r = await run(() => api.post(`/api/admin/children/${archive.id}/archive`, { note: archiveNote.trim() }), {
      ok: `${archive.short} dipindahkan ke arsip. Orang tua tidak lagi melihat datanya.`,
    });
    setArchive(null);
    setArchiveNote("");
    if (r) await refresh();
  };
  const doRestore = async (c: Child) => {
    const r = await run(() => api.post(`/api/admin/children/${c.id}/restore`), { ok: `${c.short} aktif kembali.` });
    if (r) await refresh();
  };
  const doPurge = async () => {
    if (!purge) return;
    const r = await run(() => api.del(`/api/admin/children/${purge.id}`), { ok: `Data ${purge.short} dihapus permanen.` });
    setPurge(null);
    if (r) await refresh();
  };

  const doNewCode = async () => {
    if (!newCode) return;
    const r = await run(() => api.post<{ code: string }>(`/api/admin/children/${newCode.id}/new-code`), {
      ok: (r) => `Kode ${newCode.short} kini ${r.code}. Kode lama tidak berlaku lagi.`,
    });
    setNewCode(null);
    if (r) await refresh();
  };
  const doUnlink = async () => {
    if (!unlink) return;
    const r = await run(() => api.del(`/api/admin/links/${unlink.user.id}/${unlink.child.id}`), {
      ok: `${unlink.user.name} tidak lagi tertaut dengan ${unlink.child.short}.`,
    });
    setUnlink(null);
    if (r) await refresh();
  };

  return (
    <Panel>
      <PanelHead
        title="Anak & kode anak"
        desc="Setiap anak punya satu kode. Orang tua memasukkannya saat mendaftar atau dari Beranda, lalu dasbor anak itu terbuka untuknya."
        action={
          <Button size="sm" variant="primary" onClick={() => setDialog({ mode: "create" })}>
            <Plus size={15} /> Daftarkan anak
          </Button>
        }
      />
      <PanelBody className="pt-2">
        <TableWrap label="Anak dan kode anak">
          <table className="table min-w-[720px]">
            <thead>
              <tr>
                <th>Anak</th>
                <th>Kode</th>
                <th>Orang tua tertaut</th>
                <th>
                  <span className="sr-only">Tindakan</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {s.children.map((c) => {
                const guardians = links
                  .filter((l) => l.childId === c.id)
                  .map((l) => ({ link: l, user: users.find((u) => u.id === l.userId) }))
                  .filter((g): g is { link: (typeof links)[number]; user: User } => !!g.user);
                return (
                  <tr key={c.id}>
                    <td>
                      <div className="font-medium">{c.name}</div>
                      <div className="text-muted text-[12.5px]">
                        {c.age} · {c.room}
                        {c.caregiver ? ` · Pengasuh ${c.caregiver}` : ""}
                      </div>
                    </td>
                    <td className="whitespace-nowrap">
                      <span className="inline-flex items-center gap-1">
                        <span className="font-mono text-[13px] font-semibold">{c.code}</span>
                        <CopyButton text={c.code} label={"kode " + c.short} />
                      </span>
                    </td>
                    <td>
                      {guardians.length ? (
                        <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
                          {guardians.map(({ link, user }) => (
                            <li
                              key={user.id}
                              className="border-line bg-wash inline-flex items-center gap-1 rounded-full border py-0.5 pr-1 pl-2.5 text-[12.5px]"
                            >
                              <span title={link.linkedAt ? `Tertaut ${fmtDateShort(link.linkedAt)}` : undefined}>{user.name}</span>
                              <button
                                type="button"
                                className="text-muted hover:bg-danger-wash hover:text-danger rounded-full px-1.5 leading-none"
                                aria-label={`Lepas tautan ${user.name} dari ${c.short}`}
                                title="Lepas tautan"
                                onClick={() => setUnlink({ user, child: c })}
                              >
                                ×
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <span className="text-muted">Belum ada</span>
                      )}
                    </td>
                    <td>
                      <div className="flex justify-end gap-1.5 whitespace-nowrap">
                        <Button size="sm" variant="ghost" onClick={() => setDialog({ mode: "edit", child: c })}>
                          Ubah
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setNewCode(c)}>
                          Kode baru
                        </Button>
                        <Button size="sm" variant="ghost" className="text-muted" onClick={() => setArchive(c)}>
                          Arsipkan
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableWrap>
        <p className="text-muted mt-3 text-[12.5px] leading-relaxed">
          Sampaikan kode langsung kepada orang tua/wali yang sudah Anda kenal. Bila kode tersebar, buat kode baru: kode lama langsung hangus, sedangkan orang
          tua yang sudah tertaut tetap terhubung. Satu kode paling banyak dipakai empat akun.
        </p>
        {archived.length ? (
          <details className="border-line mt-4 rounded-lg border">
            <summary className="cursor-pointer px-4 py-2.5 text-[14px] font-semibold">
              Arsip anak <span className="text-muted font-normal">· {archived.length} anak sudah keluar</span>
            </summary>
            <div className="border-line border-t">
              <TableWrap label="Arsip anak">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Anak</th>
                      <th>Diarsipkan</th>
                      <th>Catatan</th>
                      <th>
                        <span className="sr-only">Tindakan</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {archived.map((c) => (
                      <tr key={c.id}>
                        <td>
                          <div className="font-medium">{c.name}</div>
                          <div className="text-muted text-[12.5px]">
                            {c.age} · kode {c.code}
                          </div>
                        </td>
                        <td className="text-muted text-[13px] whitespace-nowrap">{c.archivedAt ? fmtDateShort(c.archivedAt) : "—"}</td>
                        <td className="text-muted text-[13px]">{c.archivedNote || "—"}</td>
                        <td>
                          <div className="flex justify-end gap-1.5 whitespace-nowrap">
                            <Button size="sm" variant="ghost" disabled={busy} onClick={() => doRestore(c)}>
                              Pulihkan
                            </Button>
                            <Button size="sm" variant="ghost" className="text-danger" disabled={busy} onClick={() => setPurge(c)}>
                              Hapus permanen
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
              <p className="text-muted px-4 py-3 text-[12.5px] leading-relaxed">
                Anak di arsip tidak tampil di dasbor mana pun dan kodenya tidak bisa dipakai. Hapus permanen menghapus juga seluruh catatan hariannya dan tidak
                dapat dibatalkan.
              </p>
            </div>
          </details>
        ) : null}
      </PanelBody>
      <ConfirmDialog
        open={!!archive}
        title={archive ? `Arsipkan ${archive.short}?` : ""}
        desc={
          archive ? (
            <>
              <p>
                Pakai saat anak keluar dari daycare. <b>{archive.name}</b> hilang dari semua dasbor, orang tua yang tertaut tidak lagi melihat datanya, dan kode{" "}
                <b className="font-mono">{archive.code}</b> tidak berlaku. Data bisa dipulihkan kapan saja dari arsip.
              </p>
              <Field label="Catatan (opsional)" htmlFor="arc-note" className="mt-3">
                <Input
                  id="arc-note"
                  value={archiveNote}
                  onChange={(e) => setArchiveNote(e.target.value)}
                  maxLength={200}
                  placeholder="Mis. pindah kota, lulus ke TK"
                />
              </Field>
            </>
          ) : null
        }
        action="Arsipkan"
        busy={busy}
        onConfirm={doArchive}
        onClose={() => setArchive(null)}
      />
      <ConfirmDialog
        open={!!purge}
        title={purge ? `Hapus permanen data ${purge.short}?` : ""}
        desc={
          purge ? (
            <>
              Seluruh data dan catatan harian <b>{purge.name}</b> dihapus dari server dan tidak dapat dikembalikan.
            </>
          ) : null
        }
        action="Hapus permanen"
        danger
        busy={busy}
        onConfirm={doPurge}
        onClose={() => setPurge(null)}
      />
      <ChildDialog key={dialog ? (dialog.mode === "edit" ? dialog.child.id : "new") : "closed"} req={dialog} onClose={() => setDialog(null)} />
      <ConfirmDialog
        open={!!newCode}
        title={newCode ? `Kode baru untuk ${newCode.short}?` : ""}
        desc={
          newCode ? (
            <>
              Kode <b className="font-mono">{newCode.code}</b> tidak akan berlaku lagi untuk pendaftaran. Orang tua yang sudah tertaut tetap terhubung; kode
              baru perlu disampaikan hanya bila ada wali lain yang akan menautkan akun.
            </>
          ) : null
        }
        action="Buat kode baru"
        busy={busy}
        onConfirm={doNewCode}
        onClose={() => setNewCode(null)}
      />
      <ConfirmDialog
        open={!!unlink}
        title="Lepas tautan orang tua?"
        desc={
          unlink ? (
            <>
              <b>{unlink.user.name}</b> tidak lagi dapat melihat data, kamera, dan laporan <b>{unlink.child.short}</b>. Ia bisa menautkan kembali dengan kode
              anak yang berlaku.
            </>
          ) : null
        }
        action="Lepas tautan"
        danger
        busy={busy}
        onConfirm={doUnlink}
        onClose={() => setUnlink(null)}
      />
    </Panel>
  );
}

function ChildDialog({ req, onClose }: { req: { mode: "create" } | { mode: "edit"; child: Child } | null; onClose: () => void }) {
  const { state: s, refresh } = useLive();
  const { busy, run } = useAction();
  const [created, setCreated] = React.useState<{ short: string; code: string } | null>(null);
  const edit = req?.mode === "edit" ? req.child : null;
  const rooms = s.rooms.filter((r) => !/staf/i.test(r.name));
  const caregivers = (s.users ?? []).filter((u) => u.role === "caregiver" && !u.disabled);
  const emergency = edit?.emergency?.[0];

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body = {
      name: String(f.get("name") ?? "").trim(),
      short: String(f.get("short") ?? "").trim(),
      dob: String(f.get("dob") ?? ""),
      room: String(f.get("room") ?? ""),
      caregiver: String(f.get("caregiver") ?? ""),
      allergies: String(f.get("allergies") ?? "").trim(),
      meds: String(f.get("meds") ?? "").trim(),
      parentName: String(f.get("parentName") ?? "").trim(),
      emergencyName: String(f.get("emergencyName") ?? "").trim(),
      emergencyPhone: String(f.get("emergencyPhone") ?? "").trim(),
    };
    if (edit) {
      const r = await run(() => api.patch<{ child: Child }>(`/api/admin/children/${edit.id}`, body), { ok: (r) => `Data ${r.child.short} diperbarui.` });
      if (r) {
        await refresh();
        onClose();
      }
      return;
    }
    const r = await run(() => api.post<{ child: Child; code: string }>("/api/admin/children", body));
    if (r) {
      setCreated({ short: r.child.short, code: r.code });
      await refresh();
    }
  };

  return (
    <Dialog open={!!req} onOpenChange={(o) => !o && onClose()}>
      {req ? (
        created ? (
          <DialogContent title={`${created.short} terdaftar`} desc="Kode anak dibuat otomatis dan bisa dilihat kembali di tabel.">
            <CodeReveal code={created.code}>
              Sampaikan kode ini kepada orang tua/wali {created.short}. Ia memasukkannya di kolom <i>Kode anak</i> saat mendaftar, atau dari Beranda bila sudah
              punya akun.
            </CodeReveal>
            <div className="mt-4 flex justify-end">
              <Button variant="primary" onClick={onClose}>
                Selesai
              </Button>
            </div>
          </DialogContent>
        ) : (
          <DialogContent
            title={edit ? `Ubah data ${edit.short}` : "Daftarkan anak"}
            desc={edit ? "Perubahan langsung terlihat di dasbor pengasuh dan orang tua." : "Isi data dasar; kode anak dibuat otomatis setelah disimpan."}
            wide
          >
            <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
              <Field label="Nama lengkap" htmlFor="ch-name">
                <Input id="ch-name" name="name" required minLength={3} defaultValue={edit?.name ?? ""} autoComplete="off" />
              </Field>
              <Field label="Nama panggilan" htmlFor="ch-short" hint="Kosongkan untuk memakai kata pertama nama.">
                <Input id="ch-short" name="short" maxLength={40} defaultValue={edit?.short ?? ""} autoComplete="off" />
              </Field>
              <Field label="Tanggal lahir" htmlFor="ch-dob">
                <Input id="ch-dob" name="dob" type="date" required defaultValue={edit?.dob ?? ""} max={new Date().toISOString().slice(0, 10)} />
              </Field>
              <Field label="Ruang" htmlFor="ch-room">
                <Select id="ch-room" name="room" required defaultValue={edit?.room ?? rooms[0]?.name ?? ""}>
                  {rooms.map((r) => (
                    <option key={r.id} value={r.name}>
                      {r.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Pengasuh utama" htmlFor="ch-cg">
                <Select id="ch-cg" name="caregiver" defaultValue={edit?.caregiver ?? ""}>
                  <option value="">Belum ditentukan</option>
                  {caregivers.map((u) => (
                    <option key={u.id} value={u.name}>
                      {u.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Alergi" htmlFor="ch-all" hint="Kosongkan bila tidak ada.">
                <Input id="ch-all" name="allergies" maxLength={120} defaultValue={edit && edit.allergies !== "Tidak ada" ? (edit.allergies ?? "") : ""} />
              </Field>
              <Field label="Obat rutin" htmlFor="ch-meds" hint="Contoh: Vitamin D3, 2 tetes, 09.30">
                <Input id="ch-meds" name="meds" maxLength={160} defaultValue={edit?.meds ?? ""} />
              </Field>
              <Field label="Nama orang tua / wali" htmlFor="ch-parent">
                <Input id="ch-parent" name="parentName" maxLength={120} defaultValue={edit?.parentName ?? ""} autoComplete="off" />
              </Field>
              <Field label="Kontak darurat" htmlFor="ch-en">
                <Input id="ch-en" name="emergencyName" maxLength={120} placeholder="Nama (hubungan)" defaultValue={emergency?.n ?? ""} autoComplete="off" />
              </Field>
              <Field label="Nomor kontak darurat" htmlFor="ch-ep">
                <Input id="ch-ep" name="emergencyPhone" type="tel" maxLength={40} placeholder="+62 8xx" defaultValue={emergency?.p ?? ""} autoComplete="off" />
              </Field>
              <div className="mt-1 flex justify-end gap-2 sm:col-span-2">
                <Button variant="ghost" onClick={onClose}>
                  Batal
                </Button>
                <Button type="submit" variant="primary" disabled={busy}>
                  {busy ? "Menyimpan…" : edit ? "Simpan perubahan" : "Simpan & buat kode"}
                </Button>
              </div>
            </form>
          </DialogContent>
        )
      ) : null}
    </Dialog>
  );
}

/* ---- Kode undangan staf & admin ------------------------------------------------------------- */

type InviteStatus = "usable" | "inactive" | "expired" | "used";

function inviteStatus(c: InviteCode, now: Date): InviteStatus {
  if (!c.active) return "inactive";
  if (c.expiresAt && new Date(c.expiresAt) <= now) return "expired";
  if (c.maxUses !== null && c.uses >= c.maxUses) return "used";
  return "usable";
}

const STATUS_LABEL: Record<InviteStatus, { text: string; tone: "ok" | "neutral" | "warn" }> = {
  usable: { text: "Berlaku", tone: "ok" },
  inactive: { text: "Nonaktif", tone: "neutral" },
  expired: { text: "Kedaluwarsa", tone: "neutral" },
  used: { text: "Sudah dipakai", tone: "neutral" },
};

function inviteMeta(c: InviteCode): string {
  const when = c.expiresAt ? `berlaku sampai ${fmtDay(c.expiresAt)}` : "tanpa batas waktu";
  const uses = c.maxUses === null ? `dipakai ${c.uses} kali` : `${c.uses} dari ${c.maxUses} pemakaian`;
  return `${when} · ${uses}`;
}

export function InvitesPanel() {
  const { state: s, now, refresh } = useLive();
  const { busy, run } = useAction();
  const codes = s.inviteCodes ?? [];
  const [create, setCreate] = React.useState(false);
  const [revoke, setRevoke] = React.useState<InviteCode | null>(null);
  const [showHistory, setShowHistory] = React.useState(false);
  const current = codes.filter((c) => inviteStatus(c, now) === "usable");
  const history = codes.filter((c) => inviteStatus(c, now) !== "usable");
  const openEnded = current.some((c) => !c.expiresAt && c.maxUses === null);

  const doRevoke = async () => {
    if (!revoke) return;
    const r = await run(() => api.patch(`/api/admin/invites/${revoke.code}`, { active: false }), { ok: `Kode ${revoke.code} dinonaktifkan.` });
    setRevoke(null);
    if (r) await refresh();
  };

  const row = (c: InviteCode) => {
    const st = inviteStatus(c, now);
    return (
      <li key={c.code} className="border-line grid gap-2 rounded-md border px-3 py-2.5 text-[14px] sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="inline-flex items-center gap-0.5">
              <b className="font-mono text-[13.5px] tracking-wide">{c.code}</b>
              {st === "usable" ? <CopyButton text={c.code} label={"kode " + c.code} /> : null}
            </span>
            <Badge tone="accent">{ROLE_LABEL[c.role]}</Badge>
            {c.label ? <span className="text-muted truncate">{c.label}</span> : null}
          </div>
          <div className="text-muted mt-0.5 text-[12.5px]">
            {inviteMeta(c)}
            {c.usedBy.length ? <> · dipakai oleh {c.usedBy.map((u) => `${u.name} (${fmtDay(u.at)})`).join(", ")}</> : null}
            {c.createdBy ? <> · dibuat {c.createdBy}</> : null}
          </div>
        </div>
        <div className="flex items-center gap-2 sm:justify-end">
          <Badge tone={STATUS_LABEL[st].tone}>{STATUS_LABEL[st].text}</Badge>
          {st === "usable" ? (
            <Button size="sm" variant="ghost" onClick={() => setRevoke(c)} disabled={busy}>
              Nonaktifkan
            </Button>
          ) : null}
        </div>
      </li>
    );
  };

  return (
    <Panel>
      <PanelHead
        title="Kode undangan staf & admin"
        desc="Dibuat admin untuk calon pengasuh atau admin baru; dipakai sekali saat mendaftar, lalu hangus."
        action={
          <Button size="sm" variant="primary" onClick={() => setCreate(true)}>
            <Plus size={15} /> Buat kode
          </Button>
        }
      />
      <PanelBody className="grid gap-3">
        {openEnded ? (
          <Note tone="warn">
            Kode awal fasilitas berlaku tanpa batas waktu dan pemakaian. Setelah tim inti terdaftar, nonaktifkan kode itu dan buat kode berjangka untuk setiap
            staf baru.
          </Note>
        ) : null}
        {current.length ? (
          <ul className="m-0 grid list-none gap-2 p-0">{current.map(row)}</ul>
        ) : (
          <p className="border-line-strong bg-wash/60 text-muted rounded-md border border-dashed px-4 py-5 text-center text-[14px]">
            Tidak ada kode yang berlaku. Buat kode saat ada staf baru yang akan mendaftar.
          </p>
        )}
        {history.length ? (
          <div>
            <button
              type="button"
              className="text-[13px] font-semibold text-teal-800 hover:underline"
              onClick={() => setShowHistory((v) => !v)}
              aria-expanded={showHistory}
            >
              {showHistory ? "Sembunyikan riwayat" : `Riwayat kode (${history.length})`}
            </button>
            {showHistory ? <ul className="m-0 mt-2 grid list-none gap-2 p-0 opacity-80">{history.map(row)}</ul> : null}
          </div>
        ) : null}
        <ol className="text-muted m-0 grid list-decimal gap-1 pl-5 text-[12.5px] leading-relaxed">
          <li>Buat kode di sini, lalu sampaikan langsung kepada staf yang sudah Anda verifikasi.</li>
          <li>Staf membuka halaman Daftar, memilih peran yang sesuai, dan memasukkan kode itu.</li>
          <li>Kode hangus setelah pemakaian atau masa berlakunya habis; Anda bisa menonaktifkannya kapan saja.</li>
        </ol>
      </PanelBody>
      <InviteDialog key={create ? "open" : "closed"} open={create} onClose={() => setCreate(false)} />
      <ConfirmDialog
        open={!!revoke}
        title="Nonaktifkan kode undangan?"
        desc={
          revoke ? (
            <>
              Kode <b className="font-mono">{revoke.code}</b> tidak bisa dipakai lagi untuk mendaftar. Akun yang sudah dibuat dengan kode ini tidak terpengaruh.
            </>
          ) : null
        }
        action="Nonaktifkan"
        danger
        busy={busy}
        onConfirm={doRevoke}
        onClose={() => setRevoke(null)}
      />
    </Panel>
  );
}

function InviteDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { refresh } = useLive();
  const { busy, run } = useAction();
  const [created, setCreated] = React.useState<InviteCode | null>(null);
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const uses = String(f.get("maxUses"));
    const r = await run(() =>
      api.post<{ invite: InviteCode }>("/api/admin/invites", {
        role: f.get("role"),
        label: String(f.get("label") ?? "").trim(),
        days: Number(f.get("days")),
        maxUses: uses === "unlimited" ? null : Number(uses),
      }),
    );
    if (r) {
      setCreated(r.invite);
      await refresh();
    }
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      {open ? (
        created ? (
          <DialogContent title="Kode undangan dibuat" desc={`${ROLE_LABEL[created.role]} · ${inviteMeta(created)}`}>
            <CodeReveal code={created.code}>
              Sampaikan kode ini langsung kepada {created.label || "staf yang bersangkutan"}. Kode tercantum di daftar dan bisa dinonaktifkan kapan saja.
            </CodeReveal>
            <div className="mt-4 flex justify-end">
              <Button variant="primary" onClick={onClose}>
                Selesai
              </Button>
            </div>
          </DialogContent>
        ) : (
          <DialogContent title="Buat kode undangan" desc="Untuk satu orang staf atau admin baru. Kode lama tidak terpengaruh.">
            <form onSubmit={submit} className="grid gap-3">
              <Field label="Peran" htmlFor="inv-role">
                <Select id="inv-role" name="role" defaultValue="caregiver">
                  <option value="caregiver">Pengasuh</option>
                  <option value="admin">Admin daycare</option>
                </Select>
              </Field>
              <Field label="Untuk siapa" htmlFor="inv-label" hint="Opsional, mis. nama calon staf. Memudahkan penelusuran.">
                <Input id="inv-label" name="label" maxLength={80} autoComplete="off" />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Masa berlaku" htmlFor="inv-days">
                  <Select id="inv-days" name="days" defaultValue="7">
                    <option value="3">3 hari</option>
                    <option value="7">7 hari</option>
                    <option value="14">14 hari</option>
                    <option value="30">30 hari</option>
                    <option value="90">90 hari</option>
                  </Select>
                </Field>
                <Field label="Jumlah pemakaian" htmlFor="inv-uses">
                  <Select id="inv-uses" name="maxUses" defaultValue="1">
                    <option value="1">1 kali (disarankan)</option>
                    <option value="3">3 kali</option>
                    <option value="10">10 kali</option>
                    <option value="unlimited">Tanpa batas</option>
                  </Select>
                </Field>
              </div>
              <div className="mt-1 flex justify-end gap-2">
                <Button variant="ghost" onClick={onClose}>
                  Batal
                </Button>
                <Button type="submit" variant="primary" disabled={busy}>
                  {busy ? "Membuat…" : "Buat kode"}
                </Button>
              </div>
            </form>
          </DialogContent>
        )
      ) : null}
    </Dialog>
  );
}
