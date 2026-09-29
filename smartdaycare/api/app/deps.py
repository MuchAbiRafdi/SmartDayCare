from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import delete
from sqlalchemy.orm import Session

from . import config
from .db import get_db
from .models import AuthSession, User
from .security import iso, now_iso, now_utc, origin_allowed, token_hash, write_limiter, client_ip

SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}

# Sesi bisa dibawa dua cara: cookie HttpOnly (bawaan) atau header khusus ini. Header dipakai
# klien hanya bila cookie terbukti tidak sampai ke server, mis. di balik proxy pratinjau yang
# membuang header Cookie, atau di dalam bingkai situs lain yang cookie pihak ketiganya diblokir.
SESSION_HEADER = "x-session"


@dataclass
class Auth:
    user: User
    session: AuthSession
    via: str = "cookie"  # "cookie" | "header"


def _session_token(request: Request) -> tuple[str, str]:
    header = (request.headers.get(SESSION_HEADER) or "").strip()
    if header:
        return header, "header"
    return request.cookies.get(config.SESSION_COOKIE) or "", "cookie"


def _load_auth(request: Request, db: Session) -> Auth | None:
    token, via = _session_token(request)
    if not token:
        return None
    sess = db.get(AuthSession, token_hash(token))
    if sess is None:
        return None
    now = now_iso()
    if sess.expires_at <= now:
        db.execute(delete(AuthSession).where(AuthSession.id == sess.id))
        db.commit()
        return None
    user = db.get(User, sess.user_id)
    if user is None or user.disabled:
        return None
    # perbarui "terakhir terlihat" paling sering sekali per menit agar tidak membebani basis data
    if sess.last_seen < iso(now_utc().replace(second=0, microsecond=0)):
        sess.last_seen = now
        db.commit()
    return Auth(user=user, session=sess, via=via)


def optional_auth(request: Request, db: Session = Depends(get_db)) -> Auth | None:
    return _load_auth(request, db)


def enforce_csrf(request: Request, auth: Auth) -> None:
    if request.method in SAFE_METHODS:
        return
    if auth.via == "cookie":
        # Cookie dikirim peramban secara otomatis, jadi wajib bukti bahwa permintaan berasal dari
        # halaman kita sendiri: asal yang dikenal + token CSRF yang cocok dengan cookie dan sesi.
        if not origin_allowed(request):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Permintaan ditolak: asal permintaan tidak dikenal.")
        header = request.headers.get("x-csrf-token", "")
        cookie = request.cookies.get(config.CSRF_COOKIE, "")
        if not header or header != cookie or header != auth.session.csrf:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Sesi perlu dimuat ulang. Segarkan halaman lalu coba lagi.")
    # Sesi lewat header X-Session tidak pernah disertakan peramban secara otomatis dari situs lain
    # (header khusus memicu pemeriksaan CORS yang tidak pernah kita izinkan), jadi CSRF tidak
    # mungkin; yang tetap berlaku hanya batas laju penulisan.
    if not write_limiter.allow(auth.user.id):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Terlalu banyak permintaan. Tunggu sebentar.")


def require_auth(request: Request, db: Session = Depends(get_db)) -> Auth:
    auth = _load_auth(request, db)
    if auth is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Silakan masuk terlebih dahulu.")
    enforce_csrf(request, auth)
    return auth


def require_roles(*roles: str) -> Callable[..., Auth]:
    def dep(auth: Auth = Depends(require_auth)) -> Auth:
        if auth.user.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Tidak tersedia untuk peran akun Anda.")
        return auth

    return dep


def public_origin_guard(request: Request) -> None:
    """Untuk endpoint tanpa sesi (masuk, daftar, kontak): tetap wajib same-origin."""
    if request.method not in SAFE_METHODS and not origin_allowed(request):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Permintaan ditolak: asal permintaan tidak dikenal.")


def ip_of(request: Request) -> str:
    return client_ip(request)
