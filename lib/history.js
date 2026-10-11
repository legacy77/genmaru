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
      try {
        fs.copyFileSync(filePath, filePath + '.bak');
      } catch {}
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
