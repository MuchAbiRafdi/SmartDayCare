"""Percakapan orang tua–daycare: guru per anak, pengumuman, admin daycare, grup orang tua."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import Auth, require_auth
from ..events import notify_change
from ..models import ChatMessage, ChatRead, ChatThread, Child, ParentChild, User
from ..schemas import ChatSendIn
from ..security import new_id, now_iso

router = APIRouter(prefix="/api/chat", tags=["chat"])

KIND_ORDER = {"child": 0, "caregiver_direct": 1, "parent_direct": 2, "announce": 3, "admin": 4, "group": 5}


def _get_or_create(db: Session, kind: str, *, child_id: str | None = None, user_id: str | None = None, title: str) -> ChatThread:
    q = select(ChatThread).where(ChatThread.kind == kind)
    q = q.where(ChatThread.child_id == child_id) if child_id else q.where(ChatThread.child_id.is_(None))
    q = q.where(ChatThread.user_id == user_id) if user_id else q.where(ChatThread.user_id.is_(None))
    t = db.scalar(q)
    if t is None:
        t = ChatThread(id=new_id("T"), kind=kind, child_id=child_id, user_id=user_id, title=title, created_at=now_iso(), last_at="", last_text="", last_by="")
        db.add(t)
        db.flush()
    return t


def ensure_threads(db: Session, user: User) -> list[ChatThread]:
    """Percakapan yang boleh dilihat `user`; dibuat bila belum ada."""
    out: list[ChatThread] = []
    if user.role == "parent":
        ids = [link.child_id for link in user.links]
        children = db.scalars(select(Child).where(Child.id.in_(ids), Child.archived_at.is_(None))).all() if ids else []
    else:
        children = db.scalars(select(Child).where(Child.archived_at.is_(None)).order_by(Child.id)).all()
    for c in children:
        out.append(_get_or_create(db, "child", child_id=c.id, title=c.short))

    # Pengumuman resmi
    out.append(_get_or_create(db, "announce", title="Pengumuman"))

    # Percakapan Admin:
    # - Untuk orang tua: thread khusus ke admin daycare
    # - Untuk pengasuh: thread konsultasi pengasuh ↔ admin daycare
    # - Untuk admin: melihat semua thread pribadi (orang tua & pengasuh) ke admin
    if user.role == "parent":
        out.append(_get_or_create(db, "admin", user_id=user.id, title="Admin Daycare"))
    elif user.role == "caregiver":
        out.append(_get_or_create(db, "admin", user_id=user.id, title="Admin Daycare"))
    else:
        out.extend(db.scalars(select(ChatThread).where(ChatThread.kind == "admin")).all())

    # Kontak Semua Pengasuh Terdaftar:
    # Tampilkan seluruh pengasuh aktif agar orang tua dan admin dapat menghubungi pengasuh mana saja langsung
    all_caregivers = db.scalars(select(User).where(User.role == "caregiver", User.disabled.is_(False)).order_by(User.name)).all()
    if user.role == "parent":
        for cg in all_caregivers:
            out.append(_get_or_create(db, "caregiver_direct", user_id=cg.id, title=f"Pengasuh: {cg.name}"))
    elif user.role in ("admin", "caregiver"):
        for cg in all_caregivers:
            out.append(_get_or_create(db, "caregiver_direct", user_id=cg.id, title=f"Pengasuh: {cg.name}"))

    # Kontak Orang Tua Terdaftar:
    # Sediakan percakapan langsung ke setiap orang tua yang terdaftar
    if user.role == "parent":
        out.append(_get_or_create(db, "parent_direct", user_id=user.id, title=f"Orang Tua: {user.name}"))
    elif user.role in ("caregiver", "admin"):
        all_parents = db.scalars(select(User).where(User.role == "parent", User.disabled.is_(False)).order_by(User.name)).all()
        for p in all_parents:
            t_p = _get_or_create(db, "parent_direct", user_id=p.id, title=f"Orang Tua: {p.name}")
            out.append(t_p)

    # Grup Komunitas Daycare
    out.append(_get_or_create(db, "group", title="Grup Orang Tua"))
    return out


def can_post(user: User, t: ChatThread) -> bool:
    if t.kind == "announce":
        return user.role != "parent"
    return True


def _title_for(db: Session, user: User, t: ChatThread, children: dict[str, Child], users: dict[str, User]) -> tuple[str, str]:
    """(judul, keterangan) sesuai sudut pandang pembaca."""
    if t.kind == "child":
        c = children.get(t.child_id or "")
        if c is None:
            return t.title, ""
        cg = str(c.data.get("caregiver") or "Pengasuh")
        if user.role == "parent":
            return f"Guru {cg.split()[0]}", f"Pengasuh {c.short}"
        return f"Orang tua {c.short}", str(c.data.get("parentName") or "")
    if t.kind == "caregiver_direct":
        u = users.get(t.user_id or "")
        cg_name = u.name if u else "Pengasuh"
        cg_phone = f" · {u.phone}" if u and u.phone else ""
        cg_shift = f" · Shift: {u.shift}" if u and u.shift else ""
        if user.role == "caregiver" and user.id == t.user_id:
            return f"Ruang Konsultasi ({cg_name})", "Pesan langsung dari orang tua & tim"
        return f"Guru {cg_name.split()[0]} ({cg_name})", f"Pengasuh Terdaftar{cg_shift}{cg_phone}"
    if t.kind == "parent_direct":
        u = users.get(t.user_id or "")
        p_name = u.name if u else "Orang Tua"
        p_phone = f" · {u.phone}" if u and u.phone else ""
        if user.role == "parent":
            return "Tim Pengasuh & Daycare", "Pesan langsung untuk keluarga Anda"
        return f"{p_name} (Wali)", f"Kontak Orang Tua Terdaftar{p_phone}"
    if t.kind == "announce":
        return "Pengumuman", "Dari pengelola daycare"
    if t.kind == "admin":
        if user.role == "parent":
            return "Admin Daycare", "Administrasi, pendaftaran & tagihan"
        if user.role == "caregiver":
            return "Admin Daycare", "Koordinasi operasional & fasilitas"
        u = users.get(t.user_id or "")
        u_role = "Orang tua" if (u and u.role == "parent") else ("Pengasuh" if (u and u.role == "caregiver") else "Staf")
        return f"{u.name if u else 'Pengguna'} ({u_role}) → Admin", "Pesan langsung ke admin"
    return "Grup Orang Tua", "Semua orang tua & pengasuh"


def _read_marks(db: Session, user_id: str) -> dict[str, str]:
    return {r.thread_id: r.at for r in db.scalars(select(ChatRead).where(ChatRead.user_id == user_id)).all()}


def _unread(db: Session, user_id: str, thread_ids: list[str], marks: dict[str, str]) -> dict[str, int]:
    out: dict[str, int] = {}
    for tid in thread_ids:
        since = marks.get(tid, "")
        n = db.scalar(select(func.count()).select_from(ChatMessage).where(ChatMessage.thread_id == tid, ChatMessage.at > since, ChatMessage.user_id != user_id))
        out[tid] = int(n or 0)
    return out


def unread_total(db: Session, user: User) -> int:
    threads = ensure_threads(db, user)
    marks = _read_marks(db, user.id)
    return sum(_unread(db, user.id, [t.id for t in threads], marks).values())


def threads_public(db: Session, user: User) -> list[dict[str, Any]]:
    threads = ensure_threads(db, user)
    db.commit()
    children = {c.id: c for c in db.scalars(select(Child)).all()}
    users = {u.id: u for u in db.scalars(select(User)).all()}
    marks = _read_marks(db, user.id)
    unread = _unread(db, user.id, [t.id for t in threads], marks)
    out = []
    for t in threads:
        title, sub = _title_for(db, user, t, children, users)
        out.append(
            {
                "id": t.id,
                "kind": t.kind,
                "title": title,
                "subtitle": sub,
                "childId": t.child_id,
                "lastAt": t.last_at or None,
                "lastText": t.last_text,
                "lastBy": t.last_by,
                "unread": unread.get(t.id, 0),
                "canPost": can_post(user, t),
            }
        )
    # Thread dengan pesan belum dibaca di paling atas, diikuti aktivitas terakhir (lastAt), lalu urutan kategori
    out.sort(key=lambda x: (
        x["unread"] > 0,
        x["lastAt"] or "",
        -KIND_ORDER.get(x["kind"], 9),
    ), reverse=True)
    return out


def _thread_for(db: Session, user: User, thread_id: str) -> ChatThread:
    allowed = {t.id: t for t in ensure_threads(db, user)}
    t = allowed.get(thread_id)
    if t is None:
        raise HTTPException(404, "Percakapan tidak ditemukan.")
    return t


@router.get("/threads")
def list_threads(auth: Auth = Depends(require_auth), db: Session = Depends(get_db)) -> dict:
    return {"threads": threads_public(db, auth.user)}


@router.get("/threads/{thread_id}/messages")
def messages(thread_id: str, auth: Auth = Depends(require_auth), db: Session = Depends(get_db)) -> dict:
    t = _thread_for(db, auth.user, thread_id)
    rows = db.scalars(select(ChatMessage).where(ChatMessage.thread_id == t.id).order_by(ChatMessage.at.desc()).limit(200)).all()
    rows = list(reversed(rows))
    mark = db.get(ChatRead, (auth.user.id, t.id))
    now = now_iso()
    if mark is None:
        db.add(ChatRead(user_id=auth.user.id, thread_id=t.id, at=now))
    else:
        mark.at = now
    db.commit()
    return {
        "thread": {"id": t.id, "kind": t.kind, "canPost": can_post(auth.user, t)},
        "messages": [{"id": m.id, "userId": m.user_id, "by": m.by_name, "role": m.role, "at": m.at, "text": m.text, "mine": m.user_id == auth.user.id} for m in rows],
    }


@router.post("/threads/{thread_id}/messages")
def send(thread_id: str, body: ChatSendIn, auth: Auth = Depends(require_auth), db: Session = Depends(get_db)) -> dict:
    t = _thread_for(db, auth.user, thread_id)
    if not can_post(auth.user, t):
        raise HTTPException(403, "Pengumuman hanya dapat dikirim oleh pengelola daycare.")
    now = now_iso()
    m = ChatMessage(id=new_id("M"), thread_id=t.id, user_id=auth.user.id, by_name=auth.user.name, role=auth.user.role, at=now, text=body.text)
    db.add(m)
    t.last_at, t.last_text, t.last_by = now, body.text[:200], auth.user.name
    mark = db.get(ChatRead, (auth.user.id, t.id))
    if mark is None:
        db.add(ChatRead(user_id=auth.user.id, thread_id=t.id, at=now))
    else:
        mark.at = now
    db.commit()
    # penerima: orang tua anak (thread anak), orang tua pemilik (thread admin), semua (pengumuman/grup)
    notify_change("chat", threadId=t.id, thread=t.kind, childId=t.child_id, by=auth.user.name)
    return {"message": {"id": m.id, "userId": m.user_id, "by": m.by_name, "role": m.role, "at": m.at, "text": m.text, "mine": True}}


@router.post("/threads/{thread_id}/read")
def mark_read(thread_id: str, auth: Auth = Depends(require_auth), db: Session = Depends(get_db)) -> dict:
    t = _thread_for(db, auth.user, thread_id)
    mark = db.get(ChatRead, (auth.user.id, t.id))
    now = now_iso()
    if mark is None:
        db.add(ChatRead(user_id=auth.user.id, thread_id=t.id, at=now))
    else:
        mark.at = now
    db.commit()
    return {"ok": True}


def parents_of(db: Session, child_id: str) -> list[User]:
    links = db.scalars(select(ParentChild).where(ParentChild.child_id == child_id)).all()
    return [u for u in (db.get(User, link.user_id) for link in links) if u is not None]
