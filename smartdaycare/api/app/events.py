"""Siaran peristiwa langsung (SSE), pembacaan udara, dan status perangkat.

Sumber pembacaan udara per ruangan:
- `sensor`  : perangkat fisik yang mengirim ke POST /api/devices/ingest (atau lewat jembatan MQTT).
- `builtin` : nilai contoh yang dihasilkan proses ini — hanya pada mode data contoh
              (SD_SAMPLE_DATA=1) dan hanya untuk ruangan yang belum punya sensor. Antarmuka
              menandainya sebagai nilai contoh.
- `none`    : belum ada pembacaan (mode produksi sebelum sensor dipasang).
"""
from __future__ import annotations

import asyncio
import json
import random
import threading
from datetime import UTC, datetime, timedelta
from typing import Any

from .config import AIR_INTERVAL, SAMPLE_DATA
from .seed import seed
from .security import now_iso

SENSOR_FRESH_MINUTES = 10  # pembacaan sensor dianggap segar selama 10 menit


class Broadcaster:
    def __init__(self) -> None:
        self._subs: set[asyncio.Queue[str]] = set()
        self._loop: asyncio.AbstractEventLoop | None = None
        self._lock = threading.Lock()

    def bind(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    def subscribe(self) -> asyncio.Queue[str]:
        q: asyncio.Queue[str] = asyncio.Queue(maxsize=64)
        with self._lock:
            self._subs.add(q)
        return q

    def unsubscribe(self, q: asyncio.Queue[str]) -> None:
        with self._lock:
            self._subs.discard(q)

    def publish(self, event: str, data: dict[str, Any]) -> None:
        """Aman dipanggil dari thread request (sync) maupun dari loop asyncio."""
        msg = f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"
        loop = self._loop
        if loop is None:
            return
        try:
            running = asyncio.get_running_loop()
        except RuntimeError:
            running = None
        if running is loop:
            self._fanout(msg)
        else:
            loop.call_soon_threadsafe(self._fanout, msg)

    def _fanout(self, msg: str) -> None:
        with self._lock:
            subs = list(self._subs)
        for q in subs:
            if q.full():
                try:
                    q.get_nowait()
                except asyncio.QueueEmpty:
                    pass
            q.put_nowait(msg)

    @property
    def count(self) -> int:
        return len(self._subs)


broadcaster = Broadcaster()


def notify_change(kind: str, **extra: Any) -> None:
    broadcaster.publish("change", {"kind": kind, **extra})


def _parse_iso(s: str) -> datetime:
    return datetime.strptime(s, "%Y-%m-%dT%H:%M:%S.%fZ").replace(tzinfo=UTC)


class AirMonitor:
    """Pembacaan udara per ruangan; riwayat CO₂ 12 titik terakhir per ruangan."""

    def __init__(self) -> None:
        s = seed()
        self.rooms: list[str] = [r["room"] for r in s["air"]]
        self.base: dict[str, dict[str, Any]] = {r["room"]: dict(r) for r in s["air"]}
        self.readings: dict[str, dict[str, Any]] = {}
        for r in s["air"]:
            room = r["room"]
            if SAMPLE_DATA:
                self.readings[room] = {**r, "source": "builtin", "at": now_iso()}
            else:
                self.readings[room] = {"room": room, "temp": None, "hum": None, "co2": None, "pm25": None, "source": "none", "at": None}
        self.history: dict[str, list[int]] = {k: list(v)[-12:] for k, v in s["co2History"].items()} if SAMPLE_DATA else {}
        self.updated_at = now_iso()
        self._lock = threading.Lock()

    def _fresh(self, cur: dict[str, Any]) -> bool:
        at = cur.get("at")
        if cur.get("source") != "sensor" or not at:
            return False
        return _parse_iso(at) >= datetime.now(UTC) - timedelta(minutes=SENSOR_FRESH_MINUTES)

    def step(self) -> tuple[bool, bool]:
        """Satu langkah pemantauan. Mengembalikan (ada perubahan nilai, ada sensor yang baru terhenti).

        Sensor yang berhenti mengirim > SENSOR_FRESH_MINUTES ditandai `stale` dan nilai terakhirnya
        dipertahankan — tidak diganti nilai contoh, supaya tidak ada angka yang tampak hidup padahal
        sumbernya mati. Nilai contoh hanya bergerak untuk ruangan yang belum pernah punya sensor.
        """
        changed = False
        went_stale = False
        with self._lock:
            for room, cur in self.readings.items():
                if self._fresh(cur):
                    continue
                if cur.get("source") == "sensor":
                    cur["source"] = "stale"  # sensor berhenti mengirim
                    changed = went_stale = True
                    continue
                if cur.get("source") == "stale" or not SAMPLE_DATA:
                    continue
                base = self.base.get(room)
                if base is None:
                    continue  # ruangan dari perangkat (bukan dari data contoh): tanpa sensor = tanpa nilai
                if cur.get("source") != "builtin":
                    cur.update({k: base[k] for k in ("temp", "hum", "co2", "pm25")})
                    cur["source"] = "builtin"
                cur["temp"] = round(min(base["temp"] + 0.7, max(base["temp"] - 0.7, cur["temp"] + random.uniform(-0.15, 0.15))), 1)
                cur["hum"] = int(min(base["hum"] + 4, max(base["hum"] - 4, cur["hum"] + random.choice((-1, 0, 0, 1)))))
                cur["co2"] = int(min(base["co2"] + 90, max(base["co2"] - 60, cur["co2"] + random.randint(-12, 14))))
                cur["pm25"] = int(min(base["pm25"] + 6, max(base["pm25"] - 4, cur["pm25"] + random.choice((-1, 0, 0, 1)))))
                cur["at"] = now_iso()
                h = self.history.setdefault(room, [])
                h.append(cur["co2"])
                del h[:-12]
                changed = True
            if changed:
                self.updated_at = now_iso()
        return changed, went_stale

    def ingest(self, room: str, device_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        """Terima pembacaan dari perangkat fisik. Ruangan baru ditambahkan bila belum ada."""
        with self._lock:
            cur = self.readings.get(room)
            if cur is None:
                cur = {"room": room}
                self.readings[room] = cur
                self.rooms.append(room)
            for k in ("temp", "hum", "co2", "pm25"):
                if payload.get(k) is not None:
                    cur[k] = round(float(payload[k]), 1) if k == "temp" else int(round(float(payload[k])))
            if payload.get("battery") is not None:
                cur["battery"] = int(payload["battery"])
            cur["source"] = "sensor"
            cur["deviceId"] = device_id
            cur["at"] = now_iso()
            if cur.get("co2") is not None:
                h = self.history.setdefault(room, [])
                h.append(int(cur["co2"]))
                del h[:-12]
            self.updated_at = cur["at"]
            return dict(cur)

    def release(self, room: str, device_id: str) -> bool:
        """Perangkat dihapus/dinonaktifkan: lepaskan pembacaannya. Ruangan dari data contoh kembali ke
        nilai contoh (mode data contoh) atau kosong; ruangan yang hanya ada karena perangkat itu dihapus."""
        with self._lock:
            cur = self.readings.get(room)
            if cur is None or cur.get("deviceId") != device_id:
                return False
            base = self.base.get(room)
            if base is None:
                del self.readings[room]
                self.rooms.remove(room)
                self.history.pop(room, None)
            elif SAMPLE_DATA:
                self.readings[room] = {**base, "source": "builtin", "at": now_iso()}
                self.history[room] = []  # deret sensor tidak dicampur dengan nilai contoh
            else:
                self.readings[room] = {"room": room, "temp": None, "hum": None, "co2": None, "pm25": None, "source": "none", "at": None}
                self.history.pop(room, None)
            self.updated_at = now_iso()
            return True

    def snapshot(self) -> dict[str, Any]:
        with self._lock:
            return {
                "readings": [dict(self.readings[r]) for r in self.rooms],
                "history": {k: list(v) for k, v in self.history.items()},
                "updatedAt": self.updated_at,
                "sample": SAMPLE_DATA,
            }


air = AirMonitor()


async def air_loop() -> None:
    while True:
        await asyncio.sleep(AIR_INTERVAL)
        changed, went_stale = air.step()
        if changed:
            broadcaster.publish("air", air.snapshot())
        if went_stale:
            notify_change("devices")  # status perangkat di dasbor ikut berubah menjadi "terputus"
