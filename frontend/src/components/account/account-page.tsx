"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { fmtDateShort, initials, ROLE_LABEL } from "@/lib/format";
import { clearSessionToken } from "@/lib/session";
import { useAction, useHashTab, useLive } from "@/lib/live";
import type { NotifyPrefs } from "@/lib/types";
import { AppShell, type Section } from "@/components/shell/app-shell";
import { LinkChildCard } from "@/components/shell/hub";
import { PasswordInput, PasswordMeter, pwScore } from "@/components/auth/auth-forms";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input } from "@/components/ui/field";
import { Kv, Note, Panel, PanelBody, PanelHead } from "@/components/ui/panel";
import { useToast } from "@/components/ui/toast";

const SECTIONS: Section[] = [
  { id: "profil", label: "Profil" },
  { id: "keamanan", label: "Kata sandi & sesi" },
  { id: "pemberitahuan", label: "Pemberitahuan" },
  { id: "privasi", label: "Data & privasi" },
];
const IDS = SECTIONS.map((s) => s.id);

const DEFAULT_NOTIFY: NotifyPrefs = { wa: true, email: true, push: false, high: true, medium: true, low: false, daily: true };

type SessionInfo = { createdAt: string; expiresAt: string; remember: boolean; via: "cookie" | "header" };

export function AccountPage() {
  const { state: s, refresh } = useLive();
  const [tab, setTab] = useHashTab(IDS, "profil");
  const [session, setSession] = React.useState<SessionInfo | null>(null);
  React.useEffect(() => {
    let live = true;
    api
      .get<{ session: SessionInfo }>("/api/auth/me")
      .then((r) => {
        if (live) setSession(r.session);
      })
      .catch(() => {
        /* rincian sesi hanya pelengkap; bagian lain tetap berjalan */
      });
    return () => {
      live = false;
    };
  }, []);
  const me = s.me;
  return (
    <AppShell me={me} title="Akun & privasi" sections={SECTIONS} tab={tab} onTab={setTab}>
      <div className="mx-auto grid max-w-[900px] gap-4">
        <Panel>
          <PanelBody className="flex items-center gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-teal-100 text-[18px] font-bold text-teal-800">
              {initials(me.name)}
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-[20px]">{me.name}</h2>
              <p className="text-muted text-[14px]">
                {ROLE_LABEL[me.role]} · {me.email}
                {me.role === "parent" && s.children.length ? " · Orang tua dari " + s.children.map((c) => c.short).join(", ") : ""}
              </p>
            </div>
            {me.mustChangePassword ? (
              <Badge tone="warn" className="ml-auto">
                Ganti kata sandi
              </Badge>
            ) : null}
          </PanelBody>
        </Panel>
        {me.mustChangePassword && tab !== "keamanan" ? (
          <Note tone="warn">
            Kata sandi Anda diatur ulang oleh admin.{" "}
            <button type="button" className="font-semibold underline" onClick={() => setTab("keamanan")}>
              Ganti kata sandi sekarang
            </button>
            .
          </Note>
        ) : null}
        {tab === "profil" ? <Profile /> : null}
        {tab === "keamanan" ? <Security session={session} /> : null}
        {tab === "pemberitahuan" ? <Notify /> : null}
        {tab === "privasi" ? <Privacy onRefresh={refresh} /> : null}
      </div>
    </AppShell>
  );
}

function Profile() {
  const { state: s, refresh } = useLive();
  const { busy, run } = useAction();
  const router = useRouter();
  const me = s.me;
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const r = await run(() => api.patch("/api/account", { name: String(f.get("name")).trim(), phone: String(f.get("phone") ?? "").trim() }), {
      ok: "Profil tersimpan.",
    });
    if (r) {
      await refresh();
      router.refresh();
    }
  };
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <Panel>
        <PanelHead title="Profil" />
        <PanelBody>
          <form onSubmit={submit} className="grid gap-3" key={me.name + me.phone}>
            <Field label="Nama lengkap" htmlFor="p-name">
              <Input id="p-name" name="name" defaultValue={me.name} required minLength={3} />
            </Field>
            <Field label="Email" htmlFor="p-email" hint="Email tidak dapat diubah sendiri; hubungi admin daycare.">
              <Input id="p-email" value={me.email} disabled />
            </Field>
            <Field label="Nomor WhatsApp" htmlFor="p-phone">
              <Input id="p-phone" name="phone" defaultValue={me.phone} type="tel" inputMode="tel" />
            </Field>
            {me.area ? <Kv rows={[["Area tugas", me.area], ...(me.shift ? ([["Shift", me.shift]] as [string, string][]) : [])]} className="mt-1" /> : null}
            <div>
              <Button type="submit" variant="primary" disabled={busy}>
                {busy ? "Menyimpan…" : "Simpan profil"}
              </Button>
            </div>
          </form>
        </PanelBody>
      </Panel>
      {me.role === "parent" ? (
        <div className="grid content-start gap-4">
          <Panel>
            <PanelHead title="Anak yang tertaut" />
            <PanelBody>
              {s.children.length ? (
                <ul className="divide-line divide-y">
                  {s.children.map((c) => (
                    <li key={c.id} className="flex items-center justify-between py-2 text-[14px]">
                      <span>
                        <b>{c.name}</b>
                        <span className="text-muted ml-2">{c.age}</span>
                      </span>
                      <span className="text-muted font-mono text-[12.5px]">{c.code}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted text-[14px]">Belum ada anak tertaut.</p>
              )}
            </PanelBody>
          </Panel>
          <LinkChildCard state={s} compact />
        </div>
      ) : (
        <Panel>
          <PanelHead title="Akun staf" />
          <PanelBody>
            <Kv
              rows={[
                ["Peran", ROLE_LABEL[me.role]],
                ["Fasilitas", s.facility.name],
                ["Dibuat", fmtDateShort(me.createdAt)],
              ]}
            />
          </PanelBody>
        </Panel>
      )}
    </div>
  );
}

function Security({ session }: { session: SessionInfo | null }) {
  const { busy, run } = useAction();
  const { refresh } = useLive();
  const router = useRouter();
  const toast = useToast();
  const [pw, setPw] = React.useState("");
  const [cur, setCur] = React.useState("");
  const [conf, setConf] = React.useState("");
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (pwScore(pw) < 2) {
      toast("Kata sandi baru terlalu lemah.", "err");
      return;
    }
    if (pw !== conf) {
      toast("Konfirmasi kata sandi tidak sama.", "err");
      return;
    }
    const r = await run(() => api.post<{ closedSessions: number }>("/api/account/password", { current: cur, new: pw }), {
      ok: (r) => `Kata sandi diganti. ${r.closedSessions} sesi lain ditutup.`,
    });
    if (r) {
      setPw("");
      setCur("");
      setConf("");
      await refresh();
      router.refresh();
    }
  };
  const logoutAll = async () => {
    await run(() => api.post<{ closed: number }>("/api/auth/logout-all"), { ok: (r) => `${r.closed} sesi lain ditutup. Sesi ini tetap berjalan.` });
  };
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <Panel>
        <PanelHead title="Ganti kata sandi" desc="Sesi di perangkat lain akan ditutup otomatis." />
        <PanelBody>
          <form onSubmit={submit} className="grid gap-3">
            <Field label="Kata sandi saat ini" htmlFor="s-cur">
              <PasswordInput id="s-cur" name="current" autoComplete="current-password" value={cur} onChange={setCur} />
            </Field>
            <Field label="Kata sandi baru" htmlFor="s-new">
              <PasswordInput id="s-new" name="new" autoComplete="new-password" value={pw} onChange={setPw} minLength={8} />
              <PasswordMeter pw={pw} />
            </Field>
            <Field label="Ulangi kata sandi baru" htmlFor="s-conf">
              <PasswordInput id="s-conf" name="confirm" autoComplete="new-password" value={conf} onChange={setConf} minLength={8} />
            </Field>
            <div>
              <Button type="submit" variant="primary" disabled={busy}>
                {busy ? "Menyimpan…" : "Ganti kata sandi"}
              </Button>
            </div>
          </form>
        </PanelBody>
      </Panel>
      <Panel>
        <PanelHead title="Sesi masuk" />
        <PanelBody>
          <Kv
            rows={[
              ["Masuk sejak", session ? fmtDateShort(session.createdAt) : "—"],
              ["Berakhir", session ? fmtDateShort(session.expiresAt) : "—"],
              ["Ingat saya", session ? (session.remember ? "Ya, 30 hari" : "Tidak, 12 jam") : "—"],
            ]}
          />
          <p className="text-muted mt-4 text-[13px] leading-relaxed">
            {session?.via === "header"
              ? "Di peramban ini sesi disimpan di penyimpanan situs (cookie tidak diteruskan ke server) dan tetap berakhir otomatis. "
              : "Sesi disimpan di cookie yang tidak bisa dibaca skrip halaman dan berakhir otomatis. "}
            Masuk lima kali gagal berturut-turut mengunci akun 15 menit.
          </p>
          <Button className="mt-4" onClick={logoutAll} disabled={busy}>
            Keluar dari semua perangkat lain
          </Button>
        </PanelBody>
      </Panel>
    </div>
  );
}

function Notify() {
  const { state: s, patch } = useLive();
  const toast = useToast();
  const prefs: NotifyPrefs = { ...DEFAULT_NOTIFY, ...(s.prefs.notify ?? {}) };
  const set = async (k: keyof NotifyPrefs, v: boolean) => {
    const next = { ...prefs, [k]: v };
    patch((st) => ({ ...st, prefs: { ...st.prefs, notify: next } }));
    try {
      await api.put("/api/prefs/notify", { value: next });
    } catch {
      toast("Preferensi belum tersimpan. Coba lagi.", "err");
    }
  };
  const isParent = s.me.role === "parent";
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel>
        <PanelHead title="Saluran" desc="Tersimpan otomatis." />
        <PanelBody className="grid gap-3">
          <Checkbox
            label={
              <>
                WhatsApp <span className="text-muted">— {s.me.phone || "nomor belum diisi"}</span>
              </>
            }
            checked={prefs.wa}
            onChange={(e) => set("wa", e.target.checked)}
          />
          <Checkbox
            label={
              <>
                Email <span className="text-muted">— {s.me.email}</span>
                {!s.me.emailVerified ? <span className="text-warn-ink"> · belum diverifikasi</span> : null}
              </>
            }
            checked={prefs.email}
            onChange={(e) => set("email", e.target.checked)}
          />
          <Checkbox label="Pemberitahuan peramban di perangkat ini" checked={false} disabled onChange={() => undefined} />
          <p className="text-muted -mt-1 text-[12.5px]">Pemberitahuan peramban belum tersedia di versi ini; pakai WhatsApp atau email.</p>
          {!s.channels.wa && !s.channels.email ? (
            <p className="text-warn-ink text-[12.5px]">
              Pengirim WhatsApp dan email belum diatur oleh admin daycare, jadi pesan belum terkirim ke luar aplikasi.
            </p>
          ) : (
            <p className="text-muted text-[12.5px]">
              {s.channels.wa ? "WhatsApp aktif" : "WhatsApp belum diatur admin"} · {s.channels.email ? "email aktif" : "email belum diatur admin"}.
            </p>
          )}
        </PanelBody>
      </Panel>
      <Panel>
        <PanelHead title={isParent ? "Yang ingin saya terima" : "Yang ingin saya terima"} />
        <PanelBody className="grid gap-3">
          <Checkbox
            label={
              <>
                <b>Penting</b> — kejadian, suhu tinggi, alergi
              </>
            }
            checked={prefs.high}
            onChange={(e) => set("high", e.target.checked)}
          />
          <Checkbox
            label={
              <>
                <b>Perhatian</b> — suhu sedikit di atas normal, obat diberikan
              </>
            }
            checked={prefs.medium}
            onChange={(e) => set("medium", e.target.checked)}
          />
          <Checkbox
            label={
              <>
                <b>Info</b> — tiba, pulang, catatan pengasuh
              </>
            }
            checked={prefs.low}
            onChange={(e) => set("low", e.target.checked)}
          />
          <Checkbox label="Ringkasan harian pukul 17.30" checked={prefs.daily} onChange={(e) => set("daily", e.target.checked)} />
          <p className="text-muted text-[12.5px]">Pemberitahuan penting tetap tampil di dasbor meskipun saluran dimatikan.</p>
        </PanelBody>
      </Panel>
    </div>
  );
}

function Privacy({ onRefresh }: { onRefresh: () => Promise<void> }) {
  const { state: s } = useLive();
  const { busy, run } = useAction();
  const [confirm, setConfirm] = React.useState(false);
  const me = s.me;
  const del = async () => {
    const r = await run(() => api.del("/api/account"), { ok: "Akun Anda dihapus." });
    if (r) {
      clearSessionToken();
      window.location.assign("/");
    } else await onRefresh();
  };
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel>
        <PanelHead title="Data & privasi" />
        <PanelBody className="text-ink-2 grid gap-3 text-[14px] leading-relaxed">
          <p>
            Anda dapat membaca cara kami menyimpan dan menghapus data di{" "}
            <Link href="/help#privasi" className="font-semibold text-teal-800 hover:underline">
              Kebijakan Privasi
            </Link>
            .
          </p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>Rekaman kamera dihapus setelah {s.thresholds.retentionDays} hari.</li>
            <li>Foto piring makan dihapus setelah 3 hari; angka gizinya tetap tersimpan di catatan.</li>
            <li>Riwayat siapa yang membuka kamera anak Anda dapat diminta ke admin daycare.</li>
          </ul>
          <p>
            Permintaan salinan atau penghapusan data anak diajukan lewat{" "}
            <Link href="/help" className="font-semibold text-teal-800 hover:underline">
              halaman bantuan
            </Link>
            ; diproses paling lambat 7 hari.
          </p>
        </PanelBody>
      </Panel>
      <Panel>
        <PanelHead title="Hapus akun" />
        <PanelBody>
          {me.seed ? (
            <p className="text-muted text-[14px]">Akun ini merupakan akun contoh fasilitas dan tidak dapat dihapus dari sini. Hubungi admin daycare.</p>
          ) : (
            <>
              <p className="text-muted text-[14px]">
                Menghapus akun menutup semua sesi dan melepas tautan anak. Catatan harian anak tetap tersimpan di daycare.
              </p>
              {confirm ? (
                <Note tone="danger" className="mt-3">
                  Yakin ingin menghapus akun {me.email}?
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" variant="danger" onClick={del} disabled={busy}>
                      Ya, hapus akun saya
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>
                      Batal
                    </Button>
                  </div>
                </Note>
              ) : (
                <Button variant="danger" className="mt-3" onClick={() => setConfirm(true)}>
                  Hapus akun
                </Button>
              )}
            </>
          )}
        </PanelBody>
      </Panel>
    </div>
  );
}
