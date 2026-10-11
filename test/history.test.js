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
