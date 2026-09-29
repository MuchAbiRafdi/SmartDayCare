# SmartDayCare AI

*Intelligent Child Development & Wellbeing Platform* — aplikasi web untuk mencatat aktivitas
harian anak di daycare dan mengubahnya menjadi insight perkembangan yang bisa dibaca orang tua
dan pengelola. Lima kemampuan utama: catatan aktivitas harian (aktivitas, makan, tidur, mood,
kehadiran & foto), komunikasi orang tua–daycare, kamera dengan hak akses yang disetujui admin,
dasbor analitik perkembangan dengan Insight & Rekomendasi AI, serta kepuasan & keterlibatan
orang tua. Ditambah fitur operasional: suhu tubuh, pindai piring makan → gizi, kualitas udara
ruang, kejadian, obat, serah terima, dan laporan — untuk tiga peran: **orang tua**, **pengasuh**,
**admin daycare**.

```
smartdaycare/
├── web/            Frontend  — TypeScript · Next.js 15 (App Router) · Tailwind CSS 4 · komponen gaya shadcn/ui (Radix)
├── api/            Backend   — Python 3.13 · FastAPI · Uvicorn · SQLAlchemy 2 (SQLite bawaan, PostgreSQL via URL)
├── ai/             Model pengenal makanan (PyTorch → ONNX + berkas .bin untuk peramban), lihat ai/README.md
├── deploy/         Produksi: docker-compose (Caddy HTTPS + web + api [+ MediaMTX]), Caddyfile, .env.example
├── docs/           PERANGKAT.md — cara menghubungkan sensor udara & kamera
├── scripts/        backup.sh — cadangan basis data manual
├── e2e/            Uji ujung-ke-ujung Playwright (tangkapan layar 1280 & 390 px)
├── dev.sh          Jalankan keduanya dalam mode pengembangan
├── start.sh        Jalankan build produksi
├── DESIGN.md       Arah desain (wajib dibaca sebelum mengubah UI)
└── legacy-static/  Situs statis lama (referensi; boleh dihapus)
```

## Menjalankan

Prasyarat: Node.js ≥ 20, Python ≥ 3.12.

```bash
# Pengembangan (API di :8000 dengan muat-ulang, web di :3000, /api diproksi oleh Next.js)
./dev.sh

# Produksi: next build + next start, uvicorn tanpa reload
./start.sh
```

Kedua skrip memasang dependensi yang belum ada (`pip install -r api/requirements.txt`,
`npm ci` di `web/`) dan membuat `api/.env` dari contohnya. Port bisa diganti lewat
`API_PORT`, `WEB_PORT`, `WEB_HOST`. Buka `http://localhost:3000`.

Memperbarui build tanpa mematikan layanan lama: `cd web && NEXT_DIST_DIR=.next-new npm run build`,
lalu hentikan `next start`, `rm -rf .next && mv .next-new .next`, dan mulai lagi (jeda ±3 detik).

Pemeriksaan mutu:
- API: `cd api && python -m pytest -q` (22 uji: sesi, CSRF, lingkup peran, alur pengasuh, piring,
  admin, pendaftaran, kode undangan, kode anak, pemulihan sandi, verifikasi email, pemberitahuan
  sesuai preferensi, perangkat sensor/kamera, pemantau udara (sensor terhenti), arsip anak).
- Frontend: `cd web && npm run typecheck && npm run lint`.
- Ujung-ke-ujung (butuh server hidup): `cd e2e && npm install && npm run install-browser && npm test`
  — 96 pemeriksaan: semua halaman dan alur (masuk/daftar, pindai piring dua tahap, catatan pengasuh,
  kelola akun admin, kode undangan & kode anak, arsip anak, perangkat sensor dengan token → status
  berubah langsung, halaman pemulihan sandi/verifikasi, preferensi, tampilan ponsel 390 px) dan
  menyimpan tangkapan layar ke `e2e/shots/`. Catatan: satu pemeriksaan foto contoh makan siang
  hanya berlaku setelah pukul 12.20 WIB (mengikuti jam nyata) dan dilewati sebelum itu.
- Aksesibilitas (butuh server hidup): `cd e2e && npm run a11y` — memindai 15 halaman/tab
  (publik + ketiga dasbor) dengan axe-core di lebar desktop dan ponsel (menu laci ikut dibuka);
  target: 0 pelanggaran WCAG 2.1 A/AA dan praktik terbaik.
- Pratinjau tersemat (opsional): `cd e2e && node embedded-check.mjs https://alamat-pratinjau` —
  membuka aplikasi di dalam `<iframe>` peramban sungguhan lewat proxy publik yang membuang cookie,
  lalu menjalankan masuk → dasbor → foto → muat ulang → keluar. Uji `npm test` juga mencakup
  skenario yang sama lewat proxy lokal (`strip-proxy.mjs`).

### Akun contoh (mode data contoh, `SD_SAMPLE_DATA=1` — bawaan)

Untuk daycare sungguhan pakai `SD_SAMPLE_DATA=0`: basis data mulai kosong, hanya menu & ambang
bawaan plus satu akun admin dari `SD_ADMIN_EMAIL`/`SD_ADMIN_PASSWORD` (bila kata sandi kosong, kata
sandi sementara dicetak di log saat pertama jalan dan wajib diganti saat masuk). Lihat bagian
**Produksi** di bawah.

| Peran | Email | Kata sandi |
|---|---|---|
| Orang tua (Kirana) | andi.lestari@gmail.com | Kirana2026 |
| Orang tua (Bima) | budi.wijaya@gmail.com | Bima2026 |
| Orang tua lain | dedi.putri / agus.nugraha / rina.sari / joko.saputra @gmail.com | Salsa2026 / Rizky2026 / Nadia2026 / Dimas2026 |
| Pengasuh | ratna.dewi@ceriaananda.id · sari.puspita@ceriaananda.id | Ratna2026 · Sari2026 |
| Admin daycare | hendra@ceriaananda.id | Hendra2026 |

Kode anak untuk menautkan akun orang tua baru: `KA-2201` … `KA-2206`.
Kode undangan awal saat mendaftar: `CERIA-STAF-2026` (pengasuh), `CERIA-ADMIN-2026` (admin).

### Kode anak & kode undangan — cara kerjanya

| | Kode anak (`KA-####`) | Kode undangan (`STAF-…` / `ADMIN-…`) |
|---|---|---|
| Untuk siapa | Orang tua/wali | Calon pengasuh atau admin |
| Dibuat oleh | Otomatis saat admin **Daftarkan anak** (Dasbor admin → Akun & kode anak) | Admin lewat **Buat kode** (peran, masa berlaku 3–90 hari, 1/3/10/tanpa batas pemakaian) |
| Dipakai di | Kolom *Kode anak* saat mendaftar (opsional) atau kartu *Tautkan anak* di Beranda | Kolom *Kode undangan* saat mendaftar (wajib) — peran harus sama dengan kode |
| Akibatnya | Akun tertaut ke anak itu → dasbor, kamera, gizi, laporan anak terbuka | Akun dibuat dengan peran tersebut; pemakaian & nama pendaftar tercatat |
| Pengaman | Acak (bukan berurutan); ≤ 4 wali per anak; 8 percobaan salah / 15 menit per akun (tercatat di riwayat akses); admin dapat **Kode baru** (kode lama hangus, tautan lama tetap) dan **lepas tautan** | Kedaluwarsa & habis otomatis; admin dapat **Nonaktifkan** kapan saja; kode awal fasilitas tanpa batas diberi peringatan agar dinonaktifkan setelah tim inti terdaftar |

Alur ringkas: admin mendaftarkan anak → menerima kode → menyampaikannya ke wali → wali mendaftar/menautkan →
admin melihat siapa yang tertaut (dan kapan) di tabel **Anak & kode anak**. Staf: admin membuat kode berjangka →
staf mendaftar dengan kode → kode hangus → admin melihat "dipakai oleh …" di daftar kode.

### Jika tidak bisa masuk

| Gejala | Penyebab & solusi |
|---|---|
| Masuk berhasil tetapi kembali ke form (versi lama) | Cookie tidak sampai ke server — mis. proxy pratinjau yang membuang header `Cookie`, atau bingkai lintas situs. Sekarang ditangani otomatis: setelah masuk, klien memeriksa apakah cookie diterima server; bila tidak, sesi dibawa lewat header `X-Session` dan disimpan di penyimpanan situs peramban. Tidak perlu tab baru. |
| "Layanan sedang tidak dapat dihubungi" | Server API belum hidup atau `API_URL` di `web/.env.local` salah. Jalankan `./dev.sh` / `./start.sh` dan cek `http://localhost:8000/api/health`. |
| "Terlalu banyak percobaan" | Batas 10 percobaan/menit per alamat IP (`SD_LOGIN_PER_MINUTE`). Tunggu semenit. |
| "Akun dikunci sementara" | 5 kali sandi salah → terkunci 15 menit (`SD_LOCKOUT_FAILS`, `SD_LOCKOUT_MINUTES`). Admin dapat mengatur ulang sandi dari **Akun & kode anak**. |
| Sandi contoh tidak diterima | Basis data sudah pernah diubah (mis. sandi diganti). Hentikan API, hapus `api/data/smartdaycare.db*`, jalankan lagi — akun contoh dibuat ulang. |

## Alur halaman

`/` (beranda) → `/login` · `/register` → `/dashboard` (pilih dasbor sesuai peran) →
`/parent` · `/caregiver` · `/admin` → `/account` (akun & privasi) · `/help` (bantuan, privasi, syarat).

- Peran salah → dialihkan ke `/dashboard?denied=…`; tanpa sesi → `/login?next=…`.
- Admin dapat membuka semua dasbor; pengasuh hanya dasbor pengasuh; orang tua hanya dasbor orang tua.

## Arsitektur

```
Peramban ──HTTPS──▶ Next.js (web)  ── /api/* rewrite ──▶ FastAPI (api) ──▶ SQLite / PostgreSQL
   │                    │  Server Components merender cuplikan awal (GET /api/state) dengan cookie sesi
   │                    │  Client Components menyegarkan lewat SSE (GET /api/events) + fetch ringan
   └── kamera perangkat: pengenalan piring berjalan di peramban (web/src/lib/vision.ts), foto kecil
       (≤ 240 px JPEG, ≤ 160 KB) baru dikirim setelah pengasuh memeriksa hasilnya.
```

**Frontend (`web/`)**
- App Router; halaman terlindung adalah *server component* (`requireState`) yang mengambil status
  ter-scope peran lalu menyerahkannya ke `LiveProvider` (klien). Tidak ada spinner: HTML pertama
  sudah berisi data.
- `src/lib/derive.ts` menurunkan semua angka tampilan (kehadiran, suhu, gizi, udara) dari satu
  objek status — dasbor orang tua, pengasuh, dan admin selalu konsisten.
- `src/lib/vision.ts` — pengenal makanan di perangkat: cari piring, kelompokkan area makanan
  berdasarkan warna & tekstur, **periksa tiap kelompok dengan jaringan saraf kecil**
  (`src/lib/foodnet.ts`, bobot `public/models/food-patch-v3.bin` — 429 foto makanan sungguhan, 77
  di antaranya tidak pernah dilihat model; membuang bagian bukan-makanan, membuang kelompok warna
  yang menurut model hampir pasti bukan kelas itu, dan mengoreksi kelas bila yakin, dengan ambang
  per kelas yang dibaca dari berkas model itu sendiri; peluang sudah dikalibrasi dan bingkai
  diperbesar dulu ke skala latih model), lalu perkirakan berat dari luas relatif diameter piring
  (pengaturan admin). Bila v3 belum ada, peramban memuat v2.
  Keyakinan tiap bagian (badge tinggi/sedang/rendah) mengikuti presisi kelas itu pada foto uji —
  angka yang tersimpan di berkas model — dan peluang model, bukan besarnya bidang makanan; tanpa
  berkas model semua bagian sengaja diberi badge rendah. Tahap yang
  tampil di layar adalah tahap yang benar-benar dijalankan; bila model tidak termuat, layar
  mengatakannya. Angka kualitas model dan cara mengukurnya ada di `ai/README.md`.
- `src/components/shared/camera-view.tsx` — gambar contoh (tanpa kamera), foto berkala dari kamera
  terdaftar (diperbarui tiap 3 detik), atau siaran HLS/MJPEG (`hls.js` dimuat saat perlu) dengan
  status terhubung/terputus yang jujur.
- Komponen UI gaya shadcn/ui ditulis di `src/components/ui/*` di atas primitif Radix
  (dialog, toast, label); Tailwind 4 dengan token warna di `globals.css`.
- Halaman terlindung memakai `SessionGate` (`src/components/shell/session-gate.tsx`): bila cookie
  sesi terbaca di server, halaman dirender penuh di server (tanpa jeda); bila tidak, klien memakai
  sesi yang tersimpan di peramban (jalur header) dan mengambil status sendiri; tanpa keduanya
  pengguna diarahkan ke halaman masuk. Data sendiri selalu diverifikasi API pada tiap permintaan.
- Keamanan sisi web: header CSP, `X-Content-Type-Options`, `Referrer-Policy`,
  `Permissions-Policy`, HSTS & `frame-ancestors 'none'` di produksi (`next.config.ts`).

**Backend (`api/`)**
- `app/routers/auth.py` masuk/daftar/keluar/keluar-semua, lupa sandi → tautan `/reset` (30 menit,
  sekali pakai), verifikasi email `/verify` (48 jam) + kirim ulang; `state.py` status ter-scope
  peran + data publik; `log.py` catatan (tiba, suhu, catatan, pulang, obat, kejadian, serah terima,
  piring disajikan, catatan makan, foto) — setiap catatan memicu pemberitahuan ke orang tua sesuai
  preferensinya; `admin.py` pengaturan, profil fasilitas, menu, akun, reset sandi, arsip/pulihkan/
  hapus anak, kotak keluar pesan (coba lagi, pesan percobaan, ringkasan harian sekarang), ekspor CSV;
  `devices.py` kiriman sensor/kamera dengan token perangkat + pengelolaan perangkat; `account.py`
  profil, sandi, preferensi, tautkan anak, hapus akun, tiket bantuan; `events.py` SSE.
- `app/notify.py` kotak keluar (tabel `messages`) + pengirim email (SMTP/Resend) dan WhatsApp
  (Cloud API/Fonnte) di thread latar dengan percobaan ulang; tanpa konfigurasi pengirim, pesan
  tetap tercatat berstatus *pengirim belum diatur* dan admin melihatnya. `app/alerts.py`
  pemberitahuan per catatan sesuai preferensi orang tua, ringkasan harian 17.30, token pemulihan/
  verifikasi. `app/backup.py` cadangan SQLite harian (02.00, simpan 14 hari).
- `app/logic.py` perhitungan gizi per 100 g, persentase porsi, status suhu; `app/seed.json` data
  fasilitas contoh (anak, ruang, kamera, sensor, menu, FAQ).
- `app/events.py` + `app/devices.py`: pembacaan udara per ruang membawa **sumber** (`sensor`
  sungguhan, `builtin` nilai contoh, `stale` sensor berhenti mengirim > 10 menit, `none` belum ada
  sensor) dan disiarkan lewat SSE. Begitu sensor/kamera terdaftar (`docs/PERANGKAT.md`), nilai
  contoh ruangan itu digantikan otomatis; tanpa data, tidak ada status udara palsu.

## Keamanan (ringkas)

| Ancaman | Penanganan |
|---|---|
| Pencurian sesi | Cookie `sd_session` **HttpOnly**, `Secure` di HTTPS, SameSite=Lax; token acak 256-bit disimpan sebagai **hash** di basis data; kedaluwarsa 12 jam / 30 hari ("ingat saya"); keluar dari semua perangkat & ganti sandi menutup sesi lain. **Jalur cadangan:** bila cookie terbukti tidak sampai ke server (diperiksa sekali setelah masuk), token yang sama dibawa lewat header `X-Session` dan disimpan di `sessionStorage` (atau `localStorage` untuk "ingat saya"); token tidak pernah masuk URL atau log. |
| Tebak kata sandi | Hash **scrypt** bergaram; batas 10 percobaan/menit per IP; **kunci akun 15 menit** setelah 5 kali gagal; pesan galat tidak membocorkan apakah email terdaftar. |
| CSRF | Sesi lewat cookie: semua metode pengubah data wajib header `X-CSRF-Token` yang sama dengan cookie `sd_csrf` (double-submit) **dan** lolos pemeriksaan asal: `Sec-Fetch-Site` (`cross-site` ditolak), header khusus `X-Requested-With: SmartDaycare` (tidak bisa ditambahkan situs lain tanpa izin CORS), atau `Origin`/`Referer` yang cocok dengan host publik. Sesi lewat header `X-Session` kebal CSRF secara desain (peramban tidak pernah mengirimnya otomatis), sehingga hanya batas laju yang berlaku. |
| Akses lintas peran / lintas keluarga | Semua endpoint memeriksa peran di server; pembatasan data dilakukan di server, bukan hanya disaring di antarmuka: orang tua hanya menerima anak yang tertaut, kejadian & catatan obat anaknya sendiri, dan kamera yang dibuka untuk orang tua (kamera `Dapur` tidak pernah dikirim); serah terima antar shift hanya untuk staf, jejak audit hanya untuk admin; foto piring hanya untuk keluarga anak tersebut. |
| Injeksi & payload berbahaya | Validasi Pydantic (panjang, rentang angka, enum); foto harus JPEG data-URL ≤ 160 KB; ORM berparameter. |
| XSS / clickjacking | React escaping + CSP ketat, `frame-ancestors 'none'` & `X-Frame-Options: DENY` di produksi. |
| Penyalahgunaan formulir publik | Tiket bantuan & lupa sandi dibatasi laju per IP dan hanya same-origin. |
| Jejak akses | Setiap pembukaan kamera tercatat (siapa, kamera mana, kapan) dan dapat diekspor CSV; catatan akun (masuk, reset sandi, nonaktif) tersimpan. |
| Retensi data | Foto piring dihapus otomatis setelah 3 hari, catatan harian setelah 400 hari — cukup untuk laporan semester beserta periode pembandingnya (`SD_PHOTO_KEEP_DAYS`, `SD_LOG_KEEP_DAYS`); anak yang keluar diarsipkan (hilang dari semua dasbor, kode hangus) dan bisa dihapus permanen beserta catatannya. |
| Perangkat | Sensor/kamera memakai token acak per perangkat (disimpan sebagai hash, ditampilkan sekali); nilai di luar rentang wajar ditolak; ≤ 60 kiriman/menit; menonaktifkan perangkat mematikan tokennya seketika. Siaran kamera hanya lewat domain sendiri (`/stream/*`) dan diperiksa `forward_auth` (pengguna masuk; orang tua hanya kamera yang dibuka untuk orang tua). |
| Tautan email | Token pemulihan (30 menit) dan verifikasi (48 jam) acak 256-bit, disimpan sebagai hash, sekali pakai; kata sandi lemah ditolak sebelum token dipakai. |

Dokumentasi API interaktif tersedia di `http://localhost:8000/api/docs` (dimatikan saat `SD_ENV=production`).

## Konfigurasi

`web/.env.example` → `web/.env.local`; `api/.env.example` → `api/.env` (dibuat otomatis oleh `dev.sh`/`start.sh`, dibaca uvicorn lewat `--env-file`; variabel lingkungan shell tetap lebih diutamakan). Yang penting:

| Variabel | Bawaan | Keterangan |
|---|---|---|
| `API_URL` (web) | `http://127.0.0.1:8000` | Tujuan proksi `/api/*` dan pengambilan data di server Next.js |
| `ALLOW_EMBED` (web, saat build) | kosong | `1` hanya bila halaman harus tampil di dalam iframe situs lain |
| `SD_DATABASE_URL` | SQLite di `api/data/` | `postgresql+psycopg://…` untuk PostgreSQL |
| `SD_COOKIE_SAMESITE` | `lax` | `none` hanya untuk pratinjau tersemat (cookie otomatis `Secure` + `Partitioned`, sehingga tetap tersimpan di peramban yang memblokir cookie pihak ketiga) |
| `SD_ALLOWED_ORIGINS` | kosong | Origin tambahan (dipisah koma) bila web dan API di domain berbeda |
| `SD_ENV` | `development` | `production` mematikan dokumentasi API |
| `SD_TIMEZONE` | `Asia/Jakarta` | Batas "hari ini" untuk catatan |
| `SD_SAMPLE_DATA` | `1` | `0` = produksi: tanpa data contoh, satu admin awal dari `SD_ADMIN_EMAIL`/`SD_ADMIN_PASSWORD` |
| `SD_PUBLIC_URL` | kosong | Alamat situs untuk tautan di email/WhatsApp dan pemeriksaan alamat siaran |
| `SD_SMTP_*` / `SD_RESEND_API_KEY`, `SD_EMAIL_FROM` | kosong | Pengirim email (salah satu) |
| `SD_WA_PROVIDER`, `SD_WA_TOKEN`, `SD_WA_PHONE_ID`, `SD_WA_TEMPLATE` | kosong | Pengirim WhatsApp: `meta` (Cloud API) atau `fonnte` |
| `SD_BACKUP_DIR`, `SD_BACKUP_KEEP_DAYS` | `api/data/backups`, 14 | Cadangan SQLite harian |
| `SD_MQTT_URL`, `SD_MQTT_TOPIC` | kosong | Jembatan MQTT opsional untuk sensor |

Daftar lengkap dan penjelasan tiap variabel ada di `api/.env.example`.

## Produksi

Semua yang dibutuhkan ada di `deploy/`:

```bash
cd deploy
cp .env.example .env        # isi DOMAIN, SD_ADMIN_EMAIL, SD_SECRET_KEY, pengirim email/WA
docker compose up -d --build
docker compose logs api | grep "kata sandi sementara"   # bila SD_ADMIN_PASSWORD dikosongkan
```

- **Caddy** menerbitkan sertifikat HTTPS otomatis untuk `DOMAIN`, meneruskan `/api/*` ke FastAPI,
  `/stream/*` ke MediaMTX (setelah `forward_auth`), sisanya ke Next.js. Web dibangun `standalone`
  (citra ±150 MB), API berjalan sebagai pengguna non-root dengan healthcheck.
- **Data** tersimpan di volume `api-data` (basis data + cadangan harian di `backups/`). Cadangan
  manual: `./scripts/backup.sh [folder]`. Pulihkan: hentikan API, ganti `smartdaycare.db` dengan hasil
  `gunzip` cadangan, mulai lagi.
- **Kamera & sensor**: `docs/PERANGKAT.md` (token perangkat, contoh ESP32/ffmpeg, MediaMTX untuk RTSP →
  HLS, MQTT).
- **Tanpa Docker**: `./start.sh` (uvicorn + `next start`) di balik reverse proxy apa pun; set
  `SD_ENV=production`, `SD_PUBLIC_URL`, dan `SD_SECRET_KEY`.

## Fitur per dasbor

- **Orang tua** — Beranda (sapaan, kartu anak, mood hari ini, ringkasan aktivitas/makan/tidur/
  kehadiran, jadwal hari ini, dokumentasi terbaru), Aktivitas Harian, Makan (catatan per waktu
  makan + dua foto piring & gizi), Tidur, Mood, Kehadiran, Dokumentasi (foto/video kegiatan),
  Profil Anak, Pesan (guru kelompok, admin, grup orang tua), Pengumuman, Umpan Balik (penilaian
  bintang + komentar, dibalas admin), Kamera (ajukan akses → disetujui admin → lihat; anak lain
  diburamkan, akses tercatat), Kesehatan (suhu, obat, alergi, kontak darurat), Perkembangan
  (grafik tren + Insight & Rekomendasi AI), Laporan (mingguan/bulanan/semester, cetak/PDF).
- **Pengasuh** — Beranda (anak di ruang, catat cepat), Aktivitas Harian (8 jenis + catatan &
  durasi), Makan (waktu, menu, porsi), Tidur (mulai/bangun, kualitas), Mood (6 pilihan, pagi/
  sore), Kehadiran & Foto (status hadir/pulang, unggah foto/video), Pindai Piring (kamera/foto →
  koreksi → simpan disajikan → pindai sesudah makan → kirim ke orang tua), Obat, Kejadian
  (+ tandai ditangani), Serah Terima, Pesan, Kamera & udara.
- **Admin** — Beranda (ringkasan operasional & udara), Dashboard perkembangan per anak (KPI,
  tren aktivitas, mood, tidur, makan, analitik per jenis, Insight & Rekomendasi AI, laporan
  perkembangan dengan Download PDF), Analitik Aktivitas · Mood Tracker · Pola Tidur · Pola Makan ·
  Kehadiran (detail per pola + tabel harian), Laporan Perkembangan, Rekomendasi AI (dampak & usaha
  tiap saran, penilaian 👍/👎 yang mengurutkan saran berikutnya, panel kualitas pemindai piring), Pesan &
  pengumuman, Kepercayaan Orang Tua (kepuasan, respon feedback, engagement, trust score, tren per
  minggu, balas feedback, ringkasan harian otomatis pukul 16.00 dapat dimatikan/diubah), Akses
  Kamera (setujui/tolak/cabut permintaan orang tua dengan masa berlaku), Perangkat & Sensor,
  Catatan Harian, Riwayat Akses (CSV), Akun & Kode Anak, Permintaan Bantuan, Pengaturan.
- **Akun & privasi** — profil, ganti kata sandi, sesi, preferensi pemberitahuan (WhatsApp/email;
  pemberitahuan peramban belum tersedia dan ditandai demikian), verifikasi email, tautkan anak,
  hapus akun.
- **Pemulihan akun** — Lupa kata sandi → email/WhatsApp berisi tautan `/reset` (30 menit); pendaftar
  baru menerima tautan `/verify` dan pengingat di Beranda sampai email terverifikasi.

### Insight & Rekomendasi AI — cara kerjanya

`api/app/analytics.py` (+ `stats.py`) merangkum catatan pengasuh per hari (aktivitas per jenis,
mood, menit tidur, porsi makan, jam datang, kejadian, menu, kehadiran), lalu menghasilkan insight
bertipe **tren / pola / anomali / positif** dengan bukti angka dan tingkat keyakinan
(tinggi/sedang/rendah, mengikuti jumlah data dan besar efek). Pembandingnya ada tiga:

- **periode sebelumnya** yang sama panjang (aktivitas ≥ 20 %, mood ≥ 0,4 poin, tidur/makan ≥ 15 %);
- **kebiasaan anak sendiri** hingga 8 minggu ke belakang, diukur sebagai **median ± sebaran
  tahanencil (MAD)** — bukan rata-rata ± simpangan — supaya satu hari buruk tidak menggeser batas
  "normal": hari yang menyimpang ≥ 1,8 sebaran menjadi anomali, beda rata-rata periode yang bermakna
  (uji t Welch ≥ 2, dikuatkan Mann–Whitney dan besaran efek Hedges g bila searah) memperkuat tren,
  garis tren yang konsisten (r ≥ 0,6, dan kemiringan Theil–Sen yang tidak tertarik satu hari aneh)
  menjadi "menurun/meningkat bertahap", dan tiga hari hadir terakhir yang berturut-turut di bawah
  batas menjadi **peringatan dini** dengan rekomendasi menghubungi orang tua hari itu;
- **anak lain di daycare** pada periode yang sama, hanya sebagai agregat anonim (≥ 3 anak,
  selisih > 1 sebaran kelompok, posisi dinyatakan sebagai persentil) — pembanding, bukan penilaian.

Pola tambahan: hari dalam minggu yang konsisten lebih rendah (≥ 3 minggu, ≥ 70 % minggu),
keterkaitan antar catatan pada hari yang sama (korelasi Pearson ≥ 0,45 pada ≥ 10 hari; mis. lama
tidur siang ↔ mood sore) — kalimatnya memakai "berkaitan", bukan sebab-akibat — **titik ubah**
(CUSUM: "berubah sejak <tanggal>", hanya bila perpindahannya ≥ 0,8 sebaran, bertahan ≥ 3 hari, dan
tanggalnya masih dalam 21 hari terakhir), kelompok gizi yang absen dari menu, dan geseran jam datang.

Di luar kartu insight ada **skor pantauan** 0–100 untuk staf: jumlah tertimbang sinyal yang benar-benar
menyala (mood rendah tiga hari, porsi di bawah setengah, tidur jauh di bawah kebiasaan, suhu ≥ 37,5 °C,
kejadian berat, hari absen) — tiap komponennya ditampilkan beserta angkanya, dan skor ini tidak
diperlihatkan ke orang tua sebagai angka. Rekomendasi disebut alasannya (insight pemicunya) dan ditandai
dampak (1–3) serta usaha (0–3); admin bisa menilai 👍/👎 lewat `/api/analytics/reco-feedback`, dan
penilaian itu hanya menggeser urutan saran berikutnya (pengali terkunci 0,7–1,3) — tidak pernah menambah
klaim baru. Profil perkembangan (sosial, motorik, kognitif, emosi) dihitung dari proporsi jenis aktivitas
dan kestabilan mood. Semua angka bisa dilacak ke tabel harian di menu detail; ini bukan asesmen klinis dan
kalimat itu tampil di panel. Aturan-aturan ini diuji di `api/tests/test_insights.py`.

Semua perubahan tersimpan di basis data dan tersiar langsung ke dasbor lain yang sedang terbuka.

### Sinkron antar dasbor — aturan yang dipakai bersama

- Ubin ringkasan orang tua (Aktivitas x/8, Makan, Tidur, Kehadiran), strip anak di Beranda
  pengasuh, dan baris "hari ini" di analitik admin membaca catatan yang sama. Mencatat ulang
  waktu makan yang sama (mis. Snack Sore dua kali) menggantikan catatan lama, bukan menambah
  hitungan; butir jadwal dasar hilang begitu catatan nyata untuk jenis itu ada; jam datang
  terjadwal yang sudah lewat dihitung hadir walau catatan datang belum dibuat; pemeriksaan suhu
  rutin yang sudah lewat jamnya ikut ke suhu tertinggi hari itu.
- Ringkasan harian pukul 16.00 ke orang tua menyebut angka nyata hari itu (kegiatan, porsi per
  waktu makan, tidur, mood, suhu, kejadian) — bukan kalimat umum.
- Pengumuman admin tampil di tab **Pengumuman** orang tua *dan* sebagai utas Pengumuman di Pesan.
- Halaman Tidur, Mood, dan Kehadiran orang tua menampilkan tabel 7 hari (durasi & kualitas tidur;
  mood pagi & siang-sore; jam datang, suhu tertinggi, jumlah kegiatan) dari analitik yang sama
  dengan dasbor admin.
- Data contoh menyediakan 9 minggu catatan ke belakang sehingga rentang **Bulanan** punya periode
  pembanding; retensi catatan 400 hari agar laporan **Semester** dan pembandingnya tidak terpangkas
  pembersihan berkala.
- Pemeriksaan otomatis: `e2e/sync.mjs` membuka tiga sesi (orang tua, pengasuh, admin) sekaligus,
  mencatat dari pengasuh, lalu memastikan angka di ketiga dasbor dan di API analitik sama tanpa
  muat ulang (20 pemeriksaan).
