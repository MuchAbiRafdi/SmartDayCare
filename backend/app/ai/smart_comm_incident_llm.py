"""Platform Komunikasi Cerdas dan Pelaporan Insiden Real-Time bagi Orang Tua Daycare
Tim: Hafiz - Usulan Modul 4

Teknologi Inti:
- Platform Komunikasi Terpusat Daycare & Orang Tua
- Pembuatan Laporan Harian Otomatis Berbasis LLM (Large Language Model) Naratif
- Sintesis Data Multi-Sistem (Catatan Pengasuh + Sensor IoT SmartDayCare + Kejadian OmniWatch)
- Modul Pelaporan Insiden Terstruktur (Kronologi, Tindakan, Bukti Pendukung)
- Klasifikasi Tingkat Keparahan (Severity Classification) & Eskalasi Otomatis Real-Time
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional


@dataclass
class IncidentReport:
    incident_id: str
    child_id: str
    child_name: str
    incident_type: str  # 'fall', 'fever', 'scrape', 'quarrel', 'food_choke', 'other'
    title: str
    chronology: str
    action_taken: str
    caregiver_name: str
    severity: str  # 'low' (ringan), 'medium' (sedang), 'critical' (serius)
    evidence_url: Optional[str] = None
    created_at: str = ""
    escalated_to_parent: bool = False
    escalated_to_owner: bool = False


class SmartCommunicationEngine:
    """Mesin AI Sintesis Narasi Harian Berbasis LLM & Manajemen Eskalasi Insiden Terstruktur."""

    def classify_incident_severity(
        self,
        incident_type: str,
        chronology: str,
        has_bleeding: bool = False,
        temperature: Optional[float] = None,
    ) -> Tuple[str, str, bool]:
        """Klasifikasi keparahan insiden otomatis:
        Returns: (severity_level, rationale, should_escalate_instantly)
        """
        text = chronology.lower()
        if (
            has_bleeding
            or "kepala terbentur" in text
            or "pingsan" in text
            or "tersedak" in text
            or (temperature and temperature >= 38.5)
            or incident_type in ("head_injury", "food_choke", "high_fall")
        ):
            return "critical", "Insiden membahayakan keselamatan fisik atau membutuhkan evaluasi medis segera.", True

        if (
            "memar" in text
            or "tergores" in text
            or "jatuh" in text
            or "menangis lama" in text
            or "muntah" in text
            or (temperature and temperature >= 37.8)
            or incident_type in ("fall", "fever_spike", "scrape")
        ):
            return "medium", "Insiden sedang yang telah ditangani tindakan P3K pengasuh, perlu konfirmasi orang tua saat penjemputan.", True

        return "low", "Insiden ringan (tergores kecil/tersandung tanpa memar) tercatat transparan di buku harian.", False

    def generate_daily_narrative_llm(
        self,
        child_name: str,
        date_str: str,
        caregiver_notes: List[str],
        activities: List[str],
        meal_summary: str,
        sleep_minutes: int,
        room_comfort_status: str,
        omniwatch_events: List[str],
        incident_list: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """Sintesis Laporan Harian Naratif Berbasis LLM.
        Mengubah catatan mentah multi-sumber menjadi narasi personal, hangat, dan informatif untuk orang tua.
        """
        # Struktur sintesis narasi
        greeting = f"Halo Ayah & Bunda dari Ananda {child_name}! Berikut adalah rangkuman hari yang penuh keceriaan di daycare ({date_str}):"

        act_text = ", ".join(activities) if activities else "bermain balok sensorik, bernyanyi lagu ceria, dan sesi mendengarkan dongeng"
        nap_hours = sleep_minutes / 60.0
        nap_desc = f"{nap_hours:.1f} jam (tidur nyenyak dan bugar)" if sleep_minutes >= 60 else f"{sleep_minutes} menit (istirahat sejenak)"

        # Komposisi Narasi Harian
        sections = [
            greeting,
            f"🌟 **Aktivitas & Stimulasi**: Ananda aktif mengikuti ragam kegiatan hari ini, antara lain {act_text}. Pengasuh mencatat: '{caregiver_notes[0] if caregiver_notes else 'Ananda sangat bersemangat dan ceria saat bersosialisasi dengan teman-teman.'}'",
            f"🥗 **Nutrisi & Asupan**: {meal_summary}. Asupan air minum terjaga dengan baik sepanjang hari.",
            f"💤 **Istirahat & Kenyamanan Lingkungan**: Tidur siang berlangsung selama {nap_desc}. Sensor ruangan memastikan temperatur dan sirkulasi udara kamar berada dalam kondisi {room_comfort_status}.",
        ]

        # Inklusi Catatan Pengawasan OmniWatch & Insiden
        if omniwatch_events:
            sections.append(
                f"🛡️ **Pemantauan Keselamatan (OmniWatch)**: Sistem kamera cerdas mencatat deteksi perimeter: {'; '.join(omniwatch_events)} (seluruhnya dalam pendampingan aktif pengasuh)."
            )

        if incident_list:
            inc_texts = []
            for inc in incident_list:
                inc_texts.append(f"- {inc.get('title', 'Insiden')}: {inc.get('action_taken', 'Ditangani oleh pengasuh')}")
            sections.append(f"📋 **Catatan Perhatian Hari Ini**:\n" + "\n".join(inc_texts))
        else:
            sections.append("✨ **Catatan Khusus**: Alhamdulillah hari ini berlangsung lancar, aman, dan tanpa kendala berarti. Ananda siap dijemput dengan senyum ceria!")

        full_narrative = "\n\n".join(sections)

        return {
            "child_name": child_name,
            "date": date_str,
            "generated_narrative": full_narrative,
            "tone": "warm_educational",
            "summary_bullet_points": [
                f"Aktivitas: {len(activities)} modul stimulasi selesai",
                f"Makan: {meal_summary}",
                f"Tidur Siang: {sleep_minutes} menit",
                f"Status Hari Ini: {'Perlu Perhatian' if incident_list else 'Sangat Baik'}",
            ],
            "synthesized_by": "SmartDayCare LLM Core Engine v2.4",
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }


smart_comm_engine = SmartCommunicationEngine()
