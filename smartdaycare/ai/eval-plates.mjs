// Evaluasi ujung-ke-ujung pemindai (segmentasi warna + model) pada foto uji: node eval-plates.mjs <vision.js> <evalset> [bin ...]
import fs from "node:fs";
import path from "node:path";

const [modPath, setDir, ...bins] = process.argv.slice(2);
const mod = await import(path.resolve(modPath));
const fn = await import(path.resolve(path.dirname(modPath), "foodnet.js"));
const index = JSON.parse(fs.readFileSync(path.join(setDir, "index.json"), "utf8"));

async function run(net, label) {
  let hit = 0, extras = 0, noFood = 0, items = 0, ms = 0, hitAll = 0;
  const perClass = {};
  for (const e of index) {
    const buf = fs.readFileSync(path.join(setDir, e.raw));
    const img = { data: new Uint8ClampedArray(buf.buffer, buf.byteOffset, buf.byteLength), width: e.w, height: e.h };
    const t = Date.now();
    const r = await mod.analyzeImageData(img, { net, stage: "pre" });
    ms += Date.now() - t;
    const cats = new Set(r.items.map((i) => i.cat));
    const truth = e.labels.filter((l) => l !== "none");
    const primary = e.labels[0];
    if (primary === "none") {
      if (r.items.length === 0) hit++;
      extras += r.items.length;
      if (r.verdict === "no_food" || r.verdict === "empty_plate" || r.verdict === "no_plate") noFood++;
    } else {
      if (cats.has(primary)) hit++;
      if (truth.every((l) => cats.has(l))) hitAll++;
      extras += [...cats].filter((c) => !truth.includes(c)).length;
    }
    items += r.items.length;
    const pc = (perClass[primary] ||= { n: 0, hit: 0 });
    pc.n++;
    if (primary === "none" ? r.items.length === 0 : cats.has(primary)) pc.hit++;
  }
  const n = index.length;
  console.log(
    `${label.padEnd(10)} kelas utama terdeteksi ${(hit / n).toFixed(3)} · semua label ${(hitAll / n).toFixed(3)} · kelas asing/foto ${(extras / n).toFixed(2)} · butir/foto ${(items / n).toFixed(2)} · ${Math.round(ms / n)} ms/foto`
  );
  console.log("   per kelas:", Object.entries(perClass).map(([k, v]) => `${k} ${v.hit}/${v.n}`).join("  "));
}

await run(null, "tanpa model");
for (const b of bins) {
  const buf = fs.readFileSync(b);
  const net = fn.parseFoodNet(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  await run(net, path.basename(b, ".bin"));
}
