#!/usr/bin/env bash
# Dipakai oleh dev.sh dan start.sh: pastikan dependensi ada, satukan variabel port.
set -euo pipefail

export API_PORT="${API_PORT:-8000}"
export WEB_PORT="${WEB_PORT:-3000}"
export WEB_HOST="${WEB_HOST:-0.0.0.0}"
# Alamat API yang dipakai server Next.js (proxy /api dan pengambilan data awal).
export API_URL="${API_URL:-http://127.0.0.1:${API_PORT}}"

need() { command -v "$1" >/dev/null 2>&1 || { echo "Butuh '$1' terpasang." >&2; exit 1; }; }
need python3
need npm

# Paket Python
if ! python3 -c "import fastapi, sqlalchemy, uvicorn" >/dev/null 2>&1; then
  echo "» Memasang paket Python (api/requirements.txt)…"
  python3 -m pip install --quiet -r api/requirements.txt \
    || python3 -m pip install --quiet --user -r api/requirements.txt
fi

# Paket Node
if [ ! -d web/node_modules ]; then
  echo "» Memasang paket Node (web/package-lock.json)…"
  ( cd web && npm ci --no-audit --no-fund )
fi

# Contoh konfigurasi → file nyata bila belum ada (tidak menimpa)
[ -f api/.env ] || cp api/.env.example api/.env
