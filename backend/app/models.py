from __future__ import annotations

from typing import Any

from sqlalchemy import JSON, Boolean, Float, ForeignKey, Integer, LargeBinary, String, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(24), primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(200), unique=True, index=True)
    phone: Mapped[str] = mapped_column(String(40), default="")
    role: Mapped[str] = mapped_column(String(16), index=True)
    password_hash: Mapped[str] = mapped_column(String(300))
    area: Mapped[str] = mapped_column(String(120), default="")
    shift: Mapped[str] = mapped_column(String(60), default="")
    seed: Mapped[bool] = mapped_column(Boolean, default=False)
    disabled: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[str] = mapped_column(String(32))
    failed_logins: Mapped[int] = mapped_column(Integer, default=0)
    locked_until: Mapped[str | None] = mapped_column(String(32), nullable=True)
    must_change_password: Mapped[bool] = mapped_column(Boolean, default=False)
    # kode undangan yang dipakai saat mendaftar (staf/admin); untuk jejak audit admin
    invite_code: Mapped[str | None] = mapped_column(String(40), nullable=True)
    # verifikasi email: None = belum; berisi waktu ISO saat tautan verifikasi dibuka
    email_verified_at: Mapped[str | None] = mapped_column(String(32), nullable=True)

    links: Mapped[list[ParentChild]] = relationship(cascade="all, delete-orphan", lazy="selectin")
    sessions: Mapped[list[AuthSession]] = relationship(cascade="all, delete-orphan")


class Child(Base):
    __tablename__ = "children"

    id: Mapped[str] = mapped_column(String(24), primary_key=True)
    code: Mapped[str] = mapped_column(String(24), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120))
    short: Mapped[str] = mapped_column(String(60))
    data: Mapped[dict[str, Any]] = mapped_column(JSON)
    # anak keluar dari daycare: diarsipkan (tidak tampil di dasbor, kode anak tidak berlaku)
    archived_at: Mapped[str | None] = mapped_column(String(32), nullable=True)
    archived_note: Mapped[str] = mapped_column(String(200), default="")


class ParentChild(Base):
    __tablename__ = "parent_children"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    child_id: Mapped[str] = mapped_column(ForeignKey("children.id", ondelete="CASCADE"), primary_key=True)
    linked_at: Mapped[str] = mapped_column(String(32), default="")
    # register (saat daftar) · link (dari Beranda/Akun) · admin (dibuat admin) · seed (data awal)
    linked_via: Mapped[str] = mapped_column(String(16), default="seed")


class AuthSession(Base):
    __tablename__ = "sessions"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)  # sha256(token)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    created_at: Mapped[str] = mapped_column(String(32))
    expires_at: Mapped[str] = mapped_column(String(32), index=True)
    last_seen: Mapped[str] = mapped_column(String(32))
    remember: Mapped[bool] = mapped_column(Boolean, default=False)
    ip: Mapped[str] = mapped_column(String(64), default="")
    agent: Mapped[str] = mapped_column(String(200), default="")
    csrf: Mapped[str] = mapped_column(String(64))


class LogEntry(Base):
    __tablename__ = "log"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    type: Mapped[str] = mapped_column(String(16), index=True)
    child_id: Mapped[str | None] = mapped_column(String(24), index=True, nullable=True)
    child_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    user_id: Mapped[str | None] = mapped_column(String(24), nullable=True)
    by_name: Mapped[str] = mapped_column(String(120))
    role: Mapped[str] = mapped_column(String(16))
    at: Mapped[str] = mapped_column(String(32), index=True)
    sev: Mapped[str] = mapped_column(String(8), default="low")
    title: Mapped[str] = mapped_column(String(200))
    text: Mapped[str] = mapped_column(Text, default="")
    silent: Mapped[bool] = mapped_column(Boolean, default=False)
    meal: Mapped[str | None] = mapped_column(String(16), nullable=True)
    done: Mapped[str | None] = mapped_column(String(12), nullable=True)  # plate: None|"done"|"replaced"
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    photo: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    photo_pre: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    photo_post: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)


class Setting(Base):
    __tablename__ = "settings"

    key: Mapped[str] = mapped_column(String(40), primary_key=True)
    value: Mapped[Any] = mapped_column(JSON)


class Food(Base):
    __tablename__ = "foods"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(80), unique=True)
    kcal: Mapped[float] = mapped_column(Float)
    protein: Mapped[float] = mapped_column(Float)
    carbs: Mapped[float] = mapped_column(Float)
    fat: Mapped[float] = mapped_column(Float)
    seed: Mapped[bool] = mapped_column(Boolean, default=False)


class InviteCode(Base):
    __tablename__ = "invite_codes"

    code: Mapped[str] = mapped_column(String(40), primary_key=True)
    role: Mapped[str] = mapped_column(String(16))
    label: Mapped[str] = mapped_column(String(80), default="")
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[str] = mapped_column(String(32), default="")
    created_by: Mapped[str] = mapped_column(String(120), default="")
    # None = tanpa batas waktu / tanpa batas pemakaian (hanya untuk kode awal fasilitas)
    expires_at: Mapped[str | None] = mapped_column(String(32), nullable=True)
    max_uses: Mapped[int | None] = mapped_column(Integer, nullable=True)
    uses: Mapped[int] = mapped_column(Integer, default=0)


class Pref(Base):
    __tablename__ = "prefs"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    key: Mapped[str] = mapped_column(String(40), primary_key=True)
    value: Mapped[Any] = mapped_column(JSON)


class Resolved(Base):
    __tablename__ = "resolved"

    incident_id: Mapped[str] = mapped_column(String(32), primary_key=True)
    by_name: Mapped[str] = mapped_column(String(120))
    at: Mapped[str] = mapped_column(String(32))


class Ticket(Base):
    __tablename__ = "tickets"

    id: Mapped[str] = mapped_column(String(24), primary_key=True)
    at: Mapped[str] = mapped_column(String(32))
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(200))
    org: Mapped[str] = mapped_column(String(120), default="")
    topic: Mapped[str] = mapped_column(String(60), default="")
    msg: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(16), default="open")
    user_id: Mapped[str | None] = mapped_column(String(24), nullable=True)


class Token(Base):
    """Token sekali pakai untuk pemulihan kata sandi dan verifikasi email (disimpan sebagai hash)."""

    __tablename__ = "tokens"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)  # sha256(token)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(12))  # reset | verify
    created_at: Mapped[str] = mapped_column(String(32))
    expires_at: Mapped[str] = mapped_column(String(32), index=True)
    used_at: Mapped[str | None] = mapped_column(String(32), nullable=True)


class Message(Base):
    """Kotak keluar pesan (email / WhatsApp). Setiap pesan tercatat berikut status pengirimannya."""

    __tablename__ = "messages"

    id: Mapped[str] = mapped_column(String(24), primary_key=True)
    at: Mapped[str] = mapped_column(String(32), index=True)
    channel: Mapped[str] = mapped_column(String(8))  # email | wa
    to: Mapped[str] = mapped_column(String(200))
    subject: Mapped[str] = mapped_column(String(200), default="")
    body: Mapped[str] = mapped_column(Text)
    # queued → sent | failed ; off = pengirim untuk kanal ini belum diatur
    status: Mapped[str] = mapped_column(String(10), default="queued", index=True)
    error: Mapped[str] = mapped_column(String(300), default="")
    provider: Mapped[str] = mapped_column(String(20), default="")
    provider_id: Mapped[str] = mapped_column(String(120), default="")
    ref: Mapped[str] = mapped_column(String(60), default="")  # reset | verify | alert:<entry> | daily | test
    user_id: Mapped[str | None] = mapped_column(String(24), nullable=True, index=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    sent_at: Mapped[str | None] = mapped_column(String(32), nullable=True)


class Device(Base):
    """Perangkat fisik terdaftar: sensor udara atau kamera. Token perangkat disimpan sebagai hash."""

    __tablename__ = "devices"

    id: Mapped[str] = mapped_column(String(24), primary_key=True)
    kind: Mapped[str] = mapped_column(String(8))  # sensor | camera
    name: Mapped[str] = mapped_column(String(80))
    room: Mapped[str] = mapped_column(String(80))
    token_hash: Mapped[str] = mapped_column(String(64), default="")
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[str] = mapped_column(String(32), default="")
    last_seen: Mapped[str | None] = mapped_column(String(32), nullable=True)
    # sensor: pembacaan terakhir {temp,hum,co2,pm25,battery}; kamera: {stream, kind}
    data: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    parents: Mapped[bool] = mapped_column(Boolean, default=False)  # kamera boleh dilihat orang tua


class ChatThread(Base):
    """Percakapan orang tua–daycare. Jenis: child (guru & orang tua satu anak), announce (pengumuman),
    admin (orang tua ↔ admin daycare), group (grup orang tua)."""

    __tablename__ = "chat_threads"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    kind: Mapped[str] = mapped_column(String(24), index=True)
    child_id: Mapped[str | None] = mapped_column(String(24), nullable=True, index=True)
    user_id: Mapped[str | None] = mapped_column(String(24), nullable=True, index=True)
    title: Mapped[str] = mapped_column(String(120))
    created_at: Mapped[str] = mapped_column(String(32))
    last_at: Mapped[str] = mapped_column(String(32), default="")
    last_text: Mapped[str] = mapped_column(String(200), default="")
    last_by: Mapped[str] = mapped_column(String(120), default="")


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    thread_id: Mapped[str] = mapped_column(ForeignKey("chat_threads.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[str | None] = mapped_column(String(24), nullable=True)
    by_name: Mapped[str] = mapped_column(String(120))
    role: Mapped[str] = mapped_column(String(16))
    at: Mapped[str] = mapped_column(String(32), index=True)
    text: Mapped[str] = mapped_column(Text)


class ChatRead(Base):
    """Penanda 'sudah dibaca' per pengguna per percakapan."""

    __tablename__ = "chat_reads"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    thread_id: Mapped[str] = mapped_column(ForeignKey("chat_threads.id", ondelete="CASCADE"), primary_key=True)
    at: Mapped[str] = mapped_column(String(32))


class CameraRequest(Base):
    """Permintaan akses kamera oleh orang tua; hanya berlaku setelah disetujui admin dan belum kedaluwarsa."""

    __tablename__ = "camera_requests"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    child_id: Mapped[str | None] = mapped_column(String(24), nullable=True)
    cam_id: Mapped[str] = mapped_column(String(24), index=True)
    reason: Mapped[str] = mapped_column(String(300), default="")
    # pending → approved | denied ; approved → revoked ; approved yang lewat masa berlaku = expired (dihitung)
    status: Mapped[str] = mapped_column(String(12), default="pending", index=True)
    created_at: Mapped[str] = mapped_column(String(32))
    decided_at: Mapped[str | None] = mapped_column(String(32), nullable=True)
    decided_by: Mapped[str] = mapped_column(String(120), default="")
    expires_at: Mapped[str | None] = mapped_column(String(32), nullable=True)
    note: Mapped[str] = mapped_column(String(300), default="")


class Feedback(Base):
    """Umpan balik dan penilaian orang tua (1–5 bintang) beserta tanggapan daycare."""

    __tablename__ = "feedback"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    user_id: Mapped[str | None] = mapped_column(String(24), nullable=True, index=True)
    by_name: Mapped[str] = mapped_column(String(120))
    child_id: Mapped[str | None] = mapped_column(String(24), nullable=True)
    at: Mapped[str] = mapped_column(String(32), index=True)
    rating: Mapped[int] = mapped_column(Integer)
    text: Mapped[str] = mapped_column(Text, default="")
    sentiment: Mapped[str] = mapped_column(String(10), default="netral")  # positif | netral | negatif
    response: Mapped[str] = mapped_column(Text, default="")
    responded_at: Mapped[str | None] = mapped_column(String(32), nullable=True)
    responded_by: Mapped[str] = mapped_column(String(120), default="")
