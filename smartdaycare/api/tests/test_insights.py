"""Uji lapisan insight: aturan statistik harus menyala pada data yang jelas dan diam pada data yang datar."""
from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from app.analytics import _watch, build_baseline, build_insights, build_recommendations, cat_reco_feedback, reco_weights, summarize
from app.labels import menu_groups, mood_from_score
from app.stats import (
    agreement,
    changepoint,
    hedges_g,
    mann_whitney,
    percentile_rank,
    pearson,
    robust_baseline,
    robust_z,
    slope,
    theilsen,
    weekday_effect,
    welch_t,
    wilson,
    zscore,
)

MONDAY = date(2026, 6, 1)  # Senin


def mk_row(
    d: date,
    *,
    mood: float | None = 4.0,
    sleep: int = 80,
    meal: int | None = 85,
    acts: int = 5,
    act_min: int = 150,
    present: bool = True,
    arrive: int | None = 465,
    menu: list[str] | None = None,
    incidents: int = 0,
    incident_sev: list[str] | None = None,
) -> dict[str, Any]:
    school = d.weekday() < 5
    present = present and school
    return {
        "date": d.isoformat(),
        "label": ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"][d.weekday()],
        "day": d.day,
        "weekday": d.weekday(),
        "school": school,
        "present": present,
        "checkin": f"{arrive // 60:02d}:{arrive % 60:02d}" if (present and arrive) else None,
        "checkinMin": arrive if (present and arrive) else None,
        "activities": acts if present else 0,
        "activityMinutes": act_min if present else 0,
        "byKind": {"play": acts} if present else {},
        "mood": mood if present else None,
        "moodLabel": mood_from_score(mood)[0] if (present and mood is not None) else None,
        "moodEmoji": mood_from_score(mood)[1] if (present and mood is not None) else None,
        "moodMorning": mood if present else None,
        "moodAfternoon": mood if present else None,
        "sleepMinutes": sleep if present else 0,
        "sleepQuality": 3 if present else None,
        "meals": {"lunch": meal} if (present and meal is not None) else {},
        "mealAvg": meal if present else None,
        "menu": menu if (present and menu is not None) else [],
        "menuGroups": sorted(menu_groups(menu or [])) if present else [],
        "tempMax": None,
        "incidents": incidents if present else 0,
        "incidentSev": [x for x in (incident_sev or []) if x in ("medium", "high")] if present else [],
        "incidentPm": incidents if present else 0,
        "meds": [],
        "notes": [],
    }


def weeks(start: date, n_weeks: int, **kw: Any) -> list[dict[str, Any]]:
    return [mk_row(start + timedelta(days=i), **kw) for i in range(n_weeks * 7)]


def run(hist: list[dict[str, Any]], prev: list[dict[str, Any]], cur: list[dict[str, Any]], peers: dict[str, Any] | None = None) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    cur_s = summarize(cur)
    prev_s = summarize(prev)
    base = build_baseline(hist + prev)
    ins = build_insights("Kirana", cur, cur_s, prev_s, "minggu ini", hist_rows=hist + prev, base=base, peers=peers)
    return ins, build_recommendations("Kirana", ins, cur_s)


# ---------------------------------------------------------------- statistik dasar ----


def test_stats_helpers() -> None:
    assert zscore(2.0, {"n": 10, "mean": 4.0, "sd": 0.5}, 0.35) == -4.0
    assert zscore(2.0, {"n": 10, "mean": 4.0, "sd": 0.0}, 0.5) == -4.0  # lantai simpangan
    assert zscore(1.0, None, 0.5) is None
    s = slope([1, 2, 3, 4, 5])
    assert s and abs(s["slope"] - 1.0) < 1e-9 and abs(s["r"] - 1.0) < 1e-9
    assert slope([1, 2, 3]) is None
    c = pearson([(x, 2 * x + 1) for x in range(12)])
    assert c and abs(c["r"] - 1.0) < 1e-9
    assert pearson([(1, 1)] * 12) is None  # konstan
    t = welch_t([80] * 4 + [81], [40, 42, 41, 39, 40, 41])
    assert t and t["t"] > 2 and t["diff"] > 0
    assert welch_t([1, 2], [3, 4]) is None


def test_weekday_effect_needs_consistency() -> None:
    rows = []
    for w in range(6):
        for i in range(5):
            d = MONDAY + timedelta(days=w * 7 + i)
            rows.append(mk_row(d, mood=2.5 if i == 0 else 4.0))
    eff = weekday_effect(rows, "mood")
    assert eff and eff["weekday"] == 0 and eff["hits"] == 6
    flat = weekday_effect(weeks(MONDAY, 6, mood=4.0), "mood")
    assert flat is None


# ---------------------------------------------------------------- aturan insight ----


def test_flat_history_is_quiet() -> None:
    hist = weeks(MONDAY, 6)
    prev = weeks(MONDAY + timedelta(days=42), 1)
    cur = weeks(MONDAY + timedelta(days=49), 1)
    ins, _ = run(hist, prev, cur)
    assert not [i for i in ins if i["kind"] in ("anomaly", "trend")], [i["title"] for i in ins]
    assert all(i.get("confidence") in {"tinggi", "sedang", "rendah"} for i in ins)


def test_zscore_anomaly_against_own_baseline() -> None:
    hist = weeks(MONDAY, 6)
    prev = weeks(MONDAY + timedelta(days=42), 1)
    cur = weeks(MONDAY + timedelta(days=49), 1)
    cur[2]["mood"] = 2.0  # Rabu jauh di bawah kebiasaan 4,0
    ins, recs = run(hist, prev, cur)
    anom = [i for i in ins if i["kind"] == "anomaly" and i["area"] == "mood"]
    assert len(anom) == 1, [i["title"] for i in ins]
    a = anom[0]
    assert "Rabu" in a["title"] and "z = −" in a["evidence"] and a["sev"] == "high" and a["confidence"] == "tinggi"
    assert any(r["id"] == "mood" for r in recs)
    # nilai di atas kebiasaan tidak dilaporkan untuk mood
    cur[2]["mood"] = 5.0
    ins, _ = run(hist, prev, cur)
    assert not [i for i in ins if i["kind"] == "anomaly" and i["area"] == "mood"]


def test_early_warning_streak_and_parent_contact() -> None:
    hist = weeks(MONDAY, 6)
    prev = weeks(MONDAY + timedelta(days=42), 1)
    cur = weeks(MONDAY + timedelta(days=49), 1)
    for i in (2, 3, 4):
        cur[i]["mood"] = 2.0
    ins, recs = run(hist, prev, cur)
    warn = [i for i in ins if i["title"].startswith("Peringatan dini")]
    assert warn and warn[0]["sev"] == "high" and warn[0]["area"] == "mood"
    assert recs[0]["title"] == "Hubungi orang tua hari ini"


def test_weekday_pattern_gives_transition_recommendation() -> None:
    rows = []
    for w in range(8):
        for i in range(7):
            d = MONDAY + timedelta(days=w * 7 + i)
            rows.append(mk_row(d, mood=2.5 if i == 0 else 4.0))
    hist, prev, cur = rows[:42], rows[42:49], rows[49:56]
    ins, recs = run(hist, prev, cur)
    pat = [i for i in ins if i["kind"] == "pattern" and "hari Senin" in i["title"]]
    assert pat and pat[0]["confidence"] == "tinggi"
    assert any(r["id"] == "hari" and "Senin" in r["title"] for r in recs)


def test_sleep_mood_correlation() -> None:
    rows = []
    for w in range(6):
        for i in range(7):
            d = MONDAY + timedelta(days=w * 7 + i)
            k = (w * 5 + i) % 6
            rows.append(mk_row(d, sleep=40 + 12 * k, mood=2.5 + 0.5 * k))
    hist, prev, cur = rows[:28], rows[28:35], rows[35:42]
    ins, recs = run(hist, prev, cur)
    cor = [i for i in ins if "berkaitan dengan mood sore" in i["title"]]
    assert cor and "r = " in cor[0]["evidence"] and "bukan kepastian sebab-akibat" in cor[0]["text"]
    assert any(r["id"] == "tidur-mood" for r in recs)


def test_significant_drop_strengthens_basic_trend_instead_of_duplicating() -> None:
    hist = weeks(MONDAY, 6, sleep=85)
    prev = weeks(MONDAY + timedelta(days=42), 1, sleep=85)
    cur = weeks(MONDAY + timedelta(days=49), 1, sleep=45)
    ins, _ = run(hist, prev, cur)
    sleep_trends = [i for i in ins if i["kind"] == "trend" and i["area"] == "tidur"]
    assert len(sleep_trends) == 1, [i["title"] for i in sleep_trends]
    assert "beda bermakna" in sleep_trends[0]["evidence"] and sleep_trends[0]["confidence"] == "tinggi"


def test_gradual_slope_trend() -> None:
    hist = weeks(MONDAY, 6)
    prev = weeks(MONDAY + timedelta(days=42), 2)
    cur = weeks(MONDAY + timedelta(days=56), 2)
    present = [r for r in cur if r["present"]]
    for n, r in enumerate(present):
        r["mood"] = round(4.6 - 0.2 * n, 1)  # turun 1,8 poin dalam 10 hari
    ins, _ = run(hist, prev, cur)
    sl = [i for i in ins if "menurun bertahap" in i["title"]]
    assert sl and sl[0]["area"] == "mood" and sl[0]["delta"] < 0


def test_peer_comparison_only_with_enough_children() -> None:
    hist = weeks(MONDAY, 6)
    prev = weeks(MONDAY + timedelta(days=42), 1)
    cur = weeks(MONDAY + timedelta(days=49), 1, sleep=50)
    peers = {"n": 5, "stats": {"sleepAvg": {"n": 5, "mean": 90.0, "sd": 8.0}}}
    ins, recs = run(hist, prev, cur, peers)
    pc = [i for i in ins if "rata-rata anak lain" in i["title"]]
    assert pc and pc[0]["area"] == "tidur" and pc[0]["sev"] == "medium" and "(5 anak)" in pc[0]["evidence"]
    assert any(r["id"] == "tidur" for r in recs)
    ins2, _ = run(hist, prev, cur, {"n": 2, "stats": {"sleepAvg": {"n": 2, "mean": 90.0, "sd": 8.0}}})
    assert not [i for i in ins2 if "rata-rata anak lain" in i["title"]]


def test_no_baseline_still_works() -> None:
    prev = weeks(MONDAY, 1)
    cur = weeks(MONDAY + timedelta(days=7), 1)
    cur[1]["mood"] = 1.5
    ins, _ = run([], prev, cur)
    assert isinstance(ins, list)
    assert all("z = " not in i["evidence"] for i in ins)  # tanpa kebiasaan → tanpa skor-z


def test_long_nap_anomaly_recommends_health_check() -> None:
    hist = weeks(MONDAY, 6)
    prev = weeks(MONDAY + timedelta(days=42), 1)
    cur = weeks(MONDAY + timedelta(days=49), 1)
    cur[0]["sleepMinutes"] = 160  # dua kali kebiasaan 80 menit
    ins, recs = run(hist, prev, cur)
    anom = [i for i in ins if i["kind"] == "anomaly" and i["area"] == "tidur"]
    assert anom and "jauh di atas" in anom[0]["title"] and anom[0]["sev"] == "low"
    assert recs[0]["id"] == "tidur-lebih"


# ------------------------------------------------------------------ lapisan statistik baru ----


def test_stats_lanjutan() -> None:
    # median ± MAD: satu hari ekstrem tidak menggeser "kebiasaan" seperti rata-rata ± simpangan
    xs = [4.0, 4.1, 3.9, 4.0, 4.2, 3.8, 1.0]
    b = robust_baseline(xs, min_n=5)
    assert b and b["center"] == 4.0 and b["scale"] > 0
    assert robust_z(1.0, b, 0.35) < -3  # hari ekstrem tetap terdeteksi sebagai pencilan
    assert abs(robust_z(4.05, b, 0.35)) < 1
    # Theil–Sen tahan satu hari aneh, slope biasa ikut tertarik
    assert theilsen([6, 5, 4, 3, 2, 1])["slope"] == -1.0
    assert theilsen([5, 4, 3, 2, 1]) is None  # < 6 titik: belum bisa menyebut kemiringan
    assert abs(slope([5, 4, 3, 2, 100, 1])["slope"]) > abs(theilsen([5, 4, 3, 2, 100, 1])["slope"])
    # titik ubah: tingkat berpindah di indeks 6 dan bertahan
    cp = changepoint([4, 4, 4.2, 3.9, 4, 4.1, 3, 2.8, 2.9, 3.1, 3, 2.9])
    assert cp and cp["at"] == 6 and cp["gap"] < 0
    cp2 = changepoint([4.0] * 35 + [2.4] * 5)
    assert cp2 and cp2["at"] == 35
    assert changepoint([4, 4, 4, 4, 4, 4, 4, 4]) is None  # datar → tidak ada titik ubah
    # uji peringkat & besaran efek
    mw = mann_whitney([4.0, 4.2, 3.9, 4.1, 4.0, 3.8], [3.0, 2.8, 3.1, 2.9, 3.2, 3.0])
    assert mw and mw["p"] < 0.05
    sen = mann_whitney([4.0, 4.1, 3.9, 4.0, 4.05, 3.95], [4.0, 4.05, 3.95, 4.0, 4.1, 3.9])
    assert sen is None or sen["p"] > 0.05  # dua sampel yang sama tidak boleh disebut berbeda
    g = hedges_g([4.0, 4.2, 3.9, 4.1], [3.0, 3.2, 2.9, 3.1])
    assert g and g["g"] > 1.5
    # interval Wilson untuk rasio hari, dan posisi persentil di antara teman
    w = wilson(4, 5)
    assert w and 0 < w["lo"] < w["p"] == 0.8 < w["hi"] <= 1
    pr = percentile_rank(4.4, [3.0, 3.5, 4.0, 4.2, 4.3])
    assert pr and pr["pct"] == 100.0
    # kesepakatan ya/tidak (κ) — lebih jujur daripada persentase sepakat saja
    k = agreement([True] * 8 + [False] * 2, [True] * 10)
    assert k and 0 < k["po"] < 1 and k["n"] == 10
    assert agreement([True, False] * 5, [True, False] * 5)["kappa"] == 1.0


def test_menu_groups_dan_kelompok_gizi() -> None:
    assert menu_groups(["Nasi putih", "Tumis bayam", "Ayam kecap"]) == {"karbo", "sayur", "protein"}
    assert menu_groups(["Sup wortel", "Tempe goreng"]) == {"sayur", "protein"}
    assert menu_groups(["Puding buah", "Susu"]) == {"buah", "susu"}
    assert menu_groups([]) == set()


def test_changepoint_menyebut_tanggal_mulai() -> None:
    hist = [mk_row(MONDAY + timedelta(days=i), mood=4.0) for i in range(42)]
    prev = [mk_row(MONDAY + timedelta(days=42 + i), mood=4.0) for i in range(7)]
    cur = [mk_row(MONDAY + timedelta(days=49 + i), mood=2.4) for i in range(7)]
    ins, recs = run(hist, prev, cur)
    mood_trend = [i for i in ins if i["kind"] == "trend" and i["area"] == "mood"]
    assert len(mood_trend) == 1, [i["title"] for i in mood_trend]  # titik ubah menempel, bukan kartu kedua
    got = mood_trend[0]
    assert "titik ubah 20/07" in got["evidence"]  # Senin pertama minggu ke-8
    assert "sejak Senin 20/07" in got["text"] and "2,4/5" in got["text"] and "4,0/5" in got["text"]


def test_titik_ubah_kedaluwarsa_tidak_ditampilkan() -> None:
    """Perpindahan yang terjadi sebulan sebelum periode tidak dijual sebagai kabar minggu ini."""
    lama = [mk_row(MONDAY + timedelta(days=i), mood=4.0 if i < 28 else 2.4) for i in range(42)]
    prev = [mk_row(MONDAY + timedelta(days=42 + i), mood=2.4) for i in range(7)]
    cur = [mk_row(MONDAY + timedelta(days=49 + i), mood=2.4) for i in range(7)]
    ins, _ = run(lama[:35], prev, cur)
    assert not [i for i in ins if "sejak" in i["title"] and i["area"] == "mood"]


def test_persentil_sebaya_ditulis_tanpa_angka_absolut() -> None:
    hist = weeks(MONDAY, 6)
    prev = weeks(MONDAY + timedelta(days=42), 1)
    cur = weeks(MONDAY + timedelta(days=49), 1, sleep=20)
    peers = {
        "n": 5,
        "stats": {"sleepAvg": {"n": 5, "mean": 90.0, "sd": 8.0}},
        "values": {"sleepAvg": [80.0, 85.0, 90.0, 95.0, 100.0]},
    }
    ins, _ = run(hist, prev, cur, peers)
    pc = [i for i in ins if "rata-rata anak lain" in i["title"]]
    assert pc and "lebih rendah dari semua anak lain" in pc[0]["text"]
    assert "0%" not in pc[0]["text"]


def test_periode_datar_tanpa_titk_ubah() -> None:
    hist = weeks(MONDAY, 6)
    prev = weeks(MONDAY + timedelta(days=42), 1)
    cur = weeks(MONDAY + timedelta(days=49), 1)
    ins, _ = run(hist, prev, cur)
    assert not [i for i in ins if "sejak" in i["title"]]
    assert not [i for i in ins if "Jam datang" in i["title"]]


def test_geseran_jam_datang_dilaporkan() -> None:
    # dua minggu terakhir: datang 6 menit lebih siang tiap hari sekolah
    hist = weeks(MONDAY, 6)
    prev = [mk_row(MONDAY + timedelta(days=42 + i)) for i in range(7)]
    shift = [465 + 6 * n for n in range(10)]
    cur, seen = [], 0
    for i in range(14):
        d = MONDAY + timedelta(days=49 + i)
        arrive = shift[seen] if (d.weekday() < 5 and seen < 10) else 465
        if d.weekday() < 5:
            seen += 1
        cur.append(mk_row(d, arrive=arrive))
    ins, recs = run(hist, prev, cur)
    got = [i for i in ins if "Jam datang" in i["title"]]
    assert got and "lebih siang" in got[0]["title"] and "07.45" in got[0]["text"], got
    assert "menit" in got[0]["evidence"]


def test_variasi_menu_dan_kejadian() -> None:
    menu_sedikit = ["Nasi", "Ayam"]  # tanpa sayur
    cur = [mk_row(MONDAY + timedelta(days=49 + i), menu=menu_sedikit) for i in range(7)]
    hist = weeks(MONDAY, 6)
    prev = weeks(MONDAY + timedelta(days=42), 1)
    ins, recs = run(hist, prev, cur)
    veg = [i for i in ins if i["title"].startswith("Sayur tercatat")]
    assert veg and veg[0]["title"] == "Sayur tercatat pada 0 dari 5 hari" and veg[0]["area"] == "makan"
    assert veg[0]["sev"] == "medium" and "80%" in veg[0]["text"]
    assert any(r["id"] == "makan" for r in recs)
    # menu lengkap → tidak ada keluhan variasi
    cur2 = [mk_row(MONDAY + timedelta(days=49 + i), menu=["Nasi", "Sayur", "Tahu", "Pepaya"]) for i in range(7)]
    ins2, _ = run(hist, prev, cur2)
    assert not [i for i in ins2 if i["title"].startswith("Sayur tercatat")]
    # kejadian berat → kartu anomaly + skor pantauan naik
    cur3 = [mk_row(MONDAY + timedelta(days=49 + i), incidents=1, incident_sev=["medium"]) for i in range(7)]
    ins3, _ = run(hist, prev, cur3)
    assert [i for i in ins3 if i["area"] == "kesehatan" and i["sev"] == "high"]
    s3 = _watch(cur3, summarize(cur3), None)
    assert s3["score"] >= 18 and s3["components"][0]["key"] == "kejadian"
    assert not s3["note"].startswith("Demo")


def test_skor_pantauan_hening_saat_semua_baik() -> None:
    rows = weeks(MONDAY + timedelta(days=49), 1)
    w = _watch(rows, summarize(rows), None)
    assert w["score"] == 0 and w["components"] == [] and w["level"] == "tenang"


def test_rekomendasi_punya_dampak_usaha_terurut() -> None:
    hist = weeks(MONDAY, 6)
    prev = weeks(MONDAY + timedelta(days=42), 1)
    cur = weeks(MONDAY + timedelta(days=49), 1, mood=2.0, sleep=40)
    ins, recs = run(hist, prev, cur)
    assert recs and len(recs) <= 5
    assert all({"impact", "effort", "score", "rank", "why"} <= set(r) for r in recs)
    assert [r["score"] for r in recs] == sorted((r["score"] for r in recs), reverse=True)
    assert [r["rank"] for r in recs] == list(range(1, len(recs) + 1))
    assert all(r["impact"] in (1, 2, 3) and 0 <= r["effort"] <= 3 for r in recs)
    assert "dampak" in recs[0]["impactLabel"] and "usaha" in recs[0]["effortLabel"]
    # setiap saran menunjuk insight asalnya
    titles = {i["title"] for i in ins}
    assert all(r["why"] in titles or r["id"] == "stabil" for r in recs)
