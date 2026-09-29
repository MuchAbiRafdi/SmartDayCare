"""Endpoint perangkat: kiriman sensor/kamera (dengan token perangkat) dan pengelolaan oleh admin."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import devices as dev
from ..db import get_db
from ..deps import Auth, require_auth, require_roles
from ..events import air, broadcaster, notify_change
from ..models import Device
from ..security import RateLimiter
from .auth import access_entry

router = APIRouter(prefix="/api", tags=["devices"])
ADMIN = require_roles("admin")
ingest_limiter = RateLimiter(60, 60)  # per perangkat: maksimum satu kiriman per detik rata-rata


class Reading(BaseModel):
    model_config = ConfigDict(extra="ignore")
    temp: float | None = None
    hum: float | None = None
    co2: float | None = None
    pm25: float | None = None
    battery: float | None = None
    token: str | None = Field(default=None, max_length=120)


class DeviceIn(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    kind: str = Field(pattern="^(sensor|camera)$")
    name: str = Field(min_length=2, max_length=80)
    room: str = Field(min_length=2, max_length=80)
    parents: bool = False
    stream: str | None = Field(default=None, max_length=400)


class DevicePatchIn(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    name: str | None = Field(default=None, min_length=2, max_length=80)
    room: str | None = Field(default=None, min_length=2, max_length=80)
    parents: bool | None = None
    enabled: bool | None = None
    stream: str | None = Field(default=None, max_length=400)  # "" = hapus alamat siaran


def _device_from_token(db: Session, header_token: str | None, body_token: str | None) -> Device:
    d = dev.find_by_token(db, header_token or body_token)
    if d is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token perangkat tidak dikenal atau perangkat dinonaktifkan.")
    if not ingest_limiter.allow("dev:" + d.id):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Terlalu sering mengirim; maksimum 60 kiriman per menit.")
    return d


@router.post("/devices/ingest")
def ingest(body: Reading, db: Session = Depends(get_db), x_device_token: str | None = Header(default=None)) -> dict[str, Any]:
    """Kiriman sensor udara. Header `X-Device-Token: <token>` (atau kolom `token` di JSON)."""
    d = _device_from_token(db, x_device_token, body.token)
    try:
        reading = dev.ingest_reading(db, d, body.model_dump(exclude={"token"}))
    except ValueError as e:
        raise HTTPException(422, str(e)) from None
    return {"ok": True, "device": d.id, "room": d.room, "at": reading["at"]}


@router.post("/devices/snapshot")
async def snapshot(request: Request, db: Session = Depends(get_db), x_device_token: str | None = Header(default=None)) -> dict[str, Any]:
    """Kiriman foto kamera: badan permintaan JPEG mentah (Content-Type: image/jpeg)."""
    d = _device_from_token(db, x_device_token, None)
    raw = await request.body()
    try:
        at = dev.store_snapshot(db, d, raw)
    except ValueError as e:
        raise HTTPException(422, str(e)) from None
    return {"ok": True, "device": d.id, "at": at}


@router.get("/devices/{device_id}/snapshot.jpg")
def get_snapshot(device_id: str, auth: Auth = Depends(require_auth), db: Session = Depends(get_db)) -> Response:
    d = db.get(Device, device_id)
    if d is None or d.kind != "camera" or not d.enabled:
        raise HTTPException(404, "Kamera tidak ditemukan.")
    if auth.user.role == "parent":
        if not d.parents:
            raise HTTPException(403, "Kamera ini tidak tersedia untuk orang tua.")
        from .cctv import approved_cams  # impor lokal: menghindari impor melingkar

        if d.id not in approved_cams(db, auth.user.id):
            raise HTTPException(403, "Akses kamera ini belum disetujui.")
    snap = dev.latest_snapshot(device_id)
    if snap is None:
        raise HTTPException(404, "Belum ada foto dari kamera ini.")
    return Response(content=snap[0], media_type="image/jpeg", headers={"Cache-Control": "private, max-age=2", "X-Snapshot-At": snap[1]})


@router.get("/devices/stream-check", status_code=204)
def stream_check(request: Request, auth: Auth = Depends(require_auth), db: Session = Depends(get_db)) -> Response:
    """Dipanggil Caddy (forward_auth) sebelum meneruskan /stream/*: hanya pengguna yang sudah masuk,
    dan orang tua hanya untuk kamera yang dibuka untuk orang tua."""
    uri = request.headers.get("x-forwarded-uri", "")
    if auth.user.role == "parent" and uri:
        rows = db.scalars(select(Device).where(Device.kind == "camera", Device.enabled.is_(True))).all()
        for d in rows:
            stream = str((d.data or {}).get("stream") or "")
            base = stream.rsplit("/", 1)[0] if "/" in stream else stream
            if base and uri.startswith(base) and not d.parents:
                raise HTTPException(403, "Kamera ini tidak tersedia untuk orang tua.")
    return Response(status_code=204)


# --------------------------------------------------------------------- admin ----


@router.get("/admin/devices")
def list_devices(auth: Auth = Depends(ADMIN), db: Session = Depends(get_db)) -> dict[str, Any]:
    return {"devices": dev.device_status(db)}


@router.post("/admin/devices")
def create_device(body: DeviceIn, auth: Auth = Depends(ADMIN), db: Session = Depends(get_db)) -> dict[str, Any]:
    if db.scalar(select(Device.id).where(Device.name.ilike(body.name))):
        raise HTTPException(409, "Nama perangkat sudah dipakai.")
    try:
        d, token = dev.new_device(db, kind=body.kind, name=body.name, room=body.room, parents=body.parents, stream=body.stream or None)
    except ValueError as e:
        raise HTTPException(422, str(e)) from None
    access_entry(db, auth.user, f"Mendaftarkan {'sensor' if d.kind == 'sensor' else 'kamera'} {d.name}", d.room)
    db.commit()
    notify_change("devices")
    return {"device": dev.device_public(d), "token": token, "devices": dev.device_status(db)}


@router.patch("/admin/devices/{device_id}")
def patch_device(device_id: str, body: DevicePatchIn, auth: Auth = Depends(ADMIN), db: Session = Depends(get_db)) -> dict[str, Any]:
    d = db.get(Device, device_id)
    if d is None:
        raise HTTPException(404, "Perangkat tidak ditemukan.")
    if body.name is not None:
        d.name = body.name
    if body.room is not None:
        d.room = body.room
    if body.parents is not None:
        d.parents = body.parents
    if body.enabled is not None:
        d.enabled = body.enabled
        if not body.enabled and d.kind == "sensor" and air.release(d.room, d.id):
            broadcaster.publish("air", air.snapshot())  # ruangan tidak lagi memakai pembacaan sensor ini
    if body.stream is not None:
        data = dict(d.data or {})
        if body.stream == "":
            data.pop("stream", None)
            data.pop("streamKind", None)
        else:
            try:
                url, sk = dev.validate_stream(body.stream)
            except ValueError as e:
                raise HTTPException(422, str(e)) from None
            data["stream"], data["streamKind"] = url, sk
            d.last_seen = d.last_seen or None
        d.data = data
    access_entry(db, auth.user, f"Mengubah perangkat {d.name}")
    db.commit()
    notify_change("devices")
    return {"device": dev.device_public(d), "devices": dev.device_status(db)}


@router.post("/admin/devices/{device_id}/new-token")
def new_token(device_id: str, auth: Auth = Depends(ADMIN), db: Session = Depends(get_db)) -> dict[str, Any]:
    d = db.get(Device, device_id)
    if d is None:
        raise HTTPException(404, "Perangkat tidak ditemukan.")
    raw = dev.issue_device_token(d)
    access_entry(db, auth.user, f"Membuat token baru untuk {d.name}")
    db.commit()
    return {"token": raw, "device": dev.device_public(d)}


@router.delete("/admin/devices/{device_id}")
def delete_device(device_id: str, auth: Auth = Depends(ADMIN), db: Session = Depends(get_db)) -> dict[str, Any]:
    d = db.get(Device, device_id)
    if d is None:
        raise HTTPException(404, "Perangkat tidak ditemukan.")
    name, room, did = d.name, d.room, d.id
    db.delete(d)
    access_entry(db, auth.user, f"Menghapus perangkat {name}")
    db.commit()
    if air.release(room, did):
        broadcaster.publish("air", air.snapshot())
    notify_change("devices")
    return {"devices": dev.device_status(db)}
