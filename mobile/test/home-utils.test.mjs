import assert from 'node:assert/strict';
import test from 'node:test';
import {
  activityPageTokens, boxContacts, groupNeedsSettlement, kindKey, mergeActivity, nameOk,
  pageSlice, parseEmails, recentGroups, settleStats, asList,
} from '../src/components/home/homeUtils.js';

test('groupNeedsSettlement prefers needs_settlement, falls back to oldest_unsettled_at', () => {
  assert.equal(groupNeedsSettlement({ needs_settlement: false, oldest_unsettled_at: 'x' }), false);
  assert.equal(groupNeedsSettlement({ needs_settlement: true }), true);
  assert.equal(groupNeedsSettlement({ oldest_unsettled_at: '2024-01-01' }), true);
  assert.equal(groupNeedsSettlement({}), false);
});

test('settleStats counts settled/open groups and the settled percentage', () => {
  assert.deepEqual(settleStats([]), { total: 0, settled: 0, open: 0, pct: 0 });
  const s = settleStats([{ needs_settlement: true }, {}, {}]);
  assert.deepEqual(s, { total: 3, settled: 2, open: 1, pct: 67 });
});

test('recentGroups sorts newest first and caps the list', () => {
  const g = [{ group_id: 'a', created_at: '2024-01-01' }, { group_id: 'b', created_at: '2024-03-01' }, { group_id: 'c', created_at: '2024-02-01' }];
  assert.deepEqual(recentGroups(g, 2).map((x) => x.group_id), ['b', 'c']);
});

test('mergeActivity flattens per-group lists newest first', () => {
  const out = mergeActivity([[{ at: '2024-01-01', id: 1 }], [{ at: '2024-05-01', id: 2 }, { at: '2024-02-01', id: 3 }]]);
  assert.deepEqual(out.map((x) => x.id), [2, 3, 1]);
});

test('pageSlice clamps the page and reports the range', () => {
  const items = Array.from({ length: 23 }, (_, i) => i);
  const p = pageSlice(items, 3, 10);
  assert.equal(p.totalPages, 3);
  assert.deepEqual([p.from, p.to], [21, 23]);
  assert.deepEqual(p.items, [20, 21, 22]);
  assert.equal(pageSlice(items, 9, 10).page, 3);
  assert.deepEqual(pageSlice([], 1, 10), { total: 0, totalPages: 1, page: 1, from: 0, to: 0, items: [] });
});

test('activityPageTokens matches the web pager', () => {
  assert.deepEqual(activityPageTokens(1, 1), [1]);
  assert.deepEqual(activityPageTokens(2, 5), [1, 2, 3, 4, 5]);
  assert.deepEqual(activityPageTokens(5, 10), [1, '…', 4, 5, 6, '…', 10]);
  assert.deepEqual(activityPageTokens(1, 10), [1, 2, 3, 4, '…', 10]);
});

test('kindKey normalises unknown kinds to other', () => {
  assert.equal(kindKey('EXPENSE'), 'expense');
  assert.equal(kindKey('weird'), 'other');
  assert.equal(kindKey(null), 'other');
});

test('wizard helpers: emails, name rule, contacts box', () => {
  assert.deepEqual(parseEmails(' a@x.com, b@y.com;c@z\nd@w '), ['a@x.com', 'b@y.com', 'c@z', 'd@w']);
  assert.equal(nameOk('ab'), false);
  assert.equal(nameOk('  abc  '), true);
  assert.equal(nameOk('x'.repeat(51)), false);
  const box = boxContacts([{ user_id: 'p' }, { user_id: 'c1' }], [{ user_id: 'c1' }, { user_id: 'c2' }]);
  assert.deepEqual(box.map((x) => x.user_id), ['p', 'c1', 'c2']);
});

test('asList tolerates arrays and wrapped lists', () => {
  assert.deepEqual(asList([1]), [1]);
  assert.deepEqual(asList({ items: [2] }, 'items'), [2]);
  assert.deepEqual(asList(null, 'items'), []);
});
