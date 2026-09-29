"""Statistik kecil yang bisa dijelaskan untuk lapisan insight (tanpa pustaka tambahan).

Dipakai analytics.py untuk: kebiasaan anak (rata-rata ± simpangan), skor-z hari yang menyimpang,
kemiringan tren (regresi linear), korelasi antar catatan (Pearson), dan uji beda dua periode
(Welch). Semua fungsi mengembalikan None bila datanya terlalu sedikit — lebih baik diam daripada
mengarang pola dari dua-tiga angka.
"""
from __future__ import annotations

import math
from statistics import mean, pstdev
from typing import Any


def baseline(xs: list[float], min_n: int = 6) -> dict[str, float] | None:
    """Rata-rata dan simpangan baku kebiasaan; None bila < min_n nilai."""
    if len(xs) < min_n:
        return None
    sd = pstdev(xs) if len(xs) > 1 else 0.0
    return {"n": float(len(xs)), "mean": mean(xs), "sd": sd}


def zscore(x: float, base: dict[str, float] | None, floor_sd: float) -> float | None:
    """Skor-z terhadap kebiasaan; simpangan dibatasi bawah agar data yang sangat rata tidak meledak."""
    if base is None:
        return None
    sd = max(base["sd"], floor_sd)
    return (x - base["mean"]) / sd


def slope(ys: list[float]) -> dict[str, float] | None:
    """Kemiringan garis tren per langkah (hari) dan korelasinya dengan waktu; None bila < 5 titik."""
    n = len(ys)
    if n < 5:
        return None
    xs = list(range(n))
    mx, my = mean(xs), mean(ys)
    sxx = sum((x - mx) ** 2 for x in xs)
    syy = sum((y - my) ** 2 for y in ys)
    sxy = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    if sxx == 0 or syy == 0:
        return {"n": float(n), "slope": 0.0, "r": 0.0}
    return {"n": float(n), "slope": sxy / sxx, "r": sxy / math.sqrt(sxx * syy)}


def pearson(pairs: list[tuple[float, float]], min_n: int = 10) -> dict[str, float] | None:
    """Korelasi Pearson dari pasangan (x, y); None bila < min_n pasangan atau salah satu konstan."""
    n = len(pairs)
    if n < min_n:
        return None
    xs = [p[0] for p in pairs]
    ys = [p[1] for p in pairs]
    mx, my = mean(xs), mean(ys)
    sxx = sum((x - mx) ** 2 for x in xs)
    syy = sum((y - my) ** 2 for y in ys)
    if sxx == 0 or syy == 0:
        return None
    r = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / math.sqrt(sxx * syy)
    return {"n": float(n), "r": r}


def welch_t(a: list[float], b: list[float], min_n: int = 5) -> dict[str, float] | None:
    """Statistik t Welch untuk beda rata-rata dua kelompok; None bila salah satu < min_n."""
    if len(a) < min_n or len(b) < min_n:
        return None
    ma, mb = mean(a), mean(b)
    va = sum((x - ma) ** 2 for x in a) / (len(a) - 1)
    vb = sum((x - mb) ** 2 for x in b) / (len(b) - 1)
    se = math.sqrt(va / len(a) + vb / len(b))
    if se == 0:
        return {"t": 0.0 if ma == mb else math.copysign(99.0, ma - mb), "diff": ma - mb, "na": float(len(a)), "nb": float(len(b))}
    return {"t": (ma - mb) / se, "diff": ma - mb, "na": float(len(a)), "nb": float(len(b))}


def weekday_effect(rows: list[dict[str, Any]], key: str, min_per_day: int = 3, min_gap: float = 0.6) -> dict[str, Any] | None:
    """Hari dalam minggu yang nilainya konsisten paling rendah dibanding hari lain.

    Syarat: hari itu tercatat ≥ min_per_day kali, selisih rata-ratanya ≥ min_gap dari hari-hari lain,
    dan pada ≥ 70 % minggunya nilai hari itu memang di bawah rata-rata minggu tersebut.
    """
    by_wd: dict[int, list[tuple[str, float]]] = {}
    for r in rows:
        v = r.get(key)
        if v is None or not r.get("school"):
            continue
        by_wd.setdefault(int(r["weekday"]), []).append((str(r["date"]), float(v)))
    if len(by_wd) < 3:
        return None
    means = {wd: mean(v for _, v in vals) for wd, vals in by_wd.items() if len(vals) >= min_per_day}
    if len(means) < 3:
        return None
    worst = min(means, key=lambda k: means[k])
    others = [m for wd, m in means.items() if wd != worst]
    gap = mean(others) - means[worst]
    if gap < min_gap:
        return None
    # konsistensi per minggu ISO
    weeks: dict[str, dict[int, float]] = {}
    for wd, vals in by_wd.items():
        for d, v in vals:
            y, m, dd = (int(p) for p in d.split("-"))
            iso = __import__("datetime").date(y, m, dd).isocalendar()
            weeks.setdefault(f"{iso[0]}-{iso[1]}", {})[wd] = v
    hits = 0
    total = 0
    for wk in weeks.values():
        if worst in wk and len(wk) >= 2:
            total += 1
            rest = [v for wd, v in wk.items() if wd != worst]
            if wk[worst] < mean(rest):
                hits += 1
    if total < 3 or hits / total < 0.7:
        return None
    return {"weekday": worst, "mean": means[worst], "others": mean(others), "gap": gap, "weeks": total, "hits": hits}
