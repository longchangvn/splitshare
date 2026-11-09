// Remembered split (web/src/splitMemory.js, specs/007).
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SPLIT_MEMORY_PREFIX, parseSplit, restoreSplit, snapshotSplit, splitMemoryKey,
} from '../src/splitMemory.js';

const members = [
  { user_id: 'a', display_name: 'An' },
  { user_id: 'b', display_name: 'Bao' },
  { user_id: 'c', display_name: 'Chi' },
];
const draft = {
  splitType: 'PERCENT', participantIds: ['a', 'b'], values: { a: '60', b: '40', c: '99' },
  payerId: 'b', category: 'stay', title: 'x', amount: '10',
};

test('key is per user and group', () => {
  assert.equal(splitMemoryKey('u1', 'g1'), `${SPLIT_MEMORY_PREFIX}u1:g1`);
  assert.notEqual(splitMemoryKey('u1', 'g1'), splitMemoryKey('u2', 'g1'));
  assert.notEqual(splitMemoryKey('u1', 'g1'), splitMemoryKey('u1', 'g2'));
});

test('snapshot keeps method, members, percent/shares values, payer, category only', () => {
  assert.deepEqual(snapshotSplit(draft), {
    splitType: 'PERCENT', participantIds: ['a', 'b'], values: { a: '60', b: '40' }, payerId: 'b', category: 'stay',
  });
  const exact = snapshotSplit({ ...draft, splitType: 'EXACT', values: { a: '5', b: '5' } });
  assert.deepEqual(exact.values, {});
  assert.equal(exact.splitType, 'EXACT');
});

test('round trip through JSON restores the same split', () => {
  const back = restoreSplit(JSON.stringify(snapshotSplit(draft)), { members, meId: 'a' });
  assert.deepEqual(back, { splitType: 'PERCENT', participantIds: ['a', 'b'], values: { a: '60', b: '40' }, payerId: 'b', category: 'stay' });
});

test('member who left: dropped, percents re-split equally; payer who left → me', () => {
  const saved = { ...snapshotSplit({ ...draft, participantIds: ['a', 'b', 'gone'], values: { a: '50', b: '30', gone: '20' } }), payerId: 'gone' };
  const r = restoreSplit(saved, { members, meId: 'c' });
  assert.deepEqual(r.participantIds, ['a', 'b']);
  assert.deepEqual(r.values, { a: '50', b: '50' });
  assert.equal(r.payerId, 'c');
  const none = restoreSplit({ ...saved, participantIds: ['gone'] }, { members, meId: 'c' });
  assert.deepEqual(none.participantIds, ['a', 'b', 'c']);
});

test('shares keep whole numbers ≥ 1, else 1', () => {
  const r = restoreSplit({ splitType: 'SHARES', participantIds: ['a', 'b'], values: { a: '3', b: '0' } }, { members });
  assert.deepEqual(r.values, { a: '3', b: '1' });
});

test('EXACT: form keeps the method with empty boxes; scan card starts EQUAL', () => {
  const saved = { splitType: 'EXACT', participantIds: ['a', 'b'], values: {}, payerId: 'a', category: '' };
  assert.equal(restoreSplit(saved, { members }).splitType, 'EXACT');
  assert.deepEqual(restoreSplit(saved, { members }).values, {});
  assert.equal(restoreSplit(saved, { members, context: 'scan' }).splitType, 'EQUAL');
});

test('corrupt or unknown data is ignored', () => {
  assert.equal(restoreSplit('{not json', { members }), null);
  assert.equal(restoreSplit(null, { members }), null);
  assert.equal(restoreSplit({ splitType: 'WEIRD' }, { members }), null);
  assert.equal(restoreSplit({ splitType: 'EQUAL' }, { members: [] }), null);
  assert.equal(parseSplit('[1,2]'), null);
  const r = restoreSplit({ splitType: 'EQUAL', participantIds: 'a' }, { members, meId: 'a' });
  assert.deepEqual(r.participantIds, ['a', 'b', 'c']);
});
