// Money input rules must match web/src/components/Forms.jsx.
import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeMoneyInput, isValidMoneyAmount, moneyAmountError, equalPercent } from '../src/money.js';

const t = (k, v) => (v ? `${k}:${JSON.stringify(v)}` : k);

test('sanitizeMoneyInput keeps digits + one dot, 7 int / 2 dec, comma keypads', () => {
  assert.equal(sanitizeMoneyInput('12.345'), '12.34');
  assert.equal(sanitizeMoneyInput('43,22'), '43.22');
  assert.equal(sanitizeMoneyInput('1.234,5'), '1234.5');
  assert.equal(sanitizeMoneyInput('$1a2b'), '12');
  assert.equal(sanitizeMoneyInput('.5'), '0.5');
  assert.equal(sanitizeMoneyInput('123456789'), '1234567');
});

test('isValidMoneyAmount / moneyAmountError', () => {
  assert.equal(isValidMoneyAmount('10.5'), true);
  assert.equal(isValidMoneyAmount('0'), false);
  assert.equal(isValidMoneyAmount('1000000.01'), false);
  assert.equal(moneyAmountError('', t), null);
  assert.equal(moneyAmountError('0', t), 'forms.payment.invalidAmount');
  assert.match(moneyAmountError('2000000', t), /forms\.payment\.amountMax/);
});

test('equalPercent sums to exactly 100', () => {
  const p = equalPercent(3).map(Number);
  assert.equal(Math.round(p.reduce((a, b) => a + b, 0) * 100), 10000);
  assert.deepEqual(equalPercent(0), []);
});
