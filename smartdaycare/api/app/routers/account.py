from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import Auth, public_origin_guard, require_auth
from ..events import notify_change
from ..models import AuthSession, Child, ParentChild, Pref, Ticket, User
from ..schemas import LinkChildIn, PasswordIn, PrefIn, ProfileIn, TicketIn
from ..security import client_ip, hash_password, link_limiter, new_id, now_iso, password_score, public_limiter, verify_password
from ..serialize import user_public
from .auth import MAX_GUARDIANS, access_entry, clear_cookies

router = APIRouter(prefix="/api", tags=["account"])

PREF_KEYS = {"child", "lastRead", "notify", "billing"}


@router.patch("/account")
def update_profile(body: ProfileIn, auth: Auth = Depends(require_auth), db: Session = Depends(get_db)) -> dict:
    u = auth.user
    u.name = body.name
    u.phone = body.phone
    access_entry(db, u, "Memperbarui profil", entry_type="account")
    db.commit()
    notify_change("users")
    return {"user": user_public(u)}


@router.post("/account/password")
def change_password(body: PasswordIn, auth: Auth = Depends(require_auth), db: Session = Depends(get_db)) -> dict:
    u = auth.user
    if not verify_password(body.current, u.password_hash):
        raise HTTPException(422, "Kata sandi saat ini tidak cocok.")
    if password_score(body.new) < 2:
        raise HTTPException(422, "Kata sandi baru terlalu lemah. Gunakan minimal 8 karakter dengan huruf besar, kecil, dan angka.")
    if body.new == body.current:
        raise HTTPException(422, "Kata sandi baru harus berbeda dari yang lama.")
    u.password_hash = hash_password(body.new)
    u.must_change_password = False
    # sesi lain ditutup; sesi ini tetap berjalan
    n = db.execute(delete(AuthSession).where(AuthSession.user_id == u.id, AuthSession.id != auth.session.id)).rowcount
    access_entry(db, u, "Mengganti kata sandi", f"{n} sesi lain ditutup", entry_type="account")
    db.commit()
    return {"ok": True, "closedSessions": n}


@router.put("/prefs/{key}")
def put_pref(key: str, body: PrefIn, auth: Auth = Depends(require_auth), db: Session = Depends(get_db)) -> dict:
    if key not in PREF_KEYS:
        raise HTTPException(404, "Preferensi tidak dikenal.")
    row = db.get(Pref, (auth.user.id, key))
    if row is None:
        db.add(Pref(user_id=auth.user.id, key=key, value=body.value))
    else:
        row.value = body.value
    db.commit()
    return {"ok": True}


@router.post("/children/link")
def link_child(body: LinkChildIn, auth: Auth = Depends(require_auth), db: Session = Depends(get_db)) -> dict:
    if auth.user.role != "parent":
        raise HTTPException(403, "Hanya akun orang tua yang dapat menautkan anak.")
    code = body.code.strip().upper()
    if not link_limiter.allow("link:" + auth.user.id):
        raise HTTPException(429, "Terlalu banyak percobaan kode. Coba lagi dalam 15 menit.")
    child = db.scalar(select(Child).where(Child.code == code, Child.archived_at.is_(None)))
    if child is None:
        # tercatat di riwayat akses agar admin melihat percobaan kode yang salah
        access_entry(db, auth.user, "Kode anak tidak dikenal", f"Kode {code}", silent=True, entry_type="account")
        db.commit()
        raise HTTPException(422, "Kode anak tidak ditemukan. Periksa kembali kode dari daycare.")
    if any(link.child_id == child.id for link in auth.user.links):
        raise HTTPException(409, f"{child.short} sudah tertaut dengan akun Anda.")
    guardians = db.scalar(select(func.count()).select_from(ParentChild).where(ParentChild.child_id == child.id)) or 0
    if guardians >= MAX_GUARDIANS:
        raise HTTPException(422, f"Kode ini sudah dipakai {MAX_GUARDIANS} akun. Hubungi daycare untuk memeriksa tautan.")
    db.add(ParentChild(user_id=auth.user.id, child_id=child.id, linked_at=now_iso(), linked_via="link"))
    access_entry(db, auth.user, f"Menautkan anak {child.short}", f"Kode {code}", entry_type="account")
    db.commit()
    db.refresh(auth.user)
    notify_change("users")
    return {"child": child.short, "user": user_public(auth.user)}


@router.delete("/account")
def delete_account(request: Request, response: Response, auth: Auth = Depends(require_auth), db: Session = Depends(get_db)) -> dict:
    u = auth.user
    if u.seed:
        raise HTTPException(403, "Akun contoh fasilitas tidak dapat dihapus.")
    if u.role == "admin":
        others = db.scalar(select(User.id).where(User.role == "admin", User.id != u.id, User.disabled.is_(False)))
        if others is None:
            raise HTTPException(422, "Akun admin terakhir tidak dapat dihapus.")
    db.delete(u)
    db.commit()
    clear_cookies(response, request)
    notify_change("users")
    return {"ok": True}


@router.post("/tickets", dependencies=[Depends(public_origin_guard)])
def create_ticket(body: TicketIn, request: Request, db: Session = Depends(get_db)) -> dict:
    if not public_limiter.allow("ticket:" + client_ip(request)):
        raise HTTPException(429, "Terlalu banyak permintaan. Coba lagi sebentar lagi.")
    from ..deps import _load_auth

    auth = _load_auth(request, db)
    t = Ticket(
        id="T" + new_id("")[1:],
        at=now_iso(),
        name=body.name,
        email=body.email.lower(),
        org=body.org,
        topic=body.topic,
        msg=body.msg,
        status="open",
        user_id=auth.user.id if auth else None,
    )
    db.add(t)
    db.commit()
    notify_change("tickets")
    return {"id": t.id, "message": f"Permintaan {t.id} kami terima dan dibalas dalam 1 hari kerja."}
