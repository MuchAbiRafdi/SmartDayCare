"""Catatan harian: kedatangan, suhu, catatan, kepulangan, obat, kejadian, serah terima, piring."""
from __future__ import annotations

import base64
import binascii
import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import config
from ..db import get_db
from ..deps import Auth, require_auth, require_roles
from ..alerts import notify_parents
from ..devices import cameras_for
from ..events import notify_change
from ..logic import fmt_temp, local_clock, local_today_bounds, meal_label, nutrition_for, temp_sev, totals
from ..models import Child, LogEntry, Resolved
from ..schemas import (
    CameraViewIn,
    CheckinIn,
    CheckoutIn,
    HandoverIn,
    IncidentIn,
    MealIn,
    MedIn,
    NoteIn,
    PlateIn,
    TempIn,
)
from ..security import new_id, now_iso
from ..seed import seed, settings_dict
from ..serialize import entry_public, foods_public
from .cctv import approved_cams

router = APIRouter(prefix="/api", tags=["log"])

STAFF = require_roles("caregiver", "admin")

COND_TEXT = {
    "baik": "Kondisi fisik baik",
    "batuk": "Ada batuk ringan",
    "pilek": "Ada pilek",
    "lesu": "Tampak lesu",
    "lainnya": "Kondisi perlu perhatian",
}


def _child(db: Session, child_id: str) -> Child:
    c = db.get(Child, child_id)
    if c is None:
        raise HTTPException(404, "Data anak tidak ditemukan.")
    if c.archived_at:
        raise HTTPException(409, f"{c.short} sudah tidak terdaftar (diarsipkan). Pulihkan dulu dari menu admin bila perlu.")
    return c


def _new(auth: Auth, etype: str, *, child: Child | None = None, sev: str = "low", title: str, text: str = "", payload: dict[str, Any] | None = None, silent: bool = False, meal: str | None = None) -> LogEntry:
    return LogEntry(
        id=new_id("L"),
        type=etype,
        child_id=child.id if child else None,
        child_name=child.name if child else None,
        user_id=auth.user.id,
        by_name=auth.user.name,
        role=auth.user.role,
        at=now_iso(),
        sev=sev,
        title=title,
        text=text,
        silent=silent,
        meal=meal,
        payload=payload or {},
    )


def _commit(db: Session, e: LogEntry) -> dict:
    db.add(e)
    db.commit()
    notify_change("log", id=e.id, type=e.type, childId=e.child_id, title=e.title, child=e.child_name, sev=e.sev, silent=e.silent)
    try:
        notify_parents(db, e)
    except Exception:  # noqa: BLE001 - pemberitahuan tidak boleh menggagalkan pencatatan
        logging.getLogger("smartdaycare").exception("Pemberitahuan orang tua gagal disusun")
    return {"entry": entry_public(e)}


@router.post("/log/checkin")
def checkin(body: CheckinIn, auth: Auth = Depends(STAFF), db: Session = Depends(get_db)) -> dict:
    child = _child(db, body.childId)
    th = settings_dict(db)
    sev = temp_sev(body.temp, th)
    cond = COND_TEXT[body.cond]
    e = _new(
        auth,
        "checkin",
        child=child,
        sev=sev,
        title=f"Tiba, suhu {fmt_temp(body.temp)}",
        text=f"{cond}. Diantar oleh {body.who}.",
        payload={"temp": body.temp, "who": body.who, "cond": body.cond},
    )
    return _commit(db, e)


@router.post("/log/temp")
def temp(body: TempIn, auth: Auth = Depends(STAFF), db: Session = Depends(get_db)) -> dict:
    child = _child(db, body.childId)
    th = settings_dict(db)
    sev = temp_sev(body.temp, th)
    note = {"high": "Di atas batas tinggi. Orang tua dihubungi.", "medium": "Sedikit di atas normal. Dipantau ulang 30 menit lagi.", "low": "Dalam batas normal."}[sev]
    e = _new(auth, "temp", child=child, sev=sev, title=f"Suhu tubuh {fmt_temp(body.temp)}", text=note, payload={"temp": body.temp})
    return _commit(db, e)


@router.post("/log/note")
def note(body: NoteIn, auth: Auth = Depends(STAFF), db: Session = Depends(get_db)) -> dict:
    child = _child(db, body.childId)
    e = _new(auth, "note", child=child, title="Catatan pengasuh", text=body.note)
    return _commit(db, e)


@router.post("/log/checkout")
def checkout(body: CheckoutIn, auth: Auth = Depends(STAFF), db: Session = Depends(get_db)) -> dict:
    child = _child(db, body.childId)
    text = body.note or "Pulang dalam kondisi baik."
    e = _new(auth, "checkout", child=child, title=f"Dijemput oleh {body.who}", text=text, payload={"who": body.who})
    return _commit(db, e)


@router.post("/log/med")
def med(body: MedIn, auth: Auth = Depends(STAFF), db: Session = Depends(get_db)) -> dict:
    child = _child(db, body.childId)
    e = _new(
        auth,
        "med",
        child=child,
        sev="medium",
        title=f"Obat diberikan: {body.med} {body.dose}",
        text=body.note or "Sesuai catatan orang tua.",
        payload={"med": body.med, "dose": body.dose, "note": body.note},
    )
    return _commit(db, e)


@router.post("/log/incident")
def incident(body: IncidentIn, auth: Auth = Depends(STAFF), db: Session = Depends(get_db)) -> dict:
    child = _child(db, body.childId)
    e = _new(
        auth,
        "incident",
        child=child,
        sev=body.sev,
        title=body.kind,
        text=body.note,
        payload={"kind": body.kind, "room": body.room, "note": body.note},
    )
    return _commit(db, e)


@router.post("/incidents/{incident_id}/resolve")
def resolve(incident_id: str, auth: Auth = Depends(STAFF), db: Session = Depends(get_db)) -> dict:
    known = {i["id"] for i in seed()["incidents"]}
    entry = db.get(LogEntry, incident_id)
    if incident_id not in known and (entry is None or entry.type != "incident"):
        raise HTTPException(404, "Kejadian tidak ditemukan.")
    if db.get(Resolved, incident_id) is None:
        db.add(Resolved(incident_id=incident_id, by_name=auth.user.name, at=now_iso()))
        db.commit()
        notify_change("resolved", id=incident_id)
    return {"ok": True, "by": auth.user.name}


@router.post("/log/handover")
def handover(body: HandoverIn, auth: Auth = Depends(STAFF), db: Session = Depends(get_db)) -> dict:
    e = _new(auth, "handover", title=f"Serah terima ke {body.to}", text=body.note, payload={"to": body.to, "from": auth.user.name})
    return _commit(db, e)


@router.post("/camera-view")
def camera_view(body: CameraViewIn, auth: Auth = Depends(require_auth), db: Session = Depends(get_db)) -> dict:
    cams = {c["id"]: c for c in cameras_for(db, parent=False)}
    cam = cams.get(body.camId)
    if cam is None:
        raise HTTPException(404, "Kamera tidak ditemukan.")
    if auth.user.role == "parent":
        if not cam["parents"]:
            raise HTTPException(403, "Kamera ini tidak tersedia untuk orang tua.")
        if cam["id"] not in approved_cams(db, auth.user.id):
            raise HTTPException(403, "Akses kamera ini belum disetujui. Ajukan permintaan akses lebih dulu.")
    e = _new(auth, "access", title=f"Membuka {cam['label']} ({cam['room']})", text="Akses rutin", silent=True, payload={"purpose": "Akses rutin", "camId": cam["id"]})
    return _commit(db, e)


# --- Piring & gizi ---------------------------------------------------------------------------


def _decode_photo(data_url: str) -> bytes:
    try:
        raw = base64.b64decode(data_url.split(",", 1)[1], validate=True)
    except (binascii.Error, IndexError, ValueError) as exc:
        raise HTTPException(422, "Foto tidak dapat dibaca.") from exc
    if len(raw) > config.MAX_PHOTO_BYTES:
        raise HTTPException(413, "Foto terlalu besar. Gunakan gambar yang lebih kecil.")
    if raw[:3] != b"\xff\xd8\xff":
        raise HTTPException(422, "Foto harus JPEG.")
    return raw


@router.post("/log/plate")
def plate(body: PlateIn, auth: Auth = Depends(STAFF), db: Session = Depends(get_db)) -> dict:
    child = _child(db, body.childId)
    foods = foods_public(db)
    items = nutrition_for([{"name": i.name, "pre": i.grams, "post": 0} for i in body.items], foods)
    served = totals([{**i, "post": 0} for i in items])
    # pindaian sebelumnya untuk anak+waktu makan yang belum ditutup → ditandai tergantikan
    prev = db.scalars(select(LogEntry).where(LogEntry.type == "plate", LogEntry.child_id == child.id, LogEntry.meal == body.meal, LogEntry.done.is_(None))).all()
    for p in prev:
        p.done = "replaced"
    names = ", ".join(f"{i['name']} {i['pre']} g" for i in items)
    e = _new(
        auth,
        "plate",
        child=child,
        title=f"{meal_label(body.meal)} disajikan",
        text=f"{names}. Sekitar {served['servedKcal']} kkal bila habis.",
        payload={
            "items": [{"name": i["name"], "pre": i["pre"], "kcal": i["kcal"], "protein": i["protein"], "carbs": i["carbs"], "fat": i["fat"]} for i in items],
            "servedKcal": served["servedKcal"],
            "servedGrams": served["pre"],
            "boxes": [b.model_dump() for b in body.boxes],
            "conf": round(body.conf, 2),
            "plateCm": body.plateCm,
            "served": local_clock(now_iso()),
        },
        silent=True,
        meal=body.meal,
    )
    e.photo_pre = _decode_photo(body.photo)
    return _commit(db, e)


@router.post("/log/meal")
def meal(body: MealIn, auth: Auth = Depends(STAFF), db: Session = Depends(get_db)) -> dict:
    plate_entry = db.get(LogEntry, body.plateId)
    if plate_entry is None or plate_entry.type != "plate":
        raise HTTPException(404, "Pindaian sebelum makan tidak ditemukan.")
    if plate_entry.done == "done":
        raise HTTPException(409, "Pindaian ini sudah ditutup.")
    child = _child(db, plate_entry.child_id or "")
    foods = foods_public(db)
    items = nutrition_for([{"name": i.name, "pre": i.pre, "post": i.post} for i in body.items], foods)
    t = totals(items)
    label = meal_label(plate_entry.meal or "lunch")
    photo_post = _decode_photo(body.photo)
    left = sorted((i for i in items if i["post"] > 0), key=lambda i: -i["post"])
    left_text = f" Sisa terbanyak: {left[0]['name'].lower()} ({left[0]['post']} g)." if left else " Piring habis."
    # catatan makan hari ini untuk anak+waktu makan yang sama → dianggap koreksi, yang lama ditandai tergantikan
    day_start, day_end = local_today_bounds()
    prev_meals = db.scalars(
        select(LogEntry).where(LogEntry.type == "meal", LogEntry.child_id == child.id, LogEntry.meal == plate_entry.meal, LogEntry.done.is_(None), LogEntry.at >= day_start, LogEntry.at <= day_end)
    ).all()
    for m in prev_meals:
        m.done = "replaced"
    e = _new(
        auth,
        "meal",
        child=child,
        sev="medium" if t["pct"] < 60 else "low",
        title=f"{label} {t['pct']}% porsi",
        text=f"Sekitar {t['kcal']} kkal, protein {str(t['protein']).replace('.', ',')} g.{left_text}",
        payload={
            "items": items,
            "pct": t["pct"],
            "kcal": t["kcal"],
            "protein": t["protein"],
            "carbs": t["carbs"],
            "fat": t["fat"],
            "servedKcal": t["servedKcal"],
            "eatenGrams": t["eaten"],
            "servedGrams": t["pre"],
            "boxesPre": plate_entry.payload.get("boxes", []),
            "boxesPost": [b.model_dump() for b in body.boxes],
            "confPre": plate_entry.payload.get("conf"),
            "confPost": round(body.conf, 2),
            "served": plate_entry.payload.get("served") or local_clock(plate_entry.at),
            "scannedPost": local_clock(now_iso()),
            "plateId": plate_entry.id,
        },
        meal=plate_entry.meal,
    )
    e.photo_pre = plate_entry.photo_pre
    e.photo_post = photo_post
    plate_entry.done = "done"
    plate_entry.photo_pre = None  # foto disimpan sekali saja pada catatan makan
    return _commit(db, e)


@router.get("/photos/{entry_id}/{kind}")
def photo(entry_id: str, kind: str, auth: Auth = Depends(require_auth), db: Session = Depends(get_db)) -> Response:
    e = db.get(LogEntry, entry_id)
    if e is None:
        raise HTTPException(404)
    if auth.user.role == "parent" and e.child_id not in {link.child_id for link in auth.user.links}:
        raise HTTPException(403)
    blob = {"pre": e.photo_pre, "post": e.photo_post, "photo": e.photo}.get(kind)
    if blob is None:
        raise HTTPException(404)
    return Response(content=blob, media_type="image/jpeg", headers={"Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff"})
