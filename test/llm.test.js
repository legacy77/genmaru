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
