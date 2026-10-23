import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { buildBalance, signPrefix, toneForNet } from '../src/balance.js';

const dashboard = await readFile(new URL('../src/pages/Dashboard.jsx', import.meta.url), 'utf8');
const messages = await readFile(new URL('../src/i18n/messages.js', import.meta.url), 'utf8');
const groupDetail = await readFile(new URL('../src/pages/GroupDetail.jsx', import.meta.url), 'utf8');
const report = await readFile(new URL('../src/pages/Report.jsx', import.meta.url), 'utf8');

test('owe/owed cards are combined into a single My balance card', () => {
  assert.doesNotMatch(dashboard, /dash-stat-btn dash-owe /);
  assert.doesNotMatch(dashboard, /dash-stat-btn dash-owed /);
  assert.match(dashboard, /dash-stat-btn dash-balance is-clickable/);
  assert.match(dashboard, /t\('dashboard\.myBalance'\)/);
  assert.equal((dashboard.match(/aria-controls="dash-breakdown"/g) ?? []).length, 1);
});

test('card uses the server-side netted balance block', () => {
  assert.match(dashboard, /buildBalance\(groups, data\?\.balance\)/);
});

test('clicking the card toggles the balance-by-group panel right after it', () => {
  const card = dashboard.indexOf('setOpenPanel(!openPanel)');
  const panel = dashboard.indexOf('{openPanel && (');
  assert.ok(card !== -1 && panel !== -1 && card < panel);
  assert.match(dashboard, /<BalancePanel groups=\{balance\.groups\}/);
  assert.match(dashboard, /t\('dashboard\.balanceByGroup'\)/);
});

test('buildBalance prefers the server netting and lists optimized transfers per open group', () => {
  const groups = [
    {
      group_id: 'g1', name: 'Trip', currency: 'USD', net_cents: 1500,
      my_transfers: [{ from_user_id: 'c', from_name: 'Cy', to_user_id: 'me', to_name: 'Me', amount_cents: 1500, from_me: false }],
    },
    { group_id: 'g2', name: 'Dinner', currency: 'USD', net_cents: -500,
      my_transfers: [{ from_user_id: 'me', from_name: 'Me', to_user_id: 'a', to_name: 'Ana', amount_cents: 500, from_me: true }] },
    { group_id: 'g3', name: 'Done', currency: 'USD', net_cents: 0, my_transfers: [] },
    { group_id: 'g4', name: 'EU', currency: 'EUR', net_cents: -200, my_transfers: [] },
  ];
  const server = {
    primary_currency: 'USD', primary_net_cents: 1000, direction: 'owed', group_count: 4, currency_count: 2,
    by_currency: [{ currency: 'USD', net_cents: 1000, group_count: 3 }, { currency: 'EUR', net_cents: -200, group_count: 1 }],
  };
  const b = buildBalance(groups, server);
  assert.equal(b.primaryCurrency, 'USD');
  assert.equal(b.primaryNetCents, 1000); // netted within USD only
  assert.equal(b.direction, 'owed');
  assert.equal(b.currencyCount, 2);
  assert.deepEqual(b.byCurrency.map((c) => [c.currency, c.net_cents]), [['USD', 1000], ['EUR', -200]]);
  // Settled group dropped; biggest swing first.
  assert.deepEqual(b.groups.map((g) => g.group_id), ['g1', 'g2', 'g4']);
  assert.equal(b.groups[0].transfers[0].from_me, false);
  assert.equal(b.groups[1].transfers[0].from_me, true);
});

test('buildBalance falls back to client netting without a server block', () => {
  const b = buildBalance([
    { group_id: 'a', name: 'A', currency: 'USD', net_cents: -700 },
    { group_id: 'b', name: 'B', currency: 'USD', net_cents: 200 },
  ]);
  assert.equal(b.primaryNetCents, -500);
  assert.equal(b.direction, 'owe');
  assert.equal(b.tone, 'open');
});

test('sign helpers', () => {
  assert.equal(signPrefix(5), '+');
  assert.equal(signPrefix(-5), '-');
  assert.equal(signPrefix(0), '');
  assert.equal(toneForNet(0), 'settled');
});

test('My balance strings exist in both en and vi maps', () => {
  const [en, vi] = messages.split(/const vi = \{/);
  for (const key of ['dashboard.myBalance', 'dashboard.balanceOwe', 'dashboard.balanceOwed',
    'dashboard.balanceByGroup', 'dashboard.transferPay', 'dashboard.transferReceive', 'dashboard.optimizedNote']) {
    const entry = new RegExp(`'${key.replace(/\./g, '\\.')}':`);
    assert.match(en, entry);
    assert.match(vi, entry);
  }
});

test('group detail tabs render after the metrics and before the charts', () => {
  assert.match(groupDetail, /afterMetrics=\{\(\s*<Card[^>]*className="gd-tabs"/);
  const metrics = report.indexOf('className={`report-metrics');
  const slot = report.indexOf('{afterMetrics}');
  const charts = report.indexOf('className="report-charts-row"');
  assert.ok(metrics !== -1 && metrics < slot && slot < charts);
});
