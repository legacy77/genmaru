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
