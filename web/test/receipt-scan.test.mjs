import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  SCAN_DPI, SCAN_MAX_EDGE, SCAN_MOBILE_QUERY, SCAN_QUALITY,
  fitWithin, readJpegDpi, scanErrorKey, scanToAmount, setJpegDpi,
} from '../src/receiptScan.js';

const read = (p) => readFile(new URL(p, import.meta.url), 'utf8');
const forms = await read('../src/components/Forms.jsx');
const styles = await read('../src/styles.css');
const { MESSAGES } = await import('../src/i18n/messages.js');

test('compression settings: 1600px long edge, JPEG quality 70 %, 70 DPI', () => {
  assert.equal(SCAN_MAX_EDGE, 1600);
  assert.equal(SCAN_QUALITY, 0.7);
  assert.equal(SCAN_DPI, 70);
});

test('fitWithin scales the long edge down and never upscales', () => {
  assert.deepEqual(fitWithin(4032, 3024), { width: 1600, height: 1200 });
  assert.deepEqual(fitWithin(3024, 4032), { width: 1200, height: 1600 });
  assert.deepEqual(fitWithin(800, 600), { width: 800, height: 600 });
  assert.deepEqual(fitWithin(10000, 10, 1600), { width: 1600, height: 2 });
});

test('setJpegDpi rewrites an existing JFIF header to 70 dpi', () => {
  const jfif = Uint8Array.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01,
    0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9,
  ]);
  const out = setJpegDpi(jfif, 70);
  assert.equal(out.length, jfif.length);
  assert.equal(readJpegDpi(out), 70);
  assert.equal(out[13], 1);
  assert.deepEqual([...out.slice(14, 18)], [0, 70, 0, 70]);
  assert.equal(readJpegDpi(jfif), null); // input untouched (units 0 = aspect ratio only)
});

test('setJpegDpi inserts a JFIF header when missing; non-JPEG is unchanged', () => {
  const bare = Uint8Array.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x02, 0xff, 0xd9]);
  const out = setJpegDpi(bare, 70);
  assert.equal(out.length, bare.length + 18);
  assert.deepEqual([...out.slice(0, 4)], [0xff, 0xd8, 0xff, 0xe0]);
  assert.equal(readJpegDpi(out), 70);
  assert.deepEqual([...out.slice(20)], [...bare.slice(2)]);
  const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47]);
  assert.equal(setJpegDpi(png, 70), png);
});

test('scanToAmount maps the API total to the Amount field', () => {
  assert.deepEqual(scanToAmount({ total: 21, confidence: 'high', warnings: [] }),
    { amount: '21.00', lowConfidence: false, warnings: [] });
  assert.deepEqual(scanToAmount({ total: 12.5, confidence: 'low', warnings: [] }),
    { amount: '12.50', lowConfidence: true, warnings: [] });
});

test('scanToAmount returns no amount for missing / invalid totals', () => {
  assert.deepEqual(scanToAmount({ total: null, confidence: null, warnings: ['total_missing'] }),
    { amount: null, lowConfidence: false, warnings: ['total_missing'] });
  assert.equal(scanToAmount({ total: 0 }).amount, null);
  assert.equal(scanToAmount({ total: 2_000_000 }).amount, null);
  assert.equal(scanToAmount({ total: 'abc' }).amount, null);
  assert.deepEqual(scanToAmount(null), { amount: null, lowConfidence: false, warnings: [] });
});

test('scanErrorKey maps rate limit / disabled / other failures', () => {
  assert.equal(scanErrorKey({ status: 429 }), 'forms.expense.scanRateLimited');
  assert.equal(scanErrorKey({ status: 501 }), 'forms.expense.scanUnavailable');
  assert.equal(scanErrorKey({ status: 503 }), 'forms.expense.scanFailed');
  assert.equal(scanErrorKey(new TypeError('network')), 'forms.expense.scanFailed');
});

test('ExpenseForm: Scan button is mobile-only, create-only, capability-gated', () => {
  assert.match(forms, /useMediaQuery\(SCAN_MOBILE_QUERY\)/);
  assert.match(forms, /const canScan = !existing && isMobile && ocrEnabled;/);
  assert.match(forms, /api\.get\('\/api\/v1\/capabilities'\)/);
  assert.match(forms, /\{canScan && \(/);
  assert.ok(styles.includes(`@media ${SCAN_MOBILE_QUERY}`), 'query matches the mobile layout breakpoint');
});

test('ExpenseForm: scan input opens camera or library, compresses, calls the scan API', () => {
  const input = forms.match(/<input\s+ref=\{scanRef\}[\s\S]*?\/>/)?.[0] || '';
  assert.match(input, /type="file"/);
  assert.match(input, /accept="image\/\*"/);
  assert.doesNotMatch(input, /capture/, 'capture would force the camera and hide the library');
  assert.doesNotMatch(input, /multiple/);
  assert.match(forms, /await compressReceiptImage\(file\)/);
  assert.match(forms, /api\.postForm\(`\/api\/v1\/groups\/\$\{groupId\}\/expenses\/scan`, form\)/);
  assert.match(forms, /setStaged\(\(prev\) => \(prev\.length < maxStaged \? \[\.\.\.prev, img\] : prev\)\)/);
});

test('ExpenseForm: scan fills only the amount', () => {
  const handler = forms.match(/const onScanFile = async[\s\S]*?\n {2}\};/)?.[0] || '';
  assert.match(handler, /onAmountChange\(scanned\)/);
  for (const setter of ['setTitle', 'setSpentAt', 'setCategory', 'setTax', 'setTip']) {
    assert.doesNotMatch(handler, new RegExp(`${setter}\\(`), `${setter} must not be called by scan`);
  }
});

test('scan i18n keys exist in en and vi', () => {
  const keys = Object.keys(MESSAGES.en).filter((k) => k.startsWith('forms.expense.scan'));
  assert.ok(keys.length >= 11);
  for (const k of keys) assert.ok(MESSAGES.vi[k], `vi missing ${k}`);
  for (const k of ['scanRateLimited', 'scanUnavailable', 'scanFailed']) {
    assert.ok(MESSAGES.en[`forms.expense.${k}`]);
  }
});
