"""Aturan bisnis yang berlaku di sisi server: judul catatan, tingkat keparahan, dan perhitungan gizi.

Dijaga di server agar nilai yang tampil di dasbor orang tua, pengasuh, dan admin selalu berasal
dari satu perhitungan yang sama.
"""
from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from zoneinfo import ZoneInfo

from .config import TIMEZONE

TZ = ZoneInfo(TIMEZONE)


def fmt_temp(v: float) -> str:
    return f"{v:.1f}".replace(".", ",") + "°C"


def temp_sev(temp: float, th: dict[str, Any]) -> str:
    if temp >= float(th["bodyTempHigh"]):
        return "high"
    if temp >= float(th["bodyTempWatch"]):
        return "medium"
    return "low"


def local_today_bounds() -> tuple[str, str]:
    """Rentang ISO-UTC untuk 'hari ini' menurut zona waktu fasilitas."""
    now = datetime.now(TZ)
    start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    end = start.replace(hour=23, minute=59, second=59, microsecond=999000)
    fmt = "%Y-%m-%dT%H:%M:%S.%fZ"
    s = start.astimezone(UTC).strftime(fmt)
    e = end.astimezone(UTC).strftime(fmt)
    return s[:-4] + "Z", e[:-4] + "Z"


def local_clock(iso_utc: str) -> str:
    dt = datetime.strptime(iso_utc, "%Y-%m-%dT%H:%M:%S.%fZ").replace(tzinfo=UTC).astimezone(TZ)
    return dt.strftime("%H:%M")


# --- Gizi ------------------------------------------------------------------------------------


def food_index(foods: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    return {f["name"].lower(): f for f in foods}


def nutrition_for(items: list[dict[str, Any]], foods: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Lengkapi tiap item (name, pre, post) dengan kkal/protein/karbo/lemak per 100 g dari tabel makanan."""
    idx = food_index(foods)
    out: list[dict[str, Any]] = []
    for it in items:
        ref = idx.get(str(it["name"]).lower())
        pre = max(0.0, float(it.get("pre", 0) or 0))
        post = max(0.0, min(pre, float(it.get("post", 0) or 0)))
        row = {
            "name": it["name"],
            "pre": round(pre),
            "post": round(post),
            "kcal": float(ref["kcal"]) if ref else 0.0,
            "protein": float(ref["protein"]) if ref else 0.0,
            "carbs": float(ref["carbs"]) if ref else 0.0,
            "fat": float(ref["fat"]) if ref else 0.0,
            "known": ref is not None,
        }
        out.append(row)
    return out


def totals(items: list[dict[str, Any]]) -> dict[str, float]:
    pre = sum(i["pre"] for i in items)
    eaten = sum(max(0, i["pre"] - i["post"]) for i in items)
    kcal = sum(max(0, i["pre"] - i["post"]) * i["kcal"] / 100 for i in items)
    protein = sum(max(0, i["pre"] - i["post"]) * i["protein"] / 100 for i in items)
    carbs = sum(max(0, i["pre"] - i["post"]) * i["carbs"] / 100 for i in items)
    fat = sum(max(0, i["pre"] - i["post"]) * i["fat"] / 100 for i in items)
    served_kcal = sum(i["pre"] * i["kcal"] / 100 for i in items)
    pct = round(eaten / pre * 100) if pre > 0 else 0
    return {
        "pre": pre,
        "eaten": eaten,
        "pct": pct,
        "kcal": round(kcal),
        "protein": round(protein, 1),
        "carbs": round(carbs, 1),
        "fat": round(fat, 1),
        "servedKcal": round(served_kcal),
    }


MEAL_LABEL = {"lunch": "Makan siang", "snack_am": "Camilan pagi", "snack_pm": "Camilan sore", "breakfast": "Sarapan"}


def meal_label(meal: str) -> str:
    return MEAL_LABEL.get(meal, "Makan")


# --- Kehadiran ------------------------------------------------------------------------------


def attendance(child: dict[str, Any], today_entries: list[dict[str, Any]]) -> dict[str, Any]:
    """Status hadir seorang anak: catatan hari ini menang atas jadwal dasar."""
    mine = sorted((e for e in today_entries if e.get("childId") == child["id"] and e["type"] in ("checkin", "checkout")), key=lambda e: e["at"])
    if mine:
        last = mine[-1]
        clock = local_clock(last["at"])
        if last["type"] == "checkout":
            return {"state": "out", "since": clock}
        return {"state": "in", "since": clock}
    now = datetime.now(TZ).strftime("%H:%M")
    if child.get("checkout") and now >= child["checkout"]:
        return {"state": "out", "since": child["checkout"]}
    if child.get("checkin") and now >= child["checkin"]:
        return {"state": "in", "since": child["checkin"]}
    return {"state": "pending", "since": child.get("checkin")}
