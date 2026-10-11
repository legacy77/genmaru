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
