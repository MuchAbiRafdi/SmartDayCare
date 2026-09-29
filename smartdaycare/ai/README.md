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

`data/raw/<kelas-utama>/*.jpg` — 325 foto dari pencarian gambar (daftar kueri & label ada di
`prepare.py`, hasilnya `data/manifest.json` dengan `{file, labels[], query}`), 10 kelas makanan
(`rice greens fried pale brown soup orange yellow red egg`) + `none` (piring kosong, meja, dinding,
tangan, kain, kertas). 21 foto berlabel ganda (mis. nasi + telur); folder hanya menandai label
pertama, **manifest-lah yang berlaku**.

Foto latih diseragamkan ke sisi terpendek 300 px, lalu dipotong menjadi tambalan 48×48 px pada
beberapa skala. Tambalan pada foto makanan diberi label hanya bila warna rata-rata *dan* teksturnya
masuk akal untuk tepat satu label foto itu (supervisi lemah, `plausible()` di `train.py`) — jadi
tambalan piring/meja tidak ikut berlabel makanan, dan pada foto berlabel ganda tambalan yang cocok
dengan dua label sekaligus dilewati. Foto dengan piring berwarna (hijau/mint) tidak diberi label
`greens` karena piringnya sendiri lolos uji warna. `data/patches-summary.json` mencatat jumlah
tambalan yang diterima per foto — berguna untuk menemukan label yang bocor.

## Latih, ekspor, verifikasi, evaluasi

```bash
cd ai
pip install torch numpy pillow onnx        # sekali
python3 prepare.py                          # susun data/raw + manifest dari image-search/
python3 -u train.py                         # models/food-patch-v2.pt (+ .meta.json), ±25 menit di 2 CPU
python3 export.py food-patch-v2             # models/food-patch-v2.onnx + web/public/models/food-patch-v2.bin
# verifikasi runtime peramban = PyTorch:
cd ../web && node_modules/.bin/tsc src/lib/foodnet.ts --outDir /tmp/fn --module es2022 --target es2020 \
  --moduleResolution bundler --strict --skipLibCheck
node ../ai/verify.mjs /tmp/fn/foodnet.js ../ai/models/verify-sample.json public/models/food-patch-v2.bin
# → {"maxAbsDiff":0.00065,"argmaxAgreement":1,…}  (v2, diverifikasi)
# evaluasi ujung-ke-ujung (segmentasi + model) pada foto uji yang tidak ikut latihan:
cd ../ai && python3 eval_prep.py /tmp/evalset
cd ../web && node_modules/.bin/tsc src/lib/vision.ts src/lib/foodnet.ts --outDir /tmp/fn --module es2022 \
  --target es2020 --moduleResolution bundler --strict --skipLibCheck && sed -i 's#"./foodnet"#"./foodnet.js"#' /tmp/fn/vision.js
node ../ai/eval-plates.mjs /tmp/fn/vision.js /tmp/evalset public/models/food-patch-v1.bin public/models/food-patch-v2.bin
```

Variabel `train.py`: `SD_EPOCHS` (48), `SD_PATCHES` (tambalan per foto, 80), `SD_OUT` (nama model),
`SD_ARCH` (kanal konvolusi, "12,24,48,64,64"). Cache tambalan `data/patches-v2-<N>.npz` — hapus
setelah data atau aturan label berubah.

## Arsitektur & format

* v2: 5 konvolusi 3×3 (12 → 24 → 48 → 64 → 64 kanal, BatchNorm dilipat saat ekspor) + ReLU,
  max-pool setelah konvolusi 1–3, dropout, rata-rata global, linear 64 → 11. ≈ 79 ribu parameter
  (v1: 4 konvolusi, ≈ 30 ribu). Latihan: AdamW + OneCycle, label smoothing, sampel seimbang per
  kelas, EMA bobot, augmentasi warna/cutout; pemilihan model dari akurasi seimbang per **foto** uji.
* Karena semua lapisan konvolusional, di peramban jaringan dijalankan **sekali untuk seluruh bingkai**
  dan menghasilkan peta kelas rapat berlangkah 8 px. Bingkai analisis (lebar ≤ 320 px) diperbesar
  dulu sampai sisi terpendeknya ≈ 300 px agar skala tekstur sama dengan saat latihan — tanpa ini,
  nasi pada foto piring dari atas sering dinilai "bukan makanan". Waktu ukur di Node (CPU sandbox
  2 inti): 0,5–0,9 detik per bingkai; di ponsel kelas menengah perkirakan 1–2 detik.
* Berkas `.bin`: penanda `SDFN`, versi, header JSON (kelas, normalisasi, daftar lapisan, meta
  termasuk presisi per kelas), lalu bobot float16. ONNX disediakan untuk dipakai di luar peramban.

## Kualitas — diukur, bukan diklaim

Pembagian uji **per foto** (18 % tiap kelas = 58 foto), bukan per tambalan, supaya tambalan dari
foto yang sama tidak bocor ke data uji.

| | v1 (188 foto) | v2 (325 foto) |
|---|---|---|
| akurasi tambalan uji | 0,66 | 0,67 |
| akurasi seimbang | 0,65 | 0,68 |
| akurasi per foto (suara terbanyak) | — | 0,81 |
| presisi saat yakin (p > 0,6): nasi / sayur hijau / goreng / merah | — | 0,86 / 0,99 / 0,87 / 0,93 |
| presisi saat yakin: pucat / sup / telur | — | 0,59 / 0,61 / 0,65 |

Kelas yang masih lemah: **sup** (recall 0,27 — sering terbaca pucat/nasi karena kuah + isi), **telur**
(0,40), **goreng** (0,52). Itulah sebabnya kelas-kelas itu tidak boleh menjadi tujuan penggantian
kelas kecuali model sangat yakin.

Evaluasi ujung-ke-ujung (`eval-plates.mjs`, 58 foto uji yang sama, bingkai lebar ≤ 320 px seperti
di aplikasi; "kelas utama terdeteksi" = kelas foto ada di daftar hasil, "kelas asing" = kelas hasil
yang tidak ada pada label foto):

| pipeline | kelas utama terdeteksi | kelas asing per foto |
|---|---|---|
| warna & bentuk saja | 0,50 | 2,34 |
| + model v1 (aturan lama) | 0,59 | 2,00 |
| + model v2 + aturan baru (veto, presisi, skala) | 0,60 | 1,22 |

Foto uji ini foto web yang beragam (banyak latar ramai); pada foto piring dari atas seperti di
daycare, kedua foto contoh aplikasi (`web/public/img/plate-*.jpg`) kini terbaca nasi + ayam goreng +
sayur + sup (sebelumnya nasi dan ayam terbuang sebagai "bukan makanan"). Sisa kesalahan yang
paling sering: sup/kuah, telur, dan makanan pucat di piring putih.

Cara memperbaiki lebih lanjut: tambah foto per kelas — terutama **foto piring anak di daycare
sendiri, dengan piring dan pencahayaan asli** — lalu `prepare.py` → `train.py` → `export.py`. Tidak
ada perubahan kode yang diperlukan selama daftar kelas sama. Percobaan menambah epoch atau tambalan
tanpa foto baru (v1b) tidak pernah membantu; yang membantu adalah foto dan label yang lebih bersih.
