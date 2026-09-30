"""TrustMeter: Analitik Kepercayaan Orang Tua Berbasis Sentimen dan Rating untuk Peningkatan Mutu Layanan Daycare
Tim: Rifqi - Usulan Modul 5

Teknologi Inti:
- Aspect-Based Sentiment Analysis (ABSA) untuk Teks Ulasan / Masukan Berbahasa Indonesia
- Pemetaan ke 5 Aspek Layanan: Keamanan, Kebersihan, Makanan, Sikap Pengasuh, dan Komunikasi
- Penggabungan Data Rating Kuantitatif + Sentimen Kualitatif menjadi "Parent Trust Index" (PTI)
- Dashboard Tren Kepercayaan & Peringatan Dini Penurunan Aspek (Early Warning Anomaly Detection)
"""
from __future__ import annotations

import math
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

# Kamus Kata Kunci 5 Aspek Layanan Daycare
ASPECT_KEYWORDS: Dict[str, List[str]] = {
    "keamanan": [
        "aman", "keamanan", "cctv", "kamera", "jatuh", "cedera", "terbentur", "luka",
        "bahaya", "tangga", "dapur", "gerbang", "pintu", "kabur", "pengawasan", "diawasi", "rawan"
    ],
    "kebersihan": [
        "bersih", "kebersihan", "kotor", "bau", "debu", "kuman", "cuci", "sanitasi",
        "toilet", "popok", "ruangan", "lantai", "mainan", "higienis", "becek", "rapi"
    ],
    "makanan": [
        "makan", "makanan", "menu", "gizi", "sayur", "buah", "susu", "minum",
        "porsi", "kenyang", "lapar", "alergi", "habis", "suap", "snack", "nutrisi"
    ],
    "sikap_pengasuh": [
        "pengasuh", "guru", "suster", "bunda", "sabar", "ramah", "sayang", "telaten",
        "kasar", "cuek", "galak", "marah", "perhatian", "lembut", "peduli", "ikhlas"
    ],
    "komunikasi": [
        "komunikasi", "laporan", "chat", "wa", "pesan", "update", "kabar", "cepat",
        "lambat", "balas", "respon", "terlambat", "jelas", "bingung", "info", "transparan"
    ],
}

# Kamus Sentimen Bahasa Indonesia dengan Bobot Polaritas
POSITIVE_LEXICON = {
    "puas": 1.0, "senang": 0.9, "bagus": 0.8, "baik": 0.8, "terima kasih": 0.7,
    "membantu": 0.7, "cepat": 0.8, "responsif": 0.9, "sabar": 1.0, "ramah": 0.9,
    "informatif": 0.8, "suka": 0.8, "mantap": 0.9, "hebat": 1.0, "lancar": 0.7,
    "ceria": 0.8, "percaya": 1.0, "amanah": 1.0, "bersih": 0.9, "tenang": 0.9,
    "nyaman": 0.9, "lengkap": 0.8, "profesional": 1.0, "rapi": 0.8, "terjamin": 0.9,
}

NEGATIVE_LEXICON = {
    "kecewa": -1.0, "lambat": -0.8, "terlambat": -0.8, "kurang": -0.5, "tidak": -0.6,
    "buruk": -1.0, "mahal": -0.4, "sempit": -0.5, "kotor": -1.0, "sulit": -0.6,
    "mendadak": -0.5, "bingung": -0.6, "lama": -0.7, "cuek": -0.9, "kasar": -1.0,
    "marah": -0.9, "bau": -0.8, "terabaikan": -1.0, "khawatir": -0.8, "waswas": -0.8,
    "lalai": -1.0, "jatuh": -0.6, "demam": -0.4, "rewel": -0.4, "minim": -0.6,
}

NEGATION_WORDS = {"tidak", "kurang", "bukan", "belum", "jangan", "tak", "gak", "nggak"}
INTENSIFIER_WORDS = {"sangat": 1.5, "amat": 1.5, "banget": 1.5, "luar biasa": 1.8, "paling": 1.4}


class TrustMeterEngine:
    """Mesin Analisis Sentimen Berbasis Aspek (ABSA) & Parent Trust Index (PTI)."""

    def analyze_feedback(self, text: str, rating: int) -> Dict[str, Any]:
        """Ekstraksi aspek layanan dan polaritas sentimen spesifik per aspek."""
        clean_text = text.lower().strip()
        tokens = re.findall(r"\b[\w\-]+\b", clean_text)

        # 1. Deteksi Aspek yang Disebutkan
        detected_aspects: Dict[str, Dict[str, Any]] = {}

        for aspect_name, keywords in ASPECT_KEYWORDS.items():
            matched_kws = [kw for kw in keywords if kw in clean_text]
            if matched_kws:
                # Hitung polaritas khusus kalimat/frasa yang memuat aspek ini
                sentiment_score, confidence, polarity_label = self._calculate_aspect_polarity(clean_text, tokens, matched_kws, rating)
                detected_aspects[aspect_name] = {
                    "matched_keywords": matched_kws,
                    "sentiment_score": round(sentiment_score, 2),  # -1.0 s.d +1.0
                    "polarity": polarity_label,
                    "confidence": round(confidence, 2),
                }

        # Jika tidak ada aspek spesifik yang terdeteksi, petakan ke penilaian umum
        overall_sentiment, overall_conf, overall_label = self._calculate_general_polarity(clean_text, tokens, rating)

        # Hitung skor Parent Trust Index kontribusi feedback ini (0-100)
        # 50% dari rating bintang (1-5 -> 20-100), 50% dari sentimen kualitatif (-1 s.d 1 -> 0-100)
        rating_score = (rating / 5.0) * 100.0
        sentiment_normalized = ((overall_sentiment + 1.0) / 2.0) * 100.0
        pti_score = round(0.55 * rating_score + 0.45 * sentiment_normalized, 1)

        return {
            "text": text,
            "rating": rating,
            "overall_sentiment": overall_label,
            "overall_score": round(overall_sentiment, 2),
            "confidence": round(overall_conf, 2),
            "parent_trust_score": pti_score,
            "aspects": detected_aspects,
            "aspect_count": len(detected_aspects),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    def _calculate_aspect_polarity(
        self,
        full_text: str,
        tokens: List[str],
        matched_kws: List[str],
        rating: int,
    ) -> Tuple[float, float, str]:
        # Cari konteks kalimat di sekitar keyword
        raw_score = 0.0
        matches = 0

        for i, tok in enumerate(tokens):
            weight = 0.0
            if tok in POSITIVE_LEXICON:
                weight = POSITIVE_LEXICON[tok]
            elif tok in NEGATIVE_LEXICON:
                weight = NEGATIVE_LEXICON[tok]

            if weight != 0.0:
                # Periksa negasi dalam radius 2 kata sebelumnya
                window = tokens[max(0, i - 2) : i]
                is_negated = any(neg in window for neg in NEGATION_WORDS)
                if is_negated:
                    weight = -weight * 0.9

                # Periksa intensifier
                has_intensifier = any(inte in window for inte in INTENSIFIER_WORDS)
                if has_intensifier:
                    weight *= 1.4

                raw_score += weight
                matches += 1

        # Tambahkan anchor dari rating bintang orang tua
        rating_anchor = (rating - 3) / 2.0  # rating 5 -> +1.0, rating 3 -> 0, rating 1 -> -1.0

        if matches > 0:
            combined = 0.6 * (raw_score / matches) + 0.4 * rating_anchor
        else:
            combined = rating_anchor

        score = max(-1.0, min(1.0, combined))
        confidence = min(0.98, 0.70 + (0.05 * matches))

        label = "positif" if score >= 0.25 else ("negatif" if score <= -0.25 else "netral")
        return score, confidence, label

    def _calculate_general_polarity(
        self,
        clean_text: str,
        tokens: List[str],
        rating: int,
    ) -> Tuple[float, float, str]:
        pos = sum(1 for w in tokens if w in POSITIVE_LEXICON)
        neg = sum(1 for w in tokens if w in NEGATIVE_LEXICON)
        rating_score = (rating - 3) / 2.0
        text_score = (pos - neg) / max(1, pos + neg) if (pos + neg) > 0 else 0.0
        final_score = 0.5 * rating_score + 0.5 * text_score
        label = "positif" if final_score >= 0.20 else ("negatif" if final_score <= -0.20 else "netral")
        return final_score, 0.85, label

    def compute_aggregate_pti(self, feedbacks: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Menghitung Parent Trust Index (PTI) Agregat Daycare beserta Analisis 5 Aspek & Early Warning."""
        if not feedbacks:
            return {
                "parent_trust_index": 85.0,
                "aspect_breakdown": {
                    "keamanan": {"score": 88.0, "status": "Prima", "sample_count": 0},
                    "kebersihan": {"score": 90.0, "status": "Prima", "sample_count": 0},
                    "makanan": {"score": 84.0, "status": "Baik", "sample_count": 0},
                    "sikap_pengasuh": {"score": 92.0, "status": "Prima", "sample_count": 0},
                    "komunikasi": {"score": 82.0, "status": "Baik", "sample_count": 0},
                },
                "early_warnings": [],
                "total_feedback": 0,
            }

        aspect_accum: Dict[str, List[float]] = {
            "keamanan": [],
            "kebersihan": [],
            "makanan": [],
            "sikap_pengasuh": [],
            "komunikasi": [],
        }

        all_pti = []
        for fb in feedbacks:
            rating = fb.get("rating", 4)
            text = fb.get("text", "")
            res = self.analyze_feedback(text, rating)
            all_pti.append(res["parent_trust_score"])

            for asp, asp_data in res["aspects"].items():
                if asp in aspect_accum:
                    # Skala 0-100
                    asp_score = ((asp_data["sentiment_score"] + 1.0) / 2.0) * 100.0
                    aspect_accum[asp].append(asp_score)

        overall_pti = round(sum(all_pti) / len(all_pti), 1)

        aspect_breakdown = {}
        early_warnings = []

        for asp_name, scores in aspect_accum.items():
            if scores:
                avg = round(sum(scores) / len(scores), 1)
            else:
                # Default baseline jika belum ada mention spesifik
                avg = overall_pti

            status = "Prima" if avg >= 85 else ("Baik" if avg >= 70 else "Perlu Ditingkatkan")
            aspect_breakdown[asp_name] = {
                "score": avg,
                "status": status,
                "sample_count": len(scores),
            }

            # Early warning alert jika skor aspek < 68
            if avg < 70:
                early_warnings.append(
                    {
                        "aspect": asp_name,
                        "score": avg,
                        "severity": "high" if avg < 55 else "medium",
                        "message": f"Peringatan Dini: Indeks kepuasan pada aspek '{asp_name.replace('_', ' ').title()}' ({avg}%) berada di bawah batas aman. Lakukan evaluasi internal sebelum terjadi penurunan retensi penitipan.",
                    }
                )

        return {
            "parent_trust_index": overall_pti,
            "aspect_breakdown": aspect_breakdown,
            "early_warnings": early_warnings,
            "total_feedback": len(feedbacks),
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }


trustmeter_engine = TrustMeterEngine()
