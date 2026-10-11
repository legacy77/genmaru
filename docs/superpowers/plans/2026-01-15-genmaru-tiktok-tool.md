# Genmaru TikTok Tool — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local, zero-dependency Node.js web tool that generates TikTok captions (from text or an uploaded video) and analyzes a TikTok account across five insight categories, using the local `9router` LLM gateway.

**Architecture:** Single Node process (`node:http`, no npm install) serves a static single-page UI from `public/` and exposes JSON API routes. AI calls go to the local OpenAI-compatible gateway at `http://127.0.0.1:20128/v1`. Video never leaves the browser as a file — the browser extracts 3 frames with `<video>`+`<canvas>` and sends them as base64 to a vision model. History is stored in `data/history.json`.

**Tech Stack:** Node.js v24 (stdlib only: `node:http`, `node:fs`, `node:path`, `node:crypto`, `node:test`), vanilla HTML/CSS/JS, local `9router` LLM gateway (OpenAI-compatible).

**Spec:** `docs/superpowers/specs/2026-01-15-genmaru-tiktok-tool-design.md`

## Global Constraints

- **Zero runtime dependencies.** No `npm install`; only Node built-in modules. Tests use `node:test` + `node:assert`.
- **Gateway base URL:** `http://127.0.0.1:20128/v1` (OpenAI-compatible `/chat/completions`).
- **Vision-capable models (verified):** `gemini/gemini-3.8-flash`, `ag/gemini-3.8-flash`, `kr/claude-sonnet-4.5`. `gh/gpt-4o-mini` does NOT accept images.
- **`max_tokens` must be >= 2000** for reasoning models (low limits return empty content with `finish_reason: max_tokens`).
- **Gateway may return SSE (`data:` lines) even when `stream:false`.** The response parser MUST handle both plain JSON and SSE.
- **Server port:** `3210` (configurable via `config.json`).
- **Language of generated content:** Bahasa Indonesia; TikTok-native style (strong hook, short, relatable).
- **Video upload limit:** 50 MB; accepted types `video/mp4`, `video/webm`. Video is not stored; only extracted frame thumbnails.
- **Timeout:** 90 s per gateway request via `AbortController`.
- **Secrets:** API key is never hardcoded in committed files. `config.json` is gitignored; `config.example.json` is committed.
- **Platform:** Windows PowerShell. Run npm/git via `cmd /c` if a script shim is blocked.

## Review Focus

These are the input classes / failure modes most likely to bite a real user; each has a test pinned to the task that owns the code.

1. **Gateway returns SSE instead of JSON** — user sees an empty caption. (Task 3 test: SSE body → joined content.)
2. **Gateway is down (`ECONNREFUSED`)** — user sees a raw stack trace instead of "gateway tidak aktif". (Task 3 test: fetch throws → typed 503 error.)
3. **Model returns empty content with `finish_reason: max_tokens`** — user sees a blank result. (Task 3 test: empty content triggers fallback model attempt.)
4. **`data/history.json` is corrupt/half-written** — user loses all history or server crashes on start. (Task 2 test: corrupt file → backed up, returns `[]`.)
5. **Vision model rejects the image** — user gets nothing for an uploaded video. (Task 5 test: vision error → route falls back to text-only caption.)

---

### Task 1: Project scaffold, config loader, and .gitignore

**Files:**
- Create: `.gitignore`
- Create: `config.example.json`
- Create: `lib/config.js`
- Test: `test/config.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `loadConfig({ env, cwd })` → `{ port, gateway: { baseURL, apiKey, timeoutMs }, models: { default, fallback, vision, visionFallback }, limits: { maxVideoMB, maxTokens } }`. Throws `Error` with message starting `"Gateway API key tidak ditemukan"` if no key can be resolved.

- [ ] **Step 1: Create `.gitignore`**

```gitignore
node_modules/
data/
config.json
*.tmp
*.bak
```

- [ ] **Step 2: Create `config.example.json`**

```json
{
  "port": 3210,
  "gateway": {
    "baseURL": "http://127.0.0.1:20128/v1",
    "apiKey": "ISI_API_KEY_GATEWAY_9ROUTER",
    "timeoutMs": 90000
  },
  "models": {
    "default": "gemini/gemini-3.8-flash",
    "fallback": "gh/gpt-4o-mini",
    "vision": "gemini/gemini-3.8-flash",
    "visionFallback": "ag/gemini-3.8-flash"
  },
  "limits": {
    "maxVideoMB": 50,
    "maxTokens": 2000
  }
}
```

- [ ] **Step 3: Write the failing test** — `test/config.test.js`

```js
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { loadConfig } = require('../lib/config');

test('loadConfig uses defaults when no file and only env key', () => {
  const cfg = loadConfig({ env: { GENMARU_API_KEY: 'env-key' }, cwd: path.join(__dirname, 'fixtures-empty') });
  assert.equal(cfg.port, 3210);
  assert.equal(cfg.gateway.baseURL, 'http://127.0.0.1:20128/v1');
  assert.equal(cfg.gateway.apiKey, 'env-key');
  assert.equal(cfg.models.vision, 'gemini/gemini-3.8-flash');
  assert.equal(cfg.limits.maxTokens, 2000);
});

test('loadConfig throws when no api key anywhere', () => {
  assert.throws(
    () => loadConfig({ env: {}, cwd: path.join(__dirname, 'fixtures-empty') }),
    /Gateway API key tidak ditemukan/
  );
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `node --test test/config.test.js`
Expected: FAIL — `Cannot find module '../lib/config'`.

- [ ] **Step 5: Write minimal implementation** — `lib/config.js`

```js
const fs = require('node:fs');
const path = require('node:path');

const DEFAULTS = {
  port: 3210,
  gateway: { baseURL: 'http://127.0.0.1:20128/v1', apiKey: '', timeoutMs: 90000 },
  models: {
    default: 'gemini/gemini-3.8-flash',
    fallback: 'gh/gpt-4o-mini',
    vision: 'gemini/gemini-3.8-flash',
    visionFallback: 'ag/gemini-3.8-flash',
  },
  limits: { maxVideoMB: 50, maxTokens: 2000 },
};

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function resolveKeyFromOpencode(home) {
  const file = path.join(home, '.config', 'opencode', 'opencode.json');
  const json = readJson(file);
  return json?.provider?.['9router']?.options?.apiKey || '';
}

function loadConfig({ env = process.env, cwd = process.cwd() } = {}) {
  const fileCfg = readJson(path.join(cwd, 'config.json')) || {};
  const merged = {
    port: fileCfg.port ?? DEFAULTS.port,
    gateway: { ...DEFAULTS.gateway, ...(fileCfg.gateway || {}) },
    models: { ...DEFAULTS.models, ...(fileCfg.models || {}) },
    limits: { ...DEFAULTS.limits, ...(fileCfg.limits || {}) },
  };
  const apiKey =
    merged.gateway.apiKey ||
    env.GENMARU_API_KEY ||
    env.OPENROUTER_API_KEY ||
    resolveKeyFromOpencode(env.USERPROFILE || env.HOME || '');
  if (!apiKey) throw new Error('Gateway API key tidak ditemukan. Isi config.json atau set GENMARU_API_KEY.');
  merged.gateway.apiKey = apiKey;
  return merged;
}

module.exports = { loadConfig, DEFAULTS };
```

- [ ] **Step 6: Run test to verify it passes**

Run: `node --test test/config.test.js`
Expected: PASS (2 tests).

- [ ] **Step 7: Commit**

```bash
git add .gitignore config.example.json lib/config.js test/config.test.js
git commit -m "feat: project scaffold and config loader"
```

---

### Task 2: History store

**Files:**
- Create: `lib/history.js`
- Test: `test/history.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `createStore(filePath)` → `{ list(type?), get(id), add(entry), remove(id) }`.
  - `add(entry)` returns the stored entry with generated `id` (uuid) and `createdAt` (ISO string); inserts at the front.
  - `list(type)` returns newest-first; filters by `entry.type` when `type` is given.
  - `remove(id)` returns `true` if something was deleted, else `false`.
  - Reads are resilient: a corrupt/unparseable file is copied to `<file>.bak` and treated as `[]`.

- [ ] **Step 1: Write the failing test** — `test/history.test.js`

```js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createStore } = require('../lib/history');

function tmpFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'genmaru-'));
  return path.join(dir, 'history.json');
}

test('add assigns id and createdAt, list returns newest first', () => {
  const store = createStore(tmpFile());
  const a = store.add({ type: 'caption', input: { topic: 'kopi' }, output: 'C1' });
  const b = store.add({ type: 'caption', input: { topic: 'teh' }, output: 'C2' });
  assert.ok(a.id && a.createdAt);
  assert.equal(store.list()[0].id, b.id);
  assert.equal(store.list('caption').length, 2);
  assert.equal(store.list('other').length, 0);
});

test('get and remove work', () => {
  const store = createStore(tmpFile());
  const a = store.add({ type: 'x', input: {}, output: 'o' });
  assert.equal(store.get(a.id).output, 'o');
  assert.equal(store.remove(a.id), true);
  assert.equal(store.remove(a.id), false);
  assert.equal(store.get(a.id), null);
});

test('corrupt file is backed up and treated as empty', () => {
  const file = tmpFile();
  fs.writeFileSync(file, '{ not valid json');
  const store = createStore(file);
  assert.deepEqual(store.list(), []);
  assert.ok(fs.existsSync(file + '.bak'));
});

test('missing file returns empty list', () => {
  const store = createStore(tmpFile());
  assert.deepEqual(store.list(), []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/history.test.js`
Expected: FAIL — `Cannot find module '../lib/history'`.

- [ ] **Step 3: Write minimal implementation** — `lib/history.js`

```js
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function createStore(filePath) {
  function read() {
    try {
      if (!fs.existsSync(filePath)) return [];
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      return Array.isArray(data) ? data : [];
    } catch {
      try { fs.copyFileSync(filePath, filePath + '.bak'); } catch {}
      return [];
    }
  }

  function write(entries) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const tmp = filePath + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(entries, null, 2));
    fs.renameSync(tmp, filePath);
  }

  return {
    list(type) {
      const all = read();
      return type ? all.filter((e) => e.type === type) : all;
    },
    get(id) {
      return read().find((e) => e.id === id) || null;
    },
    add(entry) {
      const all = read();
      const stored = { id: crypto.randomUUID(), createdAt: new Date().toISOString(), ...entry };
      all.unshift(stored);
      write(all);
      return stored;
    },
    remove(id) {
      const all = read();
      const next = all.filter((e) => e.id !== id);
      write(next);
      return next.length !== all.length;
    },
  };
}

module.exports = { createStore };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/history.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/history.js test/history.test.js
git commit -m "feat: JSON history store with atomic writes and corrupt-file recovery"
```

---

### Task 3: LLM gateway client

**Files:**
- Create: `lib/llm.js`
- Test: `test/llm.test.js`

**Interfaces:**
- Consumes: a `config` object shaped like Task 1's `loadConfig` output.
- Produces:
  - `parseContent(text)` → string. Handles plain JSON (`choices[0].message.content`) and SSE (`data:` lines joined from `choices[0].delta.content`).
  - `chat(config, { model, messages, maxTokens })` → `Promise<{ content, model }>`. Tries `model || config.models.default`, then `config.models.fallback` if the primary fails or returns empty content.
  - `chatVision(config, { model, text, images, maxTokens })` → `Promise<{ content, model }>`. `images` is an array of data URLs. Tries `config.models.vision` then `config.models.visionFallback`.
  - `mapError(err)` → `{ status, message }` where status is `504` for aborts, `502` for upstream HTTP errors, `503` for connection failures.

- [ ] **Step 1: Write the failing test** — `test/llm.test.js`

```js
const test = require('node:test');
const assert = require('node:assert');
const { parseContent, chat, chatVision, mapError } = require('../lib/llm');

const config = {
  gateway: { baseURL: 'http://127.0.0.1:20128/v1', apiKey: 'k', timeoutMs: 5000 },
  models: { default: 'primary', fallback: 'fallback', vision: 'vprimary', visionFallback: 'vfallback' },
  limits: { maxTokens: 2000 },
};

function mockFetch(handler) {
  const calls = [];
  global.fetch = async (url, opts) => {
    calls.push({ url, body: JSON.parse(opts.body) });
    return handler(calls.length, JSON.parse(opts.body));
  };
  return calls;
}

test('parseContent handles plain JSON', () => {
  const body = JSON.stringify({ choices: [{ message: { content: 'HALO' } }] });
  assert.equal(parseContent(body), 'HALO');
});

test('parseContent handles SSE stream', () => {
  const sse = 'data: {"choices":[{"delta":{"content":"Ha"}}]}\n\ndata: {"choices":[{"delta":{"content":"i"}}]}\n\ndata: [DONE]\n';
  assert.equal(parseContent(sse), 'Hai');
});

test('chat returns primary content', async () => {
  mockFetch(() => ({ ok: true, text: async () => JSON.stringify({ choices: [{ message: { content: 'ok' } }] }) }));
  const res = await chat(config, { messages: [{ role: 'user', content: 'hi' }] });
  assert.equal(res.content, 'ok');
  assert.equal(res.model, 'primary');
});

test('chat falls back when primary returns empty content', async () => {
  const calls = mockFetch((n) =>
    n === 1
      ? { ok: true, text: async () => JSON.stringify({ choices: [{ message: { content: '' }, finish_reason: 'max_tokens' }] }) }
      : { ok: true, text: async () => JSON.stringify({ choices: [{ message: { content: 'from fallback' } }] }) }
  );
  const res = await chat(config, { messages: [{ role: 'user', content: 'hi' }] });
  assert.equal(res.content, 'from fallback');
  assert.equal(res.model, 'fallback');
  assert.equal(calls.length, 2);
});

test('chat falls back on upstream 4xx', async () => {
  mockFetch((n) =>
    n === 1
      ? { ok: false, status: 400, text: async () => 'bad' }
      : { ok: true, text: async () => JSON.stringify({ choices: [{ message: { content: 'recovered' } }] }) }
  );
  const res = await chat(config, { messages: [] });
  assert.equal(res.content, 'recovered');
});

test('mapError classifies connection failure as 503', () => {
  const err = new TypeError('fetch failed');
  assert.equal(mapError(err).status, 503);
});

test('mapError classifies abort as 504', () => {
  const err = Object.assign(new Error('aborted'), { name: 'AbortError' });
  assert.equal(mapError(err).status, 504);
});

test('mapError passes through upstream status', () => {
  const err = Object.assign(new Error('bad'), { status: 502 });
  assert.equal(mapError(err).status, 502);
});

test('chatVision sends image_url content parts', async () => {
  const calls = mockFetch(() => ({ ok: true, text: async () => JSON.stringify({ choices: [{ message: { content: 'desc' } }] }) }));
  const res = await chatVision(config, { text: 'apa ini', images: ['data:image/jpeg;base64,AAA'] });
  assert.equal(res.content, 'desc');
  assert.equal(res.model, 'vprimary');
  const content = calls[0].body.messages[0].content;
  assert.equal(content[0].type, 'text');
  assert.equal(content[1].type, 'image_url');
  assert.equal(content[1].image_url.url, 'data:image/jpeg;base64,AAA');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/llm.test.js`
Expected: FAIL — `Cannot find module '../lib/llm'`.

- [ ] **Step 3: Write minimal implementation** — `lib/llm.js`

```js
const DEFAULTS = { timeoutMs: 90000, maxTokens: 2000 };

function parseContent(text) {
  const trimmed = (text || '').trim();
  if (trimmed.startsWith('data:')) {
    let full = '';
    for (const line of trimmed.split('\n')) {
      const l = line.trim();
      if (!l.startsWith('data:')) continue;
      const d = l.slice(5).trim();
      if (d === '[DONE]') continue;
      try {
        const j = JSON.parse(d);
        full += j.choices?.[0]?.delta?.content ?? j.choices?.[0]?.message?.content ?? '';
      } catch {}
    }
    return full;
  }
  try {
    const j = JSON.parse(trimmed);
    return j.choices?.[0]?.message?.content ?? '';
  } catch {
    return '';
  }
}

async function callGateway(config, body) {
  const { baseURL, apiKey, timeoutMs } = config.gateway;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs || DEFAULTS.timeoutMs);
  try {
    let res;
    try {
      res = await fetch(`${baseURL}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      throw err;
    }
    const text = await res.text();
    if (!res.ok) {
      const err = new Error(`Gateway error ${res.status}: ${text.slice(0, 300)}`);
      err.status = 502;
      throw err;
    }
    return parseContent(text);
  } finally {
    clearTimeout(timer);
  }
}

function mapError(err) {
  if (err?.name === 'AbortError') {
    return { status: 504, message: 'Gateway timeout (>90s). Coba model yang lebih cepat.' };
  }
  if (err?.status) {
    return { status: err.status, message: err.message };
  }
  return {
    status: 503,
    message: `Gateway 9router tidak aktif di ${err?.message ? '' : ''}http://127.0.0.1:20128. Jalankan gateway lalu coba lagi.`,
  };
}

async function runWithFallback(config, primary, fallback, bodyFor) {
  const attempts = [primary, fallback].filter(Boolean);
  let lastErr;
  for (const model of attempts) {
    try {
      const content = await callGateway(config, bodyFor(model));
      if (content && content.trim()) return { content, model };
      lastErr = Object.assign(new Error('Model mengembalikan konten kosong'), { status: 502 });
    } catch (err) {
      lastErr = err;
      if (err?.name === 'AbortError') throw err;
    }
  }
  throw lastErr || new Error('Tidak ada model yang tersedia');
}

function chat(config, { model, messages, maxTokens }) {
  const primary = model || config.models.default;
  const fallback = config.models.fallback;
  return runWithFallback(config, primary, fallback, (m) => ({
    model: m,
    messages,
    max_tokens: maxTokens || config.limits?.maxTokens || DEFAULTS.maxTokens,
    stream: false,
  }));
}

function chatVision(config, { model, text, images, maxTokens }) {
  const primary = model || config.models.vision;
  const fallback = config.models.visionFallback;
  const content = [
    { type: 'text', text },
    ...(images || []).map((url) => ({ type: 'image_url', image_url: { url } })),
  ];
  const messages = [{ role: 'user', content }];
  return runWithFallback(config, primary, fallback, (m) => ({
    model: m,
    messages,
    max_tokens: maxTokens || config.limits?.maxTokens || DEFAULTS.maxTokens,
    stream: false,
  }));
}

module.exports = { parseContent, chat, chatVision, mapError, callGateway };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/llm.test.js`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/llm.js test/llm.test.js
git commit -m "feat: LLM gateway client with SSE parsing, fallback, and error mapping"
```

---

### Task 4: Prompt templates

**Files:**
- Create: `lib/prompts.js`
- Test: `test/prompts.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: each function returns `{ system, user }` (both strings).
  - `captionPrompt({ topic, niche, tone, audience, count })`
  - `videoCaptionPrompt({ transcript, frameCount, topic, niche, tone, count })`
  - `analyzeVideoPrompt({ description, metrics })`
  - `analyzeProfilePrompt({ bio, niche, target })`
  - `analyzeCaptionPrompt({ captions, hashtags, metrics })`
  - `analyzeStrategyPrompt({ postingHistory })`
  - `analyzeTrendPrompt({ niche, topics })`

- [ ] **Step 1: Write the failing test** — `test/prompts.test.js`

```js
const test = require('node:test');
const assert = require('node:assert');
const p = require('../lib/prompts');

test('captionPrompt embeds inputs and count', () => {
  const r = p.captionPrompt({ topic: 'kopi susu', niche: 'kuliner', tone: 'santai', audience: 'anak muda', count: 3 });
  assert.match(r.system, /TikTok/i);
  assert.match(r.user, /kopi susu/);
  assert.match(r.user, /kuliner/);
  assert.match(r.user, /santai/);
  assert.match(r.user, /anak muda/);
  assert.match(r.user, /3/);
  assert.match(r.user, /hashtag/i);
});

test('videoCaptionPrompt mentions frames and transcript', () => {
  const r = p.videoCaptionPrompt({ transcript: 'ini kopi enak', frameCount: 3, topic: 'kopi', niche: 'kuliner', tone: 'santai', count: 5 });
  assert.match(r.user, /ini kopi enak/);
  assert.match(r.user, /3/);
});

test('all analyze prompts embed their inputs', () => {
  assert.match(p.analyzeVideoPrompt({ description: 'video A', metrics: '1000 views' }).user, /video A/);
  assert.match(p.analyzeProfilePrompt({ bio: 'bio lama', niche: 'kuliner', target: 'anak muda' }).user, /bio lama/);
  assert.match(p.analyzeCaptionPrompt({ captions: 'cap1', hashtags: '#a', metrics: '50 likes' }).user, /cap1/);
  assert.match(p.analyzeStrategyPrompt({ postingHistory: 'senin 19:00' }).user, /senin 19:00/);
  assert.match(p.analyzeTrendPrompt({ niche: 'kuliner', topics: 'kopi' }).user, /kopi/);
});

test('every prompt asks for Bahasa Indonesia TikTok style', () => {
  for (const fn of [p.captionPrompt, p.videoCaptionPrompt, p.analyzeVideoPrompt, p.analyzeProfilePrompt, p.analyzeCaptionPrompt, p.analyzeStrategyPrompt, p.analyzeTrendPrompt]) {
    const r = fn({ topic: 'x', niche: 'x', tone: 'x', audience: 'x', count: 1, transcript: 'x', frameCount: 1, description: 'x', metrics: 'x', bio: 'x', target: 'x', captions: 'x', hashtags: 'x', postingHistory: 'x', topics: 'x' });
    assert.match(r.system, /Indonesia/);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/prompts.test.js`
Expected: FAIL — `Cannot find module '../lib/prompts'`.

- [ ] **Step 3: Write minimal implementation** — `lib/prompts.js`

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/prompts.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/prompts.js test/prompts.test.js
git commit -m "feat: prompt templates for all six features"
```

---

### Task 5: HTTP server with API routes and static serving

**Files:**
- Create: `server.js`
- Test: `test/server.test.js`

**Interfaces:**
- Consumes: `loadConfig` (Task 1), `createStore` (Task 2), `chat`/`chatVision`/`mapError` (Task 3), all prompt functions (Task 4).
- Produces: `createServer(config)` → Node `http.Server`. When `require.main === module`, listens on `config.port` and logs `Genmaru jalan di http://localhost:<port>`.
  - Static: `GET /` and `GET /<file>` serve from `public/`.
  - API routes (all JSON in/out):
    - `GET /api/health` → `{ ok: true, gateway: baseURL }`
    - `GET /api/models` → `{ models: [...] }` (proxies gateway `/models`)
    - `POST /api/caption` → `{ result, model, entry }`
    - `POST /api/caption/video` → `{ result, model, entry }` (falls back to text-only if vision fails)
    - `POST /api/analyze/video|profile|caption|strategy|trend` → `{ result, model, entry }`
    - `GET /api/history?type=` → `{ entries: [...] }`
    - `DELETE /api/history/:id` → `{ removed: true|false }`
  - Errors → `{ error }` with `mapError` status.

- [ ] **Step 1: Write the failing test** — `test/server.test.js`

```js
const test = require('node:test');
const assert = require('node:assert');
const { createServer } = require('../server');

const config = {
  port: 0,
  gateway: { baseURL: 'http://127.0.0.1:20128/v1', apiKey: 'k', timeoutMs: 5000 },
  models: { default: 'p', fallback: 'f', vision: 'vp', visionFallback: 'vf' },
  limits: { maxTokens: 2000, maxVideoMB: 50 },
};

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
}

function post(port, path, body) {
  return fetch(`http://127.0.0.1:${port}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test('GET /api/health returns ok', async () => {
  const server = createServer(config, { dataDir: require('node:os').tmpdir() });
  const port = await listen(server);
  const res = await fetch(`http://127.0.0.1:${port}/api/health`);
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.ok, true);
  server.close();
});

test('POST /api/caption returns generated caption and stores history', async () => {
  const os = require('node:os');
  const fs = require('node:fs');
  const path = require('node:path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'genmaru-srv-'));
  global.fetch = async () => ({ ok: true, text: async () => JSON.stringify({ choices: [{ message: { content: '1. Caption keren\n   Hashtag: #kopi' } }] }) });
  const server = createServer(config, { dataDir: dir });
  const port = await listen(server);
  const res = await post(port, '/api/caption', { topic: 'kopi', niche: 'kuliner', tone: 'santai', audience: 'umum', count: 1 });
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.match(json.result, /Caption keren/);
  const hist = await (await fetch(`http://127.0.0.1:${port}/api/history`)).json();
  assert.equal(hist.entries.length, 1);
  server.close();
});

test('vision failure falls back to text-only caption', async () => {
  const os = require('node:os');
  const fs = require('node:fs');
  const path = require('node:path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'genmaru-srv2-'));
  let n = 0;
  global.fetch = async (url, opts) => {
    n++;
    const body = JSON.parse(opts.body);
    const isVision = Array.isArray(body.messages[0].content);
    if (isVision) return { ok: false, status: 400, text: async () => 'image media type not supported' };
    return { ok: true, text: async () => JSON.stringify({ choices: [{ message: { content: '1. Fallback caption\n   Hashtag: #x' } }] }) };
  };
  const server = createServer(config, { dataDir: dir });
  const port = await listen(server);
  const res = await post(port, '/api/caption/video', { frames: ['data:image/jpeg;base64,AAA'], transcript: 'kopi enak', topic: 'kopi', niche: 'kuliner', tone: 'santai', count: 1 });
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.match(json.result, /Fallback caption/);
  server.close();
});

test('GET / serves index.html', async () => {
  const server = createServer(config, { dataDir: require('node:os').tmpdir() });
  const port = await listen(server);
  const res = await fetch(`http://127.0.0.1:${port}/`);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /Genmaru/);
  server.close();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/server.test.js`
Expected: FAIL — `Cannot find module '../server'` (and `/` test fails until `public/index.html` exists; that is created in Task 6 — run this task's server test after Task 6, or accept the `GET /` test failing until then. Implement Task 6 before final verification.)

- [ ] **Step 3: Write minimal implementation** — `server.js`

```js
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { loadConfig } = require('./lib/config');
const { createStore } = require('./lib/history');
const { chat, chatVision, mapError } = require('./lib/llm');
const prompts = require('./lib/prompts');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
};

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 80 * 1024 * 1024) {
        reject(Object.assign(new Error('Payload terlalu besar'), { status: 413 }));
        req.destroy();
        return;
      }
      data += chunk;
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch { reject(Object.assign(new Error('JSON tidak valid'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

function serveStatic(res, publicDir, urlPath) {
  const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  const file = path.join(publicDir, rel);
  if (!file.startsWith(publicDir)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}

const TEXT_ROUTES = {
  '/api/analyze/video': (b) => prompts.analyzeVideoPrompt(b),
  '/api/analyze/profile': (b) => prompts.analyzeProfilePrompt(b),
  '/api/analyze/caption': (b) => prompts.analyzeCaptionPrompt(b),
  '/api/analyze/strategy': (b) => prompts.analyzeStrategyPrompt(b),
  '/api/analyze/trend': (b) => prompts.analyzeTrendPrompt(b),
};

function createServer(config, opts = {}) {
  const dataDir = opts.dataDir || path.join(__dirname, 'data');
  const store = createStore(path.join(dataDir, 'history.json'));
  const publicDir = path.join(__dirname, 'public');

  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const p = url.pathname;

    try {
      if (p === '/api/health' && req.method === 'GET') {
        return sendJson(res, 200, { ok: true, gateway: config.gateway.baseURL });
      }

      if (p === '/api/models' && req.method === 'GET') {
        try {
          const r = await fetch(`${config.gateway.baseURL}/models`, { headers: { Authorization: `Bearer ${config.gateway.apiKey}` } });
          const j = await r.json();
          return sendJson(res, 200, { models: (j.data || []).map((m) => m.id) });
        } catch (err) {
          return sendJson(res, 200, { models: [] });
        }
      }

      if (p === '/api/history' && req.method === 'GET') {
        return sendJson(res, 200, { entries: store.list(url.searchParams.get('type') || undefined) });
      }

      if (p.startsWith('/api/history/') && req.method === 'DELETE') {
        const id = p.split('/').pop();
        return sendJson(res, 200, { removed: store.remove(id) });
      }

      if (p === '/api/caption' && req.method === 'POST') {
        const body = await readBody(req);
        const { system, user } = prompts.captionPrompt(body);
        const { content, model } = await chat(config, { model: body.model, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] });
        const entry = store.add({ type: 'caption', input: body, output: content, model });
        return sendJson(res, 200, { result: content, model, entry });
      }

      if (p === '/api/caption/video' && req.method === 'POST') {
        const body = await readBody(req);
        const frames = body.frames || [];
        const { system, user } = prompts.videoCaptionPrompt({ ...body, frameCount: frames.length });
        let content, model;
        try {
          const out = await chatVision(config, { model: body.model, text: `${system}\n\n${user}`, images: frames });
          content = out.content; model = out.model;
        } catch (visionErr) {
          const out = await chat(config, { messages: [{ role: 'system', content: system }, { role: 'user', content: user }] });
          content = out.content; model = out.model;
        }
        const entry = store.add({ type: 'caption-video', input: { ...body, frames: frames.length }, output: content, model });
        return sendJson(res, 200, { result: content, model, entry });
      }

      if (TEXT_ROUTES[p] && req.method === 'POST') {
        const body = await readBody(req);
        const { system, user } = TEXT_ROUTES[p](body);
        const { content, model } = await chat(config, { model: body.model, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] });
        const entry = store.add({ type: p.replace('/api/analyze/', 'analyze-'), input: body, output: content, model });
        return sendJson(res, 200, { result: content, model, entry });
      }

      if (req.method === 'GET') return serveStatic(res, publicDir, p);
      return sendJson(res, 404, { error: 'Not found' });
    } catch (err) {
      const { status, message } = mapError(err);
      return sendJson(res, status, { error: message });
    }
  });
}

if (require.main === module) {
  const config = loadConfig({});
  createServer(config).listen(config.port, () => {
    console.log(`Genmaru jalan di http://localhost:${config.port}`);
    console.log(`Gateway: ${config.gateway.baseURL}`);
  });
}

module.exports = { createServer };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/server.test.js`
Expected: PASS (4 tests) after `public/index.html` exists (Task 6).

- [ ] **Step 5: Commit**

```bash
git add server.js test/server.test.js
git commit -m "feat: HTTP server with API routes and static serving"
```

---

### Task 6: Frontend markup and styles

**Files:**
- Create: `public/index.html`
- Create: `public/style.css`

**Interfaces:**
- Consumes: API routes from Task 5.
- Produces: an HTML document containing the word `Genmaru` (required by Task 5's `GET /` test) and these stable element IDs that Task 7 (`app.js`) binds to:
  - Tabs: `button[data-tab]` with values `generator`, `video`, `analyze-video`, `analyze-profile`, `analyze-caption`, `analyze-strategy`, `history`; panels `#tab-generator`, `#tab-video`, `#tab-analyze-video`, `#tab-analyze-profile`, `#tab-analyze-caption`, `#tab-analyze-strategy`, `#tab-history`.
  - Global: `#model-select`, `#status`.
  - Generator form: `#gen-topic`, `#gen-niche`, `#gen-tone`, `#gen-audience`, `#gen-count`, `#gen-submit`, `#gen-result`.
  - Video form: `#video-file`, `#video-preview`, `#video-frames`, `#video-transcript`, `#video-topic`, `#video-niche`, `#video-tone`, `#video-count`, `#video-submit`, `#video-result`.
  - Analyze forms: `#av-desc`, `#av-metrics`, `#av-submit`, `#av-result`; `#ap-bio`, `#ap-niche`, `#ap-target`, `#ap-submit`, `#ap-result`; `#ac-captions`, `#ac-hashtags`, `#ac-metrics`, `#ac-submit`, `#ac-result`; `#as-history`, `#as-submit`, `#as-result`.
  - History: `#history-list`, `#history-refresh`.

- [ ] **Step 1: Create `public/index.html`**

```html
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Genmaru — TikTok Caption & Analyzer</title>
  <link rel="stylesheet" href="/style.css" />
</head>
<body>
  <header class="topbar">
    <h1>Genmaru</h1>
    <span class="sub">TikTok Caption Generator &amp; Account Analyzer</span>
    <div class="controls">
      <select id="model-select"><option value="">(model default)</option></select>
      <span id="status" class="status"></span>
    </div>
  </header>

  <nav class="tabs">
    <button data-tab="generator" class="active">Generator</button>
    <button data-tab="video">Video → Caption</button>
    <button data-tab="analyze-video">Analisa Video</button>
    <button data-tab="analyze-profile">Analisa Profil</button>
    <button data-tab="analyze-caption">Analisa Caption</button>
    <button data-tab="analyze-strategy">Strategi &amp; Tren</button>
    <button data-tab="history">Riwayat</button>
  </nav>

  <main>
    <section id="tab-generator" class="panel active">
      <h2>Generate Caption</h2>
      <div class="grid">
        <label>Topik <input id="gen-topic" placeholder="mis. kopi susu gula aren" /></label>
        <label>Niche <input id="gen-niche" placeholder="mis. kuliner" /></label>
        <label>Tone <input id="gen-tone" value="santai" /></label>
        <label>Audiens <input id="gen-audience" value="anak muda" /></label>
        <label>Jumlah <input id="gen-count" type="number" value="5" min="1" max="10" /></label>
      </div>
      <button id="gen-submit" class="primary">Generate</button>
      <pre id="gen-result" class="result"></pre>
    </section>

    <section id="tab-video" class="panel">
      <h2>Upload Video → Caption</h2>
      <p class="hint">Video tidak diunggah ke server. Browser mengekstrak 3 frame untuk dianalisa AI. Maks 50 MB, format mp4/webm.</p>
      <input id="video-file" type="file" accept="video/mp4,video/webm" />
      <video id="video-preview" controls hidden></video>
      <div id="video-frames" class="frames"></div>
      <div class="grid">
        <label>Transkrip (opsional) <textarea id="video-transcript" placeholder="Tempel transkrip/isi suara video di sini (opsional, membantu AI)"></textarea></label>
        <label>Topik <input id="video-topic" /></label>
        <label>Niche <input id="video-niche" /></label>
        <label>Tone <input id="video-tone" value="santai" /></label>
        <label>Jumlah <input id="video-count" type="number" value="5" min="1" max="10" /></label>
      </div>
      <button id="video-submit" class="primary">Generate dari Video</button>
      <pre id="video-result" class="result"></pre>
    </section>

    <section id="tab-analyze-video" class="panel">
      <h2>Analisa Performa Video</h2>
      <label>Deskripsi video <textarea id="av-desc"></textarea></label>
      <label>Metrik (views, likes, komentar, watch time) <textarea id="av-metrics"></textarea></label>
      <button id="av-submit" class="primary">Analisa</button>
      <pre id="av-result" class="result"></pre>
    </section>

    <section id="tab-analyze-profile" class="panel">
      <h2>Optimasi Profil &amp; Bio</h2>
      <label>Bio saat ini <textarea id="ap-bio"></textarea></label>
      <label>Niche <input id="ap-niche" /></label>
      <label>Target audiens <input id="ap-target" /></label>
      <button id="ap-submit" class="primary">Analisa</button>
      <pre id="ap-result" class="result"></pre>
    </section>

    <section id="tab-analyze-caption" class="panel">
      <h2>Analisa Caption &amp; Hashtag</h2>
      <label>Caption yang dipakai <textarea id="ac-captions"></textarea></label>
      <label>Hashtag yang dipakai <textarea id="ac-hashtags"></textarea></label>
      <label>Metrik <textarea id="ac-metrics"></textarea></label>
      <button id="ac-submit" class="primary">Analisa</button>
      <pre id="ac-result" class="result"></pre>
    </section>

    <section id="tab-analyze-strategy" class="panel">
      <h2>Strategi Posting &amp; Tren</h2>
      <label>Histori posting (tanggal, jam, performa) <textarea id="as-history"></textarea></label>
      <button id="as-submit" class="primary">Analisa Strategi</button>
      <pre id="as-result" class="result"></pre>
    </section>

    <section id="tab-history" class="panel">
      <h2>Riwayat</h2>
      <button id="history-refresh">Muat ulang</button>
      <div id="history-list"></div>
    </section>
  </main>

  <script src="/app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create `public/style.css`**

```css
:root { --bg:#0e0f13; --panel:#181a21; --fg:#e7e9ee; --muted:#9aa0ad; --accent:#ff2d55; --border:#262a35; }
* { box-sizing:border-box; }
body { margin:0; font-family:system-ui,Segoe UI,Roboto,sans-serif; background:var(--bg); color:var(--fg); }
.topbar { display:flex; align-items:center; gap:12px; padding:14px 20px; border-bottom:1px solid var(--border); flex-wrap:wrap; }
.topbar h1 { margin:0; font-size:20px; color:var(--accent); }
.topbar .sub { color:var(--muted); font-size:13px; }
.topbar .controls { margin-left:auto; display:flex; align-items:center; gap:10px; }
.status { font-size:12px; color:var(--muted); }
.status.err { color:#ff6b6b; }
.tabs { display:flex; gap:6px; padding:10px 20px; flex-wrap:wrap; border-bottom:1px solid var(--border); }
.tabs button { background:transparent; border:1px solid var(--border); color:var(--muted); padding:8px 12px; border-radius:8px; cursor:pointer; }
.tabs button.active { background:var(--accent); color:#fff; border-color:var(--accent); }
main { padding:20px; max-width:960px; margin:0 auto; }
.panel { display:none; }
.panel.active { display:block; }
.grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:12px; margin:12px 0; }
label { display:flex; flex-direction:column; gap:6px; font-size:13px; color:var(--muted); }
input,textarea,select { background:var(--panel); border:1px solid var(--border); color:var(--fg); padding:10px; border-radius:8px; font-size:14px; }
textarea { min-height:80px; resize:vertical; }
button.primary { background:var(--accent); color:#fff; border:none; padding:10px 18px; border-radius:8px; cursor:pointer; font-size:14px; }
button.primary:disabled { opacity:.5; cursor:wait; }
.result { background:var(--panel); border:1px solid var(--border); border-radius:10px; padding:14px; white-space:pre-wrap; word-break:break-word; min-height:40px; margin-top:14px; }
.hint { color:var(--muted); font-size:13px; }
.frames { display:flex; gap:8px; margin:10px 0; }
.frames img { width:80px; border-radius:6px; border:1px solid var(--border); }
video { max-width:100%; margin:10px 0; border-radius:8px; }
.history-item { background:var(--panel); border:1px solid var(--border); border-radius:8px; padding:10px; margin-bottom:8px; }
.history-item .meta { color:var(--muted); font-size:12px; margin-bottom:6px; }
.history-item pre { white-space:pre-wrap; margin:0; font-size:13px; }
```

- [ ] **Step 3: Verify static serving works**

Run: `node -e "const {createServer}=require('./server');const c={port:0,gateway:{baseURL:'http://127.0.0.1:20128/v1',apiKey:'k',timeoutMs:5000},models:{default:'p',fallback:'f',vision:'vp',visionFallback:'vf'},limits:{maxTokens:2000,maxVideoMB:50}};const s=createServer(c);s.listen(0,async()=>{const p=s.address().port;const r=await fetch('http://127.0.0.1:'+p+'/');console.log(r.status,(await r.text()).includes('Genmaru'));s.close();})"`
Expected: `200 true`

- [ ] **Step 4: Commit**

```bash
git add public/index.html public/style.css
git commit -m "feat: frontend markup and dark-mode styles"
```

---

### Task 7: Frontend logic including client-side video frame extraction

**Files:**
- Create: `public/app.js`

**Interfaces:**
- Consumes: element IDs from Task 6; API routes from Task 5.
- Produces: a script that (a) wires tabs, (b) loads models into `#model-select`, (c) submits each form to its endpoint and renders `result` into the matching `<pre>`, (d) extracts exactly 3 JPEG frames from a selected video using `<video>`+`<canvas>`, (e) renders history. Exposes nothing globally except an IIFE.

- [ ] **Step 1: Create `public/app.js`**

```js
(() => {
  const $ = (sel) => document.querySelector(sel);
  const status = $('#status');

  function setStatus(msg, isErr) {
    status.textContent = msg || '';
    status.classList.toggle('err', !!isErr);
  }

  // Tabs
  document.querySelectorAll('.tabs button').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tabs button').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.panel').forEach((p) => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
    });
  });

  function model() {
    const v = $('#model-select').value;
    return v || undefined;
  }

  async function call(path, body, resultEl, button) {
    if (button) button.disabled = true;
    setStatus('Memproses…');
    try {
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `Error ${res.status}`);
      resultEl.textContent = json.result;
      setStatus(`Selesai (${json.model})`);
      return json;
    } catch (err) {
      resultEl.textContent = '';
      setStatus(err.message, true);
    } finally {
      if (button) button.disabled = false;
    }
  }

  // Models
  async function loadModels() {
    try {
      const { models } = await (await fetch('/api/models')).json();
      const sel = $('#model-select');
      (models || []).forEach((m) => {
        const o = document.createElement('option');
        o.value = m; o.textContent = m;
        sel.appendChild(o);
      });
    } catch { /* gateway optional */ }
  }

  // Generator
  $('#gen-submit').addEventListener('click', () =>
    call('/api/caption', {
      topic: $('#gen-topic').value,
      niche: $('#gen-niche').value,
      tone: $('#gen-tone').value,
      audience: $('#gen-audience').value,
      count: Number($('#gen-count').value) || 5,
      model: model(),
    }, $('#gen-result'), $('#gen-submit'))
  );

  // Analyze forms
  const analyze = [
    ['#av-submit', '/api/analyze/video', '#av-result', () => ({ description: $('#av-desc').value, metrics: $('#av-metrics').value })],
    ['#ap-submit', '/api/analyze/profile', '#ap-result', () => ({ bio: $('#ap-bio').value, niche: $('#ap-niche').value, target: $('#ap-target').value })],
    ['#ac-submit', '/api/analyze/caption', '#ac-result', () => ({ captions: $('#ac-captions').value, hashtags: $('#ac-hashtags').value, metrics: $('#ac-metrics').value })],
    ['#as-submit', '/api/analyze/strategy', '#as-result', () => ({ postingHistory: $('#as-history').value })],
  ];
  analyze.forEach(([btnSel, path, resSel, gather]) => {
    $(btnSel).addEventListener('click', () => {
      const body = gather(); body.model = model();
      call(path, body, $(resSel), $(btnSel));
    });
  });

  // Video frame extraction
  const FRAME_POSITIONS = [0.2, 0.5, 0.8];
  let extractedFrames = [];

  function extractFrames(video, count) {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const frames = [];
      const duration = video.duration;
      if (!duration || !isFinite(duration)) return reject(new Error('Durasi video tidak terbaca'));
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      let i = 0;
      const seekNext = () => {
        if (i >= count) return resolve(frames);
        const t = duration * FRAME_POSITIONS[i % FRAME_POSITIONS.length];
        video.currentTime = Math.min(t, duration - 0.05);
        i++;
      };
      video.addEventListener('seeked', () => {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        frames.push(canvas.toDataURL('image/jpeg', 0.7));
        seekNext();
      });
      video.addEventListener('error', () => reject(new Error('Video tidak bisa dibaca browser')));
      seekNext();
    });
  }

  $('#video-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) { setStatus('Video melebihi 50 MB', true); return; }
    const preview = $('#video-preview');
    preview.src = URL.createObjectURL(file);
    preview.hidden = false;
    extractedFrames = [];
    $('#video-frames').innerHTML = '';
    setStatus('Mengekstrak frame…');
    preview.addEventListener('loadedmetadata', async () => {
      try {
        extractedFrames = await extractFrames(preview, 3);
        $('#video-frames').innerHTML = extractedFrames.map((f) => `<img src="${f}" />`).join('');
        setStatus(`${extractedFrames.length} frame siap`);
      } catch (err) {
        setStatus(`${err.message}. Isi transkrip manual sebagai gantinya.`, true);
      }
    }, { once: true });
  });

  $('#video-submit').addEventListener('click', () => {
    call('/api/caption/video', {
      frames: extractedFrames,
      transcript: $('#video-transcript').value,
      topic: $('#video-topic').value,
      niche: $('#video-niche').value,
      tone: $('#video-tone').value,
      count: Number($('#video-count').value) || 5,
      model: model(),
    }, $('#video-result'), $('#video-submit'));
  });

  // History
  async function loadHistory() {
    const { entries } = await (await fetch('/api/history')).json();
    const list = $('#history-list');
    list.innerHTML = '';
    (entries || []).forEach((en) => {
      const div = document.createElement('div');
      div.className = 'history-item';
      div.innerHTML = `<div class="meta">${en.type} · ${new Date(en.createdAt).toLocaleString('id-ID')} · ${en.model || ''}</div><pre></pre>`;
      div.querySelector('pre').textContent = en.output;
      list.appendChild(div);
    });
  }
  $('#history-refresh').addEventListener('click', loadHistory);

  loadModels();
  loadHistory();
})();
```

- [ ] **Step 2: Verify app.js is syntactically valid**

Run: `node --check public/app.js`
Expected: no output, exit code 0.

- [ ] **Step 3: Commit**

```bash
git add public/app.js
git commit -m "feat: frontend logic with client-side video frame extraction"
```

---

### Task 8: README, full test run, and end-to-end verification

**Files:**
- Create: `README.md`

**Interfaces:**
- Consumes: everything.
- Produces: user-facing run instructions; a green `node --test` run; a live smoke test against the real gateway.

- [ ] **Step 1: Create `README.md`**

```markdown
# Genmaru — TikTok Caption Generator & Account Analyzer

Tool web lokal (zero-dependency) untuk membuat caption TikTok dan menganalisa akun TikTok,
ditenagai gateway LLM lokal `9router`. Tidak ada data yang dikirim keluar selain ke gateway lokal.

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

## Konfigurasi

Lihat `config.example.json`. Model default & fallback bisa diganti kapan saja.
```

- [ ] **Step 2: Run the full test suite**

Run: `node --test`
Expected: PASS — config (2), history (4), llm (9), prompts (4), server (4). If any fail, fix before proceeding.

- [ ] **Step 3: Live smoke test against the real gateway**

Create `config.json` from the example with the working key, then run:

```bash
node -e "const {createServer}=require('./server');const {loadConfig}=require('./lib/config');const s=createServer(loadConfig({}));s.listen(0,async()=>{const p=s.address().port;const r=await fetch('http://127.0.0.1:'+p+'/api/caption',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({topic:'kopi susu gula aren',niche:'kuliner',tone:'santai',audience:'anak muda',count:3})});const j=await r.json();console.log('STATUS',r.status);console.log(j.result||j.error);s.close();})"
```

Expected: `STATUS 200` followed by 3 caption variants in Bahasa Indonesia.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: add README with run and test instructions"
```

---

## Self-Review

**1. Spec coverage:**
- Caption generation → Task 4 (`captionPrompt`) + Task 5 (`/api/caption`) + Task 7 (form). ✅
- Video → caption → Task 4 (`videoCaptionPrompt`) + Task 5 (`/api/caption/video`) + Task 7 (frame extraction). ✅
- 5 analysis categories → Task 4 (4 analyze prompts; trend covered by `analyzeTrendPrompt`/`analyzeStrategyPrompt`) + Task 5 routes + Task 6/7 UI. ✅
- Vision support → Task 3 (`chatVision`) + Task 5 fallback. ✅
- History → Task 2 + Task 5 routes + Task 7 UI. ✅
- Error handling table → Task 3 (`mapError`) + Task 5 (try/catch, vision fallback) + Task 7 (error display). ✅
- Testing via `node --test` → Tasks 1–5 tests. ✅
- Config/secrets not committed → Task 1 (`.gitignore`, `config.example.json`). ✅

**2. Placeholder scan:** No "TBD"/"TODO"/"handle edge cases" — every step has concrete code. ✅

**3. Type consistency:** `loadConfig` shape (Task 1) matches `config` used in Tasks 3/5. `chat`/`chatVision` return `{ content, model }` consistently (Task 3 → Task 5). `store.add/list/remove` signatures consistent (Task 2 → Task 5). Element IDs (Task 6) match `app.js` selectors (Task 7). ✅

**4. Review Focus:** All five listed failure modes have a pinned test — SSE (Task 3), gateway down (Task 3), empty content fallback (Task 3), corrupt history (Task 2), vision failure fallback (Task 5). ✅

**Note on ordering:** Task 5's `GET /` test needs `public/index.html` from Task 6. Implement Task 6 before running Task 5's server test, or run `node --test` after both are complete.
