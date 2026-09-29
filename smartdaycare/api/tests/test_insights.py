"""Uji lapisan insight: aturan statistik harus menyala pada data yang jelas dan diam pada data yang datar."""
from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from app.analytics import build_baseline, build_insights, build_recommendations, summarize
from app.labels import mood_from_score
from app.stats import pearson, slope, weekday_effect, welch_t, zscore

MONDAY = date(2026, 6, 1)  # Senin


def mk_row(d: date, *, mood: float | None = 4.0, sleep: int = 80, meal: int | None = 85, acts: int = 5, act_min: int = 150, present: bool = True) -> dict[str, Any]:
    school = d.weekday() < 5
    present = present and school
    return {
        "date": d.isoformat(),
        "label": ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"][d.weekday()],
        "day": d.day,
        "weekday": d.weekday(),
        "school": school,
        "present": present,
        "checkin": "07:45" if present else None,
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
        "menu": [],
        "tempMax": None,
        "incidents": 0,
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
