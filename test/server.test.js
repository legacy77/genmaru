const test = require('node:test');
const assert = require('node:assert');
const { createServer } = require('../server');

const config = {
  port: 0,
  gateway: { baseURL: 'http://127.0.0.1:20128/v1', apiKey: 'k', timeoutMs: 5000 },
  models: { default: 'p', fallback: 'f', vision: 'vp', visionFallback: 'vf' },
  limits: { maxTokens: 2000, maxVideoMB: 50 },
};

const realFetch = global.fetch;

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

function stubGateway(fn) {
  global.fetch = async (url, opts) => {
    if (!String(url).startsWith(config.gateway.baseURL)) return realFetch(url, opts);
    return fn(url, opts);
  };
}

test('GET /api/health returns ok', async () => {
  const server = createServer(config, { dataDir: require('node:os').tmpdir() });
  try {
    const port = await listen(server);
    const res = await fetch(`http://127.0.0.1:${port}/api/health`);
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.ok, true);
  } finally {
    global.fetch = realFetch;
    server.close();
  }
});

test('POST /api/caption returns generated caption and stores history', async () => {
  const os = require('node:os');
  const fs = require('node:fs');
  const path = require('node:path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'genmaru-srv-'));
  stubGateway(async () => ({ ok: true, text: async () => JSON.stringify({ choices: [{ message: { content: '1. Caption keren\n   Hashtag: #kopi' } }] }) }));
  const server = createServer(config, { dataDir: dir });
  try {
    const port = await listen(server);
    const res = await post(port, '/api/caption', { topic: 'kopi', niche: 'kuliner', tone: 'santai', audience: 'umum', count: 1 });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.match(json.result, /Caption keren/);
    const hist = await (await fetch(`http://127.0.0.1:${port}/api/history`)).json();
    assert.equal(hist.entries.length, 1);
  } finally {
    global.fetch = realFetch;
    server.close();
  }
});

test('vision failure falls back to text-only caption', async () => {
  const os = require('node:os');
  const fs = require('node:fs');
  const path = require('node:path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'genmaru-srv2-'));
  stubGateway(async (url, opts) => {
    const body = JSON.parse(opts.body);
    const isVision = Array.isArray(body.messages[0].content);
    if (isVision) return { ok: false, status: 400, text: async () => 'image media type not supported' };
    return { ok: true, text: async () => JSON.stringify({ choices: [{ message: { content: '1. Fallback caption\n   Hashtag: #x' } }] }) };
  });
  const server = createServer(config, { dataDir: dir });
  try {
    const port = await listen(server);
    const res = await post(port, '/api/caption/video', { frames: ['data:image/jpeg;base64,AAA'], transcript: 'kopi enak', topic: 'kopi', niche: 'kuliner', tone: 'santai', count: 1 });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.match(json.result, /Fallback caption/);
  } finally {
    global.fetch = realFetch;
    server.close();
  }
});

test('GET / serves index.html', async () => {
  global.fetch = realFetch;
  const server = createServer(config, { dataDir: require('node:os').tmpdir() });
  try {
    const port = await listen(server);
    const res = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, /Genmaru/);
  } finally {
    global.fetch = realFetch;
    server.close();
  }
});
