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
