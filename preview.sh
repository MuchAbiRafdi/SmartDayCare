#!/usr/bin/env bash
# Pemulihan pratinjau di sandbox ini (paket & build tidak ikut tersimpan saat sandbox tidur).
# Pakai:  ./preview.sh            → pasang paket yang hilang + build produksi bila belum ada
#         ./preview.sh --rebuild  → paksa build ulang (setelah kode berubah)
#         ./preview.sh --reset-db → mulai lagi dari data contoh
#         ./preview.sh --e2e      → siapkan Playwright + pustaka Chromium untuk uji ujung-ke-ujung
# Build ulang tanpa mematikan server lama: NEXT_DIST_DIR=.next-new (lihat next.config.ts), lalu
# hentikan server, `rm -rf .next && mv .next-new .next`, dan mulai lagi (jeda ±3 detik).
# Setelah itu jalankan server (dua proses terpisah):
#   cd smartdaycare/api && SD_COOKIE_SAMESITE=none python3 -m uvicorn app.main:app --host 127.0.0.1 --port 8000
#   cd smartdaycare/web && ALLOW_EMBED=1 npx next start -H 0.0.0.0 -p 3000
set -euo pipefail
cd "\$(dirname "\$0")/smartdaycare"

REBUILD=0; RESET=0; E2E=0
for a in "\$@"; do
  case "\$a" in
    --rebuild) REBUILD=1 ;;
    --reset-db) RESET=1 ;;
    --e2e) E2E=1 ;;
  esac
done

if ! python3 -c "import fastapi, sqlalchemy, uvicorn, dotenv" >/dev/null 2>&1; then
  echo "» Paket Python…"; python3 -m pip install --user -q -r api/requirements.txt 2>&1 | grep -v -i "notice\|warn" || true
fi
if [ ! -d web/node_modules ]; then
  echo "» Paket Node…"; ( cd web && npm ci --no-audit --no-fund --loglevel=error )
fi
if [ "\$REBUILD" = 1 ] || [ ! -f web/.next/BUILD_ID ]; then
  echo "» Build produksi (ALLOW_EMBED=1 agar bisa tampil di pratinjau tersemat)…"
  ( cd web && ALLOW_EMBED=1 NODE_OPTIONS=--max-old-space-size=1400 npx next build 2>&1 | grep -E "Compiled|rror" )
fi
if [ "\$E2E" = 1 ]; then
  # Playwright + pustaka sistem Chromium (hilang setelah sandbox dipulihkan)
  ( cd ../e2e && [ -d node_modules/playwright-core ] || npm install --no-audit --no-fund --loglevel=error playwright-core@1.49.1 )
  [ -d ~/.cache/ms-playwright/chromium_headless_shell-1148 ] || ( cd ../e2e && npx playwright-core install chromium >/dev/null 2>&1 )
  if ! ldconfig -p 2>/dev/null | grep -q libnss3; then
    sudo -n apt-get update -q >/dev/null 2>&1 || true
    sudo -n apt-get install -y -q libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libatspi2.0-0 libxdamage1 libxkbcommon0 libasound2 >/dev/null 2>&1 || true
  fi
  echo "» Playwright siap: cd /home/user/e2e && PLATE_DIR=/home/user/smartdaycare/web/public/img node run.mjs"
fi
if [ "\$RESET" = 1 ]; then
  rm -f api/data/smartdaycare.db*; echo "» Basis data dikosongkan; data contoh dibuat saat API mulai."
fi
echo "» Siap. Jalankan API (:8000) dan web (:3000) — lihat komentar di atas."
