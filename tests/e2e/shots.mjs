// Tangkapan layar cepat untuk memeriksa desain (bukan uji fungsional).
// Pakai: node shots.mjs [parent|caregiver|admin|landing|all]
import { chromium } from "playwright-core";
import fs from "node:fs";

const BASE = process.env.BASE ?? "http://127.0.0.1:3000";
const which = process.argv[2] ?? "all";
const USERS = {
  parent: ["andi.lestari@gmail.com", "Kirana2026"],
  caregiver: ["ratna.dewi@ceriaananda.id", "Ratna2026"],
  admin: ["hendra@ceriaananda.id", "Hendra2026"],
};
const TABS = {
  parent: ["beranda", "aktivitas", "makan", "tidur", "mood", "kehadiran", "dokumentasi", "profil", "pesan", "pemberitahuan", "umpan-balik", "kamera", "kesehatan", "perkembangan", "laporan"],
  caregiver: ["anak", "aktivitas", "makan", "tidur", "mood", "kehadiran", "pindai", "obat", "kejadian", "serah-terima", "pesan", "kamera"],
  admin: ["ringkasan", "dashboard", "analitik-aktivitas", "mood", "tidur", "makan", "kehadiran", "laporan", "rekomendasi", "pesan", "kepercayaan", "kamera", "perangkat", "catatan", "akses", "akun", "permintaan", "pengaturan"],
};
const only = process.env.TABS ? process.env.TABS.split(",") : null;

fs.mkdirSync("shots", { recursive: true });
const browser = await chromium.launch();
const errors = [];

async function login(page, role) {
  const [email, pw] = USERS[role];
  await page.goto(BASE + "/login", { waitUntil: "load" });
  await page.fill("#email", email);
  await page.fill("#password", pw);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 }), page.click('button[type="submit"]')]);
}

async function shoot(page, name, full = false) {
  await page.waitForTimeout(900);
  await page.screenshot({ path: `shots/${name}.png`, fullPage: full });
  console.log("shot", name);
}

if (which === "landing" || which === "all") {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 800 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(["landing", e.message]));
  await page.goto(BASE + "/", { waitUntil: "load" });
  await shoot(page, "landing", true);
  await page.goto(BASE + "/login", { waitUntil: "load" });
  await shoot(page, "login");
  await ctx.close();
}

for (const role of ["parent", "caregiver", "admin"]) {
  if (which !== "all" && which !== role) continue;
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 800 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push([role, e.message]));
  page.on("console", (m) => {
    if (m.type() === "error" && !/40[1-9]|410|422|Failed to load resource/.test(m.text())) errors.push([role, "console: " + m.text()]);
  });
  await login(page, role);
  await page.goto(BASE + "/dashboard", { waitUntil: "load" });
  await shoot(page, `${role}-hub`);
  const home = "/" + role;
  await page.goto(BASE + home, { waitUntil: "load" });
  // tunggu hidrasi: Next menulis ulang URL saat hidrasi, hash yang diset sebelum itu bisa hilang
  await page.waitForTimeout(1500);
  for (const t of TABS[role]) {
    if (only && !only.includes(t)) continue;
    await page.evaluate((h) => {
      location.hash = h;
    }, t);
    await page.waitForTimeout(1200);
    if (process.env.RANGE) {
      const b = page.locator(`button:has-text("${process.env.RANGE}")`).first();
      if (await b.count()) {
        await b.click();
        await page.waitForTimeout(1500);
      }
    }
    await shoot(page, `${role}-${t}`, process.env.FULL === "1");
  }
  if (process.env.MOBILE === "1") {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => {
      location.hash = "";
    });
    await page.goto(BASE + home, { waitUntil: "load" });
    await shoot(page, `${role}-mobile`);
  }
  await ctx.close();
}
await browser.close();
if (errors.length) {
  console.log("ERRORS:");
  for (const e of errors) console.log(" -", e.join(": "));
}
