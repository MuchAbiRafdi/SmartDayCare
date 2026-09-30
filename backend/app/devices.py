"""Perangkat fisik: sensor udara dan kamera.

Sensor mengirim pembacaan lewat HTTP (POST /api/devices/ingest dengan header X-Device-Token)
atau MQTT (SD_MQTT_URL; topik smartdaycare/sensors/<idPerangkat>, muatan JSON berisi token).
Kamera bisa (a) mengirim foto JPEG berkala ke POST /api/devices/snapshot, atau (b) diberi
alamat siaran (HLS .m3u8 / WHEP / MJPEG) yang diputar langsung oleh peramban.

Panduan pemasangan langkah demi langkah: docs/PERANGKAT.md.
"""
from __future__ import annotations

import json
import logging
import threading
import time
from datetime import UTC, datetime, timedelta
from typing import Any
from urllib.parse import urlparse

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import config, notify
from .db import SessionLocal
from .events import SENSOR_FRESH_MINUTES, air, broadcaster, notify_change
from .models import Device
from .security import new_id, new_token, now_iso, token_hash
from .seed import seed

logger = logging.getLogger("smartdaycare.devices")

SNAPSHOT_FRESH_SECONDS = 60
_snapshots: dict[str, tuple[bytes, str]] = {}  # id perangkat → (jpeg, waktu ISO)
_snap_lock = threading.Lock()


def _iso(s: str | None) -> datetime | None:
    if not s:
        return None
    return datetime.strptime(s, "%Y-%m-%dT%H:%M:%S.%fZ").replace(tzinfo=UTC)


def is_online(d: Device) -> bool:
    seen = _iso(d.last_seen)
    if seen is None:
        return False
    window = timedelta(minutes=SENSOR_FRESH_MINUTES) if d.kind == "sensor" else timedelta(seconds=SNAPSHOT_FRESH_SECONDS if not d.data.get("stream") else 24 * 3600)
    return seen >= datetime.now(UTC) - window


def issue_device_token(d: Device) -> str:
    raw = "sd_" + new_token()[:40]
    d.token_hash = token_hash(raw)
    return raw


def find_by_token(db: Session, raw: str | None) -> Device | None:
    if not raw or len(raw) > 120:
        return None
    d = db.scalar(select(Device).where(Device.token_hash == token_hash(raw)))
    if d is None or not d.enabled:
        return None
    return d


def validate_stream(url: str) -> tuple[str, str]:
    """Kembalikan (url, jenis) untuk alamat siaran kamera; jenis: hls | whep | mjpeg | image.

    Siaran harus dilayani dari domain situs ini (jalur `/stream/…` lewat Caddy → MediaMTX/go2rtc)
    agar bisa diputar peramban (kebijakan keamanan konten) dan hanya oleh pengguna yang sudah masuk.
    """
    u = url.strip()
    if u.lower().startswith("rtsp://"):
        raise ValueError("RTSP tidak bisa diputar peramban. Ubah dulu ke HLS/MJPEG dengan MediaMTX atau go2rtc, lalu isi alamat /stream/… (lihat docs/PERANGKAT.md).")
    p = urlparse(u)
    if u.startswith("/stream/"):
        p = urlparse("https://situs-ini" + u)
    elif p.scheme in ("http", "https") and p.netloc:
        public_host = urlparse(notify.PUBLIC_URL).netloc.lower() if notify.PUBLIC_URL else ""
        if not public_host or p.netloc.lower() != public_host:
            raise ValueError("Alamat siaran harus berada di domain situs ini, mis. /stream/ruang-bermain/index.m3u8 (lihat docs/PERANGKAT.md).")
        u = p.path + (f"?{p.query}" if p.query else "")
    else:
        raise ValueError("Isi alamat siaran dengan jalur /stream/… di domain situs ini (lihat docs/PERANGKAT.md).")
    low = p.path.lower()
    if low.endswith(".m3u8"):
        return u, "hls"
    if "whep" in low:
        return u, "whep"
    if low.endswith((".jpg", ".jpeg", ".png")):
        return u, "image"
    if low.endswith((".mjpg", ".mjpeg")) or "mjpeg" in low or "action=stream" in (p.query or "").lower():
        return u, "mjpeg"
    return u, "hls" if "hls" in low else "mjpeg"


# ------------------------------------------------------------------- ingest ----


def ingest_reading(db: Session, d: Device, payload: dict[str, Any]) -> dict[str, Any]:
    if d.kind != "sensor":
        raise ValueError("Perangkat ini bukan sensor.")
    clean: dict[str, Any] = {}
    limits = {"temp": (-10, 60), "hum": (0, 100), "co2": (300, 10000), "pm25": (0, 1000), "battery": (0, 100)}
    for k, (lo, hi) in limits.items():
        v = payload.get(k)
        if v is None or v == "":
            continue
        try:
            fv = float(v)
        except (TypeError, ValueError) as e:
            raise ValueError(f"Nilai {k} bukan angka.") from e
        if not lo <= fv <= hi:
            raise ValueError(f"Nilai {k} di luar rentang wajar ({lo}–{hi}).")
        clean[k] = fv
    if not any(k in clean for k in ("temp", "hum", "co2", "pm25")):
        raise ValueError("Tidak ada nilai sensor (temp, hum, co2, pm25) dalam kiriman.")
    was_fresh = is_online(d)
    reading = air.ingest(d.room, d.id, clean)
    d.last_seen = reading["at"]
    d.data = {**(d.data or {}), "last": clean}
    db.commit()
    broadcaster.publish("air", air.snapshot())
    if not was_fresh:
        notify_change("devices")  # kiriman pertama / tersambung lagi → status perangkat berubah
    return reading


def store_snapshot(db: Session, d: Device, jpeg: bytes) -> str:
    if d.kind != "camera":
        raise ValueError("Perangkat ini bukan kamera.")
    if len(jpeg) < 100 or not jpeg.startswith(b"\xff\xd8"):
        raise ValueError("Data bukan JPEG.")
    if len(jpeg) > config.MAX_SNAPSHOT_BYTES:
        raise ValueError(f"Foto terlalu besar (maks. {config.MAX_SNAPSHOT_BYTES // 1024} KB).")
    at = now_iso()
    with _snap_lock:
        _snapshots[d.id] = (jpeg, at)
    d.last_seen = at
    db.commit()
    notify_change("camera", id=d.id, at=at)
    return at


def latest_snapshot(device_id: str) -> tuple[bytes, str] | None:
    with _snap_lock:
        return _snapshots.get(device_id)


# ------------------------------------------------------------------- daftar ----


def device_public(d: Device) -> dict[str, Any]:
    online = is_online(d)
    last = (d.data or {}).get("last") or {}
    if d.kind == "sensor":
        detail = "Mengirim pembacaan" if online else ("Belum pernah mengirim" if not d.last_seen else "Tidak ada kiriman > 10 menit")
        if online and last.get("battery") is not None:
            detail += f" · baterai {int(last['battery'])}%"
    else:
        stream = (d.data or {}).get("stream")
        if stream:
            detail = f"Siaran {str((d.data or {}).get('streamKind', '')).upper()} terpasang"
        else:
            detail = "Foto berkala diterima" if online else ("Belum ada foto" if not d.last_seen else "Foto terakhir > 1 menit lalu")
    return {
        "id": d.id,
        "kind": d.kind,
        "label": d.name,
        "room": d.room,
        "ok": online,
        "detail": detail,
        "at": d.last_seen,
        "enabled": d.enabled,
        "parents": d.parents,
        "stream": (d.data or {}).get("stream"),
        "streamKind": (d.data or {}).get("streamKind"),
        "createdAt": d.created_at,
        "source": "device",
    }


def builtin_devices() -> list[dict[str, Any]]:
    """Perangkat contoh dari data awal (hanya mode data contoh) — ditandai sebagai bawaan."""
    if not config.SAMPLE_DATA:
        return []
    s = seed()
    snap = air.snapshot()
    out: list[dict[str, Any]] = []
    for cam in s["cameras"]:
        out.append({"id": cam["id"], "kind": "camera", "label": cam["label"], "room": cam["room"], "ok": True, "detail": "Gambar contoh (kamera belum dipasang)", "at": snap["updatedAt"], "parents": cam["parents"], "source": "builtin"})
    for sen in s["sensors"]:
        out.append({"id": sen["id"], "kind": "sensor", "label": f"Sensor {sen['id'][1:]}", "room": sen["room"], "ok": True, "detail": "Nilai contoh (sensor belum dipasang)", "at": snap["updatedAt"], "source": "builtin"})
    return out


def device_status(db: Session) -> list[dict[str, Any]]:
    real = [device_public(d) for d in db.scalars(select(Device).order_by(Device.created_at)).all()]
    covered = {(d["kind"], d["room"]) for d in real if d["enabled"]}
    # perangkat contoh disembunyikan bila ruangan itu sudah punya perangkat sungguhan sejenis
    return real + [b for b in builtin_devices() if (b["kind"], b["room"]) not in covered]


def cameras_for(db: Session, parent: bool) -> list[dict[str, Any]]:
    """Daftar kamera untuk state: kamera terdaftar + kamera contoh (mode data contoh)."""
    out: list[dict[str, Any]] = []
    rows = db.scalars(select(Device).where(Device.kind == "camera", Device.enabled.is_(True)).order_by(Device.created_at)).all()
    covered: set[str] = set()
    for d in rows:
        if parent and not d.parents:
            continue
        covered.add(d.room)
        snap = latest_snapshot(d.id)
        out.append(
            {
                "id": d.id,
                "label": d.name,
                "room": d.room,
                "img": f"/api/devices/{d.id}/snapshot.jpg" if snap else None,
                "stream": (d.data or {}).get("stream"),
                "streamKind": (d.data or {}).get("streamKind"),
                "parents": d.parents,
                "source": "device",
                "online": is_online(d),
                "at": d.last_seen,
                "view": (d.data or {}).get("streamKind") or "snapshot",
            }
        )
    if config.SAMPLE_DATA:
        for c in seed()["cameras"]:
            if c["room"] in covered or (parent and not c.get("parents")):
                continue
            out.append({**c, "source": "builtin", "online": True, "stream": None, "streamKind": None, "at": None, "view": "image"})
    return out


# ---------------------------------------------------------------- jembatan MQTT ----


class MqttBridge(threading.Thread):
    """Berlangganan topik sensor di broker MQTT dan meneruskannya ke pembacaan udara."""

    def __init__(self, url: str, topic: str) -> None:
        super().__init__(name="mqtt-bridge", daemon=True)
        self.url = url
        self.topic = topic

    def run(self) -> None:  # pragma: no cover - butuh broker
        try:
            import paho.mqtt.client as mqtt  # type: ignore[import-not-found]
        except ImportError:
            logger.warning("SD_MQTT_URL diset tetapi paket paho-mqtt belum terpasang (pip install paho-mqtt)")
            return
        u = urlparse(self.url)
        client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="smartdaycare-api")
        if u.username:
            client.username_pw_set(u.username, u.password)
        if u.scheme in ("mqtts", "ssl"):
            client.tls_set()

        def on_connect(c: Any, _u: Any, _f: Any, rc: Any, _p: Any = None) -> None:
            logger.info("MQTT terhubung (%s); berlangganan %s", rc, self.topic)
            c.subscribe(self.topic)

        def on_message(_c: Any, _u: Any, msg: Any) -> None:
            try:
                payload = json.loads(msg.payload.decode("utf-8"))
            except (UnicodeDecodeError, json.JSONDecodeError):
                logger.warning("MQTT: muatan bukan JSON pada %s", msg.topic)
                return
            with SessionLocal() as db:
                d = find_by_token(db, str(payload.get("token") or ""))
                if d is None:
                    logger.warning("MQTT: token perangkat tidak dikenal pada %s", msg.topic)
                    return
                try:
                    ingest_reading(db, d, payload)
                except ValueError as e:
                    logger.warning("MQTT: %s (%s)", e, d.id)

        client.on_connect = on_connect
        client.on_message = on_message
        while True:
            try:
                client.connect(u.hostname or "localhost", u.port or (8883 if u.scheme in ("mqtts", "ssl") else 1883), keepalive=60)
                client.loop_forever(retry_first_connection=True)
            except Exception as e:  # noqa: BLE001
                logger.warning("MQTT terputus: %s — mencoba lagi dalam 30 detik", e)
                time.sleep(30)


def start_mqtt_bridge() -> None:
    if config.MQTT_URL:
        MqttBridge(config.MQTT_URL, config.MQTT_TOPIC).start()


def new_device(db: Session, *, kind: str, name: str, room: str, parents: bool = False, stream: str | None = None) -> tuple[Device, str | None]:
    """Buat perangkat; token mentah dikembalikan sekali (None bila kamera dengan alamat siaran)."""
    d = Device(id=new_id("D"), kind=kind, name=name.strip(), room=room.strip(), enabled=True, created_at=now_iso(), data={}, parents=parents)
    raw: str | None = None
    if stream:
        url, sk = validate_stream(stream)
        d.data = {"stream": url, "streamKind": sk}
        d.last_seen = now_iso()
    if kind == "sensor" or not stream:
        raw = issue_device_token(d)
    db.add(d)
    db.commit()
    return d, raw
