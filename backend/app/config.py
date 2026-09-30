"""Konfigurasi layanan API SmartDaycare AI.

Semua nilai dapat diubah lewat variabel lingkungan (lihat .env.example).
"""
from __future__ import annotations

import os
import secrets
from pathlib import Path



def env(name: str, default: str | None = None) -> str | None:
    """Baca variabel lingkungan; nilai kosong/spasi dianggap tidak diset (aman untuk file .env)."""
    v = os.getenv(name)
    if v is None or not v.strip():
        return default
    return v.strip()


BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = Path(env("SD_DATA_DIR") or (BASE_DIR / "data"))
DATA_DIR.mkdir(parents=True, exist_ok=True)

# Basis data: SQLite bawaan (nol konfigurasi). Ganti ke PostgreSQL cukup lewat URL, mis.
# postgresql+psycopg://user:pass@host/db
DATABASE_URL = env("SD_DATABASE_URL", f"sqlite:///{DATA_DIR / 'smartdaycare.db'}")

# Kunci rahasia dipakai untuk menandatangani token CSRF. Bila tidak diset, dibuat acak saat
# proses dimulai (sesi tetap valid karena token sesi disimpan sebagai hash di basis data).
SECRET_KEY = env("SD_SECRET_KEY") or secrets.token_urlsafe(32)

# Nama cookie
SESSION_COOKIE = "sd_session"
CSRF_COOKIE = "sd_csrf"

# Umur sesi
SESSION_HOURS = int(env("SD_SESSION_HOURS", "12") or 12)
REMEMBER_DAYS = int(env("SD_REMEMBER_DAYS", "30") or 30)

# Cookie Secure otomatis mengikuti skema permintaan (X-Forwarded-Proto dihormati).
# Paksa dengan SD_COOKIE_SECURE=1/0.
COOKIE_SECURE_ENV = env("SD_COOKIE_SECURE")
# SameSite cookie: "lax" (bawaan). "none" hanya bila aplikasi harus berjalan di dalam iframe
# lintas situs (mis. pratinjau tersemat); saat "none", cookie otomatis diberi atribut Secure.
COOKIE_SAMESITE = (env("SD_COOKIE_SAMESITE") or "lax").lower()
if COOKIE_SAMESITE not in ("lax", "strict", "none"):
    COOKIE_SAMESITE = "lax"

# Origin tambahan yang diizinkan mengirim permintaan pengubah data (selain same-origin).
ALLOWED_ORIGINS = [o.strip() for o in (env("SD_ALLOWED_ORIGINS") or "").split(",") if o.strip()]

# Zona waktu fasilitas untuk batas "hari ini" di sisi server.
TIMEZONE = env("SD_TIMEZONE", "Asia/Jakarta")

# Batas ukuran foto piring yang diterima (data URL JPEG) dan masa simpannya.
MAX_PHOTO_BYTES = int(env("SD_MAX_PHOTO_BYTES") or 160 * 1024)
PHOTO_KEEP_DAYS = int(env("SD_PHOTO_KEEP_DAYS") or 3)
# Catatan harian dipakai laporan semester (180 hari) beserta periode pembandingnya, jadi masa
# simpannya harus lebih dari setahun. Foto tetap dihapus lebih cepat (lihat PHOTO_KEEP_DAYS).
LOG_KEEP_DAYS = int(env("SD_LOG_KEEP_DAYS") or 400)

# Pembatas laju
LOGIN_PER_MINUTE = int(env("SD_LOGIN_PER_MINUTE") or 10)
LOCKOUT_FAILS = int(env("SD_LOCKOUT_FAILS") or 5)
LOCKOUT_MINUTES = int(env("SD_LOCKOUT_MINUTES") or 15)
WRITE_PER_MINUTE = int(env("SD_WRITE_PER_MINUTE") or 120)

# Interval pembacaan sensor udara (detik)
AIR_INTERVAL = float(env("SD_AIR_INTERVAL") or 5)

ENV = env("SD_ENV") or "development"

# Mode data contoh (bawaan aktif): basis data kosong diisi anak, akun, dan catatan contoh,
# dan pembacaan udara contoh dihasilkan untuk ruangan tanpa sensor. Set 0 untuk fasilitas
# sungguhan: mulai kosong dengan satu akun admin dari SD_ADMIN_EMAIL / SD_ADMIN_PASSWORD.
SAMPLE_DATA = (env("SD_SAMPLE_DATA") or "1") != "0"
ADMIN_EMAIL = (env("SD_ADMIN_EMAIL") or "").lower()
ADMIN_NAME = env("SD_ADMIN_NAME") or "Admin Daycare"
ADMIN_PASSWORD = env("SD_ADMIN_PASSWORD")

# Cadangan basis data SQLite harian (kosong = api/data/backups; 0 hari = nonaktif)
BACKUP_DIR = Path(env("SD_BACKUP_DIR") or (DATA_DIR / "backups"))
BACKUP_KEEP_DAYS = int(env("SD_BACKUP_KEEP_DAYS") or 14)

# Jembatan MQTT opsional untuk sensor (mis. mqtt://user:pass@broker:1883). Butuh paket paho-mqtt.
MQTT_URL = env("SD_MQTT_URL")
MQTT_TOPIC = env("SD_MQTT_TOPIC") or "smartdaycare/sensors/+"

# Umur maksimum foto kamera yang dikirim perangkat (byte) — kamera murah mengirim JPEG kecil
MAX_SNAPSHOT_BYTES = int(env("SD_MAX_SNAPSHOT_BYTES") or 400 * 1024)
