"""Bentuk data yang dikirim ke antarmuka. Tidak pernah memuat hash kata sandi atau foto mentah."""
from __future__ import annotations

from datetime import timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import config
from .devices import cameras_for, device_status
from .events import air
from .models import Child, Food, InviteCode, LogEntry, Message, ParentChild, Pref, Resolved, Ticket, User
from .notify import channels
from .security import iso, now_iso, now_utc
from .logic import attendance, local_clock, local_today_bounds
from .seed import facility_info, seed, settings_dict
from .routers.cctv import camera_access, requests_public
from .routers.chat import unread_total
from .routers.trust import daily_summary_setting, feedback_for, trust_metrics

ROLE_LABEL = {"parent": "Orang tua", "caregiver": "Pengasuh", "admin": "Admin daycare", "system": "Sistem"}


def user_public(u: User) -> dict[str, Any]:
    return {
        "id": u.id,
        "name": u.name,
        "email": u.email,
        "phone": u.phone,
        "role": u.role,
        "roleLabel": ROLE_LABEL.get(u.role, u.role),
        "area": u.area,
        "shift": u.shift,
        "seed": u.seed,
        "disabled": u.disabled,
        "createdAt": u.created_at,
        "children": [link.child_id for link in u.links],
        "mustChangePassword": u.must_change_password,
        "emailVerified": u.email_verified_at is not None,
    }


def entry_public(e: LogEntry) -> dict[str, Any]:
    d: dict[str, Any] = {
        "id": e.id,
        "type": e.type,
        "childId": e.child_id,
        "child": e.child_name,
        "userId": e.user_id,
        "by": e.by_name,
        "role": e.role,
        "at": e.at,
        "sev": e.sev,
        "title": e.title,
        "text": e.text,
        "silent": e.silent,
        "meal": e.meal,
        "done": e.done,
    }
    d.update(e.payload or {})
    if e.photo is not None:
        d["photoUrl"] = f"/api/photos/{e.id}/photo"
    if e.photo_pre is not None:
        d["photoPreUrl"] = f"/api/photos/{e.id}/pre"
    if e.photo_post is not None:
        d["photoPostUrl"] = f"/api/photos/{e.id}/post"
    return d


def foods_public(db: Session) -> list[dict[str, Any]]:
    rows = db.scalars(select(Food).order_by(Food.id)).all()
    return [{"id": f.id, "name": f.name, "kcal": f.kcal, "protein": f.protein, "carbs": f.carbs, "fat": f.fat, "seed": f.seed} for f in rows]


def invite_public(c: InviteCode, used_by: list[dict[str, str]] | None = None) -> dict[str, Any]:
    return {
        "code": c.code,
        "role": c.role,
        "label": c.label,
        "active": c.active,
        "createdAt": c.created_at,
        "createdBy": c.created_by,
        "expiresAt": c.expires_at,
        "maxUses": c.max_uses,
        "uses": c.uses,
        "usedBy": used_by or [],
    }


def invites_public(db: Session, users: list[User] | None = None) -> list[dict[str, Any]]:
    """Semua kode undangan untuk admin: yang masih bisa dipakai lebih dulu, lalu yang terbaru."""
    if users is None:
        users = db.scalars(select(User)).all()
    used: dict[str, list[dict[str, str]]] = {}
    for u in users:
        if u.invite_code:
            used.setdefault(u.invite_code, []).append({"name": u.name, "at": u.created_at})
    now = now_iso()

    def usable(c: InviteCode) -> bool:
        return c.active and (not c.expires_at or c.expires_at > now) and (c.max_uses is None or c.uses < c.max_uses)

    rows = list(db.scalars(select(InviteCode)).all())
    # kode yang masih berlaku di atas; di dalam kelompok, yang terbaru di atas
    rows.sort(key=lambda c: c.created_at, reverse=True)
    rows.sort(key=lambda c: not usable(c))
    return [invite_public(c, used.get(c.code)) for c in rows]


def child_public(c: Child) -> dict[str, Any]:
    d = dict(c.data)
    if c.archived_at:
        d["archivedAt"] = c.archived_at
        d["archivedNote"] = c.archived_note
    return d


def children_for(db: Session, user: User, *, include_archived: bool = False) -> list[dict[str, Any]]:
    """Anak aktif untuk peran ini. Anak yang diarsipkan (sudah keluar) hanya untuk admin bila diminta."""
    q = select(Child).order_by(Child.id)
    if user.role == "parent":
        ids = [link.child_id for link in user.links]
        if not ids:
            return []
        q = q.where(Child.id.in_(ids))
    if not include_archived:
        q = q.where(Child.archived_at.is_(None))
    return [child_public(c) for c in db.scalars(q).all()]


def prefs_for(db: Session, user_id: str) -> dict[str, Any]:
    rows = db.scalars(select(Pref).where(Pref.user_id == user_id)).all()
    return {p.key: p.value for p in rows}


ROUTINE = ("activity", "food", "sleep", "mood", "doc")


def log_for(db: Session, user: User, child_ids: list[str], days: int = 7) -> list[dict[str, Any]]:
    since = iso(now_utc() - timedelta(days=days))
    # catatan rutin (aktivitas/makan/tidur/mood/dokumentasi) cukup 2 hari terakhir di cuplikan;
    # riwayat yang lebih panjang dilayani /api/analytics agar cuplikan tetap ringan
    routine_since = iso(now_utc() - timedelta(days=2))
    # dokumentasi (foto) lebih jarang dan lebih berharga: ikutkan 7 hari penuh
    q = select(LogEntry).where(
        LogEntry.at >= since,
        LogEntry.type.notin_(ROUTINE) | (LogEntry.at >= routine_since) | (LogEntry.type == "doc"),
    )
    if user.role == "parent":
        # Orang tua: catatan anak yang tertaut + catatan akses/akunnya sendiri.
        if not child_ids:
            q = q.where(LogEntry.user_id == user.id, LogEntry.type.in_(("access", "account")))
        else:
            q = q.where(
                (LogEntry.child_id.in_(child_ids) & LogEntry.type.notin_(("access", "account")))
                | ((LogEntry.user_id == user.id) & LogEntry.type.in_(("access", "account")))
            )
    elif user.role == "caregiver":
        q = q.where(LogEntry.type.notin_(("access", "account")) | (LogEntry.user_id == user.id))
    rows = db.scalars(q.order_by(LogEntry.at.desc()).limit(1500)).all()
    return [entry_public(e) for e in rows]


def build_state(db: Session, user: User) -> dict[str, Any]:
    s = seed()
    children = children_for(db, user)
    child_ids = [c["id"] for c in children]
    resolved = {r.incident_id: {"by": r.by_name, "at": r.at} for r in db.scalars(select(Resolved)).all()}
    parent = user.role == "parent"
    # Data dibatasi di server, bukan hanya disaring di antarmuka: orang tua hanya
    # menerima kamera yang memang dibuka untuk orang tua dan catatan anaknya sendiri;
    # serah terima antar shift dan jejak audit hanya untuk staf/admin.
    cameras = cameras_for(db, parent)
    if parent:
        # Kamera untuk orang tua: daftar tampil, tetapi gambar/siaran hanya dikirim bila permintaan
        # aksesnya disetujui admin dan belum kedaluwarsa (Akses kamera berdasarkan hak yang diberikan).
        access = camera_access(db, user)
        for cam in cameras:
            a = access.get(cam["id"], {"status": "none", "requestId": None, "expiresAt": None, "decidedAt": None, "note": "", "createdAt": None})
            cam["access"] = a
            if a["status"] != "approved":
                cam["img"] = None
                cam["stream"] = None
                cam["streamKind"] = None
                cam["view"] = "locked"
    own = set(child_ids)
    sample = config.SAMPLE_DATA
    incidents = [i for i in s["incidents"] if sample and (not parent or i.get("childId") in own)]
    med_logs = [m for m in s["medLogs"] if sample and (not parent or m.get("childId") in own)]
    handovers = [] if parent or not sample else s["handovers"]
    access = s["access"] if user.role == "admin" and sample else []
    state: dict[str, Any] = {
        "serverTime": now_iso(),
        "me": user_public(user),
        "facility": facility_info(db),
        "rooms": s["rooms"],
        "cameras": cameras,
        "sensors": s["sensors"],
        "thresholds": settings_dict(db),
        "foods": foods_public(db),
        "faq": s["faq"],
        "children": children,
        "seeded": {
            "incidents": incidents,
            "medLogs": med_logs,
            "access": access,
            "handovers": handovers,
        },
        "log": log_for(db, user, child_ids),
        "resolved": resolved,
        "prefs": prefs_for(db, user.id),
        "air": air.snapshot(),
        "sample": sample,
        "channels": channels(),
        "chatUnread": unread_total(db, user),
        "cameraRequests": requests_public(db, user),
        "feedback": feedback_for(db, user),
        "dailySummary": daily_summary_setting(db),
    }
    if user.role != "parent":
        state["trust"] = trust_metrics(db)
    if user.role == "admin":
        users = db.scalars(select(User).order_by(User.id)).all()
        state["users"] = [user_public(u) for u in users]
        state["archivedChildren"] = [child_public(c) for c in db.scalars(select(Child).where(Child.archived_at.is_not(None)).order_by(Child.archived_at.desc())).all()]
        state["devices"] = device_status(db)
        state["messages"] = messages_public(db)
        state["inviteCodes"] = invites_public(db, users)
        links = db.scalars(select(ParentChild)).all()
        state["links"] = [
            {"userId": link.user_id, "childId": link.child_id, "linkedAt": link.linked_at, "via": link.linked_via} for link in links
        ]
        tickets = db.scalars(select(Ticket).order_by(Ticket.at.desc()).limit(200)).all()
    else:
        tickets = db.scalars(
            select(Ticket).where((Ticket.user_id == user.id) | (Ticket.email == user.email)).order_by(Ticket.at.desc()).limit(50)
        ).all()
    state["tickets"] = [
        {"id": t.id, "at": t.at, "name": t.name, "email": t.email, "org": t.org, "topic": t.topic, "msg": t.msg, "status": t.status}
        for t in tickets
    ]
    if user.role == "caregiver":
        staff = db.scalars(select(User).where(User.role == "caregiver", User.disabled.is_(False))).all()
        state["staff"] = [{"id": u.id, "name": u.name, "shift": u.shift} for u in staff]
    return state


def public_summary(db: Session) -> dict[str, Any]:
    """Ringkasan tanpa data pribadi untuk halaman depan dan halaman masuk."""
    s = seed()
    children = [c.data for c in db.scalars(select(Child).where(Child.archived_at.is_(None))).all()]
    start, end = local_today_bounds()
    rows = db.scalars(
        select(LogEntry).where(LogEntry.at >= start, LogEntry.at <= end, LogEntry.type.in_(("checkin", "checkout", "incident")))
    ).all()
    entries = [entry_public(e) for e in rows]
    present = sum(1 for c in children if attendance(c, entries)["state"] == "in")
    incidents = sorted(
        [{"type": i["type"], "t": i["t"], "resolved": True} for i in (s["incidents"] if config.SAMPLE_DATA else [])]
        + [
            {"type": e.get("kind") or e["title"], "t": local_clock(e["at"]), "resolved": e["id"] in resolved_ids(db)}
            for e in entries
            if e["type"] == "incident"
        ],
        key=lambda i: i["t"],
    )
    return {
        "serverTime": now_iso(),
        "facility": facility_info(db),
        "faq": s["faq"],
        "air": air.snapshot(),
        "thresholds": settings_dict(db),
        "childCount": len(children),
        "present": present,
        "lastIncident": incidents[-1] if incidents else None,
        "sample": config.SAMPLE_DATA,
    }


def messages_public(db: Session, limit: int = 150) -> list[dict[str, Any]]:
    rows = db.scalars(select(Message).order_by(Message.at.desc()).limit(limit)).all()
    return [
        {
            "id": m.id,
            "at": m.at,
            "channel": m.channel,
            "to": m.to,
            "subject": m.subject,
            "body": m.body,
            "status": m.status,
            "error": m.error,
            "provider": m.provider,
            "ref": m.ref,
            "userId": m.user_id,
            "attempts": m.attempts,
            "sentAt": m.sent_at,
        }
        for m in rows
    ]


def resolved_ids(db: Session) -> set[str]:
    return {r.incident_id for r in db.scalars(select(Resolved)).all()}
