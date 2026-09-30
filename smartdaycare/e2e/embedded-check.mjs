// Uji peramban sungguhan terhadap alamat pratinjau publik, persis seperti pratinjau tersemat:
// aplikasi dibuka di dalam <iframe> dari situs lain, lewat proxy yang membuang cookie dan hanya
// melayani permintaan berdest "iframe". Pakai:  node embedded-check.mjs https://alamat-pratinjau
import http from "node:http";
import { chromium } from "playwright-core";
import { chromeExecutable } from "./browser.mjs";
const BASE = process.argv[2];
if (!BASE) {
  console.error("Pakai: node embedded-check.mjs https://alamat-pratinjau");
  process.exit(2);
}
const host = http
  .createServer((req, res) => {
    res.setHeader("Content-Type", "text/html");
    res.end(`<!doctype html><html><body style="margin:0"><iframe id="f" src="${BASE}/login" allow="camera" style="width:100vw;height:100vh;border:0"></iframe></body></html>`);
  })
  .listen(3999);
const b = await chromium.launch({ executablePath: chromeExecutable(chromium), args: ["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, locale: "id-ID", bypassCSP: true });
const page = await ctx.newPage();
// Host uji ini bukan arena.ai, jadi frame-ancestors dari aplikasi akan menolaknya; header CSP
// dibuang hanya pada respons dokumen agar bingkai bisa dibuka (permintaan tetap asli ke proxy).
const target = new URL(BASE).hostname;
await ctx.route((u) => u.hostname === target, async (route) => {
  if (route.request().resourceType() !== "document") return route.continue();
  const res = await route.fetch({ headers: { ...route.request().headers(), "sec-fetch-dest": "iframe", "sec-fetch-mode": "navigate", "sec-fetch-site": "cross-site" } });
  const headers = { ...res.headers() };
  delete headers["content-security-policy"];
  delete headers["x-frame-options"];
  return route.fulfill({ response: res, headers });
});
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 160)); });
const t0 = Date.now();
await page.goto("http://127.0.0.1:3999/", { waitUntil: "load" });
const fh = await page.waitForSelector("#f");
const frame = await fh.contentFrame();
await frame.waitForSelector("#email", { timeout: 20000 });
console.log("halaman masuk di dalam bingkai:", Date.now() - t0, "ms");
console.log("petunjuk 'tab baru' ada?", (await frame.getByText(/tab baru|bingkai/i).count()) > 0);
await frame.fill("#email", "andi.lestari@gmail.com");
await frame.fill("#password", "Kirana2026");
const t1 = Date.now();
await frame.click('button[type="submit"]');
await frame.waitForURL((u) => u.pathname === "/dashboard", { timeout: 30000 });
await frame.waitForFunction(() => document.body.innerText.includes("Andi"), null, { timeout: 15000 });
console.log("masuk → hub dengan nama:", Date.now() - t1, "ms;", frame.url());
console.log("cookie di peramban:", (await ctx.cookies()).map((c) => c.name).join(",") || "(tidak ada)");
await frame.evaluate((u) => window.location.assign(u), BASE + "/parent#gizi");
await frame.waitForFunction(() => location.pathname === "/parent" && document.body.innerText.includes("Makan siang"), null, { timeout: 20000 });
await frame.waitForTimeout(3000);
const imgs = await frame.evaluate(() => Array.from(document.images).map((i) => [i.src.slice(0, 5), i.naturalWidth]));
console.log("foto piring (blob, lebar px):", JSON.stringify(imgs.filter((x) => x[0] === "blob:")));
await page.screenshot({ path: "shots/public-frame-parent-gizi.png" });
await frame.evaluate(() => window.location.reload());
await frame.waitForFunction(() => location.pathname === "/parent" && document.body.innerText.includes("Makan siang") && document.images.length > 0, null, { timeout: 20000 });
await frame.waitForTimeout(1000);
console.log("muat ulang di dalam bingkai: sesi bertahan ✓");
// navigasi lewat tautan menu (klik) di dalam bingkai
await frame.getByRole("link", { name: "Akun & privasi" }).first().click();
await frame.waitForFunction(() => location.pathname === "/account" && document.body.innerText.includes("Profil"), null, { timeout: 20000 });
console.log("navigasi menu (klien) → /account ✓");
await frame.evaluate(() => { window.location.hash = "keamanan"; });
await frame.waitForTimeout(1500);
console.log("akun:", await frame.evaluate(() => (document.body.innerText.match(/Di peramban ini sesi[^.]*\./) || ["(penjelasan cookie biasa)"])[0]));
await frame.getByRole("button", { name: /^Keluar/ }).first().click();
await frame.waitForFunction(() => location.search.includes("out=1"), null, { timeout: 20000 });
console.log("keluar ✓", frame.url());
await frame.evaluate((u) => window.location.assign(u), BASE + "/parent");
await frame.waitForFunction(() => location.pathname === "/login", null, { timeout: 15000 }).catch(() => {});
console.log("setelah keluar /parent →", frame.url());
console.log("console errors:", errors);
await ctx.unrouteAll({ behavior: "ignoreErrors" });
await b.close();
host.close();
