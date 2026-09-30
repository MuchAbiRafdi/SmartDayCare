"use client";
import * as React from "react";
import { cn, fmtNum } from "@/lib/format";
import type { Box, Child, NutritionItem } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/metric";
import { TableWrap } from "@/components/ui/table-wrap";
import { AuthImg } from "@/components/shared/auth-img";

export function PlatePhoto({
  src,
  boxes = [],
  caption,
  className,
  alt,
}: {
  src: string | null;
  boxes?: Box[];
  caption: string;
  className?: string;
  alt: string;
}) {
  return (
    <figure className={cn("border-line bg-wash overflow-hidden rounded-lg border", className)}>
      <div className="relative aspect-[4/3] w-full bg-slate-100">
        {src ? (
          <AuthImg src={src} alt={alt} className="absolute inset-0 h-full w-full object-contain" loading="lazy" />
        ) : (
          <div className="text-muted absolute inset-0 flex items-center justify-center text-[13px]">Foto tidak tersedia</div>
        )}
        {src
          ? boxes.map((b, i) => (
              <div
                key={i}
                className="absolute rounded-sm border-2 border-teal-300"
                style={{ left: b.x * 100 + "%", top: b.y * 100 + "%", width: b.w * 100 + "%", height: b.h * 100 + "%" }}
                aria-hidden
              >
                <span className="bg-ink/85 absolute -top-5 left-0 rounded px-1 py-px text-[10px] font-semibold whitespace-nowrap text-white">{b.label}</span>
              </div>
            ))
          : null}
      </div>
      <figcaption className="text-muted px-3 py-1.5 text-[12.5px]">{caption}</figcaption>
    </figure>
  );
}

export interface MealView {
  label: string;
  served: string;
  scannedPost: string;
  items: NutritionItem[];
  pct: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  by: string;
  photoPre: string | null;
  photoPost: string | null;
  boxesPre: Box[];
  boxesPost: Box[];
  source: "scan" | "seed";
  conf?: number;
}

export function MealTable({ m }: { m: MealView }) {
  const totals = m.items.reduce(
    (t, i) => {
      const e = Math.max(0, i.pre - i.post);
      return { pre: t.pre + i.pre, post: t.post + i.post, eaten: t.eaten + e, kcal: t.kcal + (i.kcal * e) / 100, protein: t.protein + (i.protein * e) / 100 };
    },
    { pre: 0, post: 0, eaten: 0, kcal: 0, protein: 0 },
  );
  return (
    <TableWrap label="Rincian makanan per menu">
      <table className="table min-w-[520px]">
        <thead>
          <tr>
            <th>Menu</th>
            <th className="num">Disajikan</th>
            <th className="num">Sisa</th>
            <th className="num">Dimakan</th>
            <th className="num">Energi</th>
            <th className="num">Protein</th>
          </tr>
        </thead>
        <tbody>
          {m.items.map((i) => {
            const e = Math.max(0, i.pre - i.post);
            return (
              <tr key={i.name}>
                <td>{i.name}</td>
                <td className="num">{i.pre} g</td>
                <td className="num">{i.post} g</td>
                <td className="num">{e} g</td>
                <td className="num">{Math.round((i.kcal * e) / 100)} kkal</td>
                <td className="num">{fmtNum((i.protein * e) / 100, 1)} g</td>
              </tr>
            );
          })}
          <tr className="font-semibold">
            <td>Total</td>
            <td className="num">{totals.pre} g</td>
            <td className="num">{totals.post} g</td>
            <td className="num">{totals.eaten} g</td>
            <td className="num">{Math.round(totals.kcal)} kkal</td>
            <td className="num">{fmtNum(totals.protein, 1)} g</td>
          </tr>
        </tbody>
      </table>
    </TableWrap>
  );
}

export function MacroBars({ consumed, target }: { consumed: { kcal: number; protein: number; carbs: number; fat: number }; target: Child["target"] }) {
  const rows: [string, number, number, string][] = [
    ["Energi", consumed.kcal, target.kcal, "kkal"],
    ["Protein", consumed.protein, target.protein, "g"],
    ["Karbohidrat", consumed.carbs, target.carbs, "g"],
    ["Lemak", consumed.fat, target.fat, "g"],
  ];
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {rows.map(([k, v, t, u]) => (
        <li key={k}>
          <div className="mb-1 flex items-baseline justify-between text-[13.5px]">
            <span className="text-ink-2 font-medium">{k}</span>
            <span className="text-muted tabular-nums">
              <b className="text-ink">{fmtNum(v, u === "g" ? 1 : 0)}</b> / {fmtNum(t)} {u}
            </span>
          </div>
          <Progress value={v} max={t} label={String(k)} />
        </li>
      ))}
    </ul>
  );
}

export function LeftoverNote({ m }: { m: MealView }) {
  const left = [...m.items].filter((i) => i.post > 0).sort((a, b) => b.post - a.post)[0];
  return <p className="text-ink-2 text-[14px]">{left ? `Sisa terbanyak: ${left.name.toLowerCase()} (${left.post} g).` : "Piring habis."}</p>;
}

export function ConfBadge({ conf }: { conf: number | undefined }) {
  if (typeof conf !== "number") return null;
  const lvl = conf >= 0.8 ? "tinggi" : conf >= 0.65 ? "sedang" : "rendah";
  return (
    <Badge tone={lvl === "tinggi" ? "ok" : lvl === "sedang" ? "warn" : "danger"} dot>
      Keyakinan pengenalan {lvl}
    </Badge>
  );
}
