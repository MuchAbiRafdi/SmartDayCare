/* Pengenalan makanan di perangkat.
   Menerima gambar piring (kamera atau foto) dan mengembalikan daftar makanan yang dikenali,
   perkiraan berat per menu, serta kotak posisinya. Seluruh perhitungan berjalan di peramban;
   foto baru dikirim ke server setelah pengasuh memeriksa dan menyimpan hasilnya.

   Metode: segmentasi warna–tekstur (HSV + gradien), pemisahan latar lewat flood-fill dari tepi,
   pencarian piring dari warna dominan bukan-makanan, pengelompokan komponen terhubung per kelas,
   pemeriksaan tiap kelompok oleh jaringan saraf kecil (foodnet.ts, dilatih dari foto makanan
   sungguhan) yang membuang kelompok bukan-makanan dan mengoreksi kelas bila yakin, lalu konversi
   luas → gram memakai diameter piring sebagai skala. */

import { argmax, denseMap, loadFoodNet, meanProbs, type FoodNet } from "./foodnet";

export type Family = "staple" | "veg" | "protein" | "soup" | "fruit" | "other";
export type Cat = "rice" | "greens" | "fried" | "pale" | "brown" | "soup" | "orange" | "yellow" | "red" | "egg";

export interface CatDef {
  label: string;
  family: Family;
  density: number;
  menu: string[];
}

export const CATS: Record<Cat, CatDef> = {
  rice: { label: "Nasi", family: "staple", density: 2.8, menu: ["Nasi putih", "Nasi tim"] },
  greens: { label: "Sayur hijau", family: "veg", density: 1.1, menu: ["Tumis sawi", "Brokoli kukus", "Labu kukus"] },
  fried: { label: "Lauk goreng", family: "protein", density: 1.8, menu: ["Ayam goreng", "Tempe goreng", "Telur dadar"] },
  pale: { label: "Lauk kukus", family: "protein", density: 1.0, menu: ["Ayam cincang kukus", "Tahu kukus", "Ikan dori kukus"] },
  brown: { label: "Lauk berkuah", family: "protein", density: 1.2, menu: ["Ayam kecap", "Semur daging"] },
  soup: { label: "Sup", family: "soup", density: 2.4, menu: ["Sup wortel", "Sup ayam"] },
  orange: { label: "Buah jingga", family: "fruit", density: 2.0, menu: ["Jeruk", "Pepaya", "Wortel rebus"] },
  yellow: { label: "Buah kuning", family: "fruit", density: 0.9, menu: ["Pisang", "Jagung rebus", "Telur rebus"] },
  red: { label: "Buah merah", family: "fruit", density: 1.4, menu: ["Tomat", "Semangka"] },
  egg: { label: "Telur", family: "protein", density: 1.4, menu: ["Telur mata sapi", "Telur dadar", "Telur rebus"] },
};
const ORDER: Cat[] = ["rice", "fried", "egg", "pale", "brown", "soup", "greens", "orange", "yellow", "red"];

/* Kelas piksel sementara */
const K = { BG: 1, PLATE: 2, WHITE: 3, GREENS: 4, RED: 5, BROWN: 6, PALE: 7, ORANGEISH: 8, FRIED: 9, YELLOW: 10, WHITE_S: 11 } as const;

export interface NBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface VisionItem {
  cat: Cat;
  label: string;
  family: Family;
  name: string;
  alts: string[];
  grams: number;
  cm2: number;
  areaFrac: number;
  box: NBox;
  conf: number;
  texture: number;
  parts: number;
  /** peluang model untuk kelas ini (rata-rata sel kelompok); tidak ada bila model tidak dipakai */
  modelP?: number;
}

/** ok = ada makanan; empty_plate = piring ada tapi kosong; no_plate = piring tidak ditemukan dan tidak ada
    makanan; no_food = model menilai tidak ada makanan pada bingkai. */
export type Verdict = "ok" | "empty_plate" | "no_plate" | "no_food";

export interface VisionResult {
  items: VisionItem[];
  plate: { found: boolean; white: boolean; box: NBox | null; cm: number };
  cmPerPx: number;
  size: { w: number; h: number };
  ms: number;
  conf: number;
  level: Level;
  notes: string[];
  verdict: Verdict;
  /** Jaringan saraf ikut memeriksa hasil (false bila berkas model tidak tersedia). */
  model: { used: boolean; name: string; ms: number; dropped: number; relabeled: number };
}

export type Level = "tinggi" | "sedang" | "rendah";
export type Stage = "pre" | "post";

export interface AnalyzeOpts {
  plateCm?: number;
  stage?: Stage;
  onStage?: (name: string, index: number, total: number) => Promise<void> | void;
  /** Model yang sudah dimuat; null = jangan pakai model; undefined = muat dari /models. */
  net?: FoodNet | null;
}

export const STAGE_NAMES = ["Membaca warna dan tekstur", "Mencari piring", "Mengenali makanan", "Memeriksa dengan model", "Menghitung porsi"] as const;
const NONE_DROP = 0.6; // kelompok dibuang bila model menilai bukan makanan di atas ambang ini
const RELABEL_MIN = 0.6; // bawaan lama: kelas diganti hanya bila model yakin
const RELABEL_PRECISION_MIN = 0.75; // …dan hanya ke kelas yang presisinya (pada p > 0,6, data uji) cukup tinggi
const RELABEL_SURE = 0.8; // …kecuali model sangat yakin: kelas berpresisi rendah pun boleh menjadi tujuan
const VETO_P = 0.07; // bawaan lama: kelompok warna dibuang bila model hampir pasti bukan kelas itu

/** Ambang keputusan per kelas: dipakai apa adanya dari berkas model bila ada, sebab ambangnya
    dihitung dari data uji saat model dilatih (ai/train.py), bukan ditebak di antarmuka.
    Model lama tanpa ambang di dalam berkas tetap jalan dengan aturan lama. */
export function ambangDari(net: FoodNet) {
  const t = (net.meta.thresholds ?? {}) as { relabel_min?: Record<string, number>; veto_p?: Record<string, number> };
  const precision = (net.meta.val_precision_conf06 ?? {}) as Record<string, number>;
  const tuned = !!t.relabel_min || !!t.veto_p;
  return {
    tuned,
    /** bolehkah nama menu hasil segmentasi warna diganti ke kelas `target` pada peluang `p`? */
    mayRelabel: (target: string, p: number) =>
      tuned
        ? p >= (t.relabel_min?.[target] ?? RELABEL_SURE)
        : p > RELABEL_MIN && (typeof precision[target] === "number" ? precision[target] >= RELABEL_PRECISION_MIN || p > RELABEL_SURE : true),
    /** di bawah peluang ini kelompok berwarna `cat` dianggap salah baca dan dibuang */
    vetoP: (cat: string) => (tuned ? (t.veto_p?.[cat] ?? VETO_P) : VETO_P),
    /** presisi terukur kelas ini pada foto uji (dihitung pada p ≥ 0,6); null bila tak ada angkanya */
    precOf: (cat: string) => (typeof precision[cat] === "number" ? precision[cat] : null),
  };
}

/** Presisi yang dipakai bila berkas model tidak menyimpan angka per kelas. */
const PREC_BAWAAN = 0.7;
/** Seberapa sering nama menu hasil warna-bentuk-saja benar. Diukur pada 77 foto uji
    (ai/eval-plates.mjs): 43/235 butir cocok dengan label foto, dan 37/139 di antaranya bahkan
    sempat diberi lencana "tinggi" oleh formula lama. Angka ini diambil dari rentang itu. */
const AKURASI_WARNA_SAJA = 0.22;

/** Versi `ambangDari` untuk keadaan tanpa berkas model: tidak mengoreksi, tidak membuang. */
const TANPA_MODEL = {
  tuned: false,
  mayRelabel: () => false,
  vetoP: () => VETO_P,
  precOf: () => null as number | null,
};

const NET_MIN_SIDE = 300; // skala saat model dilatih (sisi terpendek foto 300 px); bingkai yang lebih kecil diperbesar dulu untuk model
const NET_MAX_SCALE = 2.2;

interface Comp {
  k: number;
  n: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  tex: number;
  sat: number;
  val: number;
  thick: number;
  elong: number;
}

interface Group {
  cat: Cat;
  n: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  tex: number;
  count: number;
  /** rata-rata peluang model untuk kelas kelompok ini (bila model dipakai) */
  p?: number;
  /** nama kelasnya hasil koreksi model, bukan kesepakatan warna & model */
  rel?: boolean;
}

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
const tick = () => new Promise<void>((r) => setTimeout(r, 0));

function hsv(r: number, g: number, b: number): [number, number, number] {
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const d = mx - mn;
  let h = 0;
  if (d) {
    if (mx === r) h = ((g - b) / d) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, mx ? d / mx : 0, mx / 255];
}

export interface ImageLike {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export async function analyzeImageData(img: ImageLike, opts: AnalyzeOpts = {}): Promise<VisionResult> {
  const W = img.width;
  const H = img.height;
  const N = W * H;
  const px = img.data;
  const plateCm = opts.plateCm && opts.plateCm > 0 ? opts.plateCm : 22;
  const stage: Stage = opts.stage ?? "pre";
  const report = async (name: string, i: number) => {
    if (opts.onStage) await opts.onStage(name, i, STAGE_NAMES.length);
  };
  const t0 = now();
  const notes: string[] = [];

  /* Tahap 1 — warna, tekstur, latar */
  await report(STAGE_NAMES[0], 0);
  const hue = new Float32Array(N);
  const sat = new Float32Array(N);
  const val = new Float32Array(N);
  const gray = new Uint8Array(N);
  const tex = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const r = px[i * 4];
    const g = px[i * 4 + 1];
    const b = px[i * 4 + 2];
    const c = hsv(r, g, b);
    hue[i] = c[0];
    sat[i] = c[1];
    val[i] = c[2];
    gray[i] = (r * 299 + g * 587 + b * 114) / 1000;
  }
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      tex[i] = Math.min(255, Math.abs(gray[i + 1] - gray[i - 1]) + Math.abs(gray[i + W] - gray[i - W]));
    }
  const border: number[] = [];
  const bw = Math.max(2, Math.round(Math.min(W, H) * 0.04));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (x < bw || y < bw || x >= W - bw || y >= H - bw) border.push(y * W + x);
  const med = (idx: number[], ch: number) => {
    const a = idx.map((i) => px[i * 4 + ch]).sort((p, q) => p - q);
    return a[a.length >> 1];
  };
  const bg = [med(border, 0), med(border, 1), med(border, 2)];
  const dist = (i: number, c: number[]) => {
    const dr = px[i * 4] - c[0];
    const dg = px[i * 4 + 1] - c[1];
    const db = px[i * 4 + 2] - c[2];
    return Math.sqrt(dr * dr + dg * dg + db * db);
  };
  const devs = border.map((i) => dist(i, bg)).sort((p, q) => p - q);
  const mad = devs[devs.length >> 1];
  const tol = Math.min(72, Math.max(30, mad * 3 + 22));
  const cls = new Uint8Array(N);
  const stack: number[] = [];
  for (const i of border)
    if (dist(i, bg) < tol) {
      cls[i] = K.BG;
      stack.push(i);
    }
  while (stack.length) {
    const i = stack.pop() as number;
    const x = i % W;
    if (x > 0 && !cls[i - 1] && tex[i - 1] < 56 && dist(i - 1, bg) < tol) {
      cls[i - 1] = K.BG;
      stack.push(i - 1);
    }
    if (x < W - 1 && !cls[i + 1] && tex[i + 1] < 56 && dist(i + 1, bg) < tol) {
      cls[i + 1] = K.BG;
      stack.push(i + 1);
    }
    if (i >= W && !cls[i - W] && tex[i - W] < 56 && dist(i - W, bg) < tol) {
      cls[i - W] = K.BG;
      stack.push(i - W);
    }
    if (i < N - W && !cls[i + W] && tex[i + W] < 56 && dist(i + W, bg) < tol) {
      cls[i + W] = K.BG;
      stack.push(i + W);
    }
  }
  await tick();

  /* Tahap 2 — piring: warna dominan bukan-makanan di bagian tengah */
  await report(STAGE_NAMES[1], 1);
  const cx0 = Math.round(W * 0.18);
  const cx1 = Math.round(W * 0.82);
  const cy0 = Math.round(H * 0.18);
  const cy1 = Math.round(H * 0.82);
  const bins = new Float64Array(15);
  const binSat = new Float64Array(15);
  const binVal = new Float64Array(15);
  const binOf = (i: number) => {
    const s = sat[i];
    const v = val[i];
    if (v < 0.22) return 14;
    if (s < 0.2) return v > 0.65 ? 12 : 13;
    if (s < 0.3 && v < 0.65) return 13;
    return Math.min(11, Math.floor(hue[i] / 30));
  };
  for (let y = cy0; y < cy1; y++)
    for (let x = cx0; x < cx1; x++) {
      const i = y * W + x;
      if (cls[i] !== K.BG) {
        const b = binOf(i);
        bins[b]++;
        binSat[b] += sat[i];
        binVal[b] += val[i];
      }
    }
  const pastel = (b: number) => b >= 2 && b < 12 && binSat[b] / (bins[b] || 1) < 0.45 && binVal[b] / (bins[b] || 1) > 0.7;
  const nonFood = (b: number) => (b >= 6 && b <= 10) || b === 13 || b === 14 || (b === 11 && binSat[b] / (bins[b] || 1) < 0.5) || pastel(b);
  let top = -1;
  for (let b = 0; b < 15; b++) if (nonFood(b) && bins[b] > N * 0.02 && (top < 0 || bins[b] > bins[top])) top = b;
  let plate: { found: boolean; box: NBox | null; diameterPx: number; white: boolean } = { found: false, box: null, diameterPx: 0, white: false };
  if (top >= 0) {
    const pc = [0, 0, 0];
    let pn = 0;
    for (let y = cy0; y < cy1; y++)
      for (let x = cx0; x < cx1; x++) {
        const i = y * W + x;
        if (cls[i] !== K.BG && binOf(i) === top) {
          pc[0] += px[i * 4];
          pc[1] += px[i * 4 + 1];
          pc[2] += px[i * 4 + 2];
          pn++;
        }
      }
    pc[0] /= pn;
    pc[1] /= pn;
    pc[2] /= pn;
    const ph = hsv(pc[0], pc[1], pc[2]);
    const hueNear = (h: number) => top < 12 && Math.min(Math.abs(h - ph[0]), 360 - Math.abs(h - ph[0])) < 20;
    for (let i = 0; i < N; i++)
      if (!cls[i] && ((binOf(i) === top && dist(i, pc) < 95) || (hueNear(hue[i]) && sat[i] > 0.12 && sat[i] < ph[1] + 0.2 && Math.abs(val[i] - ph[2]) < 0.35)))
        cls[i] = K.PLATE;
    const pcs = components(cls, W, H, K.PLATE, tex, sat, val);
    pcs.sort((a, b) => b.n - a.n);
    if (pcs.length && pcs[0].n > N * 0.03) {
      const p = pcs[0];
      plate = { found: true, box: boxOf(p, W, H), diameterPx: Math.max(p.x1 - p.x0, p.y1 - p.y0) + 1, white: false };
    }
  }
  await tick();

  /* Tahap 3 — klasifikasi makanan per piksel dan pengelompokan */
  await report(STAGE_NAMES[2], 2);
  for (let i = 0; i < N; i++) {
    if (cls[i]) continue;
    const h = hue[i];
    const s = sat[i];
    const v = val[i];
    let c = 0;
    if (s < 0.2 && v > 0.62) c = tex[i] >= 12 ? K.WHITE : K.WHITE_S;
    else if (h >= 62 && h <= 175 && s > 0.18 && v > 0.12) c = K.GREENS;
    else if ((h >= 340 || h < 14) && s > 0.45 && v > 0.3) c = K.RED;
    else if (h >= 14 && h < 52) {
      if (s < 0.18) c = 0;
      else if (v < 0.48) c = s >= 0.3 ? K.BROWN : 0;
      else if (s < 0.42) c = K.PALE;
      else if (h >= 44) c = K.YELLOW;
      else if (s >= 0.72 && v >= 0.78) c = K.ORANGEISH;
      else c = K.FRIED;
    } else if (h >= 52 && h < 62 && s > 0.35 && v > 0.5) c = K.YELLOW;
    cls[i] = c;
  }
  const minArea = Math.max(24, N * 0.0012);
  const groups: Partial<Record<Cat, Group>> = {};
  const put = (cat: Cat, o: Comp) => {
    const g = groups[cat] ?? (groups[cat] = { cat, n: 0, x0: W, y0: H, x1: 0, y1: 0, tex: 0, count: 0 });
    g.n += o.n;
    g.tex += o.tex * o.n;
    g.count++;
    g.x0 = Math.min(g.x0, o.x0);
    g.y0 = Math.min(g.y0, o.y0);
    g.x1 = Math.max(g.x1, o.x1);
    g.y1 = Math.max(g.y1, o.y1);
  };
  type Rect = { x0: number; y0: number; x1: number; y1: number };
  const overlap = (a: Rect, b: Rect) => {
    const x = Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) + 1);
    const y = Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) + 1);
    const s = Math.min((a.x1 - a.x0 + 1) * (a.y1 - a.y0 + 1), (b.x1 - b.x0 + 1) * (b.y1 - b.y0 + 1)) || 1;
    return (x * y) / s;
  };
  const byClass: Record<number, Comp[]> = {};
  for (const k of [K.WHITE, K.WHITE_S, K.GREENS, K.RED, K.BROWN, K.PALE, K.ORANGEISH, K.FRIED, K.YELLOW]) byClass[k] = components(cls, W, H, k, tex, sat, val);
  const soupComps: Comp[] = [];
  let whitePlate: Comp | null = null;
  const usable = (o: Comp) => {
    const bwid = o.x1 - o.x0 + 1;
    const bh = o.y1 - o.y0 + 1;
    o.thick = o.n / Math.max(bwid, bh);
    o.elong = Math.max(bwid, bh) / Math.max(1, Math.min(bwid, bh));
    return o.n >= minArea && o.thick >= 4 && !(o.elong > 3.5 && o.thick < 8);
  };
  const central = (o: Rect) => o.x1 > W * 0.2 && o.x0 < W * 0.8 && o.y1 > H * 0.2 && o.y0 < H * 0.8;
  if (!plate.found) for (const o of byClass[K.WHITE_S]) if (usable(o) && o.n > N * 0.05 && central(o) && (!whitePlate || o.n > whitePlate.n)) whitePlate = o;
  if (whitePlate) {
    const wp: Comp = whitePlate;
    plate = { found: true, box: boxOf(wp, W, H), diameterPx: Math.max(wp.x1 - wp.x0, wp.y1 - wp.y0) + 1, white: true };
  }
  const inPlate = (o: Rect) => {
    if (!plate.found || !plate.box) return true;
    const b = plate.box;
    const cx = (o.x0 + o.x1) / 2 / W;
    const cy = (o.y0 + o.y1) / 2 / H;
    return cx >= b.x && cx <= b.x + b.w && cy >= b.y && cy <= b.y + b.h;
  };
  for (const o of byClass[K.ORANGEISH]) {
    if (!usable(o)) continue;
    if (o.tex < 15 && o.n > N * 0.004) {
      put("soup", o);
      soupComps.push(o);
    } else put("orange", o);
  }
  const nearSoup = (o: Rect) => soupComps.some((sc) => overlap(o, sc) > 0.3);
  const inner = (o: Rect) => {
    const b = plate.box as NBox;
    const m = 0.06;
    return o.x0 / W >= b.x + b.w * m && o.x1 / W <= b.x + b.w * (1 - m) && o.y0 / H >= b.y + b.h * m && o.y1 / H <= b.y + b.h * (1 - m);
  };
  const contains = (a: Rect, b: Rect) => b.x0 >= a.x0 && b.x1 <= a.x1 && b.y0 >= a.y0 && b.y1 <= a.y1;
  const yellows = byClass[K.YELLOW].filter((o) => usable(o));
  const eggWhites = new Set<Comp>();
  const yolks = new Set<Comp>();
  for (const o of byClass[K.WHITE]) {
    if (o.n < minArea * 3) continue;
    const fill = o.n / ((o.x1 - o.x0 + 1) * (o.y1 - o.y0 + 1));
    if (fill < 0.4 || (plate.found && o.x1 - o.x0 + 1 > plate.diameterPx * 0.6)) continue;
    for (const y of yellows)
      if (y.elong < 1.8 && y.n < o.n && contains(o, y)) {
        eggWhites.add(o);
        yolks.add(y);
      }
  }
  eggWhites.forEach((o) => put("egg", o));
  yolks.forEach((y) => put("egg", y));
  for (const o of byClass[K.WHITE]) {
    if (eggWhites.has(o) || !usable(o)) continue;
    if (plate.found ? (plate.white ? inner(o) && o.tex >= 18 && o.thick >= 6 : inPlate(o) && o.val >= 0.8) : o.tex >= 20 && o.val >= 0.78 && o.thick >= 6)
      put("rice", o);
  }
  if (plate.found && !plate.white) for (const o of byClass[K.WHITE_S]) if (usable(o) && inPlate(o) && o.val >= 0.8) put("rice", o);
  for (const o of byClass[K.GREENS]) {
    if (!usable(o)) continue;
    if (o.tex >= 30 || (o.tex >= 13 && o.val >= 0.4)) put("greens", o);
    else notes.push("alas daun diabaikan");
  }
  for (const o of byClass[K.RED]) if (usable(o)) put("red", o);
  for (const o of yellows) if (!yolks.has(o)) put("yellow", o);
  for (const o of byClass[K.BROWN]) {
    if (!usable(o) || o.n < N * 0.003) continue;
    if (nearSoup(o)) put("soup", o);
    else if (inPlate(o)) put("brown", o);
  }
  for (const o of byClass[K.PALE]) {
    if (!usable(o) || o.n < N * 0.006 || o.sat < 0.2) continue;
    if (nearSoup(o)) put("soup", o);
    else if (inPlate(o)) put("pale", o);
  }
  for (const o of byClass[K.FRIED]) {
    if (!usable(o)) continue;
    if (nearSoup(o)) put("soup", o);
    else if (inPlate(o)) put(o.tex < 20 && o.sat >= 0.8 ? "soup" : "fried", o);
  }
  for (const c of ["brown", "pale"] as const) {
    const g = groups[c];
    const f = groups.fried;
    if (g && f && overlap(g, f) > 0.5) {
      f.n += g.n;
      f.tex += g.tex;
      f.count += g.count;
      f.x0 = Math.min(f.x0, g.x0);
      f.y0 = Math.min(f.y0, g.y0);
      f.x1 = Math.max(f.x1, g.x1);
      f.y1 = Math.max(f.y1, g.y1);
      delete groups[c];
    }
  }
  for (const c of Object.keys(groups) as Cat[]) {
    const g = groups[c];
    if (g && g.n > N * 0.3) {
      delete groups[c];
      notes.push("latar mirip warna makanan diabaikan; gunakan alas polos");
    }
  }
  await tick();

  /* Tahap 4 — pemeriksaan model: kelompok yang menurut jaringan bukan makanan dibuang, kelas diganti
     bila model yakin. Kelompok yang tersisa tetap diperiksa pengasuh sebelum disimpan. */
  await report(STAGE_NAMES[3], 3);
  const model: VisionResult["model"] = { used: false, name: "", ms: 0, dropped: 0, relabeled: 0 };
  /** ambang & presisi terukur per kelas; netral selama model belum dipakai */
  let thr: ReturnType<typeof ambangDari> | typeof TANPA_MODEL = TANPA_MODEL;
  let pFoodAll = -1;
  const net = opts.net === null ? null : (opts.net ?? (await loadFoodNet().catch(() => null)));
  if (net) {
    try {
      // bingkai analisis (lebar ≤ 320) lebih kecil daripada foto latih; tanpa penyesuaian skala, butiran nasi
      // atau serat sayur tampak terlalu halus bagi model dan sering dinilai "bukan makanan"
      const netScale = Math.min(NET_MAX_SCALE, Math.max(1, NET_MIN_SIDE / Math.min(W, H)));
      const map = await denseMap(net, netScale > 1.05 ? upscale(img, netScale) : img, tick);
      const fx = (x: number) => Math.min(W - 1, Math.floor(x / netScale));
      const fy = (y: number) => Math.min(H - 1, Math.floor(y / netScale));
      model.used = true;
      model.name = String(net.meta.name ?? "food-patch");
      model.ms = Math.round(map.ms);
      // ambang per kelas dari data uji (disimpan di dalam berkas model saat ekspor): kelas yang sering
      // keliru (mis. sup, pucat, telur) menuntut peluang lebih tinggi sebelum boleh menamai ulang
      thr = ambangDari(net);
      const foodCell = (x: number, y: number) => {
        const k = cls[y * W + x];
        return k !== K.BG && k !== K.PLATE;
      };
      const pb = plate.found && plate.box ? plate.box : null;
      const all = meanProbs(map, (nx, ny) => {
        if (!pb) return true;
        const x = fx(nx);
        const y = fy(ny);
        return x >= pb.x * W && x <= (pb.x + pb.w) * W && y >= pb.y * H && y <= (pb.y + pb.h) * H;
      });
      if (all.cells) pFoodAll = 1 - all.probs[map.none];
      const vetoed: Group[] = [];
      for (const c of Object.keys(groups) as Cat[]) {
        const g = groups[c] as Group;
        const { probs, cells } = meanProbs(map, (nx, ny) => {
          const x = fx(nx);
          const y = fy(ny);
          return x >= g.x0 && x <= g.x1 && y >= g.y0 && y <= g.y1 && foodCell(x, y);
        });
        if (cells < 2) continue;
        if (probs[map.none] > NONE_DROP) {
          delete groups[c];
          model.dropped++;
          continue;
        }
        const food = Array.from(probs, (v, k) => (k === map.none ? 0 : v));
        const best = argmax(food);
        const bc = map.classes[best] as Cat;
        const own = map.classes.indexOf(c);
        g.p = own >= 0 ? probs[own] : undefined;
        const relabel = bc !== c && bc in CATS && thr.mayRelabel(bc, food[best]);
        if (!relabel && typeof g.p === "number" && g.p < thr.vetoP(c)) {
          // warna cocok tetapi model hampir pasti bukan kelas itu (mis. serbet merah, piring kuning): buang
          vetoed.push(g);
          delete groups[c];
          model.dropped++;
          continue;
        }
        if (relabel) {
          g.rel = true;
          const target = groups[bc];
          if (target?.rel !== undefined) target.rel = true;
          if (target) {
            const tp = target.p ?? food[best];
            target.p = (tp * target.n + food[best] * g.n) / (target.n + g.n);
            target.n += g.n;
            target.tex += g.tex;
            target.count += g.count;
            target.x0 = Math.min(target.x0, g.x0);
            target.y0 = Math.min(target.y0, g.y0);
            target.x1 = Math.max(target.x1, g.x1);
            target.y1 = Math.max(target.y1, g.y1);
          } else {
            groups[bc] = { ...g, cat: bc, p: food[best] };
          }
          delete groups[c];
          model.relabeled++;
        }
      }
      // bila semua kelompok terbuang padahal model melihat makanan di piring, kembalikan kelompok terbesar
      // (kelasnya tetap dari warna; pengasuh yang memutuskan)
      if (Object.keys(groups).length === 0 && vetoed.length && pFoodAll >= 0.5) {
        const big = vetoed.reduce((a, b) => (b.n > a.n ? b : a));
        groups[big.cat] = big;
        model.dropped--;
        notes.push("model ragu dengan jenis makanan; periksa nama menu sebelum menyimpan");
      }
      if (model.dropped)
        notes.push(model.dropped === 1 ? "satu bagian bukan makanan diabaikan oleh model" : `${model.dropped} bagian bukan makanan diabaikan oleh model`);
    } catch {
      model.used = false;
    }
  } else {
    notes.push("model pemeriksa tidak tersedia; hasil hanya dari warna dan bentuk");
  }

  /* Tahap 5 — skala dan porsi */
  await report(STAGE_NAMES[4], 4);
  const cmPerPx = plate.found ? plateCm / plate.diameterPx : 36 / W;
  if (!plate.found) notes.push("piring tidak terdeteksi; skala memakai lebar bingkai");
  const flat = (c: Cat) => (stage === "post" ? (c === "soup" ? 0.15 : 0.6) : 1);
  const items: VisionItem[] = ORDER.filter((c) => groups[c]).map((c) => {
    const g = groups[c] as Group;
    const def = CATS[c];
    const cm2 = g.n * cmPerPx * cmPerPx;
    const whiteFix = c === "rice" && plate.white ? 1.5 : 1;
    let grams = Math.round((cm2 * def.density * flat(c) * whiteFix) / 5) * 5;
    if (grams < 5) grams = 5;
    const areaFrac = g.n / N;
    /* Keyakinan = perkiraan "nama menu ini akan dibiarkan apa adanya oleh pengasuh", bukan sekadar
       luas bidang. Dasarnya angka ukur: presisi kelas ini pada foto uji saat model sudah yakin
       (p ≥ 0,6, tersimpan di berkas model). Peluang di bawah 0,6 diskalakan karena di situlah
       presisinya tidak pernah diukur; tanpa model dipakai angka ukur lapisan warna saja; nama hasil
       koreksi model dihukum sedikit karena warna dan model tidak sepakat. Luas dan keutuhan bentuk
       hanya memecah angka yang setara. */
    const pModel = g.p;
    const presisi = thr.precOf(c) ?? PREC_BAWAAN;
    let dasar: number;
    if (typeof pModel !== "number") dasar = AKURASI_WARNA_SAJA;
    else if (pModel >= 0.6) dasar = presisi;
    else dasar = Math.max(0.08, presisi * (0.4 + 0.6 * (pModel / 0.6)));
    if (g.rel) dasar *= 0.9;
    const ukuran = Math.min(1, areaFrac / 0.04);
    const utuh = g.count <= 3 ? 1 : 0.85;
    const conf = Math.max(0.12, Math.min(0.93, 0.72 * dasar + 0.1 * ukuran + 0.08 * utuh + (plate.found ? 0.1 : 0)));
    const menu = def.menu.slice();
    if (c === "orange" && plate.found && inPlate(g)) {
      menu.splice(menu.indexOf("Wortel rebus"), 1);
      menu.unshift("Wortel rebus");
    }
    return {
      cat: c,
      label: def.label,
      family: def.family,
      name: menu[0],
      alts: menu,
      grams,
      cm2: Math.round(cm2),
      areaFrac: +areaFrac.toFixed(4),
      box: { x: g.x0 / W, y: g.y0 / H, w: (g.x1 - g.x0 + 1) / W, h: (g.y1 - g.y0 + 1) / H },
      conf: +conf.toFixed(2),
      texture: Math.round(g.tex / g.n),
      parts: g.count,
      modelP: typeof g.p === "number" ? +g.p.toFixed(3) : undefined,
    };
  });
  items.sort((a, b) => b.grams - a.grams);
  if (items.length > 1) {
    const keep = items.filter((i) => i.areaFrac >= 0.0025);
    if (keep.length) items.splice(0, items.length, ...keep);
  }
  const totalG = items.reduce((s, i) => s + i.grams, 0);
  // Tanpa piring, skala berat hanya tebakan → keyakinan keseluruhan paling tinggi "sedang",
  // sejalan dengan catatan "perkiraan berat kurang tepat" yang tampil di layar.
  const confRaw = items.length ? items.reduce((s, i) => s + i.conf * i.grams, 0) / totalG : 0;
  const conf = +(plate.found ? confRaw : Math.min(confRaw, 0.79)).toFixed(2);
  let verdict: Verdict = "ok";
  if (!items.length) verdict = model.used && pFoodAll >= 0 && pFoodAll < 0.25 ? "no_food" : plate.found ? "empty_plate" : "no_plate";
  return {
    items,
    plate: { found: plate.found, white: plate.white, box: plate.box, cm: plateCm },
    cmPerPx,
    size: { w: W, h: H },
    ms: Math.round(now() - t0),
    conf,
    level: level(conf),
    notes: notes.filter((n, i) => notes.indexOf(n) === i),
    verdict,
    model,
  };
}

export const VERDICT_TEXT: Record<Verdict, string> = {
  ok: "",
  empty_plate: "Piring terlihat kosong — tidak ada makanan yang dikenali.",
  no_plate: "Piring dan makanan tidak ditemukan di foto. Arahkan kamera ke piring dari atas dengan cahaya cukup.",
  no_food: "Tidak ada makanan di foto ini menurut model. Pastikan piring berisi makanan terlihat penuh di bingkai.",
};

export function level(c: number): Level {
  return c >= 0.8 ? "tinggi" : c >= 0.65 ? "sedang" : "rendah";
}

/** Komponen terhubung (4-arah) untuk satu kelas piksel. */
/** Perbesar bingkai RGBA (bilinear) — dipakai agar skala tekstur yang dilihat model sama dengan skala latihnya. */
function upscale(img: ImageLike, s: number): ImageLike {
  const W = img.width;
  const H = img.height;
  const w = Math.round(W * s);
  const h = Math.round(H * s);
  const out = new Uint8ClampedArray(w * h * 4);
  const src = img.data;
  for (let y = 0; y < h; y++) {
    const fy = Math.min(H - 1, (y + 0.5) / s - 0.5);
    const y0 = Math.max(0, Math.floor(fy));
    const y1 = Math.min(H - 1, y0 + 1);
    const wy = fy - y0;
    for (let x = 0; x < w; x++) {
      const fx = Math.min(W - 1, (x + 0.5) / s - 0.5);
      const x0 = Math.max(0, Math.floor(fx));
      const x1 = Math.min(W - 1, x0 + 1);
      const wx = fx - x0;
      const o = (y * w + x) * 4;
      const a = (y0 * W + x0) * 4;
      const b = (y0 * W + x1) * 4;
      const c = (y1 * W + x0) * 4;
      const d = (y1 * W + x1) * 4;
      for (let k = 0; k < 3; k++) {
        out[o + k] = (src[a + k] * (1 - wx) + src[b + k] * wx) * (1 - wy) + (src[c + k] * (1 - wx) + src[d + k] * wx) * wy;
      }
      out[o + 3] = 255;
    }
  }
  return { data: out, width: w, height: h };
}

function components(cls: Uint8Array, W: number, H: number, k: number, tex: Uint8Array, sat: Float32Array, val: Float32Array): Comp[] {
  const N = W * H;
  const seen = new Uint8Array(N);
  const out: Comp[] = [];
  const st: number[] = [];
  for (let i = 0; i < N; i++) {
    if (cls[i] !== k || seen[i]) continue;
    const o: Comp = { k, n: 0, x0: W, y0: H, x1: 0, y1: 0, tex: 0, sat: 0, val: 0, thick: 0, elong: 0 };
    seen[i] = 1;
    st.push(i);
    while (st.length) {
      const j = st.pop() as number;
      const x = j % W;
      const y = (j - x) / W;
      o.n++;
      o.tex += tex[j];
      o.sat += sat[j];
      o.val += val[j];
      if (x < o.x0) o.x0 = x;
      if (x > o.x1) o.x1 = x;
      if (y < o.y0) o.y0 = y;
      if (y > o.y1) o.y1 = y;
      if (x > 0 && cls[j - 1] === k && !seen[j - 1]) {
        seen[j - 1] = 1;
        st.push(j - 1);
      }
      if (x < W - 1 && cls[j + 1] === k && !seen[j + 1]) {
        seen[j + 1] = 1;
        st.push(j + 1);
      }
      if (j >= W && cls[j - W] === k && !seen[j - W]) {
        seen[j - W] = 1;
        st.push(j - W);
      }
      if (j < N - W && cls[j + W] === k && !seen[j + W]) {
        seen[j + W] = 1;
        st.push(j + W);
      }
    }
    o.tex /= o.n;
    o.sat /= o.n;
    o.val /= o.n;
    out.push(o);
  }
  return out;
}

const boxOf = (o: { x0: number; y0: number; x1: number; y1: number }, W: number, H: number): NBox => ({
  x: o.x0 / W,
  y: o.y0 / H,
  w: (o.x1 - o.x0 + 1) / W,
  h: (o.y1 - o.y0 + 1) / H,
});

/* ---- Gizi ------------------------------------------------------------------------------- */

export interface FoodRef {
  name: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface ScanRow {
  name: string;
  grams: number;
  family?: Family | null;
  conf?: number;
  cat?: Cat;
}

export interface NutRow extends ScanRow {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  known: boolean;
}

export function nutrition(
  items: ScanRow[],
  foods: FoodRef[],
): { items: NutRow[]; total: { grams: number; kcal: number; protein: number; carbs: number; fat: number } } {
  const find = (n: string) => foods.find((f) => f.name.toLowerCase() === n.toLowerCase());
  const out: NutRow[] = items.map((it) => {
    const f = find(it.name) ?? { kcal: 0, protein: 0, carbs: 0, fat: 0 };
    const g = Math.max(0, +it.grams || 0);
    return {
      ...it,
      grams: g,
      kcal: Math.round((f.kcal * g) / 100),
      protein: +((f.protein * g) / 100).toFixed(1),
      carbs: +((f.carbs * g) / 100).toFixed(1),
      fat: +((f.fat * g) / 100).toFixed(1),
      known: !!find(it.name),
    };
  });
  const total = out.reduce(
    (t, i) => ({
      grams: t.grams + i.grams,
      kcal: t.kcal + i.kcal,
      protein: +(t.protein + i.protein).toFixed(1),
      carbs: +(t.carbs + i.carbs).toFixed(1),
      fat: +(t.fat + i.fat).toFixed(1),
    }),
    { grams: 0, kcal: 0, protein: 0, carbs: 0, fat: 0 },
  );
  return { items: out, total };
}

export function familyOf(name: string): Family {
  for (const k of Object.keys(CATS) as Cat[]) if (CATS[k].menu.some((m) => m.toLowerCase() === name.toLowerCase())) return CATS[k].family;
  return "other";
}

export interface LeftoverRow {
  name: string;
  pre: number;
  post: number;
  eaten: number;
}

/** Pasangkan sisa (sesudah makan) dengan menu yang disajikan: nama sama, atau keluarga sama. */
export function matchLeftovers(
  preItems: { name: string; grams: number; family?: Family | null }[],
  postItems: { name: string; grams: number; family?: Family | null }[],
): { rows: LeftoverRow[]; unmatched: string[] } {
  const used = new Set<number>();
  const rows: LeftoverRow[] = [];
  for (const p of preItems) {
    const fam = p.family ?? familyOf(p.name);
    let best: number | null = null;
    postItems.forEach((q, qi) => {
      if (used.has(qi)) return;
      const qf = q.family ?? familyOf(q.name);
      const same = q.name.toLowerCase() === p.name.toLowerCase();
      if (same || qf === fam) {
        if (best === null || same || q.grams > postItems[best].grams) best = qi;
      }
    });
    let post = 0;
    if (best !== null) {
      used.add(best);
      post = Math.min(p.grams, postItems[best].grams);
    }
    rows.push({ name: p.name, pre: p.grams, post, eaten: p.grams - post });
  }
  const unmatched = postItems.filter((_, qi) => !used.has(qi)).map((q) => q.name);
  return { rows, unmatched };
}

export interface ConsumptionItem extends LeftoverRow {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export function consumption(
  rows: LeftoverRow[],
  foods: FoodRef[],
): { items: ConsumptionItem[]; total: { pre: number; post: number; kcal: number; protein: number; carbs: number; fat: number; pct: number } } {
  const find = (n: string) => foods.find((f) => f.name.toLowerCase() === n.toLowerCase()) ?? { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  const items: ConsumptionItem[] = rows.map((r) => {
    const f = find(r.name);
    const e = Math.max(0, r.pre - r.post);
    return {
      name: r.name,
      pre: r.pre,
      post: r.post,
      eaten: e,
      kcal: Math.round((f.kcal * e) / 100),
      protein: +((f.protein * e) / 100).toFixed(1),
      carbs: +((f.carbs * e) / 100).toFixed(1),
      fat: +((f.fat * e) / 100).toFixed(1),
    };
  });
  const t = items.reduce(
    (a, i) => ({
      pre: a.pre + i.pre,
      post: a.post + i.post,
      kcal: a.kcal + i.kcal,
      protein: +(a.protein + i.protein).toFixed(1),
      carbs: +(a.carbs + i.carbs).toFixed(1),
      fat: +(a.fat + i.fat).toFixed(1),
    }),
    { pre: 0, post: 0, kcal: 0, protein: 0, carbs: 0, fat: 0 },
  );
  return { items, total: { ...t, pct: t.pre ? Math.round(((t.pre - t.post) / t.pre) * 100) : 0 } };
}

/* ---- Bagian yang butuh peramban: kamera, kanvas, gambar ------------------------------------ */

export type MediaSource = HTMLVideoElement | HTMLImageElement | HTMLCanvasElement;

function mediaSize(src: MediaSource): [number, number] {
  if (src instanceof HTMLVideoElement) return [src.videoWidth, src.videoHeight];
  if (src instanceof HTMLImageElement) return [src.naturalWidth, src.naturalHeight];
  return [src.width, src.height];
}

export function frame(src: MediaSource, maxW = 320): { canvas: HTMLCanvasElement; imageData: ImageData } | null {
  const [sw, sh] = mediaSize(src);
  if (!sw || !sh) return null;
  const k = Math.min(1, maxW / sw);
  const w = Math.max(16, Math.round(sw * k));
  const h = Math.max(16, Math.round(sh * k));
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(src, 0, 0, w, h);
  return { canvas: cv, imageData: ctx.getImageData(0, 0, w, h) };
}

export function thumb(src: MediaSource, w = 240, q = 0.62): string | null {
  const f = frame(src, w);
  if (!f) return null;
  try {
    return f.canvas.toDataURL("image/jpeg", q);
  } catch {
    return null;
  }
}

export function analyze(src: MediaSource, opts: AnalyzeOpts): Promise<VisionResult> {
  const f = frame(src, 320);
  if (!f) return Promise.reject(new Error("Gambar belum siap."));
  return analyzeImageData(f.imageData, opts);
}

export const camera = {
  stream: null as MediaStream | null,
  facing: "environment" as "environment" | "user",
  supported(): boolean {
    return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia && window.isSecureContext !== false;
  },
  async start(video: HTMLVideoElement): Promise<MediaStream> {
    this.stop(video);
    const s = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: this.facing }, width: { ideal: 1280 }, height: { ideal: 960 } },
      audio: false,
    });
    this.stream = s;
    video.srcObject = s;
    await new Promise<void>((res) => {
      if (video.readyState >= 2) res();
      else video.onloadedmetadata = () => res();
    });
    try {
      await video.play();
    } catch {
      /* autoplay ditolak: video tetap punya bingkai */
    }
    return s;
  },
  stop(video?: HTMLVideoElement | null): void {
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    if (video) {
      try {
        video.pause();
      } catch {
        /* abaikan */
      }
      video.srcObject = null;
    }
  },
  async count(): Promise<number> {
    try {
      const d = await navigator.mediaDevices.enumerateDevices();
      return d.filter((x) => x.kind === "videoinput").length;
    } catch {
      return 0;
    }
  },
  flip(): void {
    this.facing = this.facing === "environment" ? "user" : "environment";
  },
};

export interface DrawOpts {
  guide?: boolean;
  media?: MediaSource | null;
}

/** Gambar kotak hasil di kanvas lapisan (koordinat ternormalisasi, mengikuti object-fit: contain). */
export function draw(
  canvas: HTMLCanvasElement | null,
  result: { items: { name: string; grams?: number; box: NBox }[]; plate?: { found: boolean; box: NBox | null } } | null,
  opts: DrawOpts = {},
): void {
  if (!canvas) return;
  const r = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || 320;
  const h = canvas.clientHeight || 240;
  canvas.width = Math.round(w * r);
  canvas.height = Math.round(h * r);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(r, 0, 0, r, 0, 0);
  ctx.clearRect(0, 0, w, h);
  if (opts.guide) {
    ctx.save();
    ctx.setLineDash([6, 6]);
    ctx.strokeStyle = "rgba(255,255,255,.75)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(w / 2, h / 2, Math.min(w, h) * 0.42, Math.min(w, h) * 0.42, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    return;
  }
  if (!result) return;
  let ox = 0;
  let oy = 0;
  let cw = w;
  let ch = h;
  const m = opts.media;
  const [mw, mh] = m ? mediaSize(m) : [0, 0];
  if (mw && mh) {
    const sc = Math.min(w / mw, h / mh);
    cw = mw * sc;
    ch = mh * sc;
    ox = (w - cw) / 2;
    oy = (h - ch) / 2;
  }
  const small = cw < 480;
  ctx.font = "600 " + (small ? 10 : 12) + "px Inter, system-ui, sans-serif";
  ctx.textBaseline = "middle";
  if (result.plate?.found && result.plate.box) {
    const b = result.plate.box;
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = "rgba(255,255,255,.55)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(ox + b.x * cw, oy + b.y * ch, b.w * cw, b.h * ch);
    ctx.restore();
  }
  for (const it of result.items) {
    const b = it.box;
    if (!b) continue;
    const x = ox + b.x * cw;
    const y = oy + b.y * ch;
    const bwid = b.w * cw;
    const bh = b.h * ch;
    ctx.strokeStyle = "#5EEAD4";
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, bwid, bh);
    const label = it.name + (it.grams && !small ? " · " + it.grams + " g" : "");
    const tw = ctx.measureText(label).width + 14;
    const th = small ? 17 : 20;
    const inside = bh > th * 2.6 && bwid > tw + 8;
    const lx = Math.max(ox, Math.min(inside ? x + 3 : x, ox + cw - tw));
    const ly = inside ? y + 3 : y - th - 4 >= oy ? y - th - 4 : y + 4;
    ctx.fillStyle = "rgba(11,11,13,.86)";
    ctx.fillRect(lx, ly, tw, th);
    ctx.fillStyle = "#fff";
    ctx.fillText(label, lx + 7, ly + th / 2);
  }
}
