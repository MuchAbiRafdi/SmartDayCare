"""Kepercayaan & keterlibatan: umpan balik orang tua, tanggapan daycare, dan indikator yang dapat dijelaskan."""
from __future__ import annotations

from datetime import datetime, timedelta
from statistics import mean, median
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import Auth, require_roles
from ..events import notify_change
from ..logic import TZ
from ..models import AuthSession, CameraRequest, ChatMessage, Child, Feedback, Setting, User
from ..schemas import DailySummaryIn, FeedbackIn, FeedbackRespondIn
from ..security import iso, new_id, now_iso, now_utc

router = APIRouter(prefix="/api", tags=["trust"])

PARENT = require_roles("parent")
STAFF = require_roles("caregiver", "admin")
ADMIN = require_roles("admin")

POSITIVE_WORDS = ("puas", "senang", "bagus", "baik", "terima kasih", "membantu", "cepat", "responsif", "sabar", "ramah", "informatif", "suka", "mantap", "hebat", "lancar", "ceria", "percaya")
NEGATIVE_WORDS = ("kecewa", "lambat", "terlambat", "kurang", "tidak", "buruk", "mahal", "sempit", "kotor", "sulit", "mendadak", "bingung", "lama", "sering tidak", "belum")


def sentiment_of(rating: int, text: str) -> str:
    t = (text or "").lower()
    pos = sum(1 for w in POSITIVE_WORDS if w in t)
    neg = sum(1 for w in NEGATIVE_WORDS if w in t)
    score = (rating - 3) + 0.5 * (pos - neg)
    if score >= 1:
        return "positif"
    if score <= -0.5:
        return "negatif"
    return "netral"


def feedback_public(f: Feedback, children: dict[str, Child] | None = None) -> dict[str, Any]:
    c = (children or {}).get(f.child_id or "")
    return {
        "id": f.id,
        "userId": f.user_id,
        "by": f.by_name,
        "childId": f.child_id,
        "child": c.short if c else None,
        "at": f.at,
        "rating": f.rating,
        "text": f.text,
        "sentiment": f.sentiment,
        "response": f.response,
        "respondedAt": f.responded_at,
        "respondedBy": f.responded_by,
    }


def feedback_for(db: Session, user: User, limit: int = 100) -> list[dict[str, Any]]:
    q = select(Feedback).order_by(Feedback.at.desc()).limit(limit)
    if user.role == "parent":
        q = q.where(Feedback.user_id == user.id)
    children = {c.id: c for c in db.scalars(select(Child)).all()}
    return [feedback_public(f, children) for f in db.scalars(q).all()]


def daily_summary_setting(db: Session) -> dict[str, Any]:
    row = db.get(Setting, "dailySummary")
    base = {"enabled": True, "time": "16:00"}
    if row is not None and isinstance(row.value, dict):
        base.update({k: row.value[k] for k in ("enabled", "time") if k in row.value})
    return base


def trust_metrics(db: Session) -> dict[str, Any]:
    """Empat indikator + tren 6 minggu. Setiap angka membawa dasar perhitungannya."""
    now = now_utc()
    d30 = iso(now - timedelta(days=30))
    d60 = iso(now - timedelta(days=60))
    d7 = iso(now - timedelta(days=7))
    rows = db.scalars(select(Feedback).where(Feedback.at >= d60).order_by(Feedback.at)).all()
    cur = [f for f in rows if f.at >= d30]
    prev = [f for f in rows if f.at < d30]
    sat = round(mean(f.rating for f in cur) / 5 * 100) if cur else 0
    sat_prev = round(mean(f.rating for f in prev) / 5 * 100) if prev else None
    answered = [f for f in cur if f.response]
    resp_rate = round(len(answered) / len(cur) * 100) if cur else 0
    hours: list[float] = []
    for f in answered:
        if f.responded_at:
            try:
                a = datetime.strptime(f.at, "%Y-%m-%dT%H:%M:%S.%fZ")
                b = datetime.strptime(f.responded_at, "%Y-%m-%dT%H:%M:%S.%fZ")
                hours.append(max(0.0, (b - a).total_seconds() / 3600))
            except ValueError:
                pass
    med_h = round(median(hours), 1) if hours else None
    parents = db.scalars(select(User).where(User.role == "parent", User.disabled.is_(False))).all()
    active: set[str] = set()
    for s in db.scalars(select(AuthSession).where(AuthSession.last_seen >= d7)).all():
        active.add(s.user_id)
    for m in db.scalars(select(ChatMessage.user_id).where(ChatMessage.at >= d7)).all():
        if m:
            active.add(m)
    for f in cur:
        if f.user_id and f.at >= d7:
            active.add(f.user_id)
    for r in db.scalars(select(CameraRequest).where(CameraRequest.created_at >= d7)).all():
        active.add(r.user_id)
    parent_ids = {p.id for p in parents}
    engaged = len(active & parent_ids)
    eng_rate = round(engaged / len(parent_ids) * 100) if parent_ids else 0
    trust = round(0.4 * sat + 0.3 * resp_rate + 0.3 * eng_rate)
    # tren kepuasan per minggu (6 minggu, Senin–Minggu waktu fasilitas)
    today = datetime.now(TZ).date()
    this_monday = today - timedelta(days=today.weekday())
    weeks = []
    all_rows = db.scalars(select(Feedback).where(Feedback.at >= iso(now - timedelta(days=49))).order_by(Feedback.at)).all()
    for i in range(5, -1, -1):
        ws = this_monday - timedelta(days=7 * i)
        we = ws + timedelta(days=6)
        lo_iso = iso(datetime(ws.year, ws.month, ws.day, tzinfo=TZ))
        hi_iso = iso(datetime(we.year, we.month, we.day, 23, 59, 59, tzinfo=TZ))
        w = [f.rating for f in all_rows if lo_iso <= f.at <= hi_iso]
        weeks.append({"label": f"{ws.day:02d}/{ws.month:02d}", "start": ws.isoformat(), "avg": round(mean(w), 2) if w else None, "n": len(w), "pct": round(mean(w) / 5 * 100) if w else None})
    sentiments = {"positif": 0, "netral": 0, "negatif": 0}
    for f in cur:
        sentiments[f.sentiment] = sentiments.get(f.sentiment, 0) + 1
    return {
        "satisfaction": {"value": sat, "prev": sat_prev, "delta": (sat - sat_prev) if sat_prev is not None else None, "basis": f"{len(cur)} penilaian dalam 30 hari terakhir, rata-rata {str(round(mean(f.rating for f in cur), 1)).replace('.', ',')} dari 5" if cur else "Belum ada penilaian dalam 30 hari terakhir"},
        "response": {"value": resp_rate, "medianHours": med_h, "basis": f"{len(answered)} dari {len(cur)} umpan balik sudah ditanggapi" + (f", waktu tanggap tengah {med_h} jam" if med_h is not None else "") if cur else "Belum ada umpan balik untuk ditanggapi"},
        "engagement": {"value": eng_rate, "basis": f"{engaged} dari {len(parent_ids)} akun orang tua aktif dalam 7 hari terakhir (masuk, mengirim pesan, menilai, atau mengajukan akses kamera)"},
        "trust": {"value": trust, "basis": "40 % kepuasan + 30 % respon umpan balik + 30 % keterlibatan"},
        "weeks": weeks,
        "sentiments": sentiments,
        "count30": len(cur),
        "dailySummary": daily_summary_setting(db),
    }


@router.post("/feedback")
def create_feedback(body: FeedbackIn, auth: Auth = Depends(PARENT), db: Session = Depends(get_db)) -> dict:
    own = {link.child_id for link in auth.user.links}
    child_id = body.childId if body.childId in own else (next(iter(own)) if own else None)
    f = Feedback(id=new_id("F"), user_id=auth.user.id, by_name=auth.user.name, child_id=child_id, at=now_iso(), rating=body.rating, text=body.text, sentiment=sentiment_of(body.rating, body.text))
    db.add(f)
    db.commit()
    notify_change("feedback", id=f.id, rating=f.rating, by=auth.user.name)
    children = {c.id: c for c in db.scalars(select(Child)).all()}
    return {"feedback": feedback_public(f, children)}


@router.post("/feedback/{feedback_id}/respond")
def respond(feedback_id: str, body: FeedbackRespondIn, auth: Auth = Depends(STAFF), db: Session = Depends(get_db)) -> dict:
    f = db.get(Feedback, feedback_id)
    if f is None:
        raise HTTPException(404, "Umpan balik tidak ditemukan.")
    f.response = body.text
    f.responded_at = now_iso()
    f.responded_by = auth.user.name
    db.commit()
    notify_change("feedback", id=f.id, responded=True)
    children = {c.id: c for c in db.scalars(select(Child)).all()}
    return {"feedback": feedback_public(f, children)}


@router.get("/trust")
def get_trust(auth: Auth = Depends(STAFF), db: Session = Depends(get_db)) -> dict:
    return {"trust": trust_metrics(db), "feedback": feedback_for(db, auth.user)}


@router.put("/admin/daily-summary")
def put_daily_summary(body: DailySummaryIn, auth: Auth = Depends(ADMIN), db: Session = Depends(get_db)) -> dict:
    row = db.get(Setting, "dailySummary")
    value = {"enabled": body.enabled, "time": body.time}
    if row is None:
        db.add(Setting(key="dailySummary", value=value))
    else:
        row.value = value
    db.commit()
    notify_change("settings")
    return {"dailySummary": value}
