"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Lock } from "lucide-react";
import { api } from "@/lib/api";
import { airOverall, airTone as toneOf, AIR_LABEL, notifications, openIncidents, present, todayLog, unreadCount } from "@/lib/derive";
import { greeting, fmtDate, fmtTime, ROLE_LABEL } from "@/lib/format";
import { useAction, useLive } from "@/lib/live";
import type { Role, State } from "@/lib/types";
import { AppShell } from "./app-shell";
import { Badge, SevBadge } from "@/components/ui/badge";
import { Band, BandPill } from "@/components/ui/band";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Metric } from "@/components/ui/metric";
import { Empty, Kv, Note, Panel, PanelBody, PanelHead } from "@/components/ui/panel";
import { useToast } from "@/components/ui/toast";

const HUBS: { href: string; title: string; desc: string; roles: Role[] }[] = [
  {
    href: "/parent",
    title: "Dasbor orang tua",
    desc: "Ringkasan hari ini, aktivitas, makan, tidur, mood, foto kegiatan, pesan, kamera, dan perkembangan anak.",
    roles: ["parent", "admin"],
  },
  {
    href: "/caregiver",
    title: "Dasbor pengasuh",
    desc: "Catat aktivitas, makan, tidur, mood, kehadiran & foto; pindai piring, obat, kejadian, serah terima.",
    roles: ["caregiver", "admin"],
  },
  {
    href: "/admin",
    title: "Dashboard admin",
    desc: "Analitik perkembangan, insight & rekomendasi, akses kamera, kepercayaan orang tua, perangkat, akun, pengaturan.",
    roles: ["admin"],
  },
];

export function Hub() {
  const { state: s, now } = useLive();
  const me = s.me;
  const params = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  React.useEffect(() => {
    const denied = params.get("denied");
    if (denied) toast("Halaman " + denied + " tidak tersedia untuk peran " + ROLE_LABEL[me.role].toLowerCase() + ".", "err");
    if (params.get("welcome") === "1") toast("Selamat datang, " + me.name.split(" ")[0] + ". Akun Anda siap dipakai.", "ok");
    if (denied || params.get("welcome")) router.replace("/dashboard");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Orang tua: hanya ruang tempat anaknya berada; staf: semua ruang anak.
  const childRooms = new Set(s.children.map((c) => c.room));
  const readings = me.role === "parent" && childRooms.size ? s.air.readings.filter((r) => childRooms.has(r.room)) : s.air.readings;
  const air = airOverall(readings, s.thresholds);
  const airTone = toneOf(air.status);
  const hadir = present(s, now).length;
  const open = openIncidents(s).length;
  const roleLine =
    me.role === "parent"
      ? s.children.length
        ? "Orang tua dari " + s.children.map((c) => c.short).join(", ")
        : "Belum ada anak tertaut — masukkan kode anak di bawah."
      : ROLE_LABEL[me.role] + (me.area ? " · " + me.area : "") + (me.shift ? " · Shift " + me.shift.toLowerCase() : "");

  const activity =
    me.role === "parent"
      ? notifications(s)
          .slice(0, 6)
          .map((n) => ({ id: n.id, time: n.time, title: (n.child ? n.child.split(" ")[0] + ": " : "") + n.title, text: n.text, sev: n.sev }))
      : todayLog(s)
          .filter((e) => e.type !== "access" && e.type !== "account" && e.done !== "replaced")
          .slice(0, 6)
          .map((e) => ({
            id: e.id,
            time: fmtTime(e.at),
            title: (e.child ? e.child.split(" ")[0] + ": " : "") + e.title,
            text: e.text + " · " + e.by,
            sev: e.sev,
          }));

  return (
    <AppShell me={me} title="Beranda" unread={me.role === "parent" ? unreadCount(s) : 0}>
      <div className="mx-auto max-w-[1100px]">
        <Band
          className="mb-4"
          eyebrow={fmtDate(now)}
          title={`${greeting(now)}, ${me.name.split(" ")[0]}.`}
          desc={roleLine}
          right={
            <BandPill tone={airTone} dot>
              Udara {AIR_LABEL[air.status].toLowerCase()}
            </BandPill>
          }
        />
        {me.mustChangePassword ? (
          <Note tone="warn" className="mb-4">
            Anda masuk dengan kata sandi sementara dari admin.{" "}
            <Link href="/account#keamanan" className="font-semibold underline">
              Ganti kata sandi sekarang
            </Link>{" "}
            agar akun tetap aman.
          </Note>
        ) : null}
        {!me.emailVerified ? <VerifyNote email={me.email} channels={s.channels} /> : null}
        <div className="grid gap-3 sm:grid-cols-3">
          <Metric
            label="Anak hadir sekarang"
            value={`${hadir} dari ${s.children.length || 6}`}
            sub={me.role === "parent" ? "Anak Anda yang tertaut" : "Semua ruang"}
          />
          <Metric
            label="Udara ruang anak"
            value={AIR_LABEL[air.status]}
            tone={airTone}
            sub={air.worst ? `${air.worst.room} · CO₂ ${air.worst.co2} ppm` : "Belum ada sensor yang mengirim"}
          />
          <Metric
            label="Kejadian belum ditangani"
            value={open}
            tone={open ? "warn" : "ok"}
            sub={open ? "Perlu tindak lanjut pengasuh" : "Semua kejadian hari ini sudah ditangani"}
          />
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {HUBS.map((h) => {
            const ok = h.roles.includes(me.role);
            return ok ? (
              <Link key={h.href} href={h.href} className="panel tile group flex flex-col p-5 transition-colors hover:border-teal-600">
                <h3 className="flex items-center justify-between text-[16px]">
                  {h.title}
                  <ArrowRight size={18} className="text-teal-700 transition-transform group-hover:translate-x-0.5" />
                </h3>
                <p className="text-muted mt-2 text-[14px] leading-relaxed">{h.desc}</p>
              </Link>
            ) : (
              <div key={h.href} className="panel flex flex-col p-5 opacity-70" aria-disabled>
                <h3 className="text-ink-2 flex items-center justify-between text-[16px]">
                  {h.title}
                  <Lock size={16} className="text-faint" />
                </h3>
                <p className="text-muted mt-2 text-[13.5px]">Tidak tersedia untuk peran {ROLE_LABEL[me.role].toLowerCase()}.</p>
              </div>
            );
          })}
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <Panel>
            <PanelHead
              title={me.role === "parent" ? "Pemberitahuan terbaru" : "Aktivitas hari ini"}
              desc={me.role === "parent" ? "Catatan penting tentang anak Anda" : "Catatan terakhir dari semua pengasuh"}
            />
            <PanelBody className="pt-3">
              {activity.length ? (
                <ul className="divide-line divide-y">
                  {activity.map((a) => (
                    <li key={a.id} className="flex gap-3 py-2.5">
                      <time className="text-muted w-12 shrink-0 pt-0.5 text-[13px] tabular-nums">{a.time}</time>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px] font-semibold">
                          <span className="min-w-0 break-words">{a.title}</span>
                          {a.sev !== "low" ? <SevBadge sev={a.sev} /> : null}
                        </div>
                        <div className="text-muted text-[13.5px]">{a.text}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty>Belum ada catatan hari ini.</Empty>
              )}
            </PanelBody>
          </Panel>
          <div className="grid gap-4">
            {me.role === "parent" ? <LinkChildCard state={s} /> : null}
            <Panel>
              <PanelHead title="Fasilitas" />
              <PanelBody>
                <Kv
                  rows={[
                    ["Nama", s.facility.name],
                    ["Alamat", s.facility.address],
                    ["Telepon", s.facility.phone],
                    ["Jam buka", s.facility.hours],
                  ]}
                />
              </PanelBody>
            </Panel>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

export function LinkChildCard({ state, compact }: { state: State; compact?: boolean }) {
  const { busy, run } = useAction();
  const { refresh } = useLive();
  const router = useRouter();
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const code = String(new FormData(form).get("code") ?? "").trim();
    const r = await run(() => api.post<{ child: string }>("/api/children/link", { code }), { ok: (r) => r.child + " kini tertaut dengan akun Anda." });
    if (r) {
      form.reset();
      await refresh();
      router.refresh();
    }
  };
  return (
    <Panel>
      <PanelHead
        title={state.children.length ? "Tautkan anak lain" : "Tautkan anak Anda"}
        desc={compact ? undefined : "Kode seperti KA-2201 diberikan daycare saat anak didaftarkan. Setelah tertaut, dasbor anak langsung terbuka."}
      />
      <PanelBody>
        <form onSubmit={submit} className="flex items-end gap-2">
          <Field label="Kode anak" htmlFor="link-code" className="flex-1">
            <Input id="link-code" name="code" required minLength={4} autoCapitalize="characters" className="uppercase" placeholder="KA-0000" />
          </Field>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? "Memeriksa…" : "Tautkan"}
          </Button>
        </form>
        {state.children.length ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {state.children.map((c) => (
              <Badge key={c.id} tone="accent">
                {c.short} · {c.code}
              </Badge>
            ))}
          </div>
        ) : null}
      </PanelBody>
    </Panel>
  );
}

/** Pengingat verifikasi email: tampil sampai tautan di email dibuka. */
function VerifyNote({ email, channels }: { email: string; channels: State["channels"] }) {
  const toast = useToast();
  const [busy, setBusy] = React.useState(false);
  const resend = async () => {
    setBusy(true);
    try {
      const r = await api.post<{ message: string }>("/api/auth/verify/resend");
      toast(r.message, "ok");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Tidak dapat mengirim ulang.", "err");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Note className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <span>
        Email <b>{email}</b> belum diverifikasi.{" "}
        {channels.email
          ? "Buka tautan yang kami kirim agar pemberitahuan dan pemulihan akun sampai."
          : "Pengirim email belum diatur oleh admin, jadi tautan verifikasi belum bisa dikirim."}
      </span>
      {channels.email ? (
        <Button size="sm" onClick={resend} disabled={busy}>
          {busy ? "Mengirim…" : "Kirim ulang tautan"}
        </Button>
      ) : null}
    </Note>
  );
}
