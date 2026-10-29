// Every literal t('key') in mobile/src must exist in the catalogue. Catches
// typos and copy that was never ported (the root cause of half-rendered screens).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', 'src');

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(js|jsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const KEY_RE = /\bt\(\s*['"]([a-zA-Z0-9_.]+)['"]/g;

test('every literal translation key exists in EN and VI', async () => {
  const dict = await import('../src/i18n/dict.js');
  const en = new Set(dict.keysOf('en'));
  const vi = new Set(dict.keysOf('vi'));
  const missing = [];
  for (const file of walk(root)) {
    const src = fs.readFileSync(file, 'utf8');
    for (const match of src.matchAll(KEY_RE)) {
      const key = match[1];
      if (!en.has(key)) missing.push(`${path.relative(root, file)}: ${key} (missing in EN)`);
      else if (!vi.has(key)) missing.push(`${path.relative(root, file)}: ${key} (missing in VI)`);
    }
  }
  assert.deepEqual([...new Set(missing)], []);
});
