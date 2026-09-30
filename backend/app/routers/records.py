"""Pencatatan rutin harian oleh pengasuh: aktivitas, makan (porsi), tidur, mood, dokumentasi foto."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import Auth
from ..models import LogEntry
from ..labels import (
    ACTIVITY_LABEL,
    FOOD_SLOT_LABEL,
    MOOD_EMOJI,
    MOOD_LABEL,
    MOOD_SCORE,
    PORTION_LABEL,
    PORTION_SCORE,
    SLEEP_KIND_LABEL,
    SLEEP_QUALITY_LABEL,
    SLEEP_QUALITY_SCORE,
    duration_minutes,
    fmt_duration,
)
from ..schemas import ActivityIn, DocIn, FoodIn2, MoodIn, SleepIn
from ..logic import local_today_bounds
from .log import STAFF, _child, _commit, _decode_photo, _new

router = APIRouter(prefix="/api/log", tags=["records"])


@router.post("/activity")
def activity(body: ActivityIn, auth: Auth = Depends(STAFF), db: Session = Depends(get_db)) -> dict:
    child = _child(db, body.childId)
    label = ACTIVITY_LABEL[body.kind]
    dur = f" · {fmt_duration(body.minutes)}" if body.minutes else ""
    e = _new(
        auth,
        "activity",
        child=child,
        title=f"Aktivitas: {label}{dur}",
        text=body.note or f"{child.short} mengikuti {label.lower()}.",
        payload={"kind": body.kind, "kindLabel": label, "minutes": body.minutes, "note": body.note},
        silent=True,
    )
    return _commit(db, e)


@router.post("/food")
def food(body: FoodIn2, auth: Auth = Depends(STAFF), db: Session = Depends(get_db)) -> dict:
    child = _child(db, body.childId)
    slot = FOOD_SLOT_LABEL[body.slot]
    portion = PORTION_LABEL[body.portion]
    menu = ", ".join(body.menu)
    sev = "medium" if body.portion == "tidak" else "low"
    # satu catatan per waktu makan per hari: catatan lama untuk waktu makan yang sama ditandai tergantikan
    day_start, day_end = local_today_bounds()
    for old in db.scalars(
        select(LogEntry).where(LogEntry.type == "food", LogEntry.child_id == child.id, LogEntry.meal == body.slot, LogEntry.done.is_(None), LogEntry.at >= day_start, LogEntry.at <= day_end)
    ).all():
        old.done = "replaced"
    e = _new(
        auth,
        "food",
        child=child,
        sev=sev,
        title=f"{slot}: {portion}",
        text=(f"Menu {menu}. " if menu else "") + (body.note or ""),
        payload={
            "slot": body.slot,
            "slotLabel": slot,
            "menu": body.menu,
            "portion": body.portion,
            "portionLabel": portion,
            "score": PORTION_SCORE[body.portion],
            "note": body.note,
        },
        meal=body.slot,
    )
    return _commit(db, e)


@router.post("/sleep")
def sleep(body: SleepIn, auth: Auth = Depends(STAFF), db: Session = Depends(get_db)) -> dict:
    child = _child(db, body.childId)
    minutes = duration_minutes(body.start, body.end)
    if minutes < 5 or minutes > 6 * 60:
        raise HTTPException(422, "Durasi tidur harus antara 5 menit dan 6 jam. Periksa jam mulai dan bangun.")
    kind = SLEEP_KIND_LABEL[body.kind]
    quality = SLEEP_QUALITY_LABEL[body.quality]
    e = _new(
        auth,
        "sleep",
        child=child,
        title=f"{kind} {body.start.replace(':', '.')}–{body.end.replace(':', '.')} ({fmt_duration(minutes)})",
        text=f"Kualitas tidur {quality.lower()}." + (f" {body.note}" if body.note else ""),
        payload={
            "kind": body.kind,
            "kindLabel": kind,
            "start": body.start,
            "end": body.end,
            "minutes": minutes,
            "quality": body.quality,
            "qualityLabel": quality,
            "qualityScore": SLEEP_QUALITY_SCORE[body.quality],
            "note": body.note,
        },
        silent=True,
    )
    return _commit(db, e)


@router.post("/mood")
def mood(body: MoodIn, auth: Auth = Depends(STAFF), db: Session = Depends(get_db)) -> dict:
    child = _child(db, body.childId)
    label = MOOD_LABEL[body.mood]
    sev = "medium" if body.mood in ("sedih", "marah") else "low"
    e = _new(
        auth,
        "mood",
        child=child,
        sev=sev,
        title=f"Mood: {label} {MOOD_EMOJI[body.mood]}",
        text=body.note or f"{child.short} terlihat {label.lower()} hari ini.",
        payload={"mood": body.mood, "moodLabel": label, "emoji": MOOD_EMOJI[body.mood], "score": MOOD_SCORE[body.mood], "note": body.note},
        silent=sev == "low",
    )
    return _commit(db, e)


@router.post("/doc")
def doc(body: DocIn, auth: Auth = Depends(STAFF), db: Session = Depends(get_db)) -> dict:
    child = _child(db, body.childId)
    caption = body.caption or "Dokumentasi kegiatan"
    e = _new(auth, "doc", child=child, title=caption, text=f"Foto kegiatan {child.short}.", payload={"caption": caption}, silent=True)
    e.photo = _decode_photo(body.photo)
    return _commit(db, e)
