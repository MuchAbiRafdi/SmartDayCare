// Uji sinkronisasi lintas dasbor: orang tua & admin membuka halaman, pengasuh mencatat —
// perubahan harus muncul di dasbor lain TANPA muat ulang, dan angka di semua dasbor harus sama.
import { chromium } from "playwright-core";

const BASE = process.env.BASE ?? "http://127.0.0.1:3000";
const browser = await chromium.launch();
const results = [];
const ok = (name, cond, extra = "") => {
  results.push([cond ? "PASS" : "FAIL", name, extra]);
  console.log((cond ? "PASS " : "FAIL ") + name + (extra ? " — " + extra : ""));
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function login(page, email, pw) {
  await page.goto(BASE + "/login", { waitUntil: "load" });
  await page.fill("#email", email);
  await page.fill("#password", pw);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 }), page.click('button[type="submit"]')]);
}
async function go(page, path) {
  await page.goto(BASE + path, { waitUntil: "load" });
  await page.waitForTimeout(1500);
}
async function mk() {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  return { ctx, page };
}
async function waitText(page, re, timeout = 12000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const t = await page.locator("main").innerText().catch(() => "");
    if (re.test(t)) return t;
    await sleep(400);
  }
  return null;
}
const tile = (txt, label) => {
  // "Aktivitas\n4\n/ 8" → 4 ; "Makan\n3x" → 3
  const m = txt.match(new RegExp(label + "\\s*\\n\\s*(\\d+)"));
  return m ? Number(m[1]) : null;
};

const parent = await mk();
const admin = await mk();
const cg = await mk();
await login(parent.page, "andi.lestari@gmail.com", "Kirana2026");
await login(admin.page, "hendra@ceriaananda.id", "Hendra2026");
await login(cg.page, "ratna.dewi@ceriaananda.id", "Ratna2026");

// Orang tua menunggu di Beranda; admin di Catatan Harian; pengasuh mencatat.
await go(parent.page, "/parent#beranda");
await go(admin.page, "/admin#catatan");
const before = await parent.page.locator("main").innerText();
const actBefore = tile(before, "Aktivitas");
const foodBefore = tile(before, "Makan");
ok("baseline: ubin ringkasan terbaca", actBefore != null && foodBefore != null, `aktivitas=${actBefore} makan=${foodBefore}`);

// 1) aktivitas baru → ubin orang tua bertambah tanpa reload
await go(cg.page, "/caregiver#aktivitas");
await cg.page.selectOption('select[aria-label="Pilih anak"]', { label: "Kirana Ayu Lestari" });
await cg.page.click('button:has-text("Membaca")');
await cg.page.fill("#act-note", "Sinkron: membaca buku bergambar.");
await cg.page.click('button:has-text("Simpan Aktivitas")');
await cg.page.waitForSelector("text=tersimpan", { timeout: 8000 });
const t1 = await waitText(parent.page, /Sinkron: membaca buku bergambar/);
ok("live: aktivitas pengasuh muncul di Beranda orang tua tanpa reload", !!t1);
ok("live: ubin Aktivitas bertambah 1", t1 ? tile(t1, "Aktivitas") === actBefore + 1 : false, t1 ? `${actBefore} → ${tile(t1, "Aktivitas")}` : "");
const a1 = await waitText(admin.page, /Sinkron: membaca buku bergambar/);
ok("live: catatan tampil di Catatan Harian admin tanpa reload", !!a1);

// 2) makan: catat ulang waktu makan yang sama → menggantikan, bukan menumpuk
await go(cg.page, "/caregiver#makan");
await cg.page.click('button:has-text("Snack Sore")');
await cg.page.click('button:has-text("Buah")');
await cg.page.click('button:has-text("Habis")');
await cg.page.click('form button:has-text("Simpan")');
await cg.page.waitForSelector("text=tersimpan", { timeout: 8000 });
await sleep(1500);
await cg.page.click('button:has-text("Snack Sore")');
await cg.page.click('button:has-text("Roti")');
await cg.page.click('button:has-text("Setengah")');
await cg.page.click('form button:has-text("Simpan")');
await cg.page.waitForSelector("text=tersimpan", { timeout: 8000 });
const t2 = await waitText(parent.page, /Snack Sore: Setengah/);
ok("live: catatan makan terbaru tampil di orang tua", !!t2);
const foodNow = t2 ? tile(t2, "Makan") : null;
ok("makan: waktu makan yang sama dicatat ulang → dihitung sekali", foodNow != null && foodNow <= foodBefore + 1, `makan ${foodBefore} → ${foodNow}`);
ok("jadwal: catatan Snack Sore lama tidak tampil lagi", t2 ? !/Snack Sore: Habis/.test(t2) : false);
ok("jadwal: butir 'Camilan sore' jadwal dasar tidak menduplikasi catatan nyata", t2 ? !/Camilan sore/.test(t2) : false);

// 3) mood → "Mood Hari Ini" orang tua & strip pengasuh sama
await go(cg.page, "/caregiver#mood");
await cg.page.click('button:has-text("Netral")');
await cg.page.click('button:has-text("Simpan Mood")');
await cg.page.waitForSelector("text=tersimpan", { timeout: 8000 });
const t3 = await waitText(parent.page, /Mood Hari Ini[\s\S]{0,60}Netral/);
ok("live: Mood Hari Ini orang tua = Netral", !!t3);
const strip = await cg.page.locator("main").innerText();
ok("pengasuh: strip anak menunjukkan mood Netral", /MOOD[\s\S]{0,40}Netral/i.test(strip));

// 4) angka lintas dasbor: ubin orang tua vs strip pengasuh vs analitik admin (hari ini)
const pt = await parent.page.locator("main").innerText();
const pAct = tile(pt, "Aktivitas");
const pFood = tile(pt, "Makan");
const cgAct = Number((strip.match(/AKTIVITAS\s*\n\s*(\d+)×/i) ?? [])[1]);
const cgFood = Number((strip.match(/MAKAN\s*\n\s*(\d+)×/i) ?? [])[1]);
ok("konsisten: jumlah aktivitas orang tua = pengasuh", pAct === cgAct, `${pAct} vs ${cgAct}`);
ok("konsisten: jumlah makan orang tua = pengasuh", pFood === cgFood, `${pFood} vs ${cgFood}`);
await go(admin.page, "/admin#analitik-aktivitas");
await admin.page.waitForTimeout(1500);
const at = await admin.page.locator("main").innerText();
ok("admin: halaman analitik aktivitas memuat distribusi", /Distribusi Jenis Aktivitas/.test(at));
// angka analitik (sumber grafik orang tua & admin) untuk hari ini = ubin Beranda orang tua
const an = await parent.page.evaluate(async () => {
  const r = await fetch("/api/analytics/CHK-001?days=7", { headers: { "X-Requested-With": "SmartDaycare" }, credentials: "include" });
  return r.ok ? r.json() : null;
});
const todayRow = an ? an.days[an.days.length - 1] : null;
ok("konsisten: analitik hari ini (aktivitas) = ubin orang tua", !!todayRow && todayRow.activities === pAct, todayRow ? `${todayRow.activities} vs ${pAct}` : "analitik tidak termuat");
ok("konsisten: analitik hari ini (makan) = ubin orang tua", !!todayRow && Object.keys(todayRow.meals).length === pFood, todayRow ? `${Object.keys(todayRow.meals).length} vs ${pFood}` : "");
ok("konsisten: analitik hari ini hadir", !!todayRow && todayRow.present === true);

// 5) percakapan dua arah tanpa reload
await go(parent.page, "/parent#pesan");
await go(cg.page, "/caregiver#pesan");
await cg.page.locator('button:has-text("Kirana")').first().click().catch(() => undefined);
await cg.page.waitForTimeout(800);
await cg.page.locator('[aria-label="Pesan"]').first().fill("Sinkron: pesan dari pengasuh.");
await cg.page.keyboard.press("Enter");
const c1 = await waitText(parent.page, /Sinkron: pesan dari pengasuh/);
ok("live: pesan pengasuh muncul di orang tua tanpa reload", !!c1);
await parent.page.locator('[aria-label="Pesan"]').first().fill("Sinkron: balasan orang tua.");
await parent.page.keyboard.press("Enter");
const c2 = await waitText(cg.page, /Sinkron: balasan orang tua/);
ok("live: balasan orang tua muncul di pengasuh tanpa reload", !!c2);

// 6) pengumuman admin → tab Pengumuman orang tua
await go(admin.page, "/admin#pesan");
await admin.page.locator('button:has-text("Pengumuman")').first().click();
await admin.page.waitForTimeout(800);
await admin.page.locator('[aria-label="Pesan"]').first().fill("Sinkron: besok kegiatan berkebun, bawa topi.");
await admin.page.keyboard.press("Enter");
await go(parent.page, "/parent#pemberitahuan");
const n1 = await waitText(parent.page, /besok kegiatan berkebun/);
ok("pengumuman admin tampil di tab Pengumuman orang tua", !!n1);

// 7) kehadiran: check-in nyata → Kehadiran orang tua & analitik hari ini
await go(cg.page, "/caregiver#kehadiran");
const chk = cg.page.locator('button:has-text("Ubah Status"), button:has-text("Catat kedatangan"), button:has-text("Tiba")').first();
ok("pengasuh: kontrol status kehadiran ada", (await chk.count()) > 0);

await parent.ctx.close();
await admin.ctx.close();
await cg.ctx.close();
await browser.close();
const fails = results.filter((r) => r[0] === "FAIL").length;
console.log(`\n${results.length - fails}/${results.length} lulus`);
