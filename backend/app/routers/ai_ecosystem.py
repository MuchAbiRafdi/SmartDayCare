"""Router API FastAPI untuk 5 Modul Inovasi AI Ekosistem Daycare.
Sesuai Proposal Usulan Penajaman:
1. OmniWatch (Multi-CCTV Vision & Fall Detection - Tim Reino)
2. Child Development Intelligence (KPSP Kemenkes RI - Tim Abi)
3. SmartDayCare IoT & Wellbeing (Monitoring Vital & Kualitas Udara - Tim Zaki)
4. Platform Komunikasi & Pelaporan Insiden LLM (Tim Hafiz)
5. TrustMeter (ABSA Sentimen & Parent Trust Index - Tim Rifqi)
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import Auth, require_auth, require_roles
from ..models import Child, Feedback
from ..ai.omniwatch_cv import omniwatch_engine
from ..ai.child_development_kpsp import child_development_engine, KPSP_REGISTRY
from ..ai.iot_wellbeing import smart_wellbeing_engine
from ..ai.smart_comm_incident_llm import smart_comm_engine
from ..ai.trustmeter_absa import trustmeter_engine

router = APIRouter(prefix="/api/ai", tags=["ai_ecosystem"])


# --- Schemas ---

class FrameEvaluationIn(BaseModel):
    camera_id: str = "cctv_ruang_bermain_1"
    detections: List[Dict[str, Any]] = Field(default_factory=list)


class KpspScreeningIn(BaseModel):
    child_id: str
    child_name: str
    age_months: int = 24
    answers: Dict[str, bool] = Field(default_factory=dict)


class ChildVitalsIn(BaseModel):
    child_id: str
    temperature: float = 36.6
    nap_minutes: float = 90.0
    meal_ratio: float = 0.90
    restless_motion: float = 0.15


class RoomComfortIn(BaseModel):
    room_name: str = "Ruang Kelas Toddler"
    temperature: float = 24.5
    humidity: float = 55.0
    co2_ppm: float = 650.0
    tvoc_ppb: float = 50.0


class DailyNarrativeIn(BaseModel):
    child_name: str
    date_str: str = ""
    caregiver_notes: List[str] = Field(default_factory=list)
    activities: List[str] = Field(default_factory=list)
    meal_summary: str = "Makan siang habis 1 porsi nasi tim ayam sayur dan buah pepaya"
    sleep_minutes: int = 90
    room_comfort_status: str = "sangat sejuk, nyaman, dan higienis"
    omniwatch_events: List[str] = Field(default_factory=list)
    incident_list: List[Dict[str, Any]] = Field(default_factory=list)


class IncidentClassifyIn(BaseModel):
    incident_type: str = "fall"
    chronology: str
    has_bleeding: bool = False
    temperature: Optional[float] = None


class FeedbackAbsaIn(BaseModel):
    text: str
    rating: int = 5


# --- Endpoints ---

@router.get("/ecosystem/overview")
def get_ecosystem_overview() -> Dict[str, Any]:
    """Ringkasan status integrasi 5 modul inovasi AI dalam satu ekosistem terpadu."""
    return {
        "status": "ready",
        "compliance": "UU No. 27/2022 tentang Pelindungan Data Pribadi (Privacy by Design)",
        "tkt_level": "TKT 3-4 (Lab prototype) menuju TKT 5-6 (Validasi di Daycare Mitra)",
        "modules": [
            {
                "id": "omniwatch",
                "name": "OmniWatch Multi-CCTV",
                "team": "Reino",
                "features": ["Person detection & tracking", "Pose estimation fall detection", "Virtual geofencing", "Privacy face blurring", "Auto incident clip"],
                "active": True,
            },
            {
                "id": "child_dev_intelligence",
                "name": "Child Development Intelligence",
                "team": "Abi",
                "features": ["Instrumen KPSP Kemenkes RI", "4 Pilar Milestone Tumbuh Kembang", "Trajectory ML mapping", "Rekomendasi stimulasi personal"],
                "active": True,
            },
            {
                "id": "smart_wellbeing_iot",
                "name": "SmartDayCare IoT & Wellbeing",
                "team": "Zaki",
                "features": ["Sensor udara & CO2 ruangan", "Termometer IR nirsentuh", "Baseline sirkadian anak", "Deteksi demam & gangguan tidur"],
                "active": True,
            },
            {
                "id": "smart_comm_incident",
                "name": "Platform Komunikasi & Insiden LLM",
                "team": "Hafiz",
                "features": ["Laporan harian otomatis narasi LLM", "Pelaporan insiden terstruktur", "Klasifikasi keparahan & eskalasi instan"],
                "active": True,
            },
            {
                "id": "trustmeter_absa",
                "name": "TrustMeter Parent Trust Index",
                "team": "Rifqi",
                "features": ["Aspect-Based Sentiment Analysis Bahasa Indonesia", "5 Aspek Layanan Daycare", "Parent Trust Index (PTI)", "Early warning penurunan kepuasan"],
                "active": True,
            },
        ],
    }


# 1. Modul OmniWatch
@router.post("/omniwatch/evaluate-frame")
def evaluate_omniwatch_frame(payload: FrameEvaluationIn) -> Dict[str, Any]:
    anomalies = omniwatch_engine.evaluate_frame_detections(
        camera_id=payload.camera_id,
        detections=payload.detections,
    )
    return {
        "camera_id": payload.camera_id,
        "anomalies_detected": anomalies,
        "is_safe": len(anomalies) == 0,
        "privacy_protected": True,
    }


@router.get("/omniwatch/zones")
def get_omniwatch_zones() -> Dict[str, Any]:
    return {
        "zones": [
            {
                "id": z.zone_id,
                "name": z.name,
                "type": z.zone_type,
                "severity": z.severity,
                "description": z.description,
                "polygon": [{"x": p.x, "y": p.y} for p in z.polygon],
            }
            for z in omniwatch_engine.zones.values()
        ]
    }


# 2. Modul Child Development Intelligence (KPSP Kemenkes RI)
@router.get("/development/kpsp-questions")
def get_kpsp_questions(age_months: int = Query(24, ge=1, le=72)) -> Dict[str, Any]:
    benchmark_age = child_development_engine.find_nearest_kpsp_age(age_months)
    questions = KPSP_REGISTRY.get(benchmark_age, [])
    return {
        "age_months": age_months,
        "benchmark_age": benchmark_age,
        "standard": "KPSP Kementerian Kesehatan Republik Indonesia",
        "questions": questions,
    }


@router.post("/development/kpsp-evaluate")
def evaluate_kpsp_screening(payload: KpspScreeningIn) -> Dict[str, Any]:
    return child_development_engine.evaluate_kpsp_screening(
        child_id=payload.child_id,
        child_name=payload.child_name,
        age_months=payload.age_months,
        answers=payload.answers,
    )


# 3. Modul SmartDayCare IoT & Wellbeing
@router.post("/wellbeing/evaluate-vitals")
def evaluate_child_vitals(payload: ChildVitalsIn) -> Dict[str, Any]:
    return smart_wellbeing_engine.evaluate_child_daily_vitals(
        child_id=payload.child_id,
        current_temp=payload.temperature,
        nap_duration_minutes=payload.nap_minutes,
        meal_eaten_ratio=payload.meal_ratio,
        restless_motion_score=payload.restless_motion,
    )


@router.post("/wellbeing/evaluate-room")
def evaluate_room_comfort(payload: RoomComfortIn) -> Dict[str, Any]:
    return smart_wellbeing_engine.evaluate_room_environment(
        room_name=payload.room_name,
        temperature=payload.temperature,
        humidity=payload.humidity,
        co2_ppm=payload.co2_ppm,
        tvoc_ppb=payload.tvoc_ppb,
    )


# 4. Modul Komunikasi Cerdas & Pelaporan Insiden LLM
@router.post("/communication/generate-narrative")
def generate_daily_narrative(payload: DailyNarrativeIn) -> Dict[str, Any]:
    date_label = payload.date_str or "Hari Ini"
    return smart_comm_engine.generate_daily_narrative_llm(
        child_name=payload.child_name,
        date_str=date_label,
        caregiver_notes=payload.caregiver_notes,
        activities=payload.activities,
        meal_summary=payload.meal_summary,
        sleep_minutes=payload.sleep_minutes,
        room_comfort_status=payload.room_comfort_status,
        omniwatch_events=payload.omniwatch_events,
        incident_list=payload.incident_list,
    )


@router.post("/communication/classify-incident")
def classify_incident(payload: IncidentClassifyIn) -> Dict[str, Any]:
    severity, rationale, should_escalate = smart_comm_engine.classify_incident_severity(
        incident_type=payload.incident_type,
        chronology=payload.chronology,
        has_bleeding=payload.has_bleeding,
        temperature=payload.temperature,
    )
    return {
        "severity": severity,
        "rationale": rationale,
        "immediate_escalation_required": should_escalate,
        "escalation_channels": ["WhatsApp Darurat", "Push Notification Ortu & Pimpinan"] if should_escalate else ["Catatan Laporan Harian"],
    }


# 5. Modul TrustMeter (ABSA & Parent Trust Index)
@router.post("/trustmeter/analyze-feedback")
def analyze_feedback_absa(payload: FeedbackAbsaIn) -> Dict[str, Any]:
    return trustmeter_engine.analyze_feedback(payload.text, payload.rating)


@router.get("/trustmeter/pti-summary")
def get_parent_trust_index_summary(db: Session = Depends(get_db)) -> Dict[str, Any]:
    from sqlalchemy import select
    feedbacks = db.scalars(select(Feedback).order_by(Feedback.at.desc()).limit(60)).all()
    fb_list = [{"text": f.text, "rating": f.rating} for f in feedbacks]
    return trustmeter_engine.compute_aggregate_pti(fb_list)
