"""Bagian data yang dipakai bersama: daftar foto berlabel, dan pemisahan latih/uji per foto.

Modul ini terpisah dari train.py supaya `eval_prep.py` bisa menyiapkan foto uji tanpa memasang
kerangka latih (torch) — cukup numpy + pillow. Logikanya dipindah apa adanya: split ditentukan
SEED dan urutan `list_images()`, jadi himpunan foto uji tidak berubah karena pemindahan ini.

Variabel lingkungan: SD_VAL (fraksi foto uji per kelas, bawaan 0,18).
"""
from __future__ import annotations

import json
import os
import random
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent
RAW = ROOT / "data" / "raw"
MANIFEST = ROOT / "data" / "manifest.json"

CLASSES = ["rice", "greens", "fried", "pale", "brown", "soup", "orange", "yellow", "red", "egg", "none"]
NONE_IDX = CLASSES.index("none")
SEED = 7
VAL_FRAC = float(os.environ.get("SD_VAL", "0.18"))


# ---------------------------------------------------------------- data ----
def list_images() -> list[tuple[Path, list[str]]]:
    """Daftar (berkas, label-label) dari data/manifest.json; fallback ke nama folder."""
    if MANIFEST.exists():
        entries = json.loads(MANIFEST.read_text())
        files = [(RAW / e["file"], list(e["labels"])) for e in entries]
        return [(f, ls) for f, ls in files if f.exists() and all(c in CLASSES for c in ls)]
    files: list[tuple[Path, list[str]]] = []
    for c in CLASSES:
        for f in sorted((RAW / c).glob("*")):
            files.append((f, [c]))
    return files


def split_by_image(primary: np.ndarray, val_frac: float = VAL_FRAC) -> np.ndarray:
    """Pisahkan per FOTO (bukan per tambalan) agar akurasi uji jujur; kembalikan mask foto uji."""
    rng = random.Random(SEED)
    val = np.zeros(len(primary), np.bool_)
    for c in range(len(CLASSES)):
        cand = [int(i) for i in np.flatnonzero(primary == c)]
        rng.shuffle(cand)
        k = max(1, round(len(cand) * val_frac))
        for i in cand[:k]:
            val[i] = True
    return val
