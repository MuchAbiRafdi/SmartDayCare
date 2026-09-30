// Audit satu foto piring lewat jalur aplikasi: warna+bentuk → model → daftar menu + gram.
//
// Persiapan (tidak pakai pustaka gambar — konversi dilakukan Python dengan Pillow):
//   python3 - <<'PY'
//   import numpy as np; from PIL import Image
//   im = Image.open("web/public/img/plate-before.jpg").convert("RGB")   # atau foto asli
//   w, h = im.size; s = min(1.0, 320 / w)
//   im = im.resize((max(1, round(w * s)), max(1, round(h * s))), Image.BILINEAR)
//   a = np.asarray(im); np.concatenate([a, np.full(a.shape[:2] + (1,), 255, np.uint8)], 2).tofile("/tmp/plate.rgba")
//   print(im.size)
//   PY
//
// Jalankan (vision.js hasil tsc lihat README):
//   node ../ai/plate-check.mjs /tmp/fn/vision.js 774 578 /tmp/plate.rgba public/models/food-patch-v3.bin
import fs from "node:fs";
import path from "node:path";

const [modPath, wStr, hStr, rgbaPath, ...bins] = process.argv.slice(2);
if (!modPath || !wStr || !hStr || !rgbaPath) {
  console.error("pakai: node plate-check.mjs <vision.js> <lebar> <tinggi> <foto.rgba> [bin ...]");
  process.exit(2);
}
const mod = await import(path.resolve(modPath));
const fn = await import(path.resolve(path.dirname(modPath), "foodnet.js"));
const width = Number(wStr);
const height = Number(hStr);
const buf = fs.readFileSync(rgbaPath);
const img = { data: new Uint8ClampedArray(buf.buffer, buf.byteOffset, buf.byteLength), width, height };

const nets = [["tanpa model", null]];
for (const b of bins) {
  const raw = await fs.promises.readFile(b);
  nets.push([path.basename(b), fn.parseFoodNet(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength))]);
}

for (const [label, net] of nets) {
  const t = Date.now();
  const r = await mod.analyzeImageData(img, { net, stage: "pre" });
  const ms = Date.now() - t;
  const items = r.items.map((i) => `${i.label} ≈${Math.round(i.grams)} g (${mod.level(i.conf)})`);
  console.log(`${label.padEnd(26)} verdict=${r.verdict} level=${r.level} ${ms}ms · piring ${r.plate.found ? `diameter ${Math.round(r.plate.cm)} cm` : "tidak terdeteksi"}`);
  console.log(`${"".padEnd(26)} menu: ${items.join(" · ") || "tidak ada"}`);
  console.log(`${"".padEnd(26)} model: ${r.model.used ? `${r.model.name} — ${r.model.relabeled} menu dikoreksi, ${r.model.dropped} dibuang` : "tidak dipakai"}${r.notes.length ? ` · catatan: ${r.notes.join("; ")}` : ""}`);
}
