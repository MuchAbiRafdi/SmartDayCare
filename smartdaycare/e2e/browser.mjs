// Cari peramban untuk uji e2e, dengan pesan yang menjelaskan kalau memang tidak ada.
//
// Urutannya: (1) biarkan playwright-core memakai perambannya sendiri; (2) E2E_CHROME=/jalur/ke/chromium
// untuk memakai Chromium/Chrome sistem; (3) intai direktori unduhan playwright di cache; (4) berhenti
// dengan cara memasang, bukan dengan jejak tumpukan error.
//
// Kenapa perlu: di lingkungan tanpa akses keluar (mis. sandbox atau CI tertutup), unduhan
// cdn.playwright.dev gagal — dan kegagalan itu mudah salah dibaca sebagai "aplikasinya rusak".
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function scanCache() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || path.join(os.homedir(), ".cache", "ms-playwright");
  if (!fs.existsSync(root)) return null;
  for (const dir of fs.readdirSync(root).sort().reverse()) {
    if (!/^chromium(-headless-shell)?-/.test(dir)) continue;
    for (const cand of [
      path.join(root, dir, "chrome-linux", "chrome"),
      path.join(root, dir, "chrome-linux", "headless_shell"),
      path.join(root, dir, "chrome-mac", "Chromium.app", "Contents", "MacOS", "Chromium"),
      path.join(root, dir, "chrome-linux", "chrome-linux", "chrome"),
    ]) {
      if (fs.existsSync(cand)) return cand;
    }
  }
  return null;
}

function berhenti(kenapa) {
  console.error(`
${kenapa}

  Uji e2e butuh peramban. Pilih salah satu:
    npm run install-browser                        # unduh Chromium (butuh akses cdn.playwright.dev)
    E2E_CHROME=/usr/bin/chromium npm test          # pakai Chromium/Chrome dari sistem
    PLAYWRIGHT_BROWSERS_PATH=/dir                  # kalau perambannya sudah ada di tempat lain

  Di lingkungan yang tidak boleh mengunduh, lewati e2e dan jalankan yang tetap bisa dijalankan:
    cd ../api && python3 -m pytest -q              # aturan bisnis & analitik
    node ../ai/eval-plates.mjs ...                 # kualitas pembacaan foto (lihat ai/README.md)
`);
  process.exit(2);
}

/** Jalur executable untuk `chromium.launch()`, atau undefined bila playwright sudah tahu sendiri. */
export function chromeExecutable(chromium) {
  const env = process.env.E2E_CHROME;
  if (env) {
    if (!fs.existsSync(env)) berhenti(`E2E_CHROME menunjuk ke ${env}, tetapi berkas itu tidak ada.`);
    return env;
  }
  try {
    const own = chromium.executablePath();
    if (own && fs.existsSync(own)) return undefined;
  } catch {
    /* playwright belum punya peramban — coba cara lain di bawah */
  }
  const found = scanCache();
  if (found) return found;
  berhenti("Peramban Chromium tidak ditemukan di lingkungan ini.");
}
