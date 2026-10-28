import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { normalizeDecimalInput } from '../src/decimalInput.js';

test('comma from a locale decimal keypad becomes the decimal point', () => {
  assert.equal(normalizeDecimalInput('43,22'), '43.22');
  assert.equal(normalizeDecimalInput('43,'), '43.');
  assert.equal(normalizeDecimalInput(',5'), '.5');
});

test('dot input and empty values are unchanged', () => {
  assert.equal(normalizeDecimalInput('43.22'), '43.22');
  assert.equal(normalizeDecimalInput(''), '');
  assert.equal(normalizeDecimalInput(null), '');
});

test('last separator wins when both appear (pasted grouped numbers)', () => {
  assert.equal(normalizeDecimalInput('1,234.56'), '1234.56');
  assert.equal(normalizeDecimalInput('1.234,56'), '1234.56');
});

test('decimal inputs in forms route through the normalizer', async () => {
  const forms = await readFile(new URL('../src/components/Forms.jsx', import.meta.url), 'utf8');
  assert.match(forms, /let s = dec\(raw\)\.replace/);
  for (const setter of ['setTax', 'setTip', 'setFee', 'setOrigAmt', 'setFxRate']) {
    assert.match(forms, new RegExp(`${setter}\\(dec\\(x\\.target\\.value\\)\\)`), setter);
  }
});
