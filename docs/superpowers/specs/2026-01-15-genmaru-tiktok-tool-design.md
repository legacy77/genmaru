# Genmaru — TikTok Caption Generator & Account Analyzer

**Date:** 2026-01-15
**Status:** Approved (design phase)
**Author:** Dhika (with brainstorming session)

---

## 1. Purpose & Success Criteria

**Tujuan:** Tool web lokal untuk (a) generate caption TikTok yang meningkatkan
follower, dan (b) menganalisa akun TikTok pengguna untuk memberi insight
pertumbuhan.

**Bukan tujuan (non-goals):**
- Bukan SaaS / multi-user. Single user, lokal saja.
- Bukan auto-posting ke TikTok.
- Bukan scraping otomatis TikTok (v1).
- Bukan dashboard analitik enterprise dengan chart kompleks (v1).

**Kriteria sukses:**
1. `node server.js` → buka `http://localhost:3210` → UI langsung jalan tanpa build step.
2. Generate caption menghasilkan N varian + hashtag relevan dalam < 30 detik.
3. Upload video → dapat caption yang sesuai isi video (via frame + transkrip opsional).
4. Analisa akun menghasilkan insight actionable untuk 5 kategori.
5. Semua data tersimpan lokal; tidak ada data keluar kecuali ke gateway LLM lokal.
6. Test suite lulus via `node --test`.

---

## 2. Constraints (terverifikasi di sistem)

| Constraint | Nilai terverifikasi |
|---|---|
| OS | Windows, PowerShell (execution policy ketat; npm via `cmd /c`) |
| Node | v24.20.0 |
| Python | Tidak ada |
| ffmpeg / ffprobe / whisper / yt-dlp | Tidak ada |
| npm | 12.0.2 (dipakai hanya jika terpaksa; v1 zero-dep) |
| LLM gateway | `http://127.0.0.1:20128/v1` (provider `9router`), OpenAI-compatible |
| Auth gateway | Bearer token dari `~/.config/opencode/opencode.json` |
| Vision support | `gemini/gemini-3.8-flash`, `ag/gemini-3.8-flash`, `kr/claude-sonnet-4.5` → HTTP 200 dgn gambar |
| Vision TIDAK support | `gh/gpt-4o-mini` (tolak `image media type not supported`) |
| Audio endpoint | `/v1/audio/transcriptions` ada (bisa dipakai nanti) |
| Internet | Tidak diperlukan oleh tool (gateway yang urus koneksi keluar) |

---

## 3. Architecture

**Pendekatan A: Node stdlib only, single-page, file JSON.**

- 1 proses Node (`http` module bawaan), tanpa `npm install`.
- Frontend: 1 HTML + CSS + JS vanilla, disajikan statis oleh server.
- Penyimpanan: file JSON di `data/`.
- Semua panggilan AI lewat gateway lokal.

```
D:\Dhika\Genmaru\
├─ server.js              # HTTP server: static files + API routing
├─ config.json            # gateway URL, API key, model default & fallback
├─ lib/
│  ├─ llm.js              # client gateway (chat, vision, stream, retry)
│  ├─ prompts.js          # prompt template semua fitur
│  ├─ history.js          # CRUD riwayat ke data/*.json
│  └─ video.js            # util terima frame base64 dari klien
├─ public/
│  ├─ index.html          # UI tab-based satu halaman
│  ├─ app.js              # logika frontend + ekstraksi frame video
│  └─ style.css           # styling dark mode, responsive
├─ data/
│  ├─ history.json        # riwayat generate & analisa
│  └─ uploads/            # thumbnail frame video (opsional, bisa dibersihkan)
├─ test/
│  ├─ prompts.test.js
│  ├─ llm.test.js
│  └─ history.test.js
└─ docs/superpowers/specs/ # dokumen ini
```

**Kenapa A:** YAGNI. Kebutuhan = caption + analisa, bukan platform.
Zero-dep = tidak ada risiko build di Windows, gampang di-debug, mulai cepat.
Bisa naik ke SQLite/chart nanti tanpa mengubah arsitektur.

---

## 4. Components

### 4.1 `server.js`
- HTTP server di port `3210` (configurable).
- Sajikan file statis dari `public/`.
- Route API ke handler di `lib/`.
- Error handler global → JSON `{error}` + status yang tepat.
- Tanpa dependency eksternal (pakai `node:http`, `node:fs`, `node:path`, `node:url`).

### 4.2 `lib/llm.js`
- Fungsi `chat({model, messages, maxTokens})` → kirim ke gateway.
- Fungsi `chatVision({model, text, images})` → susun content array
  `[{type:text},{type:image_url,image_url:{url:"data:image/jpeg;base64,..."}}]`.
- Tangani **respons streaming** (gateway kadang balas `data:` SSE walau
  `stream:false`) → parse dan gabung `delta.content`.
- Retry: 1x retry model utama, lalu fallback ke `models.fallback` di config.
- Timeout 90s via `AbortController`.
- Deteksi gateway mati → error jelas: "Gateway 9router tidak aktif di
  `http://127.0.0.1:20128`".

### 4.3 `lib/prompts.js`
Template prompt untuk tiap fitur (Bahasa Indonesia, output terstruktur):
- `captionPrompt({topic, niche, tone, audience, count, extra})`
- `videoCaptionPrompt({transcript, frameCount, topic, niche, tone})`
- `analyzeVideoPrompt({description, metrics})`
- `analyzeProfilePrompt({bio, niche, target})`
- `analyzeCaptionPrompt({captions, hashtags, metrics})`
- `analyzeStrategyPrompt({postingHistory})`
- `analyzeTrendPrompt({niche, topics})`
Setiap prompt minta output format yang bisa diparsing (mis. blok bernomor +
bagian hashtag) dan gaya TikTok (hook kuat, singkat, relatable).

### 4.4 `lib/history.js`
- `list()`, `add(entry)`, `get(id)`, `remove(id)`.
- Simpan ke `data/history.json` (array). Tulis atomik (temp + rename).
- Entry: `{id, type, input, output, model, createdAt}`.
- Thumbnail frame video disimpan terpisah, dirujuk oleh `entry.frames[]`.

### 4.5 `public/app.js`
- Tab navigation (6 tab).
- **Ekstraksi frame video (client-side, tanpa dep):**
  1. Input `<input type=file accept="video/mp4,video/webm">`, batas 50MB.
  2. Buat `URL.createObjectURL(file)` → `<video>` tersembunyi.
  3. Tunggu `loadedmetadata`; ambil 3 frame pada 20% / 50% / 80% durasi
     via `canvas.drawImage` → `toDataURL('image/jpeg', 0.7)`.
  4. Kirim base64 frames + transkrip opsional (textarea) ke `/api/caption/video`.
  5. Video tidak diunggah penuh; hanya frame terpilih.
- Tombol copy hasil, dropdown pilih model, indikator loading.
- Tampilkan error gateway dengan jelas.

---

## 5. Data Flow

**Generate caption (teks):**
`UI form` → `POST /api/caption` → `prompts.captionPrompt` → `llm.chat` →
gateway → `history.add` → respons ke UI.

**Generate caption dari video:**
`UI pilih video` → browser ekstrak 3 frame (canvas) + transkrip →
`POST /api/caption/video {frames[], transcript, params}` →
`llm.chatVision` → gateway (model vision) → `history.add` (+ thumbnail) →
caption ke UI. **Fallback:** bila vision gagal, kirim teks (transkrip +
metadata) ke model teks.

**Analisa akun:**
`UI form / screenshot` → `POST /api/analyze/*` → `prompts.*` → `llm.chat`
(atau `chatVision` bila screenshot) → `history.add` → insight ke UI.

---

## 6. API Endpoints

| Method | Path | Input | Output |
|---|---|---|---|
| GET | `/api/models` | — | daftar model gateway |
| GET | `/api/health` | — | status gateway |
| POST | `/api/caption` | topic, niche, tone, audience, count | varian caption + hashtag |
| POST | `/api/caption/video` | frames[], transcript, params | caption dari video |
| POST | `/api/analyze/video` | description, metrics | diagnosa performa |
| POST | `/api/analyze/profile` | bio, niche, target | saran profil/bio |
| POST | `/api/analyze/caption` | captions, hashtags, metrics | analisa caption/hashtag |
| POST | `/api/analyze/strategy` | postingHistory | strategi posting & waktu |
| POST | `/api/analyze/trend` | niche, topics | ide konten & tren |
| POST | `/api/vision` | image base64 | deskripsi/ekstraksi dari gambar |
| GET | `/api/history` | ?type= | daftar riwayat |
| DELETE | `/api/history/:id` | — | hapus entri |

---

## 7. Error Handling

| Kondisi | Perilaku |
|---|---|
| Gateway mati / tidak reachable | HTTP 503 + pesan jelas cara cek gateway |
| Model error / 4xx | Retry model fallback; bila tetap gagal → HTTP 502 + detail |
| Timeout > 90s | Abort + HTTP 504 + saran coba model lebih cepat |
| Vision tidak didukung model | Auto-fallback ke mode teks + notifikasi di UI |
| Respons bukan JSON / SSE | Parser SSE; bila gagal → tampilkan raw di UI |
| Video > 50MB | Tolak di klien + pesan |
| Video tidak bisa di-decode browser | Fallback ke input transkrip manual |
| File `data/` korup | Backup ke `.bak` lalu mulai array kosong |

---

## 8. UI / UX

- **7 tab:** Generator · Video→Caption · Analisa Video · Analisa Profil ·
  Analisa Caption · Strategi & Tren · Riwayat.
- Dark mode default, layout responsif (mobile-friendly).
- Tiap tab: form kiri, hasil kanan (atau atas/bawah di mobile).
- Tombol **Copy** tiap hasil, **Regenerate**, dropdown model.
- Indikator loading + disable tombol saat proses.
- Riwayat: list entri, filter by type, hapus, klik untuk lihat ulang.

---

## 9. Testing Strategy

`node --test` (built-in, zero-dep).

- **`prompts.test.js`** — tiap fungsi prompt menghasilkan string yang memuat
  field input kunci (topik, niche, tone) dan instruksi format output.
- **`llm.test.js`** — dengan `fetch` di-mock:
  - respons JSON normal → konten ter-parse
  - respons SSE (`data:` lines) → konten tergabung
  - error 4xx → retry lalu fallback model
  - timeout → error 504
  - gateway mati → error 503
- **`history.test.js`** — add/list/get/remove; tulis atomik; recovery dari
  file korup.
- Tiap fitur non-trivial punya minimal 1 runnable check.

---

## 10. Out of Scope (v1) / Future

- Scraping otomatis TikTok.
- TikTok Official API.
- Auto-posting.
- SQLite + chart dashboard.
- Transkripsi audio otomatis (whisper / gateway audio endpoint) — endpoint ada,
  bisa ditambah nanti.
- Multi-user / auth.
