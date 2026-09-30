from __future__ import annotations

import csv
import io
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import Auth, require_roles
from .. import notify
from ..alerts import daily_summaries
from ..devices import device_status
from ..events import notify_change
from ..logic import TZ, local_clock
from ..models import AuthSession, Child, Food, InviteCode, LogEntry, ParentChild, Setting, Ticket, User
from ..schemas import AdminCreateUserIn, ArchiveIn, ChildIn, FacilityIn, FoodIn, InviteCreateIn, InvitePatchIn, SettingsIn, TestMessageIn, TicketPatchIn, UserPatchIn
from ..security import hash_password, iso, new_child_code, new_id, new_invite_code, now_iso, now_utc, password_score, temp_password
from ..seed import SETTING_KEYS, facility_info, seed, settings_dict
from ..serialize import ROLE_LABEL, child_public, foods_public, invite_public, invites_public, messages_public, user_public
from .auth import access_entry

router = APIRouter(prefix="/api/admin", tags=["admin"], dependencies=[Depends(require_roles("admin"))])
ADMIN = require_roles("admin")


@router.put("/settings")
def put_settings(body: SettingsIn, auth: Auth = Depends(ADMIN), db: Session = Depends(get_db)) -> dict:
    if body.bodyTempHigh <= body.bodyTempWatch:
        raise HTTPException(422, "Batas suhu tinggi harus lebih besar dari batas pantau.")
    data = body.model_dump()
    for k in SETTING_KEYS:
        row = db.get(Setting, k)
        if row is None:
            db.add(Setting(key=k, value=data[k]))
        else:
            row.value = data[k]
    access_entry(db, auth.user, "Mengubah pengaturan ambang", ", ".join(f"{k}={data[k]}" for k in SETTING_KEYS))
    db.commit()
    notify_change("settings")
    return {"thresholds": settings_dict(db)}


@router.post("/foods")
def add_food(body: FoodIn, auth: Auth = Depends(ADMIN), db: Session = Depends(get_db)) -> dict:
    if db.scalar(select(Food.id).where(Food.name.ilike(body.name))):
        raise HTTPException(409, "Nama makanan sudah ada di tabel.")
    db.add(Food(name=body.name, kcal=body.kcal, protein=body.protein, carbs=body.carbs, fat=body.fat, seed=False))
    access_entry(db, auth.user, f"Menambah makanan: {body.name}")
    db.commit()
    notify_change("foods")
    return {"foods": foods_public(db)}


@router.delete("/foods/{food_id}")
def delete_food(food_id: int, auth: Auth = Depends(ADMIN), db: Session = Depends(get_db)) -> dict:
    f = db.get(Food, food_id)
    if f is None:
        raise HTTPException(404, "Makanan tidak ditemukan.")
    if f.seed:
        raise HTTPException(403, "Makanan bawaan tidak dapat dihapus.")
    db.delete(f)
    access_entry(db, auth.user, f"Menghapus makanan: {f.name}")
    db.commit()
    notify_change("foods")
    return {"foods": foods_public(db)}


@router.patch("/users/{user_id}")
def patch_user(user_id: str, body: UserPatchIn, auth: Auth = Depends(ADMIN), db: Session = Depends(get_db)) -> dict:
    u = db.get(User, user_id)
    if u is None:
        raise HTTPException(404, "Akun tidak ditemukan.")
    if u.id == auth.user.id:
        raise HTTPException(422, "Anda tidak dapat menonaktifkan akun sendiri.")
    u.disabled = body.disabled
    if body.disabled:
        db.execute(delete(AuthSession).where(AuthSession.user_id == u.id))
    access_entry(db, auth.user, ("Menonaktifkan" if body.disabled else "Mengaktifkan") + f" akun {u.name}", u.email)
    db.commit()
    notify_change("users")
    return {"user": user_public(u)}


@router.post("/users/{user_id}/reset-password")
def reset_password(user_id: str, auth: Auth = Depends(ADMIN), db: Session = Depends(get_db)) -> dict:
    u = db.get(User, user_id)
    if u is None:
        raise HTTPException(404, "Akun tidak ditemukan.")
    pw = temp_password()
    u.password_hash = hash_password(pw)
    u.must_change_password = True
    u.failed_logins = 0
    u.locked_until = None
    db.execute(delete(AuthSession).where(AuthSession.user_id == u.id))
    access_entry(db, auth.user, f"Mengatur ulang kata sandi {u.name}", u.email)
    db.commit()
    notify_change("users")
    # kata sandi sementara hanya dikembalikan sekali, kepada admin yang memintanya
    return {"temporaryPassword": pw, "user": user_public(u)}


@router.post("/users")
def create_user(body: AdminCreateUserIn, auth: Auth = Depends(ADMIN), db: Session = Depends(get_db)) -> dict:
    email = body.email.lower()
    if db.scalar(select(User.id).where(User.email == email)):
        raise HTTPException(409, "Email ini sudah terdaftar.")
    if password_score(body.password) < 2:
        raise HTTPException(422, "Kata sandi terlalu lemah.")
    child: Child | None = None
    if body.role == "parent" and body.childCode:
        child = db.scalar(select(Child).where(Child.code == body.childCode.strip().upper()))
        if child is None:
            raise HTTPException(422, "Kode anak tidak ditemukan.")
    prefix = {"parent": "U-P", "caregiver": "U-C", "admin": "U-A"}[body.role]
    u = User(
        id=new_id(prefix),
        name=body.name,
        email=email,
        phone=body.phone,
        role=body.role,
        password_hash=hash_password(body.password),
        area="Seluruh fasilitas" if body.role == "admin" else ("Ruang Bermain dan Makan" if body.role == "caregiver" else ""),
        shift="Pagi (07.00–14.00)" if body.role == "caregiver" else "",
        seed=False,
        created_at=now_iso(),
        must_change_password=True,
    )
    db.add(u)
    db.flush()
    if child is not None:
        db.add(ParentChild(user_id=u.id, child_id=child.id, linked_at=now_iso(), linked_via="admin"))
    access_entry(db, auth.user, f"Membuat akun {ROLE_LABEL[body.role].lower()}: {body.name}", email)
    db.commit()
    db.refresh(u)
    notify_change("users")
    return {"user": user_public(u)}


# --- Kode undangan staf/admin --------------------------------------------------------------


@router.post("/invites")
def create_invite(body: InviteCreateIn, auth: Auth = Depends(ADMIN), db: Session = Depends(get_db)) -> dict:
    code = new_invite_code(body.role)
    while db.get(InviteCode, code) is not None:  # pragma: no cover - tabrakan sangat jarang
        code = new_invite_code(body.role)
    inv = InviteCode(
        code=code,
        role=body.role,
        label=body.label.strip(),
        active=True,
        created_at=now_iso(),
        created_by=auth.user.name,
        expires_at=iso(now_utc() + timedelta(days=body.days)),
        max_uses=body.maxUses,
        uses=0,
    )
    db.add(inv)
    uses = "tanpa batas pemakaian" if body.maxUses is None else f"{body.maxUses} kali pakai"
    access_entry(db, auth.user, f"Membuat kode undangan {ROLE_LABEL[body.role].lower()}", f"{code} · {body.days} hari · {uses}")
    db.commit()
    notify_change("users")
    return {"invite": invite_public(inv), "inviteCodes": invites_public(db)}


@router.patch("/invites/{code}")
def patch_invite(code: str, body: InvitePatchIn, auth: Auth = Depends(ADMIN), db: Session = Depends(get_db)) -> dict:
    inv = db.get(InviteCode, code.strip().upper())
    if inv is None:
        raise HTTPException(404, "Kode undangan tidak ditemukan.")
    if inv.active == body.active:
        return {"invite": invite_public(inv), "inviteCodes": invites_public(db)}
    inv.active = body.active
    access_entry(db, auth.user, ("Menonaktifkan" if not body.active else "Mengaktifkan") + " kode undangan", inv.code)
    db.commit()
    notify_change("users")
    return {"invite": invite_public(inv), "inviteCodes": invites_public(db)}


# --- Anak & kode anak -----------------------------------------------------------------------


def _age_label(dob: str, today: date) -> str:
    y, m, d = (int(x) for x in dob.split("-"))
    years = today.year - y - ((today.month, today.day) < (m, d))
    if years >= 1:
        return f"{years} tahun"
    months = (today.year - y) * 12 + today.month - m - (today.day < d)
    return f"{max(months, 0)} bulan"


def _target_for(years: int) -> dict[str, int]:
    # target energi & zat gizi porsi daycare (siang hari) per kelompok umur, selaras data awal
    if years <= 2:
        return {"kcal": 1000, "protein": 25, "carbs": 135, "fat": 35}
    if years == 3:
        return {"kcal": 1100, "protein": 28, "carbs": 150, "fat": 38}
    return {"kcal": 1200, "protein": 32, "carbs": 160, "fat": 40}


def _validate_child(body: ChildIn, db: Session) -> None:
    try:
        dob = date.fromisoformat(body.dob)
    except ValueError:
        raise HTTPException(422, "Tanggal lahir tidak valid.") from None
    today = datetime.now(TZ).date()
    if dob > today:
        raise HTTPException(422, "Tanggal lahir tidak boleh di masa depan.")
    if today.year - dob.year > 8:
        raise HTTPException(422, "Usia anak melebihi rentang layanan daycare (maksimal 8 tahun).")
    rooms = {r["name"] for r in seed()["rooms"] if "staf" not in r["name"].lower()}
    if body.room not in rooms:
        raise HTTPException(422, "Ruang tidak dikenal. Pilih salah satu ruang anak.")
    if body.caregiver:
        ok = db.scalar(select(User.id).where(User.role == "caregiver", User.name == body.caregiver, User.disabled.is_(False)))
        if ok is None:
            raise HTTPException(422, "Pengasuh tidak ditemukan atau sudah nonaktif.")


def _apply_child(c: Child, body: ChildIn) -> None:
    today = datetime.now(TZ).date()
    dob = date.fromisoformat(body.dob)
    years = today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))
    short = body.short.strip() or body.name.strip().split(" ")[0]
    data = dict(c.data or {})
    data.update(
        {
            "id": c.id,
            "code": c.code,
            "name": body.name.strip(),
            "short": short,
            "dob": body.dob,
            "age": _age_label(body.dob, today),
            "parentName": body.parentName.strip(),
            "caregiver": body.caregiver.strip(),
            "room": body.room,
            "allergies": body.allergies.strip() or "Tidak ada",
            "meds": body.meds.strip() or None,
            "emergency": [{"n": body.emergencyName.strip(), "p": body.emergencyPhone.strip()}] if body.emergencyName.strip() else data.get("emergency", []),
        }
    )
    # nilai yang hanya ada pada anak baru (anak lama mempertahankan riwayatnya)
    data.setdefault("status", "normal")
    data.setdefault("statusText", "Belum hadir")
    data.setdefault("checkin", None)
    data.setdefault("checkout", None)
    data.setdefault("timeline", [])
    data.setdefault("nutrition", {})
    data.setdefault("consumed", {"kcal": 0, "protein": 0, "carbs": 0, "fat": 0})
    data.setdefault("weekly", [0, 0, 0, 0, 0, 0, 0])
    data.setdefault("temps", [])
    if "target" not in data or not c.data:
        data["target"] = _target_for(years)
    c.name = data["name"]
    c.short = short
    c.data = data


def _unique_child_code(db: Session) -> str:
    code = new_child_code()
    while db.scalar(select(Child.id).where(Child.code == code)) is not None:
        code = new_child_code()
    return code


@router.post("/children")
def create_child(body: ChildIn, auth: Auth = Depends(ADMIN), db: Session = Depends(get_db)) -> dict:
    _validate_child(body, db)
    if db.scalar(select(Child.id).where(Child.name.ilike(body.name.strip()), Child.data["dob"].as_string() == body.dob)):
        raise HTTPException(409, "Anak dengan nama dan tanggal lahir yang sama sudah terdaftar.")
    ids = db.scalars(select(Child.id)).all()
    n = 1 + max((int(i.split("-")[-1]) for i in ids if i.startswith("CHK-") and i.split("-")[-1].isdigit()), default=0)
    c = Child(id=f"CHK-{n:03d}", code=_unique_child_code(db), name=body.name.strip(), short=body.short or body.name.split(" ")[0], data={})
    _apply_child(c, body)
    db.add(c)
    access_entry(db, auth.user, f"Mendaftarkan anak baru: {c.name}", f"Kode {c.code} · {body.room}")
    db.commit()
    notify_change("users")
    return {"child": c.data, "code": c.code}


@router.patch("/children/{child_id}")
def update_child(child_id: str, body: ChildIn, auth: Auth = Depends(ADMIN), db: Session = Depends(get_db)) -> dict:
    c = db.get(Child, child_id)
    if c is None:
        raise HTTPException(404, "Anak tidak ditemukan.")
    _validate_child(body, db)
    _apply_child(c, body)
    from sqlalchemy.orm.attributes import flag_modified

    flag_modified(c, "data")
    access_entry(db, auth.user, f"Memperbarui data anak: {c.name}", f"{body.room} · pengasuh {body.caregiver or '-'}")
    db.commit()
    notify_change("users")
    return {"child": c.data}


@router.post("/children/{child_id}/new-code")
def regenerate_child_code(child_id: str, auth: Auth = Depends(ADMIN), db: Session = Depends(get_db)) -> dict:
    c = db.get(Child, child_id)
    if c is None:
        raise HTTPException(404, "Anak tidak ditemukan.")
    old = c.code
    c.code = _unique_child_code(db)
    data = dict(c.data)
    data["code"] = c.code
    c.data = data
    access_entry(db, auth.user, f"Mengganti kode anak {c.short}", f"{old} tidak berlaku lagi; kode baru {c.code}")
    db.commit()
    notify_change("users")
    return {"child": c.data, "code": c.code}


@router.delete("/links/{user_id}/{child_id}")
def unlink_parent(user_id: str, child_id: str, auth: Auth = Depends(ADMIN), db: Session = Depends(get_db)) -> dict:
    link = db.get(ParentChild, (user_id, child_id))
    if link is None:
        raise HTTPException(404, "Tautan tidak ditemukan.")
    u = db.get(User, user_id)
    c = db.get(Child, child_id)
    db.delete(link)
    access_entry(db, auth.user, f"Melepas tautan {u.name if u else user_id} dari {c.short if c else child_id}", "Akses ke data anak dicabut")
    db.commit()
    notify_change("users")
    return {"ok": True}


@router.post("/log/reset")
def reset_log(auth: Auth = Depends(ADMIN), db: Session = Depends(get_db)) -> dict:
    n = db.execute(delete(LogEntry).where(LogEntry.type.notin_(("access", "account")))).rowcount
    from ..models import Resolved

    db.execute(delete(Resolved))
    access_entry(db, auth.user, "Mengosongkan catatan harian aplikasi", f"{n} catatan dihapus")
    db.commit()
    notify_change("log")
    return {"deleted": n}


@router.get("/access.csv")
def export_access(auth: Auth = Depends(ADMIN), db: Session = Depends(get_db)) -> Response:
    rows = db.scalars(select(LogEntry).where(LogEntry.type.in_(("access", "account"))).order_by(LogEntry.at.desc()).limit(5000)).all()
    buf = io.StringIO()
    buf.write("\ufeff")
    w = csv.writer(buf, delimiter=";")
    w.writerow(["Tanggal", "Pukul", "Pengguna", "Peran", "Aktivitas", "Keterangan"])
    for e in rows:
        dt = datetime.strptime(e.at, "%Y-%m-%dT%H:%M:%S.%fZ").replace(tzinfo=__import__("datetime").UTC).astimezone(TZ)
        w.writerow([dt.strftime("%Y-%m-%d"), dt.strftime("%H:%M"), e.by_name, ROLE_LABEL.get(e.role, e.role), e.title, e.text])
    today = datetime.now(TZ).strftime("%Y-%m-%d")
    for a in seed()["access"]:
        w.writerow([today, a["t"], a["user"], ROLE_LABEL.get(a["role"], a["role"]), a["action"], a["purpose"]])
    access_entry(db, auth.user, "Mengekspor riwayat akses (CSV)")
    db.commit()
    return Response(
        content=buf.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="riwayat-akses-{today}.csv"'},
    )


@router.post("/devices/check")
def check_devices(auth: Auth = Depends(ADMIN), db: Session = Depends(get_db)) -> dict:
    devices = device_status(db)
    ok = sum(1 for d in devices if d["ok"])
    access_entry(db, auth.user, "Memeriksa koneksi perangkat", f"{ok} dari {len(devices)} perangkat merespons")
    db.commit()
    notify_change("log")
    return {"devices": devices, "ok": ok, "total": len(devices), "checkedAt": local_clock(now_iso())}


@router.patch("/tickets/{ticket_id}")
def patch_ticket(ticket_id: str, body: TicketPatchIn, auth: Auth = Depends(ADMIN), db: Session = Depends(get_db)) -> dict:
    t = db.get(Ticket, ticket_id)
    if t is None:
        raise HTTPException(404, "Permintaan tidak ditemukan.")
    t.status = body.status
    db.commit()
    notify_change("tickets")
    return {"ok": True}


# --- Arsip anak (anak keluar dari daycare) -----------------------------------------------------


@router.post("/children/{child_id}/archive")
def archive_child(child_id: str, body: ArchiveIn, auth: Auth = Depends(ADMIN), db: Session = Depends(get_db)) -> dict:
    c = db.get(Child, child_id)
    if c is None:
        raise HTTPException(404, "Data anak tidak ditemukan.")
    if c.archived_at:
        raise HTTPException(409, "Anak ini sudah diarsipkan.")
    c.archived_at = now_iso()
    c.archived_note = body.note
    access_entry(db, auth.user, f"Mengarsipkan data anak {c.short}", body.note or "Anak keluar dari daycare")
    db.commit()
    notify_change("children")
    return {"child": child_public(c)}


@router.post("/children/{child_id}/restore")
def restore_child(child_id: str, auth: Auth = Depends(ADMIN), db: Session = Depends(get_db)) -> dict:
    c = db.get(Child, child_id)
    if c is None:
        raise HTTPException(404, "Data anak tidak ditemukan.")
    if not c.archived_at:
        raise HTTPException(409, "Anak ini masih aktif.")
    c.archived_at = None
    c.archived_note = ""
    access_entry(db, auth.user, f"Memulihkan data anak {c.short} dari arsip")
    db.commit()
    notify_change("children")
    return {"child": child_public(c)}


@router.delete("/children/{child_id}")
def delete_child(child_id: str, auth: Auth = Depends(ADMIN), db: Session = Depends(get_db)) -> dict:
    """Hapus permanen: hanya untuk anak yang sudah diarsipkan. Catatan hariannya ikut dihapus."""
    c = db.get(Child, child_id)
    if c is None:
        raise HTTPException(404, "Data anak tidak ditemukan.")
    if not c.archived_at:
        raise HTTPException(409, "Arsipkan dulu sebelum menghapus permanen.")
    short = c.short
    db.execute(delete(ParentChild).where(ParentChild.child_id == c.id))
    db.execute(delete(LogEntry).where(LogEntry.child_id == c.id))
    db.delete(c)
    access_entry(db, auth.user, f"Menghapus permanen data anak {short}", "Catatan harian anak ikut dihapus")
    db.commit()
    notify_change("children")
    notify_change("log")
    return {"ok": True}


# --- Kotak keluar pesan ------------------------------------------------------------------------


@router.get("/messages")
def list_messages(auth: Auth = Depends(ADMIN), db: Session = Depends(get_db)) -> dict:
    return {"messages": messages_public(db), "channels": notify.channels()}


@router.post("/messages/{message_id}/retry")
def retry_message(message_id: str, auth: Auth = Depends(ADMIN), db: Session = Depends(get_db)) -> dict:
    m = notify.retry(db, message_id)
    if m is None:
        raise HTTPException(404, "Pesan tidak ditemukan.")
    return {"messages": messages_public(db)}


@router.post("/messages/test")
def test_message(body: TestMessageIn, auth: Auth = Depends(ADMIN), db: Session = Depends(get_db)) -> dict:
    """Kirim pesan percobaan ke admin sendiri untuk memastikan pengaturan pengirim benar."""
    to = auth.user.email if body.channel == "email" else auth.user.phone
    if not to:
        raise HTTPException(422, "Nomor WhatsApp akun Anda belum diisi (menu Akun).")
    text = f"Pesan percobaan dari {notify.facility_name()} · {local_clock(now_iso())}. Jika Anda menerima ini, pengaturan pengirim sudah benar."
    notify.enqueue(db, body.channel, to, "Pesan percobaan SmartDaycare", text, ref="test", user_id=auth.user.id)
    access_entry(db, auth.user, f"Mengirim pesan percobaan ({body.channel})", to)
    db.commit()
    return {"messages": messages_public(db)}


@router.post("/messages/daily-now")
def daily_now(auth: Auth = Depends(ADMIN), db: Session = Depends(get_db)) -> dict:
    """Kirim ringkasan harian sekarang (biasanya otomatis pukul 17.30)."""
    n = daily_summaries(db, force=True)
    access_entry(db, auth.user, "Mengirim ringkasan harian sekarang", f"{n} pesan")
    db.commit()
    return {"sent": n, "messages": messages_public(db)}


@router.put("/facility")
def put_facility(body: FacilityIn, auth: Auth = Depends(ADMIN), db: Session = Depends(get_db)) -> dict:
    """Profil fasilitas yang tampil di halaman depan, pesan, dan kop laporan."""
    data = body.model_dump()
    row = db.get(Setting, "facility")
    if row is None:
        db.add(Setting(key="facility", value=data))
    else:
        row.value = data
    access_entry(db, auth.user, "Mengubah profil fasilitas", data["name"])
    db.commit()
    notify_change("settings")
    return {"facility": facility_info(db)}
