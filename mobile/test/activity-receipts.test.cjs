// node --test mobile/test/activity-receipts.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');

let receipts; let activity; let quickAdd; let breakdown;
test('load modules', async () => {
  receipts = await import('../src/lib/receipts.js');
  activity = await import('../src/lib/activity.js');
  quickAdd = await import('../src/lib/quickAdd.js');
  breakdown = await import('../src/lib/breakdown.js');
  assert.ok(receipts.newCard && activity.mergeGroupActivity);
});

const group = { currency: 'USD', categories: [{ key: 'food' }, { key: 'transport' }] };
const asset = { uri: 'file:///a.jpg', fileName: 'IMG_0042.jpg', fileSize: 1000, mimeType: 'image/jpeg' };

test('newCard starts scanning with its own idempotency key', () => {
  const card = receipts.newCard(asset, new Date('2026-10-25T10:00:00Z'));
  assert.equal(card.status, 'scanning');
  assert.equal(card.amount, '');
  assert.equal(card.spentAt, '2026-10-25');
  assert.match(card.key, /\S+/);
  assert.notEqual(receipts.newCard(asset).key, card.key);
});

test('suggestions fill amount/title/category; mismatch keeps FX blank', () => {
  const card = receipts.newCard(asset);
  const filled = receipts.cardFromSuggestion(card, {
    receipt: {
      merchant: 'Cafe', total: 18.5, date: '2026-10-20', category: 'food',
      confidence: { total: 'high' }, tax: 1.5,
    },
  }, group);
  assert.equal(filled.status, 'ready');
  assert.equal(filled.amount, '18.50');
  assert.equal(filled.title, 'Cafe');
  assert.equal(filled.category, 'food');
  assert.equal(filled.spentAt, '2026-10-20');
  assert.equal(filled.tax, '1.50');
  assert.equal(filled.lowConfidence, false);

  const foreign = receipts.cardFromSuggestion(receipts.newCard(asset), {
    receipt: { merchant: 'Pho', total: 250000, currency: 'VND', date: '2026-10-20' },
  }, group);
  assert.equal(foreign.amount, '');
  assert.equal(foreign.origCurrency, 'VND');
  assert.equal(foreign.origAmount, '250000.00');
  assert.equal(foreign.receiptCurrency, 'VND');
  assert.equal(foreign.status, 'ready');

  const noTotal = receipts.cardFromSuggestion(receipts.newCard(asset), { receipt: { merchant: 'X' } }, group);
  assert.equal(noTotal.status, 'manual');
  assert.equal(noTotal.lowConfidence, true);
  assert.equal(noTotal.title, 'X');
});

test('unknown category from the scan is dropped', () => {
  const card = receipts.cardFromSuggestion(receipts.newCard(asset), { receipt: { total: 5, category: 'pets' } }, group);
  assert.equal(card.category, '');
});

test('one photo, several receipts → one card each, distinct keys', () => {
  const card = receipts.newCard(asset);
  const cards = receipts.cardsFromSuggestion(card, {
    receipts: [{ total: 10, merchant: 'A' }, { total: 20, merchant: 'B' }],
  }, group);
  assert.equal(cards.length, 2);
  assert.equal(cards[0].id, card.id); // first card keeps the picked photo's identity
  assert.notEqual(cards[1].key, cards[0].key);
  assert.deepEqual(cards.map((c) => c.amount), ['10.00', '20.00']);
});

test('cardAmount applies the FX rate and rejects bad rates', () => {
  assert.equal(receipts.cardAmount({ amount: '12.50' }), '12.50');
  assert.equal(receipts.cardAmount({ origCurrency: 'EUR', origAmount: '10', fxRate: '1.1' }), '11.00');
  assert.equal(receipts.cardAmount({ origCurrency: 'EUR', origAmount: '10', fxRate: '0' }), null);
  assert.equal(receipts.cardAmount({ amount: '0' }), null);
  assert.equal(receipts.cardAmount({ amount: '2000000' }), null);
});

test('validateCard reports every blocking field', () => {
  const members = [{ user_id: 'a' }, { user_id: 'b' }];
  const card = {
    ...receipts.newCard(asset), title: 'Cafe', amount: '10.00', spentAt: '2026-10-20',
    payerId: 'a', participantIds: ['a', 'b'],
  };
  assert.equal(receipts.validateCard(card, members).ok, true);
  assert.deepEqual(receipts.validateCard({ ...card, title: '' }, members).errors, ['title']);
  assert.deepEqual(receipts.validateCard({ ...card, amount: '' }, members).errors, ['amount']);
  assert.deepEqual(receipts.validateCard({ ...card, payerId: 'zzz' }, members).errors, ['payer']);
  assert.deepEqual(receipts.validateCard({ ...card, participantIds: [] }, members).errors, ['participants']);
  assert.deepEqual(receipts.validateCard({ ...card, spentAt: '2999-01-01' }, members).errors, ['date']);
});

test('duplicate detection uses amount + day and ignores payments', () => {
  const card = { ...receipts.newCard(asset), amount: '18.50', spentAt: '2026-10-20' };
  const other = { ...receipts.newCard(asset), amount: '9.00', spentAt: '2026-10-20' };
  const hits = receipts.findDuplicates([card, other], [
    { amount_cents: 1850, created_at: '2026-10-20T18:00:00Z' },
    { kind: 'payment', amount_cents: 900, created_at: '2026-10-20T18:00:00Z' },
  ]);
  assert.deepEqual(hits, [card.id]);
});

test('expense payload for a card is EQUAL with noon-UTC spent_at', () => {
  const card = {
    ...receipts.newCard(asset), title: 'Cafe', amount: '18.50', spentAt: '2026-10-20',
    payerId: 'a', participantIds: ['a', 'b'], category: 'food', tax: '1.50', tip: '0',
  };
  const body = receipts.buildExpensePayload(card, [{ user_id: 'a' }, { user_id: 'b' }]);
  assert.equal(body.split_type, 'EQUAL');
  assert.equal(body.amount, 18.5);
  assert.equal(body.spent_at, '2026-10-20T12:00:00.000Z');
  assert.equal(body.tax, 1.5);
  assert.equal('tip' in body, false); // zero tip is omitted
  assert.equal(body.only_present, false);
});

test('runPool keeps order and caps concurrency at three', async () => {
  let inFlight = 0;
  let peak = 0;
  const out = await receipts.runPool([1, 2, 3, 4, 5, 6], 3, async (n) => {
    inFlight += 1; peak = Math.max(peak, inFlight);
    await new Promise((r) => setTimeout(r, 5));
    inFlight -= 1;
    if (n === 4) throw new Error('boom');
    return n * 2;
  });
  assert.deepEqual(out.map((r) => r.status), ['fulfilled', 'fulfilled', 'fulfilled', 'rejected', 'fulfilled', 'fulfilled']);
  assert.deepEqual(out.filter((r) => r.value).map((r) => r.value), [2, 4, 6, 10, 12]);
  assert.ok(peak <= 3, `peak ${peak}`);
});

test('assetsToCards enforces 10 receipts, 10 MB and image mime', () => {
  const existing = [];
  const ok = receipts.assetsToCards([asset, asset], existing);
  assert.equal(ok.cards.length, 2);
  assert.equal(receipts.assetsToCards([asset], new Array(10).fill(asset)).rejected[0].reason, 'limit');
  assert.equal(receipts.assetsToCards([{ ...asset, fileSize: 11 * 1024 * 1024 }], []).rejected[0].reason, 'tooBig');
  assert.equal(receipts.assetsToCards([{ ...asset, mimeType: 'text/plain' }], []).rejected[0].reason, 'notImage');
  assert.equal(receipts.remainingSlots(new Array(7).fill(asset)), 3);
});

test('activity merges payments + updates newest first, skipping payment updates', () => {
  const rows = activity.mergeGroupActivity(
    [{ id: 'p1', created_at: '2026-10-20T10:00:00Z', amount_cents: 500 }],
    [
      { kind: 'expense', at: '2026-10-21T10:00:00Z', text: 'Ann added “Cafe”' },
      { kind: 'payment', at: '2026-10-20T10:00:00Z', text: 'dup' },
    ],
  );
  assert.deepEqual(rows.map((r) => r.kind), ['expense', 'payment']);
  assert.equal(rows[0].key, 'act-expense-2026-10-21T10:00:00Z-0');
  assert.equal(rows[1].key, 'pay-p1');
});

test('activity paging is 10 per page and clamps out-of-range pages', () => {
  const rows = new Array(25).fill(0).map((_, i) => ({ at: `2026-10-${String(i + 1).padStart(2, '0')}T00:00:00Z` }));
  assert.equal(activity.pageCount(rows.length), 3);
  assert.equal(activity.pageSlice(rows, 1).rows.length, 10);
  assert.equal(activity.pageSlice(rows, 9).page, 3);
  assert.equal(activity.pageSlice(rows, 9).rows.length, 5);
  assert.equal(activity.pageSlice([], 1).rows.length, 0);
});

test('global activity query + cursor', () => {
  assert.equal(activity.buildGlobalActivityQuery(), '/api/v1/me/activity?limit=20');
  assert.equal(
    activity.buildGlobalActivityQuery({ limit: 999, before: '2026-10-20T10:00:00Z', groupId: 'g1' }),
    '/api/v1/me/activity?limit=200&before=2026-10-20T10%3A00%3A00Z&group_id=g1',
  );
  assert.equal(activity.nextCursor([{ at: '2026-10-21T00:00:00Z' }, { at: '2026-10-19T00:00:00Z' }]), '2026-10-19T00:00:00Z');
  assert.equal(activity.nextCursor([]), null);
});

test('fan-out fallback merges groups and tags the source group', () => {
  const rows = activity.fanOutGlobalActivity([
    { group_id: 'g1', group_name: 'Trip', rows: [{ kind: 'expense', at: '2026-10-20T00:00:00Z' }] },
    { group_id: 'g2', group_name: 'Flat', rows: [{ kind: 'join', at: '2026-10-22T00:00:00Z' }] },
  ]);
  assert.deepEqual(rows.map((r) => r.group_name), ['Flat', 'Trip']);
  assert.equal(activity.hasGlobalActivity({ features: { activity_feed: true } }), true);
  assert.equal(activity.hasGlobalActivity({}), false);
  assert.equal(activity.hasPushDevices({ features: { push_devices: true } }), true);
});

test('quick add resolves the three web flows', () => {
  assert.equal(quickAdd.resolveQuickAddFlow(2, 'g1'), 'people-and-group');
  assert.equal(quickAdd.resolveQuickAddFlow(0, 'g1'), 'group');
  assert.equal(quickAdd.resolveQuickAddFlow(2, ''), 'people');
  assert.equal(quickAdd.resolveQuickAddFlow(0, ''), null);

  const merged = quickAdd.mergeMembers(
    [{ user_id: 'b', display_name: 'Bob' }, { user_id: 'me', display_name: 'Me' }],
    [{ user_id: 'b', display_name: 'Bobby' }, { user_id: 'c', display_name: 'Cara' }],
    'me',
  );
  assert.deepEqual(merged.map((m) => m.user_id), ['b', 'c']);
  assert.equal(merged[0].display_name, 'Bob'); // first occurrence wins

  assert.equal(quickAdd.defaultGroupName([{ display_name: 'Ann' }]), 'You, Ann');
  assert.equal(quickAdd.defaultGroupName([]), 'You');
  const long = quickAdd.defaultGroupName(
    new Array(10).fill(0).map((_, i) => ({ display_name: `Person${i}` })),
  );
  assert.ok(long.length <= 50);
  assert.match(long, /\+/);
});

test('breakdown sections are per group and per currency', () => {
  const b = breakdown.buildBreakdown([
    {
      group_id: 'g1', name: 'Trip', currency: 'USD',
      owes: [{ to_user_id: 'a', to_name: 'Ann', amount_cents: 500 }, { to_user_id: 'b', to_name: 'Bob', amount_cents: 900 }],
      owed_to_me: [],
    },
    { group_id: 'g2', name: 'Flat', currency: 'EUR', owes: [], owed_to_me: [{ from_user_id: 'c', from_name: 'Cara', amount_cents: 300 }] },
    { group_id: 'g3', name: 'Empty', currency: 'USD', owes: [], owed_to_me: [] },
  ]);
  assert.equal(b.owe.length, 1);
  assert.equal(b.owe[0].total_cents, 1400);
  assert.deepEqual(b.owe[0].people.map((p) => p.name), ['Bob', 'Ann']); // biggest first
  assert.equal(b.owed.length, 1);
  assert.equal(b.owed[0].currency, 'EUR');
});
