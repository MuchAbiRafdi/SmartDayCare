import * as React from "react";
import { cn } from "@/lib/format";
import type { Sev } from "@/lib/types";

export type Tone = "ok" | "warn" | "danger" | "neutral" | "accent";

const tones: Record<Tone, string> = {
  ok: "border-ok-line bg-ok-wash text-ok",
  warn: "border-warn-line bg-warn-wash text-warn-ink",
  danger: "border-danger-line bg-danger-wash text-danger",
  neutral: "border-line bg-wash text-ink-2",
  accent: "border-teal-200 bg-teal-100 text-teal-800",
};

export function Badge({ tone = "neutral", dot, className, children }: { tone?: Tone; dot?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[12px] leading-5 font-semibold whitespace-nowrap",
        tones[tone],
        className,
      )}
    >
      {dot ? <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden /> : null}
      {children}
    </span>
  );
}

export function sevTone(sev: Sev): Tone {
  return sev === "high" ? "danger" : sev === "medium" ? "warn" : "neutral";
}

export function SevBadge({ sev }: { sev: Sev }) {
  const label = sev === "high" ? "Penting" : sev === "medium" ? "Perhatian" : "Info";
  return <Badge tone={sevTone(sev)}>{label}</Badge>;
}

export function StatusDot({ tone, className }: { tone: Tone; className?: string }) {
  const color = { ok: "bg-ok", warn: "bg-warn", danger: "bg-danger", neutral: "bg-faint", accent: "bg-teal-600" }[tone];
  return <span className={cn("inline-block h-2 w-2 rounded-full", color, className)} aria-hidden />;
}
