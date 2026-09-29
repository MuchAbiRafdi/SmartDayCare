#!/usr/bin/env bash
# Mode produksi: build Next.js lalu jalankan next start + uvicorn (tanpa reload).
# Variabel opsional: API_PORT (8000), WEB_PORT (3000), WEB_HOST (0.0.0.0), SD_* (lihat api/.env.example).
set -euo pipefail
cd "$(dirname "$0")"
source ./_common.sh
trap 'kill 0' EXIT INT TERM

export SD_ENV="${SD_ENV:-production}"
export NODE_ENV=production
( cd web && npm run build )

( cd api && exec python3 -m uvicorn app.main:app --host 127.0.0.1 --port "$API_PORT" --workers 1 --env-file .env ) &
( cd web && exec npx next start -H "$WEB_HOST" -p "$WEB_PORT" ) &
echo "» Web: http://localhost:${WEB_PORT}   API: ${API_URL}/api/health"
wait
