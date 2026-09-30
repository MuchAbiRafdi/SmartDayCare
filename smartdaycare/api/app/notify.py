"""Pengiriman pesan: email (SMTP atau Resend) dan WhatsApp (Meta Cloud API atau Fonnte).

Semua pesan lewat kotak keluar (tabel `messages`): dibuat oleh permintaan web, dikirim oleh
satu utas pekerja di latar belakang, dan statusnya (queued → sent | failed | off) bisa dilihat
admin di menu Perangkat & pesan. Bila pengirim untuk suatu kanal belum diatur, pesan tetap
dicatat dengan status `off` supaya admin tahu apa yang seharusnya terkirim (dan bisa
menyampaikannya lewat jalur lain).

Variabel lingkungan (lihat .env.example):
  Email  : SD_SMTP_HOST, SD_SMTP_PORT, SD_SMTP_USER, SD_SMTP_PASS, SD_SMTP_SECURITY (starttls|ssl|none)
           atau SD_RESEND_API_KEY.  Pengirim: SD_EMAIL_FROM.
  WhatsApp: SD_WA_PROVIDER=meta  + SD_WA_TOKEN + SD_WA_PHONE_ID [+ SD_WA_TEMPLATE, SD_WA_TEMPLATE_LANG]
            SD_WA_PROVIDER=fonnte + SD_WA_TOKEN
  Tautan : SD_PUBLIC_URL (alamat situs yang dipakai di tautan email/WA)
"""
from __future__ import annotations

import json
import logging
import re
import smtplib
import ssl
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from email.message import EmailMessage
from email.utils import formataddr, parseaddr
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import env
from .db import SessionLocal
from .models import Message
from .security import new_id, now_iso

logger = logging.getLogger("smartdaycare.notify")

SMTP_HOST = env("SD_SMTP_HOST")
SMTP_PORT = int(env("SD_SMTP_PORT") or 587)
SMTP_USER = env("SD_SMTP_USER")
SMTP_PASS = env("SD_SMTP_PASS")
SMTP_SECURITY = (env("SD_SMTP_SECURITY") or "starttls").lower()
RESEND_KEY = env("SD_RESEND_API_KEY")
EMAIL_FROM = env("SD_EMAIL_FROM") or "SmartDaycare <no-reply@smartdaycare.local>"

WA_PROVIDER = (env("SD_WA_PROVIDER") or "").lower()
WA_TOKEN = env("SD_WA_TOKEN")
WA_PHONE_ID = env("SD_WA_PHONE_ID")
WA_TEMPLATE = env("SD_WA_TEMPLATE")
WA_TEMPLATE_LANG = env("SD_WA_TEMPLATE_LANG") or "id"

PUBLIC_URL = (env("SD_PUBLIC_URL") or "").rstrip("/")

MAX_ATTEMPTS = 3
HTTP_TIMEOUT = 20


def email_provider() -> str | None:
    if SMTP_HOST:
        return "smtp"
    if RESEND_KEY:
        return "resend"
    return None


def wa_provider() -> str | None:
    if WA_PROVIDER == "meta" and WA_TOKEN and WA_PHONE_ID:
        return "meta"
    if WA_PROVIDER == "fonnte" and WA_TOKEN:
        return "fonnte"
    return None


def channels() -> dict[str, Any]:
    """Status kanal untuk antarmuka admin dan penentuan alur (mis. banner verifikasi email)."""
    return {
        "email": email_provider(),
        "wa": wa_provider(),
        "publicUrl": PUBLIC_URL or None,
        "waTemplate": bool(WA_TEMPLATE) if wa_provider() == "meta" else None,
    }


def normalize_phone(raw: str) -> str | None:
    """Nomor Indonesia ke format internasional tanpa tanda plus (08xx → 628xx)."""
    digits = re.sub(r"\D", "", raw or "")
    if not digits:
        return None
    if digits.startswith("0"):
        digits = "62" + digits[1:]
    elif digits.startswith("620"):
        digits = "62" + digits[3:]
    if len(digits) < 9 or len(digits) > 16:
        return None
    return digits


def public_url(fallback_origin: str | None = None) -> str:
    return PUBLIC_URL or (fallback_origin or "").rstrip("/")


# ------------------------------------------------------------------ antrean ----

_wake = threading.Event()


def enqueue(db: Session, channel: str, to: str, subject: str, body: str, *, ref: str = "", user_id: str | None = None) -> Message:
    """Catat pesan dan bangunkan pekerja. `to` untuk WA boleh 08xx/+62; dinormalkan di sini."""
    provider = email_provider() if channel == "email" else wa_provider()
    dest = to
    status = "queued" if provider else "off"
    error = "" if provider else ("Pengirim email belum diatur" if channel == "email" else "Pengirim WhatsApp belum diatur")
    if channel == "wa":
        norm = normalize_phone(to)
        if not norm:
            status, error = "failed", "Nomor WhatsApp tidak valid"
        else:
            dest = norm
    m = Message(
        id=new_id("M"),
        at=now_iso(),
        channel=channel,
        to=dest,
        subject=subject[:200],
        body=body,
        status=status,
        error=error,
        provider=provider or "",
        ref=ref[:60],
        user_id=user_id,
        attempts=0,
    )
    db.add(m)
    db.commit()
    if status == "queued":
        _wake.set()
    return m


def retry(db: Session, message_id: str) -> Message | None:
    m = db.get(Message, message_id)
    if m is None:
        return None
    provider = email_provider() if m.channel == "email" else wa_provider()
    if not provider:
        m.status, m.error = "off", "Pengirim belum diatur"
    else:
        m.status, m.error, m.attempts, m.provider = "queued", "", 0, provider
    db.commit()
    _wake.set()
    return m


# --------------------------------------------------------------- pengiriman ----


def _send_email_smtp(to: str, subject: str, body: str) -> str:
    assert SMTP_HOST
    msg = EmailMessage()
    name, addr = parseaddr(EMAIL_FROM)
    msg["From"] = formataddr((name or "SmartDaycare", addr or EMAIL_FROM))
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)
    ctx = ssl.create_default_context()
    if SMTP_SECURITY == "ssl":
        server: smtplib.SMTP = smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, timeout=HTTP_TIMEOUT, context=ctx)
    else:
        server = smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=HTTP_TIMEOUT)
    with server:
        server.ehlo()
        if SMTP_SECURITY == "starttls":
            server.starttls(context=ctx)
            server.ehlo()
        if SMTP_USER and SMTP_PASS:
            server.login(SMTP_USER, SMTP_PASS)
        server.send_message(msg)
    return "smtp"


def _http_json(url: str, payload: dict[str, Any] | None, headers: dict[str, str], *, form: bool = False) -> dict[str, Any]:
    data: bytes | None = None
    if payload is not None:
        data = urllib.parse.urlencode(payload).encode() if form else json.dumps(payload).encode()
    req = urllib.request.Request(url, data=data, method="POST" if data is not None else "GET")
    req.add_header("Content-Type", "application/x-www-form-urlencoded" if form else "application/json")
    for k, v in headers.items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT) as r:
            raw = r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", "replace")[:300]
        raise RuntimeError(f"HTTP {e.code}: {raw}") from None
    try:
        return json.loads(raw) if raw else {}
    except json.JSONDecodeError:
        return {"raw": raw[:300]}


def _send_email_resend(to: str, subject: str, body: str) -> str:
    assert RESEND_KEY
    res = _http_json(
        "https://api.resend.com/emails",
        {"from": EMAIL_FROM, "to": [to], "subject": subject, "text": body},
        {"Authorization": f"Bearer {RESEND_KEY}"},
    )
    return str(res.get("id") or "resend")


def _send_wa_meta(to: str, body: str) -> str:
    assert WA_TOKEN and WA_PHONE_ID
    url = f"https://graph.facebook.com/v20.0/{WA_PHONE_ID}/messages"
    if WA_TEMPLATE:
        # Pesan yang dimulai oleh bisnis harus memakai templat yang disetujui Meta; templat
        # diharapkan punya satu parameter {{1}} pada bagian isi.
        payload: dict[str, Any] = {
            "messaging_product": "whatsapp",
            "to": to,
            "type": "template",
            "template": {
                "name": WA_TEMPLATE,
                "language": {"code": WA_TEMPLATE_LANG},
                "components": [{"type": "body", "parameters": [{"type": "text", "text": body[:1000]}]}],
            },
        }
    else:
        payload = {"messaging_product": "whatsapp", "to": to, "type": "text", "text": {"preview_url": True, "body": body[:4000]}}
    res = _http_json(url, payload, {"Authorization": f"Bearer {WA_TOKEN}"})
    msgs = res.get("messages") or []
    return str(msgs[0].get("id") if msgs else "meta")


def _send_wa_fonnte(to: str, body: str) -> str:
    assert WA_TOKEN
    res = _http_json("https://api.fonnte.com/send", {"target": to, "message": body[:4000], "countryCode": "62"}, {"Authorization": WA_TOKEN}, form=True)
    if res.get("status") is False:
        raise RuntimeError(str(res.get("reason") or res)[:200])
    ids = res.get("id")
    return str(ids[0] if isinstance(ids, list) and ids else ids or "fonnte")


def deliver(m: Message) -> str:
    """Kirim satu pesan; mengembalikan id dari penyedia. Melempar RuntimeError bila gagal."""
    if m.channel == "email":
        p = email_provider()
        if p == "smtp":
            return _send_email_smtp(m.to, m.subject, m.body)
        if p == "resend":
            return _send_email_resend(m.to, m.subject, m.body)
    elif m.channel == "wa":
        p = wa_provider()
        if p == "meta":
            return _send_wa_meta(m.to, m.body)
        if p == "fonnte":
            return _send_wa_fonnte(m.to, m.body)
    raise RuntimeError("Pengirim belum diatur")


def _process_once() -> int:
    """Kirim semua pesan berstatus queued; kembalikan jumlah yang diproses."""
    done = 0
    with SessionLocal() as db:
        rows = db.scalars(select(Message).where(Message.status == "queued").order_by(Message.at).limit(20)).all()
        for m in rows:
            m.attempts += 1
            try:
                m.provider_id = deliver(m)[:120]
                m.status, m.error, m.sent_at = "sent", "", now_iso()
            except Exception as e:  # noqa: BLE001 - alasan disimpan untuk admin
                m.error = str(e)[:300]
                m.status = "failed" if m.attempts >= MAX_ATTEMPTS else "queued"
                logger.warning("Pengiriman %s ke %s gagal (%s/%s): %s", m.channel, m.to, m.attempts, MAX_ATTEMPTS, m.error)
            db.commit()
            done += 1
    return done


class Worker(threading.Thread):
    def __init__(self) -> None:
        super().__init__(name="notify-worker", daemon=True)
        self._stop = threading.Event()

    def run(self) -> None:
        backoff = 0.0
        while not self._stop.is_set():
            try:
                n = _process_once()
            except Exception:  # pragma: no cover - dicatat, pekerja tetap hidup
                logger.exception("Pekerja pesan gagal")
                n = 0
            with SessionLocal() as db:
                pending = db.scalar(select(Message.id).where(Message.status == "queued").limit(1)) is not None
            if pending and n:
                backoff = min(30.0, (backoff or 2.0) * 2)  # ada yang gagal & akan diulang
                _wake.wait(backoff)
            else:
                backoff = 0.0
                _wake.wait(15.0)
            _wake.clear()
            time.sleep(0.05)

    def stop(self) -> None:
        self._stop.set()
        _wake.set()


worker = Worker()


def start_worker() -> None:
    if not worker.is_alive():
        worker.start()


# ---------------------------------------------------------------- templat ----


def facility_name() -> str:
    from .db import SessionLocal
    from .seed import facility_info

    try:
        with SessionLocal() as db:
            return facility_info(db).get("name") or "SmartDaycare"
    except Exception:  # pragma: no cover - basis data belum siap
        return "SmartDaycare"


def reset_texts(name: str, link: str, minutes: int) -> tuple[str, str]:
    subject = f"Pulihkan kata sandi — {facility_name()}"
    body = (
        f"Halo {name},\n\n"
        f"Ada permintaan untuk mengganti kata sandi akun SmartDaycare Anda. Buka tautan berikut dalam {minutes} menit:\n\n"
        f"{link}\n\n"
        "Jika Anda tidak meminta ini, abaikan pesan ini; kata sandi Anda tidak berubah.\n\n"
        f"{facility_name()}"
    )
    return subject, body


def verify_texts(name: str, link: str) -> tuple[str, str]:
    subject = f"Verifikasi email — {facility_name()}"
    body = (
        f"Halo {name},\n\n"
        "Terima kasih sudah mendaftar di SmartDaycare. Buka tautan berikut untuk memastikan alamat email ini milik Anda:\n\n"
        f"{link}\n\n"
        "Tautan berlaku 2 hari. Setelah terverifikasi, pemberitahuan penting tentang anak Anda dikirim ke alamat ini.\n\n"
        f"{facility_name()}"
    )
    return subject, body


def alert_texts(child_name: str, title: str, text: str, clock: str, link: str) -> tuple[str, str]:
    subject = f"{title} — {child_name}"
    body = f"{facility_name()} · {clock}\n\n{child_name}: {title}." + (f"\n{text}" if text else "") + f"\n\nRincian di dasbor orang tua: {link}"
    return subject, body
