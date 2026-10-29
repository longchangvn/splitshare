// node --test mobile/test/*.test.cjs — pure money rules (no RN imports).
const test = require('node:test');
const assert = require('node:assert/strict');

let money;
test('load money module', async () => {
  money = await import('../src/lib/money.js');
  assert.ok(money.fmt);
});

test('fmt matches web: symbol + grouping + 2dp', () => {
  const { fmt } = money;
  assert.equal(fmt(178932, 'USD'), '$1,789.32');
  assert.equal(fmt(0, 'USD'), '$0.00');
  assert.equal(fmt(123456, 'EUR'), '€1,234.56');
  assert.equal(fmt(100, 'GBP'), '£1.00');
  assert.equal(fmt(2500000, 'VND'), '₫25,000.00');
  assert.equal(fmt(1299, 'SEK'), 'SEK 12.99');
  assert.equal(fmt(-500, 'USD'), '$-5.00'); // web never renders a leading minus
  assert.equal(fmt(1234, 'usd'), '$12.34'); // currency code is case-insensitive
});

test('signPrefix composes with fmt', () => {
  const { fmt, signPrefix } = money;
  assert.equal(`${signPrefix(-500)}${fmt(Math.abs(-500), 'USD')}`, '-$5.00');
  assert.equal(`${signPrefix(500)}${fmt(500, 'USD')}`, '+$5.00');
  assert.equal(`${signPrefix(0)}${fmt(0, 'USD')}`, '$0.00');
});

test('toneForNet', () => {
  assert.equal(money.toneForNet(-1), 'owe');
  assert.equal(money.toneForNet(0), 'settled');
  assert.equal(money.toneForNet(1), 'owed');
});

test('parseMoneyInput accepts 2dp up to 1,000,000 and rejects the rest', () => {
  const { parseMoneyInput } = money;
  assert.equal(parseMoneyInput('12.5'), 1250);
  assert.equal(parseMoneyInput('12.50'), 1250);
  assert.equal(parseMoneyInput(' 0.01 '), 1);
  assert.equal(parseMoneyInput('1000000'), 100000000);
  assert.equal(parseMoneyInput('1000000.01'), null); // over the cap
  assert.equal(parseMoneyInput('0'), null);
  assert.equal(parseMoneyInput('0.00'), null);
  assert.equal(parseMoneyInput('1.234'), null); // 3 decimals
  assert.equal(parseMoneyInput('abc'), null);
  assert.equal(parseMoneyInput(''), null);
  assert.equal(parseMoneyInput('-5'), null);
  assert.equal(parseMoneyInput('1e5'), null);
});

test('moneyFieldError reasons', () => {
  const { moneyFieldError } = money;
  assert.equal(moneyFieldError(''), 'required');
  assert.equal(moneyFieldError('1.234'), 'format');
  assert.equal(moneyFieldError('0'), 'positive');
  assert.equal(moneyFieldError('2000000'), 'max');
  assert.equal(moneyFieldError('12.50'), null);
});

test('perCurrencyTotals never sums across currencies', () => {
  const groups = [
    { currency: 'USD', net_cents: -500 },
    { currency: 'USD', net_cents: 200 },
    { currency: 'EUR', net_cents: 900 },
    { currency: 'SEK', net_cents: -100 },
  ];
  const totals = money.perCurrencyTotals(groups);
  assert.deepEqual(totals.map((t) => t.currency), ['EUR', 'USD', 'SEK']);
  const usd = totals.find((t) => t.currency === 'USD');
  assert.equal(usd.net_cents, -300);
  assert.equal(usd.group_count, 2);
  // Nothing in the module returns a single cross-currency figure.
  assert.equal(money.totalOweAllCurrencies, undefined);
});

test('buildBalance prefers the server block and keeps per-currency rows', () => {
  const groups = [
    { group_id: 'a', name: 'Trip', currency: 'USD', net_cents: -1000, my_transfers: [{ from_me: true, to_name: 'Ann', amount_cents: 1000 }] },
    { group_id: 'b', name: 'Flat', currency: 'USD', net_cents: 0 },
    { group_id: 'c', name: 'Alps', currency: 'EUR', net_cents: 250 },
  ];
  const b = money.buildBalance(groups);
  assert.equal(b.primaryCurrency, 'USD');
  assert.equal(b.primaryNetCents, -1000);
  assert.equal(b.direction, 'owe');
  assert.equal(b.currencyCount, 2);
  assert.equal(b.totalGroups, 3);
  assert.equal(b.settledCount, 1);
  assert.deepEqual(b.groups.map((g) => g.group_id), ['a', 'c']); // open only, biggest first
  assert.equal(b.groups[0].transfers[0].from_me, true);

  const served = money.buildBalance(groups, {
    primary_currency: 'EUR',
    by_currency: [{ currency: 'EUR', net_cents: 250, group_count: 1 }],
  });
  assert.equal(served.primaryCurrency, 'EUR');
  assert.equal(served.primaryNetCents, 250);
  assert.equal(served.direction, 'owed');
});

test('buildBalance with no groups is settled, not zero-summed', () => {
  const b = money.buildBalance([]);
  assert.equal(b.primaryCurrency, null);
  assert.equal(b.primaryNetCents, 0);
  assert.equal(b.direction, 'settled');
  assert.equal(b.primaryGroupCount, 0);
});

test('currencyNet only counts one currency', () => {
  const groups = [{ currency: 'USD', net_cents: 100 }, { currency: 'EUR', net_cents: 400 }];
  assert.equal(money.currencyNet(groups, 'usd'), 100);
  assert.equal(money.currencyNet(groups, 'EUR'), 400);
});

test('percentOf clamps', () => {
  assert.equal(money.percentOf(50, 200), 25);
  assert.equal(money.percentOf(500, 200), 100);
  assert.equal(money.percentOf(-5, 200), 0);
  assert.equal(money.percentOf(1, 0), 0);
});
