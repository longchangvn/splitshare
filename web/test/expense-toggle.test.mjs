import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { canToggleExpense, groupRawDebts, ledgerTotals } from '../src/expenseToggle.js';

// Enable/disable expense (persisted) + raw owe section in Balances.

const groupDetail = await readFile(new URL('../src/pages/GroupDetail.jsx', import.meta.url), 'utf8');
const { MESSAGES } = await import('../src/i18n/messages.js');
const mobileFile = (rel) => readFile(new URL(`../../mobile/src/${rel}`, import.meta.url), 'utf8');

test('ledger totals skip disabled expenses and count them', () => {
  const r = ledgerTotals([
    { kind: 'expense', amount_cents: 2000, my_share_cents: 1000 },
    { kind: 'expense', amount_cents: 1000, my_share_cents: 500, excluded: true },
    { kind: 'payment', amount_cents: 300, my_share_cents: -300 },
  ]);
  assert.deepEqual(r, { amount: 2300, mine: 700, excluded: 1 });
  assert.deepEqual(ledgerTotals(null), { amount: 0, mine: 0, excluded: 0 });
});

test('toggle offered only on open expenses', () => {
  assert.equal(canToggleExpense({ kind: 'expense', status: 'OPEN' }), true);
  assert.equal(canToggleExpense({ kind: 'expense', status: 'LOCKED' }), false);
  assert.equal(canToggleExpense({ kind: 'payment', status: 'OPEN' }), false);
  assert.equal(canToggleExpense(null), false);
});

test('raw debts grouped by debtor with totals, biggest first', () => {
  const g = groupRawDebts([
    { from_user_id: 'b', from_name: 'B', to_user_id: 'a', to_name: 'A', amount_cents: 700 },
    { from_user_id: 'c', from_name: 'C', to_user_id: 'b', to_name: 'B', amount_cents: 1000 },
    { from_user_id: 'c', from_name: 'C', to_user_id: 'a', to_name: 'A', amount_cents: 200 },
    { from_user_id: 'x', to_user_id: 'y', amount_cents: 0 },
  ]);
  assert.equal(g.length, 2);
  assert.equal(g[0].from_user_id, 'c');
  assert.equal(g[0].total_cents, 1200);
  assert.deepEqual(g[0].items.map((i) => i.to_user_id), ['b', 'a']);
  assert.equal(g[1].total_cents, 700);
  assert.deepEqual(groupRawDebts(undefined), []);
});

test('web wires the toggle endpoint and raw owe panel', () => {
  assert.match(groupDetail, /api\.patch\(`\/api\/v1\/expenses\/\$\{item\.id\}\/excluded`, \{ excluded \}\)/);
  assert.match(groupDetail, /<RawOwePanel /);
  assert.match(groupDetail, /ledgerTotals\(ledger\?\.items\)/);
});

test('i18n keys exist in every locale', () => {
  const keys = ['groupDetail.rawOweTitle', 'groupDetail.rawOweHint', 'groupDetail.rawOweEmpty',
    'groupDetail.rawOweTotal', 'groupDetail.includeExpense', 'groupDetail.expenseDisabled',
    'groupDetail.expenseNowDisabled', 'groupDetail.expenseNowEnabled', 'groupDetail.excludedNotCounted'];
  for (const [loc, msgs] of Object.entries(MESSAGES)) {
    for (const k of keys) assert.ok(msgs[k], `${loc} missing ${k}`);
  }
});

test('mobile mirrors toggle + raw owe', async () => {
  const ledger = await mobileFile('components/group/LedgerTab.js');
  const balances = await mobileFile('components/group/BalancesTab.js');
  const screen = await mobileFile('screens/GroupScreen.js');
  assert.match(ledger, /ledgerTotals/);
  assert.match(ledger, /onToggleExcluded/);
  assert.match(balances, /groupDetail\.rawOweTitle/);
  assert.match(screen, /\/excluded`/);
});
