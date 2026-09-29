"""Data awal fasilitas dan pengisian basis data saat pertama kali dijalankan."""
from __future__ import annotations

import json
import logging
from functools import lru_cache
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import config
from .models import Child, Food, InviteCode, ParentChild, Setting, User
from .security import hash_password, new_id, now_iso, temp_password

logger = logging.getLogger("smartdaycare.seed")

SEED_PATH = Path(__file__).with_name("seed.json")

SETTING_KEYS = (
    "tempMax",
    "humMax",
    "co2Max",
    "pm25Max",
    "bodyTempWatch",
    "bodyTempHigh",
    "retentionDays",
    "plateDiameterCm",
)


@lru_cache(maxsize=1)
def seed() -> dict[str, Any]:
    with SEED_PATH.open(encoding="utf-8") as fh:
        return json.load(fh)


def bootstrap_admin(db: Session) -> None:
    """Mode produksi (SD_SAMPLE_DATA=0): buat satu akun admin bila belum ada pengguna sama sekali."""
    if db.scalar(select(User.id).limit(1)) is not None:
        return
    email = config.ADMIN_EMAIL or "admin@daycare.local"
    password = config.ADMIN_PASSWORD
    generated = password is None
    if generated:
        password = temp_password()
    created = now_iso()
    db.add(
        User(
            id=new_id("U-ADM"),
            name=config.ADMIN_NAME,
            email=email,
            phone="",
            role="admin",
            password_hash=hash_password(str(password)),
            area="",
            shift="",
            seed=False,
            created_at=created,
            email_verified_at=created,
            must_change_password=True,
        )
    )
    db.flush()
    if generated:
        logger.warning("Akun admin pertama dibuat: %s — kata sandi sementara: %s (wajib diganti saat masuk pertama)", email, password)
    else:
        logger.info("Akun admin pertama dibuat: %s (kata sandi dari SD_ADMIN_PASSWORD, wajib diganti saat masuk pertama)", email)


def ensure_seeded(db: Session) -> None:
    """Isi tabel yang masih kosong. Aman dipanggil berulang.

    Mode data contoh (bawaan): anak, akun, dan kode undangan contoh ikut dibuat agar aplikasi
    langsung bisa dicoba. Mode produksi: hanya makanan, ambang, dan satu akun admin.
    """
    data = seed()

    if not config.SAMPLE_DATA:
        if db.scalar(select(Food.id).limit(1)) is None:
            for f in data["foods"]:
                db.add(Food(name=f["name"], kcal=f["kcal"], protein=f["protein"], carbs=f["carbs"], fat=f["fat"], seed=True))
        if db.scalar(select(Setting.key).limit(1)) is None:
            for k in SETTING_KEYS:
                db.add(Setting(key=k, value=data["thresholds"][k]))
        bootstrap_admin(db)
        db.commit()
        return

    if db.scalar(select(Child.id).limit(1)) is None:
        for c in data["children"]:
            db.add(Child(id=c["id"], code=c["code"], name=c["name"], short=c["short"], data=c))
        db.flush()

    if db.scalar(select(User.id).limit(1)) is None:
        created = now_iso()
        for u in data["users"]:
            db.add(
                User(
                    id=u["id"],
                    name=u["name"],
                    email=u["email"].lower(),
                    phone=u.get("phone", ""),
                    role=u["role"],
                    password_hash=hash_password(u["seedPassword"]),
                    area=u.get("area", ""),
                    shift=u.get("shift", ""),
                    seed=True,
                    created_at=created,
                    email_verified_at=created,
                )
            )
            for cid in u.get("children", []) or []:
                db.add(ParentChild(user_id=u["id"], child_id=cid, linked_at=created, linked_via="seed"))
        db.flush()

    if db.scalar(select(Food.id).limit(1)) is None:
        for f in data["foods"]:
            db.add(Food(name=f["name"], kcal=f["kcal"], protein=f["protein"], carbs=f["carbs"], fat=f["fat"], seed=True))

    if db.scalar(select(Setting.key).limit(1)) is None:
        for k in SETTING_KEYS:
            db.add(Setting(key=k, value=data["thresholds"][k]))

    if db.scalar(select(InviteCode.code).limit(1)) is None:
        for role, code in data["inviteCodes"].items():
            # Kode awal fasilitas: tanpa batas waktu/pemakaian agar tim inti bisa mendaftar;
            # admin diharapkan menonaktifkannya lalu membuat kode berjangka untuk staf berikutnya.
            db.add(
                InviteCode(
                    code=code,
                    role=role,
                    label="Kode awal fasilitas",
                    active=True,
                    created_at=now_iso(),
                    created_by="SmartDaycare",
                    expires_at=None,
                    max_uses=None,
                    uses=0,
                )
            )

    db.commit()


def settings_dict(db: Session) -> dict[str, Any]:
    rows = db.scalars(select(Setting)).all()
    out = {r.key: r.value for r in rows}
    for k in SETTING_KEYS:
        out.setdefault(k, seed()["thresholds"][k])
    return out


FACILITY_KEYS = ("name", "city", "address", "phone", "hours", "email")


def facility_info(db: Session) -> dict[str, Any]:
    """Profil fasilitas: nilai awal dari seed.json, ditimpa oleh pengaturan admin (Setting 'facility')."""
    base = {k: str(seed()["facility"].get(k, "")) for k in FACILITY_KEYS}
    row = db.get(Setting, "facility")
    if row is not None and isinstance(row.value, dict):
        base.update({k: str(v) for k, v in row.value.items() if k in FACILITY_KEYS and isinstance(v, str)})
    return base
