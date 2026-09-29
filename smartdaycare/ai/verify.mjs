// Verifikasi numerik runtime peramban (web/src/lib/foodnet.ts) terhadap PyTorch.
// Pakai: npx tsc web/src/lib/foodnet.ts --outDir /tmp/fn --module es2022 --target es2020 --moduleResolution bundler
//        node ai/verify.mjs /tmp/fn/foodnet.js ai/models/verify-sample.json web/public/models/food-patch-v1.bin
// Hasil yang diharapkan: maxAbsDiff < 0,01 dan argmaxAgreement 1 (contoh dihitung PyTorch mode eval).
import fs from "node:fs";
const [, , mod, samplePath, binPath] = process.argv;
const { parseFoodNet, denseMap } = await import(mod);
const sample = JSON.parse(fs.readFileSync(samplePath, "utf8"));
const buf = fs.readFileSync(binPath);
const net = parseFoodNet(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const img = { width: sample.w, height: sample.h, data: Uint8Array.from(sample.img) };
const map = await denseMap(net, img);
const exp = sample.probs;
let maxDiff = 0, agree = 0;
const K = net.classes.length;
for (let i = 0; i < map.w * map.h; i++) {
  let a = 0, b = 0;
  for (let k = 0; k < K; k++) {
    const d = Math.abs(map.probs[i * K + k] - exp[i * K + k]);
    if (d > maxDiff) maxDiff = d;
    if (map.probs[i * K + k] > map.probs[i * K + a]) a = k;
    if (exp[i * K + k] > exp[i * K + b]) b = k;
  }
  if (a === b) agree++;
}
console.log(JSON.stringify({ cells: map.w * map.h, expectedCells: exp.length / K, maxAbsDiff: +maxDiff.toFixed(5), argmaxAgreement: agree / (map.w * map.h), ms: map.ms }));
// waktu pada bingkai 320×240
const big = { width: 320, height: 240, data: new Uint8Array(320 * 240 * 4).map(() => Math.random() * 255) };
const t = Date.now();
await denseMap(net, big);
console.log("320x240 ms:", Date.now() - t);
