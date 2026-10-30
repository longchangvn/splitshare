// Pure ExpenseForm logic (mobile/src/components/expense/formLogic.js) — parity with web Forms.jsx.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  initSel, initValues, initPayer, droppedMembers, valuesForType, pickCategory, buildBody,
  runningTotals, equalNote, isValidDay, auditLines, saveErrorKey,
} from '../src/components/expense/formLogic.js';
import expenseMessages from '../src/i18n/mobile/expense.js';

const t = (k, v) => (v ? `${k}:${JSON.stringify(v)}` : k);
const members = [{ user_id: 'a', display_name: 'An' }, { user_id: 'b', display_name: 'Bao' }, { user_id: 'c', display_name: 'Chi' }];

const baseForm = {
  title: 'Dinner', amount: '30', payer: 'a', type: 'EQUAL', sel: ['a', 'b'], values: {},
  category: 'food', spentAt: '2024-05-01', onlyPresent: false,
  tax: '', tip: '', fee: '', origCur: '', origAmt: '', fxRate: '', guests: [],
};

test('copy drops former members and falls back to everyone when none are left', () => {
  const copyFrom = { splits: [{ user_id: 'a' }, { user_id: 'gone' }] };
  assert.deepEqual(initSel({ copyFrom, members }), ['a']);
  assert.deepEqual(droppedMembers(copyFrom, members), ['gone']);
  assert.deepEqual(initSel({ copyFrom: { splits: [{ user_id: 'gone' }] }, members }), ['a', 'b', 'c']);
  assert.deepEqual(initSel({ existing: { splits: [{ user_id: 'gone' }] }, members }), ['gone']);
});

test('payer default: source payer → me → first member', () => {
  assert.equal(initPayer({ payer_id: 'b' }, members, 'c'), 'b');
  assert.equal(initPayer({ payer_id: 'gone' }, members, 'c'), 'c');
  assert.equal(initPayer(null, members, 'zzz'), 'a');
});

test('initValues reads EXACT/PERCENT/SHARES split rows; SHARES defaults to 1', () => {
  const src = { splits: [{ user_id: 'a', exact_cents: 1250, percent: 40, shares: 2 }, { user_id: 'b' }] };
  assert.deepEqual(initValues(src, 'EXACT', ['a', 'b']), { a: '12.5' });
  assert.deepEqual(initValues(src, 'PERCENT', ['a']), { a: '40' });
  assert.deepEqual(initValues(src, 'SHARES', ['a', 'b']), { a: '2', b: '1' });
});

test('switching type prefills only empty boxes', () => {
  assert.deepEqual(valuesForType({}, 'PERCENT', ['a', 'b', 'c']), { a: '33.34', b: '33.33', c: '33.33' });
  assert.deepEqual(valuesForType({ a: '50' }, 'PERCENT', ['a', 'b']), { a: '50', b: '50' });
  assert.deepEqual(valuesForType({ a: '3' }, 'SHARES', ['a', 'b']), { a: '3', b: '1' });
  const prev = { a: '1' };
  assert.equal(valuesForType(prev, 'EQUAL', ['a', 'b']), prev);
});

test('category fallback: keep → source → food → other → first', () => {
  const list = [{ key: 'other' }, { key: 'food' }, { key: 'x' }];
  assert.equal(pickCategory(list, 'x', null), 'x');
  assert.equal(pickCategory(list, 'nope', 'other'), 'other');
  assert.equal(pickCategory(list, 'nope', null), 'food');
  assert.equal(pickCategory([{ key: 'z' }], 'nope', null), 'z');
  assert.equal(pickCategory([], 'food', null), 'food');
});

test('buildBody matches web build() incl. bill details and split arrays', () => {
  const b = buildBody({
    ...baseForm, type: 'SHARES', values: { a: '', b: '2.6' }, tax: '1.5', fee: '0',
    origCur: ' jpy ', origAmt: '1000', fxRate: '0.0065',
    guests: [{ label: 'Kid', amount: '4.20', covered_by: 'a' }],
  });
  assert.equal(b.spent_at, '2024-05-01T12:00:00.000Z');
  assert.equal(b.tax, 1.5);
  assert.equal(b.fee, 0);
  assert.equal(b.tip, undefined);
  assert.equal(b.orig_currency, 'JPY');
  assert.deepEqual(b.guests, [{ label: 'Kid', amount_cents: 420, covered_by: 'a' }]);
  assert.deepEqual(b.shares, [{ user_id: 'a', shares: 1 }, { user_id: 'b', shares: 3 }]);
  const ex = buildBody({ ...baseForm, type: 'EXACT', values: { a: '10.005', b: '20' } });
  assert.deepEqual(ex.exact, [{ user_id: 'a', amount_cents: 1001 }, { user_id: 'b', amount_cents: 2000 }]);
  assert.equal(buildBody({ ...baseForm, spentAt: '' }).spent_at, null);
});

test('running totals and EQUAL note', () => {
  assert.equal(runningTotals({ type: 'EQUAL', sel: ['a'], values: {}, amount: '1' }, t), null);
  assert.equal(runningTotals({ type: 'EXACT', sel: ['a', 'b'], values: { a: '10', b: '20' }, amount: '30' }, t).ok, true);
  assert.equal(runningTotals({ type: 'PERCENT', sel: ['a', 'b'], values: { a: '10', b: '20' }, amount: '30' }, t).ok, false);
  const note = equalNote('EQUAL', { shares: { a: 334, b: 333, c: 333 } }, { fmtCents: (c) => `$${c / 100}`, nameOf: (id) => id.toUpperCase() }, t);
  assert.match(note, /equalNoteLucky/);
  assert.match(note, /"lucky":"A"/);
});

test('spent-on date validation', () => {
  const now = new Date('2024-05-10T08:00:00Z');
  assert.equal(isValidDay('', now), true);
  assert.equal(isValidDay('2024-05-09', now), true);
  assert.equal(isValidDay('2024-05-11', now), true); // UTC slack
  assert.equal(isValidDay('2024-05-12', now), false);
  assert.equal(isValidDay('2024-02-30', now), false);
  assert.equal(isValidDay('2024/05/01', now), false);
});

test('audit lines are readable and error codes map to friendly keys', () => {
  const lines = auditLines(
    { title: { from: 'A', to: 'B' }, amount_cents: { from: 100, to: 250 }, splits: { from: { a: 100 }, to: { a: 125, b: 125 } } },
    { fmtCents: (c) => `$${(c / 100).toFixed(2)}`, nameOf: (id) => id, categoryOf: (k) => k },
    (k) => k,
  );
  assert.deepEqual(lines, [
    'forms.expense.title: A → B',
    'forms.expense.amount: $1.00 → $2.50',
    'expense.splits: a $1.00 → $1.25, b — → $1.25',
  ]);
  assert.deepEqual(auditLines({ deleted: true, title: 'X' }, {}, (k) => k), ['m.expense.audit.deleted']);
  assert.equal(saveErrorKey({ code: 'STALE_VERSION' }), 'm.expense.err.stale');
  assert.equal(saveErrorKey({ code: 'VALIDATION' }), null);
});

test('every m.expense key used by the expense screens exists in en and vi', () => {
  const files = [
    '../src/screens/AddExpenseScreen.js', '../src/screens/ExpenseDetailScreen.js', '../src/screens/ScanReceiptsScreen.js',
    '../src/components/expense/ExpenseForm.js', '../src/components/expense/formLogic.js',
  ];
  const used = new Set();
  for (const f of files) {
    const src = fs.readFileSync(new URL(f, import.meta.url), 'utf8');
    for (const m of src.matchAll(/'(m\.expense\.[\w.]+)'/g)) used.add(m[1]);
  }
  assert.ok(used.size > 10);
  for (const k of used) {
    assert.ok(expenseMessages.en[k], `en missing ${k}`);
    assert.ok(expenseMessages.vi[k], `vi missing ${k}`);
  }
  assert.deepEqual(Object.keys(expenseMessages.en).sort(), Object.keys(expenseMessages.vi).sort());
});
