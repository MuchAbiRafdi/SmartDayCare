# SmartDayCare AI: Platform Kemitraan Solusi Daycare Cerdas Terpadu

Platform ekosistem terpadu berbasis **Kecerdasan Buatan (AI)** dan **Internet of Things (IoT)** yang dirancang khusus untuk **Fasilitas Mitra Daycare, PAUD, dan Yayasan Penitipan Anak**. 

Mengintegrasikan 5 pilar inovasi usulan penajaman:
1. **OmniWatch (Tim Reino)**: Deteksi Anomali Real-Time Berbasis Multi-CCTV (Pose Fall Detection & Virtual Geofencing).
2. **Child Development Intelligence (Tim Abi)**: Analitik Perkembangan Anak Personal Berbasis AI Mengacu Baku KPSP Kemenkes RI.
3. **SmartDayCare IoT & Wellbeing (Tim Zaki)**: Monitoring Kesejahteraan Harian (Suhu IR, Tidur Siang, & Sensor Udara CO₂).
4. **Platform Komunikasi & Pelaporan Insiden LLM (Tim Hafiz)**: Sintesis Laporan Harian Naratif LLM & Auto-Eskalasi Insiden Terstruktur.
5. **TrustMeter (Tim Rifqi)**: Analitik Kepercayaan Orang Tua Berbasis Aspect-Based Sentiment Analysis (ABSA) & Parent Trust Index (PTI).

---

## 📁 Struktur Direktori Rapi & Terorganisir

Repositori telah dirapikan sepenuhnya menjadi struktur yang bersih dan intuitif:

```text
D:\Smartdaycare\
├── frontend/               # Next.js 15 (React 19, Tailwind CSS, Lucide Icons)
│   ├── src/
│   │   ├── app/            # App Router (Landing Page Mitra, Dashboard, Login, dll.)
│   │   ├── components/     # UI Components, Islands, Admin, Caregiver, Parent
│   │   └── lib/            # API client, Derivations, Formatter, Session
│   ├── public/             # Gambar & asset statis
│   ├── package.json        # Dependensi npm Next.js
│   └── next.config.ts      # Konfigurasi Next.js & Proxy API /api
│
├── backend/                # FastAPI (Python 3.11+, SQLAlchemy, Uvicorn)
│   ├── app/
│   │   ├── ai/             # Engine 5 Modul AI terintegrasi
│   │   ├── routers/        # Endpoint REST API (ai_ecosystem, auth, log, dll.)
│   │   ├── main.py         # Entry point FastAPI App
│   │   ├── models.py       # Skema Database ORM
│   │   └── seed.py         # Data inisialisasi / percontohan
│   └── requirements.txt    # Dependensi Python backend
│
├── ai/                     # Modul AI Mandiri & Test Benchmark Suite
│   ├── modules/
│   │   ├── omniwatch_cv.py             # Modul 1: Vision, Pose Fall, Geofencing
│   │   ├── child_development_kpsp.py   # Modul 2: KPSP Kemenkes & Trajectory ML
│   │   ├── iot_wellbeing.py            # Modul 3: IoT Room Comfort & Anomaly Vitals
│   │   ├── smart_comm_incident_llm.py  # Modul 4: LLM Narrative & Incident Escalation
│   │   └── trustmeter_absa.py          # Modul 5: ABSA Bahasa Indonesia & PTI
│   └── test_ai_suite.py    # Test Runner Benchmark 5 Modul AI (100% Passed)
│
├── docs/                   # Dokumentasi Arsitektur, Hardware Sensor, & Regulasi
├── tests/                  # Uji E2E dan integrasi
├── run-backend.bat         # Launcher 1-Klik Backend Windows
├── run-frontend.bat        # Launcher 1-Klik Frontend Windows
├── run-ai-suite.bat        # Launcher 1-Klik Test Suite AI Windows
└── README.md               # Dokumentasi panduan ini
```

---

## 🚀 Panduan Cara Menjalankan Website

Untuk melihat dan mengoperasikan website secara utuh, Anda menjalankan **Backend** (FastAPI) dan **Frontend** (Next.js).

### Opsi A: Menggunakan Launcher Satu-Klik (Windows)
1. **Jalankan Backend**: Dobel-klik file `run-backend.bat`. Backend akan otomatis aktif di `http://127.0.0.1:8000`.
2. **Jalankan Frontend**: Dobel-klik file `run-frontend.bat`. Frontend akan otomatis aktif di `http://localhost:3000`.
3. Buka peramban (browser) di **[http://localhost:3000](http://localhost:3000)**.

---

### Opsi B: Menggunakan Terminal / PowerShell

#### 1. Jalankan Backend (FastAPI Python)
Buka terminal PowerShell pertama, arahkan ke folder `backend`:
```powershell
cd D:\Smartdaycare\backend
pip install -r requirements.txt
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```
> Server backend berjalan di: `http://127.0.0.1:8000`  
> Dokumentasi interaktif Swagger API ada di: `http://127.0.0.1:8000/api/docs`

#### 2. Jalankan Frontend (Next.js)
Buka terminal PowerShell kedua, arahkan ke folder `frontend`:

> 💡 **Catatan untuk Windows/Laragon PowerShell**:  
> Jika muncul pesan `npm.ps1 cannot be loaded because running scripts is disabled`, gunakan perintah **`npm.cmd`**:

```powershell
cd D:\Smartdaycare\frontend
npm.cmd install
npm.cmd run dev
```
> Server frontend berjalan di: **[http://localhost:3000](http://localhost:3000)**

---

## 🧪 Menguji Akurasi 5 Modul AI

Anda dapat memverifikasi akurasi kelima modul kecerdasan buatan kapan saja dengan menjalankan test suite benchmark:
```powershell
cd D:\Smartdaycare\ai
python test_ai_suite.py
```
Hasil uji benchmark mencakup:
- **Modul 1 (OmniWatch)**: Deteksi pose horizontal anak terjatuh (Fall confidence: 94%), peringatan geofence breach zona dapur, dan status unsupervised room.
- **Modul 2 (Child Development Intelligence)**: Evaluasi kuesioner KPSP Kemenkes 10 poin usia 24 bulan, status perkembangan normal (10/10), trajectory index 100%, serta rekomendasi stimulasi personal.
- **Modul 3 (SmartDayCare IoT)**: Evaluasi termometer IR nirsentuh dan sensor kasur, deteksi dini subfebris 37.9°C (Z-score: +5.2) serta evaluasi kenyamanan udara kamar CO₂ 620 ppm.
- **Modul 4 (Platform Komunikasi LLM)**: Sintesis narasi laporan harian ramah orang tua dan klasifikasi eskalasi insiden berjenjang (Ringan, Sedang, Kritis).
- **Modul 5 (TrustMeter ABSA)**: Ekstraksi aspek ulasan bahasa Indonesia (Kebersihan: +0.63, Pengasuh: +0.63, Komunikasi: +0.63) dan kalkulasi Parent Trust Index 77.8%.

---

## 🔒 Standar Privasi & Kepatuhan Regulasi
- **Privacy by Design**: Analisis video dilakukan pada perangkat lokal (*edge computing*).
- **Kepatuhan UU No. 27/2022 tentang Pelindungan Data Pribadi (PDP)**: Data anak merupakan kategori data pribadi spesifik. Dilengkapi penyamaran wajah otomatis (*face blurring*) bagi pihak ketiga dan audit trail pembukaan tayangan CCTV.
- **TKT 3–4 Menuju TKT 5–6**: Dirancang untuk validasi lapangan langsung bersama daycare mitra (Semarang & kota mitra lainnya).
