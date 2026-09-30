"""Lapisan analisis catatan harian: deret harian → indikator → insight → rekomendasi.

Semua angka berasal dari catatan yang benar-benar dibuat pengasuh (tabel `log`). Insight dihitung
dengan aturan statistik yang bisa dijelaskan (lihat stats.py):

* tren      — periode ini vs periode sebelumnya, kemiringan garis tren di dalam periode (linear dan
              Theil–Sen yang tahan satu hari aneh), dan uji beda terhadap kebiasaan anak 8 minggu
              terakhir (Welch + Mann–Whitney + besaran efek Hedges g);
* anomali   — hari yang menyimpang ≥ 1,8 sebaran dari kebiasaan anak sendiri, dihitung pada median ±
              MAD sehingga satu hari buruk tidak menggeser "kebiasaan"; peringatan dini bila 3 hari
              terakhir berturut-turut di bawah batas;
* titik ubah — CUSUM mencari hari ketika tingkat catatan benar-benar berpindah ("sejak tanggal ini"),
              dan mengabaikannya bila sisi baru ternyata berbalik lagi;
* pola      — hari dalam minggu yang konsisten lebih rendah, keterkaitan antar catatan (Pearson pada
              angka, Cohen kappa pada keterangan ya/tidak), variasi menu per kelompok gizi, geseran
              jam datang, dan posisi anak dibanding teman-teman (persentil, bukan hanya rata-rata);
* positif   — rentetan hari baik dan kehadiran penuh.

Selain itu ada skor pantauan 0–100: jumlah tertimbang dari sinyal yang benar-benar menyala hari
ini (mood, makan, tidur, suhu, kejadian, kehadiran). Komponennya selalu ditampilkan supaya angkanya
bisa ditelusuri; bukan diagnosis.

Setiap insight menyimpan bukti angkanya dan tingkat keyakinan (jumlah data & besar efek).
"""
from __future__ import annotations

from collections import Counter
from datetime import UTC, date, datetime, timedelta
from statistics import mean, pstdev
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from .labels import (
    ACTIVITY_LABEL,
    AREA_LABEL,
    FOOD_SLOT_LABEL,
    FOOD_SLOT_ORDER,
    fmt_duration,
    menu_groups,
    mood_from_score,
)
from .logic import TZ
from .models import Child, LogEntry, Setting
from .stats import (
    baseline,
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
)

# Nama rekomendasi → bobot pembelajaran dari penilaian admin (lihat cat_reco_feedback).
RECO_WEIGHTS_KEY = "ai_reco_feedback"

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


def _peer_position(pr: dict[str, float] | None, child_short: str) -> str:
    """Posisi relatif di antara pembanding anonim — tanpa menyebut 0 % / 100 % yang kedengarannya absolut."""
    if pr is None:
        return "."
    pct = pr["pct"]
    if pct >= 99.5:
        return f" — {child_short} lebih tinggi dari semua anak lain di rentang itu."
    if pct <= 0.5:
        return f" — {child_short} lebih rendah dari semua anak lain di rentang itu."
    return f" — {child_short} berada di atas {round(pct)}% anak lain di rentang itu."


def d2(x: float) -> str:
    return f"{x:.2f}".rstrip("0").rstrip(".") if abs(x - round(x, 2)) > 1e-9 else f"{x:.2f}".rstrip("0").rstrip(".")


def hg_text(g: float) -> str:
    """Besaran efek Hedges g dalam kata, memakai ambang Cohen (0,2 / 0,5 / 0,8)."""
    a = abs(g)
    which = "kecil" if a < 0.5 else "sedang" if a < 0.8 else "besar"
    return f"{which} ({'naik' if g > 0 else 'turun'})"


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
            "incidentSev": [],
            "incidentPm": 0,
            "checkinMin": None,
            "meds": [],
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
            mm = datetime.strptime(e.at, FMT).replace(tzinfo=UTC).astimezone(TZ).minute
            row["checkin"] = f"{hour:02d}:{mm:02d}"
            row["checkinMin"] = hour * 60 + mm
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
            row["incidentSev"].append(str(e.sev or "low"))
            if hour >= 12:
                row["incidentPm"] = row.get("incidentPm", 0) + 1
        elif e.type == "med":
            row["meds"].append(str(p.get("med") or e.title or "").strip())
        elif e.type == "note" and e.text:
            row["notes"].append({"at": e.at, "by": e.by_name, "text": e.text})
    out = []
    for row in days.values():
        m = _avg(row["moods"])
        label, emoji = mood_from_score(m)
        meal_scores = list(row["meals"].values())
        row["menuGroups"] = sorted(menu_groups(row.get("menu") or []))
        row["incidentSev"] = [x for x in row.get("incidentSev") or [] if x in ("medium", "high")]
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
    # variasi menu per kelompok gizi: berapa HARI yang memuatnya, dan berapa jenis berbeda
    group_days: dict[str, int] = {}
    distinct: set[str] = set()
    for r in rows:
        distinct.update(str(m).lower() for m in r.get("menu") or [])
        for g in r.get("menuGroups") or []:
            group_days[g] = group_days.get(g, 0) + 1
    # hari sekolah yang SUDAH lewat saja (tanpa menghitung hari ini yang belum selesai)
    lewat = [r for r in school if upto is None or date.fromisoformat(r["date"]) < upto]
    arrivals = [float(r["checkinMin"]) for r in school if r.get("checkinMin")]
    incident_days = [r for r in rows if r["incidents"]]
    med_days = [r for r in rows if r.get("meds")]
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
        "incidentDays": len(incident_days),
        "incidentSevDays": len([r for r in incident_days if r.get("incidentSev")]),
        "incidentAfternoon": sum(r.get("incidentPm") or 0 for r in rows),
        "medNotes": sum(len(r.get("meds") or []) for r in med_days),
        "menuGroups": group_days,
        "menuDistinct": len(distinct),
        "absentDays": len([r for r in lewat if not r["present"]]),
        "arriveAvg": round(mean(arrivals)) if arrivals else None,
        "arriveLateDays": len([m for m in arrivals if m >= 9 * 60]),
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
    absent = cur.get("absentDays", max(0, cur["schoolDays"] - cur["presentDays"]))
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
    """Kebiasaan anak dari hari-hari hadir sebelum periode ini (maks. 8 minggu).

    Pusat = median, sebaran = 1,4826 × MAD. Rata-rata dan simpangan baku tetap dihitung (dipakai uji
    Welch dan kalimat pembanding), tetapi penyimpangan dibandingkan ke median: satu minggu buruk tidak
    boleh membuat minggu berikutnya terlihat "normal".
    """
    days = _present_school(hist_rows)
    moods = [float(r["mood"]) for r in days if r["mood"] is not None]
    sleeps = [float(r["sleepMinutes"]) for r in days if r["sleepMinutes"] > 0]
    meals = [float(r["mealAvg"]) for r in days if r["mealAvg"] is not None]
    acts = [float(r["activities"]) for r in days if r["activities"] > 0]
    arrivals = [float(r["checkinMin"]) for r in days if r.get("checkinMin")]

    def pack(b: dict[str, float] | None, digits: int) -> dict[str, float] | None:
        if b is None:
            return None
        return {
            "n": int(b["n"]),
            "center": round(b["center"], digits),
            "scale": round(b["scale"], digits),
            "mean": round(b["mean"], digits),
            "sd": round(b["sd"], digits),
        }

    return {
        "days": len(days),
        "from": days[0]["date"] if days else None,
        "to": days[-1]["date"] if days else None,
        "mood": pack(robust_baseline(moods), 2),
        "sleep": pack(robust_baseline(sleeps), 0),
        "meal": pack(robust_baseline(meals), 0),
        "activities": pack(robust_baseline(acts), 1),
        "arrive": pack(robust_baseline(arrivals), 0),
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
            z = robust_z(float(v), b, floor_sd)
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
                    f"{fmt_date_id(date.fromisoformat(r['date']))}: {nice.lower()} {child_short} {fmt(v)}, sedangkan kebiasaannya {fmt(b['center'])} ± {fmt(b['scale']) if key != 'mood' else d1(b['scale'])} (median {b['n']} hari sebelumnya).",
                    f"{fmt(v)} vs kebiasaan {fmt(b['center'])} · z = {sd1(z)} · {b['n']} hari",
                    delta=round(v - b["center"], 2),
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
        ref = base.get(raw_key) or []
        t = welch_t(cur_vals, ref)
        if t is None or abs(t["t"]) < 2.0 or abs(t["diff"]) < min_diff:
            continue
        down = t["diff"] < 0
        # diperkuat uji peringkat (tidak mengasumsikan bentuk sebaran) + besaran efek
        mw = mann_whitney(cur_vals, ref)
        g = hedges_g(cur_vals, ref)
        bukti = f"{fmt(mean(cur_vals))} vs kebiasaan {fmt(mean(ref))} · t = {d1(abs(t['t']))} · {int(t['na'])}+{int(t['nb'])} hari"
        kalimat = "Perbedaannya cukup besar untuk tidak dianggap kebetulan."
        if mw and mw["p"] <= 0.05:
            bukti += f" · p = {round(mw['p'], 3)}"
            kalimat = f"Perbedaan ini tetap tampak pada uji peringkat (p = {round(mw['p'], 3)}), jadi bukan gara-gara satu hari ekstrem."
        if g is not None:
            bukti += f" · efek {hg_text(g['g'])}"
            kalimat += f" Besarnya perubahan {hg_text(g['g'])} (g = {d2(g['g'])})."
        out.append(
            _ins(
                "trend",
                area,
                f"{nice} {period_label} {'lebih rendah' if down else 'lebih tinggi'} dari kebiasaan {child_short}",
                f"Rata-rata {nice.lower()} {fmt(mean(cur_vals))} pada {len(cur_vals)} hari hadir {period_label}, dibanding kebiasaan {fmt(mean(ref))} dari {int(t['nb'])} hari sebelumnya. {kalimat}",
                bukti,
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
                    f"{nice} {child_short} {fmt(float(mine))} {period_label}, sedangkan rata-rata {st['n']} anak lain di daycare {fmt(st['mean'])}"
                    + (_peer_position(pr, child_short) if (pr := percentile_rank(float(mine), (peers.get("values") or {}).get(key) or [])) and len((peers.get("values") or {}).get(key) or []) >= 5 else ".")
                    + " Setiap anak berbeda; angka ini hanya pembanding, bukan penilaian.",
                    f"{fmt(float(mine))} vs {fmt(st['mean'])} ({st['n']} anak)",
                    delta=round(diff, 2),
                    sev="low" if better else "medium",
                    confidence=_conf(st["n"], abs(diff) / max(st["sd"], 1e-6), 5, 1.5),
                )
            )
    return out


# ------------------------------------------------------------------ insight lanjutan ----


def _clock(minutes: float) -> str:
    """Menit sejak tengah malam → jam dinding 24 jam (bukan durasi)."""
    m = max(0, int(round(minutes))) % 1440
    return f"{m // 60:02d}.{m % 60:02d}"


def _series(days: list[dict[str, Any]], getter) -> list[tuple[str, float]]:
    out: list[tuple[str, float]] = []
    for r in days:
        v = getter(r)
        if v is not None:
            out.append((str(r["date"]), float(v)))
    return out


def _changepoint_insights(child_short: str, hist_days: list[dict[str, Any]], cur_days: list[dict[str, Any]], period_label: str) -> list[dict[str, Any]]:
    """Titik ketika tingkat catatan benar-benar berpindah (CUSUM pada deret harian).

    Deretnya gabungan riwayat + periode ini supaya "sejak tanggal X" punya dasar yang lebih panjang
    dari satu minggu. Hanya dilaporkan bila perpindahan ≥ 0,8 sebaran kebiasaan dan sisi barunya
    bertahan (cek ada di stats.changepoint).
    """
    out: list[dict[str, Any]] = []
    series = (
        ("mood", "Mood", lambda r: r["mood"], lambda v: f"{d1(v)}/5", "mood"),
        ("sleep", "Tidur siang", lambda r: r["sleepMinutes"] if r["sleepMinutes"] > 0 else None, fmt_duration, "tidur"),
        ("meal", "Porsi makan", lambda r: r["mealAvg"], lambda v: f"{round(v)}%", "makan"),
    )
    all_days = _present_school(hist_days) + cur_days
    for _key, nice, getter, fmt, area in series:
        pts = _series(all_days, getter)
        if len(pts) < 12:
            continue
        cp = changepoint([v for _, v in pts])
        if cp is None:
            continue
        at = int(cp["at"])
        if at <= 0 or at >= len(pts):
            continue
        when = date.fromisoformat(pts[at][0])
        before = [v for _, v in pts[:at]]
        after = [v for _, v in pts[at:]]
        if len(after) < 3 or len(before) < 6:
            continue  # belum cukup hari di salah satu sisi untuk menyebutnya perpindahan
        # hanya perpindahan yang masih "baru": jangan menampilkan tanggal berbulan-bulan lalu
        # di dasbor minggu ini (membingungkan dan tidak bisa ditindaklanjuti)
        if (date.fromisoformat(pts[-1][0]) - when).days > 21:
            continue
        gap = cp["gap"]
        i = _ins(
            "trend",
            area,
            f"{nice} {'lebih rendah' if gap < 0 else 'lebih tinggi'} sejak {fmt_date_id(when)}",
            f"Sejak {when.day:02d}/{when.month:02d}, rata-rata {nice.lower()} {child_short} {fmt(mean(after))} pada {len(after)} hari, sebelumnya {fmt(mean(before))} pada {len(before)} hari. Pergeserannya lebih besar daripada naik-turun hariannya.",
            f"{fmt(mean(before))} → {fmt(mean(after))} sejak {pts[at][0][8:10]}/{pts[at][0][5:7]} · {len(pts)} hari",
            delta=round(gap, 2),
            sev="medium" if gap < 0 else "low",
            confidence=_conf(len(after), abs(gap), 6, 1.2),
        )
        # dipakai build_insights untuk menempelkan tanggal ubah ke kartu tren yang sudah ada
        i["_cp"] = {
            "when": when.isoformat(),
            "label": fmt_date_id(when),
            "sebelum": fmt(mean(before)),
            "sesudah": fmt(mean(after)),
            "hari": len(after),
            "area": area,
            "down": gap < 0,
        }
        out.append(i)
    return out


def _variety_insights(child_short: str, cur: dict[str, Any], prev: dict[str, Any], period_label: str) -> list[dict[str, Any]]:
    """Kelompok gizi yang jarang muncul di menu, dan variasi menu keseluruhan."""
    out: list[dict[str, Any]] = []
    school = max(1, cur["schoolDays"])
    groups = cur["menuGroups"] or {}
    if cur["schoolDays"] >= 3 and groups:
        for key, need in (("sayur", 0.8), ("protein", 0.8), ("karbo", 0.6)):
            have = groups.get(key, 0)
            share = have / school
            if share >= need:
                continue
            label = {"sayur": "Sayur", "protein": "Lauk protein", "karbo": "Makanan pokok"}[key]
            was = prev["menuGroups"].get(key, 0)
            out.append(
                _ins(
                    "pattern",
                    "makan",
                    f"{label} tercatat pada {have} dari {school} hari",
                    f"{label} tercatat di menu {child_short} pada {round(share * 100)}% hari sekolah {period_label}, sedangkan yang diharapkan minimal {round(need * 100)}%. Pada {('minggu lalu' if period_label == 'minggu ini' else 'periode sebelumnya')} {was} hari. Kelompok gizi ini bisa datang dari bekal atau menu dapur yang belum tercatat di aplikasi.",
                    f"{have}/{school} hari ada {label.lower()}",
                    sev="medium" if share < need / 2 else "low",
                    confidence="tinggi" if school >= 5 else "sedang",
                )
            )
    if cur["menuDistinct"] and cur["schoolDays"] >= 5:
        per_day = cur["menuDistinct"] / cur["schoolDays"]
        if per_day < 0.6:
            out.append(
                _ins(
                    "pattern",
                    "makan",
                    "Menu yang dicatat sangat sedikit variasinya",
                    f"Sepanjang {period_label.lower()} hanya {cur['menuDistinct']} nama menu berbeda yang tercatat untuk {child_short} ({cur['schoolDays']} hari sekolah). Bila menunya sebenarnya bervariasi, nama menunya perlu dilengkapi di catatan makan.",
                    f"{cur['menuDistinct']} menu berbeda / {cur['schoolDays']} hari",
                    sev="low",
                    confidence="sedang",
                )
            )
    return out


def _arrival_insights(child_short: str, cur_days: list[dict[str, Any]], base: dict[str, Any] | None, period_label: str) -> list[dict[str, Any]]:
    """Geseran jam datang — pola yang biasanya berkaitan dengan ritme pagi di rumah."""
    pts = _series(cur_days, lambda r: r.get("checkinMin"))
    if len(pts) < 6:  # theilsen butuh 6 titik agar kemiringan median punya arti
        return []
    ys = [v for _, v in pts]
    th = theilsen(ys)
    if th is None or abs(th["rho"]) < 0.55:
        return []
    total = th["slope"] * (len(ys) - 1)
    if abs(total) < 18:  # kurang dari ~18 menit pergeseran: bukan pola, hanya hari yang berbeda-beda
        return []
    later = total > 0
    kebiasaan = _clock(base["arrive"]["center"]) if base and base.get("arrive") else None
    return [
        _ins(
            "trend",
            "kehadiran",
            f"Jam datang {'mulai lebih siang' if later else 'mulai lebih awal'}",
            f"Dari {_clock(ys[0])} menjadi {_clock(ys[-1])} dalam {len(ys)} hari {period_label} — bergeser {round(abs(total))} menit {'ke arah lebih siang' if later else 'ke arah lebih awal'}. Kebiasaan {child_short} sebelumnya masuk sekitar {kebiasaan}."
            if kebiasaan
            else f"Dari {_clock(ys[0])} menjadi {_clock(ys[-1])} dalam {len(ys)} hari {period_label} — bergeser {round(abs(total))} menit {'ke arah lebih siang' if later else 'ke arah lebih awal'}.",
            f"{_clock(ys[0])} → {_clock(ys[-1])} · {round(abs(total))} menit"
            + (f" · {late} hari datang setelah 09.00" if (late := len([m for m in ys if m >= 540])) else ""),
            delta=round(total / 60, 2),
            sev="low",
            confidence=_conf(len(ys), abs(th["rho"]), 8, 0.75),
        )
    ]


def _incident_insights(child_short: str, cur_rows: list[dict[str, Any]], cur: dict[str, Any], prev: dict[str, Any], period_label: str) -> list[dict[str, Any]]:
    """Kejadian: jumlah, berat ringannya, dan apakah menumpuk pada satu waktu."""
    out: list[dict[str, Any]] = []
    if cur["incidents"] == 0:
        if prev["incidents"] >= 2:
            out.append(
                _ins(
                    "positive",
                    "kesehatan",
                    "Tidak ada kejadian tercatat",
                    f"{child_short} melewati {period_label} tanpa insiden, setelah {prev['incidents']} pada periode sebelumnya.",
                    f"0 dari {prev['incidents']} kejadian",
                )
            )
        return out
    days = [r for r in cur_rows if r["incidents"]]
    if cur["incidentSevDays"]:
        out.append(
            _ins(
                "anomaly",
                "kesehatan",
                f"{cur['incidentSevDays']} hari dengan kejadian yang perlu ditindaklanjuti",
                f"Kejadian pada {child_short} {period_label} ada {cur['incidents']} kali dan {cur['incidentSevDays']} di antaranya ditandai perlu perhatian. Rinciannya ada di catatan kejadian.",
                f"{cur['incidents']} kejadian, {cur['incidentSevDays']} hari berat",
                sev="high",
                confidence="tinggi",
            )
        )
    if cur["incidents"] >= 3 and cur["incidentAfternoon"] / cur["incidents"] >= 0.66:
        out.append(
            _ins(
                "pattern",
                "kesehatan",
                "Kejadian lebih sering terjadi setelah makan siang",
                f"{cur['incidentAfternoon']} dari {cur['incidents']} kejadian {period_label} tercatat setelah tengah hari. Biasanya berkaitan dengan puncak kelelahan; worth menjadwalkan waktu tenang lebih awal.",
                f"{cur['incidentAfternoon']}/{cur['incidents']} kejadian siang–sore",
                sev="medium",
                confidence="sedang",
            )
        )
    if len(days) >= 3 and cur["incidents"] >= prev["incidents"] * 1.5 and cur["incidents"] - prev["incidents"] >= 2:
        out.append(
            _ins(
                "trend",
                "kesehatan",
                f"Kejadian meningkat ({prev['incidents']} → {cur['incidents']})",
                f"Jumlah catatan kejadian {child_short} naik dibanding {('minggu lalu' if period_label == 'minggu ini' else 'periode sebelumnya')}; tercatat pada {len(days)} hari berbeda.",
                f"{prev['incidents']} → {cur['incidents']} kejadian",
                delta=cur["incidents"] - prev["incidents"],
                sev="medium",
            )
        )
    return out


def _watch(cur_rows: list[dict[str, Any]], cur: dict[str, Any], base: dict[str, Any] | None) -> dict[str, Any]:
    """Skor pantauan 0–100 dari sinyal yang benar-benar menyala; komponennya selalu ikut ditampilkan.

    Ini bukan diagnosis dan tidak menampilkan angka tanpa dasar: tiap komponen menyebut aturannya.
    Hari yang sedang berjalan tidak dihitung sebagai absen (`absentDays` hanya melihat hari sekolah
    yang sudah lewat) supaya orang tua tidak dihukum karena anaknya belum tercatat datang.
    """
    comp: list[dict[str, Any]] = []
    recent = [r for r in cur_rows if r["present"]][-3:]

    def add(key: str, label: str, points: int, detail: str) -> None:
        comp.append({"key": key, "label": label, "points": points, "detail": detail})

    if recent and all(r["mood"] is not None and r["mood"] < 3 for r in recent):
        add("mood", "Mood rendah 3 hari terakhir", 26, " · ".join(f"{DAY_SHORT[r['weekday']]} {d1(r['mood'])}" for r in recent))
    elif cur["moodAvg"] is not None and cur["moodAvg"] < 3:
        add("mood", f"Mood rata-rata di bawah netral ({d1(cur['moodAvg'])}/5)", 12, f"rata-rata {d1(cur['moodAvg'])}/5")
    if recent and all(r["mealAvg"] is not None and r["mealAvg"] < 50 for r in recent):
        add("makan", "Porsi di bawah setengah 3 hari terakhir", 24, " · ".join(f"{DAY_SHORT[r['weekday']]} {round(r['mealAvg'])}%" for r in recent))
    if base and base.get("sleep") and cur["sleepAvg"]:
        z = robust_z(float(cur["sleepAvg"]), base["sleep"], 15.0)
        if z is not None and z <= -1.2:
            add("tidur", f"Tidur siang {sd1(z)} sebaran di bawah kebiasaan", 14, f"{fmt_duration(cur['sleepAvg'])} vs {fmt_duration(round(base['sleep']['center']))}")
    if cur["feverDays"]:
        add("suhu", f"Suhu ≥ 37,5 °C pada {cur['feverDays']} hari", 22, f"{cur['feverDays']} hari")
    if cur["incidentSevDays"]:
        add("kejadian", f"{cur['incidentSevDays']} hari dengan kejadian berat", 18, f"{cur['incidents']} kejadian total")
    absent = cur.get("absentDays", max(0, cur["schoolDays"] - cur["presentDays"]))
    if absent >= 2:
        add("hadir", f"Tidak hadir {absent} hari", 10, f"{cur['presentDays']}/{cur['schoolDays']} hari sekolah")
    score = min(100, sum(c["points"] for c in comp))
    level = "perlu dipantau" if score >= 55 else "wajar" if score >= 25 else "tenang"
    return {"score": score, "level": level, "components": comp, "note": "Bukan diagnosis — hanya rangkuman sinyal dari catatan pengasuh."}


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
        # perubahan tingkat & geseran ritme pagi hanya bila ada kebiasaan untuk dibandingkan
        # titik ubah menempel ke kartu tren sebidang bila menyatakan arah yang sama (satu kartu, bukan dua)
        for c in _changepoint_insights(child_short, hist_rows or [], cur_rows, period_label):
            meta = c.pop("_cp")
            twin = next(
                (b for b in out if b["kind"] == "trend" and b["area"] == meta["area"] and b.get("delta") is not None and (b["delta"] < 0) == meta["down"]),
                None,
            )
            if twin is not None:
                twin["text"] += f" Perubahan mulai tampak sejak {meta['label']}: dari {meta['sebelum']} menjadi {meta['sesudah']} pada {meta['hari']} hari terakhir."
                twin["evidence"] += f" · titik ubah {meta['when'][8:10]}/{meta['when'][5:7]}"
                if twin["confidence"] != "tinggi":
                    twin["confidence"] = "sedang" if meta["hari"] >= 5 else twin["confidence"]
            else:
                out.append(c)
        out += _arrival_insights(child_short, cur_rows, base, period_label)
    out += _incident_insights(child_short, cur_rows, cur, prev, period_label)
    out += _variety_insights(child_short, cur, prev, period_label)
    # judul yang benar-benar sama tidak boleh muncul dua kali; kartu mirip dengan bukti berbeda dibiarkan
    uniq: dict[tuple[str, str, str], dict[str, Any]] = {}
    for i in out:
        key = (i["kind"], i["area"], " ".join(i["title"].lower().split())[:60])
        if key not in uniq or SEV_ORDER.get(i["sev"], 2) < SEV_ORDER.get(uniq[key]["sev"], 2):
            uniq[key] = i
    out = list(uniq.values())
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
    # nilai tiap anak dipakai untuk posisi persentil; yang dikirim ke klien tetap agregat saja
    return {"n": n, "stats": stats, "values": vals}


# ------------------------------------------------------------------ rekomendasi ----


# Dampak (0–3) dan usaha (1–3) tiap jenis saran — dipakai untuk mengurutkan: yang berdampak besar
# dengan usaha kecil didahulukan. Angkanya aturan produk, bukan hasil belajar mesin.
RECO_IMPACT: dict[str, tuple[int, int]] = {
    "dini": (3, 1),
    "hari": (2, 2),
    "tidur-mood": (3, 1),
    "tidur": (2, 1),
    "makan": (2, 2),
    "makan-mood": (2, 1),
    "mood": (3, 2),
    "mood-sore": (2, 1),
    "tidur-lebih": (2, 1),
    "aktif": (1, 1),
    "motorik": (1, 2),
    "kognitif": (1, 1),
    "sosial-up": (1, 1),
    "hadir": (2, 2),
    "datang": (2, 2),
    "kejadian": (3, 2),
    "sehat": (3, 1),
    "stabil": (1, 0),
}
IMPACT_LABEL = {3: "dampak besar", 2: "dampak sedang", 1: "dampak kecil"}
EFFORT_LABEL = {0: "tanpa usaha baru", 1: "usaha kecil", 2: "usaha sedang", 3: "usaha besar"}
CONF_ORDER = {"rendah": 1, "sedang": 2, "tinggi": 3}


def _reco_tally(db: Session) -> dict[str, dict[str, Any]]:
    row = db.get(Setting, RECO_WEIGHTS_KEY)
    raw = row.value if row is not None else None
    return {k: dict(v) for k, v in raw.items() if isinstance(v, dict)} if isinstance(raw, dict) else {}


def reco_weights(db: Session) -> dict[str, float]:
    """Pengali urutan rekomendasi dari tombol 👍/👎 admin (disimpan di Settings, ikut dicadangkan)."""
    out: dict[str, float] = {}
    for key, v in _reco_tally(db).items():
        delta = int(v.get("up", 0)) - int(v.get("down", 0))
        out[key] = min(1.3, max(0.7, 1 + 0.06 * delta))
    return out


def cat_reco_feedback(db: Session, key: str, vote: str) -> dict[str, Any]:
    """Catat satu penilaian admin atas satu rekomendasi lalu simpan. Nilai tersimpan = tally mentah."""
    if key not in RECO_IMPACT:
        return {"ok": False, "error": f"Jenis saran {key} tidak dikenal."}
    if vote not in ("up", "down"):
        return {"ok": False, "error": "Penilaian harus 'up' atau 'down'."}
    row = db.get(Setting, RECO_WEIGHTS_KEY)
    tally = _reco_tally(db)
    cur = tally.get(key) or {"up": 0, "down": 0}
    cur[vote] = int(cur.get(vote, 0)) + 1
    cur["last"] = datetime.now(UTC).strftime(FMT)
    tally[key] = cur
    value = {k: tally[k] for k in sorted(tally)}
    if row is None:
        db.add(Setting(key=RECO_WEIGHTS_KEY, value=value))
    else:
        row.value = value
    db.commit()  # nilai disimpan apa adanya sebagai JSON, bukan string
    return {"ok": True, "key": key, "tally": cur, "multiplier": round(min(1.3, max(0.7, 1 + 0.06 * (cur["up"] - cur["down"]))), 3)}


def build_recommendations(
    child_short: str,
    insights: list[dict[str, Any]],
    cur: dict[str, Any],
    weights: dict[str, float] | None = None,
    audience: str = "staff",
) -> list[dict[str, Any]]:
    """Saran yang diturunkan dari insight; diurutkan dengan dampak × keyakinan × bobot umpan balik.
    Tersinkronisasi cerdas menurut audiens:
    - Pengasuh (S1 Psikologi/Kesehatan): Analisis observasional, stimulasi perkembangan, penyesuaian SOP, dan regulasi sensori.
    - Orang Tua: Rekomendasi hangat pendampingan di rumah (nutrisi, ritme sirkadian, stimulasi bermain keluarga).
    - Admin: Pemantauan mutu layanan, kepatuhan operasional, dan kolaborasi keluarga.
    """
    weights = weights or {}
    recs: list[dict[str, Any]] = []
    seen: set[str] = set()

    def add(
        key: str,
        title: str,
        text: str,
        why: str,
        src: dict[str, Any] | None = None,
        parent_title: str | None = None,
        parent_text: str | None = None,
        caregiver_title: str | None = None,
        caregiver_text: str | None = None,
        clinical_note: str | None = None,
    ) -> None:
        if key in seen:
            return
        seen.add(key)
        impact, effort = RECO_IMPACT.get(key, (1, 1))
        sev = {"high": 3, "medium": 2, "low": 1}.get(str((src or {}).get("sev", "low")), 1)
        conf = CONF_ORDER.get(str((src or {}).get("confidence", "sedang")), 2)
        w = float(weights.get(key, 1.0))
        score = round(impact * 10 * (sev / 3) * (conf / 3) * w, 1)

        # Sesuaikan narasi menurut audiens jika diminta spesifik (orang tua mendapatkan redaksi ramah keluarga)
        display_title = title
        display_text = text
        if audience == "parent":
            display_title = parent_title or title
            display_text = parent_text or text

        recs.append(
            {
                "id": key,
                "title": display_title,
                "text": display_text,
                "why": why,
                "area": (src or {}).get("area"),
                "impact": impact,
                "impactLabel": IMPACT_LABEL.get(impact, "dampak kecil"),
                "effort": effort,
                "effortLabel": EFFORT_LABEL.get(effort, "usaha kecil"),
                "score": score,
                "weight": round(w, 3),
                "parentTitle": parent_title or title,
                "parentText": parent_text or text,
                "caregiverTitle": caregiver_title or title,
                "caregiverText": caregiver_text or text,
                "clinicalNote": clinical_note or "Berbasis pedoman tumbuh kembang Kemenkes & IDAI.",
            }
        )

    top_kind = max(cur["byKind"].items(), key=lambda kv: kv[1])[0] if cur["byKind"] else None
    top_label = ACTIVITY_LABEL.get(top_kind or "", "kegiatan favoritnya").lower()
    for i in insights:
        a, k, t = i["area"], i["kind"], i["title"]
        tl = t.lower()
        if tl.startswith("peringatan dini"):
            add(
                "dini",
                "Hubungi orang tua hari ini",
                f"Sampaikan catatan pantauan terakhir apa adanya, tanyakan perubahan di rumah (tidur malam, hidrasi, kejadian), dan sepakati pemantauan bersama untuk {child_short} minggu ini.",
                t,
                parent_title="Konsultasi hangat dengan tim pengasuh",
                parent_text=f"Bunda & Ayah, tim pengasuh mendapati sedikit perubahan ritme harian {child_short}. Disarankan menjaga jam istirahat malam yang teratur di rumah dan mengabari kami bila ada keluhan.",
                caregiver_title=f"Asesmen observasional komprehensif {child_short}",
                caregiver_text=f"Lakukan evaluasi tanda vital non-invasif dan observasi perilaku adaptif. Hubungi orang tua dengan empati untuk sinkronisasi pola asuh rumah-daycare.",
                clinical_note="Standar skrining deviasi perilaku Kemenkes RI & AAP (American Academy of Pediatrics).",
            )
        elif k == "pattern" and "biasanya lebih rendah pada hari" in tl:
            hari = t.rsplit("hari ", 1)[-1]
            add(
                "hari",
                f"Siapkan transisi khusus hari {hari}",
                f"Sambut {child_short} lebih awal, mulai dengan {top_label}, dan beri 15 menit adaptasi sebelum kegiatan kelompok pada hari {hari}.",
                t,
                parent_title=f"Persiapan santai menyambut hari {hari}",
                parent_text=f"Pada hari {hari}, luangkan waktu 10-15 menit lebih santai saat mengantar {child_short} agar proses transisi dari rumah ke daycare terasa menyenangkan.",
                caregiver_title=f"Protokol transisi emosional bertahap (Hari {hari})",
                caregiver_text=f"Terapkan pendekatan psikologis 'warm handoff': dampingi 1-on-1 dengan media {top_label} sebelum anak diintegrasikan ke dinamika kelompok besar.",
                clinical_note="Prinsip Attachment Theory (Bowlby) & regulasi transisi sosio-emosional anak usia dini.",
            )
        elif k == "pattern" and "tidur siang lebih lama berkaitan" in tl:
            add(
                "tidur-mood",
                "Prioritaskan tidur siang yang cukup",
                "Catatan menunjukkan mood sore mengikuti lama tidur siang; jaga jam mulai tidur konsisten (± 12.30) dan hindari kegiatan ramai menjelang tidur.",
                t,
                parent_title="Jaga suasana tenang sebelum istirahat malam",
                parent_text=f"Tidur siang {child_short} sangat berpengaruh pada keceriaannya. Di rumah, redupkan lampu 30 menit sebelum tidur malam dan putar musik lembut.",
                caregiver_title="Optimalisasi ritme sirkadian & regulasi sensori tidur",
                caregiver_text=f"Persiapkan 'wind-down routine' 15 menit sebelum jam tidur (± 12.30): pencahayaan temaram, aromaterapi lembut, dan dongeng pengantar tidur.",
                clinical_note="Pedoman National Sleep Foundation & Kemenkes RI untuk pemulihan kognitif balita.",
            )
        elif k == "pattern" and "rata-rata anak lain" in tl and i["sev"] == "medium":
            if a == "tidur":
                add(
                    "tidur",
                    "Jaga jadwal tidur siang konsisten",
                    "Mulai tidur siang pada jam yang sama (± 12.30–13.00), redupkan ruangan, hindari kegiatan ramai 15 menit sebelumnya.",
                    t,
                    parent_title="Pertahankan jam tidur malam yang teratur",
                    parent_text=f"Membiasakan jam tidur yang konsisten setiap malam membantu {child_short} bangun segar dan siap beraktivitas aktif esok hari.",
                    caregiver_title="Standarisasi higiene tidur & monitoring fase REM",
                    caregiver_text="Pastikan suhu ruang tidur stabil 24-25°C dan ventilasi udara terjaga untuk memfasilitasi kualitas tidur dalam (deep sleep).",
                    clinical_note="KPSP Kemenkes: Keteraturan pola istirahat menunjang sekresi Growth Hormone (GH).",
                )
            elif a == "makan":
                add(
                    "makan",
                    "Variasikan menu pada waktu makan yang sulit",
                    "Coba tekstur dan bentuk yang berbeda, ajak anak memilih di antara dua pilihan, dan beri waktu makan yang tenang.",
                    t,
                    parent_title="Eksplorasi rasa & bentuk makanan di rumah",
                    parent_text=f"Ajak {child_short} mencoba potongan buah segar berwarna cerah seperti mangga manis atau pepaya dalam porsi kecil yang menarik.",
                    caregiver_title="Pendekatan Responsive Feeding & desensitisasi tekstur",
                    caregiver_text="Terapkan teknik 'food pairing': pasangkan makanan yang kurang disukai dengan menu favoritnya tanpa paksaan untuk mencegah food neophobia.",
                    clinical_note="WHO Guideline on Complementary Feeding & IDAI: Responsive feeding melatih kemandirian makan.",
                )
            elif a == "mood":
                add(
                    "mood",
                    "Cek pemicu mood & tidur malam",
                    f"Tanyakan ke orang tua pola tidur malam dan kejadian di rumah; perbanyak {top_label} yang membuat {child_short} nyaman.",
                    t,
                    parent_title="Waktu berkualitas (Quality Time) bersama ananda",
                    parent_text=f"Beri pelukan hangat dan dengarkan cerita {child_short} sepulang daycare untuk memperkuat rasa aman dan kenyamanan emosionalnya.",
                    caregiver_title="Observasi regulasi afektif & stimulasi dopaminergik",
                    caregiver_text=f"Fasilitasi kegiatan ekspresi kreatif ({top_label}) dan berikan validasi emosi ketika anak mengalami frustrasi ringan.",
                    clinical_note="Pendekatan Co-Regulation Psikologi Perkembangan Anak.",
                )
            elif a == "aktivitas":
                add(
                    "aktif",
                    "Ajak ikut kegiatan yang disukai",
                    f"Mulai hari dengan {top_label}, lalu tawarkan kegiatan lain setelah anak nyaman.",
                    t,
                    parent_title="Dukungan eksplorasi hobi di rumah",
                    parent_text=f"{child_short} sangat menikmati {top_label}. Bunda & Ayah dapat memberikan ruang bebas bermain serupa di akhir pekan.",
                    caregiver_title="Scaffolding minat anak menuju kegiatan terarah",
                    caregiver_text=f"Manfaatkan antusiasme pada {top_label} sebagai pintu masuk untuk mengenalkan konsep kerjasama tim dan motorik terpadu.",
                    clinical_note="Metode Vygotsky: Zone of Proximal Development (ZPD) melalui media bermain.",
                )
        elif a == "aktivitas" and "motorik" in t.lower():
            add(
                "motorik",
                "Tambah aktivitas stimulasi motorik",
                "Sisipkan 20 menit bermain bola, rintangan bantal, atau lompat gembira di pagi hari, 3× seminggu.",
                i["title"],
                parent_title="Bermain aktif bersama keluarga di rumah",
                parent_text=f"Ajak {child_short} berjalan santai di taman, bermain lempar tangkap bola spons, atau menari gembira bersama di ruang tamu.",
                caregiver_title="Intervensi penguatan tonus otot & koordinasi bilateral",
                caregiver_text="Rancang sirkuit motorik terstruktur: melompat 2 kaki, meniti garis lurus, dan merangkak terarah untuk menstimulasi sistem proprioseptif.",
                clinical_note="Indikator Milestone Motorik Kasar & Halus Baku KPSP Kemenkes RI.",
            )
        elif a == "aktivitas" and ("belajar" in t.lower() or "membaca" in t.lower()) and k == "pattern":
            add(
                "kognitif",
                "Sisipkan stimulasi literasi & membaca bersama",
                "Bacakan buku cerita bergambar 10–15 menit setelah snack pagi; biarkan anak membalik halaman dan menunjuk gambar.",
                i["title"],
                parent_title="Mendongeng sebelum tidur (Bedtime Story)",
                parent_text=f"Bacakan satu buku cerita interaktif bergambar favorit {child_short} sebelum tidur malam untuk memperkaya kosakata bahasanya.",
                caregiver_title="Dialogic Reading & stimulasi bahasa reseptif-ekspresif",
                caregiver_text="Gunakan teknik bertanya terbuka (CROWD prompt) saat membaca buku bersama untuk merangsang penalaran kritis dan artikulasi verbal.",
                clinical_note="Panduan American Academy of Pediatrics (AAP) untuk literasi dini anak.",
            )
        elif a == "aktivitas" and "sosial" in t.lower() and (i["delta"] or 0) > 0:
            add(
                "sosial-up",
                "Pertahankan kegiatan kelompok kooperatif",
                "Jadwalkan permainan kelompok kecil (3–4 anak) 2–3× seminggu agar interaksi sosial dan kemampuan berbagi terus berkembang.",
                i["title"],
                parent_title="Dukungan sosialisasi & bermain bersama saudara/teman",
                parent_text=f"{child_short} menunjukkan perkembangan sosial yang sangat membanggakan di daycare! Dukung dengan mengajaknya berinteraksi santai bersama teman sebaya.",
                caregiver_title="Fasilitasi interaksi prososial & kecerdasan interpersonal",
                caregiver_text="Berikan apresiasi verbal saat anak menunjukkan perilaku berbagi (sharing) atau membantu teman, sebagai penguatan positif (positive reinforcement).",
                clinical_note="Milestone Perkembangan Sosial-Emosional Kemenkes & Teori Belajar Sosial Bandura.",
            )
        elif a == "aktivitas" and (i["delta"] or 0) < 0:
            add(
                "aktif",
                "Ajak ikut kegiatan yang disukai",
                f"Mulai hari dengan {top_label}, lalu tawarkan kegiatan lain setelah anak nyaman.",
                t,
                parent_title="Semangati ananda dengan kegiatan favoritnya",
                parent_text=f"Dukung semangat {child_short} dengan aktivitas santai yang ia gemari di rumah sebelum berangkat ke daycare.",
                caregiver_title="Pacing kegiatan & stimulasi energi positif anak",
                caregiver_text=f"Hindari kelelahan berlebih; selingi aktivitas dinamis dengan istirahat tenang (quiet time) dan kegiatan relaksasi sensori.",
                clinical_note="Regulasi beban kognitif dan kapasitas fisik balita.",
            )
        elif a == "mood" and k in ("anomaly", "trend") and (i["delta"] or -1) < 0:
            add(
                "mood",
                "Cek pemicu kenyamanan & stabilitas emosi",
                f"Tanyakan ke orang tua pola tidur malam dan kejadian di rumah; perbanyak {top_label} yang membuat {child_short} nyaman.",
                i["title"],
                parent_title="Ciptakan suasana santai & penuh kasih di rumah",
                parent_text=f"Beri perhatian ekstra dan pelukan hangat bila {child_short} tampak lebih sensitif atau lelah setelah beraktivitas seharian.",
                caregiver_title="Deteksi dini pemicu stres sensori & regulasi afek",
                caregiver_text="Observasi apakah ada kebisingan, suhu, atau perubahan jadwal mendadak yang memicu kelelahan emosional pada anak.",
                clinical_note="Konsep Regulasi Diri Sensori (Sensory Processing Framework - Winnie Dunn).",
            )
        elif a == "mood" and k == "pattern":
            add(
                "mood-sore",
                "Sesuaikan ritme transisi sore hari",
                "Beri jeda tenang 10 menit setelah bangun tidur siang dan snack sore bernutrisi sebelum kegiatan penjemputan.",
                i["title"],
                parent_title="Sambut ananda dengan senyuman hangat saat penjemputan",
                parent_text=f"Saat menjemput {child_short}, tanyakan harinya dengan antusias dan berikan jeda santai sebelum melanjutkan perjalanan pulang.",
                caregiver_title="Manajemen 'Late Afternoon Fatigue' pada balita",
                caregiver_text="Siapkan transisi sore yang menenangkan: musik instrumental, regangan tubuh ringan, dan minum air putih hangat menjelang kepulangan.",
                clinical_note="Manajemen kelelahan sirkadian sore hari pada anak usia dini.",
            )
        elif a == "tidur" and k == "anomaly" and "jauh di atas" in tl:
            add(
                "tidur-lebih",
                "Cek kondisi anak setelah tidur panjang",
                f"Tidur siang yang jauh lebih lama dari biasanya bisa berarti {child_short} lelah atau kurang sehat: pantau suhu saat bangun dan koordinasikan dengan orang tua.",
                i["title"],
                parent_title="Pantau kecukupan cairan & istirahat di rumah",
                parent_text=f"{child_short} tidur cukup lama siang ini. Pastikan ia minum cukup air putih dan makan malam bergizi seimbang di rumah.",
                caregiver_title="Skrining status hidrasi & suhu pasca-tidur panjang",
                caregiver_text="Lakukan pengukuran suhu tubuh termometer inframerah saat bangun dan periksa turgor kulit serta tanda keletihan fisik.",
                clinical_note="Protokol Triase Kesehatan Anak Kemenkes RI.",
            )
        elif a == "tidur" and k == "pattern" and "rata-rata anak lain" in tl:
            pass  # sudah ditangani di atas
        elif a == "tidur":
            add(
                "tidur",
                "Jaga jadwal tidur siang konsisten",
                "Mulai tidur siang pada jam yang sama (± 12.30–13.00), redupkan ruangan, hindari kegiatan ramai 15 menit sebelumnya.",
                i["title"],
                parent_title="Kondisikan kamar tidur nyaman & sejuk di rumah",
                parent_text=f"Jaga sirkulasi udara kamar tidur tetap segar agar tidur malam {child_short} nyenyak dan berkualitas.",
                caregiver_title="Protokol penataan ruang istirahat daycare",
                caregiver_text="Pastikan sensor kenyamanan udara (CO2 < 800 ppm, suhu 24-25°C) terjaga optimal selama anak tidur siang.",
                clinical_note="Standar Baku Mutu Kesehatan Lingkungan Ruang Anak Kemenkes RI.",
            )
        elif a == "makan" and "mood" in t.lower():
            add(
                "makan-mood",
                "Tawarkan makan dalam porsi kecil bertahap",
                "Sajikan porsi kecil lebih dulu lalu tambah bila habis; catat menu yang disukai untuk dibagikan ke orang tua.",
                i["title"],
                parent_title="Makan bersama keluarga tanpa distraksi gawai",
                parent_text=f"Temani {child_short} makan di meja makan bersama keluarga tanpa layar ponsel atau TV agar ia lebih menikmati makanannya.",
                caregiver_title="Pemberian makan responsif tanpa distraksi",
                caregiver_text="Ciptakan suasana makan interaktif dan menyenangkan. Beri pujian pada setiap suapan mandiri yang berhasil.",
                clinical_note="Pedoman Gizi Seimbang Anak Balita Kemenkes RI & WHO.",
            )
        elif a == "makan":
            add(
                "makan",
                "Variasikan menu pada waktu makan yang sulit",
                "Coba tekstur dan bentuk yang berbeda, ajak anak memilih di antara dua pilihan, dan beri waktu makan yang tenang.",
                i["title"],
                parent_title="Perkaya variasi buah dan kudapan sehat di rumah",
                parent_text=f"Sajikan camilan sehat seperti irisan buah segar (mangga, pepaya, pisang manis) atau puding buah buatan sendiri di rumah.",
                caregiver_title="Evaluasi asupan makronutrien & variasi kelompok makanan",
                caregiver_text="Gunakan pindaian kamera pintar untuk memantau proporsi protein, karbohidrat, dan serat yang dihabiskan anak secara presisi.",
                clinical_note="Pedoman Angka Kecukupan Gizi (AKG) Kemenkes RI.",
            )
        elif a == "kehadiran" and "Jam datang" in t:
            add(
                "datang",
                "Samakan jam datang secara konsisten",
                f"Ritme pagi {child_short} bergeser; sepakati jam datang yang sama selama seminggu dan lihat apakah mood paginya ikut membaik.",
                i["title"],
                parent_title="Bangun rutinitas pagi yang tenang & tidak terburu-buru",
                parent_text=f"Menyiapkan perlengkapan sejak malam hari membantu pagi hari lebih santai, sehingga {child_short} tiba di daycare dengan hati riang.",
                caregiver_title="Sinkronisasi jadwal kedatangan & 'Morning Circle'",
                caregiver_text="Sambut anak dengan sapaan hangat di pintu masuk untuk menanamkan rasa aman dan kesiapan mengikuti agenda harian.",
                clinical_note="Konsistensi jadwal sirkadian pagi terhadap kesiapan belajar anak.",
            )
        elif a == "kehadiran" and k == "pattern":
            add(
                "hadir",
                "Optimalisasi keteraturan jadwal kehadiran",
                "Konsistensi kehadiran membantu anak beradaptasi sosial lebih cepat dan mempererat ikatan dengan teman sebayanya.",
                i["title"],
                parent_title="Dukungan kehadiran teratur untuk kenyamanan ananda",
                parent_text=f"Kehadiran rutin membantu {child_short} merasa nyaman dengan teman dan pengasuh. Beritahu tim pengasuh jika ananda perlu beristirahat di rumah karena kurang fit.",
                caregiver_title="Monitoring adaptasi sosial & kontinuitas stimulasi",
                caregiver_text="Pantau apakah ketidakhadiran berkorelasi dengan pemulihan sakit atau adaptasi lingkungan baru; berikan sambutan istimewa saat anak kembali hadir.",
                clinical_note="Kontinuitas stimulasi perkembangan sosio-emosional balita (IDAI & UNICEF).",
            )
        elif a == "kesehatan" and "ejadian" in t:
            add(
                "kejadian",
                "Bahaskan satu pemicu kejadian bersama tim pengasuh",
                f"Pemicu kejadian pada {child_short} memperlihatkan pola yang sama; sepakati langkah mitigasi terarah minggu ini.",
                i["title"],
                parent_title="Komunikasi terbuka seputar kenyamanan anak",
                parent_text=f"Tim pengasuh siap mendiskusikan kebiasaan favorit {child_short} di rumah agar dapat diselaraskan dengan aktivitas di daycare.",
                caregiver_title="Analisis pemicu insiden (Antecedent-Behavior-Consequence)",
                caregiver_text="Lakukan pemetaan ABC saat transisi atau bermain bebas untuk memitigasi risiko insiden kecil secara proaktif.",
                clinical_note="Pedoman Keselamatan Fasilitas Penitipan Anak & K3 Anak Prasekolah.",
            )
        elif a == "kesehatan":
            add(
                "sehat",
                "Pantau suhu tubuh berkala & hidrasi",
                "Ukur suhu ulang tiap 30 menit saat hangat; segera komunikasikan bila suhu mencapai ambang pantau.",
                i["title"],
                parent_title="Pantau suhu tubuh & kecukupan cairan di rumah",
                parent_text=f"Pastikan {child_short} beristirahat cukup dan minum air putih yang banyak malam ini untuk menjaga daya tahan tubuhnya.",
                caregiver_title="Protokol observasi tanda vital & respon demam awal",
                caregiver_text="Gunakan termometer inframerah non-kontak dan catat riwayat suhu ke sistem secara berkala.",
                clinical_note="Pedoman Penanganan Demam pada Anak Balita Kemenkes RI & IDAI.",
            )
    if not recs:
        add(
            "stabil",
            "Lanjutkan pola pengasuhan positif yang sudah berjalan",
            f"Pola harian {child_short} sangat stabil dan positif pada periode ini. Pertahankan jadwal stimulasi dan catat hal baru yang disukainya.",
            "Tidak ada deviasi berarti dari periode sebelumnya",
            parent_title="Pertahankan suasana harmonis & rutinitas positif di rumah",
            parent_text=f"Perkembangan {child_short} berjalan sangat baik dan stabil! Lanjutkan kebiasaan penuh kasih dan interaksi menyenangkan di rumah.",
            caregiver_title="Pertahankan kualitas interaksi pengasuhan & stimulasi bertahap",
            caregiver_text=f"Seluruh parameter observasi {child_short} berada dalam rentang ideal. Terus fasilitasi milestone perkembangan berikutnya.",
            clinical_note="Validasi Milestone Perkembangan Sesuai Usia Kemenkes RI.",
        )
    # urutkan: skor tertinggi dulu; seri tetap mempertahankan urutan kemunculan insight
    recs.sort(key=lambda r: -r["score"])
    for n, r in enumerate(recs[:5]):
        r["rank"] = n + 1
    return recs[:5]


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


def analyze(db: Session, child: dict[str, Any], days: int = 7, end: date | None = None, audience: str = "staff") -> dict[str, Any]:
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
    recs = build_recommendations(child["short"], insights, cur, weights=reco_weights(db), audience=audience)
    profile = build_profile(cur, prev)
    watch = _watch(cur_rows, cur, base)
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
        "watch": watch,
        "profile": profile,
        "teacherNotes": notes,
        "baseline": {k: v for k, v in base.items() if not k.startswith("_")},
        "peers": {"n": peers["n"]},
        "method": (
            "Dihitung dari catatan pengasuh (aktivitas, makan, tidur, mood, kehadiran). Periode ini dibandingkan dengan periode "
            "sebelumnya yang sama panjang dan dengan kebiasaan anak sendiri hingga 8 minggu ke belakang (median ± sebaran tahanencil, "
            "dipakai juga uji t Welch, Mann–Whitney, dan besaran efek Hedges g). "
            "Anomali = hari yang menyimpang ≥ 1,8 simpangan dari kebiasaan; tren = perubahan ≥ 20 % (aktivitas), ≥ 0,4 poin (mood), "
            "≥ 15 % (tidur/makan), garis tren yang konsisten (r ≥ 0,6), atau beda bermakna terhadap kebiasaan (uji t ≥ 2); "
            "titik ubah = hari ketika tingkat catatan berpindah ≥ 0,8 sebaran dan sisi barunya bertahan ≥ 3 hari; "
            "pola = hari dalam minggu yang konsisten lebih rendah (≥ 3 minggu), keterkaitan antar catatan (korelasi ≥ 0,45 pada ≥ 10 hari), "
            f"dan pembanding anonim dengan {peers['n']} anak lain pada periode yang sama. Tingkat keyakinan mengikuti jumlah data dan besar efek. Bukan asesmen klinis."
        ),
        "generatedAt": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%S.000Z"),
    }
