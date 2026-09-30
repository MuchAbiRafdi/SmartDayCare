"use client";
import * as React from "react";
import { cn } from "@/lib/format";

/* Lebar nyata wadah diagram. SVG digambar dengan viewBox selebar piksel sebenarnya sehingga
   teks tetap terbaca di layar sempit maupun lebar (bukan diskalakan ikut lebar panel).
   Render pertama (server) memakai lebar cadangan agar hidrasi cocok, lalu diukur ulang. */
export function useMeasuredWidth(fallback: number): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = React.useState(fallback);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const apply = () => {
      const w = Math.round(el.getBoundingClientRect().width);
      if (w > 0) setWidth(w);
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

/** Diagram batang mingguan (SVG murni, tanpa pustaka). */
export function WeeklyBars({
  values,
  labels,
  todayIndex = 6,
  unit = "kkal",
  className,
}: {
  values: number[];
  labels: string[];
  todayIndex?: number;
  unit?: string;
  className?: string;
}) {
  const max = Math.max(1, ...values);
  const [ref, W] = useMeasuredWidth(420);
  const H = 150;
  const pad = 22;
  const bw = (W - pad * 2) / values.length;
  return (
    <div ref={ref} className={cn("w-full", className)}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        height={H}
        className="block h-auto w-full"
        role="img"
        aria-label={"Energi makan siang 7 hari terakhir: " + values.map((v, i) => labels[i] + " " + v + " " + unit).join(", ")}
      >
        {values.map((v, i) => {
          const h = v ? Math.max(4, ((H - 40) * v) / max) : 0;
          const x = pad + i * bw + bw * 0.2;
          const y = H - 24 - h;
          const today = i === todayIndex;
          return (
            <g key={i}>
              {v ? (
                <rect x={x} y={y} width={bw * 0.6} height={h} rx="4" fill={today ? "#0B5F59" : "#BFE3DD"} />
              ) : (
                <rect x={x} y={H - 28} width={bw * 0.6} height={4} rx="2" fill="#E3E8E6" />
              )}
              <text x={x + bw * 0.3} y={H - 8} textAnchor="middle" fontSize="11" fill={today ? "#0B5F59" : "#5F6A6E"} fontWeight={today ? 700 : 500}>
                {labels[i]}
              </text>
              {v ? (
                <text x={x + bw * 0.3} y={y - 5} textAnchor="middle" fontSize="10.5" fill="#3B4247">
                  {v}
                </text>
              ) : (
                <text x={x + bw * 0.3} y={H - 34} textAnchor="middle" fontSize="10" fill="#8A9498">
                  libur
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

const ROOM_COLORS = ["#0B5F59", "#12A48F", "#B45309", "#5F6A6E"];

/** Grafik garis CO₂ per ruang dengan garis ambang. */
export function Co2Lines({ series, threshold, className }: { series: { room: string; values: number[] }[]; threshold: number; className?: string }) {
  const [ref, W] = useMeasuredWidth(640);
  const H = W < 480 ? 190 : 220;
  const padL = 44;
  const padR = 12;
  const padT = 14;
  const padB = 26;
  const all = series.flatMap((s) => s.values);
  const max = Math.max(threshold * 1.1, ...all) + 20;
  const min = Math.max(300, Math.min(...all) - 40);
  const n = Math.max(2, ...series.map((s) => s.values.length));
  const x = (i: number) => padL + (i * (W - padL - padR)) / (n - 1);
  const y = (v: number) => padT + ((max - v) * (H - padT - padB)) / (max - min);
  const ticks = [min, (min + max) / 2, max].map((v) => Math.round(v / 50) * 50);
  return (
    <div ref={ref} className={cn("w-full", className)}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        height={H}
        className="block h-auto w-full"
        role="img"
        aria-label={"CO₂ per ruang, 12 pembacaan terakhir. Ambang " + threshold + " ppm."}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="#E4E8E6" />
            <text x={padL - 6} y={y(t) + 4} textAnchor="end" fontSize="11" fill="#8A9498">
              {t}
            </text>
          </g>
        ))}
        <line x1={padL} x2={W - padR} y1={y(threshold)} y2={y(threshold)} stroke="#B91C1C" strokeDasharray="5 5" />
        <text x={W - padR} y={y(threshold) - 5} textAnchor="end" fontSize="11" fill="#B91C1C">
          Ambang {threshold} ppm
        </text>
        {series.map((s, si) => {
          const pts = s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ");
          const last = s.values[s.values.length - 1];
          return (
            <g key={s.room}>
              <polyline points={pts} fill="none" stroke={ROOM_COLORS[si % ROOM_COLORS.length]} strokeWidth="2" strokeLinejoin="round" />
              <circle cx={x(s.values.length - 1)} cy={y(last)} r="3.5" fill={ROOM_COLORS[si % ROOM_COLORS.length]} />
            </g>
          );
        })}
        <text x={padL} y={H - 8} fontSize="11" fill="#8A9498">
          12 pembacaan terakhir
        </text>
        <text x={W - padR} y={H - 8} textAnchor="end" fontSize="11" fill="#8A9498">
          sekarang
        </text>
      </svg>
      <ul className="text-ink-2 mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px]">
        {series.map((s, si) => (
          <li key={s.room} className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: ROOM_COLORS[si % ROOM_COLORS.length] }} aria-hidden />
            {s.room} · <b className="tabular-nums">{s.values[s.values.length - 1]}</b> ppm
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---- Diagram untuk dasbor analitik (Tema 4) --------------------------------------------- */

const AXIS = "#9098ad";
const GRID = "#e6e9f2";

function niceMax(v: number, step = 5): number {
  if (v <= 0) return step;
  return Math.ceil(v / step) * step;
}

/** Batang harian dengan label nilai pada batang tertinggi/terpilih. */
export function BarChart({
  values,
  labels,
  color = "var(--accent)",
  highlight,
  unit = "",
  step = 5,
  height = 170,
  className,
  ariaLabel,
}: {
  values: number[];
  labels: string[];
  color?: string;
  highlight?: number;
  unit?: string;
  step?: number;
  height?: number;
  className?: string;
  ariaLabel: string;
}) {
  const [ref, W] = useMeasuredWidth(420);
  const H = height;
  const padL = 28;
  const padB = 22;
  const padT = 22;
  const max = niceMax(Math.max(...values, 1), step);
  const bw = (W - padL - 8) / Math.max(1, values.length);
  const ticks = [0, max / 2, max];
  const hi = highlight ?? values.indexOf(Math.max(...values));
  return (
    <div ref={ref} className={cn("w-full", className)}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block h-auto w-full" role="img" aria-label={ariaLabel}>
        {ticks.map((t) => {
          const y = padT + (H - padT - padB) * (1 - t / max);
          return (
            <g key={t}>
              <line x1={padL} x2={W - 4} y1={y} y2={y} stroke={GRID} />
              <text x={padL - 6} y={y + 4} textAnchor="end" fontSize="11" fill={AXIS}>
                {t}
              </text>
            </g>
          );
        })}
        {values.map((v, i) => {
          const h = v ? Math.max(3, ((H - padT - padB) * v) / max) : 0;
          const x = padL + i * bw + bw * 0.25;
          const y = H - padB - h;
          const active = i === hi && v > 0;
          return (
            <g key={i}>
              <rect x={x} y={y} width={bw * 0.5} height={h} rx={5} fill={color} opacity={active ? 1 : 0.55} />
              {active ? (
                <g>
                  <rect x={x + bw * 0.25 - 34} y={Math.max(0, y - 22)} width={68} height={18} rx={6} fill="#1b2340" />
                  <text x={x + bw * 0.25} y={Math.max(0, y - 22) + 12.5} textAnchor="middle" fontSize="11" fontWeight="600" fill="#fff">
                    {String(v).replace(".", ",")} {unit}
                  </text>
                </g>
              ) : null}
              <text x={x + bw * 0.25} y={H - 6} textAnchor="middle" fontSize="11" fill={AXIS}>
                {labels[i]}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** Garis tren mood 1–5 dengan penanda emoji pada sumbu Y. */
export function MoodLine({
  values,
  labels,
  className,
  height = 170,
  ariaLabel,
}: {
  values: (number | null)[];
  labels: string[];
  className?: string;
  height?: number;
  ariaLabel: string;
}) {
  const [ref, W] = useMeasuredWidth(420);
  const H = height;
  const padL = 34;
  const padB = 22;
  const padT = 14;
  const n = values.length;
  const xs = (i: number) => padL + ((W - padL - 12) * (i + 0.5)) / n;
  const ys = (v: number) => padT + (H - padT - padB) * (1 - (v - 1) / 4);
  const pts = values.map((v, i) => (v == null ? null : ([xs(i), ys(v)] as const)));
  // Garis utuh menghubungkan hari yang punya catatan; hari tanpa catatan (libur) dilewati,
  // dan ruas yang melompati hari kosong digambar putus-putus.
  let d = "";
  let gapD = "";
  let prev: readonly [number, number] | null = null;
  let gap = false;
  pts.forEach((p) => {
    if (!p) {
      gap = !!prev;
      return;
    }
    if (!prev) d += `M${p[0]},${p[1]}`;
    else {
      const cx = (prev[0] + p[0]) / 2;
      const seg = ` C${cx},${prev[1]} ${cx},${p[1]} ${p[0]},${p[1]}`;
      if (gap) {
        gapD += `M${prev[0]},${prev[1]}${seg}`;
        d += `M${p[0]},${p[1]}`;
      } else d += seg;
    }
    prev = p;
    gap = false;
  });
  const marks: [number, string][] = [
    [5, "😄"],
    [3, "😐"],
    [1, "😠"],
  ];
  return (
    <div ref={ref} className={cn("w-full", className)}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block h-auto w-full" role="img" aria-label={ariaLabel}>
        {[1, 2, 3, 4, 5].map((t) => (
          <line key={t} x1={padL} x2={W - 6} y1={ys(t)} y2={ys(t)} stroke={GRID} />
        ))}
        {marks.map(([v, e]) => (
          <text key={v} x={8} y={ys(v) + 5} fontSize="14">
            {e}
          </text>
        ))}
        {gapD ? <path d={gapD} fill="none" stroke="#22c55e" strokeWidth="2" strokeDasharray="4 5" strokeLinecap="round" opacity="0.7" /> : null}
        {d ? <path d={d} fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" /> : null}
        {pts.map((p, i) =>
          p ? (
            <g key={i}>
              <circle cx={p[0]} cy={p[1]} r={5} fill="#fff" stroke="#22c55e" strokeWidth="2.5" />
            </g>
          ) : null,
        )}
        {labels.map((l, i) => (
          <text key={i} x={xs(i)} y={H - 6} textAnchor="middle" fontSize="11" fill={AXIS}>
            {l}
          </text>
        ))}
      </svg>
    </div>
  );
}

/** Batang bertumpuk (mis. porsi makan per waktu makan). */
export function StackedBars({
  series,
  labels,
  height = 150,
  max,
  className,
  ariaLabel,
}: {
  series: { key: string; label: string; color: string; values: number[] }[];
  labels: string[];
  height?: number;
  max?: number;
  className?: string;
  ariaLabel: string;
}) {
  const [ref, W] = useMeasuredWidth(420);
  const H = height;
  const padB = 20;
  const padT = 8;
  const n = labels.length;
  const totals = labels.map((_, i) => series.reduce((a, s) => a + (s.values[i] || 0), 0));
  const M = max ?? Math.max(1, ...totals);
  const bw = (W - 8) / n;
  return (
    <div ref={ref} className={cn("w-full", className)}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block h-auto w-full" role="img" aria-label={ariaLabel}>
        {labels.map((l, i) => {
          let y = H - padB;
          const x = 4 + i * bw + bw * 0.28;
          return (
            <g key={i}>
              {series.map((s) => {
                const v = s.values[i] || 0;
                const h = ((H - padB - padT) * v) / M;
                y -= h;
                return v ? <rect key={s.key} x={x} y={y} width={bw * 0.44} height={Math.max(0, h - 1.5)} rx={3} fill={s.color} /> : null;
              })}
              <text x={x + bw * 0.22} y={H - 5} textAnchor="middle" fontSize="11" fill={AXIS}>
                {l}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11.5px]">
        {series.map((s) => (
          <span key={s.key} className="text-muted inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} /> {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Beberapa garis pada satu bidang (distribusi jenis aktivitas per hari). */
export function MultiLine({
  series,
  labels,
  height = 200,
  step = 1,
  className,
  ariaLabel,
}: {
  series: { key: string; label: string; color: string; values: number[] }[];
  labels: string[];
  height?: number;
  step?: number;
  className?: string;
  ariaLabel: string;
}) {
  const [ref, W] = useMeasuredWidth(520);
  const H = height;
  const padL = 26;
  const padB = 22;
  const padT = 10;
  const n = labels.length;
  const M = niceMax(Math.max(1, ...series.flatMap((s) => s.values)), step);
  const xs = (i: number) => padL + ((W - padL - 12) * (i + 0.5)) / n;
  const ys = (v: number) => padT + (H - padT - padB) * (1 - v / M);
  const ticks = [0, M / 2, M];
  return (
    <div ref={ref} className={cn("w-full", className)}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block h-auto w-full" role="img" aria-label={ariaLabel}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - 6} y1={ys(t)} y2={ys(t)} stroke={GRID} />
            <text x={padL - 6} y={ys(t) + 4} textAnchor="end" fontSize="11" fill={AXIS}>
              {t}
            </text>
          </g>
        ))}
        {series.map((s) => {
          const d = s.values.map((v, i) => `${i ? "L" : "M"}${xs(i)},${ys(v)}`).join(" ");
          return (
            <g key={s.key}>
              <path d={d} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
              {s.values.map((v, i) => (
                <circle key={i} cx={xs(i)} cy={ys(v)} r={3.2} fill={s.color} />
              ))}
            </g>
          );
        })}
        {labels.map((l, i) => (
          <text key={i} x={xs(i)} y={H - 6} textAnchor="middle" fontSize="11" fill={AXIS}>
            {l}
          </text>
        ))}
      </svg>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11.5px]">
        {series.map((s) => (
          <span key={s.key} className="text-muted inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} /> {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Lingkaran persentase (kehadiran, porsi makan). */
export function Donut({
  value,
  size = 84,
  stroke = 9,
  color = "#22c55e",
  label,
  className,
}: {
  value: number;
  size?: number;
  stroke?: number;
  color?: string;
  label?: string;
  className?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value));
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={cn("shrink-0", className)}
      role="img"
      aria-label={(label ? label + " " : "") + v + "%"}
    >
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e6e9f2" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${(c * v) / 100} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="50%" dy="0.36em" textAnchor="middle" fontSize={size / 4.6} fontWeight="700" fill="#1b2340">
        {v}%
      </text>
    </svg>
  );
}

/** Garis sederhana dengan titik (tren kepuasan per minggu). */
export function SimpleLine({
  values,
  labels,
  min = 1,
  max = 5,
  color = "#f59e0b",
  height = 160,
  className,
  ariaLabel,
}: {
  values: (number | null)[];
  labels: string[];
  min?: number;
  max?: number;
  color?: string;
  height?: number;
  className?: string;
  ariaLabel: string;
}) {
  const [ref, W] = useMeasuredWidth(420);
  const H = height;
  const padL = 24;
  const padB = 22;
  const padT = 10;
  const n = values.length;
  const xs = (i: number) => padL + ((W - padL - 12) * (i + 0.5)) / n;
  const ys = (v: number) => padT + (H - padT - padB) * (1 - (v - min) / (max - min));
  const pts = values.map((v, i) => (v == null ? null : ([xs(i), ys(v)] as const)));
  const d = pts
    .map((p, i) => (p ? `${i && pts[i - 1] ? "L" : "M"}${p[0]},${p[1]}` : ""))
    .filter(Boolean)
    .join(" ");
  const ticks = [min, (min + max) / 2, max];
  return (
    <div ref={ref} className={cn("w-full", className)}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block h-auto w-full" role="img" aria-label={ariaLabel}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - 6} y1={ys(t)} y2={ys(t)} stroke={GRID} />
            <text x={padL - 6} y={ys(t) + 4} textAnchor="end" fontSize="11" fill={AXIS}>
              {t}
            </text>
          </g>
        ))}
        {d ? <path d={d} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" /> : null}
        {pts.map((p, i) =>
          p ? (
            <g key={i}>
              <circle cx={p[0]} cy={p[1]} r={4.5} fill={color} />
              <text x={p[0]} y={p[1] - 9} textAnchor="middle" fontSize="11" fontWeight="600" fill="#1b2340">
                {(values[i] as number).toFixed(Number.isInteger(values[i]) ? 0 : 1).replace(".", ",")}
              </text>
            </g>
          ) : null,
        )}
        {labels.map((l, i) => (
          <text key={i} x={xs(i)} y={H - 6} textAnchor="middle" fontSize="11" fill={AXIS}>
            {l}
          </text>
        ))}
      </svg>
    </div>
  );
}
