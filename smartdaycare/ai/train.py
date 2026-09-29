"""Latih pengenal makanan per-tambalan (patch) untuk pemindai piring.

Jalankan:  python3 train.py            (≈ 10–25 menit di CPU 2 inti)
Keluaran:  models/food-patch-v2.pt      bobot PyTorch + metadata
           models/food-patch-v2.meta.json

Ide: foto piring dipotong menjadi tambalan 48×48 px pada skala 10–32 % sisi
terpendek gambar (foto latih diseragamkan ke sisi terpendek 300 px, sama
dengan bingkai analisis di aplikasi yang ≤ 320 px). Setiap tambalan diberi
label salah satu kelas foto asalnya bila warna dan teksturnya masuk akal
untuk kelas itu (supervisi lemah). Satu foto boleh berlabel lebih dari satu
kelas (piring anak: nasi + brokoli + jagung); tambalan hanya dipakai bila
tepat satu kelas yang masuk akal, sehingga tidak ada tebakan ganda.
Kelas `none` diambil dari foto tanpa makanan (piring kosong, nampan, meja,
dinding, bayangan, lantai, tangan, kain, kertas).

Jaringan kecil (≈ 80 ribu parameter, 5 konvolusi + rata-rata global) supaya
bisa dijalankan di peramban tanpa pustaka tambahan (lihat web/src/lib/foodnet.ts).
Karena semua lapisan konvolusional, di peramban jaringan dijalankan sekali
untuk seluruh bingkai dan menghasilkan peta kelas rapat (langkah 8 px).

Variabel lingkungan: SD_EPOCHS (48), SD_PATCHES (80), SD_OUT (food-patch-v2),
SD_ARCH ("12,24,48,64,64" = kanal tiap konvolusi; 3 konvolusi pertama diikuti max-pool).
"""
from __future__ import annotations

import json
import math
import os
import random
import time
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from PIL import Image

ROOT = Path(__file__).resolve().parent
RAW = ROOT / "data" / "raw"
MANIFEST = ROOT / "data" / "manifest.json"
MODELS = ROOT / "models"

CLASSES = ["rice", "greens", "fried", "pale", "brown", "soup", "orange", "yellow", "red", "egg", "none"]
PATCH = 48
MIN_SIDE = 300
MEAN = (0.5, 0.5, 0.5)
STD = (0.25, 0.25, 0.25)
SEED = 7
EPOCHS = int(os.environ.get("SD_EPOCHS", "48"))
PER_IMAGE = int(os.environ.get("SD_PATCHES", "80"))
OUT_NAME = os.environ.get("SD_OUT", "food-patch-v2")
ARCH = tuple(int(c) for c in os.environ.get("SD_ARCH", "12,24,48,64,64").split(","))
CACHE = ROOT / "data" / f"patches-v2-{PER_IMAGE}.npz"


# ---------------------------------------------------------------- data ----
def mean_hsv(arr: np.ndarray) -> tuple[float, float, float]:
    """HSV rata-rata (H derajat, S dan V 0..1) dari tambalan RGB uint8."""
    px = arr.reshape(-1, 3).astype(np.float32) / 255.0
    r, g, b = px[:, 0], px[:, 1], px[:, 2]
    mx = px.max(1)
    mn = px.min(1)
    d = mx - mn
    s = np.where(mx > 0, d / np.maximum(mx, 1e-6), 0)
    h = np.zeros_like(mx)
    m = d > 1e-6
    rm = m & (mx == r)
    gm = m & (mx == g) & ~rm
    bm = m & ~rm & ~gm
    h[rm] = ((g[rm] - b[rm]) / d[rm]) % 6
    h[gm] = (b[gm] - r[gm]) / d[gm] + 2
    h[bm] = (r[bm] - g[bm]) / d[bm] + 4
    h = h * 60
    # rata-rata hue melingkar, dibobot saturasi
    w = s + 1e-3
    ang = np.deg2rad(h)
    hm = math.degrees(math.atan2(float((np.sin(ang) * w).sum()), float((np.cos(ang) * w).sum()))) % 360
    return hm, float(s.mean()), float(mx.mean())


def texture(arr: np.ndarray) -> float:
    """Kekasaran tekstur: rata-rata beda luminans antar piksel tetangga (0..1).

    Butiran nasi, serat ayam, atau kembang kol memberi nilai ≥ 0,02; piring
    polos, dinding, dan taplak licin biasanya < 0,01.
    """
    lum = arr.astype(np.float32) @ np.array([0.299, 0.587, 0.114], np.float32) / 255.0
    if lum.shape[0] < 2 or lum.shape[1] < 2:
        return 0.0
    return float(np.abs(np.diff(lum, axis=1)).mean() + np.abs(np.diff(lum, axis=0)).mean())


def hue_in(h: float, lo: float, hi: float) -> bool:
    return lo <= h <= hi if lo <= hi else (h >= lo or h <= hi)


def warm_white(h: float, s: float) -> bool:
    """Putih netral/hangat (nasi, telur, tahu) — bukan piring mint/biru muda."""
    return s < 0.12 or hue_in(h, 15, 75)


def plausible(cls: str, h: float, s: float, v: float, tex: float) -> bool:
    """Saringan warna + tekstur longgar: apakah tambalan ini masuk akal untuk kelas itu?"""
    if cls == "rice":
        return s < 0.28 and v > 0.62 and warm_white(h, s) and tex >= 0.02
    if cls == "greens":
        return hue_in(h, 55, 120) and s > 0.18 and v > 0.15
    if cls == "fried":
        return hue_in(h, 12, 48) and s > 0.28 and 0.25 < v < 0.97
    if cls == "pale":
        if not (s < 0.42 and 0.45 < v < 0.98):
            return False
        if s < 0.2:
            return warm_white(h, s) and tex >= 0.02
        return hue_in(h, 20, 70)
    if cls == "brown":
        return hue_in(h, 345, 45) and s > 0.22 and v < 0.62
    if cls == "soup":
        # kuah + isi: tolak putih polos (bibir mangkuk, taplak) dan bagian sangat gelap
        return 0.2 < v < 0.92 and not (s < 0.1 and v > 0.8 and tex < 0.02)
    if cls == "orange":
        return hue_in(h, 12, 45) and s > 0.42 and v > 0.5
    if cls == "yellow":
        return hue_in(h, 40, 68) and s > 0.24 and v > 0.5
    if cls == "red":
        return hue_in(h, 335, 18) and s > 0.38 and v > 0.25
    if cls == "egg":
        return (s < 0.28 and v > 0.7 and warm_white(h, s) and tex >= 0.02) or (hue_in(h, 32, 62) and s > 0.4 and v > 0.5)
    return True  # none


def load_image(p: Path) -> np.ndarray:
    im = Image.open(p).convert("RGB")
    w, h = im.size
    sc = MIN_SIDE / min(w, h)
    im = im.resize((max(PATCH, round(w * sc)), max(PATCH, round(h * sc))), Image.BILINEAR)
    return np.asarray(im)


def sample_patches(arr: np.ndarray, labels: list[str], rng: random.Random, want: int) -> list[tuple[np.ndarray, str]]:
    """Ambil tambalan acak; label = satu-satunya kelas foto yang masuk akal untuk warnanya."""
    H, W = arr.shape[:2]
    m = min(W, H)
    out: list[tuple[np.ndarray, str]] = []
    tries = 0
    central = labels != ["none"]
    while len(out) < want and tries < want * 10:
        tries += 1
        side = int(m * rng.uniform(0.10, 0.32))
        if central:  # makanan biasanya di tengah foto
            cx = rng.uniform(0.15, 0.85) * W
            cy = rng.uniform(0.15, 0.85) * H
            x0 = int(min(max(0, cx - side / 2), W - side))
            y0 = int(min(max(0, cy - side / 2), H - side))
        else:
            x0 = rng.randint(0, W - side)
            y0 = rng.randint(0, H - side)
        crop = arr[y0 : y0 + side, x0 : x0 + side]
        sub = crop[:: max(1, side // 16), :: max(1, side // 16)]
        h, s, v = mean_hsv(sub)
        tex = texture(sub)
        ok = [c for c in labels if plausible(c, h, s, v, tex)]
        if len(ok) != 1:
            continue
        im = Image.fromarray(crop).resize((PATCH, PATCH), Image.BILINEAR)
        out.append((np.asarray(im), ok[0]))
    return out


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


def build_cache() -> dict[str, np.ndarray]:
    rng = random.Random(SEED)
    files = list_images()
    X: list[np.ndarray] = []
    Y: list[int] = []
    IMG: list[int] = []
    per_image: list[dict[str, object]] = []
    for idx, (f, labels) in enumerate(files):
        arr = load_image(f)
        if labels == ["none"]:
            want = int(PER_IMAGE * 0.75)
        else:
            want = int(PER_IMAGE * (1 + 0.5 * (len(labels) - 1)))
        ps = sample_patches(arr, labels, rng, want)
        got = {c: sum(1 for _, l in ps if l == c) for c in labels}
        per_image.append({"file": f"{f.parent.name}/{f.name}", "labels": labels, "patches": got})
        for p, l in ps:
            X.append(p)
            Y.append(CLASSES.index(l))
            IMG.append(idx)
    Xa = np.stack(X).astype(np.uint8)  # N,48,48,3
    primary = np.array([CLASSES.index(ls[0]) for _, ls in files], np.int64)
    multi = np.zeros((len(files), len(CLASSES)), np.bool_)
    for i, (_, ls) in enumerate(files):
        for c in ls:
            multi[i, CLASSES.index(c)] = True
    data = {"x": Xa, "y": np.array(Y, np.int64), "img": np.array(IMG, np.int64), "primary": primary, "multi": multi}
    np.savez_compressed(CACHE, **data)
    (ROOT / "data" / "patches-summary.json").write_text(json.dumps(per_image, indent=1))
    return data


def split_by_image(primary: np.ndarray, val_frac: float = 0.18) -> np.ndarray:
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


# --------------------------------------------------------------- model ----
class FoodNet(nn.Module):
    """N konvolusi 3×3 (BN+ReLU), max-pool setelah tiga konvolusi pertama, rata-rata global, linear."""

    def __init__(self, n_classes: int = len(CLASSES), ch: tuple[int, ...] = ARCH, dropout: float = 0.15) -> None:
        super().__init__()
        assert len(ch) >= 4, "butuh minimal 4 konvolusi (3 max-pool → langkah 8 px)"
        self.ch = tuple(ch)
        self.convs = nn.ModuleList()
        self.bns = nn.ModuleList()
        cin = 3
        for c in ch:
            self.convs.append(nn.Conv2d(cin, c, 3, padding=1, bias=False))
            self.bns.append(nn.BatchNorm2d(c))
            cin = c
        self.drop = nn.Dropout(dropout)
        self.fc = nn.Linear(cin, n_classes)

    def pools(self) -> list[bool]:
        return [i < 3 for i in range(len(self.convs))]

    def features(self, x: torch.Tensor) -> torch.Tensor:
        for conv, bn, pool in zip(self.convs, self.bns, self.pools()):
            x = F.relu(bn(conv(x)))
            if pool:
                x = F.max_pool2d(x, 2)
        return x

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        f = self.features(x)
        return self.fc(self.drop(f.mean((2, 3))))

    def dense(self, x: torch.Tensor) -> torch.Tensor:
        """Peta logit rapat (N, kelas, H/8, W/8), tiap sel = jendela 6×6 sel fitur."""
        f = self.features(x)
        logits = F.conv2d(f, self.fc.weight[:, :, None, None], self.fc.bias)
        return F.avg_pool2d(logits, 6, stride=1, padding=3, count_include_pad=False)[:, :, : f.shape[2], : f.shape[3]]


def normalize(x_uint8: torch.Tensor) -> torch.Tensor:
    x = x_uint8.float() / 255.0
    mean = torch.tensor(MEAN).view(1, 3, 1, 1)
    std = torch.tensor(STD).view(1, 3, 1, 1)
    return (x - mean) / std


def augment(x: torch.Tensor, gen: torch.Generator) -> torch.Tensor:
    """x: N,3,48,48 float 0..1. Augmentasi yang meniru kamera ponsel dan lampu ruangan."""
    n = x.shape[0]
    flip = torch.rand(n, generator=gen) < 0.5
    x = torch.where(flip.view(-1, 1, 1, 1), x.flip(3), x)
    flip = torch.rand(n, generator=gen) < 0.5
    x = torch.where(flip.view(-1, 1, 1, 1), x.flip(2), x)
    k = int(torch.randint(0, 4, (1,), generator=gen))
    x = torch.rot90(x, k, (2, 3))
    # kecerahan, kontras, white balance, gamma
    bright = 1 + (torch.rand(n, 1, 1, 1, generator=gen) - 0.5) * 0.5
    contrast = 1 + (torch.rand(n, 1, 1, 1, generator=gen) - 0.5) * 0.5
    wb = 1 + (torch.rand(n, 3, 1, 1, generator=gen) - 0.5) * 0.16
    mean = x.mean((1, 2, 3), keepdim=True)
    x = (x - mean) * contrast + mean * bright
    x = x * wb
    gamma = torch.exp((torch.rand(n, 1, 1, 1, generator=gen) - 0.5) * 0.5)
    x = x.clamp(1e-4, 1) ** gamma
    # saturasi ±20 % dan rona ±6° (kelas ditentukan warna, jadi geser rona harus kecil)
    gray = (x * torch.tensor([0.299, 0.587, 0.114]).view(1, 3, 1, 1)).sum(1, keepdim=True)
    sat = 1 + (torch.rand(n, 1, 1, 1, generator=gen) - 0.5) * 0.4
    x = gray + (x - gray) * sat
    ang = (torch.rand(n, generator=gen) - 0.5) * math.radians(12)
    cos, sin = torch.cos(ang).view(-1, 1, 1), torch.sin(ang).view(-1, 1, 1)
    yiq = torch.tensor([[0.299, 0.587, 0.114], [0.596, -0.274, -0.322], [0.211, -0.523, 0.312]])
    inv = torch.linalg.inv(yiq)
    q = torch.einsum("ij,njhw->nihw", yiq, x)
    i2 = q[:, 1] * cos - q[:, 2] * sin
    q2 = q[:, 1] * sin + q[:, 2] * cos
    q = torch.stack([q[:, 0], i2, q2], 1)
    x = torch.einsum("ij,njhw->nihw", inv, q)
    # kabur ringan (fokus meleset) dan derau sensor
    blur = torch.rand(n, generator=gen) < 0.25
    if blur.any():
        kern = torch.tensor([[1, 2, 1], [2, 4, 2], [1, 2, 1]], dtype=torch.float32) / 16
        xb = F.conv2d(x, kern.view(1, 1, 3, 3).repeat(3, 1, 1, 1), padding=1, groups=3)
        x = torch.where(blur.view(-1, 1, 1, 1), xb, x)
    x = x + torch.randn(x.shape, generator=gen) * 0.015
    # potongan acak (sendok/garpu/bayangan menutupi sebagian tambalan)
    cut = torch.rand(n, generator=gen) < 0.2
    if cut.any():
        size = 14
        ys = torch.randint(0, PATCH - size, (n,), generator=gen)
        xs = torch.randint(0, PATCH - size, (n,), generator=gen)
        grid_y = torch.arange(PATCH).view(1, PATCH, 1)
        grid_x = torch.arange(PATCH).view(1, 1, PATCH)
        mask = (grid_y >= ys.view(-1, 1, 1)) & (grid_y < ys.view(-1, 1, 1) + size) & (grid_x >= xs.view(-1, 1, 1)) & (grid_x < xs.view(-1, 1, 1) + size)
        mask = mask & cut.view(-1, 1, 1)
        x = torch.where(mask.unsqueeze(1), x.mean((2, 3), keepdim=True), x)
    return x.clamp(0, 1)


# ------------------------------------------------------------ evaluasi ----
def evaluate(model: nn.Module, xv: torch.Tensor, yv: torch.Tensor, imgv: np.ndarray, multi: np.ndarray) -> dict[str, object]:
    """Akurasi per tambalan, seimbang antar kelas, dan per foto (rata-rata peluang tambalan)."""
    model.eval()
    with torch.no_grad():
        probs = torch.cat([torch.softmax(model(normalize(xv[i : i + 1024])), 1) for i in range(0, len(yv), 1024)])
    pv = probs.argmax(1)
    acc = float((pv == yv).float().mean())
    per_cls = [float((pv[yv == c] == c).float().mean()) for c in range(len(CLASSES)) if (yv == c).any()]
    bal = float(np.mean(per_cls))
    # per foto: benar bila kelas rata-rata termasuk label foto
    ok = 0
    n_img = 0
    for i in np.unique(imgv):
        sel = torch.from_numpy(imgv == i)
        mean_p = probs[sel].mean(0)
        n_img += 1
        if multi[int(i), int(mean_p.argmax())]:
            ok += 1
    return {"acc": acc, "bal": bal, "img": ok / max(1, n_img), "pred": pv, "probs": probs}


def run() -> None:
    torch.manual_seed(SEED)
    np.random.seed(SEED)
    data = dict(np.load(CACHE)) if CACHE.exists() else build_cache()
    x_all, y_all, img_all = data["x"], data["y"], data["img"]
    primary, multi = data["primary"], data["multi"]
    val_img = split_by_image(primary)
    va = val_img[img_all]
    tr = ~va
    print(f"tambalan: {len(y_all)} (latih {tr.sum()}, uji {va.sum()}) dari {len(primary)} foto ({int(val_img.sum())} foto uji)")
    counts = np.bincount(y_all[tr], minlength=len(CLASSES))
    print("per kelas (latih):", dict(zip(CLASSES, counts.tolist())))

    xt = torch.from_numpy(x_all[tr]).permute(0, 3, 1, 2).contiguous()
    yt = torch.from_numpy(y_all[tr])
    xv = torch.from_numpy(x_all[va]).permute(0, 3, 1, 2).contiguous()
    yv = torch.from_numpy(y_all[va])
    imgv = img_all[va]

    # sampling seimbang antar kelas
    w_cls = 1.0 / np.maximum(counts, 1)
    w = torch.tensor(w_cls[y_all[tr]], dtype=torch.double)
    gen = torch.Generator().manual_seed(SEED)

    model = FoodNet()
    ema = FoodNet()
    ema.load_state_dict(model.state_dict())
    for p in ema.parameters():
        p.requires_grad_(False)
    n_par = sum(p.numel() for p in model.parameters())
    print(f"arsitektur: {ARCH}  parameter: {n_par}")
    epochs = EPOCHS
    bs = 256
    steps = max(1, len(yt) // bs)
    opt = torch.optim.AdamW(model.parameters(), lr=3e-3, weight_decay=5e-4)
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=3e-3, total_steps=epochs * steps, pct_start=0.15)
    mean = torch.tensor(MEAN).view(1, 3, 1, 1)
    std = torch.tensor(STD).view(1, 3, 1, 1)
    best: tuple[float, dict[str, torch.Tensor] | None, str] = (0.0, None, "")
    ema_decay = 0.998
    t0 = time.time()
    for ep in range(epochs):
        model.train()
        idx = torch.multinomial(w, steps * bs, replacement=True, generator=gen)
        tot = 0.0
        for s in range(steps):
            b = idx[s * bs : (s + 1) * bs]
            xb = augment(xt[b].float() / 255.0, gen)
            xb = (xb - mean) / std
            loss = F.cross_entropy(model(xb), yt[b], label_smoothing=0.05)
            opt.zero_grad()
            loss.backward()
            opt.step()
            sched.step()
            tot += float(loss.detach())
            with torch.no_grad():
                for pe, pm in zip(ema.state_dict().values(), model.state_dict().values()):
                    if pe.dtype.is_floating_point:
                        pe.mul_(ema_decay).add_(pm.detach(), alpha=1 - ema_decay)
                    else:
                        pe.copy_(pm)
        r = evaluate(model, xv, yv, imgv, multi)
        re = evaluate(ema, xv, yv, imgv, multi)
        print(
            f"epoch {ep + 1:2d}  loss {tot / steps:.3f}  uji: akurasi {r['acc']:.3f} seimbang {r['bal']:.3f} foto {r['img']:.3f}"
            f"  | ema: {re['acc']:.3f} {re['bal']:.3f} {re['img']:.3f}  {time.time() - t0:5.0f}s"
        )
        for tag, mdl, res in (("model", model, r), ("ema", ema, re)):
            score = float(res["bal"]) + 0.25 * float(res["img"])
            if score > best[0]:
                best = (score, {k: v.detach().clone() for k, v in mdl.state_dict().items()}, tag)
    assert best[1] is not None
    model.load_state_dict(best[1])
    r = evaluate(model, xv, yv, imgv, multi)
    pv = r["pred"]
    probs = r["probs"]
    cm = np.zeros((len(CLASSES), len(CLASSES)), np.int64)
    for a, b in zip(yv.tolist(), pv.tolist()):
        cm[a, b] += 1
    per_class = {c: (float(cm[i, i] / cm[i].sum()) if cm[i].sum() else None) for i, c in enumerate(CLASSES)}
    precision = {c: (float(cm[i, i] / cm[:, i].sum()) if cm[:, i].sum() else None) for i, c in enumerate(CLASSES)}
    # presisi bila peluang ≥ 0,6 (ambang yang dipakai aplikasi saat menamai ulang kelompok warna)
    conf_mask = probs.max(1).values >= 0.6
    prec06 = {}
    for i, c in enumerate(CLASSES):
        sel = conf_mask & (pv == i)
        prec06[c] = float((yv[sel] == i).float().mean()) if sel.any() else None
    print(f"terbaik ({best[2]}): akurasi {r['acc']:.3f}  seimbang {r['bal']:.3f}  per foto {r['img']:.3f}")
    print("akurasi per kelas (uji):", {k: (round(v, 3) if v is not None else None) for k, v in per_class.items()})
    print("presisi per kelas (uji):", {k: (round(v, 3) if v is not None else None) for k, v in precision.items()})
    print("matriks kebingungan (baris = benar):")
    print("         " + " ".join(f"{c[:5]:>5}" for c in CLASSES))
    for i, c in enumerate(CLASSES):
        print(f"{c:>8} " + " ".join(f"{int(v):5d}" for v in cm[i]))
    MODELS.mkdir(exist_ok=True)
    n_multi = int((multi.sum(1) > 1).sum())
    meta = {
        "version": OUT_NAME,
        "arch": list(ARCH),
        "classes": CLASSES,
        "patch": PATCH,
        "mean": MEAN,
        "std": STD,
        "params": n_par,
        "images": int(len(primary)),
        "images_multi_label": n_multi,
        "images_val": int(val_img.sum()),
        "patches": int(len(y_all)),
        "val_accuracy": round(float(r["acc"]), 4),
        "val_balanced_accuracy": round(float(r["bal"]), 4),
        "val_image_accuracy": round(float(r["img"]), 4),
        "val_per_class": {k: (round(v, 4) if v is not None else None) for k, v in per_class.items()},
        "val_precision": {k: (round(v, 4) if v is not None else None) for k, v in precision.items()},
        "val_precision_conf06": {k: (round(v, 4) if v is not None else None) for k, v in prec06.items()},
        "confusion": cm.tolist(),
        "selected": best[2],
        "trained_at": time.strftime("%Y-%m-%d"),
        "epochs": epochs,
        "split": "per foto (18 % tiap kelas), bukan per tambalan",
    }
    torch.save({"state": model.state_dict(), "meta": meta}, MODELS / f"{OUT_NAME}.pt")
    (MODELS / f"{OUT_NAME}.meta.json").write_text(json.dumps(meta, indent=1))
    print("tersimpan:", MODELS / f"{OUT_NAME}.pt")


if __name__ == "__main__":
    run()
