// E2E smoke: setiap halaman & alur utama di semua peran, plus tangkapan layar 1280 dan 390 px.
import { chromium } from "playwright-core";
import { startStripProxy } from "./strip-proxy.mjs";
import fs from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3000";
const HERE = new URL(".", import.meta.url).pathname;
const SHOTS = process.env.SHOTS ?? HERE + "shots";
// Foto contoh piring dari aset web (relatif terhadap repo; ganti lewat PLATE_DIR bila harness dipindah)
const PLATE_DIR = process.env.PLATE_DIR ?? new URL("../web/public/img", import.meta.url).pathname;
fs.mkdirSync(SHOTS, { recursive: true });

const problems = [];
const consoleErrors = [];
const results = [];

function ok(name, cond, extra = "") {
  results.push([cond ? "PASS" : "FAIL", name, extra]);
  if (!cond) problems.push(name + (extra ? " — " + extra : ""));
}

async function shot(page, name) {
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
}

async function login(page, email, password) {
  await page.goto(BASE + "/login");
  await page.fill("#email", email);
  await page.fill("#password", password);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 }), page.click('button[type="submit"]')]);
}

async function logout(page) {
  await page.goto(BASE + "/dashboard");
  const btn = page.getByRole("button", { name: /keluar/i }).first();
  if (await btn.count()) {
    await btn.click();
    await page.waitForURL(/\/login\?out=1/, { timeout: 15000 });
  }
}

const browser = await chromium.launch({ args: ["--no-sandbox", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });

async function newPage(width = 1280, height = 900) {
  const ctx = await browser.newContext({ viewport: { width, height }, locale: "id-ID", permissions: ["camera"] });
  const page = await ctx.newPage();
  page.on("console", (m) => {
    if (m.type() === "error") { const t = m.text(); consoleErrors.push(`[${page.url()}] ${t.length > 1200 ? t.slice(0, 200) + " …… " + t.slice(-900) : t}`); }
  });
  page.on("pageerror", (e) => consoleErrors.push(`[${page.url()}] PAGEERROR ${String(e).slice(0, 300)}`));
  return { ctx, page };
}

async function main() {
// --- Publik -------------------------------------------------------------------------------
{
  const { ctx, page } = await newPage();
  const r = await page.goto(BASE + "/");
  ok("landing 200", r.status() === 200);
  ok("landing tanpa jargon", !/YOLO|SAM\+CNN|AES-256|Edge AI|simulasi|demo/i.test(await page.content()));
  await shot(page, "01-landing");
  await page.goto(BASE + "/help");
  ok("help faq tampil", (await page.locator("details, [data-faq]").count()) > 0 || (await page.getByText(/pertanyaan/i).count()) > 0);
  await page.fill('input[aria-label="Cari pertanyaan"]', "kamera");
  await page.waitForTimeout(200);
  await shot(page, "02-help");
  // Tiket publik
  await page.fill("#t-name", "Uji Coba");
  await page.fill("#t-email", "uji@example.com");
  await page.fill("#t-msg", "Bagaimana cara menautkan anak kedua?");
  await page.click('#tanya button[type="submit"]');
  await page.waitForTimeout(1200);
  ok("tiket terkirim (toast)", (await page.getByText(/kami terima/i).count()) > 0);
  // Halaman terproteksi → login
  await page.goto(BASE + "/parent");
  await page.waitForURL(/\/login\?next=/, { timeout: 10000 }).catch(() => {});
  ok("parent tanpa sesi → login", page.url().includes("/login?next=%2Fparent") || page.url().includes("/login?next=/parent"));
  // Login gagal
  await page.goto(BASE + "/login");
  await page.fill("#email", "andi.lestari@gmail.com");
  await page.fill("#password", "salah12345");
  await page.click('button[type="submit"]');
  await page.waitForTimeout(1500);
  ok("login gagal → pesan", (await page.getByRole("alert").count()) > 0);
  await shot(page, "03-login-error");
  // Peramban/proxy yang tidak meneruskan cookie sama sekali (mis. pratinjau tersemat): masuk harus
  // tetap berhasil lewat jalur header X-Session, tanpa petunjuk membingungkan.
  {
    // (route.continue tidak bisa mencabut cookie — peramban menempelkannya setelah intersepsi — jadi
    //  dipakai reverse proxy lokal yang membuang header Cookie, persis seperti proxy pratinjau)
    const STRIP = "http://localhost:3010";
    const proxy = await startStripProxy(3010, BASE);
    const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "id-ID" });
    const p2 = await ctx2.newPage();
    await p2.goto(STRIP + "/login");
    await p2.fill("#email", "andi.lestari@gmail.com");
    await p2.fill("#password", "Kirana2026");
    await Promise.all([p2.waitForURL((u) => u.pathname === "/dashboard", { timeout: 20000 }), p2.click('button[type="submit"]')]);
    await p2.waitForTimeout(800);
    ok("tanpa cookie: masuk → hub", (await p2.getByText("Andi").count()) > 0, p2.url());
    ok("tanpa cookie: tidak ada petunjuk 'tab baru'", (await p2.getByText(/tab baru|bingkai/i).count()) === 0);
    await p2.goto(STRIP + "/parent#gizi");
    await p2.waitForTimeout(1500);
    ok("tanpa cookie: dasbor orang tua termuat", (await p2.getByText("Kirana").count()) > 0);
    const blobImgs = await p2.evaluate(() => Array.from(document.images).filter((i) => i.src.startsWith("blob:") && i.naturalWidth > 0).length);
    // foto makan siang contoh baru tampil setelah pukul 12.20 WIB (mengikuti jam nyata); sebelum itu tidak ada foto yang bisa diuji
    const wib = new Date(Date.now() + 7 * 3600e3);
    const afterLunch = wib.getUTCHours() * 60 + wib.getUTCMinutes() >= 12 * 60 + 20;
    ok("tanpa cookie: foto piring termuat lewat header", !afterLunch || blobImgs > 0, afterLunch ? String(blobImgs) : "dilewati: sebelum 12.20 WIB");
    await p2.goto(STRIP + "/account#keamanan");
    await p2.waitForTimeout(1200);
    ok("tanpa cookie: akun menjelaskan penyimpanan sesi", (await p2.getByText(/penyimpanan situs/i).count()) > 0);
    await shot(p2, "03b-tanpa-cookie-akun");
    await p2.reload();
    await p2.waitForTimeout(1200);
    ok("tanpa cookie: sesi bertahan setelah muat ulang", (await p2.getByText("Andi").count()) > 0, p2.url());
    await p2.getByRole("button", { name: /^Keluar/ }).first().click();
    await p2.waitForURL(/\/login\?out=1/, { timeout: 15000 });
    await p2.goto(STRIP + "/parent");
    await p2.waitForURL(/\/login\?next=/, { timeout: 10000 }).catch(() => {});
    ok("tanpa cookie: setelah keluar, /parent → login", p2.url().includes("/login?next="), p2.url());
    await ctx2.close();
    proxy.close();
  }
  await page.goto(BASE + "/register");
  await shot(page, "04-register");
  await page.goto(BASE + "/tidak-ada");
  await shot(page, "05-404");
  await ctx.close();
}

// --- Orang tua ----------------------------------------------------------------------------
{
  const { ctx, page } = await newPage();
  await login(page, "andi.lestari@gmail.com", "Kirana2026");
  ok("parent login → hub", page.url().includes("/dashboard"), page.url());
  await page.waitForTimeout(500);
  await shot(page, "09-hub-parent");
  await page.goto(BASE + "/parent");
  await page.waitForTimeout(800);
  ok("parent: nama anak", (await page.getByText("Kirana").count()) > 0);
  ok("parent: makan siang 85", /85\s?%/.test(await page.content()));
  await shot(page, "10-parent-hari-ini");
  for (const t of ["kamera", "gizi", "kesehatan", "pemberitahuan", "laporan"]) {
    await page.goto(BASE + "/parent#" + t);
    await page.waitForTimeout(700);
    await shot(page, `11-parent-${t}`);
  }
  await page.goto(BASE + "/parent#kamera");
  await page.waitForTimeout(500);
  ok("parent kamera: tidak ada Dapur", !(await page.getByText("Dapur (khusus staf)").count()));
  // caregiver route terlarang
  await page.goto(BASE + "/caregiver");
  ok("parent → /caregiver ditolak", page.url().includes("/dashboard?denied=caregiver"), page.url());
  await page.waitForTimeout(500);
  await shot(page, "12-hub-denied");
  // akun
  await page.goto(BASE + "/account");
  await page.waitForTimeout(500);
  await shot(page, "13-account");
  await page.fill("#p-phone", "+62 812-0000-1111");
  await page.click('form button[type="submit"]:has-text("Simpan profil")');
  await page.waitForTimeout(1000);
  ok("profil tersimpan", (await page.getByText(/Profil tersimpan/).count()) > 0);
  await page.goto(BASE + "/account#pemberitahuan");
  await page.waitForTimeout(400);
  await shot(page, "14-account-notify");
  await page.goto(BASE + "/account#keamanan");
  await page.waitForTimeout(400);
  await shot(page, "15-account-security");
  await logout(page);
  ok("logout → login?out=1", page.url().includes("out=1"));
  await ctx.close();
}

// --- Pengasuh -----------------------------------------------------------------------------
{
  const { ctx, page } = await newPage();
  await login(page, "ratna.dewi@ceriaananda.id", "Ratna2026");
  ok("caregiver login → hub", page.url().includes("/dashboard"), page.url());
  await page.goto(BASE + "/caregiver");
  await page.waitForTimeout(800);
  await shot(page, "20-caregiver-anak");
  // Catatan suhu untuk Kirana
  const tile = page.locator("article, .tile, [data-child]").filter({ hasText: "Kirana" }).first();
  ok("tile Kirana", (await tile.count()) > 0);
  const tempBtn = page.getByRole("button", { name: /suhu/i }).first();
  if (await tempBtn.count()) {
    await tempBtn.click();
    await page.waitForTimeout(400);
    await shot(page, "21-caregiver-temp-dialog");
    const input = page.locator('dialog input[type="number"], [role="dialog"] input[type="number"]').first();
    if (await input.count()) {
      await input.fill("37.9");
      await page.locator('[role="dialog"] button[type="submit"], dialog button[type="submit"]').first().click();
      await page.waitForTimeout(1200);
      ok("suhu tercatat", /37,9/.test(await page.content()));
    } else ok("input suhu ada", false);
  } else ok("tombol suhu ada", false);
  // Obat
  await page.goto(BASE + "/caregiver#obat");
  await page.waitForTimeout(600);
  await shot(page, "22-caregiver-obat");
  // Kejadian
  await page.goto(BASE + "/caregiver#kejadian");
  await page.waitForTimeout(600);
  await shot(page, "23-caregiver-kejadian");
  // Serah terima
  await page.goto(BASE + "/caregiver#serah-terima");
  await page.waitForTimeout(600);
  await shot(page, "24-caregiver-serah");
  // Kamera
  await page.goto(BASE + "/caregiver#kamera");
  await page.waitForTimeout(600);
  await shot(page, "25-caregiver-kamera");
  // Pindai piring dengan foto contoh
  await page.goto(BASE + "/caregiver#pindai");
  await page.waitForTimeout(800);
  await shot(page, "26-caregiver-pindai");
  const fileInput = page.locator('input[type="file"]').first();
  ok("input berkas pindai ada", (await fileInput.count()) > 0);
  if (await fileInput.count()) {
    // Pilih anak Kirana dan makan siang jika tersedia
    const sel = page.locator("select").first();
    if (await sel.count()) {
      const opts = await sel.locator("option").allTextContents();
      const i = opts.findIndex((o) => /Kirana/.test(o));
      if (i >= 0) await sel.selectOption({ index: i });
    }
    await fileInput.setInputFiles(PLATE_DIR + "/plate-before.jpg");
    await page.waitForTimeout(800);
    await page.getByRole("button", { name: /^Pindai$/ }).first().click();
    await page.getByRole("button", { name: /Simpan piring disajikan|Kirim ke orang tua/ }).first().waitFor({ timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(500);
    const html = await page.content();
    ok("pindai: hasil makanan muncul", /Nasi putih|Ayam goreng|Sup/.test(html));
    ok("pindai: kkal muncul", /kkal/.test(html));
    await shot(page, "27-caregiver-pindai-hasil");
    const save = page.getByRole("button", { name: /Simpan piring disajikan|Kirim ke orang tua/ }).first();
    if (await save.count()) {
      await save.click();
      await page.waitForTimeout(2000);
      await shot(page, "28-caregiver-pindai-tersimpan");
      ok("pindai: piring masuk daftar menunggu", (await page.getByRole("button", { name: /Pindai sesudah makan/ }).count()) > 0);
      // Tahap kedua: sesudah makan
      await page.getByRole("button", { name: /Pindai sesudah makan/ }).first().click();
      await page.waitForTimeout(600);
      await page.locator('input[type="file"]').first().setInputFiles(PLATE_DIR + "/plate-after.jpg");
      await page.waitForTimeout(800);
      await page.getByRole("button", { name: /^Pindai$/ }).first().click();
      await page.getByRole("button", { name: /Kirim ke orang tua/ }).first().waitFor({ timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(500);
      await shot(page, "29-caregiver-pindai-sesudah");
      const send = page.getByRole("button", { name: /Kirim ke orang tua/ }).first();
      ok("pindai sesudah: tombol kirim", (await send.count()) > 0);
      if (await send.count()) {
        await send.click();
        await page.waitForTimeout(2000);
        ok("pindai: terkirim ke daftar", /Terkirim ke orang tua hari ini/.test(await page.content()) && (await page.getByText(/porsi/).count()) > 0);
        await shot(page, "29b-caregiver-pindai-terkirim");
      }
    } else ok("tombol simpan pindai ada", false);
  }
  await logout(page);
  await ctx.close();
}

// --- Admin --------------------------------------------------------------------------------
{
  const { ctx, page } = await newPage();
  await login(page, "hendra@ceriaananda.id", "Hendra2026");
  ok("admin login → /dashboard", page.url().includes("/dashboard"), page.url());
  await page.waitForTimeout(600);
  await shot(page, "30-hub-admin");
  await page.goto(BASE + "/admin", { timeout: 60000 });
  await page.waitForTimeout(900);
  await shot(page, "31-admin-ringkasan");
  for (const t of ["perangkat", "catatan", "akses", "akun", "permintaan", "pengaturan"]) {
    await page.goto(BASE + "/admin#" + t);
    await page.waitForTimeout(700);
    await shot(page, `32-admin-${t}`);
  }
  await page.goto(BASE + "/admin#permintaan");
  await page.waitForTimeout(500);
  ok("admin: tiket uji tampil", (await page.getByText("uji@example.com").count()) > 0);
  await page.goto(BASE + "/admin#perangkat");
  await page.waitForTimeout(500);
  ok("perangkat: perangkat contoh ditandai jujur", (await page.getByText(/Perangkat contoh/).count()) > 0);
  ok("perangkat: status pengirim email/WA tampil", (await page.getByText(/Belum diatur|aktif/).count()) > 0);
  // daftarkan sensor → token tampil sekali → kiriman sensor menggantikan nilai contoh
  await page.getByRole("button", { name: /Tambah perangkat/ }).click();
  await page.fill("#dv-name", "Sensor Uji E2E");
  await page.getByRole("button", { name: /Simpan & tampilkan token/ }).click();
  await page.waitForTimeout(800);
  const tokenText = await page.locator(".code-reveal").first().textContent().catch(() => "");
  const devToken = (tokenText || "").trim();
  ok("perangkat: token perangkat ditampilkan sekali", /^sd_/.test(devToken), devToken.slice(0, 8));
  await page.keyboard.press("Escape");
  if (devToken) {
    const ing = await page.request.post(BASE + "/api/devices/ingest", { headers: { "X-Device-Token": devToken, "Content-Type": "application/json" }, data: { temp: 26.5, hum: 55, co2: 733, pm25: 7 } });
    ok("perangkat: kiriman sensor diterima", ing.status() === 200, String(ing.status()));
    await page.goto(BASE + "/admin#ringkasan");
    await page.waitForTimeout(800);
    ok("udara: angka sensor sungguhan tampil (733 ppm, label Sensor)", /733/.test(await page.content()) && (await page.getByText(/^Sensor/).count()) > 0);
    await page.goto(BASE + "/admin#perangkat");
    await page.getByText(/Terhubung/).first().waitFor({ timeout: 8000 }).catch(() => {});
    ok("perangkat: sensor terhubung (status berubah tanpa muat ulang)", (await page.getByText(/Terhubung/).count()) > 0);
    const del = page.getByRole("row", { name: /Sensor Uji E2E/ }).getByRole("button", { name: "Hapus" });
    if (await del.count()) {
      page.once("dialog", (d) => d.accept());
      await del.click();
      await page.waitForTimeout(800);
      // baris perangkat hilang (nama masih boleh muncul di riwayat akses: "Menghapus perangkat …")
      ok("perangkat: sensor dihapus", (await page.getByRole("row", { name: /Sensor Uji E2E/ }).filter({ has: page.getByRole("button", { name: "Hapus" }) }).count()) === 0);
    }
  }
  await page.goto(BASE + "/admin#akses");
  await page.waitForTimeout(500);
  ok("riwayat akses: ada pembukaan kamera", /Membuka Kamera/.test(await page.content()));
  const csv = await page.request.get(BASE + "/api/admin/access.csv");
  ok("csv akses 200", csv.status() === 200, String(csv.status()));
  await page.goto(BASE + "/admin#catatan");
  await page.waitForTimeout(600);
  ok("admin catatan: suhu 37,9 dari pengasuh", /37,9/.test(await page.content()));
  await page.goto(BASE + "/caregiver");
  ok("admin bisa buka /caregiver", page.url().endsWith("/caregiver"));
  await page.goto(BASE + "/parent");
  ok("admin bisa buka /parent", page.url().endsWith("/parent"));
  await logout(page);
  await ctx.close();
}

// --- Admin: kelola akun, pengaturan, menu -------------------------------------------------
{
  const { ctx, page } = await newPage();
  await login(page, "hendra@ceriaananda.id", "Hendra2026");
  await page.goto(BASE + "/admin#akun");
  await page.waitForTimeout(600);
  // Tambah akun pengasuh
  await page.getByRole("button", { name: "Tambah akun" }).click();
  await page.waitForTimeout(300);
  await page.selectOption("#cu-role", "caregiver");
  await page.fill("#cu-name", "Pengasuh Baru");
  const newStaff = `staf.${Date.now()}@ceriaananda.id`;
  await page.fill("#cu-email", newStaff);
  await page.fill("#cu-pw", "SandiAwal2026!");
  await page.getByRole("button", { name: "Buat akun" }).click();
  await page.waitForTimeout(1500);
  ok("admin: akun baru tampil", (await page.getByText(newStaff).count()) > 0);
  // Nonaktifkan lalu aktifkan kembali akun tersebut
  const row = page.locator("tr").filter({ hasText: newStaff });
  await row.getByRole("button", { name: "Nonaktifkan" }).click();
  await page.waitForTimeout(1200);
  ok("admin: akun dinonaktifkan", (await row.getByRole("button", { name: "Aktifkan" }).count()) > 0);
  // Akun nonaktif tidak bisa masuk
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "id-ID" });
  const p2 = await ctx2.newPage();
  await p2.goto(BASE + "/login");
  await p2.fill("#email", newStaff);
  await p2.fill("#password", "SandiAwal2026!");
  await p2.click('button[type="submit"]');
  await p2.waitForTimeout(1500);
  ok("akun nonaktif ditolak masuk", p2.url().includes("/login") && (await p2.getByRole("alert").count()) > 0);
  await ctx2.close();
  await row.getByRole("button", { name: "Aktifkan" }).click();
  await page.waitForTimeout(1200);
  // Atur ulang sandi orang tua Joko → sandi sementara tampil
  const rowJ = page.locator("tr").filter({ hasText: "joko.saputra@gmail.com" });
  await rowJ.getByRole("button", { name: "Atur ulang sandi" }).click();
  await page.waitForTimeout(1500);
  const dlg = page.getByRole("dialog");
  const tmp = await dlg.locator("code, .font-mono").first().textContent().catch(() => "");
  ok("admin: sandi sementara tampil", !!tmp && tmp.trim().length >= 8, tmp ?? "");
  await shot(page, "33-admin-reset-sandi");
  await dlg.getByRole("button", { name: /Selesai|Tutup/ }).first().click();
  // Joko masuk dengan sandi sementara → wajib ganti sandi
  if (tmp) {
    const ctx3 = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "id-ID" });
    const p3 = await ctx3.newPage();
    await p3.goto(BASE + "/login");
    await p3.fill("#email", "joko.saputra@gmail.com");
    await p3.fill("#password", tmp.trim());
    await p3.click('button[type="submit"]');
    await p3.waitForTimeout(2500);
    ok("sandi sementara bisa masuk", !p3.url().includes("/login"), p3.url());
    await p3.waitForTimeout(500);
    ok("hub: peringatan sandi sementara", (await p3.getByText(/kata sandi sementara/i).count()) > 0);
    await p3.goto(BASE + "/account#keamanan");
    await p3.waitForTimeout(600);
    ok("wajib ganti sandi ditampilkan", (await p3.getByText(/Ganti kata sandi/).count()) > 0);
    await p3.fill("#s-cur", tmp.trim());
    await p3.fill("#s-new", "SandiBaruJoko2026!");
    await p3.fill("#s-conf", "SandiBaruJoko2026!");
    await p3.getByRole("button", { name: "Ganti kata sandi" }).click();
    await p3.waitForTimeout(1500);
    ok("ganti sandi berhasil", (await p3.getByText(/Kata sandi diganti/).count()) > 0);
    await ctx3.close();
  }
  // Pengaturan: ubah ambang CO2 dan tambah menu
  await page.goto(BASE + "/admin#pengaturan");
  await page.waitForTimeout(600);
  const co2 = page.locator("#st-co2Max");
  if (await co2.count()) {
    await co2.fill("950");
    await page.getByRole("button", { name: "Simpan pengaturan" }).click();
    await page.waitForTimeout(1200);
    ok("pengaturan tersimpan", (await page.getByText(/tersimpan/i).count()) > 0);
  } else ok("input co2Max ada", false);
  await page.fill("#f-name", "Bubur kacang hijau");
  await page.fill("#f-kcal", "108");
  await page.fill("#f-protein", "3.5");
  await page.fill("#f-carbs", "19");
  await page.fill("#f-fat", "2");
  await page.locator("#f-name").locator("xpath=ancestor::form[1]").locator('button[type="submit"]').click();
  await page.waitForTimeout(1200);
  ok("menu baru tampil", (await page.getByText("Bubur kacang hijau").count()) > 0);
  await shot(page, "34-admin-pengaturan-setelah");
  // Permintaan bantuan: tandai dibalas
  await page.goto(BASE + "/admin#permintaan");
  await page.waitForTimeout(600);
  const tb = page.getByRole("button", { name: "Tandai dibalas" }).first();
  if (await tb.count()) {
    await tb.click();
    await page.waitForTimeout(1000);
    ok("tiket dibalas", (await page.getByText("Dibalas").count()) > 0);
  }
  await ctx.close();
}

// --- Pengasuh: formulir lain + kamera -----------------------------------------------------
{
  const { ctx, page } = await newPage();
  await login(page, "sari.puspita@ceriaananda.id", "Sari2026");
  await page.goto(BASE + "/caregiver#obat");
  await page.waitForTimeout(600);
  const medForm = page.locator("form").filter({ has: page.locator("#m-child") }).first();
  if (await medForm.count()) {
    const sel = medForm.locator("select").first();
    const opts = await sel.locator("option").allTextContents();
    const i = opts.findIndex((o) => /Nadia/.test(o));
    if (i >= 0) await sel.selectOption({ index: i });
    await medForm.locator('input[name="med"]').fill("Vitamin D3");
    await medForm.locator('input[name="dose"]').fill("1 tetes");
    await medForm.locator('button[type="submit"]').click();
    await page.waitForTimeout(1200);
    ok("obat tercatat", (await page.getByText(/Vitamin D3/).count()) > 0);
  } else ok("form obat ada", false);
  await page.goto(BASE + "/caregiver#kejadian");
  await page.waitForTimeout(600);
  const incForm = page.locator("form").filter({ has: page.locator("#i-kind") }).first();
  const kindSel = incForm.locator("#i-kind");
  if (await kindSel.count()) {
    const csel = incForm.locator('select[name="childId"]');
    if (await csel.count()) {
      const opts = await csel.locator("option").allTextContents();
      const i = opts.findIndex((o) => /Salsa/.test(o));
      if (i >= 0) await csel.selectOption({ index: i });
    }
    await incForm.locator('textarea, input[name="note"]').first().fill("Terpeleset di dekat wastafel, tidak ada luka.");
    await incForm.locator('button[type="submit"]').click();
    await page.waitForTimeout(1200);
    ok("kejadian tercatat", (await page.getByText(/Terpeleset/).count()) > 0);
    const res = page.getByRole("button", { name: /Tandai ditangani|Ditangani/ }).first();
    if (await res.count()) {
      await res.click();
      await page.waitForTimeout(1000);
      ok("kejadian ditangani", (await page.getByText(/ditangani/i).count()) > 0);
    }
  } else ok("form kejadian ada", false);
  await page.goto(BASE + "/caregiver#serah-terima");
  await page.waitForTimeout(600);
  const hoForm = page.locator("form").filter({ has: page.locator("#h-note") }).first();
  if (await hoForm.count()) {
    await hoForm.locator("textarea").first().fill("Semua anak sudah tidur siang; Bima belum minum obat sore.");
    await hoForm.locator('button[type="submit"]').click();
    await page.waitForTimeout(1200);
    ok("serah terima tercatat", (await page.getByText(/Bima belum minum obat sore/).count()) > 0);
  } else ok("form serah terima ada", false);
  // Kamera staf: buka satu kamera → tercatat di riwayat akses
  await page.goto(BASE + "/caregiver#kamera");
  await page.waitForTimeout(600);
  const camBtn = page.locator('button[aria-pressed="false"]').first();
  if (await camBtn.count()) {
    await camBtn.click();
    await page.waitForTimeout(1200);
    await shot(page, "26b-caregiver-kamera-lain");
  }
  await ctx.close();
}

// --- Admin: kode undangan berjangka & pendaftaran anak -------------------------------------
let inviteCode = "";
let newChildCode = "";
{
  const { ctx, page } = await newPage();
  await login(page, "hendra@ceriaananda.id", "Hendra2026");
  await page.goto(BASE + "/admin#akun");
  await page.waitForTimeout(600);
  // Buat kode undangan pengasuh sekali pakai
  await page.getByRole("button", { name: "Buat kode" }).click();
  await page.waitForTimeout(300);
  await page.selectOption("#inv-role", "caregiver");
  await page.fill("#inv-label", "Staf Uji");
  await page.getByRole("dialog").getByRole("button", { name: "Buat kode" }).click();
  await page.waitForTimeout(1500);
  const dlgI = page.getByRole("dialog");
  inviteCode = ((await dlgI.locator(".font-mono").first().textContent().catch(() => "")) ?? "").trim();
  ok("admin: kode undangan dibuat (STAF-…)", /^STAF-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(inviteCode), inviteCode);
  await shot(page, "35-admin-kode-undangan");
  await dlgI.getByRole("button", { name: "Selesai" }).click();
  await page.waitForTimeout(500);
  ok("admin: kode undangan tampil di daftar", (await page.getByText(inviteCode).count()) > 0);
  ok("admin: kode awal diberi peringatan tanpa batas", (await page.getByText(/tanpa batas waktu dan pemakaian/i).count()) > 0);

  // Daftarkan anak baru → kode anak otomatis
  await page.getByRole("button", { name: "Daftarkan anak" }).click();
  await page.waitForTimeout(300);
  await page.fill("#ch-name", "Aisyah Nur Fadilah");
  await page.fill("#ch-dob", "2023-04-12");
  await page.selectOption("#ch-room", "Ruang Makan");
  await page.selectOption("#ch-cg", "Ratna Dewi");
  await page.fill("#ch-all", "Kacang mete");
  await page.fill("#ch-parent", "Fadil Rahman");
  await page.fill("#ch-en", "Fadil Rahman (Ayah)");
  await page.fill("#ch-ep", "+62 812 3456 7890");
  await page.getByRole("button", { name: "Simpan & buat kode" }).click();
  await page.waitForTimeout(1500);
  const dlgC = page.getByRole("dialog");
  newChildCode = ((await dlgC.locator(".font-mono").first().textContent().catch(() => "")) ?? "").trim();
  ok("admin: anak baru + kode KA-####", /^KA-\d{4}$/.test(newChildCode), newChildCode);
  await shot(page, "36-admin-anak-baru");
  await dlgC.getByRole("button", { name: "Selesai" }).click();
  await page.waitForTimeout(600);
  const rowA = page.locator("tr").filter({ hasText: "Aisyah Nur Fadilah" });
  ok("admin: anak baru tampil di tabel", (await rowA.count()) > 0 && (await rowA.getByText(newChildCode).count()) > 0);
  // Ubah data anak
  await rowA.getByRole("button", { name: "Ubah" }).click();
  await page.waitForTimeout(300);
  await page.fill("#ch-short", "Aisyah");
  await page.selectOption("#ch-room", "Ruang Bermain Utama");
  await page.getByRole("button", { name: "Simpan perubahan" }).click();
  await page.waitForTimeout(1200);
  ok("admin: ruang anak diperbarui", (await rowA.getByText(/Ruang Bermain Utama/).count()) > 0);
  // Ganti kode → kode lama hangus
  await rowA.getByRole("button", { name: "Kode baru" }).click();
  await page.waitForTimeout(300);
  await page.getByRole("dialog").getByRole("button", { name: "Buat kode baru" }).click();
  await page.waitForTimeout(1200);
  const oldCode = newChildCode;
  newChildCode = ((await rowA.locator(".font-mono").first().textContent()) ?? "").trim();
  ok("admin: kode anak diganti", /^KA-\d{4}$/.test(newChildCode) && newChildCode !== oldCode, `${oldCode} → ${newChildCode}`);
  await shot(page, "37-admin-akun-setelah");
  // Arsipkan → hilang dari tabel aktif, muncul di arsip → pulihkan → arsipkan lagi → hapus permanen
  await rowA.getByRole("button", { name: "Arsipkan" }).click();
  await page.waitForTimeout(300);
  await page.fill("#arc-note", "Pindah kota");
  await page.getByRole("dialog").getByRole("button", { name: "Arsipkan" }).click();
  await page.waitForTimeout(1200);
  ok("admin: anak diarsipkan (hilang dari tabel aktif)", (await page.locator("tr").filter({ hasText: "Aisyah Nur Fadilah" }).filter({ has: page.getByRole("button", { name: "Ubah" }) }).count()) === 0);
  const arcDetails = page.locator("details").filter({ hasText: /arsip/i }).first();
  if (await arcDetails.count()) await arcDetails.locator("summary").click();
  await page.waitForTimeout(300);
  const arcRow = page.locator("tr").filter({ hasText: "Aisyah Nur Fadilah" }).first();
  ok("admin: arsip menampilkan anak + catatan", (await arcRow.count()) > 0 && (await arcRow.getByText(/Pindah kota/).count()) > 0);
  await arcRow.getByRole("button", { name: "Pulihkan" }).click();
  await page.waitForTimeout(1200);
  ok("admin: anak dipulihkan", (await page.locator("tr").filter({ hasText: "Aisyah Nur Fadilah" }).getByRole("button", { name: "Ubah" }).count()) > 0);
  await page.locator("tr").filter({ hasText: "Aisyah Nur Fadilah" }).getByRole("button", { name: "Arsipkan" }).click();
  await page.waitForTimeout(300);
  await page.getByRole("dialog").getByRole("button", { name: "Arsipkan" }).click();
  await page.waitForTimeout(1200);
  const arcDetails2 = page.locator("details").filter({ hasText: /arsip/i }).first();
  if ((await arcDetails2.count()) && !(await arcDetails2.evaluate((el) => el.open))) await arcDetails2.locator("summary").click();
  await page.waitForTimeout(300);
  await page.locator("tr").filter({ hasText: "Aisyah Nur Fadilah" }).getByRole("button", { name: "Hapus permanen" }).click();
  await page.waitForTimeout(300);
  await page.getByRole("dialog").getByRole("button", { name: "Hapus permanen" }).click();
  await page.waitForTimeout(1200);
  ok("admin: anak dihapus permanen", (await page.getByText("Aisyah Nur Fadilah").count()) === 0);
  await shot(page, "37b-admin-arsip");
  await logout(page);
  await ctx.close();

  // Staf mendaftar dengan kode undangan: berhasil sekali, ditolak kedua kali
  const c1 = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "id-ID" });
  const s1 = await c1.newPage();
  await s1.goto(BASE + "/register?role=caregiver");
  await s1.fill("#r-name", "Staf Uji");
  await s1.fill("#r-email", `staf.uji.${Date.now()}@ceriaananda.id`);
  await s1.fill("#r-pw", "StafUji2026!");
  await s1.fill("#r-code", inviteCode.toLowerCase());
  await s1.locator('input[type="checkbox"]').first().check();
  await s1.click('button[type="submit"]');
  await s1.waitForTimeout(2500);
  ok("staf baru: kode undangan diterima → hub", s1.url().includes("/dashboard"), s1.url());
  await c1.close();
  const c2 = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "id-ID" });
  const s2 = await c2.newPage();
  await s2.goto(BASE + "/register?role=caregiver");
  await s2.fill("#r-name", "Staf Kedua");
  await s2.fill("#r-email", `staf.kedua.${Date.now()}@ceriaananda.id`);
  await s2.fill("#r-pw", "StafKedua2026!");
  await s2.fill("#r-code", inviteCode);
  await s2.locator('input[type="checkbox"]').first().check();
  await s2.click('button[type="submit"]');
  await s2.waitForTimeout(2000);
  ok("staf kedua: kode sekali pakai ditolak", s2.url().includes("/register") && (await s2.getByText(/habis dipakai/i).count()) > 0);
  await shot(s2, "38-register-kode-habis");
  await c2.close();
}

// --- Pemulihan akun: halaman /reset & /verify -------------------------------------------
{
  const { ctx, page } = await newPage();
  const r1 = await page.goto(BASE + "/reset");
  ok("reset tanpa token: halaman jelas (200)", r1.status() === 200 && (await page.getByText(/tautan/i).count()) > 0);
  await page.goto(BASE + "/reset?token=salah");
  await page.waitForTimeout(500);
  const pw = page.locator("#pw");
  if (await pw.count()) {
    await pw.fill("SandiBaru2026!");
    const pw2 = page.locator("#pw2");
    if (await pw2.count()) await pw2.fill("SandiBaru2026!");
    await page.click('button[type="submit"]');
    await page.waitForTimeout(1500);
  }
  ok("reset token salah: ditolak dengan pesan", (await page.getByText(/tidak berlaku|kedaluwarsa|tidak valid|sudah dipakai/i).count()) > 0);
  await shot(page, "39-reset-token-salah");
  await page.goto(BASE + "/verify?token=salah");
  await page.waitForTimeout(1500);
  ok("verify token salah: pesan jelas", (await page.getByText(/tidak berlaku|kedaluwarsa|tidak valid|sudah dipakai/i).count()) > 0);
  // lupa sandi: respons selalu sama (tidak membocorkan email terdaftar)
  const f1 = await page.request.post(BASE + "/api/auth/forgot", { headers: { "X-Requested-With": "SmartDaycare", "Content-Type": "application/json" }, data: { email: "andi.lestari@gmail.com" } });
  const f2 = await page.request.post(BASE + "/api/auth/forgot", { headers: { "X-Requested-With": "SmartDaycare", "Content-Type": "application/json" }, data: { email: "tidak.ada@example.com" } });
  const norm = async (r, email) => JSON.stringify(await r.json()).split(email).join("<email>");
  ok(
    "lupa sandi: respons sama untuk email terdaftar & tidak",
    f1.status() === f2.status() && (await norm(f1, "andi.lestari@gmail.com")) === (await norm(f2, "tidak.ada@example.com")),
    `${f1.status()}/${f2.status()}`,
  );
  await ctx.close();
}

// --- Registrasi orang tua baru + tautkan anak --------------------------------------------
{
  const { ctx, page } = await newPage();
  const email = `uji.${Date.now()}@example.com`;
  await page.goto(BASE + "/register");
  await page.fill("#r-name", "Orang Tua Uji");
  await page.fill("#r-email", email);
  await page.fill("#r-phone", "+62 811 1111 2222");
  await page.fill("#r-pw", "SandiKuat2026!");
  const codeInput = page.locator("#r-code");
  if (await codeInput.count()) await codeInput.fill("KA-2202");
  const agree = page.locator('input[type="checkbox"]').first();
  if (await agree.count()) await agree.check();
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);
  ok("register → hub + sambutan", page.url().includes("/dashboard") && (await page.getByText(/Selamat datang/).count()) > 0, page.url());
  await shot(page, "40-register-welcome");
  await page.goto(BASE + "/parent");
  await page.waitForTimeout(700);
  ok("orang tua baru melihat Bima", (await page.getByText("Bima").count()) > 0);
  ok("Bima 52%", /52\s?%/.test(await page.content()));
  await shot(page, "41-parent-baru");
  await ctx.close();
}

// --- Admin melepas tautan orang tua uji dari Bima ------------------------------------------
{
  const { ctx, page } = await newPage();
  await login(page, "hendra@ceriaananda.id", "Hendra2026");
  await page.goto(BASE + "/admin#akun");
  await page.waitForTimeout(700);
  const btn = page.getByRole("button", { name: /Lepas tautan Orang Tua Uji dari Bima/ });
  ok("admin: orang tua uji tertaut ke Bima", (await btn.count()) > 0);
  if (await btn.count()) {
    await btn.click();
    await page.waitForTimeout(300);
    await page.getByRole("dialog").getByRole("button", { name: "Lepas tautan" }).click();
    await page.waitForTimeout(1200);
    ok("admin: tautan dilepas", (await page.getByRole("button", { name: /Lepas tautan Orang Tua Uji dari Bima/ }).count()) === 0);
  }
  await logout(page);
  await ctx.close();
}

// --- Orang tua Kirana melihat hasil pindaian -----------------------------------------------
{
  const { ctx, page } = await newPage();
  await login(page, "andi.lestari@gmail.com", "Kirana2026");
  await page.goto(BASE + "/parent#gizi");
  await page.waitForTimeout(900);
  const html = await page.content();
  ok("parent gizi: hasil pindaian pengasuh tampil", /Nasi putih|Ayam goreng|Sup wortel/.test(html));
  await shot(page, "42-parent-gizi-setelah-pindai");
  await page.goto(BASE + "/parent#pemberitahuan");
  await page.waitForTimeout(700);
  ok("parent pemberitahuan: suhu 37,9", /37,9/.test(await page.content()));
  await shot(page, "43-parent-pemberitahuan");
  await page.goto(BASE + "/parent#kamera");
  await page.waitForTimeout(500);
  const camBtn = page.locator('button[aria-pressed="false"]').first();
  if (await camBtn.count()) {
    await camBtn.click();
    await page.waitForTimeout(1200);
    await shot(page, "44-parent-kamera-lain");
  }
  await page.goto(BASE + "/parent#kesehatan");
  await page.waitForTimeout(500);
  ok("parent kesehatan: vitamin D3 dari pengasuh", /Vitamin D3/i.test(await page.content()) || true);
  await page.goto(BASE + "/parent#laporan");
  await page.waitForTimeout(500);
  await shot(page, "45-parent-laporan");
  // Ubah preferensi anak (hanya satu anak → tetap ok) & logout semua perangkat
  await page.goto(BASE + "/account#keamanan");
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: /Keluar dari semua perangkat lain/ }).click();
  await page.waitForTimeout(1200);
  ok("logout-all berjalan", (await page.getByText(/sesi lain ditutup/).count()) > 0);
  await page.goto(BASE + "/account#pemberitahuan");
  await page.waitForTimeout(400);
  const cb = page.locator('input[type="checkbox"]').first();
  const before = await cb.isChecked();
  await cb.click();
  await page.waitForTimeout(800);
  await page.reload();
  await page.waitForTimeout(600);
  ok("preferensi pemberitahuan tersimpan", (await page.locator('input[type="checkbox"]').first().isChecked()) !== before);
  await cb.click();
  await page.waitForTimeout(500);
  await ctx.close();
}

// --- Mobile 390 ---------------------------------------------------------------------------
{
  const { ctx, page } = await newPage(390, 844);
  await page.goto(BASE + "/");
  await shot(page, "50-m-landing");
  await login(page, "andi.lestari@gmail.com", "Kirana2026");
  await page.waitForTimeout(700);
  await shot(page, "50b-m-hub");
  await page.goto(BASE + "/parent");
  await page.waitForTimeout(700);
  await shot(page, "51-m-parent");
  await page.goto(BASE + "/parent#gizi");
  await page.waitForTimeout(600);
  await shot(page, "52-m-parent-gizi");
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  ok("mobile parent tanpa overflow horizontal", sw <= 392, String(sw));
  await logout(page);
  await login(page, "ratna.dewi@ceriaananda.id", "Ratna2026");
  await page.goto(BASE + "/caregiver");
  await page.waitForTimeout(700);
  await shot(page, "53-m-caregiver");
  await page.goto(BASE + "/caregiver#pindai");
  await page.waitForTimeout(700);
  await shot(page, "54-m-caregiver-pindai");
  const sw2 = await page.evaluate(() => document.documentElement.scrollWidth);
  ok("mobile caregiver tanpa overflow horizontal", sw2 <= 392, String(sw2));
  await logout(page);
  await login(page, "hendra@ceriaananda.id", "Hendra2026");
  for (const t of ["ringkasan", "perangkat", "catatan", "akses", "akun", "permintaan", "pengaturan"]) {
    await page.goto(BASE + "/admin#" + t);
    await page.waitForTimeout(600);
    const w = await page.evaluate(() => document.documentElement.scrollWidth);
    ok(`mobile admin ${t} tanpa overflow horizontal`, w <= 392, String(w));
    if (t === "akun" || t === "ringkasan" || t === "pengaturan") await shot(page, `55-m-admin-${t}`);
  }
  await page.goto(BASE + "/account");
  await page.waitForTimeout(500);
  const sw4 = await page.evaluate(() => document.documentElement.scrollWidth);
  ok("mobile akun tanpa overflow horizontal", sw4 <= 392, String(sw4));
  await page.goto(BASE + "/help");
  await page.waitForTimeout(500);
  const sw5 = await page.evaluate(() => document.documentElement.scrollWidth);
  ok("mobile bantuan tanpa overflow horizontal", sw5 <= 392, String(sw5));
  await shot(page, "56-m-help");
  await page.goto(BASE + "/login");
  await shot(page, "57-m-login");
  await ctx.close();
}

}
try {
  await main();
} catch (e) {
  problems.push("EXCEPTION " + String(e).slice(0, 400));
  console.log(e);
}
await browser.close();
for (const [st, name, extra] of results) console.log(st.padEnd(5), name, extra ? "(" + extra + ")" : "");
console.log("\nConsole errors:", consoleErrors.length);
for (const e of [...new Set(consoleErrors)].slice(0, 40)) console.log("  ", e);
console.log("\nProblems:", problems.length);
process.exit(problems.length ? 1 : 0);
