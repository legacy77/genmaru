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
