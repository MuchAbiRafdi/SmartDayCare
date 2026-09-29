import * as React from "react";
import { cn } from "@/lib/format";
import { StatusDot, type Tone } from "./badge";

export function Metric({
  label,
  value,
  sub,
  tone,
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "panel metric flex min-w-0 flex-col gap-1 px-4 py-3.5",
        tone && tone !== "accent" && tone !== "neutral" ? "metric-" + tone : null,
        className,
      )}
    >
      <div className="text-muted text-[12.5px] font-medium">{label}</div>
      <div className="flex items-baseline gap-2 text-[22px] leading-none font-semibold tracking-tight tabular-nums">
        {tone ? <StatusDot tone={tone} className="mb-[3px] h-2.5 w-2.5" /> : null}
        <span className="truncate">{value}</span>
      </div>
      {sub ? (
        <div className="text-muted line-clamp-2 text-[12.5px] leading-snug" title={typeof sub === "string" ? sub : undefined}>
          {sub}
        </div>
      ) : null}
    </div>
  );
}

export function Progress({
  value,
  max = 100,
  tone = "accent",
  label,
  className,
}: {
  value: number;
  max?: number;
  tone?: Tone;
  /** Nama untuk pembaca layar, mis. "Energi" — wajib bila tidak ada label teks di dekatnya. */
  label?: string;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, (value / (max || 1)) * 100));
  const color = { ok: "bg-ok", warn: "bg-warn", danger: "bg-danger", neutral: "bg-faint", accent: "bg-teal-600" }[tone];
  return (
    <div
      className={cn("bar", className)}
      role="progressbar"
      aria-label={label}
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuetext={label ? `${Math.round(pct)}% dari target` : undefined}
    >
      <span className={color} style={{ width: pct + "%" }} />
    </div>
  );
}
