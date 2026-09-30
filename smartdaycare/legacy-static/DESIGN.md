# DESIGN.md — SmartDaycare AI (Produksi)

Dokumen arah desain. Wajib dibaca sebelum mengubah UI.
Anti-Slop Framework v3.2.18: filter selama pengerjaan (mode DURING).
Situs ini adalah produk jadi untuk orang tua dan staf daycare:
bahasa sederhana, tanpa istilah teknis, tanpa label demo.

## 1. Identitas produk

SmartDaycare AI adalah layanan penitipan anak yang transparan.
Kesan: hangat, tenang, tepercaya, premium. Kemewahan dibangun lewat
cara editorial — tipografi presisi, ruang lega, gradasi tenang dalam
satu keluarga warna teal-tinta — bukan lewat ornamen atau klaim.

Kalimat uji: seorang ibu yang baru pertama kali membuka situs ini
langsung paham apa yang didapat anaknya, tanpa perlu tahu apa pun
tentang teknologi di baliknya.

## 2. Palet

- Dasar: Zinc hangat. Latar `#F4F4F2`, permukaan `#FFFFFF`,
  garis `#E0E0DC`, wash mint `#EAF5F1` (masih keluarga teal).
- Tinta: `#131316` (utama), `#3A3A41` (sekunder), `#55555C` (keterangan).
- Aksen: Deep Teal. Teks `#0A544F`, bidang `#0B5F59`–`#12A48F`,
  sorot terang `#5EEAD4`/`#A7F3D0` hanya di atas bidang gelap.
- Status selalu berpasangan dengan label teks:
  Normal `#15803D`, Perhatian `#92400E`, Bahaya `#B91C1C`.
- Larangan: neon, ungu-biru, pelangi, pastel dekoratif,
  glassmorphism, grid blueprint.

## 3. Gradasi yang diizinkan (tercatat, R-01)

Diminta eksplisit oleh pemilik produk. Enam gradasi, satu keluarga
warna, masing-masing dengan fungsi tercatat:

1. `body` — `#FCFCFB → #F4F4F2`. Fungsi: cahaya atas kertas.
2. `.hero` — `#0B1210 → #101A17 → #0F2B26 → #0B3B34` (160°),
   dilapis cahaya radial teal 22% di kanan atas. Fungsi: jangkar
   merek; satu-satunya sorotan cahaya di situs.
3. `.grad-text` — `#5EEAD4 → #A7F3D0`. Fungsi: penekanan satu kata
   pada headline hero. Dilarang dipakai di tempat lain.
4. `.btn-primary` — `#12A48F → #0B5F59`. Fungsi: affordance taktil
   tombol utama.
5. `.band-wash` — `#EAF5F1 → transparan`. Fungsi: pemisah seksi
   yang lembut tanpa garis keras.
6. `.cta-band` / `.price-card.featured` / `body.auth` — gradasi
   tinta-teal gelap. Fungsi: panggung untuk ajakan bertindak dan
   momen masuk/daftar.

Gradasi baru di luar daftar wajib dicatat fungsinya, atau ditolak.

## 4. Tipografi

- `Inter, -apple-system, "Segoe UI", Roboto, sans-serif`.
  Tanpa webfont eksternal agar berjalan luring.
- Mono hanya untuk waktu, nomor, dan label sistem.
- Angka data tabular. H1 satu per halaman, eyebrow bertick teal.

## 5. Bahasa antarmuka (aturan produksi)

- Kalimat pendek, kata sehari-hari. Pengguna tidak pernah melihat:
  nama model, nama server, protokol, singkatan teknik, satuan
  latensi, atau label demo/prototype/simulai.
- Nama fitur produk (NutriScan) boleh tampil sebagai merek.
- Contoh penggantian: "E2EE AES-256 aktif" → "Koneksi aman";
  "CAM-01 · 1080p" → "Kamera 1"; "confidence 0,94" → tidak
  ditampilkan; "retensi" → "rekaman tersimpan 7 hari".
- Angka ringkasan wajib dapat dilacak ke tabel di bawahnya.
- Status kosong selalu menjelaskan langkah lanjut
  ("Belum ada data — pemindaian pertama setelah makan siang").

## 6. Bentuk, elevasi, gerakan

- Radius 4/6/8/10(auth). Pil hanya badge dan titik.
- Bayangan hanya: header (E1), modal/toast/kartu auth (E2),
  tombol utama (E3 mikro). Panel konten rata.
- Tanpa animasi scanning fiktif atau terminal palsu. Proses
  memakai progress bar linear berlabel. Animasi berhenti saat
  `prefers-reduced-motion`.

## 7. Aksesibilitas, sesi, dan cetak

- Kontras normal ≥ 4,5:1. Fokus keyboard terlihat. Skip-link,
  dialog Escape, tab ber-ARIA.
- Sesi: halaman dasbor mengharuskan login; peran yang salah
  diarahkan ke dasbornya; keluar menghapus sesi.
- Data yang diinput (absensi, obat, serah terima, akun, makanan)
  tersimpan lokal dan tampil kembali — situs terasa hidup.
- Cetak: hanya konten aktif, tanpa navigasi (laporan harian).
- Dial: ENERGY 2, RHYTHM 3, MOTION 1.

## 8. Peta halaman dan kerangka tata letak

Publik: `index` (landing) → `register` / `login` → `help` (bantuan,
privasi, syarat). Terautentikasi: `dashboard` (beranda: pilih dasbor)
→ `parent` / `caregiver` / `admin` → `account`.

Tiga kerangka, masing-masing satu pola:

- **Publik** (`index`, `help`): header tipis satu baris, seksi bertumpuk
  dengan lebar maksimum 1160 px, satu H1, eyebrow bertick teal.
- **Autentikasi** (`login`, `register`): `.auth-layout` dua kolom —
  panel kiri gradasi gelap berisi ringkasan fasilitas, kolom kanan form
  selebar 520 px. Di bawah 900 px panel kiri disembunyikan; form berdiri
  sendiri dengan merek di atas.
- **Aplikasi** (`dashboard`, `parent`, `caregiver`, `admin`, `account`):
  `.shell` = sidebar gelap 256 px (merek, menu tab per halaman, menu
  lintas halaman, pengguna, Keluar) + topbar putih (judul tab aktif,
  tanggal, jam, chip pengguna) + isi. Tab adalah `.tabpane` yang
  dideklarasikan lewat `data-nav`/`data-icon`; `core.js` membangun
  sidebar dan topbar dari deklarasi itu supaya semua dasbor identik.
  Di bawah 960 px sidebar menjadi laci (`[data-drawer]`) dan tab dapat
  dibuka lewat hash URL.

Aturan isi di dalam kerangka aplikasi:

- Kolom sempit (≈300 px) tidak boleh berisi tabel banyak kolom;
  gunakan daftar (`ul.activity`, `ul.air-list`).
- Grid memakai `minmax(0,1fr)` agar tabel lebar tidak mendorong halaman.
- Setiap panel diawali `.panel-head` (judul + satu kalimat + aksi kanan).
- Kolom pertama tabel tidak dipatahkan (`white-space:nowrap`).

## 9. Real-time yang jujur

- Yang benar-benar hidup: jam, garis waktu yang bertambah saat waktunya
  tiba, udara ruangan (deret waktu), sinkronisasi antar tab, lonceng.
- Yang tidak dipalsukan: tidak ada notifikasi acak, tidak ada angka
  yang berubah tanpa sumber, tidak ada "proses AI" tiruan — proses
  memakai progress bar berlabel apa yang sedang dilakukan.

## 10. Pemindai piring (kamera → menu → gizi → orang tua)

- Prosesnya nyata dan berjalan di perangkat: bingkai kamera (atau foto
  yang dipilih) dibaca pikselnya, piring dicari, area makanan
  dikelompokkan berdasarkan warna dan tekstur, lalu berat diperkirakan
  dari luas relatif terhadap diameter piring (pengaturan admin, 22 cm
  bawaan). Daftar tahap yang tampil adalah tahap yang benar-benar
  dijalankan, bukan animasi.
- Batas kemampuan dijelaskan di tempat: "Berat diperkirakan dari luas
  makanan di piring" dan lencana keyakinan (tinggi / sedang / rendah).
  Tidak ada angka latensi, nama model, atau istilah teknis di layar.
- Manusia tetap di tengah: setiap menu dan berat hasil pengenalan dapat
  diganti, dihapus, atau ditambah sebelum disimpan. Yang dikirim ke orang
  tua adalah angka setelah diperiksa pengasuh, dan itu dinyatakan pada
  baris sumber di dasbor orang tua.
- Dua tahap, satu catatan: pindaian "sebelum makan" disimpan sebagai
  piring yang menunggu (orang tua melihat "disajikan pukul …"), pindaian
  "sesudah makan" dicocokkan per menu dan menghasilkan persentase porsi,
  energi, dan zat gizi. Foto disimpan kecil (≤ 240 px) dan dibuang
  setelah tiga hari.
- Bahasa: "Pindai piring", "Saat disajikan", "Sesudah makan", "Kirim ke
  orang tua". Hindari "scan", "deteksi", "AI".

