"""Catatan contoh untuk mode data contoh: aktivitas harian 9 minggu terakhir, percakapan, permintaan
kamera, dan umpan balik. Deterministik per anak+tanggal sehingga aman dijalankan berulang; hari ini
diisi bertahap mengikuti jam (catatan dengan waktu yang belum lewat belum dibuat)."""
from __future__ import annotations

import hashlib
import random
from datetime import UTC, date, datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from .labels import (
    ACTIVITY_LABEL,
    FOOD_SLOT_LABEL,
    MOOD_EMOJI,
    MOOD_LABEL,
    MOOD_SCORE,
    PORTION_LABEL,
    PORTION_SCORE,
    SLEEP_KIND_LABEL,
    SLEEP_QUALITY_LABEL,
    SLEEP_QUALITY_SCORE,
    fmt_duration,
)
from .logic import TZ
from .models import CameraRequest, ChatMessage, ChatThread, Child, Feedback, LogEntry, User

DAYS_BACK = 63
CAREGIVER = {"U-C01": ("Ratna Dewi", "Pagi"), "U-C02": ("Sari Puspita", "Siang")}

# Kecenderungan tiap anak: bobot jenis aktivitas, mood dasar, tidur, porsi makan, dan "cerita" minggu ini
# (perubahan yang sengaja dibuat supaya lapisan analisis punya sesuatu untuk dijelaskan).
PERSONA: dict[str, dict[str, Any]] = {
    "CHK-001": {  # Kirana: sosial meningkat minggu ini, motorik kasar jarang
        "kinds": {"bermain": 3, "belajar": 2, "seni": 4, "motorik_kasar": 0.4, "motorik_halus": 2, "sosial": 2, "membaca": 2},
        "week_kinds": {"sosial": 2.2},
        "mood": 4.1,
        "sleep": (75, 95),
        "meal": 0.8,
        "acts": (4, 6),
    },
    "CHK-002": {  # Bima: aktif motorik, mood turun tiap Senin
        "kinds": {"bermain": 3, "belajar": 1, "seni": 1, "motorik_kasar": 4, "motorik_halus": 1.5, "sosial": 2, "membaca": 0.7},
        "mood": 3.9,
        "monday_dip": 1.4,
        "sleep": (80, 100),
        "meal": 0.75,
        "acts": (4, 6),
    },
    "CHK-003": {  # Salsa: gemar membaca, tidur siang berkurang minggu ini (Rabu sangat singkat)
        "kinds": {"bermain": 2, "belajar": 3, "seni": 2, "motorik_kasar": 1.5, "motorik_halus": 2, "sosial": 2, "membaca": 4},
        "mood": 4.3,
        "sleep": (70, 90),
        "week_sleep": 0.7,
        "short_nap_weekday": 2,
        "meal": 0.85,
        "acts": (4, 6),
    },
    "CHK-004": {  # Rizky (2 th): dua kali tidur, makan siang sering sedikit, sore lelah
        "kinds": {"bermain": 4, "belajar": 0.6, "seni": 1.5, "motorik_kasar": 2.5, "motorik_halus": 2, "sosial": 1.5, "membaca": 0.8},
        "mood": 3.6,
        "tired_pm": True,
        "sleep": (90, 120),
        "second_nap": True,
        "meal": 0.55,
        "lunch_low": True,
        "acts": (3, 5),
    },
    "CHK-005": {  # Nadia: seimbang; minggu ini absen 2 hari (sempat hangat)
        "kinds": {"bermain": 2.5, "belajar": 2.5, "seni": 2, "motorik_kasar": 2, "motorik_halus": 2, "sosial": 2.5, "membaca": 2},
        "mood": 4.0,
        "sleep": (75, 95),
        "meal": 0.8,
        "acts": (4, 6),
        "absent_this_week": (1, 2),
        "fever_prev_day": True,
    },
    "CHK-006": {  # Dimas: aktivitas & mood menurun minggu ini
        "kinds": {"bermain": 3, "belajar": 1.5, "seni": 2, "motorik_kasar": 2.5, "motorik_halus": 1.5, "sosial": 2.5, "membaca": 1},
        "mood": 4.0,
        "week_mood": -0.7,
        "week_acts": -2,
        "sleep": (80, 100),
        "meal": 0.75,
        "acts": (4, 6),
    },
}

MENU = {
    "breakfast": [["Bubur ayam"], ["Roti", "Susu"], ["Nasi", "Telur dadar"]],
    "snack_am": [["Buah"], ["Biskuit", "Susu"], ["Puding buah"], ["Roti isi"]],
    "lunch": [["Nasi", "Sayur", "Ayam"], ["Nasi", "Sayur", "Ikan"], ["Nasi", "Sup", "Tempe"], ["Nasi", "Sayur", "Telur"], ["Mi", "Sayur", "Ayam"]],
    "snack_pm": [["Buah"], ["Bolu kukus"], ["Agar-agar"], ["Biskuit", "Susu"]],
}
ACT_NOTES = {
    "bermain": ["Bermain balok bersama teman.", "Bermain peran di pojok dapur mainan.", "Bermain pasir kinetik."],
    "belajar": ["Mengenal huruf dan angka.", "Menyusun puzzle bentuk.", "Belajar warna lewat kartu."],
    "seni": ["Mewarnai gambar hewan.", "Menempel kolase daun.", "Melukis dengan jari."],
    "motorik_kasar": ["Lari estafet di halaman.", "Melompat lingkaran.", "Lempar tangkap bola."],
    "motorik_halus": ["Meronce manik.", "Menggunting garis lurus.", "Menjepit pom-pom."],
    "sosial": ["Berbagi mainan dalam kelompok kecil.", "Bernyanyi bersama.", "Bermain peran bergiliran."],
    "membaca": ["Membaca buku cerita bergambar.", "Mendengarkan dongeng.", "Menyebutkan tokoh cerita."],
}
TEACHER_NOTES = [
    "{n} hari ini berani menjawab saat sesi tanya jawab.",
    "{n} membantu merapikan mainan tanpa diminta.",
    "{n} mulai menulis huruf awal namanya.",
    "{n} sempat rewel sebentar sebelum tidur siang, lalu tenang setelah dibacakan cerita.",
    "{n} bermain sangat akrab dengan teman baru.",
]
DOC_CAPTIONS = [
    ("Kegiatan seni pagi", "/img/doc-art.jpg"),
    ("Bermain di halaman", "/img/doc-outdoor.jpg"),
    ("Membaca bersama", "/img/doc-reading.jpg"),
    ("Bermain balok", "/img/room-play.jpg"),
    ("Waktu makan siang", "/img/room-dine.jpg"),
]


def _sid(*parts: Any) -> str:
    return "L-S" + hashlib.sha1("|".join(str(p) for p in parts).encode()).hexdigest()[:8].upper()


def _iso(d: date, hh: int, mm: int) -> str:
    dt = datetime(d.year, d.month, d.day, hh, mm, tzinfo=TZ).astimezone(UTC)
    return dt.strftime("%Y-%m-%dT%H:%M:%S.000Z")


def _clock(hh: int, mm: int) -> str:
    return f"{hh:02d}:{mm:02d}"


def _weighted(rng: random.Random, weights: dict[str, float]) -> str:
    keys = list(weights)
    return rng.choices(keys, weights=[weights[k] for k in keys], k=1)[0]


def _mood_from_level(rng: random.Random, level: float) -> str:
    v = level + rng.gauss(0, 0.55)
    if v >= 4.6:
        return "sangat_senang"
    if v >= 3.5:
        return "senang"
    if v >= 2.7:
        return "netral"
    if v >= 2.1:
        return rng.choice(["lelah", "sedih"])
    return rng.choice(["sedih", "marah"])


def _portion(rng: random.Random, p_good: float) -> str:
    r = rng.random()
    if r < p_good:
        return "habis"
    if r < p_good + (1 - p_good) * 0.55:
        return "setengah"
    if r < p_good + (1 - p_good) * 0.9:
        return "sedikit"
    return "tidak"


def plan_day(child: dict[str, Any], d: date, today: date) -> list[dict[str, Any]]:
    """Rencana catatan satu hari untuk satu anak (deterministik)."""
    if d.weekday() >= 5:
        return []
    p = PERSONA.get(child["id"], PERSONA["CHK-001"])
    rng = random.Random(f"{child['id']}|{d.isoformat()}")
    week_ago = today - timedelta(days=6)
    this_week = d >= week_ago
    prev_week = week_ago - timedelta(days=7) <= d < week_ago
    # absen
    absent = rng.random() < 0.05
    if this_week and "absent_this_week" in p and (today - d).days in p["absent_this_week"]:
        absent = True
    if absent:
        return []
    cg = "U-C01" if child["caregiver"] == "Ratna Dewi" else "U-C02"
    cg_name = child["caregiver"]
    pm_cg, pm_name = "U-C02", "Sari Puspita"
    items: list[dict[str, Any]] = []
    n = 0

    def add(hh: int, mm: int, etype: str, title: str, text: str, payload: dict[str, Any], *, sev: str = "low", silent: bool = True, meal: str | None = None, user: tuple[str, str] | None = None) -> None:
        nonlocal n
        n += 1
        uid, uname = user or ((pm_cg, pm_name) if hh >= 14 else (cg, cg_name))
        items.append(
            {
                "id": _sid(child["id"], d.isoformat(), n),
                "type": etype,
                "at": _iso(d, hh, mm),
                "sev": sev,
                "title": title,
                "text": text,
                "payload": payload,
                "silent": silent,
                "meal": meal,
                "user": (uid, uname),
            }
        )

    # kedatangan (hanya hari lampau: hari ini mengikuti jadwal dasar anak)
    h0, m0 = (int(x) for x in child["checkin"].split(":"))
    m0 = max(0, min(59, m0 + rng.randint(-8, 8)))
    temp = round(rng.uniform(36.3, 36.9), 1)
    if p.get("fever_prev_day") and prev_week and d.weekday() == 3:
        temp = 37.6
    if d < today:
        add(h0, m0, "checkin", f"Tiba, suhu {str(temp).replace('.', ',')} °C", f"Kondisi fisik baik. Diantar oleh {rng.choice(['Ibu', 'Ayah', 'Nenek'])}.", {"temp": temp, "who": "Ibu", "cond": "baik"}, sev="medium" if temp >= 37.5 else "low", silent=False)
    # sarapan bila datang pagi sekali
    if h0 == 7 and m0 < 45 and rng.random() < 0.6:
        por = _portion(rng, p["meal"])
        add(7, 55, "food", f"{FOOD_SLOT_LABEL['breakfast']}: {PORTION_LABEL[por]}", "Menu " + ", ".join(rng.choice(MENU["breakfast"])) + ".", {"slot": "breakfast", "slotLabel": FOOD_SLOT_LABEL["breakfast"], "menu": rng.choice(MENU["breakfast"]), "portion": por, "portionLabel": PORTION_LABEL[por], "score": PORTION_SCORE[por]}, meal="breakfast", silent=por != "tidak")
    # mood pagi
    level = p["mood"] + (p.get("week_mood", 0) if this_week else 0) - (p.get("monday_dip", 0) if d.weekday() == 0 else 0)
    mood = _mood_from_level(rng, level)
    add(8, 30 + rng.randint(0, 10), "mood", f"Mood: {MOOD_LABEL[mood]} {MOOD_EMOJI[mood]}", f"{child['short']} terlihat {MOOD_LABEL[mood].lower()} saat kegiatan pagi.", {"mood": mood, "moodLabel": MOOD_LABEL[mood], "emoji": MOOD_EMOJI[mood], "score": MOOD_SCORE[mood]}, sev="medium" if mood in ("sedih", "marah") else "low", silent=mood not in ("sedih", "marah"))
    # aktivitas
    lo, hi = p["acts"]
    count = rng.randint(lo, hi) + (p.get("week_acts", 0) if this_week else 0)
    count = max(2, count)
    weights = dict(p["kinds"])
    if this_week:
        for k, f in p.get("week_kinds", {}).items():
            weights[k] = weights.get(k, 1) * f
    slots = [(8, 45), (9, 20), (10, 15), (10, 50), (11, 20), (13, 50), (14, 30), (15, 25)]
    chosen = sorted(rng.sample(slots, min(count, len(slots))))
    for hh, mm in chosen:
        k = _weighted(rng, weights)
        minutes = rng.choice([20, 25, 30, 30, 40, 45])
        add(hh, mm + rng.randint(0, 5), "activity", f"Aktivitas: {ACTIVITY_LABEL[k]} · {fmt_duration(minutes)}", rng.choice(ACT_NOTES.get(k, ["Kegiatan bersama."])), {"kind": k, "kindLabel": ACTIVITY_LABEL[k], "minutes": minutes})
    # snack pagi, makan siang, snack sore
    for slot, hh, mm in (("snack_am", 9, 45), ("lunch", 11, 50), ("snack_pm", 15, 0)):
        good = p["meal"]
        if slot == "lunch" and p.get("lunch_low"):
            good = 0.3
        if slot == "snack_pm":
            good = good - 0.15
        por = _portion(rng, good)
        menu = rng.choice(MENU[slot])
        add(hh, mm + rng.randint(0, 8), "food", f"{FOOD_SLOT_LABEL[slot]}: {PORTION_LABEL[por]}", "Menu " + ", ".join(menu) + ".", {"slot": slot, "slotLabel": FOOD_SLOT_LABEL[slot], "menu": menu, "portion": por, "portionLabel": PORTION_LABEL[por], "score": PORTION_SCORE[por]}, meal=slot, sev="medium" if por == "tidak" else "low", silent=por != "tidak")
    # tidur siang
    smin, smax = p["sleep"]
    dur = rng.randint(smin, smax)
    if this_week and p.get("week_sleep"):
        dur = int(dur * p["week_sleep"])
        if d.weekday() == p.get("short_nap_weekday", -1):
            dur = 30
    sh, sm = 12, 40 + rng.randint(0, 25)
    if sm >= 60:
        sh, sm = 13, sm - 60
    eh, em = divmod(sh * 60 + sm + dur, 60)
    q = "sangat_baik" if dur >= 90 else "baik" if dur >= 70 else "cukup" if dur >= 45 else "kurang"
    add(eh, min(em + 3, 59), "sleep", f"{SLEEP_KIND_LABEL['siang']} {_clock(sh, sm).replace(':', '.')}–{_clock(eh, em).replace(':', '.')} ({fmt_duration(dur)})", f"Kualitas tidur {SLEEP_QUALITY_LABEL[q].lower()}.", {"kind": "siang", "kindLabel": SLEEP_KIND_LABEL["siang"], "start": _clock(sh, sm), "end": _clock(eh, em), "minutes": dur, "quality": q, "qualityLabel": SLEEP_QUALITY_LABEL[q], "qualityScore": SLEEP_QUALITY_SCORE[q]})
    if p.get("second_nap") and rng.random() < 0.5:
        add(10, 35, "sleep", f"{SLEEP_KIND_LABEL['tambahan']} 10.00–10.30 (30 mnt)", "Kualitas tidur baik.", {"kind": "tambahan", "kindLabel": SLEEP_KIND_LABEL["tambahan"], "start": "10:00", "end": "10:30", "minutes": 30, "quality": "baik", "qualityLabel": "Baik", "qualityScore": 3})
    # mood sore
    level_pm = level - (0.9 if p.get("tired_pm") else 0.2)
    mood2 = _mood_from_level(rng, level_pm)
    if p.get("tired_pm") and rng.random() < 0.5:
        mood2 = "lelah"
    add(14, 10 + rng.randint(0, 10), "mood", f"Mood: {MOOD_LABEL[mood2]} {MOOD_EMOJI[mood2]}", f"{child['short']} terlihat {MOOD_LABEL[mood2].lower()} setelah tidur siang.", {"mood": mood2, "moodLabel": MOOD_LABEL[mood2], "emoji": MOOD_EMOJI[mood2], "score": MOOD_SCORE[mood2]}, sev="medium" if mood2 in ("sedih", "marah") else "low", silent=mood2 not in ("sedih", "marah"))
    # dokumentasi & catatan guru
    if rng.random() < 0.65:
        cap, img = rng.choice(DOC_CAPTIONS)
        add(10, 5 + rng.randint(0, 40), "doc", cap, f"Foto kegiatan {child['short']}.", {"caption": cap, "img": img})
    if rng.random() < 0.3:
        add(15, 40, "note", "Catatan pengasuh", rng.choice(TEACHER_NOTES).format(n=child["short"]), {}, silent=False)
    # kepulangan (hari lampau)
    if d < today:
        h1, m1 = (int(x) for x in child["checkout"].split(":"))
        add(h1, max(0, min(59, m1 + rng.randint(-10, 10))), "checkout", f"Dijemput oleh {rng.choice(['Ibu', 'Ayah'])}", "Pulang dalam kondisi baik.", {"who": "Ibu"}, silent=False)
    return items


def ensure_routine_samples(db: Session) -> int:
    """Buat catatan contoh yang belum ada untuk 9 minggu terakhir (hari ini hanya sampai jam sekarang)."""
    now = datetime.now(TZ)
    today = now.date()
    now_iso_utc = now.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    children = [c for c in db.scalars(select(Child).where(Child.archived_at.is_(None))).all() if c.id in PERSONA]
    if not children:
        return 0
    start = today - timedelta(days=DAYS_BACK)
    existing = set(db.scalars(select(LogEntry.id).where(LogEntry.id.like("L-S%"))).all())
    added = 0
    for c in children:
        info = {"id": c.id, "short": c.short, "caregiver": c.data.get("caregiver", "Ratna Dewi"), "checkin": c.data.get("checkin", "07:45"), "checkout": c.data.get("checkout", "16:30")}
        d = start
        while d <= today:
            for it in plan_day(info, d, today):
                if it["id"] in existing or it["at"] > now_iso_utc:
                    continue
                uid, uname = it["user"]
                db.add(
                    LogEntry(
                        id=it["id"],
                        type=it["type"],
                        child_id=c.id,
                        child_name=c.name,
                        user_id=uid,
                        by_name=uname,
                        role="caregiver",
                        at=it["at"],
                        sev=it["sev"],
                        title=it["title"],
                        text=it["text"],
                        silent=it["silent"],
                        meal=it["meal"],
                        payload=it["payload"],
                    )
                )
                existing.add(it["id"])
                added += 1
            d += timedelta(days=1)
    if added:
        db.commit()
    return added


# ------------------------------------------------------------------ percakapan, kamera, umpan balik ----


def _ago(days: float, hh: int = 9, mm: int = 0) -> str:
    d = datetime.now(TZ) - timedelta(days=days)
    return d.replace(hour=hh, minute=mm, second=0, microsecond=0).astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%S.000Z")


def ensure_social_samples(db: Session) -> None:
    """Percakapan, permintaan kamera, dan umpan balik contoh (sekali saja, bila tabel masih kosong)."""
    users = {u.id: u for u in db.scalars(select(User)).all()}
    if "U-P01" not in users or "U-C01" not in users:
        return
    children = {c.id: c for c in db.scalars(select(Child)).all()}
    if db.scalar(select(ChatThread.id).limit(1)) is None:
        from .routers.chat import ensure_threads  # impor lokal: menghindari impor melingkar

        ensure_threads(db, users["U-A01"] if "U-A01" in users else users["U-C01"])
        for uid in ("U-P01", "U-P02", "U-P03", "U-P04", "U-P05", "U-P06"):
            if uid in users:
                ensure_threads(db, users[uid])
        db.flush()
        threads = {(t.kind, t.child_id, t.user_id): t for t in db.scalars(select(ChatThread)).all()}

        def say(t: ChatThread, uid: str, at: str, text: str) -> None:
            u = users[uid]
            db.add(ChatMessage(id="M-S" + hashlib.sha1(f"{t.id}|{at}|{uid}".encode()).hexdigest()[:8].upper(), thread_id=t.id, user_id=u.id, by_name=u.name, role=u.role, at=at, text=text))
            if at >= t.last_at:
                t.last_at, t.last_text, t.last_by = at, text[:200], u.name

        child_msgs = {
            "CHK-001": [("U-C01", 1, 10, 12, "Selamat pagi Bu Andi, Kirana hari ini semangat sekali ikut kegiatan melukis 🎨"), ("U-P01", 1, 10, 40, "Wah senang dengarnya, Bu. Terima kasih kabarnya!"), ("U-C01", 0, 8, 20, "Kirana sudah tiba dan langsung bergabung bermain balok dengan teman-teman.")],
            "CHK-002": [("U-C01", 2, 13, 5, "Bima tadi lari estafet di halaman dan sangat menikmati. Tidur siang 1 jam 20 menit."), ("U-P02", 2, 13, 30, "Terima kasih Bu Ratna 🙏")],
            "CHK-003": [("U-C02", 1, 15, 10, "Salsa hari ini membaca dua buku cerita dan menceritakan ulang tokohnya."), ("U-P03", 1, 16, 2, "Alhamdulillah, di rumah juga minta dibacakan terus, Bu.")],
            "CHK-004": [("U-C02", 1, 12, 30, "Bu Rina, makan siang Rizky hari ini hanya sedikit, tapi snack sore habis. Kami pantau ya.")],
            "CHK-005": [("U-P05", 2, 7, 15, "Pagi Bu, Nadia hari ini tidak masuk dulu ya, masih agak hangat."), ("U-C01", 2, 7, 30, "Baik Bu Rina, semoga Nadia lekas pulih. Kabari kami ya.")],
            "CHK-006": [("U-C02", 3, 14, 0, "Dimas beberapa hari ini agak lebih pendiam saat bermain. Apakah ada perubahan di rumah, Pak?"), ("U-P06", 3, 18, 20, "Adiknya baru lahir minggu lalu, Bu. Mungkin masih penyesuaian.")],
        }
        for cid, msgs in child_msgs.items():
            t = threads.get(("child", cid, None))
            if t is None or cid not in children:
                continue
            for uid, days, hh, mm, text in msgs:
                if uid in users:
                    say(t, uid, _ago(days, hh, mm), text)
        ann = threads.get(("announce", None, None))
        if ann is not None and "U-A01" in users:
            say(ann, "U-A01", _ago(4, 9, 0), "📢 Jumat ini ada kegiatan berkebun di halaman. Mohon anak dibawakan topi dan baju ganti.")
            say(ann, "U-A01", _ago(1, 16, 0), "Pengingat: pembayaran bulan depan dapat dilakukan sampai tanggal 5. Terima kasih 🙏")
        grp = threads.get(("group", None, None))
        if grp is not None:
            say(grp, "U-P02", _ago(2, 19, 5), "Selamat malam semua, ada yang punya rekomendasi botol minum anti tumpah?")
            say(grp, "U-P01", _ago(2, 19, 30), "Kirana pakai yang bertutup sedotan lipat, aman di tas 😊")
            say(grp, "U-C01", _ago(2, 20, 0), "Boleh juga dibawa botol yang ada nama anaknya ya Bu/Pak, supaya tidak tertukar.")
        adm = threads.get(("admin", None, "U-P01"))
        if adm is not None and "U-A01" in users:
            say(adm, "U-P01", _ago(5, 10, 0), "Pak Hendra, apakah bisa minta salinan tagihan bulan lalu?")
            say(adm, "U-A01", _ago(5, 10, 45), "Bisa Bu Andi, sudah kami kirim ke email. Terima kasih.")

    if db.scalar(select(CameraRequest.id).limit(1)) is None:
        now = datetime.now(UTC)
        db.add(CameraRequest(id="CR-S0001", user_id="U-P01", child_id="CHK-001", cam_id="K1", reason="Ingin melihat Kirana saat jam bermain pagi.", status="approved", created_at=_ago(3, 8, 0), decided_at=_ago(3, 9, 10), decided_by="Hendra Gunawan", expires_at=(now + timedelta(days=4)).strftime("%Y-%m-%dT%H:%M:%S.000Z"), note="Disetujui untuk 7 hari."))
        db.add(CameraRequest(id="CR-S0002", user_id="U-P02", child_id="CHK-002", cam_id="K2", reason="Bima baru pindah jadwal tidur, ingin memastikan ia nyaman.", status="pending", created_at=_ago(0.2, 7, 50)))
        db.add(CameraRequest(id="CR-S0003", user_id="U-P03", child_id="CHK-003", cam_id="K3", reason="Ingin melihat Salsa makan siang.", status="approved", created_at=_ago(12, 11, 0), decided_at=_ago(12, 11, 30), decided_by="Hendra Gunawan", expires_at=_ago(5, 11, 30), note="Disetujui untuk 7 hari."))
        db.add(CameraRequest(id="CR-S0004", user_id="U-P06", child_id="CHK-006", cam_id="K1", reason="Cek Dimas setelah beberapa hari pendiam.", status="pending", created_at=_ago(0.05, 9, 15)))

    if db.scalar(select(Feedback.id).limit(1)) is None:
        fb = [
            ("U-P01", "CHK-001", 1, 5, "Sangat puas dengan pelaporan harian, informatif dan cepat.", "Terima kasih Bu Andi, kami senang laporannya bermanfaat."),
            ("U-P02", "CHK-002", 2, 4, "Guru sangat responsif, tapi jadwal pengumuman kegiatan kadang mendadak.", "Masukan diterima, pengumuman kegiatan akan kami kirim minimal 3 hari sebelumnya."),
            ("U-P03", "CHK-003", 4, 5, "Salsa senang sekali dengan kegiatan membaca. Terima kasih Bu Sari!", "Sama-sama Bu Dedi, Salsa memang pembaca yang antusias."),
            ("U-P04", "CHK-004", 6, 3, "Porsi makan siang Rizky sering tidak habis, mohon dibantu dicek menunya.", "Kami sudah coba porsi kecil bertahap dan mencatat menu yang disukai Rizky."),
            ("U-P05", "CHK-005", 8, 4, "Pelayanan baik. Fitur kamera sangat membantu.", ""),
            ("U-P06", "CHK-006", 10, 4, "Komunikasi dengan pengasuh lancar.", "Terima kasih Pak Joko."),
            ("U-P01", "CHK-001", 13, 5, "Ringkasan sore hari sangat membantu kami menyiapkan makan malam.", "Senang mendengarnya!"),
            ("U-P03", "CHK-003", 16, 4, "Baik, hanya area parkir yang agak sempit saat jam jemput.", "Kami sedang mengatur jadwal jemput bergilir."),
            ("U-P02", "CHK-002", 20, 4, "Bima makin percaya diri. Terima kasih.", "Terima kasih Pak Budi."),
            ("U-P05", "CHK-005", 24, 3, "Notifikasi kadang terlambat sampai.", "Kami sudah memperbaiki pengiriman notifikasi, mohon kabari bila masih terjadi."),
            ("U-P04", "CHK-004", 27, 4, "Rizky lebih ceria sejak jadwal tidur diatur ulang.", "Alhamdulillah, kami lanjutkan jadwalnya."),
            ("U-P06", "CHK-006", 31, 5, "Guru sabar dan komunikatif.", "Terima kasih atas kepercayaannya."),
            ("U-P01", "CHK-001", 35, 4, "Laporan gizi sangat detail.", ""),
            ("U-P03", "CHK-003", 38, 5, "Salsa selalu bercerita hal baru sepulang daycare.", "Senang sekali mendengarnya, Bu."),
        ]
        from .routers.trust import sentiment_of  # impor lokal: menghindari impor melingkar

        for n, (uid, cid, days, rating, text, resp) in enumerate(fb, 1):
            u = users.get(uid)
            if u is None:
                continue
            at = _ago(days, 17, 10 + n)
            db.add(
                Feedback(
                    id=f"F-S{n:04d}",
                    user_id=uid,
                    by_name=u.name,
                    child_id=cid,
                    at=at,
                    rating=rating,
                    text=text,
                    sentiment=sentiment_of(rating, text),
                    response=resp,
                    responded_at=_ago(days - 0.5, 9, 0) if resp else None,
                    responded_by="Hendra Gunawan" if resp else "",
                )
            )
    db.commit()
