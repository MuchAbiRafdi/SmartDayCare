"""Uji alur utama API: masuk, CSRF, cakupan peran, catatan harian, piring & gizi, admin."""
from __future__ import annotations

import base64
import os
import tempfile
from collections.abc import Iterator
from pathlib import Path

import pytest

_tmp = tempfile.mkdtemp(prefix="sd-test-")
os.environ["SD_DATA_DIR"] = _tmp
os.environ["SD_DATABASE_URL"] = f"sqlite:///{Path(_tmp) / 'test.db'}"
os.environ["SD_COOKIE_SECURE"] = "0"
os.environ["SD_LOGIN_PER_MINUTE"] = "1000"

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402

# JPEG 1×1 piksel yang valid (untuk uji unggah foto)
TINY_JPEG = base64.b64decode(
    "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA="
)
DATA_URL = "data:image/jpeg;base64," + base64.b64encode(TINY_JPEG + b"\x00" * 120).decode()


@pytest.fixture(scope="module")
def client() -> Iterator[TestClient]:
    with TestClient(app, base_url="http://testserver") as c:
        yield c


def login(c: TestClient, email: str, password: str) -> dict:
    c.cookies.clear()
    r = c.post("/api/auth/login", json={"email": email, "password": password, "remember": False}, headers={"origin": "http://testserver"})
    assert r.status_code == 200, r.text
    return r.json()["user"]


def hdr(c: TestClient) -> dict[str, str]:
    return {"X-CSRF-Token": c.cookies.get("sd_csrf") or "", "origin": "http://testserver"}


def test_public_summary(client: TestClient) -> None:
    r = client.get("/api/public")
    assert r.status_code == 200
    j = r.json()
    assert j["childCount"] == 6 and "air" in j and j["facility"]["name"] == "Ceria Ananda Daycare"


def test_login_wrong_password_and_lockout_message(client: TestClient) -> None:
    r = client.post("/api/auth/login", json={"email": "andi.lestari@gmail.com", "password": "salah", "remember": False}, headers={"origin": "http://testserver"})
    assert r.status_code == 401
    assert r.json()["detail"] == "Email atau kata sandi tidak cocok."
    r = client.post("/api/auth/login", json={"email": "tidak.ada@x.id", "password": "salah", "remember": False}, headers={"origin": "http://testserver"})
    assert r.status_code == 401


def test_state_requires_session(client: TestClient) -> None:
    client.cookies.clear()
    assert client.get("/api/state").status_code == 401


def test_parent_scope(client: TestClient) -> None:
    u = login(client, "andi.lestari@gmail.com", "Kirana2026")
    assert u["role"] == "parent" and u["children"] == ["CHK-001"]
    s = client.get("/api/state").json()
    assert [c["id"] for c in s["children"]] == ["CHK-001"]
    assert "users" not in s and "inviteCodes" not in s
    assert s["thresholds"]["co2Max"] == 1000
    # pembatasan data terjadi di server: kamera khusus staf, catatan anak lain,
    # serah terima, dan jejak audit tidak pernah dikirim ke orang tua
    assert all(c["parents"] for c in s["cameras"]) and len(s["cameras"]) == 3
    assert all(i["childId"] == "CHK-001" for i in s["seeded"]["incidents"])
    assert all(m["childId"] == "CHK-001" for m in s["seeded"]["medLogs"])
    assert s["seeded"]["handovers"] == [] and s["seeded"]["access"] == []
    assert all(e.get("childId") in (None, "CHK-001") for e in s["log"])
    # orang tua tidak boleh menulis catatan
    r = client.post("/api/log/note", json={"childId": "CHK-001", "note": "coba tulis"}, headers=hdr(client))
    assert r.status_code == 403


def test_header_session_without_cookies(client: TestClient) -> None:
    """Jalur sesi lewat header X-Session: dipakai klien bila cookie tidak sampai ke server
    (proxy yang membuang Cookie, atau bingkai lintas situs). Tidak boleh bergantung pada cookie,
    Origin, atau token CSRF — tetapi tetap butuh sesi yang sah."""
    r = client.post("/api/auth/login", json={"email": "ratna.dewi@ceriaananda.id", "password": "Ratna2026", "remember": False}, headers={"origin": "http://testserver"})
    token = r.json()["token"]
    assert token and len(token) >= 32
    client.cookies.clear()  # simulasikan proxy yang membuang semua cookie
    assert client.get("/api/state").status_code == 401
    r = client.get("/api/auth/me", headers={"X-Session": token})
    assert r.status_code == 200 and r.json()["session"]["via"] == "header"
    r = client.get("/api/state", headers={"X-Session": token})
    assert r.status_code == 200 and r.json()["me"]["role"] == "caregiver"
    # menulis data: tanpa cookie, tanpa CSRF, tanpa Origin — cukup header sesi
    r = client.post("/api/log/note", json={"childId": "CHK-001", "note": "Catatan lewat header"}, headers={"X-Session": token})
    assert r.status_code == 200, r.text
    # token palsu ditolak; sesi yang sudah ditutup ditolak
    assert client.get("/api/state", headers={"X-Session": "x" * 43}).status_code == 401
    assert client.post("/api/auth/logout", headers={"X-Session": token}).status_code == 200
    assert client.get("/api/state", headers={"X-Session": token}).status_code == 401


def test_login_allowed_without_origin_when_marked_by_client(client: TestClient) -> None:
    """Proxy tertentu membuang/mengubah Origin & Referer; header X-Requested-With dari klien kita
    sendiri cukup sebagai bukti asal (situs lain tidak bisa menambahkannya tanpa izin CORS)."""
    client.cookies.clear()
    body = {"email": "andi.lestari@gmail.com", "password": "Kirana2026", "remember": False}
    r = client.post("/api/auth/login", json=body, headers={"origin": "https://situs-lain.example", "sec-fetch-site": "cross-site"})
    assert r.status_code == 403
    r = client.post("/api/auth/login", json=body, headers={"X-Requested-With": "SmartDaycare"})
    assert r.status_code == 200


def test_csrf_required(client: TestClient) -> None:
    login(client, "ratna.dewi@ceriaananda.id", "Ratna2026")
    r = client.post("/api/log/note", json={"childId": "CHK-001", "note": "tanpa token"}, headers={"origin": "http://testserver"})
    assert r.status_code == 403
    r = client.post("/api/log/note", json={"childId": "CHK-001", "note": "asal lain"}, headers={"X-CSRF-Token": client.cookies.get("sd_csrf"), "origin": "https://jahat.example"})
    assert r.status_code == 403


def test_caregiver_daily_log_flow(client: TestClient) -> None:
    login(client, "ratna.dewi@ceriaananda.id", "Ratna2026")
    h = hdr(client)
    r = client.post("/api/log/checkin", json={"childId": "CHK-002", "temp": 37.5, "who": "Ayah", "cond": "batuk"}, headers=h)
    assert r.status_code == 200
    e = r.json()["entry"]
    assert e["title"] == "Tiba, suhu 37,5°C" and e["sev"] == "medium" and "Ada batuk ringan" in e["text"]

    r = client.post("/api/log/temp", json={"childId": "CHK-002", "temp": 38.0}, headers=h)
    assert r.json()["entry"]["sev"] == "high"

    r = client.post("/api/log/med", json={"childId": "CHK-002", "med": "Parasetamol", "dose": "5 ml", "note": ""}, headers=h)
    assert r.json()["entry"]["title"] == "Obat diberikan: Parasetamol 5 ml"

    r = client.post("/api/log/incident", json={"childId": "CHK-002", "kind": "Terjatuh ringan", "sev": "medium", "room": "Ruang Bermain Utama", "note": "Tidak ada luka."}, headers=h)
    inc = r.json()["entry"]
    r = client.post(f"/api/incidents/{inc['id']}/resolve", headers=h)
    assert r.status_code == 200
    s = client.get("/api/state").json()
    assert inc["id"] in s["resolved"] and s["resolved"][inc["id"]]["by"] == "Ratna Dewi"

    r = client.post("/api/log/handover", json={"to": "Sari Puspita", "note": "Termometer cadangan di laci."}, headers=h)
    assert r.json()["entry"]["type"] == "handover"

    r = client.post("/api/log/checkout", json={"childId": "CHK-002", "who": "Ibu", "note": ""}, headers=h)
    assert r.json()["entry"]["title"] == "Dijemput oleh Ibu"

    # validasi ketat
    r = client.post("/api/log/temp", json={"childId": "CHK-002", "temp": 50}, headers=h)
    assert r.status_code == 422
    r = client.post("/api/log/note", json={"childId": "CHK-002", "note": "x", "extra": 1}, headers=h)
    assert r.status_code == 422


def test_plate_then_meal(client: TestClient) -> None:
    login(client, "ratna.dewi@ceriaananda.id", "Ratna2026")
    h = hdr(client)
    r = client.post(
        "/api/log/plate",
        json={
            "childId": "CHK-001",
            "meal": "lunch",
            "items": [{"name": "Nasi putih", "grams": 100}, {"name": "Ayam goreng", "grams": 50}, {"name": "Tumis sawi", "grams": 30}],
            "photo": DATA_URL,
            "boxes": [{"x": 0.1, "y": 0.1, "w": 0.3, "h": 0.3, "label": "Nasi putih"}],
            "conf": 0.88,
            "plateCm": 22,
        },
        headers=h,
    )
    assert r.status_code == 200, r.text
    plate = r.json()["entry"]
    assert plate["type"] == "plate" and plate["done"] is None and plate["servedKcal"] > 200
    assert plate["photoPreUrl"].startswith("/api/photos/")
    assert client.get(plate["photoPreUrl"]).headers["content-type"] == "image/jpeg"

    r = client.post(
        "/api/log/meal",
        json={
            "plateId": plate["id"],
            "items": [{"name": "Nasi putih", "pre": 100, "post": 20}, {"name": "Ayam goreng", "pre": 50, "post": 0}, {"name": "Tumis sawi", "pre": 30, "post": 15}],
            "photo": DATA_URL,
            "boxes": [],
            "conf": 0.8,
        },
        headers=h,
    )
    assert r.status_code == 200, r.text
    meal = r.json()["entry"]
    assert meal["type"] == "meal" and meal["pct"] == 81 and meal["kcal"] > 200
    assert meal["photoPreUrl"] and meal["photoPostUrl"]
    # piring tertutup; tidak bisa ditutup dua kali
    assert client.post("/api/log/meal", json={"plateId": plate["id"], "items": [{"name": "Nasi putih", "pre": 100, "post": 20}], "photo": DATA_URL, "boxes": [], "conf": 0.8}, headers=h).status_code == 409

    # orang tua Kirana melihat catatan makan + foto; orang tua lain tidak
    login(client, "andi.lestari@gmail.com", "Kirana2026")
    s = client.get("/api/state").json()
    assert any(e["id"] == meal["id"] for e in s["log"])
    assert client.get(meal["photoPostUrl"]).status_code == 200
    login(client, "budi.wijaya@gmail.com", "Bima2026")
    s = client.get("/api/state").json()
    assert not any(e["id"] == meal["id"] for e in s["log"])
    assert client.get(meal["photoPostUrl"]).status_code == 403


def test_analytics_watch_and_reco_feedback(client: TestClient) -> None:
    """Skor pantauan ikut terkirim, dan penilaian admin atas saran mengubah urutan — bukan isinya."""
    login(client, "hendra@ceriaananda.id", "Hendra2026")
    h = hdr(client)
    cid = client.get("/api/state").json()["children"][0]["id"]
    r = client.get(f"/api/analytics/{cid}?days=7", headers=h)
    assert r.status_code == 200, r.text
    a = r.json()
    w = a["watch"]
    assert 0 <= w["score"] <= 100 and w["level"] in ("tenang", "wajar", "perlu dipantau")
    assert all({"label", "points", "detail"} <= set(c) for c in w["components"])
    assert sum(c["points"] for c in w["components"]) >= w["score"]  # skor = jumlah komponen, tidak ada bonus gaib
    for rec in a["recommendations"]:
        assert rec["impact"] in (1, 2, 3) and "effortLabel" in rec
    assert [x["score"] for x in a["recommendations"]] == sorted((x["score"] for x in a["recommendations"]), reverse=True)

    key = a["recommendations"][0]["id"]
    before = client.get("/api/analytics/reco-feedback", headers=h).json()["weights"]
    r = client.post("/api/analytics/reco-feedback", json={"key": key, "vote": "up"}, headers=h)
    assert r.status_code == 200 and r.json()["multiplier"] > 1
    after = client.get("/api/analytics/reco-feedback", headers=h).json()["weights"]
    assert after[key] > before.get(key, 1.0)
    # dua 👍 lagi masih menghasilkan pengali di bawah batas 1,3
    client.post("/api/analytics/reco-feedback", json={"key": key, "vote": "up"}, headers=h)
    assert client.get("/api/analytics/reco-feedback", headers=h).json()["weights"][key] <= 1.3
    assert client.post("/api/analytics/reco-feedback", json={"key": "tidak-ada", "vote": "up"}, headers=h).status_code == 422
    assert client.post("/api/analytics/reco-feedback", json={"key": key, "vote": "mungkin"}, headers=h).status_code == 422
    # orang tua tidak boleh menilai saran internal daycare
    login(client, "andi.lestari@gmail.com", "Kirana2026")
    assert client.post("/api/analytics/reco-feedback", json={"key": key, "vote": "up"}, headers=hdr(client)).status_code == 403


def test_admin_operations(client: TestClient) -> None:
    login(client, "hendra@ceriaananda.id", "Hendra2026")
    h = hdr(client)
    s = client.get("/api/state").json()
    assert len(s["users"]) >= 9 and "password" not in str(s["users"]).lower().replace("mustchangepassword", "")
    r = client.put("/api/admin/settings", json={"tempMax": 28, "humMax": 70, "co2Max": 950, "pm25Max": 35, "bodyTempWatch": 37.3, "bodyTempHigh": 37.8, "retentionDays": 7, "plateDiameterCm": 24}, headers=h)
    assert r.status_code == 200 and r.json()["thresholds"]["co2Max"] == 950
    r = client.put("/api/admin/settings", json={"tempMax": 28, "humMax": 70, "co2Max": 950, "pm25Max": 35, "bodyTempWatch": 37.9, "bodyTempHigh": 37.8, "retentionDays": 7, "plateDiameterCm": 24}, headers=h)
    assert r.status_code == 422
    r = client.post("/api/admin/foods", json={"name": "Bubur kacang hijau", "kcal": 102, "protein": 3.5, "carbs": 18, "fat": 1.6}, headers=h)
    assert r.status_code == 200
    fid = next(f["id"] for f in r.json()["foods"] if f["name"] == "Bubur kacang hijau")
    assert client.delete(f"/api/admin/foods/{fid}", headers=h).status_code == 200
    seed_id = next(f["id"] for f in s["foods"] if f["seed"])
    assert client.delete(f"/api/admin/foods/{seed_id}", headers=h).status_code == 403

    r = client.post("/api/admin/users/U-P02/reset-password", headers=h)
    assert r.status_code == 200 and r.json()["temporaryPassword"].startswith("Ceria")
    tmp = r.json()["temporaryPassword"]
    r = client.patch("/api/admin/users/U-P03", json={"disabled": True}, headers=h)
    assert r.json()["user"]["disabled"] is True
    r = client.get("/api/admin/access.csv")
    assert r.status_code == 200 and r.text.startswith("\ufeffTanggal;Pukul")
    r = client.post("/api/admin/devices/check", headers=h)
    assert r.json()["ok"] == 8

    # akun yang dinonaktifkan tidak bisa masuk; kata sandi sementara berlaku
    client.cookies.clear()
    r = client.post("/api/auth/login", json={"email": "dedi.putri@gmail.com", "password": "Salsa2026", "remember": False}, headers={"origin": "http://testserver"})
    assert r.status_code == 403
    u = login(client, "budi.wijaya@gmail.com", tmp)
    assert u["mustChangePassword"] is True
    r = client.post("/api/account/password", json={"current": tmp, "new": "BimaBaru2026"}, headers=hdr(client))
    assert r.status_code == 200
    login(client, "hendra@ceriaananda.id", "Hendra2026")
    client.patch("/api/admin/users/U-P03", json={"disabled": False}, headers=hdr(client))


def test_register_and_link_child(client: TestClient) -> None:
    client.cookies.clear()
    o = {"origin": "http://testserver"}
    r = client.post("/api/auth/register", json={"name": "Wali Baru", "email": "wali.baru@gmail.com", "phone": "", "password": "lemah", "role": "parent", "code": "", "consent": True}, headers=o)
    assert r.status_code == 422
    r = client.post("/api/auth/register", json={"name": "Wali Baru", "email": "wali.baru@gmail.com", "phone": "", "password": "WaliBaru2026", "role": "parent", "code": "KA-9999", "consent": True}, headers=o)
    assert r.status_code == 422
    r = client.post("/api/auth/register", json={"name": "Wali Baru", "email": "wali.baru@gmail.com", "phone": "", "password": "WaliBaru2026", "role": "caregiver", "code": "SALAH", "consent": True}, headers=o)
    assert r.status_code == 422
    r = client.post("/api/auth/register", json={"name": "Wali Baru", "email": "wali.baru@gmail.com", "phone": "", "password": "WaliBaru2026", "role": "parent", "code": "", "consent": True}, headers=o)
    assert r.status_code == 200, r.text
    assert client.cookies.get("sd_session")
    s = client.get("/api/state").json()
    assert s["children"] == []
    r = client.post("/api/children/link", json={"code": "ka-2203"}, headers=hdr(client))
    assert r.status_code == 200 and r.json()["child"] == "Salsa"
    s = client.get("/api/state").json()
    assert [c["id"] for c in s["children"]] == ["CHK-003"]
    r = client.put("/api/prefs/child", json={"value": "CHK-003"}, headers=hdr(client))
    assert r.status_code == 200 and client.get("/api/state").json()["prefs"]["child"] == "CHK-003"
    r = client.post("/api/auth/logout", headers=hdr(client))
    assert r.status_code == 200
    assert client.get("/api/state").status_code == 401


def test_invite_codes_lifecycle(client: TestClient) -> None:
    """Admin membuat kode berjangka sekali pakai; kode habis/nonaktif/salah peran ditolak; jejak pemakaian tercatat."""
    login(client, "hendra@ceriaananda.id", "Hendra2026")
    h = hdr(client)
    r = client.post("/api/admin/invites", json={"role": "caregiver", "label": "Pengasuh baru", "days": 7, "maxUses": 1}, headers=h)
    assert r.status_code == 200, r.text
    inv = r.json()["invite"]
    assert inv["code"].startswith("STAF-") and inv["maxUses"] == 1 and inv["uses"] == 0 and inv["expiresAt"]
    code = inv["code"]
    # kode awal fasilitas masih ada dan tanpa batas
    seeds = [c for c in r.json()["inviteCodes"] if c["label"] == "Kode awal fasilitas"]
    assert len(seeds) == 2 and all(c["expiresAt"] is None and c["maxUses"] is None for c in seeds)

    o = {"origin": "http://testserver"}
    client.cookies.clear()
    # peran tidak sesuai kode
    r = client.post("/api/auth/register", json={"name": "Staf Coba", "email": "staf.coba@ceriaananda.id", "phone": "", "password": "StafCoba2026", "role": "admin", "code": code, "consent": True}, headers=o)
    assert r.status_code == 422 and "peran" in r.json()["detail"]
    r = client.post("/api/auth/register", json={"name": "Staf Coba", "email": "staf.coba@ceriaananda.id", "phone": "", "password": "StafCoba2026", "role": "caregiver", "code": code.lower(), "consent": True}, headers=o)
    assert r.status_code == 200, r.text
    assert r.json()["user"]["role"] == "caregiver"
    client.cookies.clear()
    # sekali pakai: percobaan kedua ditolak
    r = client.post("/api/auth/register", json={"name": "Staf Lain", "email": "staf.lain@ceriaananda.id", "phone": "", "password": "StafLain2026", "role": "caregiver", "code": code, "consent": True}, headers=o)
    assert r.status_code == 422 and "habis" in r.json()["detail"]

    login(client, "hendra@ceriaananda.id", "Hendra2026")
    h = hdr(client)
    codes = {c["code"]: c for c in client.get("/api/state").json()["inviteCodes"]}
    assert codes[code]["uses"] == 1 and codes[code]["usedBy"][0]["name"] == "Staf Coba"
    # kode kedua dinonaktifkan sebelum dipakai
    r = client.post("/api/admin/invites", json={"role": "admin", "label": "", "days": 30, "maxUses": None}, headers=h)
    code2 = r.json()["invite"]["code"]
    assert code2.startswith("ADMIN-") and r.json()["invite"]["maxUses"] is None
    r = client.patch(f"/api/admin/invites/{code2}", json={"active": False}, headers=h)
    assert r.status_code == 200 and r.json()["invite"]["active"] is False
    client.cookies.clear()
    r = client.post("/api/auth/register", json={"name": "Admin Coba", "email": "admin.coba@ceriaananda.id", "phone": "", "password": "AdminCoba2026", "role": "admin", "code": code2, "consent": True}, headers=o)
    assert r.status_code == 422 and "dinonaktifkan" in r.json()["detail"]
    # kode kedaluwarsa
    login(client, "hendra@ceriaananda.id", "Hendra2026")
    h = hdr(client)
    from app.db import SessionLocal
    from app.models import InviteCode

    r = client.post("/api/admin/invites", json={"role": "caregiver", "label": "", "days": 1, "maxUses": 3}, headers=h)
    code3 = r.json()["invite"]["code"]
    with SessionLocal() as db:
        row = db.get(InviteCode, code3)
        row.expires_at = "2020-01-01T00:00:00.000Z"
        db.commit()
    client.cookies.clear()
    r = client.post("/api/auth/register", json={"name": "Staf Telat", "email": "staf.telat@ceriaananda.id", "phone": "", "password": "StafTelat2026", "role": "caregiver", "code": code3, "consent": True}, headers=o)
    assert r.status_code == 422 and "kedaluwarsa" in r.json()["detail"]
    # pengasuh dan orang tua tidak boleh menyentuh endpoint admin
    login(client, "ratna.dewi@ceriaananda.id", "Ratna2026")
    assert client.post("/api/admin/invites", json={"role": "admin", "label": "", "days": 7, "maxUses": 1}, headers=hdr(client)).status_code == 403


def test_children_codes_and_links(client: TestClient) -> None:
    """Admin mendaftarkan anak (kode otomatis), mengganti kode, melepas tautan; batas wali dan percobaan kode dijaga."""
    login(client, "hendra@ceriaananda.id", "Hendra2026")
    h = hdr(client)
    body = {
        "name": "Zahra Putri Ramadhani",
        "short": "",
        "dob": "2023-05-20",
        "room": "Ruang Bermain Utama",
        "caregiver": "Ratna Dewi",
        "allergies": "",
        "meds": "",
        "parentName": "Ibu Ramadhani",
        "emergencyName": "Ibu Ramadhani (Ibu)",
        "emergencyPhone": "+62 811-0000-1111",
    }
    r = client.post("/api/admin/children", json={**body, "room": "Dapur (khusus staf)"}, headers=h)
    assert r.status_code == 422
    r = client.post("/api/admin/children", json={**body, "dob": "2999-01-01"}, headers=h)
    assert r.status_code == 422
    r = client.post("/api/admin/children", json={**body, "caregiver": "Tidak Ada"}, headers=h)
    assert r.status_code == 422
    r = client.post("/api/admin/children", json=body, headers=h)
    assert r.status_code == 200, r.text
    c = r.json()["child"]
    code = r.json()["code"]
    assert c["id"] == "CHK-007" and c["short"] == "Zahra" and c["allergies"] == "Tidak ada" and c["target"]["kcal"] == 1100
    assert code.startswith("KA-") and len(code) == 7 and c["code"] == code and c["timeline"] == [] and "lunch" not in c["nutrition"]
    assert client.post("/api/admin/children", json=body, headers=h).status_code == 409
    # semua peran melihat anak baru tanpa galat (pengasuh & publik)
    assert client.get("/api/public").json()["childCount"] == 7
    # ubah data
    r = client.patch("/api/admin/children/CHK-007", json={**body, "allergies": "Telur", "room": "Ruang Makan"}, headers=h)
    assert r.status_code == 200 and r.json()["child"]["allergies"] == "Telur" and r.json()["child"]["room"] == "Ruang Makan"
    assert r.json()["child"]["code"] == code

    # orang tua menautkan dengan kode baru, lalu kode diganti admin: kode lama hangus, tautan tetap
    o = {"origin": "http://testserver"}
    client.cookies.clear()
    r = client.post("/api/auth/register", json={"name": "Wali Zahra", "email": "wali.zahra@gmail.com", "phone": "", "password": "WaliZahra2026", "role": "parent", "code": code, "consent": True}, headers=o)
    assert r.status_code == 200 and r.json()["linkedChild"] == "Zahra"
    parent_id = r.json()["user"]["id"]
    # percobaan kode salah dibatasi (8 per 15 menit per akun)
    for i in range(8):
        r = client.post("/api/children/link", json={"code": f"KA-00{i:02d}"}, headers=hdr(client))
        assert r.status_code in (422, 409)
    r = client.post("/api/children/link", json={"code": "KA-2201"}, headers=hdr(client))
    assert r.status_code == 429

    login(client, "hendra@ceriaananda.id", "Hendra2026")
    h = hdr(client)
    links = client.get("/api/state").json()["links"]
    mine = next(l for l in links if l["userId"] == parent_id)
    assert mine["childId"] == "CHK-007" and mine["via"] == "register" and mine["linkedAt"]
    r = client.post("/api/admin/children/CHK-007/new-code", headers=h)
    assert r.status_code == 200
    new_code = r.json()["code"]
    assert new_code != code and r.json()["child"]["code"] == new_code
    client.cookies.clear()
    r = client.post("/api/auth/register", json={"name": "Wali Lama", "email": "wali.lama@gmail.com", "phone": "", "password": "WaliLama2026", "role": "parent", "code": code, "consent": True}, headers=o)
    assert r.status_code == 422  # kode lama tidak berlaku
    login(client, "wali.zahra@gmail.com", "WaliZahra2026")
    assert [x["id"] for x in client.get("/api/state").json()["children"]] == ["CHK-007"]

    # lepas tautan oleh admin: orang tua kehilangan akses
    login(client, "hendra@ceriaananda.id", "Hendra2026")
    h = hdr(client)
    r = client.delete(f"/api/admin/links/{parent_id}/CHK-007", headers=h)
    assert r.status_code == 200
    assert client.delete(f"/api/admin/links/{parent_id}/CHK-007", headers=h).status_code == 404
    login(client, "wali.zahra@gmail.com", "WaliZahra2026")
    assert client.get("/api/state").json()["children"] == []


def test_ticket_public(client: TestClient) -> None:
    client.cookies.clear()
    r = client.post("/api/tickets", json={"name": "Yayasan Kasih", "email": "info@kasih.or.id", "org": "Yayasan Kasih", "topic": "Harga", "msg": "Kami ingin uji coba untuk 20 anak."}, headers={"origin": "http://testserver"})
    assert r.status_code == 200 and r.json()["id"].startswith("T")


def test_origin_policy_behind_proxy(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    """Sec-Fetch-Site menentukan keputusan; Host yang diubah proxy tidak boleh menggagalkan login."""
    body = {"email": "andi.lestari@gmail.com", "password": "Kirana2026", "remember": False}
    client.cookies.clear()
    # peramban modern di balik reverse proxy: Origin publik ≠ Host internal, tetapi same-origin
    r = client.post("/api/auth/login", json=body, headers={"origin": "https://app.contoh.id", "host": "127.0.0.1:8000", "sec-fetch-site": "same-origin"})
    assert r.status_code == 200
    # permintaan lintas situs ditolak walau Origin dipalsukan menyerupai host
    r = client.post("/api/auth/login", json=body, headers={"origin": "http://testserver", "sec-fetch-site": "cross-site"})
    assert r.status_code == 403
    # tanpa Sec-Fetch-Site (peramban lama): Origin dibandingkan dengan X-Forwarded-Host
    r = client.post("/api/auth/login", json=body, headers={"origin": "https://app.contoh.id", "host": "127.0.0.1:8000", "x-forwarded-host": "app.contoh.id, 10.0.0.2"})
    assert r.status_code == 200
    r = client.post("/api/auth/login", json=body, headers={"origin": "https://jahat.contoh", "host": "127.0.0.1:8000", "x-forwarded-host": "app.contoh.id"})
    assert r.status_code == 403


def test_partitioned_cookie_when_samesite_none(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    from app import config

    monkeypatch.setattr(config, "COOKIE_SAMESITE", "none")
    client.cookies.clear()
    r = client.post(
        "/api/auth/login",
        json={"email": "andi.lestari@gmail.com", "password": "Kirana2026", "remember": True},
        headers={"origin": "http://testserver", "sec-fetch-site": "same-origin"},
    )
    assert r.status_code == 200
    cookies = [v for k, v in r.headers.multi_items() if k.lower() == "set-cookie"]
    assert len(cookies) == 2
    for c in cookies:
        assert "samesite=none" in c.lower() and "secure" in c.lower() and "partitioned" in c.lower()
    assert any(c.startswith("sd_session=") and "httponly" in c.lower() for c in cookies)
    # keluar menghapus dengan atribut yang sama (agar peramban benar-benar membuangnya).
    # Cookie Secure tidak dikirim klien uji lewat http, jadi dilampirkan manual.
    raw = {c.split("=", 1)[0]: c.split("=", 1)[1].split(";", 1)[0] for c in cookies}
    r = client.post(
        "/api/auth/logout",
        headers={
            "Cookie": f"sd_session={raw['sd_session']}; sd_csrf={raw['sd_csrf']}",
            "X-CSRF-Token": raw["sd_csrf"],
            "origin": "http://testserver",
            "sec-fetch-site": "same-origin",
        },
    )
    assert r.status_code == 200, r.text
    gone = [v.lower() for k, v in r.headers.multi_items() if k.lower() == "set-cookie"]
    assert len(gone) == 2 and all("partitioned" in c and "max-age=0" in c for c in gone)


# --- Pemulihan kata sandi, verifikasi email, kotak keluar ----------------------------------------


def _capture_outbox(monkeypatch: pytest.MonkeyPatch) -> list[dict]:
    """Tangkap pesan yang masuk kotak keluar (tanpa provider, status pesan = 'off')."""
    from app import notify

    sent: list[dict] = []
    real = notify.enqueue

    def fake(db, channel, to, subject, body, *, ref="", user_id=None):  # type: ignore[no-untyped-def]
        sent.append({"channel": channel, "to": to, "subject": subject, "body": body, "ref": ref})
        return real(db, channel, to, subject, body, ref=ref, user_id=user_id)

    monkeypatch.setattr(notify, "enqueue", fake)
    # modul lain mengimpor `notify` sebagai modul, jadi patch di modul cukup
    return sent


def _token_from(body: str, path: str) -> str:
    import re

    m = re.search(rf"{path}\?token=([A-Za-z0-9_\-]+)", body)
    assert m, body
    return m.group(1)


def test_forgot_reset_flow(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    sent = _capture_outbox(monkeypatch)
    client.cookies.clear()
    h = {"origin": "http://testserver", "X-Requested-With": "SmartDaycare"}
    # email tidak terdaftar: jawaban sama (tidak membocorkan keberadaan akun), tidak ada pesan
    r = client.post("/api/auth/forgot", json={"email": "tidak.ada@contoh.id"}, headers=h)
    assert r.status_code == 200 and "Jika" in r.json()["message"]
    assert sent == []
    r = client.post("/api/auth/forgot", json={"email": "budi.wijaya@gmail.com"}, headers=h)
    assert r.status_code == 200
    assert len(sent) == 1 and sent[0]["channel"] == "email" and sent[0]["ref"] == "reset"
    token = _token_from(sent[0]["body"], "/reset")
    # kata sandi lemah ditolak sebelum token dipakai
    r = client.post("/api/auth/reset", json={"token": token, "password": "lemah"}, headers=h)
    assert r.status_code == 422
    r = client.post("/api/auth/reset", json={"token": token, "password": "BaruKuat2026"}, headers=h)
    assert r.status_code == 200 and r.json()["email"] == "budi.wijaya@gmail.com"
    # token sekali pakai
    r = client.post("/api/auth/reset", json={"token": token, "password": "BaruKuat2027"}, headers=h)
    assert r.status_code == 410
    r = client.post("/api/auth/reset", json={"token": "bukan-token", "password": "BaruKuat2027"}, headers=h)
    assert r.status_code == 410
    # kata sandi lama tidak berlaku, yang baru berlaku
    r = client.post("/api/auth/login", json={"email": "budi.wijaya@gmail.com", "password": "Bima2026", "remember": False}, headers=h)
    assert r.status_code == 401
    u = login(client, "budi.wijaya@gmail.com", "BaruKuat2026")
    assert u["email"] == "budi.wijaya@gmail.com"
    # kembalikan kata sandi awal agar uji lain tidak terpengaruh
    r = client.post("/api/account/password", json={"current": "BaruKuat2026", "new": "Bima2026"}, headers=hdr(client))
    assert r.status_code == 200, r.text
    # kotak keluar terlihat oleh admin, status 'off' karena pengirim belum diatur
    login(client, "hendra@ceriaananda.id", "Hendra2026")
    r = client.get("/api/admin/messages")
    assert r.status_code == 200
    j = r.json()
    assert j["channels"]["email"] is None
    reset_msgs = [m for m in j["messages"] if m["ref"] == "reset"]
    assert reset_msgs and reset_msgs[0]["status"] == "off" and reset_msgs[0]["to"] == "budi.wijaya@gmail.com"


def test_register_sends_verification_and_verify(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    sent = _capture_outbox(monkeypatch)
    client.cookies.clear()
    h = {"origin": "http://testserver", "X-Requested-With": "SmartDaycare"}
    r = client.post(
        "/api/auth/register",
        json={"name": "Wati Verifikasi", "email": "wati.verifikasi@gmail.com", "password": "WatiKuat2026", "role": "parent", "code": "KA-2203", "phone": "081200001111", "consent": True},
        headers=h,
    )
    assert r.status_code == 200, r.text
    assert r.json()["user"]["emailVerified"] is False
    verify = [m for m in sent if m["ref"] == "verify"]
    assert len(verify) == 1 and verify[0]["to"] == "wati.verifikasi@gmail.com"
    token = _token_from(verify[0]["body"], "/verify")
    # kirim ulang dibatasi satu per menit
    r = client.post("/api/auth/verify/resend", headers=hdr(client))
    assert r.status_code == 429
    r = client.post("/api/auth/verify", json={"token": token}, headers=h)
    assert r.status_code == 200
    me = client.get("/api/auth/me").json()["user"]
    assert me["emailVerified"] is True
    r = client.post("/api/auth/verify", json={"token": token}, headers=h)
    assert r.status_code == 410
    r = client.post("/api/auth/verify/resend", headers=hdr(client))
    assert r.status_code == 200 and "sudah terverifikasi" in r.json()["message"]


def test_incident_notifies_parent_by_prefs(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    sent = _capture_outbox(monkeypatch)
    # orang tua Kirana (CHK-001) mematikan WhatsApp, menyalakan email
    login(client, "andi.lestari@gmail.com", "Kirana2026")
    r = client.put("/api/prefs/notify", json={"value": {"wa": False, "email": True, "push": False, "high": True, "medium": True, "low": False, "daily": True}}, headers=hdr(client))
    assert r.status_code == 200, r.text
    login(client, "ratna.dewi@ceriaananda.id", "Ratna2026")
    r = client.post("/api/log/incident", json={"childId": "CHK-001", "kind": "Jatuh ringan", "sev": "medium", "room": "Ruang Bermain Utama", "note": "Terpeleset di ruang bermain, sudah dikompres."}, headers=hdr(client))
    assert r.status_code == 200, r.text
    mine = [m for m in sent if m["to"] == "andi.lestari@gmail.com"]
    assert mine and mine[0]["channel"] == "email" and "Jatuh ringan" in mine[0]["body"]
    assert not [m for m in sent if m["channel"] == "wa" and m["ref"].startswith("alert:")]
    # kejadian ringan tidak dikirim (preferensi low = false)
    n = len(sent)
    r = client.post("/api/log/incident", json={"childId": "CHK-001", "kind": "Goresan kecil", "sev": "low", "room": "Ruang Bermain Utama", "note": "Goresan kecil di jari, sudah diberi plester."}, headers=hdr(client))
    assert r.status_code == 200
    assert len(sent) == n


# --- Perangkat: sensor & kamera -------------------------------------------------------------------


def test_device_ingest_and_snapshot(client: TestClient) -> None:
    login(client, "hendra@ceriaananda.id", "Hendra2026")
    r = client.post("/api/admin/devices", json={"kind": "sensor", "name": "Sensor Uji Ruang Bermain", "room": "Ruang Bermain Utama", "parents": False}, headers=hdr(client))
    assert r.status_code == 200, r.text
    j = r.json()
    token = j["token"]
    dev_id = j["device"]["id"]
    assert token.startswith("sd_") and j["device"]["ok"] is False
    # token tidak pernah dikembalikan lagi setelah dibuat
    r = client.get("/api/admin/devices")
    assert all("token" not in d for d in r.json()["devices"])
    # kiriman tanpa token ditolak
    client.cookies.clear()
    r = client.post("/api/devices/ingest", json={"temp": 27.5, "hum": 60, "co2": 812, "pm25": 9})
    assert r.status_code == 401
    r = client.post("/api/devices/ingest", json={"temp": 27.5, "hum": 60, "co2": 812, "pm25": 9}, headers={"X-Device-Token": token})
    assert r.status_code == 200, r.text
    assert r.json()["room"] == "Ruang Bermain Utama"
    # nilai di luar jangkauan wajar ditolak
    r = client.post("/api/devices/ingest", json={"co2": 99999}, headers={"X-Device-Token": token})
    assert r.status_code == 422
    # pembacaan ruangan kini bersumber dari sensor
    r = client.get("/api/public")
    room = next(x for x in r.json()["air"]["readings"] if x["room"] == "Ruang Bermain Utama")
    assert room["source"] == "sensor" and room["co2"] == 812
    # kamera dengan foto berkala
    login(client, "hendra@ceriaananda.id", "Hendra2026")
    r = client.post("/api/admin/devices", json={"kind": "camera", "name": "Kamera Uji Teras", "room": "Teras", "parents": True}, headers=hdr(client))
    assert r.status_code == 200, r.text
    cam_token = r.json()["token"]
    cam_id = r.json()["device"]["id"]
    client.cookies.clear()
    r = client.post("/api/devices/snapshot", content=b"bukan-jpeg", headers={"X-Device-Token": cam_token, "Content-Type": "image/jpeg"})
    assert r.status_code == 422
    r = client.post("/api/devices/snapshot", content=TINY_JPEG, headers={"X-Device-Token": cam_token, "Content-Type": "image/jpeg"})
    assert r.status_code == 200, r.text
    # orang tua melihat kamera (parents=True) terkunci sampai aksesnya disetujui admin
    login(client, "andi.lestari@gmail.com", "Kirana2026")
    s = client.get("/api/state").json()
    cam = next(c for c in s["cameras"] if c["id"] == cam_id)
    assert cam["online"] is True and cam["view"] == "locked" and cam["access"]["status"] == "none"
    r = client.get(f"/api/devices/{cam_id}/snapshot.jpg")
    assert r.status_code == 403
    r = client.post("/api/cctv/requests", json={"camId": cam_id, "childId": "CHK-001", "reason": "Ingin melihat Kirana di teras."}, headers=hdr(client))
    assert r.status_code == 200, r.text
    req_id = r.json()["request"]["id"]
    login(client, "hendra@ceriaananda.id", "Hendra2026")
    r = client.post(f"/api/cctv/requests/{req_id}/decide", json={"action": "approve", "days": 7}, headers=hdr(client))
    assert r.status_code == 200, r.text
    login(client, "andi.lestari@gmail.com", "Kirana2026")
    s = client.get("/api/state").json()
    cam = next(c for c in s["cameras"] if c["id"] == cam_id)
    assert cam["view"] == "snapshot" and cam["img"].endswith("/snapshot.jpg") and cam["access"]["status"] == "approved"
    r = client.get(f"/api/devices/{cam_id}/snapshot.jpg")
    assert r.status_code == 200 and r.headers["content-type"] == "image/jpeg"
    # admin menonaktifkan kamera → hilang dari daftar, token tidak berlaku
    login(client, "hendra@ceriaananda.id", "Hendra2026")
    r = client.patch(f"/api/admin/devices/{cam_id}", json={"enabled": False}, headers=hdr(client))
    assert r.status_code == 200
    client.cookies.clear()
    r = client.post("/api/devices/snapshot", content=TINY_JPEG, headers={"X-Device-Token": cam_token, "Content-Type": "image/jpeg"})
    assert r.status_code == 401
    login(client, "hendra@ceriaananda.id", "Hendra2026")
    for d in (dev_id, cam_id):
        assert client.delete(f"/api/admin/devices/{d}", headers=hdr(client)).status_code == 200
    # sensor dihapus → ruangan kembali ke nilai contoh (tidak terus menampilkan angka sensor yang sudah tidak ada)
    room = next(x for x in client.get("/api/public").json()["air"]["readings"] if x["room"] == "Ruang Bermain Utama")
    assert room["source"] == "builtin" and "deviceId" not in room
    assert all(x["room"] != "Teras" for x in client.get("/api/public").json()["air"]["readings"])


def test_air_monitor_marks_stale_instead_of_faking(monkeypatch: pytest.MonkeyPatch) -> None:
    """Sensor yang berhenti mengirim ditandai `stale` dengan nilai terakhirnya, bukan diganti nilai contoh."""
    from datetime import UTC, datetime, timedelta

    from app import events

    mon = events.AirMonitor()
    room = mon.rooms[0]
    mon.ingest(room, "D-UJI", {"temp": 27.0, "hum": 61, "co2": 905, "pm25": 11})
    assert mon.readings[room]["source"] == "sensor"
    changed, went_stale = mon.step()
    assert not went_stale and mon.readings[room]["source"] == "sensor"
    # mundurkan waktu kiriman terakhir melewati batas segar
    old = datetime.now(UTC) - timedelta(minutes=events.SENSOR_FRESH_MINUTES + 1)
    mon.readings[room]["at"] = old.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
    changed, went_stale = mon.step()
    assert changed and went_stale
    assert mon.readings[room]["source"] == "stale" and mon.readings[room]["co2"] == 905
    # langkah berikutnya tidak menghidupkan lagi angka contoh untuk ruangan itu
    mon.step()
    assert mon.readings[room]["source"] == "stale" and mon.readings[room]["co2"] == 905
    # perangkat dilepas → ruangan kembali ke nilai contoh
    assert mon.release(room, "D-UJI") is True
    assert mon.readings[room]["source"] == "builtin"
    assert mon.release(room, "D-UJI") is False


# --- Arsip anak -----------------------------------------------------------------------------------


def test_archive_restore_delete_child(client: TestClient) -> None:
    login(client, "hendra@ceriaananda.id", "Hendra2026")
    r = client.post(
        "/api/admin/children",
        json={"name": "Anak Arsip Uji", "short": "Arsip", "dob": "2023-03-03", "room": "Ruang Bermain Utama", "caregiver": "Ratna Dewi", "allergies": "", "meds": "", "parentName": "Ibu Uji", "emergencyName": "Ibu Uji", "emergencyPhone": "+62 812-0000-2222"},
        headers=hdr(client),
    )
    assert r.status_code == 200, r.text
    child = r.json()["child"]
    cid, code = child["id"], child["code"]
    r = client.post(f"/api/admin/children/{cid}/archive", json={"note": "Pindah kota"}, headers=hdr(client))
    assert r.status_code == 200 and r.json()["child"]["archivedNote"] == "Pindah kota"
    s = client.get("/api/state").json()
    assert cid not in [c["id"] for c in s["children"]]
    assert cid in [c["id"] for c in s["archivedChildren"]]
    # kode anak yang diarsipkan tidak bisa dipakai untuk menautkan akun
    login(client, "andi.lestari@gmail.com", "Kirana2026")
    r = client.post("/api/children/link", json={"code": code}, headers=hdr(client))
    assert r.status_code in (404, 422), r.text
    # pengasuh tidak bisa mencatat untuk anak yang diarsipkan
    login(client, "ratna.dewi@ceriaananda.id", "Ratna2026")
    r = client.post("/api/log/checkin", json={"childId": cid, "temp": 36.6, "who": "Ibu", "cond": "baik"}, headers=hdr(client))
    assert r.status_code == 409
    login(client, "hendra@ceriaananda.id", "Hendra2026")
    # hapus permanen hanya setelah arsip; pulihkan dulu → hapus ditolak
    r = client.post(f"/api/admin/children/{cid}/restore", headers=hdr(client))
    assert r.status_code == 200 and "archivedAt" not in r.json()["child"]
    assert client.delete(f"/api/admin/children/{cid}", headers=hdr(client)).status_code == 409
    assert client.post(f"/api/admin/children/{cid}/archive", json={"note": ""}, headers=hdr(client)).status_code == 200
    assert client.delete(f"/api/admin/children/{cid}", headers=hdr(client)).status_code == 200
    s = client.get("/api/state").json()
    assert cid not in [c["id"] for c in s["archivedChildren"]]


def test_analytics_previous_period_survives_housekeeping(client: TestClient) -> None:
    """Rentang Bulanan butuh 60 hari catatan: pembersihan berkala tidak boleh memangkas periode pembanding."""
    from app import config
    from app.main import housekeeping

    assert config.LOG_KEEP_DAYS >= 366
    housekeeping()
    login(client, "hendra@ceriaananda.id", "Hendra2026")
    r = client.get("/api/analytics/CHK-001?days=30")
    assert r.status_code == 200, r.text
    a = r.json()
    assert a["previous"]["schoolDays"] > 0
    assert a["previous"]["activities"] > 0, "periode pembanding kosong"
    # lapisan insight: kebiasaan anak, pembanding anonim, dan tingkat keyakinan per insight
    assert a["baseline"]["days"] > 0 and a["baseline"]["mood"]["n"] >= 8
    assert a["peers"]["n"] >= 3
    assert a["insights"] and all(i["confidence"] in {"tinggi", "sedang", "rendah"} for i in a["insights"])
    assert "kebiasaan" in a["method"]
    # hari sekolah setelah jam datang: baris hari ini ikut jadwal dasar anak walau belum ada catatan datang
    from datetime import datetime

    from app.analytics import TZ

    now = datetime.now(TZ)
    if now.weekday() < 5 and now.strftime("%H:%M") >= "08:00":
        assert a["days"][-1]["present"] is True and a["days"][-1]["checkin"]
