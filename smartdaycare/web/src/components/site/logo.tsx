import { cn } from "@/lib/format";

/** Tanda merek SmartDayCare AI: ikon dua anak + nama dengan "AI" berwarna ungu. */
export function LogoMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className="shrink-0">
      <circle cx="16" cy="16" r="16" fill="#eef2ff" />
      <circle cx="11.5" cy="13" r="5.2" fill="#3b7cf6" />
      <circle cx="21" cy="13.5" r="4.8" fill="#f59e0b" />
      <circle cx="11.5" cy="13.4" r="3.6" fill="#ffe1c9" />
      <circle cx="21" cy="13.9" r="3.3" fill="#ffe8d6" />
      <circle cx="10.2" cy="13.2" r=".6" fill="#1b2340" />
      <circle cx="12.8" cy="13.2" r=".6" fill="#1b2340" />
      <circle cx="19.9" cy="13.7" r=".55" fill="#1b2340" />
      <circle cx="22.1" cy="13.7" r=".55" fill="#1b2340" />
      <path d="M10.3 15.2q1.2 1 2.4 0" stroke="#1b2340" strokeWidth=".7" fill="none" strokeLinecap="round" />
      <path d="M20 15.6q1 .8 2 0" stroke="#1b2340" strokeWidth=".6" fill="none" strokeLinecap="round" />
      <path d="M5.5 25.5c.6-3.4 3.2-5.2 6-5.2s5.4 1.8 6 5.2" fill="#2f6fed" />
      <path d="M15.6 25.5c.5-2.8 2.7-4.4 5.4-4.4s4.9 1.6 5.4 4.4" fill="#f59e0b" />
    </svg>
  );
}

export function Logo({ dark = false, className, compact = false }: { dark?: boolean; className?: string; compact?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark size={compact ? 26 : 30} />
      <span className={cn("leading-none font-bold tracking-tight", compact ? "text-[15px]" : "text-[17px]", dark ? "text-white" : "text-ink")}>
        SmartDayCare <span className={dark ? "text-white/85" : "grad-text"}>AI</span>
      </span>
    </span>
  );
}
