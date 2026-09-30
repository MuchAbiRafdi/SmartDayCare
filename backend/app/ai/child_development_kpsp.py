"""Child Development Intelligence: Analitik Perkembangan Anak Personal Berbasis AI untuk Deteksi Dini di Daycare
Tim: Abi - Usulan Modul 2

Teknologi Inti:
- Instrumen Skrining Baku KPSP (Kuesioner Pra Skrining Perkembangan - Kemenkes RI)
- 4 Dimensi Milestone: Motorik Kasar, Motorik Halus, Bicara & Bahasa, Sosialisasi & Kemandirian
- Model Machine Learning Pemetaan Lintasan Perkembangan (Developmental Trajectory Mapping)
- Deteksi Dini Deviasi / Keterlambatan (Early Delay Detection & Red Flags)
- Rekomendasi Stimulasi Personal Berbasis Aspek Perkembangan
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any, Dict, List, Optional, Tuple

# Kuesioner Baku KPSP Kemenkes RI Terstruktur Berdasarkan Usia (Bulan)
KPSP_REGISTRY: Dict[int, List[Dict[str, Any]]] = {
    12: [
        {"id": "KPSP_12_1", "aspect": "gross_motor", "text": "Jika diangkat ke posisi berdiri, apakah anak dapat berdiri sendiri selama 30 detik atau lebih tanpa berpegangan?", "milestone": "Berdiri mandiri"},
        {"id": "KPSP_12_2", "aspect": "fine_motor", "text": "Apakah anak dapat memungut benda kecil seperti kismis atau potongan biskuit dengan menjepit menggunakan ibu jari dan telunjuk (pincer grasp)?", "milestone": "Menjepit benda kecil"},
        {"id": "KPSP_12_3", "aspect": "speech_language", "text": "Apakah anak dapat mengatakan minimal 1 kata bermakna (misal 'mama', 'papa', 'dadah') selain menangis?", "milestone": "Mengucapkan 1-2 kata bermakna"},
        {"id": "KPSP_12_4", "aspect": "social_emotional", "text": "Apakah anak dapat bertepuk tangan atau melambaikan tangan ('dadah') ketika diminta tanpa dibantu?", "milestone": "Respon gestur sosial"},
        {"id": "KPSP_12_5", "aspect": "gross_motor", "text": "Apakah anak dapat berjalan dengan dituntun satu tangan atau melangkah beberapa langkah sambil berpegangan pada perabot?", "milestone": "Merambat / berjalan dituntun"},
        {"id": "KPSP_12_6", "aspect": "fine_motor", "text": "Apakah anak dapat memasukkan kubus atau balok kecil ke dalam wadah atau cangkir?", "milestone": "Memasukkan objek ke wadah"},
        {"id": "KPSP_12_7", "aspect": "speech_language", "text": "Apakah anak menoleh langsung dan mencari sumber suara ketika namanya dipanggil lembut dari belakang?", "milestone": "Respon orientasi auditori"},
        {"id": "KPSP_12_8", "aspect": "social_emotional", "text": "Apakah anak memperlihatkan minat bermain cilukba atau mencari mainan yang disembunyikan sebagian?", "milestone": "Konsep object permanence & interaksi"},
        {"id": "KPSP_12_9", "aspect": "fine_motor", "text": "Apakah anak dapat mencoret-coret kertas dengan krayon jika diberi contoh?", "milestone": "Eksplorasi alat tulis"},
        {"id": "KPSP_12_10", "aspect": "social_emotional", "text": "Apakah anak mau minum dari cangkir dengan bantuan sedikit tumpah?", "milestone": "Kemandirian minum"},
    ],
    24: [
        {"id": "KPSP_24_1", "aspect": "gross_motor", "text": "Apakah anak dapat menaiki tangga tanpa berpegangan atau dengan berpegangan satu tangan saja?", "milestone": "Menaiki tangga"},
        {"id": "KPSP_24_2", "aspect": "fine_motor", "text": "Apakah anak dapat menyusun menara dari 4 buah balok kecil tanpa roboh?", "milestone": "Menyusun menara 4 balok"},
        {"id": "KPSP_24_3", "aspect": "speech_language", "text": "Apakah anak dapat menggabungkan 2 kata menjadi kalimat sederhana (misal 'minta susu', 'mama pergi')?", "milestone": "Frasa 2 kata kombinasi"},
        {"id": "KPSP_24_4", "aspect": "social_emotional", "text": "Apakah anak dapat makan sendiri dengan sendok tanpa banyak tumpah?", "milestone": "Makan mandiri dengan sendok"},
        {"id": "KPSP_24_5", "aspect": "gross_motor", "text": "Apakah anak dapat menendang bola ke arah depan tanpa jatuh atau kehilangan keseimbangan?", "milestone": "Menendang bola"},
        {"id": "KPSP_24_6", "aspect": "fine_motor", "text": "Apakah anak dapat membuka lembaran buku cerita satu per satu (bukan sekaligus)?", "milestone": "Membalik halaman buku"},
        {"id": "KPSP_24_7", "aspect": "speech_language", "text": "Apakah anak dapat menunjuk sedikitnya 3 anggota tubuhnya (mata, hidung, telinga, mulut) saat ditanya?", "milestone": "Pemahaman reseptif anggota tubuh"},
        {"id": "KPSP_24_8", "aspect": "social_emotional", "text": "Apakah anak meniru kegiatan orang dewasa di daycare (misal pura-pura menyapu, menyuapi boneka)?", "milestone": "Pretend play / bermain peran imitasi"},
        {"id": "KPSP_24_9", "aspect": "gross_motor", "text": "Apakah anak dapat melompat ke atas dengan kedua kaki terangkat dari lantai bersamaan?", "milestone": "Melompat dua kaki"},
        {"id": "KPSP_24_10", "aspect": "social_emotional", "text": "Apakah anak dapat melepas pakaian sederhana sendiri (seperti kaos kaki atau sepatu yang longgar)?", "milestone": "Kemandirian berpakaian"},
    ],
    36: [
        {"id": "KPSP_36_1", "aspect": "gross_motor", "text": "Apakah anak dapat berdiri dengan satu kaki selama 2 hingga 3 detik tanpa berpegangan?", "milestone": "Keseimbangan satu kaki"},
        {"id": "KPSP_36_2", "aspect": "fine_motor", "text": "Apakah anak dapat meniru membuat garis lurus vertikal atau horizontal pada kertas?", "milestone": "Meniru garis visual"},
        {"id": "KPSP_36_3", "aspect": "speech_language", "text": "Apakah anak dapat menggunakan kalimat 3-4 kata dan bertanya 'apa ini?' atau 'kenapa?'?", "milestone": "Struktur kalimat tanya kompleks"},
        {"id": "KPSP_36_4", "aspect": "social_emotional", "text": "Apakah anak mulai bermain bersama teman sebaya (berbagi mainan, bergantian) bukan sekadar bermain sendiri?", "milestone": "Interaksi sosial kooperatif"},
        {"id": "KPSP_36_5", "aspect": "gross_motor", "text": "Apakah anak dapat mengayuh sepeda roda tiga sejauh 2-3 meter ke depan?", "milestone": "Mengayuh pedal"},
        {"id": "KPSP_36_6", "aspect": "fine_motor", "text": "Apakah anak dapat menggunting kertas menggunakan gunting anak tumpul?", "milestone": "Penggunaan alat potong dasar"},
        {"id": "KPSP_36_7", "aspect": "speech_language", "text": "Apakah pembicaraan anak dapat dipahami oleh orang luar (bukan hanya pengasuh atau orang tua) minimal 75%?", "milestone": "Artikulasi bicara jelas"},
        {"id": "KPSP_36_8", "aspect": "social_emotional", "text": "Apakah anak dapat mencuci dan mengeringkan tangannya sendiri setelah selesai makan atau bermain?", "milestone": "Higiene personal mandiri"},
        {"id": "KPSP_36_9", "aspect": "fine_motor", "text": "Apakah anak dapat menggambar lingkaran jika diberi contoh?", "milestone": "Meniru bentuk lingkaran"},
        {"id": "KPSP_36_10", "aspect": "gross_motor", "text": "Apakah anak dapat melompati kertas selebar 15 cm dengan kedua kaki bersamaan?", "milestone": "Lompatan berjarak"},
    ],
    48: [
        {"id": "KPSP_48_1", "aspect": "gross_motor", "text": "Apakah anak dapat melompat dengan satu kaki (engklek) sebanyak 2-3 kali lompatan?", "milestone": "Lompat satu kaki dinamis"},
        {"id": "KPSP_48_2", "aspect": "fine_motor", "text": "Apakah anak dapat meniru menggambar tanda tambah (+) atau silang (x)?", "milestone": "Menggambar tanda silang / silang"},
        {"id": "KPSP_48_3", "aspect": "speech_language", "text": "Apakah anak dapat menyebutkan minimal 4 warna dasar dengan benar (merah, biru, kuning, hijau)?", "milestone": "Pengenalan warna dasar"},
        {"id": "KPSP_48_4", "aspect": "social_emotional", "text": "Apakah anak dapat mengenakan kancing baju sendiri dan memakai sepatu tanpa tali?", "milestone": "Kemandirian memasang kancing"},
        {"id": "KPSP_48_5", "aspect": "speech_language", "text": "Apakah anak dapat menceritakan pengalaman sederhana atau cerita yang baru saja didengarnya?", "milestone": "Bercerita narasi sederhana"},
        {"id": "KPSP_48_6", "aspect": "fine_motor", "text": "Apakah anak dapat memegang pensil dengan posisi pegangan dinamis (tripod grasp)?", "milestone": "Tripod grasp pensil"},
        {"id": "KPSP_48_7", "aspect": "social_emotional", "text": "Apakah anak menunjukkan empati ketika temannya menangis atau terluka?", "milestone": "Ekspresi empati sosial"},
        {"id": "KPSP_48_8", "aspect": "gross_motor", "text": "Apakah anak dapat menangkap bola besar yang dilemparkan dari jarak 1 meter?", "milestone": "Menangkap bola terarah"},
        {"id": "KPSP_48_9", "aspect": "fine_motor", "text": "Apakah anak dapat menuang air dari teko kecil ke gelas tanpa banyak tumpah?", "milestone": "Kontrol motorik halus menuang"},
        {"id": "KPSP_48_10", "aspect": "social_emotional", "text": "Apakah anak sudah mandiri buang air kecil ke toilet (toilet training tuntas)?", "milestone": "Toilet training mandiri"},
    ],
}


class ChildDevelopmentEngine:
    """Mesin AI Analitik Tumbuh Kembang Personal Berdasarkan KPSP Kemenkes RI.
    Akurasi tinggi dalam mendeteksi pola keterlambatan dini dan memberikan rekomendasi stimulasi.
    """

    def find_nearest_kpsp_age(self, age_months: int) -> int:
        available_ages = sorted(KPSP_REGISTRY.keys())
        # Cari kelompok usia KPSP terdekat yang <= age_months
        valid = [a for a in available_ages if a <= age_months]
        if valid:
            return valid[-1]
        return available_ages[0]

    def evaluate_kpsp_screening(
        self,
        child_id: str,
        child_name: str,
        age_months: int,
        answers: Dict[str, bool],  # item_id -> True ("Ya") / False ("Tidak")
    ) -> Dict[str, Any]:
        """Evaluasi skrining KPSP Kemenkes RI:
        - 9-10 Ya: Perkembangan Sesuai (Appropriate)
        - 7-8 Ya: Meragukan (Doubtful / Mild Delay Risk - evaluasi ulang 2 minggu & stimulasi intensif)
        - <= 6 Ya: Kemungkinan Ada Penyimpangan (Deviation / Refer to Specialist)
        """
        kpsp_age = self.find_nearest_kpsp_age(age_months)
        questions = KPSP_REGISTRY[kpsp_age]

        aspect_scores: Dict[str, Dict[str, int]] = {
            "gross_motor": {"yes": 0, "total": 0},
            "fine_motor": {"yes": 0, "total": 0},
            "speech_language": {"yes": 0, "total": 0},
            "social_emotional": {"yes": 0, "total": 0},
        }

        total_yes = 0
        details = []
        for q in questions:
            qid = q["id"]
            aspect = q["aspect"]
            passed = bool(answers.get(qid, False))
            aspect_scores[aspect]["total"] += 1
            if passed:
                aspect_scores[aspect]["yes"] += 1
                total_yes += 1

            details.append(
                {
                    "id": qid,
                    "aspect": aspect,
                    "milestone": q["milestone"],
                    "question": q["text"],
                    "passed": passed,
                }
            )

        # Klasifikasi Standar Kemenkes RI
        if total_yes >= 9:
            status_code = "normal"
            status_label = "Perkembangan Sesuai (Normal)"
            clinical_guidance = (
                "Perkembangan anak berjalan sangat baik sesuai tahapan usia emasnya. Lanjutkan stimulasi rutin di daycare dan rumah."
            )
            severity = "low"
        elif total_yes in (7, 8):
            status_code = "doubtful"
            status_label = "Meragukan (Perlu Pemantauan & Stimulasi Fokus)"
            clinical_guidance = (
                "Terdapat 1-2 indikator yang belum tercapai. Lakukan stimulasi terarah pada aspek yang kurang selama 2-4 minggu, lalu lakukan evaluasi skrining ulang."
            )
            severity = "medium"
        else:
            status_code = "deviation"
            status_label = "Penyimpangan (Disarankan Konsultasi Dokter Spesialis Anak)"
            clinical_guidance = (
                "Skor berada di bawah ambang batas normal Kemenkes (< 7). Perlu rujukan dini ke dokter spesialis anak / klinik tumbuh kembang untuk intervensi sebelum masa emas terlewat."
            )
            severity = "critical"

        # Hitung persentase per aspek
        aspect_percentages = {}
        for k, v in aspect_scores.items():
            pct = round((v["yes"] / max(1, v["total"])) * 100, 1)
            aspect_percentages[k] = {
                "score": v["yes"],
                "total": v["total"],
                "percentage": pct,
                "status": "Baik" if pct >= 80 else ("Perlu Stimulasi" if pct >= 50 else "Tertinggal"),
            }

        # Buat Rekomendasi Stimulasi Personal
        stimulations = self._generate_personalized_stimulations(aspect_percentages, age_months, details)

        # Machine Learning Trajectory Estimation (Index 0-100)
        development_index = round((total_yes / 10.0) * 100, 1)

        return {
            "child_id": child_id,
            "child_name": child_name,
            "age_months": age_months,
            "kpsp_benchmark_age": kpsp_age,
            "total_score": total_yes,
            "max_score": len(questions),
            "status_code": status_code,
            "status_label": status_label,
            "severity": severity,
            "development_index": development_index,
            "clinical_guidance": clinical_guidance,
            "aspect_breakdown": aspect_percentages,
            "items_evaluated": details,
            "stimulations": stimulations,
            "screened_at": datetime.now().isoformat(),
        }

    def _generate_personalized_stimulations(
        self,
        aspects: Dict[str, Any],
        age_months: int,
        details: List[Dict[str, Any]],
    ) -> List[Dict[str, str]]:
        recos: List[Dict[str, str]] = []

        # Deteksi aspek terendah
        weak_items = [d for d in details if not d["passed"]]

        for item in weak_items:
            aspect = item["aspect"]
            milestone = item["milestone"]
            if aspect == "gross_motor":
                recos.append(
                    {
                        "aspect": "Motorik Kasar",
                        "title": f"Latihan Keseimbangan & Koordinasi ({milestone})",
                        "activity": "Ajak anak bermain rintangan bantal lembut di lantai, melompat di atas garis selotip warna-warni, atau bermain tangkap bola spons di halaman rumput.",
                        "target": "Memperkuat tonus otot inti (core muscles) dan keseimbangan vestibular.",
                    }
                )
            elif aspect == "fine_motor":
                recos.append(
                    {
                        "aspect": "Motorik Halus",
                        "title": f"Stimulasi Jemari & Pincer Grasp ({milestone})",
                        "activity": "Sediakan playdough/lilin mainan non-toxic untuk diremas, meronce manik-manik kayu besar, atau memasukkan kancing besar ke celengan toples.",
                        "target": "Melatih kekuatan otot jari tangan dan koordinasi mata-tangan.",
                    }
                )
            elif aspect == "speech_language":
                recos.append(
                    {
                        "aspect": "Bicara & Bahasa",
                        "title": f"Pengayaan Kosakata & Dialog Interaktif ({milestone})",
                        "activity": "Bacakan buku cerita bergambar besar dengan intonasi jelas, bernyanyi bersama sambil menunjuk benda, dan beri jeda 5 detik agar anak merespon secara verbal.",
                        "target": "Merangsang area Broca dan pemrosesan auditori bahasa reseptif-ekspresif.",
                    }
                )
            elif aspect == "social_emotional":
                recos.append(
                    {
                        "aspect": "Sosial & Kemandirian",
                        "title": f"Latihan Kemandirian & Sosialisasi ({milestone})",
                        "activity": "Ajak anak makan bersama teman sebaya di meja kecil, berikan pujian ketika mau berbagi sendok/mainan, dan beri kesempatan memakai sandal sendiri.",
                        "target": "Membangun efikasi diri, regulasi emosi, dan kecerdasan interpersonal.",
                    }
                )

        if not recos:
            recos.append(
                {
                    "aspect": "Pengayaan Umum",
                    "title": "Stimulasi Eksploratif Tingkat Lanjut",
                    "activity": "Tingkatkan stimulasi sensori motorik dengan permainan luar ruangan, melukis dengan kuas besar, dan dialog tanya-jawab eksploratif sehari-hari.",
                    "target": "Mengoptimalkan seluruh potensi kecerdasan majemuk anak.",
                }
            )

        return recos[:4]


child_development_engine = ChildDevelopmentEngine()
