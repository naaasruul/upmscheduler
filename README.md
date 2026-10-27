# Student Schedule Generator

Jana wallpaper jadual kelas (iPhone/iPad, menegak/melintang) dan fail `.ics` untuk Calendar, terus dari eSMP UPM.

**Tidak rasmi. Bukan aplikasi UPM.** Password eSMP tak pernah disentuh: extension guna sesi login kau sendiri dalam browser, dan semua pemprosesan berlaku dalam browser kau.

Website: https://naaasruul.github.io/upmscheduler/ (cuba contoh: https://naaasruul.github.io/upmscheduler/#demo)

## Cara guna

1. Pasang extension (lihat bawah) dalam Chrome kat laptop.
2. Login eSMP. Tekan butang **Jana Jadual** di bucu kanan bawah (atau ikon Student Schedule Generator kat toolbar).
3. Pilih gaya (Comel / Gelap) dan saiz, kemudian **Muat turun PNG**. Atau tekan **Hantar ke phone**, scan QR guna phone, dan simpan gambar sebagai wallpaper.
4. Untuk Calendar: buka bahagian **Calendar (.ics)**, semak semester, dan **Muat turun .ics**. Buka fail tu kat iPhone, atau import ke Google Calendar.

## Pasang extension

Sebelum extension diterbitkan di Chrome Web Store:

1. Muat turun repo ni (Code → Download ZIP) dan extract.
2. Buka `chrome://extensions`, hidupkan **Developer mode**.
3. **Load unpacked**, kemudian pilih folder `app/`.

Extension cuma minta akses ke `esmp.upm.edu.my` dan storan tempatan.

## Struktur

```
app/                 extension Chrome + website (folder yang sama)
  manifest.json      extension Manifest V3
  ext/               content script (butang dalam eSMP) + service worker
  index.html, app.*  UI (laptop, phone, landing)
  core/              logik dikongsi: parser eSMP, model, lukisan canvas, .ics, QR share
  core/semesters.js  tarikh semester + cuti; KEMASKINI SETIAP SESI
tests/               ujian Node (guna respons eSMP sebenar, dianonimkan)
smp_scraper.py, gcal_sync.py   tool Python peribadi (scrape + sync Google Calendar)
```

## Kemaskini setiap semester

Edit `app/core/semesters.js` ikut Kalendar Akademik Bacelor terkini (tarikh mula/akhir kuliah, minggu cuti pertengahan, cuti umum dalam minggu kuliah). Jalankan `npm test`, kemudian push. Website akan dikemaskini sendiri melalui GitHub Actions. Extension perlu dimuat semula / dinaikkan versi.

## Pembangunan

```
npm test                         # ujian core (Node 22+)
python -m http.server 8765       # kemudian buka http://127.0.0.1:8765/app/#demo
                                 # semakan visual: /tests/visual.html?theme=gelap&size=ipad-landscape
python -m unittest -v test_smp   # ujian tool Python
```

Font: Inter dan Sacramento (SIL Open Font License, lihat `app/fonts/`). QR: qrcode-generator oleh Kazuhiko Arase (MIT).
