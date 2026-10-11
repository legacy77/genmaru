const BASE_SYSTEM =
  'Kamu adalah copywriter TikTok Indonesia yang ahli membuat konten viral untuk menaikkan follower. ' +
  'Gaya: hook kuat di 3 detik pertama, bahasa sehari-hari, singkat, relatable, dan memancing komentar. ' +
  'Selalu balas dalam Bahasa Indonesia. Jangan memberi penjelasan tambahan di luar format yang diminta.';

function captionPrompt({ topic = '', niche = '', tone = 'santai', audience = 'umum', count = 5 }) {
  const n = Number(count) || 5;
  const user =
    `Buat ${n} varian caption TikTok.\n` +
    `Topik: ${topic}\nNiche: ${niche}\nTone: ${tone}\nAudiens: ${audience}\n\n` +
    `Format output (satu varian per baris):\n` +
    `<nomor>. <caption>\n   Hashtag: #tag1 #tag2 #tag3\n\n` +
    `Aturan: setiap caption maksimal 150 karakter, sertakan hook/pertanyaan, dan 3-5 hashtag relevan.`;
  return { system: BASE_SYSTEM, user };
}

function videoCaptionPrompt({ transcript = '', frameCount = 0, topic = '', niche = '', tone = 'santai', count = 5 }) {
  const n = Number(count) || 5;
  const user =
    `Saya melampirkan ${frameCount} frame dari sebuah video TikTok${transcript ? ' beserta transkripnya' : ''}.\n` +
    `Transkrip: ${transcript || '(tidak tersedia)'}\n` +
    `Topik: ${topic}\nNiche: ${niche}\nTone: ${tone}\n\n` +
    `Pertama, pahami isi video dari gambar. Lalu buat ${n} varian caption TikTok yang sesuai isi video.\n` +
    `Format output (satu varian per baris):\n` +
    `<nomor>. <caption>\n   Hashtag: #tag1 #tag2 #tag3\n\n` +
    `Aturan: caption maksimal 150 karakter, hook kuat, 3-5 hashtag relevan.`;
  return { system: BASE_SYSTEM, user };
}

function analyzeVideoPrompt({ description = '', metrics = '' }) {
  const user =
    `Analisa performa video TikTok berikut.\nDeskripsi video: ${description}\nMetrik: ${metrics}\n\n` +
    `Berikan analisa terstruktur:\n` +
    `1. Diagnosa: kenapa video ini performanya begitu?\n` +
    `2. Kekuatan & kelemahan hook 3 detik pertama\n` +
    `3. Rekomendasi perbaikan konkret\n` +
    `4. Ide 3 video lanjutan`;
  return { system: BASE_SYSTEM, user };
}

function analyzeProfilePrompt({ bio = '', niche = '', target = '' }) {
  const user =
    `Optimalkan profil TikTok berikut.\nBio saat ini: ${bio}\nNiche: ${niche}\nTarget audiens: ${target}\n\n` +
    `Berikan:\n1. 3 varian bio baru (maks 80 karakter, ada CTA)\n2. Saran nama/username\n3. Saran foto profil & highlight\n4. Kenapa perubahan ini menaikkan follower`;
  return { system: BASE_SYSTEM, user };
}

function analyzeCaptionPrompt({ captions = '', hashtags = '', metrics = '' }) {
  const user =
    `Analisa caption & hashtag yang sudah saya pakai.\nCaption: ${captions}\nHashtag: ${hashtags}\nMetrik: ${metrics}\n\n` +
    `Berikan:\n1. Caption mana yang paling efektif & kenapa\n2. Pola hashtag yang bekerja\n3. Perbaikan konkret\n4. 5 hashtag baru untuk dicoba`;
  return { system: BASE_SYSTEM, user };
}

function analyzeStrategyPrompt({ postingHistory = '' }) {
  const user =
    `Buat strategi posting berdasarkan histori saya.\nHistori posting: ${postingHistory}\n\n` +
    `Berikan:\n1. Jam & hari upload terbaik\n2. Frekuensi posting ideal\n3. Pola performa yang terlihat\n4. Rencana konten 7 hari ke depan`;
  return { system: BASE_SYSTEM, user };
}

function analyzeTrendPrompt({ niche = '', topics = '' }) {
  const user =
    `Beri ide konten & tren untuk niche saya.\nNiche: ${niche}\nTopik yang diminati: ${topics}\n\n` +
    `Berikan:\n1. 10 ide konten yang berpeluang naik follower\n2. Format/hook yang sedang bekerja\n3. Hashtag tren relevan\n4. Ide seri konten (content series)`;
  return { system: BASE_SYSTEM, user };
}

module.exports = {
  BASE_SYSTEM,
  captionPrompt,
  videoCaptionPrompt,
  analyzeVideoPrompt,
  analyzeProfilePrompt,
  analyzeCaptionPrompt,
  analyzeStrategyPrompt,
  analyzeTrendPrompt,
};
