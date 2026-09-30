import * as React from "react";
import { cn } from "@/lib/format";
import type { Tone } from "./badge";

/** Pita identitas berwarna di awal dasbor: satu bidang gradasi per halaman, sisanya tetap putih dan tenang. */
export function Band({
  eyebrow,
  title,
  titleId,
  desc,
  right,
  children,
  className,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  titleId?: string;
  desc?: React.ReactNode;
  right?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("band rounded-xl px-5 py-5 md:px-6", className)}>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1">
          {eyebrow ? <p className="text-[12.5px] font-medium tracking-[0.02em] text-white/80">{eyebrow}</p> : null}
          <h2 id={titleId} className="mt-0.5 text-[22px] leading-tight md:text-[25px]">
            {title}
          </h2>
          {desc ? <p className="mt-1 text-[14px] leading-relaxed text-white/88">{desc}</p> : null}
          {children}
        </div>
        {right ? <div className="flex shrink-0 flex-wrap items-center gap-2">{right}</div> : null}
      </div>
    </section>
  );
}

export function BandPill({ tone, dot, className, children }: { tone?: Tone; dot?: boolean; className?: string; children: React.ReactNode }) {
  const t = tone === "ok" || tone === "warn" || tone === "danger" ? "band-pill-" + tone : null;
  return (
    <span className={cn("band-pill", t, className)}>
      {dot ? <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden /> : null}
      {children}
    </span>
  );
}
