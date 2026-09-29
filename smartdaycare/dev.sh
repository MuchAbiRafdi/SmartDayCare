#!/usr/bin/env bash
# Mode pengembangan: API (uvicorn --reload) dan web (next dev) dengan muat-ulang otomatis.
# Variabel opsional: API_PORT (8000), WEB_PORT (3000), WEB_HOST (0.0.0.0), SD_* (lihat api/.env.example).
set -euo pipefail
cd "$(dirname "$0")"
source ./_common.sh
trap 'kill 0' EXIT INT TERM

( cd api && exec python3 -m uvicorn app.main:app --host 127.0.0.1 --port "$API_PORT" --reload --env-file .env ) &
( cd web && exec npx next dev -H "$WEB_HOST" -p "$WEB_PORT" ) &
echo "» Web: http://localhost:${WEB_PORT}   API: ${API_URL}/api/health"
wait
