"""Lapisan analisis catatan harian: deret harian → indikator → insight → rekomendasi.

Semua angka berasal dari catatan yang benar-benar dibuat pengasuh (tabel `log`). Insight dihitung
dengan aturan statistik yang bisa dijelaskan (lihat stats.py):

* tren      — periode ini vs periode sebelumnya, kemiringan garis tren di dalam periode, dan
              uji beda (Welch) terhadap kebiasaan anak 8 minggu terakhir;
* anomali   — hari yang menyimpang ≥ 1,8 simpangan baku dari kebiasaan anak sendiri (skor-z),
              serta peringatan dini bila 3 hari terakhir berturut-turut di bawah batas;
* pola      — hari dalam minggu yang konsisten lebih rendah, keterkaitan antar catatan
              (mis. lama tidur siang ↔ mood sore, korelasi Pearson), dan posisi anak dibanding
              rata-rata anak lain di daycare pada periode yang sama;
* positif   — rentetan hari baik dan kehadiran penuh.

Setiap insight menyimpan bukti angkanya dan tingkat keyakinan (jumlah data & besar efek).
"""
from __future__ import annotations

from collections import Counter
from datetime import UTC, date, datetime, timedelta
from statistics import mean, pstdev
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from .labels import ACTIVITY_LABEL, AREA_LABEL, FOOD_SLOT_LABEL, FOOD_SLOT_ORDER, fmt_duration, mood_from_score
from .logic import TZ
from .models import Child, LogEntry
from .stats import baseline, pearson, slope, weekday_effect, welch_t, zscore

DAY_SHORT = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"]
DAY_LONG = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"]
ROUTINE_TYPES = ("activity", "food", "sleep", "mood", "checkin", "checkout", "meal", "temp", "incident", "med", "note")
FMT = "%Y-%m-%dT%H:%M:%S.%fZ"
BASELINE_DAYS = 56  # kebiasaan anak dihitung dari 8 minggu sebelum periode


def local_date_of(iso_utc: str) -> tuple[date, int]:
    dt = datetime.strptime(iso_utc, FMT).replace(tzinfo=UTC).astimezone(TZ)
    return dt.date(), dt.hour


def utc_iso_at(d: date, hour: int = 0, minute: int = 0) -> str:
    dt = datetime(d.year, d.month, d.day, hour, minute, tzinfo=TZ).astimezone(UTC)
    return dt.strftime("%Y-%m-%dT%H:%M:%S.") + f"{dt.microsecond // 1000:03d}Z"


def today_local() -> date:
    return datetime.now(TZ).date()


def fmt_date_id(d: date) -> str:
    return f"{DAY_LONG[d.weekday()]} {d.day:02d}/{d.month:02d}"


def d1(x: float) -> str:
    """Satu desimal dengan koma (gaya Indonesia): 4.1 menjadi 4,1."""
    return f"{x:.1f}".replace(".", ",")


def sd1(x: float) -> str:
    """Satu desimal bertanda dengan tanda minus tipografis: -0.8 menjadi −0,8."""
    return ("−" if x < 0 else "") + d1(abs(x))


def pct_change(cur: float, prev: float) -> float | None:
    if prev <= 0:
        return None
    return round((cur - prev) / prev * 100)


def _avg(xs: list[float]) -> float | None:
    return round(mean(xs), 2) if xs else None


# ------------------------------------------------------------------ deret harian ----


def fetch_entries(db: Session, child_id: str, start: date, end: date) -> list[LogEntry]:
    lo = utc_iso_at(start)
    hi = utc_iso_at(end + timedelta(days=1))
    q = (
        select(LogEntry)
        .where(LogEntry.child_id == child_id, LogEntry.at >= lo, LogEntry.at < hi, LogEntry.type.in_(ROUTINE_TYPES))
        .order_by(LogEntry.at)
    )
    return list(db.scalars(q).all())


def day_rows(entries: list[LogEntry], start: date, end: date) -> list[dict[str, Any]]:
    """Satu baris per tanggal (termasuk hari tanpa catatan) untuk grafik dan indikator."""
    days: dict[date, dict[str, Any]] = {}
    d = start
    while d <= end:
        days[d] = {
            "date": d.isoformat(),
            "label": DAY_SHORT[d.weekday()],
            "day": d.day,
            "weekday": d.weekday(),
            "school": d.weekday() < 5,
            "present": False,
            "checkin": None,
            "activities": 0,
            "activityMinutes": 0,
            "byKind": {},
            "moods": [],
            "moodMorning": [],
            "moodAfternoon": [],
            "sleepMinutes": 0,
            "sleepQuality": [],
            "meals": {},
            "menu": [],
            "temps": [],
            "incidents": 0,
            "notes": [],
        }
        d += timedelta(days=1)
    for e in entries:
        if e.done == "replaced":
            continue
        ld, hour = local_date_of(e.at)
        row = days.get(ld)
        if row is None:
            continue
        p = e.payload or {}
        if e.type in ("activity", "food", "sleep", "mood", "checkin", "meal"):
            row["present"] = True
        if e.type == "checkin":
            row["checkin"] = f"{hour:02d}:{datetime.strptime(e.at, FMT).replace(tzinfo=UTC).astimezone(TZ).minute:02d}"
            if p.get("temp") is not None:
                row["temps"].append(float(p["temp"]))
        elif e.type == "temp" and p.get("temp") is not None:
            row["temps"].append(float(p["temp"]))
        elif e.type == "activity":
            row["activities"] += 1
            row["activityMinutes"] += int(p.get("minutes") or 0)
            k = str(p.get("kind") or "lainnya")
            row["byKind"][k] = row["byKind"].get(k, 0) + 1
        elif e.type == "mood":
            sc = float(p.get("score") or 3)
            row["moods"].append(sc)
            (row["moodMorning"] if hour < 12 else row["moodAfternoon"]).append(sc)
        elif e.type == "sleep":
            row["sleepMinutes"] += int(p.get("minutes") or 0)
            if p.get("qualityScore"):
                row["sleepQuality"].append(int(p["qualityScore"]))
        elif e.type == "food":
            slot = str(p.get("slot") or e.meal or "lunch")
            row["meals"][slot] = int(p.get("score") if p.get("score") is not None else 50)
            row["menu"].extend(p.get("menu") or [])
        elif e.type == "meal":
            # hasil pindai piring: persentase porsi dimakan → skor makan siang bila belum ada catatan porsi
            slot = e.meal or "lunch"
            if slot not in row["meals"] and p.get("pct") is not None:
                row["meals"][slot] = int(p["pct"])
        elif e.type == "incident":
            row["incidents"] += 1
        elif e.type == "note" and e.text:
            row["notes"].append({"at": e.at, "by": e.by_name, "text": e.text})
    out = []
    for row in days.values():
        m = _avg(row["moods"])
        label, emoji = mood_from_score(m)
        meal_scores = list(row["meals"].values())
        row.update(
            {
                "mood": m,
                "moodLabel": label if m is not None else None,
                "moodEmoji": emoji if m is not None else None,
                "moodMorning": _avg(row["moodMorning"]),
                "moodAfternoon": _avg(row["moodAfternoon"]),
                "sleepQuality": _avg(row["sleepQuality"]),
                "mealAvg": round(mean(meal_scores)) if meal_scores else None,
                "tempMax": max(row["temps"]) if row["temps"] else None,
            }
        )
        del row["moods"], row["temps"]
        out.append(row)
    return out


# ------------------------------------------------------------------ indikator ----


def summarize(rows: list[dict[str, Any]], upto: date | None = None) -> dict[str, Any]:
    """Indikator satu periode. `upto` membatasi hari sekolah yang dihitung (mis. sampai hari ini)."""
    school = [r for r in rows if r["school"] and (upto is None or date.fromisoformat(r["date"]) <= upto)]
    present = [r for r in rows if r["present"]]
    acts = sum(r["activities"] for r in rows)
    kinds: Counter[str] = Counter()
    for r in rows:
        kinds.update(r["byKind"])
    moods = [r["mood"] for r in rows if r["mood"] is not None]
    mood_avg = _avg(moods)
    sleep_days = [r["sleepMinutes"] for r in present if r["sleepMinutes"] > 0]
    meal_scores = [s for r in rows for s in r["meals"].values()]
    slot_scores: dict[str, list[int]] = {}
    for r in rows:
        for slot, s in r["meals"].items():
            slot_scores.setdefault(slot, []).append(s)
    label, emoji = mood_from_score(mood_avg)
    return {
        "days": len(rows),
        "schoolDays": len(school),
        "presentDays": len([r for r in school if r["present"]]),
        "attendancePct": round(len([r for r in school if r["present"]]) / len(school) * 100) if school else 0,
        "activities": acts,
        "activitiesPerDay": round(acts / len(present), 1) if present else 0,
        "activityMinutes": sum(r["activityMinutes"] for r in rows),
        "byKind": dict(kinds),
        "moodAvg": mood_avg,
        "moodLabel": label,
        "moodEmoji": emoji,
        "moodStd": round(pstdev(moods), 2) if len(moods) > 1 else 0,
        "sleepTotal": sum(sleep_days),
        "sleepAvg": round(mean(sleep_days)) if sleep_days else 0,
        "sleepDays": len(sleep_days),
        "mealAvg": round(mean(meal_scores)) if meal_scores else None,
        "mealCount": len(meal_scores),
        "slotAvg": {k: round(mean(v)) for k, v in slot_scores.items()},
        "incidents": sum(r["incidents"] for r in rows),
        "feverDays": len([r for r in rows if r["tempMax"] is not None and r["tempMax"] >= 37.5]),
    }


# ------------------------------------------------------------------ insight ----


def _ins(
    kind: str,
    area: str,
    title: str,
    text: str,
    evidence: str,
    *,
    delta: float | None = None,
    sev: str = "low",
    confidence: str = "sedang",
) -> dict[str, Any]:
    return {"kind": kind, "area": area, "title": title, "text": text, "evidence": evidence, "delta": delta, "sev": sev, "confidence": confidence}


def _basic_insights(child_short: str, cur_rows: list[dict[str, Any]], cur: dict[str, Any], prev: dict[str, Any], period_label: str) -> list[dict[str, Any]]:
    """Aturan dasar: perbandingan dua periode, pola waktu makan/tidur, kehadiran, suhu."""
    out: list[dict[str, Any]] = []
    prev_label = "periode sebelumnya" if period_label != "minggu ini" else "minggu lalu"

    # --- Tren aktivitas ---
    d = pct_change(cur["activities"], prev["activities"])
    if d is not None and abs(d) >= 20 and cur["activities"] + prev["activities"] >= 6:
        up = d > 0
        out.append(
            _ins(
                "trend",
                "aktivitas",
                f"Aktivitas belum tercatat {period_label}" if cur["activities"] == 0 else f"Aktivitas {'meningkat' if up else 'menurun'} {abs(d)}%",
                f"{child_short} tercatat mengikuti {cur['activities']} kegiatan {period_label}, dibanding {prev['activities']} pada {prev_label}.",
                f"{prev['activities']} → {cur['activities']} kegiatan",
                delta=d,
                sev="low" if up else "medium",
            )
        )
    # --- Pergeseran jenis aktivitas (sosial naik/turun, motorik kurang) ---
    for kind, nice in (("sosial", "Kegiatan sosial"), ("membaca", "Membaca"), ("seni", "Seni & kreativitas")):
        c, p = cur["byKind"].get(kind, 0), prev["byKind"].get(kind, 0)
        dk = pct_change(c, p)
        if dk is not None and abs(dk) >= 25 and max(c, p) >= 3:
            out.append(
                _ins(
                    "trend",
                    "aktivitas",
                    f"{nice} belum tercatat {period_label}" if c == 0 else f"{nice} {'meningkat' if dk > 0 else 'menurun'} {abs(dk)}%",
                    f"{nice} {child_short} {period_label}: {c} kali, {prev_label} {p} kali.",
                    f"{p} → {c} kali",
                    delta=dk,
                    sev="low" if dk > 0 else "medium",
                )
            )
    if cur["activities"] >= 8:
        motor = cur["byKind"].get("motorik_kasar", 0) + cur["byKind"].get("motorik_halus", 0)
        share = motor / cur["activities"] * 100
        if share < 15:
            out.append(
                _ins(
                    "pattern",
                    "aktivitas",
                    "Porsi aktivitas motorik masih kecil",
                    f"Hanya {round(share)}% kegiatan {child_short} {period_label} yang melatih motorik ({motor} dari {cur['activities']}).",
                    f"{motor} dari {cur['activities']} kegiatan",
                    sev="medium",
                )
            )
        kog = cur["byKind"].get("belajar", 0) + cur["byKind"].get("membaca", 0)
        if kog / cur["activities"] * 100 < 12:
            out.append(
                _ins(
                    "pattern",
                    "aktivitas",
                    "Kegiatan belajar & membaca jarang tercatat",
                    f"{kog} dari {cur['activities']} kegiatan {period_label} bersifat belajar atau membaca.",
                    f"{kog} dari {cur['activities']} kegiatan",
                    sev="medium",
                )
            )

    # --- Mood: tren, pola hari, pola waktu, rentetan positif ---
    if cur["moodAvg"] is not None and prev["moodAvg"] is not None:
        dm = round(cur["moodAvg"] - prev["moodAvg"], 2)
        if abs(dm) >= 0.4:
            out.append(
                _ins(
                    "trend",
                    "mood",
                    f"Mood {'lebih ceria' if dm > 0 else 'menurun'} dibanding {prev_label}",
                    f"Rata-rata mood {child_short} {d1(cur['moodAvg'])}/5 ({cur['moodLabel'].lower()}) {period_label}, {prev_label} {d1(prev['moodAvg'])}/5.",
                    f"{d1(prev['moodAvg'])} → {d1(cur['moodAvg'])} dari 5",
                    delta=dm,
                    sev="low" if dm > 0 else "medium",
                )
            )
    mood_rows = [r for r in cur_rows if r["mood"] is not None]
    if len(mood_rows) >= 4:
        overall = mean(r["mood"] for r in mood_rows)
        low_day = min(mood_rows, key=lambda r: r["mood"])
        if overall - low_day["mood"] >= 1.0:
            out.append(
                _ins(
                    "anomaly",
                    "mood",
                    f"Mood turun pada {DAY_LONG[low_day['weekday']]}",
                    f"Pada {fmt_date_id(date.fromisoformat(low_day['date']))} mood {child_short} tercatat {low_day['moodLabel'].lower()} ({d1(low_day['mood'])}/5), jauh di bawah rata-rata {d1(overall)}.",
                    f"{d1(low_day['mood'])} vs rata-rata {d1(overall)}",
                    sev="medium",
                )
            )
        am = [r["moodMorning"] for r in mood_rows if r["moodMorning"] is not None]
        pm = [r["moodAfternoon"] for r in mood_rows if r["moodAfternoon"] is not None]
        if len(am) >= 3 and len(pm) >= 3 and mean(am) - mean(pm) >= 0.6:
            out.append(
                _ins(
                    "pattern",
                    "mood",
                    "Mood cenderung turun di sore hari",
                    f"Rata-rata mood pagi {d1(mean(am))}/5, sore {d1(mean(pm))}/5. Biasanya berkaitan dengan kelelahan atau tidur siang yang kurang.",
                    f"pagi {d1(mean(am))} · sore {d1(mean(pm))}",
                    sev="medium",
                )
            )
        streak = 0
        best = 0
        for r in cur_rows:
            if r["mood"] is not None and r["mood"] >= 4:
                streak += 1
                best = max(best, streak)
            elif r["present"]:
                streak = 0
        if best >= 3:
            out.append(
                _ins(
                    "positive",
                    "mood",
                    f"Mood ceria {best} hari berturut-turut",
                    f"{child_short} tercatat senang atau sangat senang selama {best} hari berturut-turut {period_label}.",
                    f"{best} hari ≥ 4/5",
                )
            )

    # --- Tidur: tren & anomali ---
    if cur["sleepDays"] >= 3 and prev["sleepDays"] >= 3:
        ds = pct_change(cur["sleepAvg"], prev["sleepAvg"])
        if ds is not None and abs(ds) >= 15:
            out.append(
                _ins(
                    "trend",
                    "tidur",
                    f"Durasi tidur siang {'bertambah' if ds > 0 else 'berkurang'} {abs(ds)}%",
                    f"Rata-rata tidur siang {fmt_duration(cur['sleepAvg'])} per hari {period_label}, {prev_label} {fmt_duration(prev['sleepAvg'])}.",
                    f"{prev['sleepAvg']} → {cur['sleepAvg']} menit/hari",
                    delta=ds,
                    sev="low" if ds > 0 else "medium",
                )
            )
    sleep_rows = [r for r in cur_rows if r["present"] and r["school"]]
    if len(sleep_rows) >= 3 and cur["sleepAvg"] > 0:
        for r in sleep_rows:
            if r["sleepMinutes"] and r["sleepMinutes"] < 0.6 * cur["sleepAvg"]:
                out.append(
                    _ins(
                        "anomaly",
                        "tidur",
                        f"Tidur siang singkat pada {DAY_LONG[r['weekday']]}",
                        f"{fmt_date_id(date.fromisoformat(r['date']))}: hanya {fmt_duration(r['sleepMinutes'])}, biasanya sekitar {fmt_duration(cur['sleepAvg'])}.",
                        f"{r['sleepMinutes']} vs ±{cur['sleepAvg']} menit",
                        sev="medium",
                    )
                )
                break
        no_sleep = [r for r in sleep_rows if r["sleepMinutes"] == 0 and r["activities"] > 0]
        if len(no_sleep) >= 2:
            out.append(
                _ins(
                    "pattern",
                    "tidur",
                    "Beberapa hari tanpa catatan tidur siang",
                    f"{len(no_sleep)} hari {period_label} tidak ada catatan tidur siang meski {child_short} hadir.",
                    f"{len(no_sleep)} hari tanpa tidur siang",
                    sev="medium",
                )
            )

    # --- Makan: tren, pola waktu makan, kaitan dengan mood ---
    if cur["mealAvg"] is not None and prev["mealAvg"] is not None and abs(cur["mealAvg"] - prev["mealAvg"]) >= 15:
        dmeal = cur["mealAvg"] - prev["mealAvg"]
        out.append(
            _ins(
                "trend",
                "makan",
                f"Porsi makan {'membaik' if dmeal > 0 else 'menurun'}",
                f"Rata-rata porsi yang dihabiskan {cur['mealAvg']}% {period_label}, {prev_label} {prev['mealAvg']}%.",
                f"{prev['mealAvg']}% → {cur['mealAvg']}%",
                delta=dmeal,
                sev="low" if dmeal > 0 else "medium",
            )
        )
    for slot in FOOD_SLOT_ORDER:
        scores = [r["meals"][slot] for r in cur_rows if slot in r["meals"]]
        if len(scores) >= 3:
            low = [s for s in scores if s <= 25]
            if len(low) >= max(2, round(len(scores) * 0.5)):
                out.append(
                    _ins(
                        "pattern",
                        "makan",
                        f"{FOOD_SLOT_LABEL[slot]} sering tidak habis",
                        f"{len(low)} dari {len(scores)} kali {FOOD_SLOT_LABEL[slot].lower()} {period_label} hanya dimakan sedikit atau tidak dimakan.",
                        f"{len(low)} dari {len(scores)} kali ≤ 25%",
                        sev="medium",
                    )
                )
    low_meal_days = [r for r in cur_rows if r["mealAvg"] is not None and r["mealAvg"] < 50]
    if len(low_meal_days) >= 2:
        low_mood = [r for r in low_meal_days if r["mood"] is not None and r["mood"] < 3]
        if len(low_mood) >= 2:
            out.append(
                _ins(
                    "pattern",
                    "makan",
                    "Hari makan sedikit bertepatan dengan mood rendah",
                    f"Pada {len(low_mood)} hari dengan porsi makan di bawah 50%, mood {child_short} juga tercatat di bawah netral.",
                    f"{len(low_mood)} hari beririsan",
                    sev="medium",
                )
            )

    # --- Kehadiran & kesehatan ---
    absent = cur["schoolDays"] - cur["presentDays"]
    if absent >= 2:
        out.append(
            _ins(
                "pattern",
                "kehadiran",
                f"Tidak hadir {absent} hari",
                f"{child_short} hadir {cur['presentDays']} dari {cur['schoolDays']} hari sekolah {period_label}.",
                f"{cur['presentDays']}/{cur['schoolDays']} hari",
                sev="medium",
            )
        )
    elif cur["schoolDays"] >= 4 and cur["presentDays"] == cur["schoolDays"]:
        out.append(_ins("positive", "kehadiran", "Kehadiran penuh", f"{child_short} hadir setiap hari sekolah {period_label} ({cur['presentDays']} hari).", f"{cur['presentDays']}/{cur['schoolDays']} hari"))
    if cur["feverDays"]:
        out.append(
            _ins(
                "anomaly",
                "kesehatan",
                f"Suhu di atas 37,5 °C pada {cur['feverDays']} hari",
                f"Ada pemeriksaan suhu {child_short} yang mencapai ≥ 37,5 °C {period_label}. Rincian ada di catatan kesehatan.",
                f"{cur['feverDays']} hari",
                sev="medium",
            )
        )
    return out


# ------------------------------------------------------------------ kebiasaan anak & statistik lanjutan ----

SEV_ORDER = {"high": 0, "medium": 1, "low": 2}


def _present_school(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [r for r in rows if r["present"] and r["school"]]


def build_baseline(hist_rows: list[dict[str, Any]]) -> dict[str, Any]:
    """Kebiasaan anak dari hari-hari hadir sebelum periode ini (maks. 8 minggu)."""
    days = _present_school(hist_rows)
    moods = [float(r["mood"]) for r in days if r["mood"] is not None]
    sleeps = [float(r["sleepMinutes"]) for r in days if r["sleepMinutes"] > 0]
    meals = [float(r["mealAvg"]) for r in days if r["mealAvg"] is not None]
    acts = [float(r["activities"]) for r in days if r["activities"] > 0]

    def pack(b: dict[str, float] | None, digits: int) -> dict[str, float] | None:
        return None if b is None else {"n": int(b["n"]), "mean": round(b["mean"], digits), "sd": round(b["sd"], digits)}

    return {
        "days": len(days),
        "from": days[0]["date"] if days else None,
        "to": days[-1]["date"] if days else None,
        "mood": pack(baseline(moods), 2),
        "sleep": pack(baseline(sleeps), 0),
        "meal": pack(baseline(meals), 0),
        "activities": pack(baseline(acts), 1),
        # simpan deret mentah untuk uji beda (tidak dikirim ke klien)
        "_moods": moods,
        "_sleeps": sleeps,
        "_meals": meals,
    }


def _conf(n: float, effect: float, strong_n: float, strong_effect: float) -> str:
    if n >= strong_n and effect >= strong_effect:
        return "tinggi"
    if n >= strong_n * 0.6 or effect >= strong_effect:
        return "sedang"
    return "rendah"


def _advanced_insights(
    child_short: str,
    cur_rows: list[dict[str, Any]],
    hist_rows: list[dict[str, Any]],
    cur: dict[str, Any],
    base: dict[str, Any],
    peers: dict[str, Any] | None,
    period_label: str,
) -> list[dict[str, Any]]:
    """Insight berbasis kebiasaan anak sendiri (skor-z, kemiringan tren, uji beda), pola hari,
    keterkaitan antar catatan, peringatan dini, dan posisi terhadap anak lain."""
    out: list[dict[str, Any]] = []
    cur_days = _present_school(cur_rows)
    all_days = _present_school(hist_rows) + cur_days

    # --- anomali hari terhadap kebiasaan anak (skor-z) ---
    metrics = (
        ("mood", "mood", "Mood", 0.35, lambda r: r["mood"], lambda v: f"{d1(v)}/5", "mood"),
        ("sleep", "sleepMinutes", "Tidur siang", 15.0, lambda r: r["sleepMinutes"] if r["sleepMinutes"] > 0 else None, fmt_duration, "tidur"),
        ("meal", "mealAvg", "Porsi makan", 10.0, lambda r: r["mealAvg"], lambda v: f"{round(v)}%", "makan"),
    )
    for key, _col, nice, floor_sd, getter, fmt, area in metrics:
        b = base.get(key)
        if not b or b["n"] < 8:
            continue
        worst: tuple[float, dict[str, Any]] | None = None
        for r in cur_days:
            v = getter(r)
            if v is None:
                continue
            z = zscore(float(v), b, floor_sd)
            if z is None:
                continue
            if worst is None or abs(z) > abs(worst[0]):
                worst = (z, r)
        if worst and abs(worst[0]) >= 1.8 and (worst[0] < 0 or key == "sleep"):
            # nilai di atas kebiasaan hanya dilaporkan untuk tidur (tidur siang yang jauh lebih lama bisa pertanda tidak enak badan)
            z, r = worst
            v = float(getter(r))
            below = z < 0
            out.append(
                _ins(
                    "anomaly",
                    area,
                    f"{nice} {'jauh di bawah' if below else 'jauh di atas'} kebiasaan pada {DAY_LONG[r['weekday']]}",
                    f"{fmt_date_id(date.fromisoformat(r['date']))}: {nice.lower()} {child_short} {fmt(v)}, sedangkan kebiasaannya {fmt(b['mean'])} ± {fmt(b['sd']) if key != 'mood' else d1(b['sd'])} ({b['n']} hari sebelumnya).",
                    f"{fmt(v)} vs kebiasaan {fmt(b['mean'])} · z = {sd1(z)} · {b['n']} hari",
                    delta=round(v - b["mean"], 2),
                    sev="high" if (below and abs(z) >= 2.5) else ("medium" if below else "low"),
                    confidence=_conf(b["n"], abs(z), 15, 2.5),
                )
            )

    # --- kemiringan tren di dalam periode (regresi linear sederhana) ---
    for key, nice, getter, min_change, fmt, area in (
        ("mood", "Mood", lambda r: r["mood"], 0.8, lambda v: f"{d1(v)}/5", "mood"),
        ("sleep", "Tidur siang", lambda r: r["sleepMinutes"] if r["sleepMinutes"] > 0 else None, 20.0, fmt_duration, "tidur"),
        ("meal", "Porsi makan", lambda r: r["mealAvg"], 20.0, lambda v: f"{round(v)}%", "makan"),
    ):
        ys = [float(getter(r)) for r in cur_days if getter(r) is not None]
        sl = slope(ys)
        if sl is None:
            continue
        change = sl["slope"] * (sl["n"] - 1)
        if abs(sl["r"]) >= 0.6 and abs(change) >= min_change:
            down = change < 0
            out.append(
                _ins(
                    "trend",
                    area,
                    f"{nice} {'menurun' if down else 'meningkat'} bertahap sepanjang {period_label}",
                    f"Dari hari ke hari {nice.lower()} {child_short} bergerak {'turun' if down else 'naik'} sekitar {fmt(abs(change))} selama {int(sl['n'])} hari hadir (pola cukup konsisten, r = {sd1(sl['r'])}).",
                    f"{'−' if down else '+'}{fmt(abs(change))} dalam {int(sl['n'])} hari · r = {sd1(sl['r'])}",
                    delta=round(change, 2),
                    sev="medium" if down else "low",
                    confidence=_conf(sl["n"], abs(sl["r"]), 8, 0.75),
                )
            )

    # --- beda bermakna terhadap kebiasaan 8 minggu (Welch) ---
    for key, raw_key, nice, getter, min_diff, fmt, area in (
        ("mood", "_moods", "Mood", lambda r: r["mood"], 0.4, lambda v: f"{d1(v)}/5", "mood"),
        ("sleep", "_sleeps", "Tidur siang", lambda r: r["sleepMinutes"] if r["sleepMinutes"] > 0 else None, 15.0, fmt_duration, "tidur"),
        ("meal", "_meals", "Porsi makan", lambda r: r["mealAvg"], 12.0, lambda v: f"{round(v)}%", "makan"),
    ):
        cur_vals = [float(getter(r)) for r in cur_days if getter(r) is not None]
        t = welch_t(cur_vals, base.get(raw_key) or [])
        if t is None or abs(t["t"]) < 2.0 or abs(t["diff"]) < min_diff:
            continue
        down = t["diff"] < 0
        out.append(
            _ins(
                "trend",
                area,
                f"{nice} {period_label} {'lebih rendah' if down else 'lebih tinggi'} dari kebiasaan {child_short}",
                f"Rata-rata {nice.lower()} {fmt(mean(cur_vals))} pada {len(cur_vals)} hari hadir {period_label}, dibanding kebiasaan {fmt(mean(base[raw_key]))} dari {int(t['nb'])} hari sebelumnya. Perbedaannya cukup besar untuk tidak dianggap kebetulan.",
                f"{fmt(mean(cur_vals))} vs kebiasaan {fmt(mean(base[raw_key]))} · t = {d1(abs(t['t']))} · {int(t['na'])}+{int(t['nb'])} hari",
                delta=round(t["diff"], 2),
                sev="medium" if down else "low",
                confidence=_conf(min(t["na"], t["nb"]), abs(t["t"]), 10, 3.0),
            )
        )
        out[-1]["_welch"] = d1(abs(t["t"]))

    # --- pola hari dalam minggu (butuh ≥ 3 minggu) ---
    for key, nice, fmt, area in (("mood", "Mood", lambda v: f"{d1(v)}/5", "mood"), ("mealAvg", "Porsi makan", lambda v: f"{round(v)}%", "makan")):
        eff = weekday_effect(all_days, key, min_gap=0.6 if key == "mood" else 15.0)
        if eff:
            out.append(
                _ins(
                    "pattern",
                    area,
                    f"{nice} biasanya lebih rendah pada hari {DAY_LONG[eff['weekday']]}",
                    f"Rata-rata {nice.lower()} {child_short} pada hari {DAY_LONG[eff['weekday']]} {fmt(eff['mean'])}, pada hari lain {fmt(eff['others'])}; terjadi pada {eff['hits']} dari {eff['weeks']} minggu terakhir.",
                    f"{DAY_LONG[eff['weekday']]} {fmt(eff['mean'])} vs {fmt(eff['others'])} · {eff['hits']}/{eff['weeks']} minggu",
                    sev="medium",
                    confidence=_conf(eff["weeks"], eff["hits"] / eff["weeks"], 5, 0.8),
                )
            )

    # --- keterkaitan antar catatan (korelasi Pearson pada hari yang sama) ---
    pairs_sleep_mood = [(float(r["sleepMinutes"]), float(r["moodAfternoon"])) for r in all_days if r["sleepMinutes"] > 0 and r["moodAfternoon"] is not None]
    c = pearson(pairs_sleep_mood)
    if c and c["r"] >= 0.45:
        out.append(
            _ins(
                "pattern",
                "tidur",
                "Tidur siang lebih lama berkaitan dengan mood sore lebih baik",
                f"Pada {int(c['n'])} hari dengan catatan tidur dan mood sore, semakin lama {child_short} tidur siang semakin baik mood sorenya (korelasi {d1(c['r'])}). Ini keterkaitan, bukan kepastian sebab-akibat.",
                f"r = {d1(c['r'])} · {int(c['n'])} hari",
                confidence=_conf(c["n"], c["r"], 20, 0.6),
            )
        )
    pairs_meal_mood = [(float(r["mealAvg"]), float(r["mood"])) for r in all_days if r["mealAvg"] is not None and r["mood"] is not None]
    c = pearson(pairs_meal_mood)
    if c and c["r"] >= 0.45:
        out.append(
            _ins(
                "pattern",
                "makan",
                "Porsi makan berjalan seiring dengan mood harian",
                f"Pada {int(c['n'])} hari, porsi makan yang lebih banyak cenderung bertepatan dengan mood {child_short} yang lebih baik (korelasi {d1(c['r'])}).",
                f"r = {d1(c['r'])} · {int(c['n'])} hari",
                confidence=_conf(c["n"], c["r"], 20, 0.6),
            )
        )
    pairs_act_sleep = [(float(r["activityMinutes"]), float(r["sleepMinutes"])) for r in all_days if r["activityMinutes"] > 0 and r["sleepMinutes"] > 0]
    c = pearson(pairs_act_sleep)
    if c and abs(c["r"]) >= 0.45:
        pos = c["r"] > 0
        out.append(
            _ins(
                "pattern",
                "tidur",
                "Hari yang lebih aktif diikuti tidur siang lebih lama" if pos else "Hari yang sangat aktif justru diikuti tidur siang lebih singkat",
                f"Pada {int(c['n'])} hari, lama kegiatan dan lama tidur siang {child_short} bergerak {'searah' if pos else 'berlawanan'} (korelasi {d1(c['r'])}).",
                f"r = {d1(c['r'])} · {int(c['n'])} hari",
                sev="low" if pos else "medium",
                confidence=_conf(c["n"], abs(c["r"]), 20, 0.6),
            )
        )

    # --- peringatan dini: 3 hari hadir terakhir berturut-turut di bawah batas ---
    recent = cur_days[-3:]
    if len(recent) == 3:
        if all(r["mood"] is not None and r["mood"] < 3 for r in recent):
            out.append(
                _ins(
                    "anomaly",
                    "mood",
                    "Peringatan dini: mood rendah 3 hari berturut-turut",
                    f"Tiga hari hadir terakhir mood {child_short} tercatat di bawah netral ({', '.join(d1(r['mood']) for r in recent)}). Sebaiknya dibicarakan dengan orang tua hari ini.",
                    " · ".join(f"{DAY_SHORT[r['weekday']]} {d1(r['mood'])}" for r in recent),
                    sev="high",
                    confidence="tinggi",
                )
            )
        if all(r["mealAvg"] is not None and r["mealAvg"] < 50 for r in recent):
            out.append(
                _ins(
                    "anomaly",
                    "makan",
                    "Peringatan dini: porsi makan di bawah setengah 3 hari berturut-turut",
                    f"Tiga hari hadir terakhir {child_short} makan kurang dari setengah porsi ({', '.join(str(round(r['mealAvg'])) + '%' for r in recent)}).",
                    " · ".join(f"{DAY_SHORT[r['weekday']]} {round(r['mealAvg'])}%" for r in recent),
                    sev="high",
                    confidence="tinggi",
                )
            )

    # --- posisi dibanding anak lain di daycare (periode sama) ---
    if peers and peers.get("n", 0) >= 3:
        for key, nice, fmt, min_diff, area, higher_is_better in (
            ("moodAvg", "Mood", lambda v: f"{d1(v)}/5", 0.5, "mood", True),
            ("sleepAvg", "Tidur siang", fmt_duration, 20.0, "tidur", True),
            ("mealAvg", "Porsi makan", lambda v: f"{round(v)}%", 15.0, "makan", True),
            ("activitiesPerDay", "Kegiatan per hari", lambda v: d1(v), 1.0, "aktivitas", True),
        ):
            st = peers["stats"].get(key)
            mine = cur.get(key)
            if not st or mine is None or (key != "activitiesPerDay" and not mine):
                continue
            diff = float(mine) - st["mean"]
            if abs(diff) < min_diff or abs(diff) < max(st["sd"], 1e-6):
                continue
            better = (diff > 0) == higher_is_better
            out.append(
                _ins(
                    "pattern",
                    area,
                    f"{nice} {child_short} {'di atas' if diff > 0 else 'di bawah'} rata-rata anak lain",
                    f"{nice} {child_short} {fmt(float(mine))} {period_label}, sedangkan rata-rata {st['n']} anak lain di daycare {fmt(st['mean'])}. Setiap anak berbeda; angka ini hanya pembanding, bukan penilaian.",
                    f"{fmt(float(mine))} vs {fmt(st['mean'])} ({st['n']} anak)",
                    delta=round(diff, 2),
                    sev="low" if better else "medium",
                    confidence=_conf(st["n"], abs(diff) / max(st["sd"], 1e-6), 5, 1.5),
                )
            )
    return out


def build_insights(
    child_short: str,
    cur_rows: list[dict[str, Any]],
    cur: dict[str, Any],
    prev: dict[str, Any],
    period_label: str,
    hist_rows: list[dict[str, Any]] | None = None,
    base: dict[str, Any] | None = None,
    peers: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    out = _basic_insights(child_short, cur_rows, cur, prev, period_label)
    if base is not None:
        adv = _advanced_insights(child_short, cur_rows, hist_rows or [], cur, base, peers, period_label)
        # anomali skor-z lebih tepat daripada aturan "hari terendah" dasar pada area yang sama
        # bila kebiasaan anak cukup panjang, aturan dasar "hari terendah" digantikan skor-z (lebih adil terhadap anak yang memang bervariasi)
        covered = {area for key, area in (("mood", "mood"), ("sleep", "tidur"), ("meal", "makan")) if base.get(key) and base[key]["n"] >= 8}
        out = [i for i in out if not (i["kind"] == "anomaly" and i["area"] in covered)]
        # uji beda vs kebiasaan searah dengan tren dasar pada area yang sama → perkuat tren dasar, jangan dobel
        merged: list[dict[str, Any]] = []
        for i in adv:
            t_stat = i.pop("_welch", None)
            if t_stat is not None:
                twin = next(
                    (b for b in out if b["kind"] == "trend" and b["area"] == i["area"] and b.get("delta") is not None and (b["delta"] < 0) == (i["delta"] < 0)),
                    None,
                )
                if twin is not None:
                    twin["evidence"] += f" · beda bermakna vs kebiasaan (t = {t_stat})"
                    twin["confidence"] = "tinggi"
                    continue
            merged.append(i)
        out = out + merged
    order = {"anomaly": 0, "trend": 1, "pattern": 2, "positive": 3}
    out.sort(key=lambda i: (order[i["kind"]], SEV_ORDER.get(i["sev"], 2), not i["title"].startswith("Peringatan dini")))
    for n, i in enumerate(out):
        i["id"] = f"i{n + 1}"
    return out[:10]


def peer_summary(db: Session, child_id: str, start: date, end: date, today: date) -> dict[str, Any]:
    """Indikator anak-anak lain (aktif) pada periode yang sama, hanya sebagai agregat anonim."""
    others = [c for c in db.scalars(select(Child).where(Child.id != child_id, Child.archived_at.is_(None))).all()]
    vals: dict[str, list[float]] = {"moodAvg": [], "sleepAvg": [], "mealAvg": [], "activitiesPerDay": [], "attendancePct": []}
    n = 0
    for c in others:
        rows = day_rows(fetch_entries(db, c.id, start, end), start, end)
        summ = summarize(rows, upto=today)
        if summ["presentDays"] == 0:
            continue
        n += 1
        for k in vals:
            v = summ.get(k)
            if v is not None and (k == "activitiesPerDay" or k == "attendancePct" or v):
                vals[k].append(float(v))
    stats: dict[str, dict[str, float]] = {}
    for k, xs in vals.items():
        b = baseline(xs, min_n=3)
        if b:
            stats[k] = {"n": int(b["n"]), "mean": round(b["mean"], 2), "sd": round(b["sd"], 2)}
    return {"n": n, "stats": stats}


# ------------------------------------------------------------------ rekomendasi ----


def build_recommendations(child_short: str, insights: list[dict[str, Any]], cur: dict[str, Any]) -> list[dict[str, Any]]:
    recs: list[dict[str, Any]] = []
    seen: set[str] = set()

    def add(key: str, title: str, text: str, why: str) -> None:
        if key in seen or len(recs) >= 5:
            return
        seen.add(key)
        recs.append({"id": key, "title": title, "text": text, "why": why})

    top_kind = max(cur["byKind"].items(), key=lambda kv: kv[1])[0] if cur["byKind"] else None
    top_label = ACTIVITY_LABEL.get(top_kind or "", "kegiatan favoritnya").lower()
    for i in insights:
        a, k, t = i["area"], i["kind"], i["title"]
        tl = t.lower()
        if tl.startswith("peringatan dini"):
            add("dini", "Hubungi orang tua hari ini", f"Sampaikan catatan 3 hari terakhir apa adanya, tanyakan perubahan di rumah (tidur malam, sakit, kejadian), dan sepakati pantauan bersama untuk {child_short} minggu ini.", t)
        elif k == "pattern" and "biasanya lebih rendah pada hari" in tl:
            hari = t.rsplit("hari ", 1)[-1]
            add("hari", f"Siapkan transisi khusus hari {hari}", f"Sambut {child_short} lebih awal, mulai dengan {top_label}, dan beri 15 menit adaptasi sebelum kegiatan kelompok pada hari {hari}.", t)
        elif k == "pattern" and "tidur siang lebih lama berkaitan" in tl:
            add("tidur-mood", "Prioritaskan tidur siang yang cukup", "Catatan menunjukkan mood sore mengikuti lama tidur siang; jaga jam mulai tidur konsisten (± 12.30) dan hindari kegiatan ramai menjelang tidur.", t)
        elif k == "pattern" and "rata-rata anak lain" in tl and i["sev"] == "medium":
            if a == "tidur":
                add("tidur", "Jaga jadwal tidur siang konsisten", "Mulai tidur siang pada jam yang sama (± 12.30–13.00), redupkan ruangan, hindari kegiatan ramai 15 menit sebelumnya.", t)
            elif a == "makan":
                add("makan", "Variasikan menu pada waktu makan yang sulit", "Coba tekstur dan bentuk yang berbeda, ajak anak memilih di antara dua pilihan, dan beri waktu makan yang tenang.", t)
            elif a == "mood":
                add("mood", "Cek pemicu mood & tidur malam", f"Tanyakan ke orang tua pola tidur malam dan kejadian di rumah; perbanyak {top_label} yang membuat {child_short} nyaman.", t)
            elif a == "aktivitas":
                add("aktif", "Ajak ikut kegiatan yang disukai", f"Mulai hari dengan {top_label}, lalu tawarkan kegiatan lain setelah anak nyaman.", t)
        elif a == "aktivitas" and "motorik" in t.lower():
            add("motorik", "Tambah aktivitas motorik kasar", "Sisipkan 20 menit bermain bola, lari kecil, atau lompat di pagi hari, 3× seminggu.", i["title"])
        elif a == "aktivitas" and ("belajar" in t.lower() or "membaca" in t.lower()) and k == "pattern":
            add("kognitif", "Sisipkan membaca bersama", "Bacakan buku 10–15 menit setelah snack pagi; biarkan anak memilih bukunya.", i["title"])
        elif a == "aktivitas" and "sosial" in t.lower() and (i["delta"] or 0) > 0:
            add("sosial-up", "Pertahankan kegiatan kelompok", "Jadwalkan permainan kelompok kecil (3–4 anak) 2–3× seminggu agar interaksi sosial tetap tumbuh.", i["title"])
        elif a == "aktivitas" and (i["delta"] or 0) < 0:
            add("aktif", "Ajak ikut kegiatan yang disukai", f"Mulai hari dengan {top_label}, lalu tawarkan kegiatan lain setelah anak nyaman.", i["title"])
        elif a == "mood" and k in ("anomaly", "trend") and (i["delta"] or -1) < 0:
            add("mood", "Cek pemicu mood & tidur malam", f"Tanyakan ke orang tua pola tidur malam dan kejadian di rumah; perbanyak {top_label} yang membuat {child_short} nyaman.", i["title"])
        elif a == "mood" and k == "pattern":
            add("mood-sore", "Sesuaikan ritme sore", "Beri jeda tenang 10 menit setelah tidur siang dan snack sore lebih awal sebelum kegiatan lanjut.", i["title"])
        elif a == "tidur" and k == "anomaly" and "jauh di atas" in tl:
            add("tidur-lebih", "Cek kondisi anak setelah tidur panjang", f"Tidur siang yang jauh lebih lama dari biasanya bisa berarti {child_short} lelah atau kurang sehat: ukur suhu saat bangun, tanyakan tidur malam ke orang tua, dan catat bila berulang.", i["title"])
        elif a == "tidur" and k == "pattern" and "rata-rata anak lain" in tl:
            pass  # sudah ditangani di atas (hanya bila di bawah rata-rata)
        elif a == "tidur":
            add("tidur", "Jaga jadwal tidur siang konsisten", "Mulai tidur siang pada jam yang sama (± 12.30–13.00), redupkan ruangan, hindari kegiatan ramai 15 menit sebelumnya.", i["title"])
        elif a == "makan" and "mood" in t.lower():
            add("makan-mood", "Tawarkan makan dalam porsi kecil", "Sajikan porsi kecil lebih dulu lalu tambah bila habis; catat menu yang disukai untuk dibagikan ke orang tua.", i["title"])
        elif a == "makan":
            add("makan", "Variasikan menu pada waktu makan yang sulit", "Coba tekstur dan bentuk yang berbeda, ajak anak memilih di antara dua pilihan, dan beri waktu makan yang tenang.", i["title"])
        elif a == "kehadiran" and k == "pattern":
            add("hadir", "Hubungi orang tua soal kehadiran", "Tanyakan kabar anak dan bantu jadwal yang lebih rutin; kehadiran teratur memudahkan adaptasi.", i["title"])
        elif a == "kesehatan":
            add("sehat", "Pantau suhu berkala", "Ukur suhu ulang tiap 30 menit saat hangat; sampaikan ke orang tua bila ≥ 37,8 °C.", i["title"])
    if not recs:
        add("stabil", "Lanjutkan pola yang sudah berjalan", f"Pola {child_short} stabil pada periode ini. Pertahankan jadwal, dan catat hal baru yang disukainya.", "Tidak ada penyimpangan berarti dari periode sebelumnya")
    return recs


# ------------------------------------------------------------------ profil perkembangan ----


def _area_score(cur: dict[str, Any], keys: tuple[tuple[str, float], ...], target_share: float) -> tuple[float, str]:
    total = cur["activities"]
    if total == 0:
        return 0.0, "Belum ada catatan aktivitas"
    hit = sum(cur["byKind"].get(k, 0) * w for k, w in keys)
    share = hit / total
    per_day = hit / max(1, cur["presentDays"] or 1)
    score = min(100.0, share / target_share * 80 + min(20.0, per_day * 10))
    return round(score), f"{round(hit)} dari {total} kegiatan ({round(share * 100)}%)"


def build_profile(cur: dict[str, Any], prev: dict[str, Any]) -> list[dict[str, Any]]:
    def level(s: float) -> str:
        return "Sangat Baik" if s >= 75 else "Baik" if s >= 55 else "Cukup" if s >= 35 else "Perlu Perhatian"

    def trend(a: float, b: float) -> str:
        return "up" if a - b > 5 else "down" if b - a > 5 else "flat"

    spec = {
        "sosial": ((("sosial", 1.0), ("bermain", 0.6)), 0.35),
        "motorik": ((("motorik_kasar", 1.0), ("motorik_halus", 1.0), ("seni", 0.4), ("bermain", 0.3)), 0.35),
        "kognitif": ((("belajar", 1.0), ("membaca", 1.0), ("seni", 0.5)), 0.30),
    }
    out = []
    for area, (keys, tgt) in spec.items():
        s, basis = _area_score(cur, keys, tgt)
        p, _ = _area_score(prev, keys, tgt)
        out.append({"area": area, "label": AREA_LABEL[area], "score": s, "level": level(s), "trend": trend(s, p), "prev": p, "basis": basis})
    # emosi: rata-rata mood (70%) + kestabilan (30%)
    if cur["moodAvg"] is not None:
        stab = max(0.0, 100 - cur["moodStd"] * 40)
        s = round((cur["moodAvg"] - 1) / 4 * 100 * 0.7 + stab * 0.3)
        basis = f"rata-rata mood {d1(cur['moodAvg'])}/5, simpangan {d1(cur['moodStd'])}"
    else:
        s, basis = 0, "Belum ada catatan mood"
    if prev["moodAvg"] is not None:
        p = round((prev["moodAvg"] - 1) / 4 * 100 * 0.7 + max(0.0, 100 - prev["moodStd"] * 40) * 0.3)
    else:
        p = s
    out.append({"area": "emosi", "label": AREA_LABEL["emosi"], "score": s, "level": level(s), "trend": trend(s, p), "prev": p, "basis": basis})
    return out


# ------------------------------------------------------------------ paket lengkap ----


def analyze(db: Session, child: dict[str, Any], days: int = 7, end: date | None = None) -> dict[str, Any]:
    today = today_local()
    end = min(end or today, today)
    start = end - timedelta(days=days - 1)
    p_end = start - timedelta(days=1)
    p_start = p_end - timedelta(days=days - 1)
    # kebiasaan anak: sampai 8 minggu sebelum periode ini (mencakup periode pembanding)
    base_start = min(p_start, start - timedelta(days=BASELINE_DAYS))
    entries = fetch_entries(db, child["id"], base_start, end)
    cur_rows = day_rows([e for e in entries if local_date_of(e.at)[0] >= start], start, end)
    prev_rows = day_rows([e for e in entries if p_start <= local_date_of(e.at)[0] <= p_end], p_start, p_end)
    hist_rows = day_rows([e for e in entries if local_date_of(e.at)[0] < start], base_start, start - timedelta(days=1))
    # Hari ini mengikuti aturan yang sama dengan dasbor: jam datang terjadwal yang sudah lewat = hadir,
    # walau catatan rutin pertama belum ada (agar "Kehadiran Hari Ini" dan grafik minggu ini tidak bertentangan).
    if end == today and cur_rows and cur_rows[-1]["school"]:
        now_hm = datetime.now(TZ).strftime("%H:%M")
        sched = str(child.get("checkin") or "")
        if not cur_rows[-1]["checkin"] and sched and now_hm >= sched:
            cur_rows[-1]["present"] = True
            cur_rows[-1]["checkin"] = sched
        # pemeriksaan suhu rutin yang sudah lewat jamnya (jadwal dasar anak) ikut dihitung, sama seperti di dasbor
        routine = [float(t["v"]) for t in child.get("temps") or [] if str(t.get("t", "")) <= now_hm]
        if routine and cur_rows[-1]["present"]:
            cur_rows[-1]["tempMax"] = max([*routine, cur_rows[-1]["tempMax"] or 0])
    cur = summarize(cur_rows, upto=today)
    prev = summarize(prev_rows)
    period_label = "minggu ini" if days == 7 and end == today else "periode ini"
    base = build_baseline(hist_rows)
    peers = peer_summary(db, child["id"], start, end, today)
    insights = build_insights(child["short"], cur_rows, cur, prev, period_label, hist_rows=hist_rows, base=base, peers=peers)
    recs = build_recommendations(child["short"], insights, cur)
    profile = build_profile(cur, prev)
    notes = [n for r in cur_rows for n in r["notes"]][-3:]
    kinds = [{"kind": k, "label": ACTIVITY_LABEL.get(k, k), "count": v} for k, v in sorted(cur["byKind"].items(), key=lambda kv: -kv[1])]
    return {
        "childId": child["id"],
        "child": child["short"],
        "range": {"start": start.isoformat(), "end": end.isoformat(), "days": days, "label": f"{start.day:02d}/{start.month:02d} – {end.day:02d}/{end.month:02d}/{end.year}"},
        "days": cur_rows,
        "prevDays": prev_rows,
        "current": cur,
        "previous": prev,
        "kinds": kinds,
        "insights": insights,
        "recommendations": recs,
        "profile": profile,
        "teacherNotes": notes,
        "baseline": {k: v for k, v in base.items() if not k.startswith("_")},
        "peers": {"n": peers["n"]},
        "method": (
            "Dihitung dari catatan pengasuh (aktivitas, makan, tidur, mood, kehadiran). Periode ini dibandingkan dengan periode "
            "sebelumnya yang sama panjang dan dengan kebiasaan anak sendiri hingga 8 minggu ke belakang (rata-rata ± simpangan). "
            "Anomali = hari yang menyimpang ≥ 1,8 simpangan dari kebiasaan; tren = perubahan ≥ 20 % (aktivitas), ≥ 0,4 poin (mood), "
            "≥ 15 % (tidur/makan), garis tren yang konsisten (r ≥ 0,6), atau beda bermakna terhadap kebiasaan (uji t ≥ 2); "
            "pola = hari dalam minggu yang konsisten lebih rendah (≥ 3 minggu), keterkaitan antar catatan (korelasi ≥ 0,45 pada ≥ 10 hari), "
            f"dan pembanding anonim dengan {peers['n']} anak lain pada periode yang sama. Tingkat keyakinan mengikuti jumlah data dan besar efek. Bukan asesmen klinis."
        ),
        "generatedAt": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%S.000Z"),
    }
