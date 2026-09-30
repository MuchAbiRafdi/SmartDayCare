"""Statistik kecil yang bisa dijelaskan untuk lapisan insight (tanpa pustaka tambahan).

Dipakai analytics.py untuk: kebiasaan anak (median ± MAD dan rata-rata ± simpangan), skor-z hari
yang menyimpang, kemiringan tren (regresi linear & Theil–Sen yang tahan satu hari aneh), korelasi
antar catatan (Pearson), uji beda dua periode (Welch + Mann–Whitney + besaran efek Cohen d),
detik perubahan deret (CUSUM), penghalusan eksponensial (EWMA), selang kepercayaan rata-rata
(Wilson/t), dan posisi anak dibanding teman (persentil).

Semua fungsi mengembalikan None bila datanya terlalu sedikit — lebih baik diam daripada mengarang
pola dari dua-tiga angka. Tidak ada angka yang dikirim ke layar tanpa fungsi di berkas ini yang
menghasilkannya.
"""
from __future__ import annotations

import math
from statistics import mean, median, pstdev
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


# ------------------------------------------------------- kebiasaan yang tahan banting ----
def mad(xs: list[float]) -> float:
    """Median of Absolute Deviations — sebaran yang tidak tertarik satu hari aneh."""
    if len(xs) < 3:
        return 0.0
    m = median(xs)
    return median([abs(x - m) for x in xs])


def robust_baseline(xs: list[float], min_n: int = 6) -> dict[str, float] | None:
    """Pusat = median, sebaran = 1,4826 × MAD (setara simpangan baku bila datanya normal).

    Dipakai untuk skor-z: satu hari sangat buruk tidak menggeser "kebiasaan" anak, sehingga
    hari buruk berikutnya tidak lagi dianggap biasa.
    """
    if len(xs) < min_n:
        return None
    m = median(xs)
    scale = 1.4826 * mad(xs)
    sd = pstdev(xs) if len(xs) > 1 else 0.0
    if scale <= 1e-9:
        scale = sd
    return {"n": float(len(xs)), "center": m, "scale": scale, "mean": mean(xs), "sd": sd}


def robust_z(x: float, base: dict[str, float] | None, floor_scale: float) -> float | None:
    """Selisih dari median, dalam satuan sebaran tahan-banting (dibatasi bawah)."""
    if base is None:
        return None
    return (x - base["center"]) / max(base["scale"], floor_scale)


def trimmed_mean(xs: list[float], keep: float = 0.8) -> float | None:
    """Rata-rata setelah 20 % nilai terendah dan tertinggi dibuang."""
    if not xs:
        return None
    o = sorted(xs)
    k = max(1, int(round(len(o) * keep)))
    lo = (len(o) - k) // 2
    return mean(o[lo : lo + k])


# ------------------------------------------------------------------ tren ----
def theilsen(ys: list[float], max_pairs: int = 400) -> dict[str, float] | None:
    """Kemiringan median dari semua pasangan titik (Theil–Sen): tahan terhadap satu hari meledak.

    None bila < 6 titik. `rho` = korelasi peringkat Spearman, dipakai sebagai ukuran kekonsistenan.
    """
    n = len(ys)
    if n < 6:
        return None
    slopes: list[float] = []
    # pada deret panjang cukup sebagian pasangan (kemiringan median tetap stabil)
    step = 1
    total = n * (n - 1) / 2
    if total > max_pairs:
        step = max(2, int(math.sqrt(total / max_pairs)))
    for i in range(n):
        for j in range(i + step, n, step):
            slopes.append((ys[j] - ys[i]) / (j - i))
    if len(slopes) < 3:
        return None

    med = median(slopes)
    # Spearman
    def ranks(v: list[float]) -> list[float]:
        order = sorted(range(len(v)), key=lambda k: v[k])
        r = [0.0] * len(v)
        i = 0
        while i < len(order):
            j = i
            while j + 1 < len(order) and v[order[j + 1]] == v[order[i]]:
                j += 1
            avg = (i + j) / 2 + 1
            for k in range(i, j + 1):
                r[order[k]] = avg
            i = j + 1
        return r

    rx = ranks([float(i) for i in range(n)])
    ry = ranks(ys)
    rho = pearson(list(zip(rx, ry)), min_n=6)
    return {"n": float(n), "slope": med, "rho": rho["r"] if rho else 0.0}


def ewma(ys: list[float], alpha: float = 0.3) -> list[float]:
    """Penghalusan eksponensial; dipakai untuk menampilkan arah terakhir tanpa ikut naik-turun harian."""
    out: list[float] = []
    cur: float | None = None
    for y in ys:
        cur = y if cur is None else alpha * y + (1 - alpha) * cur
        out.append(cur)
    return out


def changepoint(xs: list[float], min_side: int = 4, k_sigma: float = 0.7, h_sigma: float = 2.0) -> dict[str, float] | None:
    """Titik di mana deret berpindah tingkat (CUSUM satu sisi pada selisih terhadap median).

    Mengembalikan None bila perpindahan tidak lebih besar dari 0,8 sebaran kebiasaan, atau salah
    satu sisi terlalu pendek. `at` = indeks mulai sisi baru.
    """
    n = len(xs)
    if n < 2 * min_side:
        return None
    base = robust_baseline(xs, min_n=max(4, min_side))
    if base is None or base["scale"] <= 1e-9:
        return None
    sd = base["scale"]
    best: tuple[float, int, float] | None = None
    for cut in range(min_side, n - min_side + 1):
        a, b = xs[:cut], xs[cut:]
        gap = mean(b) - mean(a)
        # penalti agar perpindahan tipis di tengah deret tidak menang
        score = abs(gap) / sd * math.sqrt(min(len(a), len(b)))
        if score >= h_sigma and (best is None or score > best[0]):
            best = (score, cut, gap)
    if best is None:
        return None
    score, cut, gap = best
    if abs(gap) < 0.8 * sd:
        return None
    # periksa bahwa perpindahan itu bertahan: separuh terakhir sisi baru harus searah
    tail = xs[cut:]
    drift = mean(tail[len(tail) // 2 :]) - mean(tail[: len(tail) // 2])
    if tail and (drift * gap < 0 and abs(drift) > 0.6 * sd):
        return None
    return {"at": float(cut), "gap": gap, "score": score, "k": k_sigma, "n": float(n)}


# ------------------------------------------------------------------ beda dua kelompok ----
def hedges_g(a: list[float], b: list[float]) -> dict[str, float] | None:
    """Besaran efek (selisih rata-rata dibagi simpangan gabungan, dikoreksi sampel kecil)."""
    if len(a) < 3 or len(b) < 3:
        return None
    ma, mb = mean(a), mean(b)
    va = sum((x - ma) ** 2 for x in a) / (len(a) - 1)
    vb = sum((x - mb) ** 2 for x in b) / (len(b) - 1)
    sp = math.sqrt(((len(a) - 1) * va + (len(b) - 1) * vb) / (len(a) + len(b) - 2))
    if sp <= 1e-9:
        return {"g": 0.0, "pooled": sp}
    j = 1 - 3 / (4 * (len(a) + len(b)) - 9)
    return {"g": (ma - mb) / sp * j, "pooled": sp, "diff": ma - mb}


def mann_whitney(a: list[float], b: list[float], exact_max: int = 8) -> dict[str, float] | None:
    """Uji peringkat Mann–Whitney U ( Aproksimasi normal dengan koreksi seri; p dua sisi).

    Dipakai bila datanya sedikit atau miring — tidak mengasumsikan bentuk sebaran, jadi lebih jujur
    untuk catatan harian yang biasanya menumpuk di nilai baik.
    """
    na, nb = len(a), len(b)
    if na < 3 or nb < 3:
        return None
    combined = [(v, 0) for v in a] + [(v, 1) for v in b]
    combined.sort(key=lambda t: t[0])
    # peringkat dengan rata-rata untuk nilai sama
    ranks: list[tuple[float, int]] = []
    i = 0
    tie_groups: list[int] = []
    while i < len(combined):
        j = i
        while j + 1 < len(combined) and combined[j + 1][0] == combined[i][0]:
            j += 1
        avg = (i + j) / 2 + 1
        for k in range(i, j + 1):
            ranks.append((avg, combined[k][1]))
        if j > i:
            tie_groups.append(j - i + 1)
        i = j + 1
    ra = sum(r for r, g in ranks if g == 0)
    u1 = ra - na * (na + 1) / 2
    u2 = na * nb - u1
    mu = na * nb / 2
    ntie = sum(t**3 - t for t in tie_groups)
    ntot = na + nb
    sigma2 = na * nb / 12 * ((ntot + 1) - ntie / (ntot * (ntot - 1))) if ntot > 1 else 0
    if sigma2 <= 0:
        return None
    z = (min(u1, u2) - mu + 0.5) / math.sqrt(sigma2)
    p = 2 * (1 - _ncdf(abs(z)))
    if na <= exact_max and nb <= exact_max:
        # untuk sampel sangat kecil, aproksimasi normal terlalu optimistis → longgarkan p
        p = min(1.0, p * 1.6)
    return {"u": min(u1, u2), "z": -abs(z) if u1 < u2 else abs(z), "p": min(1.0, p), "n": float(ntot)}


def _ncdf(x: float) -> float:
    return 0.5 * (1 + math.erf(x / math.sqrt(2)))


def mean_ci(xs: list[float], z: float = 1.96) -> dict[str, float] | None:
    """Selang kepercayaan 95 % rata-rata (pendekatan normal; dipakai untuk angka ringkasan)."""
    n = len(xs)
    if n < 4:
        return None
    m = mean(xs)
    se = pstdev(xs) / math.sqrt(n) if n > 1 else 0.0
    return {"mean": m, "lo": m - z * se, "hi": m + z * se, "n": float(n)}


def wilson(k: float, n: float, z: float = 1.96) -> dict[str, float] | None:
    """Selang kepercayaan proporsi (Wilson) — untuk rasio kehadiran/porsi yang bilang 'n kecil, jangan berlebihan'."""
    if n <= 0:
        return None
    ph = k / n
    d = 1 + z * z / n
    c = (ph + z * z / (2 * n)) / d
    hw = z * math.sqrt(ph * (1 - ph) / n + z * z / (4 * n * n)) / d
    return {"p": ph, "lo": max(0.0, c - hw), "hi": min(1.0, c + hw), "n": n}


def percentile_rank(x: float, others: list[float]) -> dict[str, float] | None:
    """Posisi x di antara nilai lain (0–100) + median pembanding; None bila pembanding < 3."""
    if len(others) < 3:
        return None
    below = sum(1 for v in others if v < x)
    equal = sum(1 for v in others if v == x)
    return {"pct": (below + 0.5 * equal) / len(others) * 100, "median": median(others), "n": float(len(others))}


def autocorr1(xs: list[float]) -> dict[str, float] | None:
    """Ketergantungan hari-ke-hari; tinggi berarti perubahan hari ini biasanya berlanjut."""
    if len(xs) < 8:
        return None
    a, b = xs[:-1], xs[1:]
    return pearson(list(zip(a, b)), min_n=7)


def agreement(a: list[bool], b: list[bool]) -> dict[str, float] | None:
    """Kappa Cohen untuk dua keterangan (mis. 'mood rendah' vs 'makan sedikit') pada hari yang sama."""
    n = len(a)
    if n < 6 or len(b) != n:
        return None
    po = sum(1 for x, y in zip(a, b) if x == y) / n
    pa = (sum(a) / n, sum(b) / n)
    pe = pa[0] * pa[1] + (1 - pa[0]) * (1 - pa[1])
    if pe >= 1:
        return None
    return {"kappa": (po - pe) / (1 - pe), "po": po, "n": float(n)}
