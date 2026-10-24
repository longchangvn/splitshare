import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  MAX_BATCH, buildExpensePayload, cardAmount, cardFromSuggestion, findDuplicates,
  moneyToCents, newCard, runPool, todayIso, validateCard,
} from '../src/receiptBatch.js';

const read = (p) => readFile(new URL(p, import.meta.url), 'utf8');
const groupDetail = await read('../src/pages/GroupDetail.jsx');
const modal = await read('../src/components/ScanReceipts.jsx');
const apiJs = await read('../src/api.js');
const { MESSAGES } = await import('../src/i18n/messages.js');

const MEMBERS = [
  { user_id: 'u1', display_name: 'An' },
  { user_id: 'u2', display_name: 'Binh' },
];
const GROUP = {
  currency: 'USD',
  categories: [{ key: 'food', name: 'Food' }, { key: 'stay', name: 'Stay' }],
};
const file = { name: 'IMG_0042.jpg', type: 'image/jpeg', size: 2048 };

function readyCard(overrides = {}) {
  return { ...newCard(file, new Date('2026-10-20T09:00:00Z')), payerId: 'u1', participantIds: ['u1', 'u2'], ...overrides };
}

test('moneyToCents accepts plain amounts and rejects junk / out-of-range values', () => {
  assert.equal(moneyToCents('12.50'), 1250);
  assert.equal(moneyToCents('21'), 2100);
  assert.equal(moneyToCents(''), null);
  assert.equal(moneyToCents('0'), null);
  assert.equal(moneyToCents('1.234'), null);
  assert.equal(moneyToCents('1,000'), null);
  assert.equal(moneyToCents('2000000'), null);
  assert.equal(MAX_BATCH, 10);
});

test('newCard seeds a review card with its own idempotency key', () => {
  const a = newCard(file, new Date('2026-10-20T09:00:00Z'));
  const b = newCard(file);
  assert.equal(a.status, 'scanning');
  assert.equal(a.spentAt, '2026-10-20');
  assert.equal(a.name, 'IMG_0042.jpg');
  assert.ok(a.id && a.key && a.id !== a.key);
  assert.notEqual(a.key, b.key);
});

test('cardFromSuggestion reads the additive scan contract', () => {
  const card = cardFromSuggestion(newCard(file), {
    total: 24.5,
    confidence: 'high',
    warnings: [],
    receipt: {
      merchant: 'Corner Bistro', total: 24.5, currency: 'USD', date: '2026-10-18',
      tax: 2.1, tip: 3, category: 'food',
      confidence: { total: 'high', date: 'high', merchant: 'high', category: 'high' },
    },
  }, GROUP);
  assert.equal(card.status, 'ready');
  assert.equal(card.title, 'Corner Bistro');
  assert.equal(card.amount, '24.50');
  assert.equal(card.spentAt, '2026-10-18');
  assert.equal(card.category, 'food');
  assert.equal(card.tax, '2.10');
  assert.equal(card.tip, '3.00');
  assert.equal(card.lowConfidence, false);
  assert.equal(card.origCurrency, '');
});

test('cardFromSuggestion ignores unknown categories and flags low confidence', () => {
  const card = cardFromSuggestion(newCard(file), {
    receipt: { total: 10, category: 'groceries', confidence: { total: 'low' } },
  }, GROUP);
  assert.equal(card.category, '');
  assert.equal(card.lowConfidence, true);
});

test('cardFromSuggestion falls back to manual entry when the total is missing', () => {
  const card = cardFromSuggestion(newCard(file), { total: null, warnings: ['total_missing'] }, GROUP);
  assert.equal(card.status, 'manual');
  assert.equal(card.amount, '');
  assert.equal(card.lowConfidence, true);
  assert.deepEqual(card.warnings, ['total_missing']);
  assert.match(card.title, /IMG 0042/);
});

test('foreign receipts ask for a rate instead of silently using the wrong currency', () => {
  const card = cardFromSuggestion(newCard(file), {
    receipt: { total: 12.5, currency: 'EUR', date: '2026-10-18' },
  }, GROUP);
  assert.equal(card.status, 'ready');
  assert.equal(card.origCurrency, 'EUR');
  assert.equal(card.origAmount, '12.50');
  assert.equal(card.amount, '');
  assert.equal(cardAmount(card), null);
  assert.ok(validateCard(card, MEMBERS).errors.includes('rate'));
  const converted = { ...card, fxRate: '1.08', payerId: 'u1', participantIds: ['u1', 'u2'] };
  assert.equal(cardAmount(converted), '13.50');
  assert.ok(validateCard(converted, MEMBERS).ok);
});

test('validateCard reports each missing field', () => {
  const empty = newCard(file);
  assert.deepEqual(validateCard(empty, MEMBERS).errors, ['title', 'amount', 'payer', 'participants']);

  const future = todayIso(new Date(Date.now() + 5 * 24 * 60 * 60 * 1000));
  const bad = validateCard(readyCard({ title: 'Dinner', amount: '10', spentAt: future }), MEMBERS);
  assert.deepEqual(bad.errors, ['date']);

  const outsider = validateCard(readyCard({ title: 'Dinner', amount: '10', payerId: 'zz', participantIds: ['zz'] }), MEMBERS);
  assert.deepEqual(outsider.errors, ['payer', 'participants']);

  assert.ok(validateCard(readyCard({ title: 'Dinner', amount: '10' }), MEMBERS).ok);
});

test('findDuplicates matches amount and day against existing expenses', () => {
  const cards = [
    readyCard({ amount: '21.00', spentAt: '2026-10-18' }),
    readyCard({ amount: '99.00', spentAt: '2026-10-18' }),
    readyCard({ amount: '8.00', spentAt: '2026-10-19' }),
  ];
  const expenses = [
    { kind: 'expense', amount_cents: 2100, created_at: '2026-10-18T12:00:00Z' },
    { kind: 'expense', amount_cents: 800, spent_at: '2026-10-19T08:00:00Z' },
    { kind: 'payment', amount_cents: 9900, created_at: '2026-10-18T12:00:00Z' },
    { kind: 'expense', amount_cents: 4200, created_at: '2026-10-18T12:00:00Z', reversed: true },
  ];
  assert.deepEqual(findDuplicates(cards, expenses), [cards[0].id, cards[2].id]);
});

test('buildExpensePayload mirrors the Add expense form (EQUAL split)', () => {
  const payload = buildExpensePayload(readyCard({
    title: '  Dinner  ', amount: '21.00', spentAt: '2026-10-18', category: 'food', tax: '1.50', tip: '3',
  }), MEMBERS);
  assert.deepEqual(payload, {
    title: 'Dinner',
    amount: 21,
    payer_id: 'u1',
    split_type: 'EQUAL',
    participant_ids: ['u1', 'u2'],
    category: 'food',
    spent_at: new Date('2026-10-18T12:00:00Z').toISOString(),
    only_present: false,
    tax: 1.5,
    tip: 3,
  });
});

test('buildExpensePayload sends the FX triple for a foreign receipt', () => {
  const payload = buildExpensePayload(readyCard({
    title: 'Cafe', amount: '', origCurrency: 'EUR', origAmount: '12.50', fxRate: '1.08', spentAt: '2026-10-18',
  }), MEMBERS);
  assert.equal(payload.amount, 13.5);
  assert.equal(payload.orig_currency, 'EUR');
  assert.equal(payload.orig_amount, 12.5);
  assert.equal(payload.fx_rate, 1.08);
});

test('runPool keeps at most N in flight and preserves input order', async () => {
  const seen = [];
  let active = 0;
  let peak = 0;
  const items = [1, 2, 3, 4, 5, 6, 7];
  const results = await runPool(items, 3, async (n) => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((r) => setTimeout(r, 5));
    active -= 1;
    seen.push(n);
    if (n === 4) throw new Error('boom');
    return n * 2;
  });
  assert.equal(peak, 3);
  assert.deepEqual(results.map((r) => r.value ?? 'x'), [2, 4, 6, 'x', 10, 12, 14]);
  assert.equal(results[3].status, 'rejected');
  assert.equal(results[3].reason.message, 'boom');
  assert.equal(seen.length, 7);
});

test('api.post forwards per-request headers such as Idempotency-Key', () => {
  assert.match(apiJs, /post: \(p, b, extra\) => reqAuth\('POST', p, b \?\? \{\}, extra \?\? \{\}\)/);
});

test('ScanReceipts scans with the batch endpoint, uploads the photo and retries failures', () => {
  assert.match(modal, /api\.postForm\(`\/api\/v1\/groups\/\$\{groupId\}\/expenses\/scan`, form\)/);
  assert.match(modal, /'Idempotency-Key': card\.key/);
  assert.match(modal, /api\.postForm\(`\/api\/v1\/expenses\/\$\{expenseId\}\/images`, form\)/);
  assert.match(modal, /multiple/);
  assert.match(modal, /capture="environment"/);
  assert.match(modal, /runPool\(added, 3, scanCard\)/);
  assert.match(modal, /createCards\(failed\)/);
  assert.doesNotMatch(modal, /split_type: 'EXACT'/);
});

test('GroupDetail shows the scan action only when capabilities report OCR', () => {
  assert.match(groupDetail, /api\.get\('\/api\/v1\/capabilities'\)/);
  assert.match(groupDetail, /const canScan = |ocrEnabled && \(/);
  assert.match(groupDetail, /<ScanReceipts[\s\S]*?meId=\{user\?\.user_id\}[\s\S]*?categories=\{categories\}/);
  assert.match(groupDetail, /onCreated=\{\(\) => \{ load\(\); loadLedger\(\); loadSummary\(\); \}\}/);
});

test('scan i18n keys exist in en and vi', () => {
  const keys = Object.keys(MESSAGES.en).filter((k) => k.startsWith('scan.'));
  assert.ok(keys.length >= 20, `expected the scan block, got ${keys.length} keys`);
  for (const k of keys) assert.ok(MESSAGES.vi[k], `vi missing ${k}`);
  for (const k of ['scan.open', 'scan.currencyMismatch', 'scan.create', 'scan.duplicate', 'scan.thirdParty']) {
    assert.ok(MESSAGES.en[k], `en missing ${k}`);
  }
});
