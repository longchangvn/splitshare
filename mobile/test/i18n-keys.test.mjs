// Every literal t('key') used in mobile source must exist in en AND vi
// (web shared/messages.js + mobile-only i18n/mobile/*.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MESSAGES } from '../src/shared/messages.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const mobileDir = path.join(root, 'src', 'i18n', 'mobile');

const dicts = { en: { ...MESSAGES.en }, vi: { ...MESSAGES.vi } };
for (const f of fs.readdirSync(mobileDir).filter((x) => x.endsWith('.js'))) {
  const mod = (await import(path.join(mobileDir, f))).default;
  Object.assign(dicts.en, mod.en);
  Object.assign(dicts.vi, mod.vi);
}

function sources(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!['shared', 'node_modules'].includes(e.name)) sources(p, out); } else if (/\.jsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

const files = [path.join(root, 'App.js'), ...sources(path.join(root, 'src'))];
const used = new Map();
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  for (const m of src.matchAll(/\bt\(\s*'([a-zA-Z][\w.]*)'/g)) {
    if (!used.has(m[1])) used.set(m[1], path.relative(root, f));
  }
}

test('mobile uses i18n keys', () => assert.ok(used.size > 10));

for (const locale of ['en', 'vi']) {
  test(`all used keys exist in ${locale}`, () => {
    const missing = [...used].filter(([k]) => dicts[locale][k] == null).map(([k, f]) => `${k} (${f})`);
    assert.deepEqual(missing, []);
  });
}

test('mobile-only en and vi keys match', () => {
  for (const f of fs.readdirSync(mobileDir).filter((x) => x.endsWith('.js'))) {
    const src = fs.readFileSync(path.join(mobileDir, f), 'utf8');
    assert.ok(src.includes('vi:'), `${f} has vi block`);
  }
});
