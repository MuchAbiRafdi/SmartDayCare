"""Pemberitahuan ke orang tua (WhatsApp / email) dan token sekali pakai.

- `notify_parents(db, entry)` dipanggil setelah catatan harian tersimpan: orang tua yang
  tertaut ke anak itu menerima pesan sesuai preferensinya (tingkat penting/sedang/semua;
  kanal WhatsApp dan/atau email). Kanal yang belum diatur tetap tercatat di kotak keluar.
- `daily_summaries(db)` mengirim ringkasan harian (bawaan pukul 16.00, dapat diubah admin di
  menu Kepercayaan Orang Tua) berisi kehadiran, aktivitas, makan, tidur, mood, foto, dan catatan
  penting hari itu untuk orang tua yang memilihnya.
- Token pemulihan kata sandi / verifikasi email disimpan sebagai hash dengan masa berlaku.
"""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import notify
from .logic import TZ, local_clock, local_today_bounds
from .models import LogEntry, ParentChild, Pref, Setting, Token, User
from .security import iso, new_token, now_iso, now_utc, token_hash

DEFAULT_NOTIFY: dict[str, Any] = {"wa": True, "email": True, "push": False, "high": True, "medium": True, "low": False, "daily": True}
RESET_MINUTES = 30
VERIFY_HOURS = 48

# jenis catatan yang layak diberitahukan ke orang tua (selain lewat dasbor)
NOTIFY_TYPES = {"temp", "incident", "med", "checkin", "checkout", "note", "meal", "mood", "food"}


def parent_prefs(db: Session, user_id: str) -> dict[str, Any]:
    row = db.get(Pref, (user_id, "notify"))
    val = row.value if row is not None and isinstance(row.value, dict) else {}
    return {**DEFAULT_NOTIFY, **val}


def wants(prefs: dict[str, Any], sev: str) -> bool:
    if sev == "high":
        return bool(prefs.get("high", True))
    if sev == "medium":
        return bool(prefs.get("medium", True))
    return bool(prefs.get("low", False))


def notify_parents(db: Session, entry: LogEntry, origin: str | None = None) -> int:
    """Kirim pemberitahuan catatan `entry` ke orang tua anak terkait. Mengembalikan jumlah pesan."""
    if entry.silent or not entry.child_id or entry.type not in NOTIFY_TYPES:
        return 0
    links = db.scalars(select(ParentChild).where(ParentChild.child_id == entry.child_id)).all()
    if not links:
        return 0
    link = notify.public_url(origin) + "/parent"
    clock = local_clock(entry.at)
    child = entry.child_name or "Anak"
    subject, body = notify.alert_texts(child, entry.title, entry.text or "", clock, link)
    sent = 0
    for pc in links:
        parent = db.get(User, pc.user_id)
        if parent is None or parent.disabled or parent.role != "parent":
            continue
        prefs = parent_prefs(db, parent.id)
        if not wants(prefs, entry.sev):
            continue
        if prefs.get("wa") and parent.phone:
            notify.enqueue(db, "wa", parent.phone, subject, body, ref=f"alert:{entry.id}", user_id=parent.id)
            sent += 1
        if prefs.get("email") and parent.email:
            notify.enqueue(db, "email", parent.email, subject, body, ref=f"alert:{entry.id}", user_id=parent.id)
            sent += 1
    return sent


# ------------------------------------------------------------ ringkasan harian ----

DAILY_HOUR, DAILY_MINUTE = 16, 0  # bawaan; admin dapat mengubah lewat pengaturan "Notifikasi pintar"


def _summary_lines(entries: list[LogEntry]) -> list[str]:
    """Ringkasan satu anak untuk satu hari: kehadiran, aktivitas, makan, tidur, mood, foto, lalu catatan penting."""
    from .labels import fmt_duration  # impor lokal: labels tidak bergantung pada modul ini

    def clock(iso_utc: str) -> str:
        return local_clock(iso_utc).replace(":", ".")

    by_type: dict[str, list[LogEntry]] = {}
    for e in sorted(entries, key=lambda x: x.at):
        if e.done == "replaced":
            continue
        by_type.setdefault(e.type, []).append(e)
    lines: list[str] = []
    ins = by_type.get("checkin", [])
    outs = by_type.get("checkout", [])
    if ins or outs:
        a = f"hadir {clock(ins[0].at)}" if ins else "hadir"
        b = f", dijemput {clock(outs[-1].at)}" if outs else ""
        lines.append(f"Kehadiran: {a}{b}")
    acts = by_type.get("activity", [])
    if acts:
        parts = []
        for e in acts:
            p = e.payload or {}
            mins = p.get("minutes")
            parts.append(f"{p.get('kindLabel') or e.title}" + (f" {fmt_duration(int(mins))}" if mins else ""))
        lines.append(f"Aktivitas: {len(acts)} kegiatan — " + ", ".join(parts))
    foods = by_type.get("food", [])
    if foods:
        lines.append("Makan: " + " · ".join(f"{(e.payload or {}).get('slotLabel', 'Makan')} {(e.payload or {}).get('portionLabel', '').lower()}".strip() for e in foods))
    meals = by_type.get("meal", [])
    for e in meals:
        pct = (e.payload or {}).get("pct")
        kcal = (e.payload or {}).get("kcal")
        if pct is not None:
            lines.append(f"Piring makan siang: {pct}% porsi habis" + (f", sekitar {kcal} kkal" if kcal else ""))
    sleeps = by_type.get("sleep", [])
    if sleeps:
        total = sum(int((e.payload or {}).get("minutes") or 0) for e in sleeps)
        q = ", ".join(str((e.payload or {}).get("qualityLabel", "")).lower() for e in sleeps if (e.payload or {}).get("qualityLabel"))
        lines.append(f"Tidur: {len(sleeps)} kali, {fmt_duration(total)}" + (f" (kualitas {q})" if q else ""))
    moods = by_type.get("mood", [])
    if moods:
        lines.append("Mood: " + ", ".join(f"{clock(e.at)} {(e.payload or {}).get('moodLabel', '')}".strip() for e in moods))
    docs = by_type.get("doc", [])
    if docs:
        lines.append(f"Foto: {len(docs)} foto kegiatan baru")
    important = [e for e in entries if not e.silent and e.type in ("temp", "incident", "med", "note")]
    if important:
        lines.append("")
        lines.append("Catatan penting:")
        for e in sorted(important, key=lambda x: x.at):
            extra = f" — {e.text}" if e.text else ""
            lines.append(f"  {clock(e.at)}  {e.title}{extra}")
    if not lines:
        lines.append("Belum ada catatan hari ini.")
    return lines


def daily_summaries(db: Session, origin: str | None = None, *, force: bool = False) -> int:
    """Kirim ringkasan harian sekali per hari setelah jam yang diatur (bawaan 16.00 waktu fasilitas)."""
    now_local = datetime.now(TZ)
    day = now_local.strftime("%Y-%m-%d")
    cfg = db.get(Setting, "dailySummary")
    enabled, at = True, f"{DAILY_HOUR:02d}:{DAILY_MINUTE:02d}"
    if cfg is not None and isinstance(cfg.value, dict):
        enabled = bool(cfg.value.get("enabled", True))
        at = str(cfg.value.get("time") or at)
    if not force and not enabled:
        return 0
    try:
        hh, mm = (int(x) for x in at.split(":"))
    except ValueError:
        hh, mm = DAILY_HOUR, DAILY_MINUTE
    if not force and (now_local.hour, now_local.minute) < (hh, mm):
        return 0
    marker = db.get(Setting, "dailySent")
    if not force and marker is not None and marker.value == day:
        return 0
    start, end = local_today_bounds()
    rows = db.scalars(select(LogEntry).where(LogEntry.at >= start, LogEntry.at <= end, LogEntry.child_id.is_not(None))).all()
    by_child: dict[str, list[LogEntry]] = {}
    for e in rows:
        if e.type in ("access", "account"):
            continue
        by_child.setdefault(str(e.child_id), []).append(e)
    sent = 0
    link = notify.public_url(origin) + "/parent"
    for child_id, entries in by_child.items():
        links = db.scalars(select(ParentChild).where(ParentChild.child_id == child_id)).all()
        child_name = entries[0].child_name or "Anak"
        body = f"Ringkasan hari ini untuk {child_name} ({now_local.strftime('%d/%m/%Y')}):\n\n" + "\n".join(_summary_lines(entries)) + f"\n\nRincian lengkap: {link}\n{notify.facility_name()}"
        subject = f"Ringkasan hari ini — {child_name}"
        for pc in links:
            parent = db.get(User, pc.user_id)
            if parent is None or parent.disabled or parent.role != "parent":
                continue
            prefs = parent_prefs(db, parent.id)
            if not prefs.get("daily", True):
                continue
            if prefs.get("email") and parent.email:
                notify.enqueue(db, "email", parent.email, subject, body, ref="daily", user_id=parent.id)
                sent += 1
            elif prefs.get("wa") and parent.phone:
                notify.enqueue(db, "wa", parent.phone, subject, body, ref="daily", user_id=parent.id)
                sent += 1
    if marker is None:
        db.add(Setting(key="dailySent", value=day))
    else:
        marker.value = day
    db.commit()
    return sent


# ------------------------------------------------------------------- token ----


def issue_token(db: Session, user: User, kind: str) -> str:
    """Buat token baru (token lama jenis yang sama untuk pengguna ini dibatalkan)."""
    for old in db.scalars(select(Token).where(Token.user_id == user.id, Token.kind == kind, Token.used_at.is_(None))).all():
        old.used_at = now_iso()
    raw = new_token()
    ttl = timedelta(minutes=RESET_MINUTES) if kind == "reset" else timedelta(hours=VERIFY_HOURS)
    now = now_utc()
    db.add(Token(id=token_hash(raw), user_id=user.id, kind=kind, created_at=iso(now), expires_at=iso(now + ttl)))
    db.commit()
    return raw


def recent_token(db: Session, user: User, kind: str, seconds: int) -> bool:
    """Benar bila token jenis ini baru saja dibuat untuk pengguna (pembatas kirim ulang)."""
    cut = iso(now_utc() - timedelta(seconds=seconds))
    return db.scalar(select(Token.id).where(Token.user_id == user.id, Token.kind == kind, Token.created_at >= cut)) is not None


def consume_token(db: Session, raw: str, kind: str) -> User | None:
    """Kembalikan pengguna bila token valid (belum dipakai, belum kedaluwarsa) dan tandai terpakai."""
    if not raw or len(raw) > 200:
        return None
    t = db.get(Token, token_hash(raw))
    if t is None or t.kind != kind or t.used_at is not None or t.expires_at <= now_iso():
        return None
    user = db.get(User, t.user_id)
    if user is None:
        return None
    t.used_at = now_iso()
    return user


def send_reset(db: Session, user: User, origin: str | None) -> None:
    raw = issue_token(db, user, "reset")
    link = f"{notify.public_url(origin)}/reset?token={raw}"
    subject, body = notify.reset_texts(user.name, link, RESET_MINUTES)
    notify.enqueue(db, "email", user.email, subject, body, ref="reset", user_id=user.id)
    if user.phone and notify.wa_provider():
        notify.enqueue(db, "wa", user.phone, subject, body, ref="reset", user_id=user.id)


def send_verification(db: Session, user: User, origin: str | None) -> None:
    raw = issue_token(db, user, "verify")
    link = f"{notify.public_url(origin)}/verify?token={raw}"
    subject, body = notify.verify_texts(user.name, link)
    notify.enqueue(db, "email", user.email, subject, body, ref="verify", user_id=user.id)
