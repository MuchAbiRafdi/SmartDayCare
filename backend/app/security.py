"""Primitif keamanan: hash kata sandi, token sesi, pembatas laju, pemeriksaan origin."""
from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
import threading
import time
from collections import deque
from datetime import UTC, datetime, timedelta
from urllib.parse import urlsplit

from fastapi import Request, Response

from . import config

# --- Waktu ---------------------------------------------------------------------------------


def now_utc() -> datetime:
    return datetime.now(UTC)


def iso(dt: datetime) -> str:
    return dt.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%S.") + f"{dt.microsecond // 1000:03d}Z"


def now_iso() -> str:
    return iso(now_utc())


def parse_iso(s: str) -> datetime:
    return datetime.strptime(s, "%Y-%m-%dT%H:%M:%S.%fZ").replace(tzinfo=UTC)


# --- Kata sandi (scrypt, tanpa dependensi eksternal) ---------------------------------------

_SCRYPT_N, _SCRYPT_R, _SCRYPT_P = 2**14, 8, 1


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=_SCRYPT_N, r=_SCRYPT_R, p=_SCRYPT_P, dklen=32)
    return "scrypt$%d$%d$%d$%s$%s" % (
        _SCRYPT_N,
        _SCRYPT_R,
        _SCRYPT_P,
        base64.b64encode(salt).decode(),
        base64.b64encode(digest).decode(),
    )


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, n, r, p, salt_b64, digest_b64 = stored.split("$")
        if algo != "scrypt":
            return False
        salt = base64.b64decode(salt_b64)
        expected = base64.b64decode(digest_b64)
        actual = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=int(n), r=int(r), p=int(p), dklen=len(expected))
        return hmac.compare_digest(actual, expected)
    except (ValueError, TypeError):
        return False


def password_score(pw: str) -> int:
    """Skor 0–4, sama dengan penilaian di formulir pendaftaran."""
    s = 0
    if len(pw) >= 8:
        s += 1
    if len(pw) >= 12:
        s += 1
    if any(c.isupper() for c in pw) and any(c.islower() for c in pw):
        s += 1
    if any(c.isdigit() for c in pw) or any(not c.isalnum() for c in pw):
        s += 1
    return min(s, 4)


# --- Token ---------------------------------------------------------------------------------


def new_token() -> str:
    return secrets.token_urlsafe(32)


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def new_id(prefix: str) -> str:
    return f"{prefix}-{secrets.token_hex(4).upper()}"


# Huruf/angka yang tidak mudah tertukar saat dibacakan (tanpa 0/O, 1/I/l).
_READABLE = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"


def temp_password() -> str:
    """Kata sandi sementara ~36 bit acak, mudah dibacakan: Ceria-XXXX-XXXX (wajib diganti saat masuk)."""
    part = lambda: "".join(secrets.choice(_READABLE) for _ in range(4))  # noqa: E731
    return f"Ceria-{part()}-{part()}"


def readable_part(n: int = 4) -> str:
    return "".join(secrets.choice(_READABLE) for _ in range(n))


def new_invite_code(role: str) -> str:
    """Kode undangan orang tua/staf/admin, mis. ORTU-7K3M-Q2WD atau STAF-7K3M-Q2WD."""
    prefix = "ADMIN" if role == "admin" else ("ORTU" if role == "parent" else "STAF")
    return f"{prefix}-{readable_part()}-{readable_part()}"


def new_child_code() -> str:
    """Kode anak KA-#### (4 angka acak, bukan berurutan); keunikan diperiksa pemanggil."""
    return "KA-" + "".join(secrets.choice("0123456789") for _ in range(4))


# --- Pembatas laju (dalam memori; per proses) ---------------------------------------------


class RateLimiter:
    def __init__(self, limit: int, window_s: float) -> None:
        self.limit = limit
        self.window = window_s
        self._hits: dict[str, deque[float]] = {}
        self._lock = threading.Lock()

    def allow(self, key: str) -> bool:
        now = time.monotonic()
        with self._lock:
            q = self._hits.setdefault(key, deque())
            while q and now - q[0] > self.window:
                q.popleft()
            if len(q) >= self.limit:
                return False
            q.append(now)
            if len(self._hits) > 5000:  # cegah pertumbuhan tak terbatas
                for k in [k for k, v in self._hits.items() if not v or now - v[-1] > self.window]:
                    self._hits.pop(k, None)
            return True


login_limiter = RateLimiter(config.LOGIN_PER_MINUTE, 60)
write_limiter = RateLimiter(config.WRITE_PER_MINUTE, 60)
public_limiter = RateLimiter(20, 60)
# percobaan kode anak per akun: 8 per 15 menit (kode 4 angka tidak bisa ditebak dengan menyapu)
link_limiter = RateLimiter(8, 900)


def client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "?"


# --- Origin / cookie -----------------------------------------------------------------------


def request_is_secure(request: Request) -> bool:
    if config.COOKIE_SECURE_ENV is not None:
        return config.COOKIE_SECURE_ENV in ("1", "true", "yes")
    proto = request.headers.get("x-forwarded-proto") or request.url.scheme
    return proto == "https"


def cookie_attrs(request: Request) -> dict[str, object]:
    """Atribut cookie sesi/CSRF yang konsisten untuk set maupun hapus.

    Saat SameSite=None (aplikasi dibingkai situs lain), cookie juga diberi atribut Partitioned
    (CHIPS) supaya peramban yang memblokir cookie pihak ketiga tetap menyimpannya khusus untuk
    kombinasi situs induk + aplikasi ini.
    """
    samesite = config.COOKIE_SAMESITE
    secure = request_is_secure(request) or samesite == "none"
    attrs: dict[str, object] = {"samesite": samesite, "secure": secure, "path": "/"}
    if samesite == "none":
        attrs["partitioned"] = True
    return attrs


def _mark_partitioned(response: Response) -> None:
    """Tambahkan atribut Partitioned pada header Set-Cookie terakhir.

    Ditulis manual karena http.cookies bawaan Python < 3.14 belum mengenal atribut ini.
    """
    if not response.raw_headers:
        return
    key, val = response.raw_headers[-1]
    if key == b"set-cookie" and b"partitioned" not in val.lower():
        response.raw_headers[-1] = (key, val + b"; Partitioned")


def set_cookie(response: Response, request: Request, name: str, value: str, *, max_age: int | None, httponly: bool) -> None:
    attrs = cookie_attrs(request)
    partitioned = bool(attrs.pop("partitioned", False))
    response.set_cookie(name, value, max_age=max_age, httponly=httponly, **attrs)  # type: ignore[arg-type]
    if partitioned:
        _mark_partitioned(response)


def clear_cookie(response: Response, request: Request, name: str, *, httponly: bool) -> None:
    attrs = cookie_attrs(request)
    partitioned = bool(attrs.pop("partitioned", False))
    response.delete_cookie(name, httponly=httponly, **attrs)  # type: ignore[arg-type]
    if partitioned:
        _mark_partitioned(response)


def public_host(request: Request) -> str:
    """Host publik yang dilihat peramban; menghormati X-Forwarded-Host dari reverse proxy."""
    fwd = request.headers.get("x-forwarded-host") or ""
    host = fwd.split(",")[0].strip() if fwd else (request.headers.get("host") or "")
    return host.lower()


def origin_allowed(request: Request) -> bool:
    """Permintaan pengubah data harus datang dari situs ini sendiri (atau origin yang diizinkan).

    Urutan pemeriksaan:
    1. Sec-Fetch-Site (dikirim peramban modern, tidak bisa dipalsukan halaman lain dan tidak
       bergantung pada header Host yang mungkin diubah proxy): same-origin → lolos, cross-site → tolak.
    2. Origin (atau Referer) dibandingkan dengan host publik / daftar origin yang diizinkan.
    """
    site = (request.headers.get("sec-fetch-site") or "").lower()
    if site == "same-origin":
        return True
    if site == "cross-site":
        return False
    # Header khusus dari klien kita sendiri. Halaman situs lain tidak bisa menambahkannya tanpa
    # izin CORS (yang tidak pernah diberikan), jadi ini bukti asal yang tidak bergantung pada
    # Origin/Referer — dua header yang kerap diubah atau dibuang oleh proxy di depan aplikasi.
    if request.headers.get("x-requested-with") == "SmartDaycare":
        return True
    origin = request.headers.get("origin") or ""
    if not origin or origin == "null":
        ref = request.headers.get("referer") or ""
        if not ref:
            return not origin  # klien non-browser; dilindungi oleh cookie+CSRF header
        parts = urlsplit(ref)
        origin = f"{parts.scheme}://{parts.netloc}"
    if origin in config.ALLOWED_ORIGINS:
        return True
    return urlsplit(origin).netloc.lower() == public_host(request)


def session_lifetime(remember: bool) -> timedelta:
    return timedelta(days=config.REMEMBER_DAYS) if remember else timedelta(hours=config.SESSION_HOURS)
