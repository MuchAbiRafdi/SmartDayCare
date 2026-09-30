#!/usr/bin/env bash
# Cadangan basis data manual (di luar cadangan otomatis pukul 02.00).
#   ./scripts/backup.sh                 → api/data/backups/smartdaycare-YYYYmmdd-HHMM.db.gz
#   ./scripts/backup.sh /mnt/usb/backup → folder lain
# Untuk Docker: docker compose -f deploy/docker-compose.yml exec api python -c "from app.backup import run_backup; print(run_backup())"
set -euo pipefail
cd "$(dirname "$0")/../api"
python3 - "$@" <<'PY'
import sys
from pathlib import Path
from app.backup import run_backup

dest = Path(sys.argv[1]) if len(sys.argv) > 1 else None
out = run_backup(dest)
print(out if out else "Bukan SQLite: cadangkan lewat alat basis data (mis. pg_dump).")
PY
