// Pure helpers behind GroupDetail / Settlement / Report (mirrors web GroupDetail rules).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_FILTERS, activeFilterCount, buildLedgerQuery, canWriteGroup, canEditExpense, canReversePayment,
  groupSettledOf, ledgerEmptyKind, hasLedgerHistory, groupByDebtor, mergeActivityFeed, paginate,
  chartColorsFor, categoryRowsOf, distributionOf, parseEmails, isValidDateInput, netTone,
} from '../src/components/group/helpers.js';

test('ledger defaults to the active scope and always sends status', () => {
  assert.equal(DEFAULT_FILTERS.status, 'OPEN');
  const qs = buildLedgerQuery({ type: 'all', q: '' }, DEFAULT_FILTERS);
  assert.match(qs, /status=OPEN/);
  assert.match(qs, /limit=100/);
  assert.doesNotMatch(qs, /sort=/);
});

test('ledger query maps filters like web loadLedger', () => {
  const qs = buildLedgerQuery({ type: 'expense', q: 'taxi ride' }, {
    payer: 'u1', status: 'LOCKED', cat: 'food', min: '1.5', max: '20', from: '2026-01-02', to: '2026-01-03', sort: 'oldest',
  });
  assert.match(qs, /type=expense/);
  assert.match(qs, /q=taxi%20ride/);
  assert.match(qs, /payer_id=u1/);
  assert.match(qs, /status=LOCKED/);
  assert.match(qs, /category=food/);
  assert.match(qs, /min_amount=150/);
  assert.match(qs, /max_amount=2000/);
  assert.match(qs, /from_date=2026-01-02T00%3A00%3A00.000Z/);
  assert.match(qs, /to_date=2026-01-03T23%3A59%3A59.000Z/);
  assert.match(qs, /sort=created_at/);
});

test('invalid dates are ignored, not sent', () => {
  assert.equal(isValidDateInput('2026-13-40'), false);
  assert.equal(isValidDateInput(''), true);
  assert.doesNotMatch(buildLedgerQuery({}, { ...DEFAULT_FILTERS, from: '2026-1-2' }), /from_date/);
});

test('active filter count ignores defaults', () => {
  assert.equal(activeFilterCount(DEFAULT_FILTERS), 0);
  assert.equal(activeFilterCount({ ...DEFAULT_FILTERS, status: 'LOCKED', sort: 'oldest', payer: 'x' }), 3);
});

test('write + edit permissions follow group lifecycle', () => {
  assert.equal(canWriteGroup({ status: 'opening' }), true);
  assert.equal(canWriteGroup({ status: 'locked', my_role: 'member' }), false);
  assert.equal(canWriteGroup({ status: 'locked', my_role: 'owner' }), true);
  assert.equal(canWriteGroup({ status: 'closed', my_role: 'owner' }), false);
  const item = { kind: 'expense', status: 'OPEN', created_by: 'me' };
  assert.equal(canEditExpense(item, { status: 'opening', my_role: 'member' }, 'me'), true);
  assert.equal(canEditExpense(item, { status: 'opening', my_role: 'member' }, 'other'), false);
  assert.equal(canEditExpense({ ...item, status: 'LOCKED' }, { status: 'opening', my_role: 'owner' }, 'me'), false);
});

test('payment reversal: owner/treasurer, open, within 24h', () => {
  const now = Date.parse('2026-05-02T12:00:00Z');
  const p = { status: 'OPEN', created_at: '2026-05-02T00:00:00Z' };
  assert.equal(canReversePayment(p, { my_role: 'owner' }, now), true);
  assert.equal(canReversePayment(p, { my_role: 'member' }, now), false);
  assert.equal(canReversePayment({ ...p, reversed: true }, { my_role: 'owner' }, now), false);
  assert.equal(canReversePayment({ ...p, created_at: '2026-04-30T00:00:00Z' }, { my_role: 'treasurer' }, now), false);
});

test('empty states: archive / all settled / active', () => {
  assert.equal(groupSettledOf({ transfers: [] }, null), true);
  assert.equal(groupSettledOf(null, [{ net_cents: 5 }]), false);
  assert.equal(groupSettledOf(null, null), null);
  assert.equal(hasLedgerHistory([{ total_paid_cents: 100 }]), true);
  assert.equal(ledgerEmptyKind('LOCKED', true, true), 'archive');
  assert.equal(ledgerEmptyKind('OPEN', true, true), 'settled');
  assert.equal(ledgerEmptyKind('OPEN', true, false), 'active');
});

test('debtor grouping and activity merge', () => {
  const g = groupByDebtor([{ from_user_id: 'a', to_user_id: 'b' }, { from_user_id: 'a', to_user_id: 'c' }, { from_user_id: 'd', to_user_id: 'b' }]);
  assert.deepEqual(g.map(([k, l]) => [k, l.length]), [['a', 2], ['d', 1]]);
  const feed = mergeActivityFeed(
    [{ id: 'p1', created_at: '2026-01-02T00:00:00Z' }],
    [{ kind: 'payment', at: '2026-01-05T00:00:00Z' }, { kind: 'expense', at: '2026-01-03T00:00:00Z', text: 'x' }],
  );
  assert.deepEqual(feed.map((r) => r.kind), ['expense', 'payment']);
  const pg = paginate(Array.from({ length: 23 }, (_, i) => i), 9);
  assert.equal(pg.page, 3);
  assert.equal(pg.count, 3);
  assert.deepEqual(pg.items, [20, 21, 22]);
});

test('chart colours and distributions', () => {
  const cats = chartColorsFor(['food', 'custom1', 'custom2'], 'category');
  assert.equal(cats.get('food'), '#fbbf24');
  assert.notEqual(cats.get('custom1'), cats.get('custom2'));
  const d = distributionOf([{ key: 'a', value: 300 }, { key: 'b', value: 100 }, { key: 'c', value: 0 }]);
  assert.equal(d.total, 400);
  assert.deepEqual(d.rows.map((r) => r.pct), [75, 25]);
  const t = (k) => ({ 'forms.expense.cat.food': 'Food', 'forms.expense.cat.other': 'Other' }[k] || k);
  const rows = categoryRowsOf([{ category: 'Food', expense_count: 1, paid_cents: 5 }, { category: 'Gifts', expense_count: 2, paid_cents: 9 }], t);
  assert.deepEqual(rows.map((r) => r.label), ['Gifts', 'Food']);
});

test('misc', () => {
  assert.deepEqual(parseEmails('a@x.com, b@y.com;\nc@z.com'), ['a@x.com', 'b@y.com', 'c@z.com']);
  assert.equal(netTone(0), 'settled');
  assert.equal(netTone(-1), 'owe');
  assert.equal(netTone(1), 'owed');
});
