# DESIGN.md — SmartDayCare AI (Next.js + FastAPI)

Dokumen arah desain. Wajib dibaca sebelum mengubah UI.
Anti-Slop Framework v3.2.18 dipakai sebagai filter selama pengerjaan (mode DURING).
Produk ini dipakai orang tua dan staf daycare: bahasa sederhana, tanpa istilah teknis,
tanpa label demo. Sejak versi ini tampilan mengikuti mockup lima tema (Tema 1–5) yang
diberikan pemilik produk; mockup itulah acuan bentuk, dokumen ini acuan aturannya.

## 1. Identitas produk

SmartDayCare AI — *Intelligent Child Development & Wellbeing Platform*. Kesan: rapi, terang,
ramah, dapat dipercaya. Warna dipakai sebagai penanda peran dan jenis data, bukan hiasan:
biru untuk aplikasi harian (orang tua & pengasuh), ungu untuk dasbor analitik admin, hijau
untuk percakapan, biru tua untuk kamera, oranye untuk kepercayaan & keterlibatan.

Kalimat uji: seorang ibu yang baru pertama kali membuka situs ini langsung paham apa yang
didapat anaknya, tanpa perlu tahu apa pun tentang teknologi di baliknya.

## 2. Palet (token di `web/src/app/globals.css`)

- Dasar: `bg #F5F7FB`, `surface #FFFFFF`, `line #E6E9F2`, `wash #EEF3FE`.
- Tinta: `ink #1B2340`, `ink-2 #3B4363`, `muted #667089`, `faint #9098AD`.
- Aksen aplikasi (Tema 1): biru `#2F6FED` (skala `teal-*` di kode = biru; nama kelas lama
  dipertahankan agar komponen tidak berubah). Sidebar biru, item aktif putih dengan teks biru.
- Aksen admin (Tema 4): `.role-admin` menukar aksen menjadi ungu `#6C5CE7`; sidebar ungu.
- Jenis data (ubin & grafik, `TONE_CLASS` di `lib/records.ts`): aktivitas hijau `#22C55E`,
  makan merah muda/oranye `#F97316`, tidur ungu `#8B5CF6`, mood kuning `#F59E0B`,
  kehadiran biru `#2F6FED`, foto biru muda.
- Tema 2 percakapan: gelembung lawan bicara abu `#F1F3F8`, gelembung sendiri hijau `#DCFCE7`.
- Tema 3 kamera: bingkai `#111A2E`, tanda LIVE merah `#EF4444` hanya saat siaran benar-benar ada.
- Tema 5 kepercayaan: oranye `#F59E0B` untuk bintang & tren kepuasan; hijau/abu/merah untuk
  label Positif/Netral/Negatif.
- Status selalu berpasangan dengan label teks: `ok #15803D`, `warn #B45309`, `danger #B91C1C`.
- Larangan: gradasi biru-ungu, neon, glassmorphism, grid blueprint, angka tanpa sumber.

## 3. Gradasi & bidang berwarna yang diizinkan (tercatat)

1. `.hero-bg` — putih → `#F5F7FB` dengan cahaya radial biru sangat tipis di kanan atas.
   Latar hero beranda publik; satu-satunya "cahaya" di situs.
2. `.side-bg` — biru `#2F6FED → #2A5FD0` (admin: `#6C5CE7 → #5B4BD1`), vertikal. Bilah sisi;
   menandai peran yang sedang dibuka.
3. `Button variant="primary"` — biru pekat (admin: ungu pekat), tanpa gradasi.
4. `.summary-tile` — bidang pastel per jenis data (hijau/merah muda/ungu/biru) di Ringkasan
   Aktivitas Hari Ini; teks tetap tinta gelap ≥ 4,5:1.
5. `.band-wash` — `#EEF3FE → transparan`. Pemisah seksi lembut di halaman publik.
6. `.kpi` — putih rata dengan ikon berlatar pastel; tanpa bayangan.

Gradasi/bidang baru wajib dicatat fungsinya di sini, atau ditolak.

## 4. Tipografi

- Inter (paket `@fontsource-variable/inter`, disajikan dari server sendiri — tanpa CDN).
- Angka data tabular (`font-feature-settings: "tnum"`). Mono hanya untuk kode, waktu, ID.
- Satu H1 per halaman; eyebrow huruf kapital kecil bertick teal.

## 5. Bahasa antarmuka (aturan produksi)

- Kalimat pendek, kata sehari-hari. Pengguna tidak pernah melihat nama model, nama server,
  protokol, singkatan teknik, satuan latensi, atau label demo/prototipe/simulasi.
- Contoh: "Koneksi aman" bukan "AES-256"; "Kamera 1" bukan "CAM-01 · 1080p"; keyakinan
  ditampilkan sebagai lencana **tinggi / sedang / rendah**, bukan angka.
- Angka ringkasan wajib dapat dilacak ke tabel di bawahnya (persentase porsi → tabel per menu).
- Status kosong selalu menjelaskan langkah lanjut ("Tidak ada. Pindai piring saat disajikan agar
  muncul di sini.").
- Sumber setiap angka dinyatakan di tempat: "Dihitung dari dua foto piring … oleh Ratna Dewi",
  "Pembacaan setiap beberapa detik dari sensor tiap ruang · terakhir 09.08 WIB".
- Masalah lingkungan (cookie tidak diteruskan proxy, dibuka di dalam bingkai) diselesaikan oleh
  aplikasi sendiri, bukan dilempar ke pengguna: tidak ada petunjuk "buka di tab baru", tidak ada
  pesan tentang cookie. Formulir masuk hanya punya dua hasil: berpindah ke dasbor, atau satu kalimat
  galat yang bisa ditindaklanjuti (sandi salah, akun terkunci, layanan tidak terhubung).

## 6. Komponen

Komponen gaya shadcn/ui ditulis sendiri di `web/src/components/ui/` di atas primitif Radix:
`Button` (default | primary | ghost | dark | danger; sm | icon), `Badge` (ok | warn | danger |
neutral | accent, opsi titik), `Panel/PanelHead/PanelBody`, `Note`, `Empty`, `Kv`, `Field/Input/
Select/Textarea/Checkbox`, `Dialog`, `Toast`, `Metric`. Kelas bersama (`.panel`, `.kpi`,
`.summary-tile`, `.tile-btn`, `.photo-grid`, `.bubble-them/.bubble-me`, `.toggle`, `.table`,
`.table-wrap`, `.field`) ada di `globals.css` agar semua dasbor seragam.

Pola dari mockup yang dipakai berulang:
- **Ubin pilihan** (`.tile-btn`): ikon di atas label, grid 4–5 kolom, terpilih = garis + latar
  aksen tipis. Dipakai untuk jenis aktivitas, menu makan, mood, kualitas tidur.
- **Pil pilihan**: waktu makan (Sarapan/Snack Pagi/Makan Siang/Snack Sore), porsi, rentang
  laporan (Mingguan/Bulanan/Semester).
- **Kartu KPI** (`.kpi`): ikon pastel kiri, label kecil, angka besar, satuan kecil di samping.
- **Grafik** (`components/charts/charts.tsx`): batang bulat, garis mood dengan emoji di sumbu,
  batang bertumpuk per waktu makan, multi-garis per jenis aktivitas. Semua SVG sendiri, sumbu
  `#9098AD`, kisi `#E6E9F2`, label tanggal `d/M`, desimal pakai koma. Rentang > 14 hari
  hanya menampilkan hari sekolah; > 60 hari dirangkum per minggu — ditulis di keterangan grafik.
- **Sapaan**: "Halo, <nama depan>! 👋" + tanggal lengkap, hanya di Beranda.

Aturan:
- Radius 14 px untuk panel/kartu, 10 px untuk ubin & masukan, pil untuk lencana dan tab.
- Bayangan hanya: header publik, dialog/toast. Panel konten rata dengan garis `line`.
- Fokus keyboard terlihat (`focus-visible` cincin aksen); kontras teks ≥ 4,5:1.
- Tanpa spinner halaman: server component sudah membawa data; tombol menampilkan status
  ("Menyimpan…") hanya selama permintaan berlangsung.
- Gerakan minimal; animasi dimatikan pada `prefers-reduced-motion`.

## 7. Kerangka tata letak

- **Publik** (`/`, `/help`): header tipis, hero dua kolom (merek + kartu ringkasan hari ini
  dari data sungguhan), seksi bertumpuk lebar maks. 1160 px.
- **Autentikasi** (`/login`, `/register`): dua kolom — panel kiri biru berisi ringkasan
  fasilitas, kolom kanan formulir 520 px; di bawah 900 px panel kiri disembunyikan.
- **Aplikasi** (`/dashboard`, `/parent`, `/caregiver`, `/admin`, `/account`): `AppShell` =
  sidebar berwarna 248 px (merek, menu berkelompok, pengguna, Keluar) + topbar putih (judul
  halaman, sub-judul, ikon pesan & lonceng dengan jumlah belum dibaca) + isi di atas `bg`.
  Di bawah 1024 px sidebar menjadi laci dan menu menjadi strip tab yang dapat digulir; tab
  mengikuti hash URL (`/parent#makan`) sehingga tautan dari pemberitahuan tetap tepat.
- **Peran & menu** (mengikuti mockup):
  - Orang tua (Tema 1, biru): Beranda · Aktivitas Harian · Makan · Tidur · Mood · Kehadiran ·
    Dokumentasi · Profil Anak · Pesan · Pengumuman · Umpan Balik · Kamera · Kesehatan ·
    Perkembangan · Laporan · Pengaturan.
  - Pengasuh (Tema 1, biru, fungsi pencatatan): Beranda · Aktivitas Harian · Makan · Tidur ·
    Mood · Kehadiran & Foto · Pindai Piring · Obat · Kejadian · Serah Terima · Pesan ·
    Kamera & Udara.
  - Admin (Tema 4, ungu): Beranda · Dashboard · Analitik Aktivitas · Mood Tracker · Pola Tidur ·
    Pola Makan · Kehadiran · Laporan Perkembangan · Rekomendasi AI · Pesan · Kepercayaan
    Orang Tua · Akses Kamera · Perangkat & Sensor · Catatan Harian · Riwayat Akses · Akun &
    Kode Anak · Permintaan Bantuan · Pengaturan.

Aturan isi:
- Grid memakai `minmax(0,1fr)`; anak grid `min-width: 0` (aturan dasar) agar tabel lebar tidak
  mendorong halaman — tabel selalu di dalam `.table-wrap` (gulir horizontal).
- Kolom sempit (≈300 px) berisi daftar, bukan tabel banyak kolom.
- Setiap panel diawali `PanelHead` (judul + satu kalimat + aksi kanan yang boleh melipat).
- Diuji pada 1366/1280 px dan 390 px tanpa gulir horizontal halaman.

## 8. Real-time yang jujur

- Yang benar-benar hidup: jam, linimasa yang bertambah saat waktunya tiba, pembacaan udara
  (deret waktu dari server), pemberitahuan lintas dasbor lewat SSE, lonceng.
- Setiap angka udara membawa sumbernya: **Sensor** (perangkat terdaftar), **Nilai contoh**
  (belum ada sensor — ditulis apa adanya), **Sensor terhenti** (tidak mengirim > 10 menit),
  atau kosong. Kamera juga: "Gambar contoh", "Foto berkala", atau siaran dengan status
  terhubung/terputus. Tidak ada titik hijau "online" tanpa data di baliknya.
- Pesan ke orang tua (WhatsApp/email) punya kotak keluar yang terlihat admin: terkirim, gagal
  (dengan alasan), atau *pengirim belum diatur*. Preferensi "pemberitahuan peramban" belum
  tersedia dan ditandai demikian di halaman Akun, bukan disembunyikan.
- Yang tidak dipalsukan: tidak ada notifikasi acak, angka tanpa sumber, atau "proses AI" tiruan.
  Proses menampilkan tahap yang benar-benar dijalankan.
- **Insight & Rekomendasi AI** (`api/app/analytics.py`, statistik di `stats.py`) adalah lapisan
  analisis yang dapat dijelaskan: catatan pengasuh dirangkum per hari → dibandingkan dengan
  (1) periode sebelumnya yang sama panjang, (2) kebiasaan anak sendiri hingga 8 minggu
  (rata-rata ± simpangan → skor-z, uji t, garis tren, peringatan dini 3 hari), dan (3) agregat
  anonim anak lain → kalimat insight dengan bukti angka dan **tingkat keyakinan** → rekomendasi
  yang menyebut alasannya. Ambang tertulis di panel ("Cara kerja"). Setiap kartu menampilkan jenis
  (Tren/Pola/Anomali/Positif), bukti, keyakinan, dan rentang data. Korelasi ditulis "berkaitan",
  bukan sebab-akibat. Bukan asesmen klinis, dan kalimat itu tertulis di panel. Bila data kurang,
  panel mengatakannya — tidak mengarang.
- Akses kamera orang tua mengikuti persetujuan: tanpa persetujuan admin, kamera terkunci dan
  gambar tidak dikirim server; setiap pembukaan tercatat di Riwayat Akses.
- Perubahan dari satu pengguna (pengasuh mencatat suhu) muncul di dasbor pengguna lain (orang tua,
  admin) tanpa muat ulang — status diambil ulang dari server, bukan disusun ulang di klien.
- **Satu sumber angka untuk semua dasbor.** Ubin "Aktivitas x/8" dan "Makan 3x" orang tua, strip
  anak pengasuh, dan baris "hari ini" di analitik admin dihitung dari catatan yang sama dengan
  aturan yang sama: catatan makan untuk waktu makan yang sama dihitung sekali (catatan lama
  ditandai *diganti* dan disembunyikan), butir jadwal dasar (mis. "Camilan sore") tidak tampil
  lagi begitu catatan nyata untuk jenis itu ada, jam datang terjadwal yang sudah lewat = hadir,
  dan pemeriksaan suhu rutin yang sudah lewat jamnya ikut dihitung. Ini diuji lintas peran oleh
  `e2e/sync.mjs`.
- **Grafik yang tidak menyesatkan.** ≤ 14 hari digambar per hari; ≤ 60 hari per hari sekolah;
  lebih dari itu per minggu. Distribusi jenis aktivitas dirangkum per minggu begitu rentang lebih
  dari dua minggu (garis per hari tidak terbaca), dan minggu di tepi rentang yang baru berisi 1–2
  hari sekolah tidak digambar — kalau tidak, garisnya terlihat "anjlok" padahal minggunya belum
  selesai. Judul grafik menyebut satuannya ("jumlah per minggu penuh"). Pembanding "vs periode
  sebelumnya" hanya tampil bila periode sebelumnya benar-benar berisi catatan; kalau kosong
  tertulis "belum ada pembanding".
- **Unduh PDF** memakai dialog cetak peramban dan hanya mencetak kartu laporan (bukan sidebar
  dan menu); tidak ada berkas yang "dibuat AI".

## 9. Pemindai piring (kamera → menu → gizi → orang tua)

- Berjalan di perangkat pengasuh (`web/src/lib/vision.ts`): bingkai kamera atau foto dibaca
  pikselnya, piring dicari, area makanan dikelompokkan berdasarkan warna & tekstur, berat
  diperkirakan dari luas relatif diameter piring (pengaturan admin, bawaan 22 cm).
- Setiap kelompok lalu diperiksa jaringan saraf kecil yang dilatih dari foto makanan sungguhan
  (`web/src/lib/foodnet.ts`, bobot `public/models/food-patch-v3.bin`, ≈ 166 KB, dilatih di `ai/`
  dari 429 foto — 77 di antaranya tidak pernah dilihat model): bagian yang dinilai bukan makanan
  dibuang, kelompok warna yang menurut model hampir pasti bukan kelas itu dibuang (mis. serbet
  merah terbaca "tomat"), kelas diganti bila model yakin — dan ambang "yakin" itu dihitung per
  kelas dari data uji lalu disimpan DI DALAM berkas model (`ai/train.py` → `meta.thresholds`),
  sehingga antarmuka tidak menebak angka. Peluangnya sudah dikalibrasi (suhu softmax 1,141;
  ECE 0,042 → 0,018 pada foto uji) sehingga "yakin" benar-benar berarti yakin. Bila berkas v3 belum
  ada, peramban memuat v2 dan tetap jujur; bila tidak ada model sama sekali, layar mengatakan hasil
  hanya dari warna dan bentuk — tidak pernah berpura-pura. Tahap "Memeriksa dengan model" tampil
  hanya karena memang dijalankan. Kualitasnya diukur ujung-ke-ujung pada foto yang tidak ikut
  latihan (`ai/README.md`), bukan diklaim.
- Di layar admin (Rekomendasi AI) ada panel "Kualitas pemindai piring": yang ditampilkan adalah isi
  `public/models/<model>.model.json` — hasil uji pada foto yang tidak dilihat model, ditulis saat
  `ai/export.py`. Tidak ada angka kualitas yang diketik manual di antarmuka.
- Batas kemampuan dinyatakan di tempat ("Berat diperkirakan dari luas makanan di piring") dan
  lencana keyakinan tinggi / sedang / rendah — tanpa piring terdeteksi, lencana paling tinggi
  "sedang" karena skala beratnya tebakan. Isi lencana diambil dari angka ukur per kelas yang
  tersimpan di berkas model (seberapa sering nama kelas itu benar pada foto uji), **bukan** dari
  besarnya bidang makanan; angkanya dicatat di `ai/README.md`. Bila tidak ada makanan yang dikenali, kalimatnya
  membedakan sebab: piring kosong, piring tidak ditemukan, atau bukan makanan. Bila model
  membuang atau mengoreksi bagian, itu disebutkan ("1 menu dikoreksi oleh model").
- Manusia tetap di tengah: setiap menu dan berat dapat diganti, dihapus, atau ditambah sebelum
  disimpan; yang dikirim ke orang tua adalah angka setelah diperiksa pengasuh, dan itu tertulis
  pada baris sumber di dasbor orang tua.
- Dua tahap, satu catatan: "sebelum makan" → piring menunggu (orang tua melihat "disajikan
  pukul …"); "sesudah makan" → dicocokkan per menu → persentase porsi, energi, zat gizi.
  Pindaian ulang untuk anak & waktu makan yang sama menggantikan yang lama (bukan menumpuk).
- Foto disimpan kecil (≤ 240 px, ≤ 160 KB) di server, disajikan hanya ke keluarga anak
  tersebut, dan dihapus setelah tiga hari.
- Bahasa: "Pindai piring", "Saat disajikan", "Sesudah makan", "Kirim ke orang tua".
  Hindari "scan", "deteksi", "AI".

## 10. Analitik, insight, dan saran (AI harian)

- Semuanya dihitung di server dari catatan pengasuh (`api/app/analytics.py`); tidak ada angka yang
  dihasilkan model bahasa atau ditempel sebagai hiasan. Rantai tiap angka: entri → baris hari →
  indikator periode → insight → saran, dan tiap kartu menyebut buktinya dalam satu baris.
- Kebiasaan anak = **median ± sebaran tahanencil (MAD)** dari ≤ 8 minggu hari hadir sebelumnya,
  bukan rata-rata ± simpangan: satu hari buruk tidak boleh membuat minggu berikutnya terlihat
  "normal". Uji beda memakai Welch **dan** Mann–Whitney + besaran efek Hedges g; bila searah,
  kartunya menyebut keduanya. Titik ubah (CUSUM) menjawab "sejak kapan" dan hanya dilaporkan bila
  perpindahannya ≥ 0,8 sebaran, sisi barunya bertahan ≥ 3 hari, dan tanggalnya masih dalam 21 hari
  terakhir — kabar sebulan lalu bukan kabar minggu ini.
- Kemiringan tren memakai Theil–Sen (median semua kemiringan pasangan titik) supaya satu hari
  meledak tidak menyeret garis; posisi anak di antara teman memakai persentil, tanpa menyebut anak
  mana pun.
- "Skor pantauan" 0–100 adalah jumlah tertimbang sinyal yang benar-benar menyala (mood rendah 3 hari
  berturut-turut, porsi di bawah setengah, tidur jauh di bawah kebiasaan, suhu ≥ 37,5 °C, kejadian
  berat, hari absen). Tiap komponen ditampilkan beserta angkanya; ini alat kerja staf, **bukan**
  diagnosis, dan tidak ditampilkan ke orang tua sebagai angka.
- Saran ditandai dampak (1–3) dan usaha (0–3) — aturan produk yang tertulis di kode, bukan hasil
  belajar mesin. Admin boleh menekan 👍/👎; penilaian itu hanya menggeser **urutan** saran (pengali
  dikunci 0,7–1,3, disimpan di Settings sehingga ikut dicadangkan) dan tidak pernah menambah klaim.
- Bahasa: "Insight & Rekomendasi AI" boleh, karena lapisan ini memang model yang dilatih dan
  diperiksa; tetapi tidak ada nama pustaka, nama model, atau istilah statistik di judul kartu —
  angka statistik hidup di baris "bukti", bukan di kepala kartu.
