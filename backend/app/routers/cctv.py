"""Akses kamera berbasis hak: orang tua mengajukan, admin menyetujui dengan masa berlaku."""
from __future__ import annotations

from datetime import timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import notify
from ..db import get_db
from ..deps import Auth, require_roles
from ..devices import cameras_for
from ..events import notify_change
from ..models import CameraRequest, Child, LogEntry, User
from ..schemas import CctvDecideIn, CctvRequestIn
from ..security import iso, new_id, now_iso, now_utc

router = APIRouter(prefix="/api/cctv", tags=["cctv"])

PARENT = require_roles("parent")
ADMIN = require_roles("admin")


def effective_status(r: CameraRequest, now: str | None = None) -> str:
    now = now or now_iso()
    if r.status == "approved" and r.expires_at and r.expires_at <= now:
        return "expired"
    return r.status


def approved_cams(db: Session, user_id: str) -> dict[str, CameraRequest]:
    """Kamera yang saat ini boleh dilihat pengguna (permintaan disetujui & belum kedaluwarsa)."""
    now = now_iso()
    rows = db.scalars(select(CameraRequest).where(CameraRequest.user_id == user_id, CameraRequest.status == "approved")).all()
    return {r.cam_id: r for r in rows if effective_status(r, now) == "approved"}


def request_public(r: CameraRequest, users: dict[str, User] | None = None, children: dict[str, Child] | None = None, cams: dict[str, dict[str, Any]] | None = None) -> dict[str, Any]:
    u = (users or {}).get(r.user_id)
    c = (children or {}).get(r.child_id or "")
    cam = (cams or {}).get(r.cam_id)
    return {
        "id": r.id,
        "userId": r.user_id,
        "user": u.name if u else "",
        "childId": r.child_id,
        "child": c.short if c else None,
        "camId": r.cam_id,
        "camera": cam["label"] if cam else r.cam_id,
        "room": cam["room"] if cam else "",
        "reason": r.reason,
        "status": effective_status(r),
        "createdAt": r.created_at,
        "decidedAt": r.decided_at,
        "decidedBy": r.decided_by,
        "expiresAt": r.expires_at,
        "note": r.note,
    }


def requests_public(db: Session, user: User, limit: int = 200) -> list[dict[str, Any]]:
    q = select(CameraRequest).order_by(CameraRequest.created_at.desc()).limit(limit)
    if user.role == "parent":
        q = q.where(CameraRequest.user_id == user.id)
    rows = db.scalars(q).all()
    users = {u.id: u for u in db.scalars(select(User)).all()}
    children = {c.id: c for c in db.scalars(select(Child)).all()}
    cams = {c["id"]: c for c in cameras_for(db, parent=False)}
    out = [request_public(r, users, children, cams) for r in rows]
    # yang menunggu keputusan di atas
    out.sort(key=lambda x: (x["status"] != "pending", x["createdAt"]), reverse=False)
    out.sort(key=lambda x: x["status"] != "pending")
    return out


def camera_access(db: Session, user: User) -> dict[str, dict[str, Any]]:
    """Status akses per kamera untuk orang tua: none | pending | approved | denied | expired | revoked."""
    rows = db.scalars(select(CameraRequest).where(CameraRequest.user_id == user.id).order_by(CameraRequest.created_at)).all()
    out: dict[str, dict[str, Any]] = {}
    now = now_iso()
    for r in rows:
        st = effective_status(r, now)
        cur = out.get(r.cam_id)
        # prioritas: approved > pending > lainnya (yang terbaru)
        rank = {"approved": 0, "pending": 1}.get(st, 2)
        if cur is None or rank <= cur["_rank"]:
            out[r.cam_id] = {"_rank": rank, "status": st, "requestId": r.id, "expiresAt": r.expires_at, "decidedAt": r.decided_at, "note": r.note, "createdAt": r.created_at}
    for v in out.values():
        v.pop("_rank", None)
    return out


@router.post("/requests")
def create_request(body: CctvRequestIn, auth: Auth = Depends(PARENT), db: Session = Depends(get_db)) -> dict:
    cams = {c["id"]: c for c in cameras_for(db, parent=True)}
    cam = cams.get(body.camId)
    if cam is None:
        raise HTTPException(404, "Kamera ini tidak tersedia untuk orang tua.")
    own = {link.child_id for link in auth.user.links}
    if body.childId and body.childId not in own:
        raise HTTPException(403, "Anak tidak tertaut ke akun Anda.")
    now = now_iso()
    for r in db.scalars(select(CameraRequest).where(CameraRequest.user_id == auth.user.id, CameraRequest.cam_id == body.camId)).all():
        st = effective_status(r, now)
        if st == "pending":
            raise HTTPException(409, "Permintaan untuk kamera ini masih menunggu persetujuan.")
        if st == "approved":
            raise HTTPException(409, "Akses kamera ini sudah disetujui dan masih berlaku.")
    r = CameraRequest(id=new_id("CR"), user_id=auth.user.id, child_id=body.childId or (next(iter(own)) if own else None), cam_id=body.camId, reason=body.reason, status="pending", created_at=now)
    db.add(r)
    db.add(
        LogEntry(
            id=new_id("L"),
            type="access",
            child_id=None,
            child_name=None,
            user_id=auth.user.id,
            by_name=auth.user.name,
            role=auth.user.role,
            at=now,
            sev="low",
            title=f"Mengajukan akses {cam['label']} ({cam['room']})",
            text=body.reason,
            silent=True,
            payload={"purpose": "Permintaan akses kamera", "camId": cam["id"]},
        )
    )
    db.commit()
    notify_change("cctv", id=r.id, status="pending", user=auth.user.name, camera=cam["label"])
    return {"request": request_public(r, {auth.user.id: auth.user}, None, cams)}


@router.post("/requests/{request_id}/decide")
def decide(request_id: str, body: CctvDecideIn, auth: Auth = Depends(ADMIN), db: Session = Depends(get_db)) -> dict:
    r = db.get(CameraRequest, request_id)
    if r is None:
        raise HTTPException(404, "Permintaan tidak ditemukan.")
    st = effective_status(r)
    now = now_iso()
    cams = {c["id"]: c for c in cameras_for(db, parent=False)}
    cam = cams.get(r.cam_id, {"label": r.cam_id, "room": ""})
    if body.action == "approve":
        if st not in ("pending", "denied", "expired", "revoked"):
            raise HTTPException(409, "Permintaan ini sudah disetujui.")
        r.status = "approved"
        r.expires_at = iso(now_utc() + timedelta(days=body.days))
        r.note = body.note or f"Disetujui untuk {body.days} hari."
        verdict = f"disetujui hingga {body.days} hari ke depan"
    elif body.action == "deny":
        if st != "pending":
            raise HTTPException(409, "Hanya permintaan yang menunggu yang dapat ditolak.")
        r.status = "denied"
        r.note = body.note
        verdict = "belum dapat disetujui"
    else:
        if st != "approved":
            raise HTTPException(409, "Hanya akses yang masih berlaku yang dapat dicabut.")
        r.status = "revoked"
        r.note = body.note
        verdict = "dicabut"
    r.decided_at = now
    r.decided_by = auth.user.name
    parent = db.get(User, r.user_id)
    db.add(
        LogEntry(
            id=new_id("L"),
            type="access",
            child_id=None,
            child_name=None,
            user_id=auth.user.id,
            by_name=auth.user.name,
            role=auth.user.role,
            at=now,
            sev="low",
            title=f"Akses {cam['label']} untuk {parent.name if parent else r.user_id}: {verdict}",
            text=body.note or "",
            silent=True,
            payload={"purpose": "Keputusan akses kamera", "camId": r.cam_id},
        )
    )
    db.commit()
    if parent is not None and not parent.disabled:
        subject = f"Akses {cam['label']} {verdict}"
        body_text = f"Halo {parent.name},\n\nPermintaan akses Anda untuk {cam['label']} ({cam['room']}) {verdict}." + (f"\nCatatan: {body.note}" if body.note else "") + f"\n\nBuka menu Kamera di dasbor untuk melihat.\n{notify.facility_name()}"
        try:
            if parent.email:
                notify.enqueue(db, "email", parent.email, subject, body_text, ref=f"cctv:{r.id}", user_id=parent.id)
            if parent.phone:
                notify.enqueue(db, "wa", parent.phone, subject, body_text, ref=f"cctv:{r.id}", user_id=parent.id)
        except Exception:  # noqa: BLE001 - pemberitahuan tidak boleh menggagalkan keputusan
            pass
    notify_change("cctv", id=r.id, status=r.status, user=parent.name if parent else "", camera=cam["label"])
    users = {u.id: u for u in db.scalars(select(User)).all()}
    children = {c.id: c for c in db.scalars(select(Child)).all()}
    return {"request": request_public(r, users, children, cams)}


@router.get("/requests")
def list_requests(auth: Auth = Depends(require_roles("parent", "caregiver", "admin")), db: Session = Depends(get_db)) -> dict:
    return {"requests": requests_public(db, auth.user)}
