# Dasar Privasi Student Schedule Generator

_Kemaskini: 27 Oktober 2026_

Student Schedule Generator ialah extension Chrome tidak rasmi untuk pelajar UPM. Ia bukan aplikasi Universiti Putra Malaysia.

## Data yang dibaca
Bila kau tekan **Jana Jadual** dalam eSMP, extension membaca dua halaman dari `esmp.upm.edu.my` menggunakan sesi login kau yang sedia ada:
- jadual waktu kuliah (kod kursus, nama kursus, masa, tempat)
- jadual waktu peperiksaan (kod kursus, tarikh, masa, tempat)

Extension **tidak** membaca, menyimpan atau menghantar password eSMP kau.

## Di mana data disimpan
- Jadual disimpan dalam storan tempatan Chrome kau (`chrome.storage.local`) supaya halaman Student Schedule Generator boleh memaparkannya. Data ini kekal dalam komputer kau.
- Pilihan kau (tema, saiz, tajuk, nama pendek subjek) juga disimpan secara tempatan.

## Data yang dihantar keluar
Tiada. Student Schedule Generator tiada server, tiada analitik, dan tiada iklan.

Kalau kau guna **Hantar ke phone**, jadual dimampatkan ke dalam bahagian `#` sebuah link ke website Student Schedule Generator (GitHub Pages). Pelayar web tidak menghantar bahagian `#` ke server, jadi jadual kau tidak sampai ke GitHub atau sesiapa. Link itu hanya dikongsi ke mana kau sendiri pilih (contohnya scan QR, atau hantar kepada diri sendiri).

## Kebenaran extension
- `esmp.upm.edu.my`: untuk membaca jadual kau dari eSMP dan memaparkan butang Jana Jadual.
- `storage`: untuk menyimpan jadual dan pilihan kau secara tempatan.

## Padam data
Buang extension dari `chrome://extensions` untuk memadam semua data yang disimpan.

## Hubungi
Buka isu di https://github.com/naaasruul/upmscheduler/issues
