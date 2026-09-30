// Pemindaian aksesibilitas (axe-core) untuk halaman publik dan ketiga dasbor.
// Jalankan setelah `next build && next start` dan API aktif:
//   cd e2e && npm install && node a11y.mjs [BASE_URL]
// Setiap halaman dipindai di lebar desktop (1280) dan ponsel (390); di ponsel
// menu navigasi laci juga dibuka agar isinya ikut diperiksa.
// Keluar dengan kode 1 bila ada pelanggaran WCAG 2.x A/AA atau praktik terbaik axe.
import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";
import { chromeExecutable } from "./browser.mjs";

const BASE = process.argv[2] || process.env.BASE_URL || "http://localhost:3000";
const axe = readFileSync(new URL("./node_modules/axe-core/axe.min.js", import.meta.url), "utf8");
const DESKTOP = { width: 1280, height: 900 };
const MOBILE = { width: 390, height: 844 };
let total = 0;

const b = await chromium.launch({ executablePath: chromeExecutable(chromium) });

async function login(ctx, email, password) {
  const r = await ctx.request.post(BASE + "/api/auth/login", {
    data: { email, password, remember: false },
    headers: { origin: BASE, "sec-fetch-site": "same-origin" },
  });
  if (!r.ok()) throw new Error("login gagal " + email);
}

async function scan(ctx, path, label, mobile) {
  const p = await ctx.newPage();
  // Halaman berotentikasi memakai SSE, jadi "networkidle" tidak pernah tercapai.
  await p.goto(BASE + path, { waitUntil: "load" });
  await p.waitForTimeout(1200);
  if (mobile) {
    const menu = p.getByRole("button", { name: /menu|navigasi/i }).first();
    if (await menu.count()) {
      await menu.click().catch(() => {});
      await p.waitForTimeout(400);
    }
  }
  await p.addScriptTag({ content: axe });
  const res = await p.evaluate(
    async () =>
      await window.axe.run(document, {
        runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "best-practice"] },
      }),
  );
  const v = res.violations;
  total += v.length;
  console.log(`== ${label} (${path}) ${mobile ? "ponsel" : "desktop"} — ${v.length} jenis pelanggaran`);
  for (const x of v) {
    const n = x.nodes[0];
    const why = (n.failureSummary || "").split("\n")[1] || "";
    console.log(`  [${x.impact}] ${x.id}: ${x.help} — ${x.nodes.length} node; contoh: ${n.target[0]} :: ${why}`.slice(0, 260));
  }
  await p.close();
}

const PAGES = [
  { who: null, items: [["/", "Beranda publik"], ["/login", "Masuk"], ["/register", "Daftar"], ["/help", "Bantuan"]] },
  {
    who: ["andi.lestari@gmail.com", "Kirana2026"],
    items: [["/dashboard", "Hub orang tua"], ["/parent", "Dasbor orang tua"], ["/parent#gizi", "Orang tua · gizi"], ["/parent#kamera", "Orang tua · kamera"], ["/account", "Akun"]],
  },
  {
    who: ["ratna.dewi@ceriaananda.id", "Ratna2026"],
    items: [["/caregiver", "Pengasuh"], ["/caregiver#pindai", "Pengasuh · pindai"], ["/caregiver#obat", "Pengasuh · obat"]],
  },
  {
    who: ["hendra@ceriaananda.id", "Hendra2026"],
    items: [["/admin", "Admin"], ["/admin#akun", "Admin · akun"], ["/admin#pengaturan", "Admin · pengaturan"]],
  },
];

for (const viewport of [DESKTOP, MOBILE]) {
  const mobile = viewport === MOBILE;
  for (const group of PAGES) {
    const ctx = await b.newContext({ viewport });
    if (group.who) await login(ctx, group.who[0], group.who[1]);
    for (const [path, label] of group.items) await scan(ctx, path, label, mobile);
    await ctx.close();
  }
}
await b.close();
console.log(`\nSelesai: ${total} jenis pelanggaran.`);
process.exit(total ? 1 : 0);
