"""SmartDayCare: Monitoring Kesejahteraan Harian Berbasis IoT dan AI di Daycare
Tim: Zaki - Usulan Modul 3

Teknologi Inti:
- Jaringan Sensor IoT Lingkungan Ruang (Suhu, Kelembaban, CO2/Kualitas Udara)
- Perangkat Pemantau Non-Invasif (Termometer Inframerah Tanpa Sentuh, Sensor Gerak Tidur Siang)
- Model AI Pembelajaran Pola Normal Tiap Anak (Circadian & Behavioral Baselines)
- Deteksi Anomali Kesejahteraan (Demam Dini, Kurang Tidur, Asupan Turun, Ruang Tidak Nyaman)
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple


@dataclass
class ChildPhysioBaseline:
    child_id: str
    normal_temp_mean: float = 36.6  # °C
    normal_temp_std: float = 0.25   # °C
    normal_nap_minutes_mean: float = 90.0  # menit tidur siang biasa
    normal_nap_minutes_std: float = 18.0
    normal_meal_finish_rate: float = 0.85  # rata-rata porsi habis (85%)


class SmartWellbeingEngine:
    """Mesin AI Pemantau Kesejahteraan Anak & Lingkungan Berbasis IoT.
    Mendeteksi anomali fisiologis dan kenyamanan ruangan secara real-time.
    """

    def __init__(self):
        # Database in-memory baseline anak
        self.baselines: Dict[str, ChildPhysioBaseline] = {}

    def get_or_create_baseline(self, child_id: str) -> ChildPhysioBaseline:
        if child_id not in self.baselines:
            self.baselines[child_id] = ChildPhysioBaseline(child_id=child_id)
        return self.baselines[child_id]

    def evaluate_room_environment(
        self,
        room_name: str,
        temperature: float,   # Celcius
        humidity: float,      # Persen (0-100)
        co2_ppm: float,       # CO2 ppm (parts per million)
        tvoc_ppb: float = 80.0,
    ) -> Dict[str, Any]:
        """Evaluasi Kualitas Udara dan Kenyamanan Termal Ruangan Daycare.
        Standar kenyamanan anak:
        - Suhu ideal: 23°C - 26°C (Indonesia tropis ber-AC)
        - Kelembaban ideal: 45% - 65%
        - CO2 aman: < 800 ppm; Peringatan ventilasi: 800-1000 ppm; Bahaya ventilasi buruk: > 1000 ppm
        """
        alerts = []
        status = "optimal"
        score = 100.0

        # 1. Evaluasi CO2
        if co2_ppm > 1200:
            status = "hazardous"
            score -= 40
            alerts.append(f"Kadar CO2 sangat tinggi ({co2_ppm:.0f} ppm). Ventilasi udara sangat buruk, anak rentan letih dan pusing. Segera buka ventilasi/jendela!")
        elif co2_ppm > 950:
            if status != "hazardous":
                status = "warning"
            score -= 20
            alerts.append(f"Kadar CO2 ruangan mulai meningkat ({co2_ppm:.0f} ppm). Sirkulasi udara perlu ditambah.")

        # 2. Evaluasi Suhu
        if temperature > 28.5:
            if status != "hazardous":
                status = "warning"
            score -= 20
            alerts.append(f"Suhu ruangan terlalu panas ({temperature:.1f}°C). Berpotensi menyebabkan anak dehidrasi dan rewel.")
        elif temperature < 21.0:
            if status != "hazardous":
                status = "warning"
            score -= 15
            alerts.append(f"Suhu ruangan terlalu dingin ({temperature:.1f}°C). Selimuti anak saat tidur siang.")

        # 3. Evaluasi Kelembaban
        if humidity > 75.0:
            score -= 10
            alerts.append(f"Kelembaban udara terlalu lembab ({humidity:.1f}%). Waspada pertumbuhan jamur dan tungau.")
        elif humidity < 40.0:
            score -= 10
            alerts.append(f"Udara ruangan terlalu kering ({humidity:.1f}%). Kulit dan saluran napas anak sensitif.")

        score = max(0.0, min(100.0, score))

        return {
            "room_name": room_name,
            "status": status,
            "comfort_index": round(score, 1),
            "temperature": round(temperature, 1),
            "humidity": round(humidity, 1),
            "co2_ppm": round(co2_ppm, 0),
            "tvoc_ppb": round(tvoc_ppb, 1),
            "is_comfortable": status == "optimal",
            "alerts": alerts,
            "recommendation": "Kondisi ruangan prima untuk anak." if not alerts else " ".join(alerts),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    def evaluate_child_daily_vitals(
        self,
        child_id: str,
        current_temp: float,
        nap_duration_minutes: float,
        meal_eaten_ratio: float,  # 0.0 - 1.0 (misal 0.5 = makan separuh)
        restless_motion_score: float = 0.2, # 0.0 tenang - 1.0 sangat gelisah
    ) -> Dict[str, Any]:
        """Evaluasi Kondisi Fisiologis Harian Anak Menggunakan Model Baseline Adaptif.
        Mendeteksi demam dini, kekurangan tidur, dan nafsu makan drop.
        """
        baseline = self.get_or_create_baseline(child_id)
        deviations = []
        is_abnormal = False
        urgency = "normal"

        # 1. Z-Score Suhu Tubuh
        z_temp = (current_temp - baseline.normal_temp_mean) / max(0.05, baseline.normal_temp_std)
        if current_temp >= 38.0:
            is_abnormal = True
            urgency = "critical"
            deviations.append(f"Demam Tinggi ({current_temp:.1f}°C). Suhu melampaui batas demam klinis.")
        elif current_temp >= 37.5 or z_temp >= 2.5:
            is_abnormal = True
            if urgency != "critical":
                urgency = "high"
            deviations.append(f"Subfebris / Hangat ({current_temp:.1f}°C, Z={z_temp:+.1f}). Gejala awal demam terdeteksi lebih cepat dari biasanya.")

        # 2. Analisis Tidur Siang
        nap_diff = baseline.normal_nap_minutes_mean - nap_duration_minutes
        if nap_duration_minutes < (baseline.normal_nap_minutes_mean * 0.45):
            is_abnormal = True
            if urgency == "normal":
                urgency = "medium"
            deviations.append(f"Durasi tidur siang sangat singkat ({nap_duration_minutes:.0f} menit vs normal {baseline.normal_nap_minutes_mean:.0f} menit).")
        elif restless_motion_score > 0.70:
            deviations.append(f"Sensor ranjang mendeteksi tidur gelisah (gerakan motorik tinggi). Kemungkinan tidak nyaman / kurang sehat.")

        # 3. Analisis Asupan Makan & Minum
        if meal_eaten_ratio < (baseline.normal_meal_finish_rate * 0.40):
            is_abnormal = True
            if urgency == "normal":
                urgency = "medium"
            deviations.append(f"Nafsu makan menurun drastis (hanya habis {meal_eaten_ratio*100:.0f}%).")

        wellbeing_score = 100.0 - (len(deviations) * 25.0)
        wellbeing_score = max(20.0, min(100.0, wellbeing_score))

        return {
            "child_id": child_id,
            "current_temp": round(current_temp, 1),
            "nap_duration_minutes": round(nap_duration_minutes, 0),
            "meal_eaten_percentage": round(meal_eaten_ratio * 100, 0),
            "wellbeing_score": wellbeing_score,
            "is_abnormal": is_abnormal,
            "urgency": urgency,
            "deviations_detected": deviations,
            "status_summary": "Kondisi Sehat & Bugar" if not deviations else "Butuh Perhatian Pengasuh: " + "; ".join(deviations),
            "evaluated_at": datetime.now(timezone.utc).isoformat(),
        }


smart_wellbeing_engine = SmartWellbeingEngine()
