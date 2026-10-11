# Genmaru 🎬✨

> **Caption TikTok auto-gercep, analisa akun on-point. Jalan lokal, zero drama.**

Pernah nulis caption sampe nge-blank? Atau udah posting tapi views-nya gitu-gitu aja? Genmaru nih jawabannya. Ini tool web yang **jalan di komputermu sendiri** — bantu kamu nulis caption TikTok yang bikin orang stop scroll, plus ngasih insight biar follower naik terus. 🚀

Nggak perlu langganan, nggak perlu upload data ke cloud orang. Semua di lokal, pakai otak AI dari gateway yang udah kamu punya. Aman, privat, gratis. 🔥

---

## 🤔 Genmaru ini buat apa sih?

Intinya, ini kayak **co-pilot TikTok** kamu:

- 🎯 **Bikin caption yang nggak boring** — tinggal kasih topik, AI racik caption + hashtag yang relate sama audiens.
- 📹 **Upload video → auto caption** — kasih videonya, AI lihat isinya, langsung nulis caption yang nyambung.
- 🔍 **Bedah performa video** — kenapa si A viral tapi si B sepi? AI diagnosa.
- 👤 **Poles bio & profil** — bikin orang pengen klik follow.
- #️⃣ **Audit caption & hashtag** — mana yang ngefek, mana yang buang-buang.
- 📅 **Strategi posting & ide konten** — kapan posting, konten apa, biar cuan follower.

---

## 🛠️ Yang kamu butuhin (prasyarat)

| Kebutuhan | Kenapa |
|---|---|
| **Node.js** (v20+ aman, v24 tested) | Buat jalanin servernya. Cek: `node --version` |
| **Gateway LLM lokal** | Sumber "otak" AI-nya. Default: `9router` di `http://127.0.0.1:20128/v1` |
| **Browser modern** | Chrome/Edge/Firefox — buat fitur upload video |

> 💡 **Zero dependency.** Nggak ada `npm install`, nggak ada `node_modules` numpuk. Tinggal jalan. 🧘

---

## 🚀 Cara Install & Jalanin

### 1. Clone repo-nya

```bash
git clone https://github.com/legacy77/genmaru.git
cd genmaru
```

### 2. Bikin file config

```bash
# Windows (PowerShell)
Copy-Item config.example.json config.json

# Mac/Linux
cp config.example.json config.json
```

Buka `config.json`, isi bagian `gateway.apiKey` pakai API key gateway-mu. Atau nggak usah ribet — kamu bisa:

- set environment variable `GENMARU_API_KEY`, **atau**
- biarin aja kosong, nanti otomatis kebaca dari `~/.config/opencode/opencode.json`

### 3. Nyalain gateway-nya

Pastikan gateway LLM lokal (9router) udah nyala di `http://127.0.0.1:20128`. Cek cepat:

```bash
curl http://127.0.0.1:20128/v1/models
```

Kalau error `ECONNREFUSED`, berarti gateway belum nyala. Nyalain dulu, baru lanjut. ⚡

### 4. Gas jalanin!

```bash
node server.js
```

Buka browser ke 👉 **http://localhost:3210**

Selesai. Tinggal pake. 🎉

---

## 📖 Cara Pakai (gampang banget)

Di header ada dropdown **model** — biarin default aja kalau bingung. Setiap proses bakal ada **spinner + loading** biar kamu tau lagi kerja, nggak nge-hang. ✨

### ✍️ Generator — caption dari topik
1. Buka tab **Generator**
2. Isi topik (misal: `kopi susu gula aren`), niche, tone, audiens, jumlah varian
3. Klik **Generate** → dapet caption + hashtag
4. Klik **Copy** buat nyalin hasilnya 📋

### 🎥 Video → Caption — caption dari videomu
1. Buka tab **Video → Caption**
2. Pilih video (maks **50 MB**, format **mp4/webm**)
3. Tunggu sampai muncul **3 frame** (browser ekstrak otomatis, ada progresnya)
4. **Isi transkrip** kalau ada — ini bikin hasil jauh lebih akurat 💯
5. Klik **Generate dari Video**

> Video kamu **nggak diupload** ke mana-mana. Browser cuma ambil 3 frame buat dianalisa. Privasi aman. 🔒

### 🔍 Analisa Video / 👤 Profil / #️⃣ Caption
Tempel data yang kamu punya (deskripsi, metrik, bio, caption, hashtag) → klik **Analisa** → dapet insight actionable.

### 📅 Strategi & Tren
Dua alat: **Analisa Strategi** (kapan jam terbaik posting) dan **Ide Konten & Tren** (ide konten + hashtag yang lagi naik).

### 🗂️ Riwayat
Semua hasil tersimpan lokal di `data/history.json`. Bisa difilter per tipe, bisa dihapus.

---

## ⚙️ Konfigurasi

Semua di `config.json`:

| Field | Default | Fungsi |
|---|---|---|
| `port` | `3210` | Port server |
| `gateway.baseURL` | `http://127.0.0.1:20128/v1` | Alamat gateway LLM |
| `gateway.timeoutMs` | `90000` | Batas tunggu request |
| `models.default` | `gemini/gemini-3.8-flash` | Model teks utama |
| `models.vision` | `gemini/gemini-3.8-flash` | Model buat baca gambar/frame |
| `limits.maxVideoMB` | `50` | Batas ukuran video |

Daftar model di dropdown diambil live dari gateway kamu — mau ganti model tinggal pilih. 🎛️

---

## 🧪 Testing

```bash
node --test
```

> ⚠️ **Catatan Node v24 di Windows:** jangan pakai `node --test test/` (bentuk direktori) — bakal error `Cannot find module`. Pakai `node --test` aja atau `node --test test/*.test.js`.

---

## 🩹 Kalau ada masalah

| Gejala | Solusi |
|---|---|
| `Gateway 9router tidak aktif` | Gateway belum nyala. Nyalain dulu, refresh browser. |
| Loading lama / hasil kosong | Model lagi lambat. Coba lagi atau pilih model lebih cepat di dropdown. |
| Video → caption nggak nyambung | Isi **transkrip** manual — akurasi naik drastis. |
| `Video melebihi 50 MB` | Kompres dulu videonya. |
| Port 3210 kepake | Ganti `port` di `config.json`, restart. |

---

## 📁 Struktur Project

```
genmaru/
├─ server.js              # server HTTP + API + log aktivitas
├─ config.example.json    # contoh config
├─ lib/
│  ├─ config.js           # baca config & resolve API key
│  ├─ llm.js              # client ke gateway (chat, vision, fallback)
│  ├─ prompts.js          # semua prompt template
│  └─ history.js          # simpan riwayat
├─ public/                # UI (HTML/CSS/JS vanilla)
├─ data/                  # riwayat lokal (gitignored)
├─ test/                  # node --test
└─ docs/                  # panduan lengkap
```

---

## 🔒 Privasi

- Semua riwayat **tersimpan lokal** di `data/history.json`.
- Satu-satunya koneksi keluar cuma ke **gateway lokal** kamu sendiri.
- API key **nggak pernah** ke-commit (udah masuk `.gitignore`).

---

## 🤝 Kontribusi

Mau nambah fitur atau benerin bug? Pull request aja! Buka issue dulu kalau mau diskusi. Semua welcome. 🙌

---

**Dibuat dengan ☕ + 🔥 buat para kreator TikTok Indonesia.**

Kalau project ini ngebantu, kasih ⭐ ya biar makin banyak yang nemu!
