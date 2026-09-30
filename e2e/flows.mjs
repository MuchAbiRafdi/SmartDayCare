// Uji alur fitur baru (pencatatan pengasuh → tampilan orang tua → persetujuan admin).
import { chromium } from "playwright-core";

const BASE = process.env.BASE ?? "http://127.0.0.1:3000";
const browser = await chromium.launch();
const results = [];
const ok = (name, cond, extra = "") => {
  results.push([cond ? "PASS" : "FAIL", name, extra]);
  console.log((cond ? "PASS " : "FAIL ") + name + (extra ? " — " + extra : ""));
};

async function login(page, email, pw) {
  await page.goto(BASE + "/login", { waitUntil: "load" });
  await page.fill("#email", email);
  await page.fill("#password", pw);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 }), page.click('button[type="submit"]')]);
}
async function go(page, path) {
  await page.goto(BASE + path, { waitUntil: "load" });
  await page.waitForTimeout(1200);
}
async function toast(page, re) {
  try {
    await page.waitForSelector(`text=${re}`, { timeout: 8000 });
    return true;
  } catch {
    return false;
  }
}

const errors = [];
const mk = async () => {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  return { ctx, page };
};

// ---------- pengasuh ----------
{
  const { ctx, page } = await mk();
  await login(page, "ratna.dewi@ceriaananda.id", "Ratna2026");
  await go(page, "/caregiver#aktivitas");
  await page.selectOption('select[aria-label="Pilih anak"]', { label: "Kirana Ayu Lestari" });
  await page.click('button:has-text("Bermain Bebas")');
  await page.fill("#act-note", "Uji: bermain pasir kinetik, fokus 20 menit.");
  await page.fill("#act-min", "20");
  await page.click('button:has-text("Simpan Aktivitas")');
  ok("pengasuh: simpan aktivitas", await toast(page, "tersimpan"));
  await page.waitForTimeout(800);
  ok("pengasuh: aktivitas tampil di daftar", (await page.locator("text=Uji: bermain pasir kinetik").count()) > 0);

  await go(page, "/caregiver#makan");
  await page.click('button:has-text("Snack Sore")');
  await page.click('button:has-text("Buah")');
  await page.click('button:has-text("Susu")');
  await page.click('button:has-text("Setengah")');
  await page.fill("#food-note", "Uji: pepaya dan susu.");
  await page.click('form button:has-text("Simpan")');
  ok("pengasuh: simpan makan", await toast(page, "tersimpan"));

  await go(page, "/caregiver#tidur");
  await page.fill("#sl-start", "13:00");
  await page.fill("#sl-end", "14:15");
  await page.click('button:has-text("Baik")');
  await page.click('form button:has-text("Simpan")');
  ok("pengasuh: simpan tidur", await toast(page, "tersimpan"));

  await go(page, "/caregiver#mood");
  await page.click('button:has-text("Sangat Senang")');
  await page.fill("#mood-note", "Uji: ceria setelah bermain pasir.");
  await page.click('button:has-text("Simpan Mood")');
  ok("pengasuh: simpan mood", await toast(page, "tersimpan"));

  await go(page, "/caregiver#kehadiran");
  await page.setInputFiles('input[type="file"]', "/home/user/smartdaycare/web/public/img/doc-art.jpg");
  await page.waitForTimeout(1200);
  await page.fill("#doc-cap", "Uji: hasil melukis pagi");
  await page.click('button:has-text("Unggah Foto")');
  ok("pengasuh: unggah foto", await toast(page, "tersimpan"));
  await page.waitForTimeout(800);
  ok("pengasuh: foto tampil di grid", (await page.locator("text=Uji: hasil melukis pagi").count()) > 0);

  await go(page, "/caregiver#pesan");
  await page.waitForSelector("text=Percakapan");
  const first = page.locator('button:has-text("Orang tua Kirana"), button:has-text("Kirana")').first();
  if (await first.count()) await first.click();
  await page.waitForTimeout(600);
  const input = page.locator('[aria-label="Pesan"]').first();
  if (await input.count()) {
    await input.fill("Uji: Kirana makan siang habis hari ini.");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(1000);
    ok("pengasuh: kirim pesan", (await page.locator("text=Uji: Kirana makan siang habis").count()) > 0);
  } else ok("pengasuh: kirim pesan", false, "kotak pesan tidak ditemukan");
  await ctx.close();
}

// ---------- orang tua ----------
{
  const { ctx, page } = await mk();
  await login(page, "andi.lestari@gmail.com", "Kirana2026");
  await go(page, "/parent#beranda");
  const txt = await page.locator("main").innerText();
  ok("orang tua: beranda memuat sapaan", /Halo, Andi/.test(txt));
  ok("orang tua: mood hari ini = Sangat Senang", /Sangat Senang/.test(txt), txt.match(/Mood Hari Ini[\s\S]{0,80}/)?.[0]?.replace(/\s+/g, " "));
  await go(page, "/parent#aktivitas");
  ok("orang tua: aktivitas baru terlihat", (await page.locator("text=Uji: bermain pasir kinetik").count()) > 0);
  await go(page, "/parent#dokumentasi");
  ok("orang tua: foto baru terlihat", (await page.locator("text=Uji: hasil melukis pagi").count()) > 0);
  await go(page, "/parent#pesan");
  await page.waitForTimeout(800);
  ok("orang tua: pesan pengasuh terlihat", (await page.locator("text=Uji: Kirana makan siang habis").count()) > 0);
  await go(page, "/parent#kamera");
  const ask = page.locator('button:has-text("Ajukan akses")').first();
  ok("orang tua: tombol ajukan akses ada", (await ask.count()) > 0);
  if (await ask.count()) {
    await ask.click();
    await page.waitForTimeout(500);
    const reason = page.locator('[role="dialog"] textarea').first();
    if (await reason.count()) await reason.fill("Uji: ingin melihat Kirana saat tidur siang.");
    await page.click('[role="dialog"] button:has-text("Kirim permintaan")');
    ok("orang tua: permintaan akses terkirim", await toast(page, "Permintaan"));
  }
  await go(page, "/parent#umpan-balik");
  const stars = page.locator('button[aria-label*="bintang"]');
  if ((await stars.count()) >= 5) {
    await stars.nth(4).click();
    await page.fill("textarea", "Uji: laporan hariannya jelas dan cepat.");
    await page.click('button:has-text("Kirim umpan balik")');
    ok("orang tua: umpan balik terkirim", await toast(page, "Terima kasih"));
  } else ok("orang tua: umpan balik terkirim", false, "bintang tidak ditemukan (" + (await stars.count()) + ")");
  await go(page, "/parent#perkembangan");
  ok("orang tua: perkembangan memuat", (await page.locator("text=Insight").count()) > 0);
  await ctx.close();
}

// ---------- admin ----------
{
  const { ctx, page } = await mk();
  await login(page, "hendra@ceriaananda.id", "Hendra2026");
  await go(page, "/admin#kamera");
  const pending = await page.locator("text=Uji: ingin melihat Kirana").count();
  ok("admin: permintaan akses baru tampil", pending > 0);
  const approve = page.locator('div:has-text("Uji: ingin melihat Kirana") >> button:has-text("Setujui")').last();
  if (await approve.count()) {
    await approve.click();
    ok("admin: setujui akses", await toast(page, "disetujui"));
  }
  await go(page, "/admin#kepercayaan");
  ok("admin: umpan balik baru tampil", (await page.locator("text=Uji: laporan hariannya").count()) > 0);
  await go(page, "/admin#dashboard");
  const t = await page.locator("main").innerText();
  ok("admin: dashboard perkembangan memuat", /Dashboard Perkembangan/.test(t) && /Tren Mood/.test(t));
  await go(page, "/admin#rekomendasi");
  ok("admin: rekomendasi memuat", (await page.locator("text=Rekomendasi AI").count()) > 0);
  await ctx.close();
}

// ---------- orang tua melihat kamera setelah disetujui ----------
{
  const { ctx, page } = await mk();
  await login(page, "andi.lestari@gmail.com", "Kirana2026");
  await go(page, "/parent#kamera");
  const t = await page.locator("main").innerText();
  ok("orang tua: akses aktif setelah disetujui", (t.match(/Akses aktif/g) ?? []).length >= 2, (t.match(/Akses aktif/g) ?? []).length + " kamera aktif");
  await ctx.close();
}

await browser.close();
const fails = results.filter((r) => r[0] === "FAIL").length;
console.log(`\n${results.length - fails}/${results.length} lulus`);
if (errors.length) console.log("pageerror:", errors.slice(0, 5));
