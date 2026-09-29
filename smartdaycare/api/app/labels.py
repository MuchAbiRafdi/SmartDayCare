"""Label dan skor untuk catatan rutin harian. Satu sumber untuk pencatatan, analitik, dan ringkasan."""
from __future__ import annotations

ACTIVITY_LABEL = {
    "bermain": "Bermain Bebas",
    "belajar": "Kegiatan Belajar",
    "seni": "Seni & Kreativitas",
    "motorik_kasar": "Motorik Kasar",
    "motorik_halus": "Motorik Halus",
    "sosial": "Kegiatan Sosial",
    "membaca": "Membaca",
    "lainnya": "Lainnya",
}

# Kontribusi tiap jenis aktivitas ke area perkembangan (untuk profil perkembangan).
ACTIVITY_AREA = {
    "bermain": ("sosial", "motorik"),
    "belajar": ("kognitif",),
    "seni": ("kognitif", "motorik"),
    "motorik_kasar": ("motorik",),
    "motorik_halus": ("motorik",),
    "sosial": ("sosial",),
    "membaca": ("kognitif",),
    "lainnya": (),
}

FOOD_SLOT_LABEL = {"breakfast": "Sarapan", "snack_am": "Snack Pagi", "lunch": "Makan Siang", "snack_pm": "Snack Sore"}
FOOD_SLOT_ORDER = ("breakfast", "snack_am", "lunch", "snack_pm")
PORTION_LABEL = {"habis": "Habis", "setengah": "Setengah", "sedikit": "Sedikit", "tidak": "Tidak Makan"}
PORTION_SCORE = {"habis": 100, "setengah": 50, "sedikit": 25, "tidak": 0}

SLEEP_KIND_LABEL = {"siang": "Tidur Siang", "tambahan": "Tidur Tambahan"}
SLEEP_QUALITY_LABEL = {"sangat_baik": "Sangat Baik", "baik": "Baik", "cukup": "Cukup", "kurang": "Kurang"}
SLEEP_QUALITY_SCORE = {"sangat_baik": 4, "baik": 3, "cukup": 2, "kurang": 1}

MOOD_LABEL = {"sangat_senang": "Sangat Senang", "senang": "Senang", "netral": "Netral", "sedih": "Sedih", "marah": "Marah", "lelah": "Lelah"}
MOOD_EMOJI = {"sangat_senang": "😄", "senang": "😊", "netral": "😐", "sedih": "😢", "marah": "😠", "lelah": "😴"}
# Skor 1–5 untuk tren mood (lelah dianggap setara netral-rendah).
MOOD_SCORE = {"sangat_senang": 5, "senang": 4, "netral": 3, "lelah": 2.5, "sedih": 2, "marah": 1}

AREA_LABEL = {"sosial": "Sosial", "motorik": "Motorik", "kognitif": "Kognitif", "emosi": "Emosi"}


def mood_from_score(v: float | None) -> tuple[str, str]:
    """Label + emoji untuk rata-rata skor mood."""
    if v is None:
        return "Belum ada data", "–"
    if v >= 4.5:
        return "Sangat Senang", "😄"
    if v >= 3.5:
        return "Senang", "😊"
    if v >= 2.75:
        return "Netral", "😐"
    if v >= 2:
        return "Kurang ceria", "😢"
    return "Perlu perhatian", "😠"


def clock_minutes(hhmm: str) -> int:
    h, m = hhmm.split(":")
    return int(h) * 60 + int(m)


def duration_minutes(start: str, end: str) -> int:
    d = clock_minutes(end) - clock_minutes(start)
    if d < 0:
        d += 24 * 60
    return d


def fmt_duration(minutes: int) -> str:
    h, m = divmod(max(0, int(minutes)), 60)
    if h and m:
        return f"{h} j {m} mnt"
    if h:
        return f"{h} jam"
    return f"{m} mnt"
