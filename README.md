# Genmaru — TikTok Caption Generator & Account Analyzer

Tool web lokal (zero-dependency) untuk membuat caption TikTok dan menganalisa akun TikTok,
ditenagai gateway LLM lokal `9router`. Tidak ada data yang dikirim keluar selain ke gateway lokal.

> 📖 **Panduan penggunaan lengkap:** [`docs/panduan-penggunaan.md`](docs/panduan-penggunaan.md)

## Menjalankan

1. Pastikan gateway 9router aktif di `http://127.0.0.1:20128`.
2. Salin `config.example.json` menjadi `config.json` dan isi `gateway.apiKey`
   (atau set environment variable `GENMARU_API_KEY`; server juga bisa membaca
   key dari `~/.config/opencode/opencode.json`).
3. Jalankan:

   ```bash
   node server.js
   ```

4. Buka `http://localhost:3210`.

## Fitur

- **Generator** — caption dari topik/niche/tone.
- **Video → Caption** — pilih video; browser mengekstrak 3 frame, AI menganalisa lalu menulis caption.
- **Analisa Video** — diagnosa performa video.
- **Analisa Profil** — optimasi bio & profil.
- **Analisa Caption** — evaluasi caption & hashtag.
- **Strategi & Tren** — strategi posting & ide konten.
- **Riwayat** — semua hasil tersimpan lokal di `data/history.json`.

## Test

```bash
node --test
```

`node --test` otomatis menemukan seluruh file `*.test.js` di folder `test/`.

> **Catatan (Node v24 di Windows):** jangan pakai bentuk direktori tanpa glob seperti
> `node --test test/` — di Node v24/Windows bentuk itu gagal dengan
> `Error: Cannot find module '...\test'`. Pakai `node --test` (discovery otomatis)
> atau `node --test test/*.test.js`.

## Konfigurasi

Lihat `config.example.json`. Model default & fallback bisa diganti kapan saja.
