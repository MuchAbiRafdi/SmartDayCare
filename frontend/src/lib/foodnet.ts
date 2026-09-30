/*
 * Runtime jaringan pengenal makanan untuk peramban.
 *
 * Memuat bobot terlatih dari /models/food-patch-v2.bin (dilatih dengan
 * ai/train.py, diekspor ai/export.py) dan menjalankannya sepenuhnya
 * konvolusional pada bingkai analisis: hasilnya peta kelas rapat berlangkah
 * 8 px, tiap sel mewakili jendela ±48 px. Tidak ada pustaka luar; seluruh
 * operasi hanya konvolusi 3×3 + ReLU, max-pool 2×2, rata-rata jendela, softmax.
 * Berkas ini sengaja tanpa impor supaya bisa diuji langsung di Node (ai/verify.mjs).
 */

export interface NetImage {
  data: Uint8ClampedArray | Uint8Array;
  width: number;
  height: number;
}

interface ConvLayer {
  type: "conv";
  cin: number;
  cout: number;
  pool: boolean;
  w: Float32Array;
  b: Float32Array;
}

interface FcLayer {
  type: "fc";
  cin: number;
  cout: number;
  w: Float32Array;
  b: Float32Array;
}

export interface FoodNet {
  classes: string[];
  none: number;
  mean: number[];
  std: number[];
  patch: number;
  window: number;
  stride: number;
  /** suhu softmax hasil kalibrasi; 1 = model lama tanpa kalibrasi */
  temperature: number;
  layers: (ConvLayer | FcLayer)[];
  meta: Record<string, unknown>;
}

export interface DenseMap {
  /** jumlah sel mendatar dan menurun */
  w: number;
  h: number;
  /** langkah sel dalam piksel bingkai */
  stride: number;
  /** probabilitas per sel, panjang w*h*classes */
  probs: Float32Array;
  classes: string[];
  none: number;
  ms: number;
}

const MAGIC = "SDFN";

function halfToFloat(h: number): number {
  const s = h & 0x8000 ? -1 : 1;
  const e = (h >> 10) & 0x1f;
  const f = h & 0x3ff;
  if (e === 0) return s * Math.pow(2, -14) * (f / 1024);
  if (e === 31) return f ? NaN : s * Infinity;
  return s * Math.pow(2, e - 15) * (1 + f / 1024);
}

export function parseFoodNet(buf: ArrayBuffer): FoodNet {
  const dv = new DataView(buf);
  const magic = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
  if (magic !== MAGIC) throw new Error("berkas model tidak dikenali");
  const version = dv.getUint32(4, true);
  if (version !== 1) throw new Error(`versi model ${version} tidak didukung`);
  const hlen = dv.getUint32(8, true);
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 12, hlen))) as {
    classes: string[];
    mean: number[];
    std: number[];
    patch: number;
    window: number;
    stride: number;
    temperature?: number;
    layers: { name: string; type: "conv" | "fc"; cin: number; cout: number; k: number; pool: boolean }[];
    meta: Record<string, unknown>;
  };
  let off = 12 + hlen;
  const u16 = new Uint16Array(buf.slice(off, off + ((buf.byteLength - off) >> 1) * 2));
  let p = 0;
  const take = (n: number) => {
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) out[i] = halfToFloat(u16[p + i]);
    p += n;
    return out;
  };
  const layers: (ConvLayer | FcLayer)[] = header.layers.map((l) => {
    if (l.type === "conv") {
      const w = take(l.cout * l.cin * l.k * l.k);
      const b = take(l.cout);
      return { type: "conv", cin: l.cin, cout: l.cout, pool: l.pool, w, b };
    }
    const w = take(l.cout * l.cin);
    const b = take(l.cout);
    return { type: "fc", cin: l.cin, cout: l.cout, w, b };
  });
  off += p * 2;
  const metaTemp = Number((header.meta as { temperature?: unknown }).temperature);
  return {
    classes: header.classes,
    none: header.classes.indexOf("none"),
    mean: header.mean,
    std: header.std,
    patch: header.patch,
    window: header.window,
    stride: header.stride,
    temperature: Number.isFinite(header.temperature ?? metaTemp) && Number(header.temperature ?? metaTemp) > 0 ? Number(header.temperature ?? metaTemp) : 1,
    layers,
    meta: header.meta,
  };
}

let cached: Promise<FoodNet | null> | null = null;

/** Berkas yang dicoba berurutan; model baru dipakai begitu tersedia, model lama tetap jalan bila belum ada. */
export const MODEL_URLS = ["/models/food-patch-v3.bin", "/models/food-patch-v2.bin"];

/** Memuat model sekali per sesi; null bila berkas tidak tersedia (mis. luring). */
export function loadFoodNet(url?: string | string[]): Promise<FoodNet | null> {
  if (!cached) {
    cached = (async () => {
      const urls = Array.isArray(url) ? url : url ? [url] : MODEL_URLS;
      for (const u of urls) {
        try {
          const r = await fetch(u, { cache: "force-cache" });
          if (!r.ok) continue;
          const net = parseFoodNet(await r.arrayBuffer());
          if (net.layers.length) return net;
        } catch {
          // coba berkas berikutnya
        }
      }
      return null;
    })().then((net) => {
      if (!net) cached = null; // coba lagi pada pemanggilan berikutnya
      return net;
    });
  }
  return cached;
}

/* ------------------------------------------------------------ operasi ---- */

function conv3x3Relu(inp: Float32Array, cin: number, H: number, W: number, L: ConvLayer): Float32Array {
  const { cout, w, b } = L;
  const plane = H * W;
  const out = new Float32Array(cout * plane);
  for (let co = 0; co < cout; co++) {
    const ob = co * plane;
    out.fill(b[co], ob, ob + plane);
    for (let ci = 0; ci < cin; ci++) {
      const ib = ci * plane;
      const wb = (co * cin + ci) * 9;
      for (let ky = 0; ky < 3; ky++) {
        const dy = ky - 1;
        const y0 = Math.max(0, -dy);
        const y1 = Math.min(H, H - dy);
        for (let kx = 0; kx < 3; kx++) {
          const dx = kx - 1;
          const wv = w[wb + ky * 3 + kx];
          if (wv === 0) continue;
          const x0 = Math.max(0, -dx);
          const x1 = Math.min(W, W - dx);
          for (let y = y0; y < y1; y++) {
            const ro = ob + y * W;
            const ri = ib + (y + dy) * W + dx;
            for (let x = x0; x < x1; x++) out[ro + x] += wv * inp[ri + x];
          }
        }
      }
    }
    for (let i = ob; i < ob + plane; i++) if (out[i] < 0) out[i] = 0;
  }
  return out;
}

function maxPool2(inp: Float32Array, C: number, H: number, W: number): { out: Float32Array; H: number; W: number } {
  const h = H >> 1;
  const w = W >> 1;
  const out = new Float32Array(C * h * w);
  for (let c = 0; c < C; c++) {
    const ib = c * H * W;
    const ob = c * h * w;
    for (let y = 0; y < h; y++) {
      const r0 = ib + 2 * y * W;
      const r1 = r0 + W;
      const ro = ob + y * w;
      for (let x = 0; x < w; x++) {
        const i = 2 * x;
        let m = inp[r0 + i];
        const a = inp[r0 + i + 1];
        const bb = inp[r1 + i];
        const d = inp[r1 + i + 1];
        if (a > m) m = a;
        if (bb > m) m = bb;
        if (d > m) m = d;
        out[ro + x] = m;
      }
    }
  }
  return { out, H: h, W: w };
}

/**
 * Menjalankan jaringan pada seluruh bingkai. `onLayer` dipanggil di antara
 * lapisan agar antarmuka sempat bernapas (pekerjaan berlangsung di utas utama).
 */
export async function denseMap(net: FoodNet, img: NetImage, onLayer?: () => Promise<void> | void): Promise<DenseMap> {
  const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
  let H = img.height;
  let W = img.width;
  const plane = H * W;
  let x: Float32Array = new Float32Array(3 * plane);
  const src = img.data;
  const ch = src.length / plane; // 4 untuk ImageData, 3 untuk RGB mentah
  for (let c = 0; c < 3; c++) {
    const m = net.mean[c];
    const s = net.std[c];
    for (let i = 0; i < plane; i++) x[c * plane + i] = (src[i * ch + c] / 255 - m) / s;
  }
  let C = 3;
  for (const L of net.layers) {
    if (L.type === "conv") {
      x = conv3x3Relu(x, C, H, W, L);
      C = L.cout;
      if (L.pool) {
        const p = maxPool2(x, C, H, W);
        x = p.out;
        H = p.H;
        W = p.W;
      }
      if (onLayer) await onLayer();
    }
  }
  const fc = net.layers[net.layers.length - 1] as FcLayer;
  const K = fc.cout;
  const cells = H * W;
  // logit per sel
  const logits = new Float32Array(cells * K);
  for (let i = 0; i < cells; i++) {
    for (let k = 0; k < K; k++) {
      let s = fc.b[k];
      const wb = k * C;
      for (let c = 0; c < C; c++) s += fc.w[wb + c] * x[c * cells + i];
      logits[i * K + k] = s;
    }
  }
  // rata-rata jendela 6×6 sel (sama dengan rata-rata global pada tambalan 48 px)
  const half = net.window >> 1; // 3
  const probs = new Float32Array(cells * K);
  const acc = new Float32Array(K);
  for (let y = 0; y < H; y++) {
    const ya = Math.max(0, y - half);
    const yb = Math.min(H - 1, y + net.window - half - 1);
    for (let xx = 0; xx < W; xx++) {
      const xa = Math.max(0, xx - half);
      const xb = Math.min(W - 1, xx + net.window - half - 1);
      acc.fill(0);
      let n = 0;
      for (let yy = ya; yy <= yb; yy++)
        for (let x2 = xa; x2 <= xb; x2++) {
          const base = (yy * W + x2) * K;
          for (let k = 0; k < K; k++) acc[k] += logits[base + k];
          n++;
        }
      let mx = -Infinity;
      for (let k = 0; k < K; k++) {
        acc[k] /= n;
        if (acc[k] > mx) mx = acc[k];
      }
      let sum = 0;
      for (let k = 0; k < K; k++) {
        acc[k] = Math.exp(acc[k] - mx);
        sum += acc[k];
      }
      const ob = (y * W + xx) * K;
      for (let k = 0; k < K; k++) probs[ob + k] = acc[k] / sum;
    }
  }
  const t1 = typeof performance !== "undefined" ? performance.now() : Date.now();
  return { w: W, h: H, stride: net.stride, probs, classes: net.classes, none: net.none, ms: Math.round(t1 - t0) };
}

/** Probabilitas rata-rata pada sel-sel yang lolos `keep` (koordinat piksel pusat sel). */
export function meanProbs(map: DenseMap, keep: (px: number, py: number) => boolean): { probs: Float32Array; cells: number } {
  const K = map.classes.length;
  const acc = new Float32Array(K);
  let n = 0;
  for (let y = 0; y < map.h; y++)
    for (let x = 0; x < map.w; x++) {
      const px = x * map.stride + (map.stride >> 1);
      const py = y * map.stride + (map.stride >> 1);
      if (!keep(px, py)) continue;
      const b = (y * map.w + x) * K;
      for (let k = 0; k < K; k++) acc[k] += map.probs[b + k];
      n++;
    }
  if (n) for (let k = 0; k < K; k++) acc[k] /= n;
  return { probs: acc, cells: n };
}

export function argmax(p: ArrayLike<number>): number {
  let bi = 0;
  for (let i = 1; i < p.length; i++) if (p[i] > p[bi]) bi = i;
  return bi;
}
