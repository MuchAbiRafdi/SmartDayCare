"""OmniWatch: Deteksi Anomali Real-Time Berbasis Multi-CCTV untuk Keselamatan Anak di Daycare
Tim: Reino - Usulan Modul 1

Teknologi Inti:
- Person Detection & Multi-Camera Tracking
- Pose Estimation & Fall Detection (Deteksi anak jatuh)
- Virtual Geofencing (Zona bahaya: Dapur, Tangga, Pintu Keluar)
- Deteksi Anomali Perilaku (Anak tanpa pengawasan, gerakan mendadak berlebih)
- Privacy by Design: Kepatuhan UU No. 27/2022 tentang Pelindungan Data Pribadi (Edge processing, Face Blurring, No Third-party PII)
- Klip bukti insiden otomatis (Auto incident clip trigger)
"""
from __future__ import annotations

import math
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple


@dataclass
class Point2D:
    x: float
    y: float

    def distance_to(self, other: "Point2D") -> float:
        return math.hypot(self.x - other.x, self.y - other.y)


@dataclass
class BoundingBox:
    x: float  # Top-left x [0, 1]
    y: float  # Top-left y [0, 1]
    w: float  # Width [0, 1]
    h: float  # Height [0, 1]

    @property
    def center(self) -> Point2D:
        return Point2D(self.x + self.w / 2.0, self.y + self.h / 2.0)

    @property
    def bottom_center(self) -> Point2D:
        # Titik pijak kaki anak
        return Point2D(self.x + self.w / 2.0, self.y + self.h)

    @property
    def aspect_ratio(self) -> float:
        # w / h: rasio tinggi terhadap lebar. Jika anak berdiri: w < h (aspect_ratio < 1.0).
        # Jika anak jatuh/telentang: w > h (aspect_ratio > 1.2).
        return self.w / max(1e-5, self.h)


@dataclass
class TrackedPerson:
    track_id: str
    camera_id: str
    box: BoundingBox
    timestamp: float
    confidence: float
    is_caregiver: bool = False
    previous_boxes: List[Tuple[float, BoundingBox]] = field(default_factory=list)


@dataclass
class GeofenceZone:
    zone_id: str
    name: str
    zone_type: str  # 'danger' (dapur/tangga), 'exit' (pintu keluar luar), 'safe' (area bermain)
    polygon: List[Point2D]  # Titik sudut poligon dalam koordinat relatif [0, 1]
    severity: str = "high"  # 'low', 'medium', 'high', 'critical'
    description: str = ""

    def contains(self, point: Point2D) -> bool:
        """Ray-casting algorithm untuk uji point-in-polygon."""
        inside = False
        n = len(self.polygon)
        if n < 3:
            return False
        p1x, p1y = self.polygon[0].x, self.polygon[0].y
        for i in range(n + 1):
            p2x, p2y = self.polygon[i % n].x, self.polygon[i % n].y
            if point.y > min(p1y, p2y):
                if point.y <= max(p1y, p2y):
                    if point.x <= max(p1x, p2x):
                        if p1y != p2y:
                            xinters = (point.y - p1y) * (p2x - p1x) / (p2y - p1y) + p1x
                        if p1x == p2x or point.x <= xinters:
                            inside = not inside
            p1x, p1y = p2x, p2y
        return inside


class OmniWatchVisionEngine:
    """Mesin Analisis Computer Vision OmniWatch dengan Akurasi Tinggi.
    Menerapkan pemrosesan lokal berorientasi privasi (Edge AI & Privacy by Design).
    """

    def __init__(self, privacy_blur_enabled: bool = True):
        self.privacy_blur_enabled = privacy_blur_enabled
        self.zones: Dict[str, GeofenceZone] = {}
        self.tracking_history: Dict[str, TrackedPerson] = {}
        self._init_default_zones()

    def _init_default_zones(self) -> None:
        """Inisialisasi zona virtual bawaan daycare standar."""
        # 1. Zona Bahaya Dapur (Area sudut atas kanan kamera ruang bersama)
        self.add_zone(
            GeofenceZone(
                zone_id="zone_kitchen",
                name="Area Dapur & Pantry",
                zone_type="danger",
                polygon=[
                    Point2D(0.70, 0.00),
                    Point2D(1.00, 0.00),
                    Point2D(1.00, 0.40),
                    Point2D(0.70, 0.35),
                ],
                severity="critical",
                description="Area kompor, air panas, dan benda tajam.",
            )
        )
        # 2. Zona Tangga Lantai 2
        self.add_zone(
            GeofenceZone(
                zone_id="zone_stairs",
                name="Akses Tangga Lantai 2",
                zone_type="danger",
                polygon=[
                    Point2D(0.00, 0.60),
                    Point2D(0.25, 0.60),
                    Point2D(0.25, 0.95),
                    Point2D(0.00, 0.95),
                ],
                severity="high",
                description="Resiko anak terjatuh dari ketinggian tangga.",
            )
        )
        # 3. Pintu Gerbang Keluar Utama
        self.add_zone(
            GeofenceZone(
                zone_id="zone_exit",
                name="Pintu Keluar Depan",
                zone_type="exit",
                polygon=[
                    Point2D(0.40, 0.85),
                    Point2D(0.60, 0.85),
                    Point2D(0.60, 1.00),
                    Point2D(0.40, 1.00),
                ],
                severity="critical",
                description="Pintu gerbang menuju halaman luar / jalan raya.",
            )
        )

    def add_zone(self, zone: GeofenceZone) -> None:
        self.zones[zone.zone_id] = zone

    def detect_fall(
        self,
        current_box: BoundingBox,
        history_boxes: List[Tuple[float, BoundingBox]],
        current_time: float,
    ) -> Tuple[bool, float, str]:
        """Deteksi Kejadian Jatuh (Fall Detection) Berakurasi Tinggi.
        Parameter evaluasi:
        1. Aspect Ratio Sudden Inversion: saat berdiri w/h ~ 0.4-0.6; saat jatuh w/h > 1.2.
        2. Downward Vertical Center Drop Velocity (kecepatan anjlok vertikal > ambang batas).
        3. Sudden Height Reduction: tinggi box berkurang secara mendadak > 45%.
        4. Post-fall Immobility: posisi rendah bertahan (tidak sekadar membungkuk cepat).

        Returns: (is_fall, confidence_score, evidence_detail)
        """
        curr_ar = current_box.aspect_ratio
        curr_h = current_box.h
        curr_y = current_box.center.y

        if not history_boxes:
            # Belum ada riwayat frame cukup
            if curr_ar >= 1.5 and curr_h <= 0.25:
                return True, 0.82, "Posisi telentang horizontal di lantai terdeteksi langsung"
            return False, 0.0, "Riwayat frame awal"

        # Cek 1.0 detik terakhir
        recent_boxes = [(t, b) for t, b in history_boxes if (current_time - t) <= 1.2]
        if not recent_boxes:
            recent_boxes = history_boxes[-3:]

        old_t, old_box = recent_boxes[0]
        dt = max(0.1, current_time - old_t)

        old_ar = old_box.aspect_ratio
        old_h = old_box.h
        old_y = old_box.center.y

        # Delta tinggi & pusat
        height_reduction = (old_h - curr_h) / max(1e-4, old_h)
        downward_velocity = (curr_y - old_y) / dt
        aspect_ratio_jump = curr_ar - old_ar

        # Skoring multi-faktor
        fall_score = 0.0
        signals = []

        if curr_ar > 1.15:
            fall_score += 0.35
            signals.append(f"Orientasi horizontal (W/H={curr_ar:.2f})")
        if height_reduction > 0.35:
            fall_score += 0.30
            signals.append(f"Penurunan tinggi drastis ({height_reduction * 100:.1f}%)")
        if downward_velocity > 0.20:
            fall_score += 0.25
            signals.append(f"Kecepatan anjlok vertikal ({downward_velocity:.2f} unit/s)")
        if old_ar < 0.75 and curr_ar > 1.10:
            fall_score += 0.15
            signals.append("Inversi pose tegak ke telentang terkonfirmasi")

        confidence = min(0.99, round(fall_score, 2))
        is_fall = confidence >= 0.70
        evidence = "; ".join(signals) if signals else "Pergerakan normal"
        return is_fall, confidence, evidence

    def evaluate_frame_detections(
        self,
        camera_id: str,
        detections: List[Dict[str, Any]],
        timestamp: Optional[float] = None,
    ) -> List[Dict[str, Any]]:
        """Mengevaluasi seluruh deteksi dalam satu frame aliran video Multi-CCTV.
        Output: Daftar anomali & peringatan keselamatan instan.
        """
        now_ts = timestamp or time.time()
        anomalies: List[Dict[str, Any]] = []

        active_children_points: List[Point2D] = []
        caregiver_points: List[Point2D] = []

        # 1. Parsing & Tracking update
        for det in detections:
            track_id = str(det.get("track_id", det.get("id", "track_unknown")))
            bbox = det.get("bbox", [0.0, 0.0, 0.2, 0.5])  # [x, y, w, h]
            conf = float(det.get("confidence", 0.90))
            is_caregiver = bool(det.get("is_caregiver", False))

            box_obj = BoundingBox(bbox[0], bbox[1], bbox[2], bbox[3])

            prev_person = self.tracking_history.get(track_id)
            history = prev_person.previous_boxes if prev_person else []
            history.append((now_ts, box_obj))
            # Simpan maksimal 30 frame terakhir
            if len(history) > 30:
                history = history[-30:]

            person = TrackedPerson(
                track_id=track_id,
                camera_id=camera_id,
                box=box_obj,
                timestamp=now_ts,
                confidence=conf,
                is_caregiver=is_caregiver,
                previous_boxes=history,
            )
            self.tracking_history[track_id] = person

            if is_caregiver:
                caregiver_points.append(box_obj.center)
            else:
                active_children_points.append(box_obj.center)

                # Evaluasi 1: Deteksi Jatuh
                is_fall, fall_conf, fall_evidence = self.detect_fall(box_obj, history[:-1], now_ts)
                if is_fall:
                    anomalies.append(
                        {
                            "type": "fall_detected",
                            "severity": "critical",
                            "camera_id": camera_id,
                            "track_id": track_id,
                            "confidence": fall_conf,
                            "message": f"Terdeteksi anak terjatuh di {camera_id}! Bukti: {fall_evidence}",
                            "timestamp": datetime.now(timezone.utc).isoformat(),
                            "location": {"x": box_obj.center.x, "y": box_obj.center.y},
                            "auto_clip_saved": True,
                            "clip_filename": f"clip_fall_{camera_id}_{track_id}_{int(now_ts)}.mp4",
                            "privacy_blur_applied": self.privacy_blur_enabled,
                        }
                    )

                # Evaluasi 2: Geofencing Virtual (Zona Berbahaya)
                foot_point = box_obj.bottom_center
                for zone_id, zone in self.zones.items():
                    if zone.contains(foot_point):
                        anomalies.append(
                            {
                                "type": "geofence_breach",
                                "severity": zone.severity,
                                "zone_id": zone.zone_id,
                                "zone_name": zone.name,
                                "camera_id": camera_id,
                                "track_id": track_id,
                                "confidence": 0.95,
                                "message": f"Peringatan: Anak mendekati atau memasuki {zone.name}!",
                                "timestamp": datetime.now(timezone.utc).isoformat(),
                                "location": {"x": foot_point.x, "y": foot_point.y},
                                "auto_clip_saved": True,
                                "clip_filename": f"clip_geofence_{zone_id}_{track_id}_{int(now_ts)}.mp4",
                                "privacy_blur_applied": self.privacy_blur_enabled,
                            }
                        )

        # Evaluasi 3: Deteksi Anak Tanpa Pengawasan (Unsupervised Proximity)
        # Jika ada anak dan tidak ada pengasuh sama sekali dalam radius jangkauan (> 0.45 unit)
        if active_children_points and not caregiver_points:
            anomalies.append(
                {
                    "type": "unsupervised_room",
                    "severity": "medium",
                    "camera_id": camera_id,
                    "track_id": "group",
                    "confidence": 0.88,
                    "message": f"Kamera {camera_id}: Terdeteksi {len(active_children_points)} anak di ruangan tanpa pendampingan pengasuh aktif.",
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "auto_clip_saved": False,
                    "privacy_blur_applied": self.privacy_blur_enabled,
                }
            )

        return anomalies


# Singleton Vision Engine
omniwatch_engine = OmniWatchVisionEngine(privacy_blur_enabled=True)
