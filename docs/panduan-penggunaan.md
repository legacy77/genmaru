# Panduan Penggunaan Genmaru

**Genmaru** adalah tool web lokal untuk membuat caption TikTok dan menganalisa
akun TikTok (diagnosa video, optimasi bio, analisa caption/hashtag, strategi
posting, ide konten & tren). Tool ini tidak memakai API key sendiri — semua
permintaan AI diteruskan ke gateway LLM lokal **9router** yang sudah berjalan
di komputermu.

---

## 1. Prasyarat

| Kebutuhan | Keterangan |
|---|---|
| Node.js | v24 (sudah terpasang di sistem ini). Cek: `node --version` |
| Gateway 9router | Harus aktif di `http://127.0.0.1:20128/v1` |
| Browser modern | Chrome / Edge / Firefox (untuk ekstraksi frame video) |
| Tanpa `npm install` | Project ini zero-dependency, langsung jalan |

### Cara memastikan gateway aktif

Jalankan di PowerShell:

```powershell
node -e "fetch('http://127.0.0.1:20128/v1/models',{headers:{'Authorization':'Bearer <API_KEY>'}}).then(r=>r.json()).then(d=>console.log('model tersedia:',d.data.length))"
```

Kalau gagal dengan `ECONNREFUSED` / `fetch failed`, berarti gateway belum
jalan — jalankan dulu aplikasi 9router/opencode-sidecar yang biasa kamu pakai,
baru jalankan Genmaru.

---

## 2. Setup pertama kali

1. Buka folder project:
   ```powershell
   cd D:\Dhika\Genmaru
   ```
2. Salin file contoh konfigurasi:
   ```powershell
   Copy-Item config.example.json config.json
   ```
3. Buka `config.json` dan isi `gateway.apiKey` dengan API key gateway
   9router-mu. Kamu juga bisa melewati langkah ini dengan salah satu cara:
   - set environment variable `GENMARU_API_KEY`, atau
   - biarkan kosong — server otomatis membaca key dari
     `~/.config/opencode/opencode.json` (provider `9router`).

4. (Opsional) Ganti `port` kalau `3210` bentrok dengan aplikasi lain.

> `config.json` sudah masuk `.gitignore` — tidak akan ter-commit. Jangan
> pernah menaruh API key asli di `config.example.json`.

---

## 3. Menjalankan

```powershell
node server.js
```

Kalau berhasil, terminal menampilkan:

```
Genmaru jalan di http://localhost:3210
Gateway: http://127.0.0.1:20128/v1
```

Buka `http://localhost:3210` di browser. Untuk berhenti, tekan `Ctrl+C`.

---

## 4. Cara memakai tiap fitur

Di header ada dropdown **model** — biarkan `(model default)` untuk memakai
model bawaan, atau pilih model spesifik dari gateway. Indikator status di
sampingnya menunjukkan progres dan pesan error.

### 4.1 Generator (caption dari topik)

1. Buka tab **Generator**.
2. Isi **Topik** (mis. `kopi susu gula aren`), **Niche** (mis. `kuliner`),
   **Tone**, **Audiens**, dan **Jumlah** varian (1–10).
3. Klik **Generate**. Hasil berupa caption bernomor + hashtag per varian.
4. Salin manual dari kotak hasil (blok teks → `Ctrl+C`).

### 4.2 Video → Caption (caption dari video upload)

1. Buka tab **Video → Caption**.
2. Klik **Choose File**, pilih video (maks **50 MB**, format **mp4/webm**).
3. Tunggu sampai muncul **3 frame** di bawah preview — artinya browser sudah
   mengekstrak gambar untuk dianalisa AI.
4. (Sangat disarankan) Isi **Transkrip** — tempel isi omongan/teks di video.
   Tanpa transkrip, AI hanya menebak dari 3 gambar.
5. Isi Topik/Niche/Tone/Jumlah, klik **Generate dari Video**.
6. Kalau tombol diklik sebelum frame siap, aplikasi menolak dengan pesan
   "Pilih video dulu sampai frame siap".

> Video tidak pernah diunggah utuh ke server — hanya 3 frame JPEG yang
> dikirim. Kalau browser tidak bisa membaca videomu, isi transkrip manual
> lalu generate (aplikasi otomatis fallback ke mode teks).

### 4.3 Analisa Video (diagnosa performa)

1. Buka tab **Analisa Video**.
2. Tempel **deskripsi video** + **metriknya** (views, likes, komentar,
   watch time, mis. dari TikTok Studio).
3. Klik **Analisa**. Kamu dapat: diagnosa performa, evaluasi hook 3 detik,
   rekomendasi perbaikan, dan 3 ide video lanjutan.

### 4.4 Analisa Profil (optimasi bio)

1. Buka tab **Analisa Profil**.
2. Isi **bio saat ini**, **niche**, dan **target audiens**.
3. Klik **Analisa**. Kamu dapat: 3 varian bio baru + saran username,
   foto profil, dan alasannya.

### 4.5 Analisa Caption (evaluasi caption & hashtag)

1. Buka tab **Analisa Caption**.
2. Tempel **caption yang pernah dipakai**, **hashtagnya**, dan **metriknya**.
3. Klik **Analisa**. Kamu dapat: caption paling efektif + alasannya, pola
   hashtag yang bekerja, perbaikan konkret, dan 5 hashtag baru untuk dicoba.

### 4.6 Strategi Posting & Tren

Tab **Strategi & Tren** berisi dua alat:

- **Analisa Strategi** — tempel histori posting (tanggal, jam, performa),
  dapat jam/hari upload terbaik, frekuensi ideal, dan rencana konten 7 hari.
- **Ide Konten & Tren** — isi niche + topik yang diminati, dapat 10 ide
  konten, format/hook yang bekerja, hashtag tren, dan ide seri konten.

### 4.7 Riwayat

1. Buka tab **Riwayat** untuk melihat semua hasil generate & analisa
   (terbaru di atas). Klik **Muat ulang** untuk refresh.
2. Semua entri tersimpan di `data/history.json` di folder project.
3. Menghapus riwayat: saat ini lewat API —
   `DELETE http://localhost:3210/api/history/<id>` (id terlihat di file
   `data/history.json`).

---

## 5. Konfigurasi lanjutan (`config.json`)

| Field | Default | Fungsi |
|---|---|---|
| `port` | `3210` | Port server web |
| `gateway.baseURL` | `http://127.0.0.1:20128/v1` | Alamat gateway LLM |
| `gateway.timeoutMs` | `90000` | Batas tunggu per request (90 detik) |
| `models.default` | `gemini/gemini-3.8-flash` | Model teks utama |
| `models.fallback` | `gh/gpt-4o-mini` | Model cadangan bila utama gagal |
| `models.vision` | `gemini/gemini-3.8-flash` | Model vision utama (video/screenshot) |
| `models.visionFallback` | `ag/gemini-3.8-flash` | Model vision cadangan |
| `limits.maxVideoMB` | `50` | Batas ukuran video |
| `limits.maxTokens` | `2000` | Token maksimum jawaban (jangan di bawah 2000 — model reasoning bisa mengembalikan jawaban kosong) |

Daftar model yang bisa dipilih di dropdown diambil live dari gateway
(`GET /api/models`).

---

## 6. Troubleshooting

| Gejala | Penyebab & solusi |
|---|---|
| `Gateway 9router tidak aktif di http://127.0.0.1:20128` | Gateway belum jalan. Jalankan dulu aplikasi gateway-mu, lalu refresh browser. |
| Hasil kosong / loading lama lalu timeout | Model reasoning sedang lambat. Coba lagi, atau pilih model lebih cepat di dropdown. Timeout 90 detik. |
| `STATUS 503` di semua fitur | Sama seperti di atas — gateway mati. |
| Video → Caption hasilnya tidak nyambung | AI hanya melihat 3 frame. Tambahkan **transkrip** — kualitas naik drastis. |
| `Video melebihi 50 MB` | Kompres dulu videonya (atau potong bagian pentingnya). |
| `Durasi video tidak terbaca` / `Video tidak bisa dibaca browser` | Format/codec tidak didukung browser. Isi transkrip manual sebagai gantinya. |
| Port 3210 sudah dipakai | Ganti `port` di `config.json`, restart server. |
| `node --test test/` error `Cannot find module` | Itu quirk Node v24 di Windows. Pakai `node --test` (tanpa argumen) atau `node --test test/*.test.js`. |
| Riwayat hilang / `data/history.json` rusak | Server otomatis backup file rusak ke `data/history.json.bak` dan mulai dari kosong. Cek file `.bak` untuk recovery manual. |

---

## 7. Data & privasi

- Semua riwayat tersimpan **lokal** di `data/history.json` (sudah di-ignore
  git, tidak ter-commit).
- Satu-satunya data yang keluar dari komputermu adalah request ke **gateway
  lokal** (`127.0.0.1:20128`) — gateway-lah yang meneruskan ke provider
  model. Tidak ada koneksi langsung dari Genmaru ke internet.
- API key tidak pernah ditulis ke file yang ter-commit.

---

## 8. Struktur project (sekilas)

```
server.js              # server HTTP + routing API
config.json            # konfigurasimu (gitignored)
config.example.json    # contoh konfigurasi
lib/
  config.js            # baca config + resolve API key
  llm.js               # client gateway (chat, vision, fallback)
  prompts.js           # template prompt semua fitur
  history.js           # simpan/baca riwayat JSON
public/
  index.html           # UI 7 tab
  app.js               # logika UI + ekstraksi frame video
  style.css            # dark mode
data/history.json      # riwayat (gitignored)
test/                  # node --test
docs/
  panduan-penggunaan.md  # file ini
```

## 9. Endpoint API (untuk pengguna lanjutan)

| Method | Path | Kegunaan |
|---|---|---|
| `GET` | `/api/health` | Cek server + alamat gateway |
| `GET` | `/api/models` | Daftar model dari gateway |
| `POST` | `/api/caption` | Generate caption dari teks |
| `POST` | `/api/caption/video` | Generate caption dari frame + transkrip |
| `POST` | `/api/analyze/video` | Diagnosa performa video |
| `POST` | `/api/analyze/profile` | Optimasi bio/profil |
| `POST` | `/api/analyze/caption` | Analisa caption & hashtag |
| `POST` | `/api/analyze/strategy` | Strategi posting |
| `POST` | `/api/analyze/trend` | Ide konten & tren |
| `GET` | `/api/history?type=` | Daftar riwayat |
| `DELETE` | `/api/history/:id` | Hapus satu entri |
