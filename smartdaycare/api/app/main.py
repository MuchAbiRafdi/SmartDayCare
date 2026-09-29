from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager
from datetime import datetime, timedelta

from fastapi import FastAPI, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy import delete, update

from . import backup, config, notify
from .alerts import daily_summaries
from .db import SessionLocal, add_missing_columns, engine
from .devices import start_mqtt_bridge
from .events import air_loop, broadcaster, notify_change
from .models import AuthSession, Base, LogEntry, Token
from .routers import account, admin, auth, cctv, chat, devices, events, insights, log, records, state, trust
from .samples import ensure_routine_samples, ensure_social_samples
from .security import iso, now_iso, now_utc
from .seed import ensure_seeded

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("smartdaycare")


def housekeeping() -> None:
    """Hapus sesi kedaluwarsa, foto lama, dan catatan di luar masa simpan."""
    with SessionLocal() as db:
        now = now_utc()
        db.execute(delete(AuthSession).where(AuthSession.expires_at <= iso(now)))
        photo_cut = iso(now - timedelta(days=config.PHOTO_KEEP_DAYS))
        db.execute(update(LogEntry).where(LogEntry.at < photo_cut).values(photo=None, photo_pre=None, photo_post=None))
        log_cut = iso(now - timedelta(days=config.LOG_KEEP_DAYS))
        db.execute(delete(LogEntry).where(LogEntry.at < log_cut))
        db.execute(delete(Token).where(Token.expires_at <= iso(now - timedelta(days=1))))
        db.commit()


def scheduled_minute() -> None:
    """Tugas per menit: ringkasan harian (17.30) dan cadangan basis data (sekali per hari, 02.00)."""
    with SessionLocal() as db:
        daily_summaries(db)
        if config.SAMPLE_DATA:
            # catatan contoh hari ini muncul bertahap mengikuti jam fasilitas
            if ensure_routine_samples(db):
                notify_change("log", type="sample")
    if backup.sqlite_path() is not None:
        last = backup.last_backup()
        stale = last is None or (now_utc().timestamp() - (config.BACKUP_DIR / str(last["file"])).stat().st_mtime) > 20 * 3600
        if stale and datetime.now().hour >= 2:
            backup.run_backup()


async def scheduler_loop() -> None:
    while True:
        await asyncio.sleep(60)
        try:
            await asyncio.to_thread(scheduled_minute)
        except Exception:  # pragma: no cover
            logger.exception("Tugas terjadwal gagal")


async def housekeeping_loop() -> None:
    while True:
        try:
            await asyncio.to_thread(housekeeping)
        except Exception:  # pragma: no cover - dicatat, tidak menghentikan layanan
            logger.exception("Pembersihan berkala gagal")
        await asyncio.sleep(6 * 3600)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    Base.metadata.create_all(engine)
    add_missing_columns(Base.metadata)
    with SessionLocal() as db:
        ensure_seeded(db)
        if config.SAMPLE_DATA:
            try:
                ensure_routine_samples(db)
                ensure_social_samples(db)
            except Exception:  # pragma: no cover - data contoh tidak boleh menghalangi layanan
                logger.exception("Data contoh harian gagal dibuat")
    broadcaster.bind(asyncio.get_running_loop())
    notify.start_worker()
    start_mqtt_bridge()
    tasks = [asyncio.create_task(air_loop()), asyncio.create_task(housekeeping_loop()), asyncio.create_task(scheduler_loop())]
    ch = notify.channels()
    logger.info("SmartDaycare API siap (%s) · email: %s · WhatsApp: %s · data contoh: %s", config.ENV, ch["email"] or "tidak diatur", ch["wa"] or "tidak diatur", "ya" if config.SAMPLE_DATA else "tidak")
    try:
        yield
    finally:
        for t in tasks:
            t.cancel()
        notify.worker.stop()


app = FastAPI(title="SmartDaycare AI API", version="2.0.0", lifespan=lifespan, docs_url="/api/docs" if config.ENV != "production" else None, redoc_url=None, openapi_url="/api/openapi.json" if config.ENV != "production" else None)


@app.middleware("http")
async def security_headers(request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Permissions-Policy", "camera=(self), microphone=(), geolocation=()")
    if request.url.path.startswith("/api") and "Cache-Control" not in response.headers:
        response.headers["Cache-Control"] = "no-store"
    return response


@app.exception_handler(RequestValidationError)
async def validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
    first = exc.errors()[0] if exc.errors() else {}
    loc = ".".join(str(p) for p in first.get("loc", []) if p != "body")
    msg = first.get("msg", "Data tidak valid.")
    if msg.startswith("Value error, "):
        msg = msg[len("Value error, ") :]
    return JSONResponse(status_code=422, content={"detail": f"{loc}: {msg}" if loc else msg, "errors": exc.errors()})


for r in (auth.router, state.router, log.router, records.router, admin.router, account.router, events.router, devices.router, chat.router, cctv.router, trust.router, insights.router):
    app.include_router(r)


@app.get("/", include_in_schema=False)
def root() -> dict:
    return {"service": "SmartDaycare AI API", "time": now_iso()}
