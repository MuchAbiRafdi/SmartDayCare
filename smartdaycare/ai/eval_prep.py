"""Siapkan foto uji (split yang sama dengan train.py) sebagai RGBA mentah untuk eval-plates.mjs."""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

from train import CLASSES, list_images, split_by_image

OUT = Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/evalset")
OUT.mkdir(parents=True, exist_ok=True)
files = list_images()
primary = np.array([CLASSES.index(ls[0]) for _, ls in files], np.int64)
val = split_by_image(primary)
index = []
for i, ((f, labels), is_val) in enumerate(zip(files, val)):
    if not is_val:
        continue
    im = Image.open(f).convert("RGB")
    w, h = im.size
    scale = min(1.0, 320 / w)  # seperti bingkai analisis aplikasi (lebar ≤ 320)
    im = im.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.BILINEAR)
    arr = np.asarray(im)
    rgba = np.concatenate([arr, np.full(arr.shape[:2] + (1,), 255, np.uint8)], axis=2)
    name = f"{i:04d}.rgba"
    (OUT / name).write_bytes(rgba.tobytes())
    index.append({"file": f"{f.parent.name}/{f.name}", "labels": labels, "w": im.size[0], "h": im.size[1], "raw": name})
(OUT / "index.json").write_text(json.dumps(index))
print(len(index), "foto uji →", OUT)
