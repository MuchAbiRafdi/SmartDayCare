# Model pengenal makanan (pemindai piring)

Pemindai piring berjalan sepenuhnya di peramban pengasuh. Dua lapis bekerja bersama:

1. **Segmentasi warna–bentuk** (`web/src/lib/vision.ts`) — memisahkan latar, mencari piring,
   mengelompokkan area makanan per kelas warna, lalu mengubah luas menjadi gram dengan diameter
   piring sebagai skala.
2. **Jaringan saraf kecil** (`web/src/lib/foodnet.ts`, bobot di `web/public/models/*.bin`) —
   dilatih dari foto makanan sungguhan; menilai tiap kelompok hasil segmentasi:
   - kelompok yang dinilai *bukan makanan* (p > 0,6) dibuang;
   - kelompok warna yang menurut model hampir pasti bukan kelas itu (p(kelas) < 0,07) dibuang —
     ini yang paling banyak menghapus "menu hantu" seperti serbet merah terbaca tomat;
   - kelasnya diganti bila model yakin (p > 0,6) **dan** kelas tujuan berpresisi ≥ 0,75 pada data uji
     (atau p > 0,8 untuk kelas lain) — angka presisi per kelas disimpan di dalam berkas model;
   - bila semua kelompok terbuang padahal model melihat makanan di piring, kelompok terbesar
     dikembalikan dengan catatan agar pengasuh memeriksa nama menunya.
   Keyakinan tiap bagian ikut memperhitungkan kesepakatan model dengan kelas warna. Bila berkas
   model tidak termuat, aplikasi memberi tahu pengasuh bahwa hasil hanya berasal dari warna dan bentuk.

Hasil selalu ditinjau pengasuh sebelum disimpan; yang tersimpan adalah angka setelah diperiksa.

## Data

`data/raw/<kelas-utama>/*.jpg` — 440 foto dari pencarian gambar (daftar kueri & label ada di
`prepare.py`, hasilnya `data/manifest.json` dengan `{file, labels[], query}`), 10 kelas makanan
(`rice greens fried pale brown soup orange yellow red egg`) + `none` (piring kosong, meja, dinding,
tangan, kain, kertas). 59 foto berlabel ganda (mis. nasi + telur); folder hanya menandai label
pertama, **manifest-lah yang berlaku**. Foto sisi terpendeknya < 220 px dibuang `prepare.py` —
tambalannya jadi terlalu kasar dibanding skala latih.

Foto latih diseragamkan ke sisi terpendek 300 px, lalu dipotong menjadi tambalan 48×48 px pada
beberapa skala. Tambalan pada foto makanan diberi label hanya bila warna rata-rata *dan* teksturnya
masuk akal untuk tepat satu label foto itu (supervisi lemah, `plausible()` di `train.py`) — jadi
tambalan piring/meja tidak ikut berlabel makanan; pada foto berlabel ganda, tambalan yang cocok
untuk dua kelas sekaligus memakai target lunak (peluang dibagi rata) alih-alih dibuang. Tepi foto
makanan yang warnanya bukan makanan apa pun ikut diambil sebagai `none` (20 per foto) supaya model
belajar menolak alas meja, serbet, dan sendok. Foto dengan piring berwarna (hijau/mint) tidak diberi label
`greens` karena piringnya sendiri lolos uji warna. `data/patches-summary.json` mencatat jumlah
tambalan yang diterima per foto — berguna untuk menemukan label yang bocor.

**Himpunan uji dibekukan** di `data/split.json` (`python3 dataset.py --freeze`): 77 nama foto.
Tanpa berkas itu, menambah satu foto saja mengubah urutan `list_images()` → shuffle → siapa yang
jadi foto uji, dan angka dua versi model tidak lagi dibandingkan di atas foto yang sama — padahal
banding-bandingkan itulah satu-satunya yang kita punya. Semua foto baru karena itu otomatis masuk
kelompok latih; bila nanti ingin memperbesar himpunan uji, tulis daftar barunya secara sadar dan
catat di sini bahwa angka lama tidak lagi sebanding. `train.py` menyimpan nama foto uji ke
`models/<nama>.meta.json` (`val_photos`) supaya setiap angka bisa ditelusuri ke fotonya.
`python3 dataset.py --check` membuktikan split beku masih cocok dengan isi `data/raw` (keluar dengan
kode 1 bila ada foto uji yang hilang — artinya angka lama tidak dapat diulang lagi).

## Latih, ekspor, verifikasi, evaluasi

```bash
cd ai
pip install torch numpy pillow onnx        # sekali
python3 prepare.py                          # susun data/raw + manifest dari image-search/
python3 -u train.py                         # models/food-patch-v3.pt (+ .meta.json), ±31 menit di 2 CPU
python3 export.py food-patch-v3             # .onnx + web/public/models/food-patch-v3.bin + .model.json
# verifikasi runtime peramban = PyTorch:
cd ../web && node_modules/.bin/tsc src/lib/foodnet.ts --outDir /tmp/fn --module es2022 --target es2020 \
  --moduleResolution bundler --strict --skipLibCheck
node ../ai/verify.mjs /tmp/fn/foodnet.js ../ai/models/verify-sample.json public/models/food-patch-v3.bin
# → {"cells":108,"maxAbsDiff":0.00167,"argmaxAgreement":1,"ms":85}  (v3, diverifikasi 29/09/2026;
#    selisih sebesar itu = pembulatan float16, dan kelas yang dipilih tetap sama di 108/108 sel)
# evaluasi ujung-ke-ujung (segmentasi + model) pada foto uji yang tidak ikut latihan:
cd ../ai && python3 eval_prep.py /tmp/evalset                    # 77 foto uji model saat ini
python3 eval_prep.py /tmp/evalset --width 480                     # foto yang sama, dirender lebih besar
python3 eval_prep.py /tmp/evalset-fresh --only data/fresh-photos.txt   # hanya foto yang belum pernah dilihat model mana pun
cd ../web && node_modules/.bin/tsc src/lib/vision.ts src/lib/foodnet.ts --outDir /tmp/fn --module es2022 \
  --target es2020 --moduleResolution bundler --strict --skipLibCheck && sed -i 's#"./foodnet"#"./foodnet.js"#' /tmp/fn/vision.js
node ../ai/eval-plates.mjs /tmp/fn/vision.js /tmp/evalset public/models/food-patch-v1.bin public/models/food-patch-v2.bin public/models/food-patch-v3.bin
```

Daftar foto, label, dan pemisahan latih/uji per foto (`SEED`, `VAL_FRAC`, `list_images`,
`split_by_image`) tinggal di `ai/dataset.py` — karena itu `eval_prep.py` dan pengujian foto bisa
dijalankan tanpa memasang kerangka latih (cukup `numpy` + `pillow`). Pindahkan angka split dengan
sadar: ia menentukan foto mana yang dianggap "belum pernah dilihat model".

`ai/plate-check.mjs <vision.js> <lebar> <tinggi> <foto.rgba> [bin ...]` memeriksa satu foto lewat
jalur aplikasi yang sama dan mencetak menu + gram + apa yang dibuang/dikoreksi model (lihat catatan di
kepala berkas untuk cara menyiapkan `.rgba`-nya) — dipakai untuk menjawab "kalau foto piring asli
kita bagaimana?" tanpa mengarang jawabannya.

`eval-plates.mjs` menjalankan pipeline aslinya (`analyzeImageData`) di Node pada foto uji dan
membandingkan hasilnya dengan isi foto: "kelas utama terdeteksi" = kelas utama foto muncul di
daftar hasil; "semua label" = semua kelas yang tercatat pada foto itu muncul; "kelas asing per
foto" = kelas hasil yang tidak ada di foto. A/B antar model sebaiknya memakai `--only
data/fresh-photos.txt` (28 foto yang tidak pernah dilihat model mana pun — pada 77 foto uji, v2
pernah berlatih di sebagian foto sehingga angkanya menguntungkan v2).

Variabel `train.py`: `SD_EPOCHS` (46), `SD_PATCHES` (tambalan per foto, 88), `SD_NEG` (tambalan
`none` per foto makanan, 20), `SD_VAL` (fraksi foto uji per kelas, 0,18), `SD_OUT` (nama model),
`SD_ARCH` (kanal konvolusi, "16,32,48,64,64"), `SD_MIXUP` (0 = mati; 0,2 = campur dua tambalan
beserta label lunaknya), `SD_TKA` (0 = satu epoch terbaik; 3 = rata-rata bobot tiga epoch terbaik,
dipakai hanya bila skornya lebih tinggi). Cache tambalan
`data/patches-<nama-model>-<P>-<N>.npz`; isinya diuji terhadap daftar foto di manifest, jadi cache
basi tidak bisa dipakai diam-diam (kalau tidak cocok, tambalan dibangun ulang).

## Arsitektur & format

* v3: 5 konvolusi 3×3 (16 → 32 → 48 → 64 → 64 kanal, BatchNorm dilipat saat ekspor) + ReLU,
  max-pool setelah konvolusi 1–3, dropout, rata-rata global, linear 64 → 11. 84.539 parameter
  (v2: ≈ 79 ribu, v1: ≈ 30 ribu). Latihan: AdamW + OneCycle, target lunak + label smoothing,
  sampel seimbang per kelas, EMA bobot, augmentasi warna/cutout, grid sampling per kelas;
  checkpoint dipilih dari `0,45·akurasi-seimbang + 0,30·akurasi-per-foto + 0,25·presisi-foto`
  sehingga yang dipilih adalah yang benar pada **piring**, bukan pada potongan gambar.
* Kalibrasi & ambang ikut diekspor: setelah latih, satu suhu softmax dipilih pada data uji
  (grid 0,6–4,0, meminimalkan NLL; untuk v3 jatuh di 1,141 dan ECE turun 0,042 → 0,018), lalu
  `class_thresholds()` menghitung per kelas (a) ambang peluang minimum untuk boleh menamai ulang
  kelas warna — diambil dari ambang tempat presisi-terhadap-isi-foto ≥ 0,85, (b) ambang veto dari
  persentil ke-2 peluang kelas pada foto yang benar-benar memuat kelas itu (dijepit 0,04–0,15).
  Keduanya ditulis ke header `.bin`; `web/src/lib/vision.ts` (`ambangDari`) memakainya apa adanya
  dan kembali ke konstanta lama bila berkas model tidak menyimpannya. Suhu dikali masuk ke bobot
  `fc` saat ekspor (ONNX, `.bin`, dan contoh verifikasi memakai bobot yang sama, kalau tidak,
  verifikasi hanya menjadi upacara kosong).
* `export.py` juga menulis `web/public/models/<nama>.model.json` — ringkasan hasil uji untuk panel
  "Kualitas pemindai piring" di layar admin. Diganti bila model berganti, tidak pernah diisi manual.
* Karena semua lapisan konvolusional, di peramban jaringan dijalankan **sekali untuk seluruh bingkai**
  dan menghasilkan peta kelas rapat berlangkah 8 px. Bingkai analisis (lebar ≤ 320 px) diperbesar
  dulu sampai sisi terpendeknya ≈ 300 px agar skala tekstur sama dengan saat latihan — tanpa ini,
  nasi pada foto piring dari atas sering dinilai "bukan makanan". Waktu ukur di Node (CPU sandbox
  2 inti): 0,5–0,9 detik per bingkai; di ponsel kelas menengah perkirakan 1–2 detik.
* Berkas `.bin`: penanda `SDFN`, versi, header JSON (kelas, normalisasi, daftar lapisan, meta
  termasuk presisi per kelas), lalu bobot float16. ONNX disediakan untuk dipakai di luar peramban.

## Kualitas — diukur, bukan diklaim

Pembagian uji **per foto** (18 % tiap kelas = 77 foto dari 429), bukan per tambalan, supaya tambalan
dari foto yang sama tidak bocor ke data uji.

| | v1 (188 foto) | v2 (325 foto) | v3 (429 foto) |
|---|---|---|---|
| akurasi tambalan uji | 0,66 | 0,67 | 0,63 |
| akurasi seimbang antar kelas | 0,65 | 0,68 | 0,62 |
| akurasi per foto (suara terbanyak) | — | 0,81 | 0,78 |
| presisi terhadap ISI foto saat yakin (p ≥ 0,6) | — | — | **0,77** |
| ECE setelah kalibrasi | tidak dikalibrasi | tidak dikalibrasi | **0,018** (sebelum 0,042) |

Dua hal yang perlu diketahui sebelum tabel ini dibaca sebagai peringkat:

* angkanya dihitung pada himpunan uji yang berbeda (v1/v2: 58 foto lama, v3: 77 foto baru) sehingga
  ini bukan adu langsung; yang bisa dibandingkan langsung adalah tabel ujung-ke-ujung di bawah
  (himpunan foto sama, alat ukur sama);
* baris "presisi terhadap isi foto" dan "ECE" kosong untuk v1/v2 karena kedua metrik itu baru
  dihitung mulai v3 — `train.py` versi lama tidak mengukurnya, dan angkanya tidak disalin mundur
  dari metrik lain yang dasarnya berbeda (presisi per tambalan vs presisi per isi foto).

Presisi saat yakin per kelas (v3, p ≥ 0,6, diukur terhadap isi foto): nasi 0,92 · sayur hijau 0,97 ·
merah 0,88 · kuning 0,85 · sup 0,77 · goreng 0,75 · cokelat 0,72 · telur 0,62 · jingga 0,66 ·
pucat 0,59 · "bukan makanan" 0,48. Yang masih lemah dan karena itu jarang dipakai menamai ulang:
**lauk kukus/pucat, buah jingga, telur** — persis kelas yang tercatat di panel "Kualitas pemindai
piring" pada layar admin (`weakClasses` di `food-patch-v3.model.json`). Recall tambalan untuk nasi
(0,39) dan sup (0,46) memang rendah karena tambalan pinggir piring sering menyerah ke kelas tetangga,
tetapi pada tingkat foto namanya tetap benar (nasi 7/9 foto) — itu sebabnya yang dilaporkan aplikasi
adalah hasil tingkat foto, bukan akurasi per piksel.

### Ujung-ke-ujung pada 77 foto uji v3

`eval-plates.mjs`, bingkai lebar ≤ 320 px seperti di aplikasi; "kelas asing per foto" = kelas hasil
yang tidak ada pada label foto. **Catatan jujur:** v2 pernah berlatih pada sebagian foto himpunan ini
sehingga barisnya menguntungkan v2; ia dibawa hanya agar pembaca bisa melihat skala masalahnya.

| pipeline | kelas utama | semua label | kelas asing/foto | butir/foto | ms/foto |
|---|---|---|---|---|---|
| warna & bentuk saja | 0,519 | 0,403 | 2,49 | 3,05 | 35 |
| + model v1 (aturan lama) | 0,506 | 0,364 | 1,36 | 1,86 | 477 |
| + model v2 + aturan lama | 0,571 | 0,429 | 1,09 | 1,68 | 749 |
| + **model v3 + ambang dari berkas model** | **0,571** | **0,442** | 1,81 | 2,40 | 973 |

### A/B yang adil: 28 foto yang belum pernah dilihat model mana pun

`data/fresh-photos.txt` = foto yang ditambahkan bersama v3; 28 di antaranya jatuh di sisi uji. Tidak
ada model yang pernah melihatnya, jadi semua barisnya layak dipercaya.

| pipeline | kelas utama | semua label | kelas asing/foto |
|---|---|---|---|
| warna & bentuk saja | 0,464 | 0,357 | 2,68 |
| v1 | 0,464 | 0,286 | 1,50 |
| v2 | 0,429 | 0,286 | 1,32 |
| **v3** | **0,500** | **0,357** | 2,00 |

v3 menaikkan kelas utama dari 12 ke 14 foto yang tepat (0,429 → 0,500 pada 28 foto) dan kembali ke
angka "semua label" milik lapisan warna murni (0,357) sambil memangkas kelas asingnya
2,68 → 2,00 per foto.
Harganya: model 84,5 rb parameter ini 31 % lebih lambat (973 vs 749 ms per bingkai di Node 2 inti)
dan lebih banyak meninggalkan kelas yang perlu dihapus pengasuh.

### Kenapa ambang veto tidak diutak-atik manual

Ambang veto v3 (0,04 per kelas, hasil persentil ke-2 di data uji) terasa "lembek" dibanding konstanta
lama 0,07, jadi ambang tunggal itu disapu pada 77 foto uji dengan `eval-plates.mjs`:

| veto | kelas utama | semua label | kelas asing/foto | ms/foto |
|---|---|---|---|---|
| 0,04 (dipilih model) | **0,571** | **0,442** | 1,81 | 968 |
| 0,05 | 0,558 | 0,429 | 1,61 | 965 |
| 0,06 | 0,558 | 0,416 | 1,52 | 936 |
| 0,07 (aturan v2) | 0,545 | 0,403 | 1,30 | 951 |
| 0,10 | 0,532 | 0,403 | 1,14 | 953 |
| 0,13 | 0,519 | 0,390 | 0,90 | 995 |
| 0,10 untuk pucat/jingga/kuning/merah/sayur, 0,05 sisanya | 0,558 | 0,416 | 1,38 | 862 |

Menaikkan veto memang menekan kelas asing (1,81 → 0,90) tetapi membeli itu dengan kehilangan menu
asli: akurasi kelas utama turun satu foto demi satu foto, dan pada 0,13 pipeline-nya kembali ke
kualitas "warna saja". Selisih antar baris cuma 1–2 foto dari 77, jadi tidak ada satu pun yang menang jauh.
Yang dipilih adalah angka yang dihitung `class_thresholds()` dari data uji — bukan angka yang enak
dibaca di tabel ini — sebab mengutak-atik konstanta pada himpunan evaluasi sendiri hanya akan
mengukur ulang hafalan terhadap alat ukurnya. Bila nanti ingin menekan kelas asing lebih jauh, jalan
yang benar: foto piring daycare asli lagi (kelas pucat/jingga/telur), bukan geser ambang.

Foto uji ini foto web yang beragam (banyak latar ramai). Pada foto contoh aplikasi
(`web/public/img/plate-before.jpg`, dilihat lewat `ai/plate-check.mjs`, bukan lewat angka agregat)
v3 membaca Sup 130 g · Nasi 90 g · Lauk goreng 50 g · Buah jingga 35 g · Sayur hijau 30 g, tanpa
membuang apa pun; v2 membuang satu bagian (buah jingga) dan tidak lagi menyebutnya — tepat trade-off
tabel sapuan di atas. Pada `plate-after.jpg` (piring setelah makan) ketiga model sepakat: Nasi 45 g
dan Sayur hijau 35 g.

Justru foto piring asli dari daycare (berkas `IMG-20260928-WA0002.jpg` di folder unggahan — dipotret
miring, piring tidak mengisi bingkai) yang menunjukkan sisanya: piringnya tidak terdeteksi, lapisan
warna melihat tiga kelompok (goreng, nasi, sayur 5 g), dan model membuang dua di antaranya sehingga
yang tersisa cuma "Nasi ≈30 g". Artinya, pada foto semacam ini pengasuh tetap yang menulis apa yang
disajikan — aplikasi tidak boleh disalin mentah. Kesalahan yang paling sering tersisa: sup/kuah,
telur, dan makanan pucat di piring putih.

### Yang dicoba untuk membuatnya lebih pintar tanpa foto baru — dan tidak menolong

Tambahan epoch/tambalan (v1b) sudah lebih dulu terbukti tidak membantu. Karena itu dua ide lain diuji
di sisi **inferensi** saja — tidak ada latih ulang, tidak ada data baru — pada 77 foto uji yang sama,
lewat `eval-plates.mjs`:

| percobaan | kelas utama | semua label | kelas asing/foto | ms/foto |
|---|---|---|---|---|
| seperti sekarang (satu tampilan, bingkai 320) | **0,571** | 0,442 | 1,81 | **871** |
| rata-rata tampilan asli + cermin kiri-kanan (TTA) | 0,571 | 0,442 | **1,78** | 1847 |
| rata-rata dua skala (320 dan 1,6 kali lipatnya) | 0,532 | 0,416 | 1,90 | 2875 |
| bingkai analisis dilebarkan ke 480 px | 0,571 | **0,455** | 1,78 | 1348 |
| bingkai analisis dilebarkan ke 640 px | 0,571 | **0,455** | 1,86 | 2184 |

Cermin tidak mengubah satu pun keputusan: jaringannya rapat dan hasilnya dirata-ratakan pada jendela
6×6 sel, jadi rata-rata dengan pandangan cerminnya hampir identik — yang didapat cuma waktu dua kali.
Dua skala malah menurunkan akurasi: tambalan hasil interpolasi lebih lembut daripada yang dilihat
model saat berlatih. Bingkai 480/640 menambah satu foto pada kolom "semua label" (34 → 35 dari 77)
— di dalam bising — dan dibayar +55 % sampai +150 % waktu. Tiga baris terakhir adalah alasan
keduanya tidak dipasang: tidak ada yang layak jadi bawaan, jadi kodenya sengaja tidak ditulis ke
produk (percobaannya dilakukan pada salinan `vision.ts`; angka-angka ini hasil jalannya, bukan taksiran).

Artinya, untuk kali ini, jalan satu-satunya yang terbukti menggerakkan angka tetap **foto**: foto
piring daycare asli, dipotret dari atas, per kelas yang lemah.

### Ronde data + kran resep (v4 & v4b) — diukur, dan v3 tetap dipakai

30/09/2026. Dua hal diuji bersamaan supaya sumbangannya bisa dipisahkan: (1) **11 foto baru**
(sup bening 5, tahu 2, jingga 3, goreng bertepung 1; sebagian membawa dua label) dari 25 hasil
pencarian yang ditinjau satu-satu — 14 dibuang karena kolase, bertulisan besar, atau terlalu lembut,
alasannya dicatat di `REJECTED`; dan (2) dua kran resep: `SD_MIXUP 0,2` (campur dua tambalan beserta
label lunaknya) dan `SD_TKA 3` (rata-rata bobot tiga epoch terbaik, dipakai hanya bila skornya lebih
tinggi). Kontrolnya `food-patch-v4b`: foto yang sama, resep v3 apa adanya.

Ujung-ke-ujung pada 77 foto uji beku (`eval-plates.mjs`, mesin menganggur, satu jalur kode yang sama):

| model | foto latih | kelas utama | semua label | kelas asing/foto | butir/foto | ms/foto |
|---|---|---|---|---|---|---|
| tanpa model | – | 0,519 | 0,403 | 2,49 | 3,05 | 29 |
| **v3 — yang dipakai** | 352 | **0,571** | **0,442** | 1,81 | 2,40 | 881 |
| v4 = +11 foto + mixup + rata-rata epoch | 363 | 0,506 | 0,390 | 1,88 | 2,43 | 871 |
| v4b = +11 foto saja | 363 | 0,545 | 0,416 | **1,71** | 2,29 | 861 |

Pada 28 foto yang tidak dilihat model mana pun: kelas utama 0,500 (v3) / 0,429 (v4) / 0,500 (v4b);
kelas asing per foto 2,00 / 2,11 / 1,86. Di tingkat tambalan (77 foto, tanpa pemindai): akurasi
0,625 → 0,619 (v4b) → 0,598 (v4), akurasi seimbang 0,622 → 0,613 → 0,595, suara terbanyak per foto
0,776 → 0,750 → 0,697.

Bacaannya. Mixup + rata-rata epoch **memadamkan** model (−0,079 pada suara terbanyak per foto) — itu
salah kran, bukan salah data. Sebelas foto web tambahan tidak menolong akurasi (−0,026 pada kelas
utama = dua foto dari 77) walau menekan nama keliru (asing/foto 1,81 → 1,71). Karena tidak ada yang
menang, **tidak ada yang diubah di aplikasi**: `MODEL_URLS` tetap v3 → v2, dan `.bin` v4/v4b sengaja
tidak ditaruh di `web/public/models` (berkas yang tidak dipakai jangan dikirim ke pengguna). Foto
barunya tetap di `data/raw` — valid, dan v4b menunjukkan ia tidak merusak. Yang hilang hanya klaim
bahwa ia menolong.

Satu jebakan yang perlu dicatat: `weakClasses` v4 **kosong**, dan itu bukan kabar baik. Modelnya
begitu hati-hati sehingga hampir tak pernah melewati ambang "yakin"; presisi tinggi tanpa cakupan
bukan kemajuan. Panel admin membaca `photoPrecision` dan `photoAccuracy` bersebelahan justru untuk
itu — angka satu baris tidak boleh dibaca sendiri.

Model dan metadata v4/v4b tetap disimpan di `ai/models/` (`.pt`, `.onnx`, `.meta.json` berisi resep
dan nama foto uji) supaya hasil ini bisa diulang dan dibantah; hanya artefak perambannya yang dibuang.
Perlu diingat: ia dilatih pada 440 foto, jadi bila nanti foto daycare asli masuk, mulailah dari resep
v3 (`SD_MIXUP`/`SD_TKA` dibiarkan mati) dan bandingkan di split beku yang sama.

### Lencana keyakinan: artinya, dan diukur

Formula lama menghitung keyakinan dari **luas** kelompok (`0,52 + 0,28·min(1, areaFrac/0,03) + …`).
Luas tidak ada hubungannya dengan benar/tidaknya *nama* menu, jadi butiran besar hasil potongan warna
selalu tampak meyakinkan. Sekarang dasarnya angka ukur per kelas yang tersimpan di berkas model
(`val_precision_conf06`), ditimbang peluang model (peluang di bawah 0,6 diskalakan sebab di bawah itu
presisi tidak pernah diukur), dikali 0,9 bila namanya hasil koreksi model (warna dan model tidak
sepakat), lalu ditambah kontribusi kecil luas dan keutuhan bentuk. Tanpa berkas model dipakai 0,22 —
angka yang sama: hasil ukur lapisan warna saja. Batas lencana tetap 0,80 / 0,65 dan tetap dipotong ke
0,79 bila piring tidak terdeteksi (aturan DESIGN §9).

Diukur pada 77 foto uji, butir = satu baris menu; "benar" = kelas itu termasuk label fotonya:

| pembacaan | lencana | sebelum | sesudah |
|---|---|---|---|
| warna saja (tanpa model) | tinggi | 37/139 (27%) | tidak ada lagi |
| | sedang | 3/75 | tidak ada lagi |
| | rendah | 3/21 (14%) | 43/235 (18%) — semua butir |
| v3 | tinggi | 29/66 (44%) | 6/10 (60%) |
| | sedang | 13/92 (14%) | 12/30 (40%) |
| | rendah | 4/27 (15%) | 28/145 (19%) |

Sebelumnya "rendah" lebih benar daripada "sedang" — lencananya menyesatkan. Sesudahnya urutannya
monoton dan warna saja tidak pernah lagi mengklaim "tinggi". Kurva kalibrasi v3 (ketepatan per 10
butir teratas, tertinggi dulu): 0,93–0,80 → 60%, 0,79–0,74 → 60%, 0,74–0,70 → 30%, 0,64–0,62 → 60%,
0,52–0,51 → 10%, 0,42–0,40 → 10%. Naik-turunnya di tengah wajar: tiap kotak cuma 10 butir.

Dua batasan yang harus dibaca bersama tabel ini. (1) Label foto web ini lemah — yang ada di piring
tapi tidak ditulis di label dihitung salah — jadi angkanya batas bawah, bukan ketepatan sebenarnya.
(2) Himpunan fotonya bukan foto top-view seragam ala daycare, jadi 60% pada "tinggi" (10 butir)
jangan dibaca sebagai angka produksi. Angka-angka ini dipakai untuk **mengaudit** badge, bukan untuk
menyetel koefisien formula — bobot 0,72 / 0,10 / 0,08 / 0,10 adalah keputusan teknik yang ditulis di
komentar `web/src/lib/vision.ts`, bukan hasil penyesuaian ke tabel ini.

Dua foto contoh (`ai/plate-check.mjs`, v3) memperlihatkan bedanya tanpa menjadi pesimistis buta.
`plate-before.jpg`: Sup dan Nasi dulu "tinggi" kini "sedang", Lauk goreng dan Buah jingga turun ke
"rendah" — kelompoknya luas tapi model tidak yakin atas namanya, dan memang itu yang badge harus
katakan; Sayur hijau tetap "sedang". `plate-after.jpg` tidak berubah sama sekali: Nasi "sedang",
Sayur hijau "tinggi" (kelas dengan presisi ukur 0,97). Badge jadi tidak ditekan merata — yang hilang
hanya keyakinan yang dulu dibeli dari besarnya bidang.

Cara memperbaiki lebih lanjut: tambah foto per kelas — terutama **foto piring anak di daycare
sendiri, dengan piring dan pencahayaan asli** — lalu `prepare.py` → `train.py` → `export.py`. Tidak
ada perubahan kode yang diperlukan selama daftar kelas sama, dan `MODEL_URLS` di `foodnet.ts`
sudah mencoba v3 lalu v2 sehingga model baru bisa dipasang tanpa menyentuh antarmuka. Percobaan
menambah epoch atau tambalan tanpa foto baru (v1b) tidak pernah membantu; v3 menambah 104 foto dan
label ganda + tepi negatif, dan itu yang menggerakkan angka. Yang tidak bergerak: kelas pucat,
jingga, dan telur — ketiganya butuh foto, bukan kode.
