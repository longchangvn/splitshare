// node --test mobile/test/errors.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');

let errors;
test('load errors module', async () => {
  errors = await import('../src/lib/errors.js');
  assert.ok(errors.errorText);
});

const t = (key) => `T:${key}`;

test('network failure is distinguished from an HTTP status', () => {
  const offline = Object.assign(new Error('Network request failed'), { status: 0 });
  assert.equal(errors.isNetworkError(offline), true);
  assert.equal(errors.errorKey(offline), 'm.errors.network');
  const http = Object.assign(new Error('boom'), { status: 500 });
  assert.equal(errors.isNetworkError(http), false);
  assert.equal(errors.errorKey(http), 'm.errors.server');
});

test('every API money code maps to localized copy, not the server string', () => {
  const codes = [
    'HAS_OPEN_BALANCE', 'OVERPAYMENT', 'STALE_VERSION', 'EXPENSE_LOCKED',
    'GROUP_READ_ONLY', 'NUDGE_LIMIT', 'INVITE_ROTATED', 'OCR_UNAVAILABLE',
    'OCR_PROVIDER_ERROR', 'SESSION_EXPIRED', 'INVOLVES_REMOVED_MEMBER',
    'FORBIDDEN', 'NOT_FOUND', 'VALIDATION', 'GROUP_FULL', 'ALREADY_SETTLED',
  ];
  for (const code of codes) {
    assert.ok(errors.CODE_KEYS[code], `${code} needs an i18n key`);
    const err = Object.assign(new Error('Server English'), { status: 422, code });
    const text = errors.errorText(err, t);
    assert.equal(text, `T:${errors.CODE_KEYS[code]}`, code);
    assert.notEqual(text, 'Server English');
  }
});

test('unknown code falls back to the server message, then to generic copy', () => {
  assert.equal(errors.errorText({ status: 400, code: 'BRAND_NEW', message: 'Nope.' }, t), 'Nope.');
  assert.equal(errors.errorText({ status: 418, code: '' }, t), 'T:m.errors.unknown');
  assert.equal(errors.errorText(null, t), '');
});

test('field errors are joined per field', () => {
  const err = { status: 422, code: 'VALIDATION', fields: { amount: ['too big', 'and odd'], title: 'required' } };
  assert.deepEqual(errors.fieldErrors(err), { amount: 'too big and odd', title: 'required' });
  assert.equal(errors.firstFieldError(err), 'too big and odd');
  assert.deepEqual(errors.fieldErrors({}), {});
  assert.equal(errors.firstFieldError(null), null);
});

test('money validation reasons map to field copy keys', () => {
  assert.equal(errors.MONEY_FIELD_KEYS.format, 'm.field.amountFormat');
  assert.equal(errors.MONEY_FIELD_KEYS.max, 'm.field.amountMax');
});
