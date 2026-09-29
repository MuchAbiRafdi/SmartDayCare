# SmartDaycare AI — situs produksi

Situs statis (HTML, CSS, JavaScript murni, tanpa pustaka) untuk layanan
penitipan anak yang transparan. Jalankan dengan server statis apa pun:

    python3 -m http.server 8000

lalu buka http://localhost:8000/.

## Alur halaman

| Halaman | Fungsi |
|---|---|
| `index.html` | Landing page: fitur, cara kerja, privasi, harga, FAQ, kontak |
| `register.html` | Buat akun (orang tua / pengasuh / admin) |
| `login.html` | Masuk, lupa kata sandi, tetap masuk |
| `dashboard.html` | Beranda pengguna: pilih dasbor sesuai peran, aktivitas langsung, tautkan anak |
| `parent.html` | Dasbor Orang Tua: hari ini, kamera, makan & gizi, kesehatan, pemberitahuan, laporan cetak |
| `caregiver.html` | Dasbor Pengasuh: absensi & suhu, pindai piring, obat, kejadian, serah terima, kamera & udara |
| `admin.html` | Dasbor Admin: ringkasan, kamera & sensor, catatan harian, riwayat akses, akun & kode anak, pengaturan |
| `account.html` | Profil, kata sandi, pemberitahuan, sesi, hapus akun |
| `help.html` | Pusat bantuan, privasi, syarat, formulir pertanyaan |

Halaman dasbor mewajibkan sesi. Peran yang salah diarahkan ke Beranda.
Admin dapat membuka ketiga dasbor.

Tata letak: halaman publik memakai header satu baris; `login` dan
`register` memakai tata letak dua kolom (panel fasilitas + form); semua
halaman terautentikasi memakai kerangka sidebar + topbar yang dibangun
`core.js` dari deklarasi tab (`.tabpane[data-nav]`). Di layar sempit
sidebar berubah menjadi laci. Rincian ada di DESIGN.md bagian 8.

## Akun fasilitas (Ceria Ananda Daycare)

| Peran | E-mail | Kata sandi |
|---|---|---|
| Orang tua (Kirana) | andi.lestari@gmail.com | Kirana2026 |
| Orang tua (Bima) | budi.wijaya@gmail.com | Bima2026 |
| Pengasuh | ratna.dewi@ceriaananda.id | Ratna2026 |
| Pengasuh | sari.puspita@ceriaananda.id | Sari2026 |
| Admin | hendra@ceriaananda.id | Hendra2026 |

Kode anak untuk pendaftaran orang tua: KA-2201 … KA-2206
(tertera di Dasbor Admin → Akun & kode anak).
Kode undangan staf: CERIA-STAF-2026 (pengasuh), CERIA-ADMIN-2026 (admin).

## Cara kerja data

- Data fasilitas ada di `assets/js/data.js`. Jadwal harian dibaca relatif
  terhadap jam perangkat: kegiatan muncul di garis waktu saat waktunya tiba.
- Semua yang diinput dari aplikasi (akun baru, absensi, suhu, obat, makan,
  kejadian, serah terima, tiket, pengaturan) tersimpan di `localStorage`
  peramban dan langsung tersinkron ke tab lain (buka dasbor pengasuh dan
  orang tua berdampingan untuk melihatnya).
- Sesi tersimpan per tab (`sessionStorage`); "Tetap masuk" memakai
  `localStorage`. Dua tab bisa masuk sebagai pengguna berbeda.
- Nilai udara ruangan berjalan sebagai deret waktu langsung; batas
  peringatan diatur admin dan berlaku di semua dasbor.

## Pindai piring (pengasuh → orang tua)

1. Dasbor pengasuh → **Pindai piring**. Pilih anak dan waktu makan,
   nyalakan kamera (perlu izin peramban; di HTTP biasa selain
   `localhost`, gunakan **Pilih foto**) atau pilih foto piring.
2. Tahap **Sebelum makan**: tekan *Pindai piring*. Menu dan perkiraan
   berat muncul dan bisa dikoreksi. *Simpan piring disajikan* — orang tua
   langsung melihat "disajikan pukul …" di tab Makan & gizi.
3. Tahap **Sesudah makan** (dipilih otomatis bila ada piring yang
   menunggu): pindai sisa piring. Tabel perbandingan disajikan / sisa /
   dimakan / kkal tampil; *Kirim ke orang tua* menyimpan catatan makan.
4. Orang tua melihat foto sebelum–sesudah, tabel per menu, asupan hari
   ini, dan pemberitahuan; admin melihatnya di Catatan harian dan metrik
   "Piring dipindai". Diameter piring diatur admin (Pengaturan).

Untuk mencoba tanpa kamera, pakai `assets/img/plate-before.jpg` lalu
`assets/img/plate-after.jpg` lewat tombol *Pilih foto*.

## Struktur

    index.html login.html register.html dashboard.html
    parent.html caregiver.html admin.html account.html help.html
    assets/css/main.css      gaya bersama (lihat DESIGN.md)
    assets/js/data.js        data fasilitas
    assets/js/core.js        penyimpanan, sesi, data harian, real-time, bagan, kerangka
    assets/js/vision.js      pengenal makanan di piring (kamera, warna/tekstur, berat, gizi)
    assets/js/pages.js       logika per halaman
    assets/img/              foto ruangan dan piring
    DESIGN.md                arah desain dan aturan bahasa antarmuka
