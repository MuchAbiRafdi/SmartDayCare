"""Bagian data yang dipakai bersama: daftar foto berlabel, dan pemisahan latih/uji per foto.

Modul ini terpisah dari train.py supaya `eval_prep.py` bisa menyiapkan foto uji tanpa memasang
kerangka latih (torch) — cukup numpy + pillow. Logikanya dipindah apa adanya: split ditentukan
SEED dan urutan `list_images()`, jadi himpunan foto uji tidak berubah karena pemindahan ini.

Variabel lingkungan: SD_VAL (fraksi foto uji per kelas, bawaan 0,18).

`python3 dataset.py --freeze` membekukan daftar foto uji ke `data/split.json`.
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
SPLIT = ROOT / "data" / "split.json"

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


def split_for(names: list[str] | None, primary: np.ndarray, val_frac: float = VAL_FRAC) -> np.ndarray:
    """Mask foto uji berdasarkan nama kalau `data/split.json` ada, kalau tidak: hasil `split_by_image`.

    Membekukan himpunan uji itu penting saat foto latih bertambah: tanpa berkas ini, menambah satu
    foto pun mengubah urutan `list_images()` → shuffle → siapa yang jadi foto uji, dan angka dua
    versi model tidak lagi dibandingkan di atas fotonya sendiri.
    """
    if names is not None and SPLIT.exists():
        frozen = set(json.loads(SPLIT.read_text())["val"])
        return np.array([n in frozen for n in names], dtype=bool)
    return split_by_image(primary, val_frac)


def freeze_split() -> int:
    """Tulis `data/split.json` dari pemisahan bawaan (SEED) — sekali, supaya tidak bergeser lagi."""
    files = list_images()
    primary = np.array([CLASSES.index(ls[0]) for _, ls in files], np.int64)
    val = split_by_image(primary)
    names = sorted(f"{f.parent.name}/{f.name}" for (f, _), v in zip(files, val) if v)
    SPLIT.write_text(
        json.dumps(
            {
                "note": "Daftar foto uji yang dibekukan. Semua foto lain dipakai untuk berlatih, "
                "termasuk foto yang ditambahkan setelah pembekuan (sengaja: supaya angka antar "
                "versi model selalu diukur pada foto yang sama).",
                "photosTrain": len(files) - len(names),
                "val": names,
            },
            indent=1,
        )
    )
    return len(names)


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


def check_split() -> int:
    """Pastikan split beku masih cocok dengan isi data — gagal keras kalau tidak (kode keluar 1)."""
    files = [f"{f.parent.name}/{f.name}" for f, _ in list_images()]
    if not SPLIT.exists():
        print("data/split.json belum ada — himpunan uji masih hasil `split_by_image` (SEED).")
        print(f"Daftar foto sekarang: {len(files)}. Bekukan dengan: python3 dataset.py --freeze")
        return 0
    val = json.loads(SPLIT.read_text())["val"]
    missing = [v for v in val if v not in set(files)]
    extra = sorted(set(files) - set(val))
    print(f"foto latih {len(extra)} + foto uji beku {len(val) - len(missing)} = {len(files)} foto di manifest")
    if missing:
        print(f"  ADA {len(missing)} foto uji yang hilang dari data/raw → angka lama tidak dapat diulang:")
        for m in missing[:8]:
            print("   -", m)
        return 1
    return 0


if __name__ == "__main__":
    import sys

    if "--freeze" in sys.argv:
        print(freeze_split(), "foto uji dibekukan →", SPLIT)
    elif "--check" in sys.argv:
        raise SystemExit(check_split())
    else:
        print(__doc__)
