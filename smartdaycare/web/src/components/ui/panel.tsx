import * as React from "react";
import { cn } from "@/lib/format";

export function Panel({ className, children, ...rest }: React.HTMLAttributes<HTMLElement>) {
  return (
    <section className={cn("panel", className)} {...rest}>
      {children}
    </section>
  );
}

export function PanelHead({
  title,
  desc,
  action,
  className,
  level = 2,
}: {
  title: React.ReactNode;
  desc?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  /** Tingkat judul: panel adalah bagian utama halaman (h2); pakai 3 untuk panel di dalam panel. */
  level?: 2 | 3;
}) {
  const Heading: "h2" | "h3" = level === 3 ? "h3" : "h2";
  return (
    <header className={cn("panel-head", className)}>
      <div className="min-w-0">
        <Heading className="text-[15px] leading-tight font-semibold">{title}</Heading>
        {desc ? <p className="text-muted mt-0.5 text-[13px]">{desc}</p> : null}
      </div>
      {action ? <div className="flex flex-wrap items-center gap-2">{action}</div> : null}
    </header>
  );
}

export function PanelBody({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("panel-body", className)}>{children}</div>;
}

export function Kv({ rows, className }: { rows: [React.ReactNode, React.ReactNode][]; className?: string }) {
  return (
    <dl className={cn("kv", className)}>
      {rows.map(([k, v], i) => (
        <React.Fragment key={i}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}

export function Empty({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn("border-line-strong bg-wash/60 text-muted rounded-md border border-dashed px-4 py-5 text-center text-[14px]", className)}>{children}</p>
  );
}

export function Note({
  children,
  tone = "info",
  className,
  role,
}: {
  children: React.ReactNode;
  tone?: "info" | "warn" | "danger" | "ok";
  className?: string;
  role?: string;
}) {
  const tones = {
    info: "border-teal-200 bg-teal-100/60 text-teal-900",
    warn: "border-warn-line bg-warn-wash text-warn-ink",
    danger: "border-danger-line bg-danger-wash text-danger",
    ok: "border-ok-line bg-ok-wash text-ok",
  } as const;
  return (
    <div role={role} className={cn("rounded-md border px-3.5 py-2.5 text-[13.5px] leading-relaxed", tones[tone], className)}>
      {children}
    </div>
  );
}
