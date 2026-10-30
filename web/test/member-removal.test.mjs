import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LEGACY_PREVIEW, fetchRemovalPreview, isStaleRemoval, removalPath, removalPreviewPath, removalSummary,
} from '../src/memberRemoval.js';

test('only STALE_LEDGER counts as a stale removal', () => {
  assert.equal(isStaleRemoval({ code: 'STALE_LEDGER' }), true);
  assert.equal(isStaleRemoval({ code: 'HAS_OPEN_BALANCE' }), false);
  assert.equal(isStaleRemoval(null), false);
});

const names = { a: 'Ann', b: 'Bob', c: 'Cat' };
const nameOf = (id) => names[id] || '?';

test('paths carry the resplit strategy and the preview hash', () => {
  assert.equal(removalPreviewPath('g1', 'u1'), '/api/v1/groups/g1/members/u1/removal-preview');
  assert.equal(removalPath('g1', 'u1', { inputs_hash: 'AB+/' }), '/api/v1/groups/g1/members/u1?strategy=resplit&expected_hash=AB%2B%2F');
  assert.equal(removalPath('g1', 'u1', {}), '/api/v1/groups/g1/members/u1?strategy=resplit');
  assert.equal(removalPath('g1', 'u1', LEGACY_PREVIEW), '/api/v1/groups/g1/members/u1');
});

test('older API without the preview route falls back to plain removal', async () => {
  const missing = Object.assign(new Error('HTTP 404'), { status: 404 });
  assert.equal(await fetchRemovalPreview(async () => { throw missing; }, 'g', 'u'), LEGACY_PREVIEW);
  assert.equal(removalSummary(LEGACY_PREVIEW).mode, 'legacy');
  const notMember = Object.assign(new Error('Not a group member.'), { status: 404, code: 'NOT_FOUND' });
  await assert.rejects(fetchRemovalPreview(async () => { throw notMember; }, 'g', 'u'), notMember);
  const body = { can_remove: true, expenses: [] };
  let asked;
  assert.equal(await fetchRemovalPreview(async (p) => { asked = p; return body; }, 'g', 'u'), body);
  assert.equal(asked, '/api/v1/groups/g/members/u/removal-preview');
});

test('loading, settled and blocked modes', () => {
  assert.equal(removalSummary(null).mode, 'loading');
  assert.equal(removalSummary({ can_remove: true, expenses: [] }).mode, 'settled');
  const blocked = removalSummary({ can_remove: false, blockers: ['Paid open expense "Taxi"'], expenses: [] });
  assert.equal(blocked.mode, 'blocked');
  assert.deepEqual(blocked.blockers, ['Paid open expense "Taxi"']);
});

test('resplit rows list remaining participants by name with before/after cents', () => {
  const s = removalSummary({
    can_remove: true,
    expenses: [
      { expense_id: 'e1', title: 'Dinner', split_type: 'percent', amount_cents: 6000, from: { c: 1500, a: 1500, x: 3000 }, to: { c: 3000, a: 3000 } },
      { expense_id: 'e2', title: 'Taxi', split_type: 'exact', amount_cents: 5000, from: { b: 1000, x: 4000 }, to: { b: 5000 } },
    ],
  }, nameOf);
  assert.equal(s.mode, 'resplit');
  assert.equal(s.expenses[0].method, 'percent');
  assert.deepEqual(s.expenses[0].rows.map((r) => [r.name, r.fromCents, r.toCents]), [['Ann', 1500, 3000], ['Cat', 1500, 3000]]);
  assert.deepEqual(s.expenses[1].rows, [{ userId: 'b', name: 'Bob', fromCents: 1000, toCents: 5000 }]);
});
