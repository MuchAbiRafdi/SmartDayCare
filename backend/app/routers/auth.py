from __future__ import annotations

from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from .. import config
from ..db import get_db
from ..deps import Auth, optional_auth, public_origin_guard, require_auth
from ..events import notify_change
from ..logic import local_clock
from ..models import AuthSession, Child, InviteCode, LogEntry, ParentChild, User
from ..alerts import consume_token, recent_token, send_reset, send_verification
from ..schemas import ForgotIn, LoginIn, RegisterIn, ResetIn, VerifyIn
from ..security import (
    clear_cookie,
    client_ip,
    hash_password,
    iso,
    login_limiter,
    new_id,
    new_token,
    now_iso,
    now_utc,
    password_score,
    session_lifetime,
    set_cookie,
    token_hash,
    verify_password,
)
from ..serialize import user_public

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _set_cookies(response: Response, request: Request, token: str, csrf: str, remember: bool) -> None:
    max_age = int(session_lifetime(remember).total_seconds()) if remember else None
    set_cookie(response, request, config.SESSION_COOKIE, token, max_age=max_age, httponly=True)
    set_cookie(response, request, config.CSRF_COOKIE, csrf, max_age=max_age, httponly=False)


def clear_cookies(response: Response, request: Request) -> None:
    clear_cookie(response, request, config.SESSION_COOKIE, httponly=True)
    clear_cookie(response, request, config.CSRF_COOKIE, httponly=False)


def start_session(db: Session, request: Request, response: Response, user: User, remember: bool) -> str:
    """Buat sesi baru; pasang cookie dan kembalikan token mentahnya untuk klien yang harus
    membawa sesi lewat header (lihat deps.SESSION_HEADER)."""
    token = new_token()
    csrf = new_token()
    now = now_utc()
    db.add(
        AuthSession(
            id=token_hash(token),
            user_id=user.id,
            created_at=iso(now),
            expires_at=iso(now + session_lifetime(remember)),
            last_seen=iso(now),
            remember=remember,
            ip=client_ip(request)[:64],
            agent=(request.headers.get("user-agent") or "")[:200],
            csrf=csrf,
        )
    )
    # bersihkan sesi kedaluwarsa milik pengguna ini
    db.execute(delete(AuthSession).where(AuthSession.user_id == user.id, AuthSession.expires_at <= iso(now)))
    db.commit()
    _set_cookies(response, request, token, csrf, remember)
    return token


def access_entry(db: Session, user: User, title: str, text: str = "", silent: bool = True, entry_type: str = "access") -> LogEntry:
    e = LogEntry(
        id=new_id("L"),
        type=entry_type,
        child_id=None,
        child_name=None,
        user_id=user.id,
        by_name=user.name,
        role=user.role,
        at=now_iso(),
        sev="low",
        title=title,
        text=text,
        silent=silent,
        payload={},
    )
    db.add(e)
    return e


@router.post("/login", dependencies=[Depends(public_origin_guard)])
def login(body: LoginIn, request: Request, response: Response, db: Session = Depends(get_db)) -> dict:
    ip = client_ip(request)
    if not login_limiter.allow(ip):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Terlalu banyak percobaan masuk. Coba lagi dalam satu menit.")
    email = body.email.lower()
    user = db.scalar(select(User).where(User.email == email))
    generic = "Email atau kata sandi tidak cocok."
    if user is None:
        # samakan waktu respons agar keberadaan akun tidak bisa ditebak
        verify_password(body.password, hash_password("x"))
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, generic)
    now = now_iso()
    if user.locked_until and user.locked_until > now:
        raise HTTPException(status.HTTP_423_LOCKED, f"Akun dikunci sementara sampai {local_clock(user.locked_until)} WIB karena beberapa percobaan gagal.")
    if not verify_password(body.password, user.password_hash):
        user.failed_logins += 1
        if user.failed_logins >= config.LOCKOUT_FAILS:
            user.locked_until = iso(now_utc() + timedelta(minutes=config.LOCKOUT_MINUTES))
            user.failed_logins = 0
        db.commit()
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, generic)
    if user.disabled:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Akun ini dinonaktifkan. Hubungi admin daycare.")
    user.failed_logins = 0
    user.locked_until = None
    access_entry(db, user, "Masuk ke akun", f"Dari alamat {ip}")
    token = start_session(db, request, response, user, body.remember)
    notify_change("log")
    return {"user": user_public(user), "token": token}


# Maksimal akun orang tua/wali yang boleh tertaut ke satu anak lewat kode.
MAX_GUARDIANS = 4


def check_invite(db: Session, code: str, role: str) -> InviteCode:
    """Kode undangan harus ada, sesuai peran, masih aktif, belum kedaluwarsa, dan belum habis."""
    invite = db.scalar(select(InviteCode).where(InviteCode.code == code)) if code else None
    if invite is None or invite.role != role:
        raise HTTPException(422, "Kode undangan tidak berlaku untuk peran ini. Periksa kembali kode dari admin daycare.")
    if not invite.active:
        raise HTTPException(422, "Kode undangan ini sudah dinonaktifkan admin. Minta kode baru.")
    if invite.expires_at and invite.expires_at <= now_iso():
        raise HTTPException(422, "Kode undangan ini sudah kedaluwarsa. Minta kode baru dari admin daycare.")
    if invite.max_uses is not None and invite.uses >= invite.max_uses:
        raise HTTPException(422, "Kode undangan ini sudah habis dipakai. Minta kode baru dari admin daycare.")
    return invite


@router.post("/register", dependencies=[Depends(public_origin_guard)])
def register(body: RegisterIn, request: Request, response: Response, db: Session = Depends(get_db)) -> dict:
    if not login_limiter.allow("reg:" + client_ip(request)):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Terlalu banyak percobaan. Coba lagi dalam satu menit.")
    if not body.consent:
        raise HTTPException(422, "Centang persetujuan Syarat Layanan dan Kebijakan Privasi.")
    if password_score(body.password) < 2:
        raise HTTPException(422, "Kata sandi terlalu lemah. Gunakan minimal 8 karakter dengan huruf besar, kecil, dan angka.")
    email = body.email.lower()
    if db.scalar(select(User.id).where(User.email == email)):
        raise HTTPException(409, "Email ini sudah terdaftar. Silakan masuk.")

    child: Child | None = None
    invite: InviteCode | None = None
    code = body.code.strip().upper()
    if body.role == "parent":
        if code:
            if code.startswith("ORTU-"):
                invite = check_invite(db, code, "parent")
            else:
                child = db.scalar(select(Child).where(Child.code == code, Child.archived_at.is_(None)))
                if child is None:
                    raise HTTPException(422, "Kode anak tidak ditemukan. Periksa kembali kode dari daycare.")
                guardians = db.scalar(select(func.count()).select_from(ParentChild).where(ParentChild.child_id == child.id)) or 0
                if guardians >= MAX_GUARDIANS:
                    raise HTTPException(422, f"Kode ini sudah dipakai {MAX_GUARDIANS} akun. Hubungi daycare untuk memeriksa tautan.")
    else:
        invite = check_invite(db, code, body.role)

    prefix = {"parent": "U-P", "caregiver": "U-C", "admin": "U-A"}[body.role]
    uid = new_id(prefix)
    user = User(
        id=uid,
        name=body.name,
        email=email,
        phone=body.phone,
        role=body.role,
        password_hash=hash_password(body.password),
        area="Seluruh fasilitas" if body.role == "admin" else ("Ruang Bermain dan Makan" if body.role == "caregiver" else ""),
        shift="Pagi (07.00–14.00)" if body.role == "caregiver" else "",
        seed=False,
        created_at=now_iso(),
    )
    if invite is not None:
        invite.uses += 1
        user.invite_code = invite.code
    db.add(user)
    db.flush()
    if child is not None:
        db.add(ParentChild(user_id=uid, child_id=child.id, linked_at=now_iso(), linked_via="register"))
    access_entry(db, user, "Membuat akun", f"Peran {user.role}" + (f" · kode {invite.code}" if invite else ""), silent=True, entry_type="account")
    token = start_session(db, request, response, user, remember=False)
    db.refresh(user)
    send_verification(db, user, request_origin(request))
    notify_change("users")
    return {"user": user_public(user), "linkedChild": child.short if child else None, "token": token}


def request_origin(request: Request) -> str | None:
    """Asal situs untuk tautan di email/WA bila SD_PUBLIC_URL tidak diset."""
    origin = request.headers.get("origin")
    if origin and origin != "null":
        return origin
    ref = request.headers.get("referer") or ""
    if ref.startswith("http"):
        parts = ref.split("/")
        return parts[0] + "//" + parts[2]
    proto = request.headers.get("x-forwarded-proto") or request.url.scheme
    host = request.headers.get("x-forwarded-host") or request.headers.get("host") or request.url.netloc
    return f"{proto}://{host}"


@router.post("/logout")
def logout(request: Request, response: Response, auth: Auth = Depends(require_auth), db: Session = Depends(get_db)) -> dict:
    db.execute(delete(AuthSession).where(AuthSession.id == auth.session.id))
    access_entry(db, auth.user, "Keluar dari akun")
    db.commit()
    clear_cookies(response, request)
    return {"ok": True}


@router.post("/logout-all")
def logout_all(request: Request, response: Response, auth: Auth = Depends(require_auth), db: Session = Depends(get_db)) -> dict:
    n = db.execute(delete(AuthSession).where(AuthSession.user_id == auth.user.id, AuthSession.id != auth.session.id)).rowcount
    access_entry(db, auth.user, "Keluar dari semua perangkat lain", f"{n} sesi ditutup")
    db.commit()
    return {"closed": n}


@router.get("/me")
def me(auth: Auth | None = Depends(optional_auth)) -> dict:
    if auth is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Belum masuk.")
    return {
        "user": user_public(auth.user),
        "session": {"createdAt": auth.session.created_at, "expiresAt": auth.session.expires_at, "remember": auth.session.remember, "via": auth.via},
    }


@router.post("/forgot", dependencies=[Depends(public_origin_guard)])
def forgot(body: ForgotIn, request: Request, db: Session = Depends(get_db)) -> dict:
    if not login_limiter.allow("forgot:" + client_ip(request)):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Terlalu banyak percobaan. Coba lagi dalam satu menit.")
    user = db.scalar(select(User).where(User.email == body.email.lower()))
    if user is not None and not user.disabled:
        send_reset(db, user, request_origin(request))
        access_entry(db, user, "Meminta tautan pemulihan kata sandi", client_ip(request), silent=True, entry_type="account")
        db.commit()
    # Respons selalu sama agar alamat terdaftar tidak bisa ditebak.
    return {"message": f"Jika {body.email} terdaftar, tautan pemulihan dikirim ke email (dan WhatsApp bila ada) dalam beberapa menit. Tautan berlaku 30 menit."}


@router.post("/reset", dependencies=[Depends(public_origin_guard)])
def reset(body: ResetIn, request: Request, response: Response, db: Session = Depends(get_db)) -> dict:
    if not login_limiter.allow("reset:" + client_ip(request)):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Terlalu banyak percobaan. Coba lagi dalam satu menit.")
    if password_score(body.password) < 2:
        raise HTTPException(422, "Kata sandi terlalu lemah. Gunakan minimal 8 karakter dengan huruf besar, kecil, dan angka.")
    user = consume_token(db, body.token, "reset")
    if user is None:
        raise HTTPException(410, "Tautan pemulihan tidak berlaku atau sudah kedaluwarsa. Minta tautan baru.")
    user.password_hash = hash_password(body.password)
    user.must_change_password = False
    user.failed_logins = 0
    user.locked_until = None
    if user.email_verified_at is None:
        user.email_verified_at = now_iso()  # tautan dibuka dari email pengguna
    db.execute(delete(AuthSession).where(AuthSession.user_id == user.id))
    access_entry(db, user, "Mengganti kata sandi lewat tautan pemulihan", client_ip(request), silent=True, entry_type="account")
    db.commit()
    clear_cookies(response, request)
    notify_change("users")
    return {"message": "Kata sandi berhasil diganti. Silakan masuk dengan kata sandi baru.", "email": user.email}


@router.post("/verify", dependencies=[Depends(public_origin_guard)])
def verify(body: VerifyIn, request: Request, db: Session = Depends(get_db)) -> dict:
    if not login_limiter.allow("verify:" + client_ip(request)):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Terlalu banyak percobaan. Coba lagi dalam satu menit.")
    user = consume_token(db, body.token, "verify")
    if user is None:
        raise HTTPException(410, "Tautan verifikasi tidak berlaku atau sudah kedaluwarsa. Minta tautan baru dari halaman Akun.")
    if user.email_verified_at is None:
        user.email_verified_at = now_iso()
        access_entry(db, user, "Memverifikasi alamat email", user.email, silent=True, entry_type="account")
    db.commit()
    notify_change("users")
    return {"message": "Alamat email terverifikasi. Terima kasih.", "email": user.email}


@router.post("/verify/resend")
def verify_resend(request: Request, auth: Auth = Depends(require_auth), db: Session = Depends(get_db)) -> dict:
    if auth.user.email_verified_at is not None:
        return {"message": "Email sudah terverifikasi."}
    if recent_token(db, auth.user, "verify", 60):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Tautan baru saja dikirim. Coba lagi dalam satu menit.")
    send_verification(db, auth.user, request_origin(request))
    return {"message": f"Tautan verifikasi dikirim ke {auth.user.email}. Periksa juga folder spam."}
