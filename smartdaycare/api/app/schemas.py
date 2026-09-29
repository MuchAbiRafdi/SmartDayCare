from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

Role = Literal["parent", "caregiver", "admin"]
Sev = Literal["low", "medium", "high"]
Meal = Literal["lunch", "snack_am", "snack_pm", "breakfast"]


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class LoginIn(Strict):
    email: EmailStr
    password: str = Field(min_length=1, max_length=200)
    remember: bool = False


class RegisterIn(Strict):
    name: str = Field(min_length=3, max_length=120)
    email: EmailStr
    phone: str = Field(default="", max_length=40)
    password: str = Field(min_length=8, max_length=200)
    role: Role
    code: str = Field(default="", max_length=40)
    consent: bool


class ProfileIn(Strict):
    name: str = Field(min_length=3, max_length=120)
    phone: str = Field(default="", max_length=40)


class PasswordIn(Strict):
    current: str = Field(min_length=1, max_length=200)
    new: str = Field(min_length=8, max_length=200)


class LinkChildIn(Strict):
    code: str = Field(min_length=4, max_length=24)


class PrefIn(Strict):
    value: object


class ForgotIn(Strict):
    email: EmailStr


class ResetIn(Strict):
    # token tidak dibatasi panjang minimalnya: tautan yang terpotong harus dijawab dengan pesan
    # "tautan tidak berlaku" yang jelas, bukan galat validasi
    token: str = Field(min_length=1, max_length=200)
    password: str = Field(min_length=8, max_length=200)


class VerifyIn(Strict):
    token: str = Field(min_length=1, max_length=200)


# --- Catatan harian -------------------------------------------------------------------------


class CheckinIn(Strict):
    childId: str
    temp: float = Field(ge=34, le=42)
    who: str = Field(min_length=1, max_length=60)
    cond: Literal["baik", "batuk", "pilek", "lesu", "lainnya"] = "baik"


class TempIn(Strict):
    childId: str
    temp: float = Field(ge=34, le=42)


class NoteIn(Strict):
    childId: str
    note: str = Field(min_length=3, max_length=600)


class CheckoutIn(Strict):
    childId: str
    who: str = Field(min_length=1, max_length=60)
    note: str = Field(default="", max_length=300)


class MedIn(Strict):
    childId: str
    med: str = Field(min_length=2, max_length=80)
    dose: str = Field(min_length=1, max_length=40)
    note: str = Field(default="", max_length=300)


class IncidentIn(Strict):
    childId: str
    kind: str = Field(min_length=3, max_length=80)
    sev: Sev
    room: str = Field(min_length=2, max_length=80)
    note: str = Field(min_length=3, max_length=600)


class HandoverIn(Strict):
    to: str = Field(min_length=2, max_length=80)
    note: str = Field(min_length=3, max_length=600)


class Box(Strict):
    x: float
    y: float
    w: float
    h: float
    label: str = Field(max_length=60)


class PlateItemIn(Strict):
    name: str = Field(min_length=1, max_length=80)
    grams: float = Field(ge=0, le=2000)


class PlateIn(Strict):
    """Pindaian sebelum makan: foto, daftar makanan yang dikenali, dan kotak penanda."""

    childId: str
    meal: Meal = "lunch"
    items: list[PlateItemIn] = Field(min_length=1, max_length=12)
    photo: str = Field(min_length=100, max_length=400_000)
    boxes: list[Box] = Field(default_factory=list, max_length=16)
    conf: float = Field(ge=0, le=1)
    plateCm: float = Field(default=22, ge=12, le=40)

    @field_validator("photo")
    @classmethod
    def _jpeg_data_url(cls, v: str) -> str:
        if not v.startswith("data:image/jpeg;base64,"):
            raise ValueError("Foto harus JPEG.")
        return v


class MealItemIn(Strict):
    name: str = Field(min_length=1, max_length=80)
    pre: float = Field(ge=0, le=2000)
    post: float = Field(ge=0, le=2000)


class MealIn(Strict):
    """Pindaian sesudah makan: menutup pindaian sebelum makan dan menghitung asupan."""

    plateId: str
    items: list[MealItemIn] = Field(min_length=1, max_length=12)
    photo: str = Field(min_length=100, max_length=400_000)
    boxes: list[Box] = Field(default_factory=list, max_length=16)
    conf: float = Field(ge=0, le=1)

    @field_validator("photo")
    @classmethod
    def _jpeg_data_url(cls, v: str) -> str:
        if not v.startswith("data:image/jpeg;base64,"):
            raise ValueError("Foto harus JPEG.")
        return v


class CameraViewIn(Strict):
    camId: str = Field(min_length=2, max_length=4)


# --- Admin ----------------------------------------------------------------------------------


class SettingsIn(Strict):
    tempMax: float = Field(ge=20, le=40)
    humMax: float = Field(ge=30, le=100)
    co2Max: float = Field(ge=400, le=5000)
    pm25Max: float = Field(ge=5, le=500)
    bodyTempWatch: float = Field(ge=36, le=40)
    bodyTempHigh: float = Field(ge=36, le=42)
    retentionDays: int = Field(ge=1, le=90)
    plateDiameterCm: float = Field(ge=12, le=40)


class FoodIn(Strict):
    name: str = Field(min_length=2, max_length=80)
    kcal: float = Field(ge=0, le=900)
    protein: float = Field(ge=0, le=100)
    carbs: float = Field(ge=0, le=100)
    fat: float = Field(ge=0, le=100)


class UserPatchIn(Strict):
    disabled: bool


class InviteCreateIn(Strict):
    role: Literal["caregiver", "admin"]
    label: str = Field(default="", max_length=80)
    days: int = Field(default=7, ge=1, le=365)
    # None = tanpa batas pemakaian
    maxUses: int | None = Field(default=1, ge=1, le=100)


class InvitePatchIn(Strict):
    active: bool


class ChildIn(Strict):
    name: str = Field(min_length=3, max_length=120)
    short: str = Field(default="", max_length=40)
    dob: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    room: str = Field(min_length=2, max_length=80)
    caregiver: str = Field(default="", max_length=120)
    allergies: str = Field(default="", max_length=120)
    meds: str = Field(default="", max_length=160)
    parentName: str = Field(default="", max_length=120)
    emergencyName: str = Field(default="", max_length=120)
    emergencyPhone: str = Field(default="", max_length=40)


class AdminCreateUserIn(Strict):
    name: str = Field(min_length=3, max_length=120)
    email: EmailStr
    phone: str = Field(default="", max_length=40)
    role: Role
    password: str = Field(min_length=8, max_length=200)
    childCode: str = Field(default="", max_length=24)


class TicketIn(Strict):
    name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    org: str = Field(default="", max_length=120)
    topic: str = Field(default="", max_length=60)
    msg: str = Field(min_length=5, max_length=2000)


class TicketPatchIn(Strict):
    status: Literal["open", "answered", "closed"]


class ArchiveIn(Strict):
    note: str = Field(default="", max_length=200)


class TestMessageIn(Strict):
    channel: str = Field(pattern="^(email|wa)$")


class FacilityIn(Strict):
    name: str = Field(min_length=3, max_length=80)
    city: str = Field(default="", max_length=60)
    address: str = Field(default="", max_length=200)
    phone: str = Field(default="", max_length=40)
    hours: str = Field(default="", max_length=80)
    email: str = Field(default="", max_length=120)


# --- Pencatatan harian (aktivitas, makan, tidur, mood, dokumentasi) ---------------------------

ActivityKind = Literal["bermain", "belajar", "seni", "motorik_kasar", "motorik_halus", "sosial", "membaca", "lainnya"]
FoodSlot = Literal["breakfast", "snack_am", "lunch", "snack_pm"]
Portion = Literal["habis", "setengah", "sedikit", "tidak"]
SleepKind = Literal["siang", "tambahan"]
SleepQuality = Literal["sangat_baik", "baik", "cukup", "kurang"]
MoodKind = Literal["sangat_senang", "senang", "netral", "sedih", "marah", "lelah"]


class ActivityIn(Strict):
    childId: str
    kind: ActivityKind
    note: str = Field(default="", max_length=600)
    minutes: int | None = Field(default=None, ge=5, le=240)


class FoodIn2(Strict):
    childId: str
    slot: FoodSlot
    menu: list[str] = Field(min_length=1, max_length=8)
    portion: Portion
    note: str = Field(default="", max_length=600)

    @field_validator("menu")
    @classmethod
    def _menu_items(cls, v: list[str]) -> list[str]:
        out = [m.strip() for m in v if m and m.strip()]
        if not out:
            raise ValueError("Pilih minimal satu menu.")
        if any(len(m) > 40 for m in out):
            raise ValueError("Nama menu terlalu panjang.")
        return out[:8]


class SleepIn(Strict):
    childId: str
    kind: SleepKind = "siang"
    start: str = Field(pattern=r"^\d{2}:\d{2}$")
    end: str = Field(pattern=r"^\d{2}:\d{2}$")
    quality: SleepQuality
    note: str = Field(default="", max_length=600)


class MoodIn(Strict):
    childId: str
    mood: MoodKind
    note: str = Field(default="", max_length=600)


class DocIn(Strict):
    childId: str
    caption: str = Field(default="", max_length=200)
    photo: str = Field(min_length=100, max_length=400_000)

    @field_validator("photo")
    @classmethod
    def _jpeg_data_url(cls, v: str) -> str:
        if not v.startswith("data:image/jpeg;base64,"):
            raise ValueError("Foto harus JPEG.")
        return v


# --- Percakapan, akses kamera, umpan balik ---------------------------------------------------


class ChatSendIn(Strict):
    text: str = Field(min_length=1, max_length=1500)


class CctvRequestIn(Strict):
    camId: str = Field(min_length=1, max_length=24)
    childId: str | None = None
    reason: str = Field(min_length=3, max_length=300)


class CctvDecideIn(Strict):
    action: Literal["approve", "deny", "revoke"]
    days: int = Field(default=7, ge=1, le=90)
    note: str = Field(default="", max_length=300)


class FeedbackIn(Strict):
    rating: int = Field(ge=1, le=5)
    text: str = Field(default="", max_length=800)
    childId: str | None = None


class FeedbackRespondIn(Strict):
    text: str = Field(min_length=2, max_length=800)


class DailySummaryIn(Strict):
    enabled: bool
    time: str = Field(default="16:00", pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
