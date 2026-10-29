// node --test mobile/test/i18n.test.cjs — catalogue drift + translator behaviour.
const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const root = path.join(__dirname, '..');

test('mobile catalogue is in sync with web/src/i18n/messages.js', () => {
  // Fails with a fix command when the web copy changed and mobile was not regenerated.
  execFileSync(process.execPath, [path.join(root, 'scripts', 'sync-i18n.js'), '--check'], {
    cwd: root,
    stdio: 'pipe',
  });
});

test('translator covers EN/VI, interpolation and gaps', async () => {
  const dict = await import('../src/i18n/dict.js');

  assert.equal(dict.translateRaw('en', 'net.youOwe', { amount: '$5.00' }), 'You owe $5.00');
  assert.equal(dict.translateRaw('vi', 'net.youOwe', { amount: '5,00 $' }), 'Bạn nợ 5,00 $');
  // Missing VI key falls back to the English catalogue, never to a raw key.
  assert.equal(dict.translateRaw('vi', 'm.push.title'), 'Thông báo');
  // Unknown key returns itself so gaps are visible in tests, not blank UI.
  assert.equal(dict.translateRaw('en', 'nope.missing'), 'nope.missing');
  // Missing interpolation var stays visible rather than printing "undefined".
  assert.equal(dict.translateRaw('en', 'net.youOwe', {}), 'You owe {amount}');
});

test('every mobile-only key is absent from the shared web catalogue', async () => {
  const dict = await import('../src/i18n/dict.js');
  const { EXTRA } = await import('../src/i18n/extra.js');
  for (const locale of ['en', 'vi']) {
    for (const key of Object.keys(EXTRA[locale])) {
      assert.equal(
        dict.MESSAGES[locale][key], undefined,
        `EXTRA.${locale}["${key}"] shadows the web catalogue — move the copy to web instead`,
      );
    }
  }
});

test('EN and VI catalogues carry the same keys plus mobile extras', async () => {
  const dict = await import('../src/i18n/dict.js');
  const en = new Set(dict.keysOf('en'));
  const vi = new Set(dict.keysOf('vi'));
  const missingInVi = [...en].filter((k) => !vi.has(k));
  const missingInEn = [...vi].filter((k) => !en.has(k));
  assert.deepEqual(missingInVi, [], 'keys present in EN but missing in VI');
  assert.deepEqual(missingInEn, [], 'keys present in VI but missing in EN');
});
