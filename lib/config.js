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
