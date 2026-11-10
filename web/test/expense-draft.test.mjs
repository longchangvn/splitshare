// Shared expense draft (web/src/expenseDraft.js, specs/007): one model for Add expense,
// Quick Add, Copy, Edit and every Scan Receipts card, on web and mobile.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  applyScan, changeType, draftFromSource, draftToBody, effectiveAmount, hasBillDetails, isFxLocked,
  newDraft, pickCategory, pickScanCategory, runningTotals, splitBaseCents, toggleParticipant,
  validateDraft,
} from '../src/expenseDraft.js';
import { buildExpensePayload, newCard } from '../src/receiptBatch.js';

const read = (p) => readFile(new URL(p, import.meta.url), 'utf8');
const t = (k, v) => (v ? `${k}:${JSON.stringify(v)}` : k);
const members = [
  { user_id: 'a', display_name: 'An' },
  { user_id: 'b', display_name: 'Bao' },
  { user_id: 'c', display_name: 'Chi' },
];
const NOW = new Date('2026-11-08T09:00:00Z');
const ready = (over = {}) => ({ ...newDraft({ members, meId: 'a', now: NOW }), title: 'Dinner', amount: '30', ...over });

test('newDraft: everyone, payer = me, EQUAL, today; remembered split wins', () => {
  const d = newDraft({ members, meId: 'b', category: 'food', now: NOW });
  assert.deepEqual(d.participantIds, ['a', 'b', 'c']);
  assert.equal(d.payerId, 'b');
  assert.equal(d.splitType, 'EQUAL');
  assert.equal(d.spentAt, '2026-11-08');
  assert.equal(d.category, 'food');
  const r = newDraft({
    members, meId: 'b', category: 'food', now: NOW,
    remembered: { splitType: 'PERCENT', participantIds: ['a', 'c'], values: { a: '60', c: '40' }, payerId: 'c', category: 'stay' },
  });
  assert.equal(r.splitType, 'PERCENT');
  assert.deepEqual(r.participantIds, ['a', 'c']);
  assert.deepEqual(r.values, { a: '60', c: '40' });
  assert.equal(r.payerId, 'c');
  assert.equal(r.category, 'stay');
  assert.equal(newDraft({ members, remembered: { splitType: 'EQUAL', category: '' }, category: 'food' }).category, 'food');
});

test('draftFromSource: face amount = total − tax − tip − fee − guests (no double count on save)', () => {
  const source = {
    title: 'Hotel', amount_cents: 13500, tax_cents: 1000, tip_cents: 500, fee_cents: 0,
    guests: [{ label: 'Kid', share_cents: 2000, covered_by: 'a' }],
    payer_id: 'b', split_type: 'SHARES', category: 'stay', spent_at: '2026-11-01T12:00:00Z',
    splits: [{ user_id: 'a', shares: 2 }, { user_id: 'b', shares: 1 }, { user_id: 'gone', shares: 1 }],
  };
  const d = draftFromSource({ copyFrom: source, members, meId: 'a', title: 'Copy of Hotel', now: NOW });
  assert.equal(d.amount, '100.00');
  assert.equal(d.tax, '10.00');
  assert.equal(d.tip, '5.00');
  assert.deepEqual(d.participantIds, ['a', 'b']);
  assert.deepEqual(d.values, { a: '2', b: '1' });
  assert.equal(d.title, 'Copy of Hotel');
  assert.equal(d.spentAt, '2026-11-01');
  const body = draftToBody(d);
  assert.equal(body.amount + body.tax + body.tip + body.guests[0].amount_cents / 100, 135);
  const edit = draftFromSource({ existing: source, members, now: NOW });
  assert.deepEqual(edit.participantIds, ['a', 'b', 'gone']);
});

test('FX: amount is locked to foreign amount × rate (server rule)', () => {
  const d = ready({ amount: '1', origCurrency: 'jpy', origAmount: '1000', fxRate: '0.0065' });
  assert.equal(isFxLocked(d), true);
  assert.equal(effectiveAmount(d), '6.50');
  const body = draftToBody(d);
  assert.equal(body.amount, 6.5);
  assert.equal(body.orig_currency, 'JPY');
  assert.equal(body.fx_rate, 0.0065);
  assert.equal(effectiveAmount({ ...d, fxRate: '' }), null);
  assert.deepEqual(validateDraft({ ...d, fxRate: '' }, members, NOW).errors, ['amount', 'rate']);
  assert.equal(hasBillDetails(d), true);
  assert.equal(hasBillDetails(ready()), false);
});

test('split edits: switching type prefills, toggling stashes and restores values', () => {
  let d = ready();
  d = { ...d, ...changeType(d, 'PERCENT') };
  assert.deepEqual(d.values, { a: '33.34', b: '33.33', c: '33.33' });
  d = { ...d, ...toggleParticipant(d, 'b') };
  assert.deepEqual(d.participantIds, ['a', 'c']);
  assert.equal(d.values.b, undefined);
  d = { ...d, ...toggleParticipant(d, 'b') };
  assert.equal(d.values.b, '33.33');
  let s = { ...ready(), ...changeType(ready(), 'SHARES') };
  s = { ...s, ...toggleParticipant(s, 'c') };
  s = { ...s, stashed: {}, ...toggleParticipant({ ...s, stashed: {} }, 'c') };
  assert.equal(s.values.c, '1');
});

test('EXACT compares against amount + tax + tip + fee (server baseCents)', () => {
  const d = ready({ amount: '30', tax: '3', tip: '', fee: '0', splitType: 'EXACT', participantIds: ['a', 'b'], values: { a: '20', b: '13' } });
  assert.equal(splitBaseCents(d), 3300);
  assert.equal(runningTotals(d, t).ok, true);
  assert.match(runningTotals(d, t).text, /"total":"33.00"/);
  assert.equal(validateDraft(d, members, NOW).ok, true);
  assert.deepEqual(validateDraft({ ...d, values: { a: '20', b: '10' } }, members, NOW).errors, ['split']);
  assert.deepEqual(validateDraft(ready({ splitType: 'PERCENT', values: { a: '50', b: '20', c: '20' } }), members, NOW).errors, ['split']);
});

test('validateDraft: same rules everywhere (title 1–100, date required and ≤ tomorrow)', () => {
  assert.deepEqual(validateDraft(ready(), members, NOW).errors, []);
  assert.deepEqual(validateDraft(ready({ title: 'x'.repeat(101) }), members, NOW).errors, ['title']);
  assert.deepEqual(validateDraft(ready({ spentAt: '' }), members, NOW).errors, ['date']);
  assert.deepEqual(validateDraft(ready({ spentAt: '2026-11-10' }), members, NOW).errors, ['date']);
  assert.deepEqual(validateDraft(ready({ spentAt: '2026-11-09' }), members, NOW).errors, []);
  assert.deepEqual(validateDraft(ready({ participantIds: [] }), members, NOW).errors, ['participants']);
});

test('form and scan card send the same body for the same input', () => {
  const card = {
    ...newCard({ name: 'r.jpg' }, NOW), title: 'Dinner', amount: '30', payerId: 'a',
    participantIds: ['a', 'b'], splitType: 'SHARES', values: { a: '2', b: '1' }, category: 'food', tax: '1',
  };
  const form = { ...newDraft({ members, meId: 'a', now: NOW }), ...card };
  assert.deepEqual(buildExpensePayload(card, members), draftToBody(form));
});

test('categories: form keep → source → food → other; scan remembered → other', () => {
  const list = [{ key: 'other' }, { key: 'food' }, { key: 'stay' }];
  assert.equal(pickCategory(list, 'stay', null), 'stay');
  assert.equal(pickCategory(list, 'nope', null), 'food');
  assert.equal(pickScanCategory(list, 'stay'), 'stay');
  assert.equal(pickScanCategory(list, 'gone'), 'other');
  assert.equal(pickScanCategory([], ''), 'other');
});

test('applyScan: amount = grand total, tax/tip untouched; keep() protects user edits', () => {
  const resp = { receipt: { merchant: 'Pho 24', amount_spent: 42.5, tax: 3, tip: 2, date: '2026-11-07', category: 'food', currency: 'USD' } };
  const group = { currency: 'USD', categories: [{ key: 'food' }] };
  const { patch, scan } = applyScan(ready({ title: '' }), resp, group);
  assert.deepEqual(patch, { title: 'Pho 24', spentAt: '2026-11-07', category: 'food', amount: '42.50', origCurrency: '', origAmount: '', fxRate: '' });
  assert.equal(scan.hasTotal, true);
  const kept = applyScan(ready(), resp, group, { keep: (f) => f === 'title' }).patch;
  assert.equal(kept.title, undefined);
  assert.equal(kept.amount, '42.50');
  const foreign = applyScan(ready(), { receipt: { amount_spent: 12.5, currency: 'EUR' } }, group).patch;
  assert.deepEqual([foreign.amount, foreign.origCurrency, foreign.origAmount], ['', 'EUR', '12.50']);
});

test('ExpenseForm, scan cards and mobile all build on the shared draft module', async () => {
  for (const f of ['../src/receiptBatch.js', '../../mobile/src/components/expense/formLogic.js', '../../mobile/src/money.js']) {
    assert.match(await read(f), /expenseDraft\.js/, f);
  }
});
