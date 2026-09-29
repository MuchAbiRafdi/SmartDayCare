"""Cadangan basis data SQLite harian (salinan konsisten lewat API backup SQLite) + pembersihan cadangan lama."""
from __future__ import annotations

import gzip
import logging
import shutil
import sqlite3
import time
from datetime import datetime
from pathlib import Path

from . import config

logger = logging.getLogger("smartdaycare.backup")


def sqlite_path() -> Path | None:
    url = config.DATABASE_URL
    if not url.startswith("sqlite:///"):
        return None
    p = url[len("sqlite:///") :]
    return Path(p) if p and p != ":memory:" else None


def run_backup(dest_dir: Path | None = None, keep_days: int | None = None) -> Path | None:
    """Buat cadangan `smartdaycare-YYYYmmdd-HHMM.db.gz`; kembalikan path atau None bila bukan SQLite."""
    src = sqlite_path()
    if src is None or not src.exists():
        return None
    dest_dir = dest_dir or config.BACKUP_DIR
    dest_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M")
    tmp = dest_dir / f".partial-{stamp}.db"
    out = dest_dir / f"smartdaycare-{stamp}.db.gz"
    with sqlite3.connect(f"file:{src}?mode=ro", uri=True) as con, sqlite3.connect(tmp) as bak:
        con.backup(bak)
    with tmp.open("rb") as f_in, gzip.open(out, "wb", compresslevel=6) as f_out:
        shutil.copyfileobj(f_in, f_out)
    tmp.unlink(missing_ok=True)
    prune(dest_dir, keep_days if keep_days is not None else config.BACKUP_KEEP_DAYS)
    logger.info("Cadangan basis data tersimpan: %s", out)
    return out


def prune(dest_dir: Path, keep_days: int) -> int:
    cut = time.time() - keep_days * 86400
    removed = 0
    for p in dest_dir.glob("smartdaycare-*.db.gz"):
        if p.stat().st_mtime < cut:
            p.unlink(missing_ok=True)
            removed += 1
    return removed


def last_backup() -> dict[str, object] | None:
    files = sorted(config.BACKUP_DIR.glob("smartdaycare-*.db.gz")) if config.BACKUP_DIR.exists() else []
    if not files:
        return None
    p = files[-1]
    return {"file": p.name, "bytes": p.stat().st_size, "at": datetime.fromtimestamp(p.stat().st_mtime).isoformat(timespec="seconds")}
