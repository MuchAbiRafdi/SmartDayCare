"""Analitik & insight perkembangan per anak (lihat analytics.py untuk cara hitungnya).

Rute /analytics/reco-feedback didaftarkan sebelum /analytics/{child_id} agar tidak tertafsir
sebagai child_id (FastAPI mencocokkan rute menurut urutan deklarasi)."""
from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..analytics import analyze, cat_reco_feedback, reco_weights
from ..db import get_db
from ..deps import Auth, require_auth, require_roles
from ..models import Child
from ..schemas import RecoFeedbackIn

router = APIRouter(prefix="/api", tags=["analytics"])

ADMIN = require_roles("admin")


@router.post("/analytics/reco-feedback")
def post_reco_feedback(body: RecoFeedbackIn, auth: Auth = Depends(ADMIN), db: Session = Depends(get_db)) -> dict:
    """Catat 👍/👎 admin pada satu saran; hanya mengubah urutan saran, tidak menambah klaim baru."""
    res = cat_reco_feedback(db, body.key, body.vote)
    if not res.get("ok"):
        raise HTTPException(422, res.get("error") or "Penilaian tidak dapat dicatat.")
    return res


@router.get("/analytics/reco-feedback")
def get_reco_feedback(auth: Auth = Depends(ADMIN), db: Session = Depends(get_db)) -> dict:
    """Bobot aktif tiap jenis saran, supaya urutan yang dilihat admin bisa dijelaskan."""
    return {"weights": reco_weights(db)}


@router.get("/analytics/{child_id}")
def analytics(child_id: str, days: int = Query(7, ge=7, le=180), end: str | None = None, auth: Auth = Depends(require_auth), db: Session = Depends(get_db)) -> dict:
    c = db.get(Child, child_id)
    if c is None or (c.archived_at and auth.user.role != "admin"):
        raise HTTPException(404, "Data anak tidak ditemukan.")
    if auth.user.role == "parent" and child_id not in {link.child_id for link in auth.user.links}:
        raise HTTPException(403, "Anak tidak tertaut ke akun Anda.")
    end_date: date | None = None
    if end:
        try:
            end_date = date.fromisoformat(end)
        except ValueError as exc:
            raise HTTPException(422, "Format tanggal akhir harus YYYY-MM-DD.") from exc
    data = c.data or {}
    return analyze(
        db,
        {"id": c.id, "short": c.short, "name": c.name, "checkin": data.get("checkin"), "temps": data.get("temps") or []},
        days=days,
        end=end_date,
        audience=auth.user.role,
    )

