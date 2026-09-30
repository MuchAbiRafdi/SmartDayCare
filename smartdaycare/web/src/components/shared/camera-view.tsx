"use client";
import * as React from "react";
import Image from "next/image";
import { api } from "@/lib/api";
import { airLine, airStatus, airTone, AIR_LABEL } from "@/lib/derive";
import { useLive } from "@/lib/live";
import { cn, fmtTime } from "@/lib/format";
import { getSessionToken } from "@/lib/session";
import type { Camera, Child } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Clock } from "@/components/site/clock";

type NBox = { x: number; y: number; w: number; h: number };

/* Posisi anak pada gambar contoh tiap ruang (koordinat ternormalisasi). Anak lain diburamkan pada
   tampilan orang tua; anak sendiri diberi penanda nama. Hanya berlaku untuk gambar contoh. */
const SUBJECTS: Record<NonNullable<Camera["mode"]>, NBox[]> = {
  play: [
    { x: 0.14, y: 0.4, w: 0.16, h: 0.4 },
    { x: 0.45, y: 0.36, w: 0.14, h: 0.38 },
    { x: 0.7, y: 0.42, w: 0.15, h: 0.38 },
  ],
  sleep: [
    { x: 0.12, y: 0.5, w: 0.3, h: 0.22 },
    { x: 0.56, y: 0.47, w: 0.32, h: 0.22 },
  ],
  dine: [
    { x: 0.16, y: 0.42, w: 0.15, h: 0.36 },
    { x: 0.43, y: 0.38, w: 0.14, h: 0.36 },
    { x: 0.68, y: 0.42, w: 0.15, h: 0.36 },
  ],
};

const SNAPSHOT_EVERY_MS = 3000;

/** Foto berkala dari kamera terdaftar: diambil ulang tiap 3 detik dengan kredensial sesi. */
function SnapshotFeed({ src, alt, onStamp }: { src: string; alt: string; onStamp: (iso: string | null) => void }) {
  const [url, setUrl] = React.useState<string | null>(null);
  React.useEffect(() => {
    let live = true;
    let current: string | null = null;
    let timer = 0;
    const tick = async () => {
      try {
        const res = await fetch(src + "?t=" + Date.now(), {
          credentials: "same-origin",
          cache: "no-store",
          headers: getSessionToken() ? { "X-Session": getSessionToken() ?? "" } : {},
        });
        if (!live) return;
        if (res.ok) {
          const b = await res.blob();
          if (!live) return;
          const next = URL.createObjectURL(b);
          if (current) URL.revokeObjectURL(current);
          current = next;
          setUrl(next);
          onStamp(res.headers.get("X-Snapshot-At"));
        } else {
          onStamp(null);
        }
      } catch {
        if (live) onStamp(null);
      }
      if (live) timer = window.setTimeout(tick, SNAPSHOT_EVERY_MS);
    };
    void tick();
    return () => {
      live = false;
      window.clearTimeout(timer);
      if (current) URL.revokeObjectURL(current);
    };
  }, [src, onStamp]);
  if (!url) return <div className="bg-ink/90 absolute inset-0" aria-hidden />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={alt} className="absolute inset-0 h-full w-full object-cover" decoding="async" />;
}

/** Siaran HLS (MediaMTX/go2rtc). Safari memutar HLS langsung; peramban lain lewat hls.js (dimuat saat perlu). */
function HlsFeed({ src, onState }: { src: string; onState: (s: "loading" | "playing" | "error") => void }) {
  const ref = React.useRef<HTMLVideoElement>(null);
  React.useEffect(() => {
    const video = ref.current;
    if (!video) return;
    let destroyed = false;
    let hls: { destroy: () => void } | null = null;
    onState("loading");
    const onPlaying = () => onState("playing");
    const onError = () => onState("error");
    video.addEventListener("playing", onPlaying);
    video.addEventListener("error", onError);
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src;
      video.play().catch(() => undefined);
    } else {
      import("hls.js/light")
        .then(({ default: Hls }) => {
          if (destroyed || !Hls.isSupported()) {
            if (!destroyed) onState("error");
            return;
          }
          const h = new Hls({
            lowLatencyMode: true,
            liveSyncDurationCount: 2,
            xhrSetup: (xhr) => {
              xhr.setRequestHeader("X-Requested-With", "SmartDaycare");
              const tok = getSessionToken();
              if (tok) xhr.setRequestHeader("X-Session", tok);
            },
          });
          hls = h;
          h.on(Hls.Events.ERROR, (_e, data) => {
            if (data.fatal) onState("error");
          });
          h.loadSource(src);
          h.attachMedia(video);
          h.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => undefined));
        })
        .catch(() => onState("error"));
    }
    return () => {
      destroyed = true;
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("error", onError);
      hls?.destroy();
      video.removeAttribute("src");
      video.load();
    };
  }, [src, onState]);
  return <video ref={ref} className="absolute inset-0 h-full w-full bg-black object-contain" muted playsInline autoPlay controls={false} />;
}

export function CameraView({
  cam,
  child,
  present,
  viewer,
  className,
}: {
  cam: Camera;
  child?: Child | null;
  present?: boolean;
  viewer: "parent" | "staff";
  className?: string;
}) {
  const { state } = useLive();
  const air = state.air.readings.find((r) => r.room === cam.room);
  const st = air ? airStatus(air, state.thresholds) : null;
  const sample = cam.source === "builtin";
  const subjects = sample && cam.mode && cam.id !== "K4" ? SUBJECTS[cam.mode] : [];
  const ownIndex = viewer === "parent" && child && child.room === cam.room && present ? 1 : -1;
  const [stamp, setStamp] = React.useState<string | null>(cam.at);
  const [streamState, setStreamState] = React.useState<"loading" | "playing" | "error">("loading");
  const onStamp = React.useCallback((iso: string | null) => setStamp(iso), []);
  const onState = React.useCallback((s: "loading" | "playing" | "error") => setStreamState(s), []);

  // catatan akses: sekali per kamera per pemasangan komponen
  const logged = React.useRef<string>("");
  React.useEffect(() => {
    if (logged.current === cam.id) return;
    logged.current = cam.id;
    api.post("/api/camera-view", { camId: cam.id }).catch(() => undefined);
  }, [cam.id]);

  const view = sample ? "image" : cam.view;
  const offline = !sample && (!cam.online || (view === "snapshot" && !cam.img));
  const caption = sample
    ? "Gambar contoh · kamera belum dipasang"
    : view === "snapshot"
      ? stamp
        ? "Foto terakhir " + fmtTime(stamp)
        : "Menunggu foto dari kamera"
      : streamState === "playing"
        ? "Siaran langsung"
        : streamState === "error"
          ? "Siaran tidak dapat diputar"
          : "Menghubungkan siaran…";

  return (
    <figure className={cn("overflow-hidden rounded-[14px] border border-[#243046] bg-[#111a2e]", className)}>
      <div className="relative aspect-[4/3] w-full select-none">
        {sample && cam.img ? (
          <Image
            src={cam.img}
            alt={"Gambar contoh " + cam.label + ", " + cam.room}
            fill
            sizes="(max-width: 768px) 100vw, 720px"
            className="object-cover"
            priority={false}
          />
        ) : null}
        {!sample && view === "snapshot" && cam.img ? <SnapshotFeed src={cam.img} alt={"Foto " + cam.label + ", " + cam.room} onStamp={onStamp} /> : null}
        {!sample && view === "hls" && cam.stream ? <HlsFeed src={cam.stream} onState={onState} /> : null}
        {!sample && (view === "mjpeg" || view === "image") && cam.stream ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cam.stream}
            alt={"Siaran " + cam.label + ", " + cam.room}
            className="absolute inset-0 h-full w-full object-cover"
            onLoad={() => setStreamState("playing")}
            onError={() => setStreamState("error")}
          />
        ) : null}
        {offline || (!sample && view !== "snapshot" && streamState === "error") ? (
          <div className="bg-ink/85 absolute inset-0 grid place-items-center p-6 text-center text-white">
            <div>
              <div className="text-[15px] font-semibold">{cam.online ? "Siaran tidak dapat diputar" : "Kamera terputus"}</div>
              <p className="mt-1 text-[13px] text-white/75">
                {cam.online
                  ? "Periksa alamat siaran di menu Perangkat."
                  : cam.at
                    ? "Kiriman terakhir " + fmtTime(cam.at) + ". Periksa daya dan jaringan kamera."
                    : "Kamera belum pernah mengirim gambar."}
              </p>
            </div>
          </div>
        ) : null}
        {subjects.map((b, i) => {
          const own = i === ownIndex;
          const blur = viewer === "parent" && !own;
          return (
            <div
              key={i}
              className={cn("absolute rounded-lg", blur ? "overlay-blur bg-white/10" : own ? "border-2 border-teal-300" : "border border-white/40")}
              style={{ left: b.x * 100 + "%", top: b.y * 100 + "%", width: b.w * 100 + "%", height: b.h * 100 + "%" }}
              aria-hidden
            >
              {own ? <span className="text-ink absolute -top-6 left-0 rounded bg-teal-300 px-1.5 py-0.5 text-[11px] font-bold">{child?.short}</span> : null}
              {blur ? <span className="bg-ink/70 absolute bottom-1 left-1 rounded px-1 text-[10px] text-white/90">diburamkan</span> : null}
            </div>
          );
        })}
        <div className="absolute top-3 left-3 flex items-center gap-2">
          <span className="bg-ink/75 rounded-md px-2 py-1 text-[12px] font-semibold text-white">
            {cam.label} · {cam.room}
          </span>
        </div>
        <div className="bg-ink/75 absolute bottom-3 left-3 flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] text-white tabular-nums">
          {!sample && cam.online && !offline ? (
            <span className={cn("h-1.5 w-1.5 rounded-full", streamState === "error" && view !== "snapshot" ? "bg-warn" : "bg-ok")} aria-hidden />
          ) : null}
          {caption}
          {sample ? (
            <>
              {" · "}
              <Clock />
            </>
          ) : null}
        </div>
        {!cam.parents ? <div className="bg-danger/90 absolute top-3 right-3 rounded-md px-2 py-1 text-[11.5px] font-semibold text-white">Area staf</div> : null}
      </div>
      <figcaption className="flex flex-wrap items-center justify-between gap-2 border-t border-white/12 px-3 py-2 text-[12.5px] text-white/80">
        <span>{airLine(air)}</span>
        {st ? (
          <Badge tone={airTone(st)} dot>
            Udara {AIR_LABEL[st].toLowerCase()}
          </Badge>
        ) : null}
      </figcaption>
    </figure>
  );
}
