// node --test mobile/test/expense.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');

let ep;
let ledger;
test('load modules', async () => {
  ep = await import('../src/lib/expensePayload.js');
  ledger = await import('../src/lib/ledger.js');
  assert.ok(ep.buildExpensePayload && ledger.buildLedgerQuery);
});

const base = {
  title: 'Dinner',
  amount: '45.20',
  payerId: 'u-a',
  splitType: 'EQUAL',
  participantIds: ['u-a', 'u-b', 'u-c'],
  category: 'food',
  spentAt: '2026-10-20',
  onlyPresent: false,
  tax: '',
  tip: '',
  fee: '',
  origCurrency: '',
  origAmount: '',
  fxRate: '',
  guests: [],
  values: {},
};

test('payload matches the web build() shape', () => {
  const body = ep.buildExpensePayload(base);
  assert.deepEqual(Object.keys(body), [
    'title', 'amount', 'payer_id', 'split_type', 'participant_ids',
    'category', 'spent_at', 'only_present',
  ]);
  assert.equal(body.amount, 45.2);
  assert.equal(body.spent_at, '2026-10-20T12:00:00.000Z');
  assert.equal(body.only_present, false);
});

test('optional money/FX/guest keys only appear when filled', () => {
  const body = ep.buildExpensePayload({
    ...base,
    tax: '4.00',
    tip: '1',
    fee: '',
    origCurrency: ' eur ',
    origAmount: '40',
    fxRate: '1.13',
    guests: [{ label: 'Kid', amount: '9.50', covered_by: 'u-a' }],
  });
  assert.equal(body.tax, 4);
  assert.equal(body.tip, 1);
  assert.equal('fee' in body, false);
  assert.equal(body.orig_currency, 'EUR');
  assert.equal(body.orig_amount, 40);
  assert.equal(body.fx_rate, 1.13);
  assert.deepEqual(body.guests, [{ label: 'Kid', amount_cents: 950, covered_by: 'u-a' }]);
});

test('split-specific arrays', () => {
  const exact = ep.buildExpensePayload({
    ...base, splitType: 'EXACT', values: { 'u-a': '20', 'u-b': '15.20', 'u-c': '10' },
  });
  assert.deepEqual(exact.exact, [
    { user_id: 'u-a', amount_cents: 2000 },
    { user_id: 'u-b', amount_cents: 1520 },
    { user_id: 'u-c', amount_cents: 1000 },
  ]);
  assert.equal('percent' in exact, false);

  const percent = ep.buildExpensePayload({ ...base, splitType: 'PERCENT', values: { 'u-a': '50' } });
  assert.deepEqual(percent.percent[0], { user_id: 'u-a', percent: 50 });
  assert.equal(percent.percent[1].percent, 0); // missing box is 0, same as web

  const shares = ep.buildExpensePayload({ ...base, splitType: 'SHARES', values: { 'u-a': '', 'u-b': '3', 'u-c': '0' } });
  assert.deepEqual(shares.shares, [
    { user_id: 'u-a', shares: 1 }, // empty box means 1
    { user_id: 'u-b', shares: 3 },
    { user_id: 'u-c', shares: 1 }, // 0 is clamped to 1
  ]);
});

test('equal percent distribution sums to 100 with remainder on the first members', () => {
  const three = ep.equalPercent(3);
  assert.deepEqual(three, ['33.34', '33.33', '33.33']);
  assert.equal(three.reduce((a, b) => a + Number(b), 0).toFixed(2), '100.00');
  assert.deepEqual(ep.equalPercent(1), ['100']);
  assert.equal(ep.equalPercent(7).reduce((a, b) => a + Number(b), 0).toFixed(2), '100.00');
});

test('splitTotals mirrors web wording inputs', () => {
  const exact = ep.splitTotals({ ...base, splitType: 'EXACT', values: { 'u-a': '20', 'u-b': '20' } });
  assert.equal(exact.ok, false); // 40.00 vs 45.20 total
  const exactOk = ep.splitTotals({ ...base, splitType: 'EXACT', values: { 'u-a': '20', 'u-b': '15.20', 'u-c': '10' } });
  assert.equal(exactOk.ok, true);
  const percent = ep.splitTotals({ ...base, splitType: 'PERCENT', values: { 'u-a': '50', 'u-b': '50', 'u-c': '0' } });
  assert.equal(percent.ok, true);
  assert.equal(ep.splitTotals(base), null);
});

test('validation blocks avoidable 422s', () => {
  assert.equal(ep.validateExpenseForm(base).ok, true);

  assert.deepEqual(ep.validateExpenseForm({ ...base, title: '' }).errors, { title: 'title' });
  assert.deepEqual(ep.validateExpenseForm({ ...base, amount: '0' }).errors, { amount: 'positive' });
  assert.deepEqual(ep.validateExpenseForm({ ...base, amount: '1.234' }).errors, { amount: 'format' });
  assert.deepEqual(ep.validateExpenseForm({ ...base, amount: '2000000' }).errors, { amount: 'max' });
  assert.deepEqual(ep.validateExpenseForm({ ...base, payerId: '' }).errors, { payer_id: 'required' });
  assert.deepEqual(ep.validateExpenseForm({ ...base, participantIds: [] }).errors, { participant_ids: 'required' });
  assert.deepEqual(ep.validateExpenseForm({ ...base, spentAt: '2026-13-01' }).errors, { spentAt: 'date' });
  assert.deepEqual(ep.validateExpenseForm({ ...base, spentAt: '' }).errors, { spentAt: 'date' });
  assert.deepEqual(ep.validateExpenseForm({ ...base, spentAt: '2999-01-01' }).errors, { spentAt: 'future' });
  // Optional boxes are only validated when something was typed.
  assert.deepEqual(ep.validateExpenseForm({ ...base, tax: 'abc' }).errors, { tax: 'format' });
  assert.equal(ep.validateExpenseForm({ ...base, tax: '' }).ok, true);
  // FX needs both an amount and a positive rate.
  assert.deepEqual(
    ep.validateExpenseForm({ ...base, origCurrency: 'EUR', origAmount: '10', fxRate: '0' }).errors,
    { fx_rate: 'rate' },
  );
});

test('patch always carries expected_version', () => {
  const patch = ep.buildExpensePatch(base, 7);
  assert.equal(patch.expected_version, 7);
  assert.equal(patch.title, 'Dinner');
});

test('ledger query matches the web parameter contract', () => {
  const q = ledger.buildLedgerQuery('g1', {
    type: 'expense', q: 'pho', payer_id: 'u-b', status: 'OPEN', category: 'food',
    min_amount: '5', max_amount: '50.5', from_date: '2026-10-01', to_date: '2026-10-31',
    sort: 'oldest',
  }, 100);
  assert.equal(q, '/api/v1/groups/g1/ledger?type=expense&q=pho&limit=100'
    + '&payer_id=u-b&status=OPEN&category=food&min_amount=500&max_amount=5050'
    + '&from_date=2026-10-01T00%3A00%3A00.000Z&to_date=2026-10-31T23%3A59%3A59.000Z&sort=created_at');

  const dflt = ledger.buildLedgerQuery('g1');
  assert.equal(dflt, '/api/v1/groups/g1/ledger?type=&q=&limit=100&status=OPEN');
  // Newest is the server default, so no sort param.
  assert.equal(ledger.buildLedgerQuery('g1', { sort: 'created_at_desc' }).includes('sort='), false);
});

test('active filter count and totals', () => {
  assert.equal(ledger.activeFilterCount({ status: 'OPEN' }), 0);
  assert.equal(ledger.activeFilterCount({ status: 'OPEN', type: 'payment', min_amount: '1' }), 2);
  const totals = ledger.ledgerTotals([
    { amount_cents: 4500, my_share_cents: 1500 },
    { kind: 'payment', amount_cents: 1000, my_share_cents: 0 },
  ]);
  assert.deepEqual(totals, { amount: 5500, mine: 1500 });
});

test('three distinct ledger empty states', () => {
  assert.equal(ledger.ledgerEmptyState({ archived: true }), 'archive');
  assert.equal(ledger.ledgerEmptyState({ archived: false, hasHistory: true, transfers: 0 }), 'all-settled');
  assert.equal(ledger.ledgerEmptyState({ archived: false, hasHistory: false, transfers: 2 }), 'none');
});
