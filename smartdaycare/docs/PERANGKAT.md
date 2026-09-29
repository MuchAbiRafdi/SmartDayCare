# Menghubungkan sensor udara dan kamera

SmartDaycare bekerja tanpa perangkat apa pun (angka udara dan gambar kamera ditandai sebagai
**contoh** di layar). Begitu perangkat sungguhan terhubung, nilai contoh untuk ruangan itu
otomatis digantikan dan labelnya berubah menjadi **sensor** / **langsung**.

Semua perangkat didaftarkan admin dari menu **Admin → Perangkat & pesan → Tambah perangkat**.
Saat perangkat dibuat, sebuah **token perangkat** (`sd_…`) ditampilkan **satu kali**. Simpan di
perangkat; token tidak bisa dilihat lagi, hanya dibuat ulang.

## 1. Sensor udara (suhu, kelembapan, CO₂, PM2.5)

Sensor apa pun yang bisa mengirim HTTP (ESP32/ESP8266, Raspberry Pi, gateway Tuya/Shelly lewat
skrip, dsb.) cukup mengirim JSON setiap 30–60 detik:

```
POST https://DOMAIN/api/devices/ingest
X-Device-Token: sd_xxxxxxxx
Content-Type: application/json

{"temp": 27.4, "hum": 61, "co2": 812, "pm25": 9, "battery": 87}
```

* Kolom boleh sebagian (mis. hanya `co2`). Satuan: °C, %, ppm, µg/m³, % baterai.
* Nilai di luar rentang wajar ditolak (HTTP 422) supaya sensor rusak tidak memicu peringatan palsu.
* Maksimum 60 kiriman per menit per perangkat.
* Bila tidak ada kiriman lebih dari **10 menit**, ruangan ditandai *tidak ada kiriman* dan
  nilai terakhir tidak lagi dipakai untuk peringatan.

### Contoh ESP32 (Arduino)

```cpp
#include <WiFi.h>
#include <HTTPClient.h>
const char* TOKEN = "sd_xxxxxxxx";
void kirim(float temp, float hum, int co2, float pm25) {
  HTTPClient http;
  http.begin("https://DOMAIN/api/devices/ingest");
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Token", TOKEN);
  String body = "{\"temp\":" + String(temp,1) + ",\"hum\":" + String(hum,0) +
                ",\"co2\":" + String(co2) + ",\"pm25\":" + String(pm25,1) + "}";
  http.POST(body);
  http.end();
}
```

### Lewat MQTT (opsional)

Bila sensor sudah terhubung ke broker MQTT, isi `SD_MQTT_URL=mqtt://user:pass@broker:1883`
(paket `paho-mqtt` sudah ada di citra Docker). API berlangganan topik
`smartdaycare/sensors/+` dan menerima payload JSON yang sama ditambah kolom `token`:

```
smartdaycare/sensors/ruang-bermain  {"token":"sd_xxx","co2":812,"temp":27.4}
```

## 2. Kamera

Ada dua cara, pilih yang cocok dengan kamera Anda.

### A. Foto berkala (paling sederhana, cocok untuk kamera IP murah / Raspberry Pi)

Kirim JPEG (≤ 256 KB) setiap 2–10 detik:

```
POST https://DOMAIN/api/devices/snapshot
X-Device-Token: sd_xxxxxxxx
Content-Type: image/jpeg

<isi berkas JPEG>
```

Contoh dari Linux/Raspberry Pi dengan `ffmpeg` (ambil satu bingkai RTSP tiap 3 detik):

```bash
while true; do
  ffmpeg -loglevel error -rtsp_transport tcp -i "rtsp://user:pass@192.168.1.50:554/stream1" \
    -frames:v 1 -vf scale=640:-1 -q:v 6 -f image2 - \
  | curl -s -X POST "https://DOMAIN/api/devices/snapshot" \
      -H "X-Device-Token: sd_xxxxxxxx" -H "Content-Type: image/jpeg" --data-binary @-
  sleep 3
done
```

Di dasbor, kamera menampilkan foto terbaru yang diperbarui otomatis; bila tidak ada foto baru
selama 60 detik, kamera ditandai *terputus*.

### B. Siaran langsung (HLS) lewat MediaMTX

Peramban tidak bisa memutar RTSP. `deploy/docker-compose.yml` menyertakan **MediaMTX**
(profil `kamera`) yang mengubah RTSP menjadi HLS di jalur `/stream/<nama>/index.m3u8`.

1. Tulis kamera di `deploy/mediamtx.yml`:
   ```yaml
   paths:
     ruang-bermain:
       source: rtsp://admin:katasandi@192.168.1.50:554/stream1
       sourceOnDemand: yes
   ```
2. Jalankan `docker compose --profile kamera up -d`.
3. Di **Admin → Perangkat & pesan**, tambah kamera dan isi *Alamat siaran* dengan
   `/stream/ruang-bermain/index.m3u8`.

Caddy hanya meneruskan `/stream/*` untuk pengguna yang sudah masuk (`forward_auth` ke
`/api/devices/stream-check`); orang tua hanya dapat membuka kamera yang ditandai
*terlihat orang tua*. Alamat siaran harus berada di domain situs ini — alamat luar
(`http://192.168…`) ditolak karena akan diblokir kebijakan keamanan peramban.

Format lain yang didukung di *Alamat siaran*: MJPEG (`…/stream.mjpg`) dan gambar statis
(`…/snapshot.jpg`) — keduanya juga harus dilayani lewat jalur `/stream/…` (tambahkan
`reverse_proxy` di `Caddyfile` bila perlu).

## 3. Memeriksa status

* **Admin → Perangkat & pesan** menampilkan setiap perangkat: terhubung/terputus, kiriman
  terakhir, baterai.
* **Admin → Ringkasan & udara** menampilkan sumber tiap angka (sensor / nilai contoh / sensor
  tidak mengirim).
* Bila perangkat dinonaktifkan, tokennya berhenti berlaku seketika; hapus perangkat untuk
  mengembalikan tampilan contoh di ruangan itu (mode data contoh).
